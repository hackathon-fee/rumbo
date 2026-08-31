import * as api from "./api.js";
import { parseQuery } from "./parse.js";
import {
  DEFAULTS,
  FIELDS,
  FIELD_LABELS,
  CREDENTIAL_LABELS,
  MODALITY_LABELS,
  CONFIDENCE_LABELS,
  rank,
  score,
  cashFlowCurve,
  money,
  pct,
  duration,
  payback,
} from "./roi.js";

const view = document.getElementById("view");

const BLANK_FILTERS = {
  field: null,
  maxMonths: null,
  modality: null,
  credentials: null,
};

const state = {
  assumptions: { ...DEFAULTS, ...BLANK_FILTERS },
  rows: [], // raw rows from Postgres, already filtered by free text
  scored: [],
  understood: [],
  query: "",
  notice: null, // set when we widened the search on the learner's behalf
  textTerms: null, // free-text terms that actually narrowed the list
  stats: null,
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const enNumber = new Intl.NumberFormat("en-US");

function saveState() {
  try {
    sessionStorage.setItem(
      "rumbo",
      JSON.stringify({
        assumptions: state.assumptions,
        query: state.query,
        understood: state.understood,
      })
    );
  } catch (_) {}
}

function restoreState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("rumbo") || "null");
    if (saved && saved.assumptions) {
      state.assumptions = { ...state.assumptions, ...saved.assumptions };
      state.query = saved.query || "";
      state.understood = saved.understood || [];
    }
  } catch (_) {}
}

/* ----------------------------- free-text search --------------------------- */

// Words that carry no search signal in either language.
const STOP = new Set([
  "the", "and", "but", "for", "with", "want", "wanna", "need", "study",
  "studying", "learn", "learning", "have", "has", "live", "living", "about",
  "month", "months", "year", "years", "mxn", "peso", "pesos", "only", "just",
  "can", "pay", "paid", "pays", "make", "making", "earn", "earning", "job",
  "work", "working", "course", "courses", "school", "career", "something",
  "anything", "good", "best", "fast", "quick", "cheap", "than", "that", "this",
  "what", "where", "which", "would", "could", "should", "there", "here",
  "quiero", "tengo", "gano", "para", "algo", "que", "una", "uno", "unos",
  "los", "las", "del", "por", "mes", "meses", "anos", "soy", "vivo", "con",
  "pero", "solo", "mas", "muy", "donde", "como", "cual", "estudiar",
  "aprender", "trabajo", "trabajar", "sueldo", "salario", "carrera", "curso",
  "escuela", "barato", "rapido", "mejor", "puedo", "quisiera", "seria",
]);

const fold = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Narrow rows by any remaining meaningful words in the query, matched against
 * program name, provider name and field.
 *
 * The critical rule: only apply the filter when it matches something. A learner
 * typing "I live in Iztapalapa" must never get an empty page because no program
 * is called Iztapalapa. Search that can blank itself is worse than no search.
 */
