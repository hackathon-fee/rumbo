import * as api from "./api.js";
import { parseQuery } from "./parse.js";
import {
  DEFAULTS,
  FIELDS,
  CREDENTIAL_LABELS,
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

const state = {
  assumptions: { ...DEFAULTS, field: null, maxMonths: null, modality: null, credentials: null },
  rows: [],
  scored: [],
  understood: [],
  query: "",
  stats: null,
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

function saveState() {
  try {
    sessionStorage.setItem(
      "rumbo",
      JSON.stringify({ assumptions: state.assumptions, query: state.query, understood: state.understood })
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

/* ------------------------------ data loading ----------------------------- */

async function loadRanking() {
  state.rows = await api.rankPaths({ ...state.assumptions, limit: 60 });
  state.scored = rank(state.rows, state.assumptions);
  return state.scored;
}

async function ensureRanking() {
  if (!state.scored.length) await loadRanking();
  return state.scored;
}

/* -------------------------------- fragments ------------------------------- */

function confidenceTag(row) {
  const key = row.data_confidence || "estimated";
  const dot = key === "verified" ? "\u{1F7E2}" : key === "self_reported" ? "\u{1F7E1}" : "\u26AA";
  return `<span class="tag ${esc(key)}">${dot} ${esc(CONFIDENCE_LABELS[key] || key)}</span>`;
}

function cardHtml(row, index) {
  const pb = payback(row);
  return `
<a class="card" href="#/route/${encodeURIComponent(row.program_slug)}">
  <div class="card-top">
    <div>
      <span class="rank">#${index + 1}</span>
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
    <div class="metric"><div class="v">${esc(pct(row.successProb))}</div><div class="k">Finish &amp; get hired</div></div>
    <div class="metric"><div class="v">+${esc(money(row.monthlyGain))}</div><div class="k">Expected raise/mo</div></div>
    <div class="metric"><div class="v ${row.netHorizon >= 0 ? "good" : "bad"}">${esc(money(row.netHorizon))}</div><div class="k">Net over ${Math.round(row.horizonMonths / 12)} yr</div></div>
  </div>
  <div class="tags">
    <span class="tag">${esc(CREDENTIAL_LABELS[row.credential] || row.credential)}</span>
    <span class="tag">${esc(duration(row.months))}</span>
    <span class="tag">${esc(row.modality)}</span>
    ${confidenceTag(row)}
    ${row.fitsBudget ? "" : '<span class="tag over">Over your cash budget</span>'}
  </div>
</a>`;
}

function controlsHtml() {
  const a = state.assumptions;
  const fieldOptions = FIELDS.map(
    ([value, label]) =>
      `<option value="${esc(value)}"${(a.field || "") === value ? " selected" : ""}>${esc(label)}</option>`
  ).join("");
  const modalityOptions = [
    ["", "Any"], ["onsite", "On site"], ["hybrid", "Hybrid"], ["online", "Online"],
  ].map(
    ([value, label]) =>
      `<option value="${esc(value)}"${(a.modality || "") === value ? " selected" : ""}>${esc(label)}</option>`
  ).join("");

  return `
<div class="controls">
  <div class="field">
    <label for="c-field">Field</label>
    <select id="c-field">${fieldOptions}</select>
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
    <select id="c-modality">${modalityOptions}</select>
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
    if (el) el.addEventListener("change", () => { apply(el.value); onChange(); });
  };
  bind("c-field", (v) => { state.assumptions.field = v || null; });
  bind("c-salary", (v) => { state.assumptions.currentSalary = Number(v) || 0; });
  bind("c-budget", (v) => { state.assumptions.budget = Number(v) || 0; });
  bind("c-modality", (v) => { state.assumptions.modality = v || null; });
  bind("c-horizon", (v) => { state.assumptions.horizonMonths = Math.max(12, (Number(v) || 10) * 12); });
}

/* --------------------------------- chart --------------------------------- */

function chartSvg(row) {
  const points = cashFlowCurve(row);
  const W = 760, H = 250, L = 74, R = 14, T = 16, B = 34;
  const values = points.map((p) => p.value);
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);
  const span = maxY - minY || 1;
  const horizon = row.horizonMonths || 120;

  const X = (m) => L + (m / horizon) * (W - L - R);
  const Y = (v) => T + (1 - (v - minY) / span) * (H - T - B);

  const line = points.map((p) => `${X(p.month).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
  const zeroY = Y(0).toFixed(1);

  const crossing = points.find((p) => p.month > row.months && p.value >= 0);
  const marker = crossing
    ? `<circle cx="${X(crossing.month).toFixed(1)}" cy="${zeroY}" r="5" fill="#4ade80" />
       <text x="${(X(crossing.month) + 9).toFixed(1)}" y="${(Number(zeroY) - 11).toFixed(1)}" fill="#4ade80" font-size="12" font-family="monospace">breaks even @ month ${crossing.month}</text>`
    : `<text x="${(W / 2).toFixed(1)}" y="${(Number(zeroY) - 12).toFixed(1)}" fill="#f87171" font-size="12" text-anchor="middle" font-family="monospace">never breaks even in this window</text>`;

  const studyEnd = X(Math.min(row.months, horizon)).toFixed(1);

  return `
<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
     aria-label="Cumulative cash position over ${Math.round(horizon / 12)} years">
  <rect x="${L}" y="${T}" width="${(studyEnd - L).toFixed(1)}" height="${H - T - B}" fill="#1c2430" />
  <text x="${(L + 6).toFixed(1)}" y="${T + 14}" fill="#6b7885" font-size="11">studying</text>
  <line x1="${L}" y1="${zeroY}" x2="${W - R}" y2="${zeroY}" stroke="#2a3441" stroke-width="1" />
  <polyline points="${line}" fill="none" stroke="#60a5fa" stroke-width="2.5" />
  ${marker}
  <text x="6" y="${(T + 10).toFixed(1)}" fill="#6b7885" font-size="11" font-family="monospace">${esc(money(maxY))}</text>
  <text x="6" y="${(Number(zeroY) + 4).toFixed(1)}" fill="#9aa7b4" font-size="11" font-family="monospace">0</text>
  <text x="6" y="${(H - B + 4).toFixed(1)}" fill="#6b7885" font-size="11" font-family="monospace">${esc(money(minY))}</text>
  <text x="${L}" y="${H - 10}" fill="#6b7885" font-size="11">today</text>
  <text x="${(W - R).toFixed(1)}" y="${H - 10}" fill="#6b7885" font-size="11" text-anchor="end">${Math.round(horizon / 12)} years</text>
</svg>`;
}

/* --------------------------------- views --------------------------------- */

const EXAMPLES = [
  "I live in Iztapalapa, I have $40,000 and I want to code",
  "Gano 8500 al mes, quiero algo r\u00e1pido y en l\u00ednea",
  "Quiero ser enfermera pero solo tengo $15 mil",
  "I want a trade that pays in under a year",
];

async function renderHome() {
  view.innerHTML = `
<section class="hero">
  <h1>What should you actually study?</h1>
  <p class="lede">
    Every school in Mexico advertises a price. None of them tell you the two
    numbers that decide your life: what it <em>truly</em> costs you, and when it
    pays you back. Rumbo does.
  </p>
  <form class="ask" id="ask">
    <input id="q" type="text" autocomplete="off"
      placeholder="Tell us in your own words \u2014 Spanish or English"
      value="${esc(state.query)}" />
    <button type="submit" id="go">Find my paths</button>
  </form>
  <div class="chips">
    ${EXAMPLES.map((e) => `<button class="chip" type="button" data-example="${esc(e)}">${esc(e)}</button>`).join("")}
  </div>
  <div id="parsed"></div>
  <div class="stats" id="stats"></div>
</section>

<div class="callout">
  <strong>Why this is missing.</strong> A market cannot allocate anything without
  prices. Mexican education publishes tuition but hides the cost that dominates
  every decision: the income you give up, multiplied by the real chance you
  finish and get hired. Roughly 3 in 10 university students in Mexico drop out
  in their first year, and the system does not price that risk. So families
  guess, and the guess is expensive.
</div>`;

  const form = document.getElementById("ask");
  const input = document.getElementById("q");

  document.querySelectorAll("[data-example]").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.example;
      form.requestSubmit();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("go");
    button.disabled = true;
    button.textContent = "Working\u2026";
    try {
      state.query = input.value;
      const { assumptions, understood } = parseQuery(state.query, DEFAULTS);
      state.assumptions = assumptions;
      state.understood = understood;
      const scored = await loadRanking();
      saveState();
      api.logSimulation(
        { goal_field: assumptions.field || "unspecified", raw_query: state.query, ...assumptions },
        scored.length,
        scored[0] ? scored[0].program_id : null
      );
      location.hash = "#/routes";
    } catch (err) {
      document.getElementById("parsed").innerHTML =
        `<div class="error">${esc(err.message)}</div>`;
      button.disabled = false;
      button.textContent = "Find my paths";
    }
  });

  try {
    state.stats = state.stats || (await api.catalogStats());
    const s = state.stats;
    document.getElementById("stats").innerHTML = `
      <div class="stat"><div class="n">${s.programs}</div><div class="l">Paths priced</div></div>
      <div class="stat"><div class="n">${s.providers}</div><div class="l">Providers</div></div>
      <div class="stat"><div class="n">${s.measured}</div><div class="l">With measured outcomes</div></div>
      <div class="stat"><div class="n">$0</div><div class="l">Cost to learners, always</div></div>`;
  } catch (err) {
    document.getElementById("stats").innerHTML =
      `<div class="error">${esc(err.message)}</div>`;
  }
}

async function renderRoutes() {
  view.innerHTML = `<h1>Your paths, cheapest payback first</h1>
    <p class="lede">Ranked by how fast each one pays back its true cost, not by tuition.</p>
    ${controlsHtml()}
    <div id="understood"></div>
    <div class="cards" id="cards"><div class="loading">Scoring the catalog\u2026</div></div>`;

  if (state.understood.length) {
    document.getElementById("understood").innerHTML = `
      <div class="parsed">We read that as ${state.understood
        .map((u) => `${esc(u.key)}: <b>${esc(u.value)}</b>`)
        .join(" &middot; ")}. Adjust anything above.</div>`;
  }

  const paint = () => {
    state.scored = rank(state.rows, state.assumptions);
    const cards = document.getElementById("cards");
    cards.innerHTML = state.scored.length
      ? state.scored.map(cardHtml).join("")
      : `<div class="panel">Nothing in the catalog matches those filters yet. Widen the field or the budget.</div>`;
  };

  wireControls(async () => {
    document.getElementById("cards").innerHTML = `<div class="loading">Re-scoring\u2026</div>`;
    try {
      await loadRanking();
      saveState();
      paint();
    } catch (err) {
      document.getElementById("cards").innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  });

  try {
    await ensureRanking();
    paint();
  } catch (err) {
    document.getElementById("cards").innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

async function renderRoute(slug) {
  view.innerHTML = `<div class="loading">Loading this path\u2026</div>`;
  try {
    const rows = await api.rankPaths({ ...state.assumptions, field: null, budget: 1e9, limit: 400 });
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
  &middot; ${esc(duration(row.months))} &middot; ${esc(row.hours_per_week)} h/week &middot; ${esc(row.modality)}
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
      Forgone income = ${esc(row.months)} months &times; ${esc(money(row.currentSalary || state.assumptions.currentSalary))}
      &times; study load &times; how much of that load collides with a job.
    </p>
  </div>

  <div class="panel">
    <h3>What it is likely to return</h3>
    <table class="breakdown">
      <tr><th>Median salary after</th><td>${esc(money(row.median_salary_mxn))}</td></tr>
      <tr><th>Chance you finish</th><td>${esc(pct(row.completion_rate))}</td></tr>
      <tr><th>Chance you are hired in 6 months</th><td>${esc(pct(row.employment_rate_6m))}</td></tr>
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
    \u{1F7E2} Verified means we hold a citable published figure.
    \u{1F7E1} Self-reported means the provider published it about itself.
    \u26AA Estimated means we fell back to a sector baseline and labelled it as such
    rather than inventing a number.
  </p>
</div>

<div class="panel" id="financing"><h3>Ways to pay for it</h3><div class="loading">Loading\u2026</div></div>

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
          ? `<table class="breakdown">
              <tr><th>Instrument</th><th>Type</th><th>Terms</th></tr>
              ${options.map((o) => `<tr>
                <th>${esc(o.name)}<br /><span class="muted">${esc(o.provider_name || "")}</span></th>
                <td>${esc(String(o.kind).replace(/_/g, " "))}</td>
                <td>${o.apr != null ? `${(Number(o.apr) * 100).toFixed(1)}% APR` : ""}
                    ${o.income_share_pct != null ? `${(Number(o.income_share_pct) * 100).toFixed(0)}% of income, capped ${Number(o.cap_multiple)}x` : ""}
                    ${o.max_amount_mxn != null ? `<br /><span class="muted">up to ${esc(money(o.max_amount_mxn))}</span>` : ""}
                </td></tr>
                <tr><td colspan="3" class="muted">${esc(o.notes || "")}${o.terms_url ? ` <a href="${esc(o.terms_url)}" rel="noopener nofollow" target="_blank">terms</a>` : ""}</td></tr>`).join("")}
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
      MXN 990 per month for a verified listing, plus MXN 80&ndash;150 per
      introduction. Typical customer acquisition cost in Mexican private
      education runs MXN 1,500&ndash;5,000, so an introduction that converts is
      an order of magnitude cheaper.
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
<div class="panel" id="demand"><div class="loading">Loading\u2026</div></div>`;

  try {
    const demand = await api.demandByField();
    const box = document.getElementById("demand");
    box.innerHTML = demand.length
      ? `<table class="breakdown">
           <tr><th>Field</th><th>Searches</th><th>Last search</th></tr>
           ${demand.map((d) => `<tr>
             <th>${esc(String(d.field).replace(/_/g, " & "))}</th>
             <td>${esc(d.searches)}</td>
             <td>${d.last_search ? esc(new Date(d.last_search).toLocaleString("es-MX")) : "\u2014"}</td>
           </tr>`).join("")}
         </table>
         <p class="muted">Counts only. Rumbo cannot read an individual learner's search, by database policy, not by promise.</p>`
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
  mirrors it so sliders feel instant, and the two must agree.
</p>

<div class="panel">
<pre class="mono" style="white-space:pre-wrap;margin:0">true_cost   = tuition + materials + (months \u00d7 current_income \u00d7 study_load \u00d7 opportunity_factor)
study_load        = min(1, hours_per_week / 45)
opportunity_factor = 0.30 online | 0.60 hybrid | 0.85 on site

success_prob  = completion_rate \u00d7 employment_rate_6m
monthly_gain  = max(median_salary \u2212 current_income, 0) \u00d7 success_prob

payback_months = true_cost / monthly_gain
net_horizon    = monthly_gain \u00d7 (horizon_months \u2212 months) \u2212 true_cost</pre>
</div>

<h2>The three decisions that matter</h2>
<div class="grid2">
  <div class="panel">
    <h3>Forgone income is a real cost</h3>
    <p>A "free" public degree that takes 4.5 years of full-time attendance costs a
    person earning MXN 8,500 a month more than three hundred thousand pesos of
    income. Ignoring that is the single biggest distortion in how Mexican
    families choose.</p>
  </div>
  <div class="panel">
    <h3>Outcomes are discounted by risk</h3>
    <p>A program advertising a MXN 30,000 salary where only 40% finish and 60% get
    hired has an expected value far below a program advertising MXN 15,000 where
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
  see exactly how sensitive the conclusion is.
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