function applyTextFilter(rows, query) {
  const tokens = fold(query).match(/[a-z][a-z0-9+#.]{2,}/g) || [];
  const terms = [...new Set(tokens.filter((t) => !STOP.has(t)))];
  if (!terms.length) return { rows, terms: null };

  const hits = rows.filter((row) => {
    const hay = `${fold(row.program_name)} ${fold(row.provider_name)} ${fold(
      row.field
    )} ${fold(row.credential)}`;
    return terms.some((t) => hay.includes(t));
  });

  if (hits.length && hits.length < rows.length) {
    const matched = terms.filter((t) =>
      hits.some((row) =>
        `${fold(row.program_name)} ${fold(row.provider_name)}`.includes(t)
      )
    );
    return { rows: hits, terms: matched.length ? matched : null };
  }
  return { rows, terms: null };
}

/* ------------------------------ data loading ----------------------------- */

/**
 * Fetch and rank. Never resolves to an empty list while the catalog still has
 * something to say: if the filters are too tight we relax them, and we tell the
 * learner exactly what we relaxed.
 */
async function loadRanking() {
  state.notice = null;
  state.textTerms = null;

  let raw = await api.rankPaths({ ...state.assumptions, limit: 80 });

  // Too tight: drop the length cap first, it is the most arbitrary filter.
  if (!raw.length && state.assumptions.maxMonths) {
    raw = await api.rankPaths({ ...state.assumptions, maxMonths: null, limit: 80 });
    if (raw.length) {
      state.assumptions.maxMonths = null;
      state.notice =
        "Nothing that short exists in this field yet, so the length limit was removed.";
    }
  }

  // Still nothing: widen the field.
  if (!raw.length && state.assumptions.field) {
    const widened = await api.rankPaths({
      ...state.assumptions,
      field: null,
      maxMonths: null,
      limit: 80,
    });
    if (widened.length) {
      const was = FIELD_LABELS[state.assumptions.field] || state.assumptions.field;
      state.assumptions.field = null;
      state.assumptions.maxMonths = null;
      raw = widened;
      state.notice = `No path in ${was} matched, so every field is shown instead.`;
    }
  }

  // Last resort: drop the credential exclusion.
  if (!raw.length && state.assumptions.credentials) {
    const widened = await api.rankPaths({
      ...state.assumptions,
      credentials: null,
      limit: 80,
    });
    if (widened.length) {
      state.assumptions.credentials = null;
      raw = widened;
      state.notice = "Only university degrees matched, so those are shown too.";
    }
  }

  const filtered = applyTextFilter(raw, state.query);
  state.rows = filtered.rows;
  state.textTerms = filtered.terms;
  state.scored = rank(state.rows, state.assumptions);
  return state.scored;
}

async function ensureRanking() {
  if (!state.scored.length) await loadRanking();
  return state.scored;
}

async function runQuery(text) {
  state.query = text;
  const { assumptions, understood } = parseQuery(text, DEFAULTS);
  state.assumptions = assumptions;
  state.understood = understood;
  const scored = await loadRanking();
  saveState();
  api.logSimulation(
    {
      goal_field: assumptions.field || "unspecified",
      raw_query: text,
      ...assumptions,
    },
    scored.length,
    scored[0] ? scored[0].program_id : null
  );
  return scored;
}

/* -------------------------------- fragments ------------------------------- */

function confidenceTag(row) {
  const key = row.data_confidence || "estimated";
  return `<span class="tag ${esc(key)}">${esc(CONFIDENCE_LABELS[key] || key)}</span>`;
}

function cardHtml(row, index) {
  const pb = payback(row);
  return `
<a class="card" href="#/route/${encodeURIComponent(row.program_slug)}">
  <div class="card-top">
    <div>
      <span class="rank">${String(index + 1).padStart(2, "0")}</span>
      <h3>${esc(row.program_name)}</h3>
      <div class="provider">${esc(row.provider_name)}</div>
    </div>
    <div class="payback">
      <div class="big ${pb.tone}">${esc(pb.text)}</div>
      <div class="lbl">to pay back</div>
    </div>
  </div>
  <div class="metrics">
    <div class="metric"><div class="v">${esc(money(row.totalCost))}</div><div class="k">True cost</div></div>
    <div class="metric"><div class="v">${esc(money(row.outOfPocket))}</div><div class="k">Cash you pay</div></div>
    <div class="metric"><div class="v">${esc(pct(row.successProb))}</div><div class="k">Finish and get hired</div></div>
    <div class="metric"><div class="v">+${esc(money(row.monthlyGain))}</div><div class="k">Expected raise per month</div></div>
    <div class="metric"><div class="v ${row.netHorizon >= 0 ? "good" : "bad"}">${esc(money(row.netHorizon))}</div><div class="k">Net over ${Math.round(row.horizonMonths / 12)} years</div></div>
  </div>
  <div class="tags">
    <span class="tag">${esc(CREDENTIAL_LABELS[row.credential] || row.credential)}</span>
    <span class="tag">${esc(duration(row.months))}</span>
    <span class="tag">${esc(MODALITY_LABELS[row.modality] || row.modality)}</span>
    ${confidenceTag(row)}
    ${row.fitsBudget ? "" : '<span class="tag over">Over your cash budget</span>'}
  </div>
</a>`;
}

function controlsHtml() {
  const a = state.assumptions;
  const options = (list, current) =>
    list
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}"${(current || "") === value ? " selected" : ""}>${esc(label)}</option>`
      )
      .join("");

  return `
<div class="controls">
  <div class="field">
    <label for="c-field">Field</label>
    <select id="c-field">${options(FIELDS, a.field)}</select>
  </div>
  <div class="field">
    <label for="c-salary">Your income now (MXN/mo)</label>
    <input id="c-salary" type="number" min="0" step="500" value="${esc(a.currentSalary)}" />
  </div>
  <div class="field">
    <label for="c-budget">Cash you can pay (MXN)</label>
    <input id="c-budget" type="number" min="0" step="1000" value="${esc(a.budget)}" />
  </div>
  <div class="field">
    <label for="c-modality">Modality</label>
    <select id="c-modality">${options(
      [["", "Any"], ["onsite", "On site"], ["hybrid", "Hybrid"], ["online", "Online"]],
      a.modality
    )}</select>
  </div>
  <div class="field">
    <label for="c-horizon">Horizon (years)</label>
    <input id="c-horizon" type="number" min="1" max="40" step="1" value="${Math.round(a.horizonMonths / 12)}" />
  </div>
</div>`;
}

function wireControls(onChange) {
  const bind = (id, apply) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      apply(el.value);
      onChange();
    });
  };
  bind("c-field", (v) => { state.assumptions.field = v || null; });
  bind("c-salary", (v) => { state.assumptions.currentSalary = Number(v) || 0; });
  bind("c-budget", (v) => { state.assumptions.budget = Number(v) || 0; });
  bind("c-modality", (v) => { state.assumptions.modality = v || null; });
  bind("c-horizon", (v) => {
    state.assumptions.horizonMonths = Math.max(12, (Number(v) || 10) * 12);
  });
}

/* --------------------------------- chart --------------------------------- */

function chartSvg(row) {
  const points = cashFlowCurve(row);
  const W = 760, H = 250, L = 86, R = 16, T = 18, B = 34;
  const values = points.map((p) => p.value);
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);
  const span = maxY - minY || 1;
  const horizon = row.horizonMonths || 120;

  const X = (m) => L + (m / horizon) * (W - L - R);
  const Y = (v) => T + (1 - (v - minY) / span) * (H - T - B);

  const line = points.map((p) => `${X(p.month).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
  const zeroY = Y(0);
  const studyEnd = X(Math.min(row.months, horizon));

  const crossing = points.find((p) => p.month > row.months && p.value >= 0);
  const marker = crossing
    ? `<circle cx="${X(crossing.month).toFixed(1)}" cy="${zeroY.toFixed(1)}" r="4.5" fill="#14532d" />
       <text x="${(X(crossing.month) + 9).toFixed(1)}" y="${(zeroY - 12).toFixed(1)}" fill="#14532d" font-size="12" font-family="Georgia,serif">breaks even in month ${crossing.month}</text>`
    : `<text x="${(W / 2).toFixed(1)}" y="${(zeroY - 12).toFixed(1)}" fill="#8c1d18" font-size="12" text-anchor="middle" font-family="Georgia,serif">never breaks even in this window</text>`;

  return `
<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
     aria-label="Cumulative cash position over ${Math.round(horizon / 12)} years. Breaks even ${
       crossing ? `in month ${crossing.month}` : "never within this window"
     }.">
  <rect x="${L}" y="${T}" width="${(studyEnd - L).toFixed(1)}" height="${H - T - B}" fill="#f2efe8" />
  <text x="${(L + 7).toFixed(1)}" y="${T + 14}" fill="#9aa0a8" font-size="11">studying</text>
  <line x1="${L}" y1="${zeroY.toFixed(1)}" x2="${W - R}" y2="${zeroY.toFixed(1)}" stroke="#cdc7bb" stroke-width="1" />
  <polyline points="${line}" fill="none" stroke="#14532d" stroke-width="2" />
  ${marker}
  <text x="6" y="${(T + 10).toFixed(1)}" fill="#6a6f78" font-size="11">${esc(money(maxY))}</text>
  <text x="6" y="${(zeroY + 4).toFixed(1)}" fill="#16181d" font-size="11">0</text>
  <text x="6" y="${(H - B + 4).toFixed(1)}" fill="#8c1d18" font-size="11">${esc(money(minY))}</text>
  <text x="${L}" y="${H - 10}" fill="#9aa0a8" font-size="11">today</text>
  <text x="${(W - R).toFixed(1)}" y="${H - 10}" fill="#9aa0a8" font-size="11" text-anchor="end">${Math.round(horizon / 12)} years</text>
</svg>`;
}

/* --------------------------------- views --------------------------------- */

const EXAMPLES = [
  "I have $40,000 saved and I want to code",
  "I make 8,500 a month and I need something fast and online",
  "I want to be a nurse but I only have $15,000",
  "A skilled trade that pays back in under a year",
  "Something in data, no degree",
];

function searchFormHtml(id, value, label) {
  return `
<form class="ask" id="${id}">
  <input id="${id}-input" type="text" autocomplete="off" name="q"
    aria-label="Describe what you want to study"
    placeholder="Describe it in your own words \u2014 English or Spanish"
    value="${esc(value)}" />
  <button type="submit">${esc(label)}</button>
</form>`;
}

function wireSearchForm(id, onDone) {
  const form = document.getElementById(id);
  if (!form) return;
  const input = document.getElementById(`${id}-input`);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Working";
    try {
      await runQuery(input.value);
      onDone();
    } catch (err) {
      const box = document.getElementById("search-error") || document.getElementById("cards");
      if (box) box.innerHTML = `<div class="error">${esc(err.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  return input;
}

async function renderHome() {
  view.innerHTML = `
<section class="hero">
  <p class="eyebrow">Mexico City &middot; ${enNumber.format(48)} paths priced</p>
  <h1>What should you actually study?</h1>
  <p class="lede">
    Every school in Mexico advertises a price. None of them tell you the two
    numbers that decide your life: what it <em>truly</em> costs you, and when it
    pays you back.
  </p>
  ${searchFormHtml("ask", state.query, "Find my paths")}
  <div class="chips">
    ${EXAMPLES.map(
      (e) => `<button class="chip" type="button" data-example="${esc(e)}">${esc(e)}</button>`
    ).join("")}
  </div>
  <div id="search-error"></div>
  <div class="stats" id="stats"></div>
</section>

<div class="callout">
  <strong>Why this is missing.</strong> A market cannot allocate anything without
  prices. Mexican education publishes tuition but hides the cost that dominates
  every decision: the income you give up, multiplied by the real chance you
  finish and get hired. Roughly 3 in 10 university students in Mexico drop out in
  their first year, and the system does not price that risk. So families guess,
  and the guess is expensive.
</div>`;

  const input = wireSearchForm("ask", () => {
    location.hash = "#/routes";
  });

  document.querySelectorAll("[data-example]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (input) input.value = btn.dataset.example;
      document.getElementById("ask").requestSubmit();
    });
  });

  try {
    state.stats = state.stats || (await api.catalogStats());
    const s = state.stats;
    document.getElementById("stats").innerHTML = `
      <div class="stat"><div class="n">${enNumber.format(s.programs)}</div><div class="l">Paths priced</div></div>
      <div class="stat"><div class="n">${enNumber.format(s.providers)}</div><div class="l">Providers</div></div>
      <div class="stat"><div class="n">${enNumber.format(s.measured)}</div><div class="l">With measured outcomes</div></div>
      <div class="stat"><div class="n">$0</div><div class="l">Cost to learners, always</div></div>`;
  } catch (err) {
    document.getElementById("stats").innerHTML =
      `<div class="error">Could not reach the catalog: ${esc(err.message)}</div>`;
  }
}

async function renderRoutes() {
  view.innerHTML = `
<h1>Your paths, fastest payback first</h1>
<p class="lede">Ranked by how fast each one repays its true cost, not by tuition.</p>
${searchFormHtml("refine", state.query, "Search")}
<div id="search-error"></div>
${controlsHtml()}
<div id="understood"></div>
<div class="toolbar">
  <span class="count" id="count"></span>
  <button class="linkish" type="button" id="reset">Reset all filters</button>
</div>
<div class="cards" id="cards"><div class="loading">Scoring the catalog</div></div>`;

  const paint = () => {
    state.scored = rank(state.rows, state.assumptions);
    const cards = document.getElementById("cards");
    const count = document.getElementById("count");

    if (count) {
      const affordable = state.scored.filter((r) => r.fitsBudget).length;
      count.textContent = state.scored.length
        ? `${state.scored.length} paths \u00b7 ${affordable} within your ${money(
            state.assumptions.budget
          )} cash budget`
        : "";
    }

    const notes = [];
    if (state.understood.length) {
      notes.push(
        `Read as ${state.understood
          .map((u) => `${esc(u.key)}: <b>${esc(u.value)}</b>`)
          .join(" &middot; ")}.`
      );
    }
    if (state.textTerms && state.textTerms.length) {
      notes.push(
        `Matching on <b>${state.textTerms.map(esc).join(", ")}</b>.`
      );
    }
    if (state.notice) notes.push(esc(state.notice));

    const understood = document.getElementById("understood");
    if (understood) {
      understood.innerHTML = notes.length
        ? `<div class="parsed">${notes.join(" ")} Adjust anything above.</div>`
        : "";
    }

    cards.innerHTML = state.scored.length
      ? state.scored.map(cardHtml).join("")
      : `<div class="empty">
           <p>Nothing in the catalog matches those filters yet. The catalog covers
           Mexico City, so a very narrow field or a zero budget can come up empty.</p>
           <button class="linkish" type="button" id="reset2">Clear the filters and show everything</button>
         </div>`;

    const reset2 = document.getElementById("reset2");
    if (reset2) reset2.addEventListener("click", resetAll);
  };

  const reload = async () => {
    document.getElementById("cards").innerHTML = `<div class="loading">Re-scoring</div>`;
    try {
      await loadRanking();
      saveState();
      paint();
    } catch (err) {
      document.getElementById("cards").innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  };

  async function resetAll() {
    state.assumptions = { ...DEFAULTS, ...BLANK_FILTERS };
    state.query = "";
    state.understood = [];
    state.notice = null;
    state.textTerms = null;
    saveState();
    await renderRoutes();
  }

  wireSearchForm("refine", paint);
  wireControls(reload);
  document.getElementById("reset").addEventListener("click", resetAll);

  try {
    await ensureRanking();
    paint();
  } catch (err) {
    document.getElementById("cards").innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

async function renderRoute(slug) {
  view.innerHTML = `<div class="loading">Loading this path</div>`;
  try {
    const rows = await api.rankPaths({
      ...state.assumptions,
      field: null,
      maxMonths: null,
      modality: null,
      credentials: null,
      budget: 1e9,
      limit: 400,
    });
    const raw = rows.find((r) => r.program_slug === slug);
    if (!raw) {
      view.innerHTML = `<div class="error">That path is not in the catalog. <a href="#/routes">Back to the comparison</a>.</div>`;
      return;
    }
    const row = score(raw, state.assumptions);
    const pb = payback(row);
    const years = Math.round(row.horizonMonths / 12);

    view.innerHTML = `
<p class="muted"><a href="#/routes">&larr; All paths</a></p>
<h1>${esc(row.program_name)}</h1>
<p class="lede">
  ${esc(row.provider_name)} &middot; ${esc(CREDENTIAL_LABELS[row.credential] || row.credential)}
  &middot; ${esc(duration(row.months))} &middot; ${esc(row.hours_per_week)} hours a week
  &middot; ${esc(MODALITY_LABELS[row.modality] || row.modality)}
</p>

<div class="panel">
  <h3>Your money, month by month</h3>
  ${chartSvg(row)}
  <p class="chart-note">
    The line is your cumulative cash position: negative while you study and give
    up income, then climbing once the expected raise arrives. Where it crosses
    zero is your payback point &mdash; <strong class="${pb.tone}">${esc(pb.text)}</strong>.
  </p>
</div>

${controlsHtml()}

<div class="grid2">
  <div class="panel">
    <h3>What it truly costs</h3>
    <table class="breakdown">
      <tr><th>Tuition</th><td>${esc(money(row.tuition_mxn))}</td></tr>
      <tr><th>Books, supplies, transport</th><td>${esc(money(row.materials_mxn))}</td></tr>
      <tr><th>Income you give up</th><td>${esc(money(row.forgone))}</td></tr>
      <tr class="total"><th>True cost</th><td>${esc(money(row.totalCost))}</td></tr>
      <tr><th>Cash out of your pocket</th><td>${esc(money(row.outOfPocket))}</td></tr>
    </table>
    <p class="muted">
      Income given up = ${esc(row.months)} months &times;
      ${esc(money(row.currentSalary))} &times; study load &times; how much of that
      load collides with holding a job.
    </p>
  </div>

  <div class="panel">
    <h3>What it is likely to return</h3>
    <table class="breakdown">
      <tr><th>Median salary after</th><td>${esc(money(row.median_salary_mxn))}</td></tr>
      <tr><th>Chance you finish</th><td>${esc(pct(row.completion_rate))}</td></tr>
      <tr><th>Chance you are hired within 6 months</th><td>${esc(pct(row.employment_rate_6m))}</td></tr>
      <tr><th>Both together</th><td>${esc(pct(row.successProb))}</td></tr>
      <tr class="total"><th>Expected raise per month</th><td>+${esc(money(row.monthlyGain))}</td></tr>
      <tr><th>Net after ${years} years</th><td class="${row.netHorizon >= 0 ? "good" : "bad"}">${esc(money(row.netHorizon))}</td></tr>
    </table>
    <p class="muted">
      We never credit a program with a salary its students do not reach. The
      raise is discounted by completion &times; employment, on purpose.
    </p>
  </div>
</div>

<div class="panel">
  <h3>Where these numbers come from</h3>
  <p>
    ${confidenceTag(row)}
    ${esc(row.evidence_source || "Provider published data")}
    ${row.evidence_url ? ` &middot; <a href="${esc(row.evidence_url)}" rel="noopener nofollow" target="_blank">source</a>` : ""}
  </p>
  <p class="muted">
    <b>Verified</b> means we hold a citable published figure.
    <b>Self-reported</b> means the provider published it about itself.
    <b>Estimated</b> means we fell back to a sector baseline and labelled it as
    such rather than inventing a number.
  </p>
</div>

<div class="panel" id="financing"><h3>Ways to pay for it</h3><div class="loading">Loading</div></div>

<div class="panel">
  <h3>Ask this provider to contact you</h3>
  <p class="muted">
    Free for you, always. The provider pays for the introduction &mdash; that is
    how Rumbo makes money without ever charging a learner or selling a ranking.
  </p>
  <form class="lead" id="lead">
    <input name="contact_name" placeholder="Your name" required maxlength="120" />
    <input name="contact_email" type="email" placeholder="Your email" required maxlength="200" />
    <textarea name="message" rows="3" placeholder="Anything you want them to know (optional)" maxlength="1000"></textarea>
    <button type="submit">Send my request</button>
    <div class="form-msg" id="lead-msg"></div>
  </form>
</div>`;

    wireControls(() => renderRoute(slug));

    api.financingFor(row.program_id)
      .then((options) => {
        const box = document.getElementById("financing");
        if (!box) return;
        box.innerHTML = `<h3>Ways to pay for it</h3>` + (options.length
          ? `<table class="breakdown table-wide">
              <tr><th>Instrument</th><th>Type</th><th>Terms</th></tr>
              ${options.map((o) => `<tr>
                <th>${esc(o.name)}<br /><span class="muted">${esc(o.provider_name || "")}</span></th>
                <td>${esc(String(o.kind).replace(/_/g, " "))}</td>
                <td>${o.apr != null ? `${(Number(o.apr) * 100).toFixed(1)}% APR` : ""}
                    ${o.income_share_pct != null ? `${(Number(o.income_share_pct) * 100).toFixed(0)}% of income, capped at ${Number(o.cap_multiple)}x` : ""}
                    ${o.max_amount_mxn != null ? `<br /><span class="muted">up to ${esc(money(o.max_amount_mxn))}</span>` : ""}
                </td></tr>
                ${o.notes || o.terms_url ? `<tr><td colspan="3" class="muted">${esc(o.notes || "")}${o.terms_url ? ` <a href="${esc(o.terms_url)}" rel="noopener nofollow" target="_blank">terms</a>` : ""}</td></tr>` : ""}`).join("")}
             </table>`
          : `<p class="muted">No financing instrument is attached to this path yet. For low-cost short courses that is usually fine; for anything above ${esc(money(50000))} it is the single biggest gap in the Mexican market.</p>`);
      })
      .catch(() => {
        const box = document.getElementById("financing");
        if (box) box.innerHTML = `<h3>Ways to pay for it</h3><p class="muted">Financing options could not be loaded.</p>`;
      });

    document.getElementById("lead").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button");
      const msg = document.getElementById("lead-msg");
      button.disabled = true;
      msg.className = "form-msg";
      msg.textContent = "Sending\u2026";
      try {
        const data = new FormData(form);
        await api.createLead({
          program_id: row.program_id,
          contact_name: data.get("contact_name"),
          contact_email: data.get("contact_email"),
          message: data.get("message") || null,
        });
        form.reset();
        msg.className = "form-msg ok";
        msg.textContent = "Sent. The provider will reach out to you directly.";
      } catch (err) {
        msg.className = "form-msg err";
        msg.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    });
  } catch (err) {
    view.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

async function renderProviders() {
  view.innerHTML = `
<h1>For schools, bootcamps and training centres</h1>
<p class="lede">
  Rumbo is a demand signal you have never had access to: what learners in this
  city are actually looking for, before they enrol anywhere.
</p>

<div class="grid2">
  <div class="panel">
    <h3>What you get</h3>
    <ul>
      <li>A verified listing with your real outcomes, cited.</li>
      <li>Qualified introductions from learners who already understand your price.</li>
      <li>Aggregate demand by field, updated as people search.</li>
    </ul>
    <p class="muted">
      $990 a month for a verified listing, plus $80&ndash;150 per introduction.
      Typical customer acquisition cost in Mexican private education runs
      $1,500&ndash;5,000, so an introduction that converts is an order of
      magnitude cheaper.
    </p>
  </div>
  <div class="panel">
    <h3>What you cannot buy</h3>
    <p>
      Ranking position. Ever. The order is a pure function of true cost and
      measured outcomes. Publishing <em>verified</em> outcomes is the only way to
      move up, which is exactly the incentive the sector is missing.
    </p>
    <p class="muted">
      If your real numbers are good, this is the cheapest distribution you will
      ever get. If they are not, you now know before your students do.
    </p>
  </div>
</div>

<h2>Live demand</h2>
<div class="panel" id="demand"><div class="loading">Loading</div></div>`;

  try {
    const demand = await api.demandByField();
    const box = document.getElementById("demand");
    box.innerHTML = demand.length
      ? `<table class="breakdown">
           <tr><th>Field</th><th>Searches</th><th>Last search</th></tr>
           ${demand.map((d) => `<tr>
             <th>${esc(FIELD_LABELS[d.field] || String(d.field).replace(/_/g, " "))}</th>
             <td>${esc(enNumber.format(Number(d.searches) || 0))}</td>
             <td>${d.last_search ? esc(new Date(d.last_search).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })) : "\u2014"}</td>
           </tr>`).join("")}
         </table>
         <p class="muted">Counts only. Rumbo cannot read an individual learner's search, by database policy rather than by promise.</p>`
      : `<p class="muted">No searches logged yet. Run one on the search page and this table fills in immediately &mdash; it is live, not seeded.</p>`;
  } catch (err) {
    document.getElementById("demand").innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

function renderMethod() {
  view.innerHTML = `
<h1>How the number is built</h1>
<p class="lede">
  All of the economics live in Postgres, in one auditable function. The browser
  mirrors it so the controls feel instant, and the two must agree.
</p>

<div class="panel">
<pre class="mono" style="white-space:pre-wrap;margin:0">true_cost   = tuition + materials + (months \u00d7 current_income \u00d7 study_load \u00d7 opportunity_factor)
study_load         = min(1, hours_per_week / 45)
opportunity_factor = 0.30 online | 0.60 hybrid | 0.85 on site

success_prob  = completion_rate \u00d7 employment_rate_6m
monthly_gain  = max(median_salary \u2212 current_income, 0) \u00d7 success_prob

payback_months = true_cost / monthly_gain
net_horizon    = monthly_gain \u00d7 (horizon_months \u2212 months) \u2212 true_cost</pre>
</div>

<h2>The decisions that matter</h2>
<div class="grid2">
  <div class="panel">
    <h3>Forgone income is a real cost</h3>
    <p>A "free" public degree that takes four and a half years of full-time
    attendance costs a person earning $8,500 a month more than three hundred
    thousand pesos of income. Ignoring that is the single biggest distortion in
    how Mexican families choose.</p>
  </div>
  <div class="panel">
    <h3>Outcomes are discounted by risk</h3>
    <p>A program advertising a $30,000 salary where only 40% finish and 60% get
    hired has an expected value far below a program advertising $15,000 where
    almost everyone finishes. We price that.</p>
  </div>
  <div class="panel">
    <h3>Confidence is shown, not hidden</h3>
    <p>Every row carries a label and a source. Where we only have a sector
    baseline we say <em>estimated</em> instead of inventing precision. Providers
    can replace an estimate by publishing verified outcomes.</p>
  </div>
  <div class="panel">
    <h3>What this does not model yet</h3>
    <p>Wage growth over time, informal income, the option value of a degree for
    later study, non-monetary returns, and regional differences outside Mexico
    City. Named plainly, because a comparison tool that hides its own limits is
    just another brochure.</p>
  </div>
</div>

<div class="callout warn">
  <strong>On the horizon setting.</strong> A five-year window structurally
  punishes a four-year degree, because only one year of earnings falls inside it.
  The default is ten years for that reason, and the control is exposed so you can
  see exactly how sensitive the conclusion is to that choice.
</div>

<div class="callout">
  <strong>On language.</strong> The interface is English, but the search box
  understands Spanish, English, and both mixed in one sentence. Rule-based, not a
  language model: it costs nothing, cannot be rate limited in front of an
  audience, and can be audited line by line \u2014 which matters when the output is
  financial advice.
</div>`;
}

/* --------------------------------- router -------------------------------- */

function setActiveNav(name) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

async function route() {
  const path = (location.hash.slice(1) || "/").split("?")[0];
  window.scrollTo(0, 0);

  if (path.startsWith("/route/")) {
    setActiveNav("routes");
    await renderRoute(decodeURIComponent(path.slice("/route/".length)));
    return;
  }
  switch (path) {
    case "/routes":
      setActiveNav("routes");
      await renderRoutes();
      break;
    case "/providers":
      setActiveNav("providers");
      await renderProviders();
      break;
    case "/method":
      setActiveNav("method");
      renderMethod();
      break;
    default:
      setActiveNav("home");
      await renderHome();
  }
}

window.addEventListener("hashchange", () => {
  route().catch((err) => {
    view.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  });
});

restoreState();
route().catch((err) => {
  view.innerHTML = `<div class="error">${esc(err.message)}</div>`;
});
