// Thin PostgREST client for Supabase. No SDK, no bundler, no build step.
// Everything here uses a publishable (anonymous) key and is safe to ship to a
// browser: row level security in the database decides what this key can read.
// Read-only on the catalog, insert-only on simulations and leads.

export const SUPABASE_URL = "https://skbadqkzpdsfgszxgprf.supabase.co";

// Current-generation publishable key.
const PUBLISHABLE_KEY = "sb_publishable_lYPitxEhYClfQpjjtBEhVA_5Xiuh_rK";

// Legacy anonymous JWT for the same project. Used only as an automatic fallback
// if the project ever rejects the publishable key, so a live demo cannot die on
// a key-format change.
const LEGACY_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrYmFkcWt6cGRzZmdzenhncHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjU1ODIsImV4cCI6MjEwMzcwMTU4Mn0.9rogkN43HZeFRGOtt9gvVof4ilOfNCaVoxdRYHhzIGc";

let activeKey = PUBLISHABLE_KEY;

async function request(path, options = {}, allowFallback = true) {
  const headers = {
    apikey: activeKey,
    Authorization: `Bearer ${activeKey}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  let res;
  try {
    res = await fetch(SUPABASE_URL + path, { ...options, headers });
  } catch (networkError) {
    throw new Error(
      "Could not reach the database. Check your connection and try again."
    );
  }

  if ((res.status === 401 || res.status === 403) && allowFallback && activeKey !== LEGACY_ANON_KEY) {
    activeKey = LEGACY_ANON_KEY;
    return request(path, options, false);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Database returned ${res.status}. ${body.slice(0, 240)}`);
  }

  const contentRange = res.headers.get("content-range");
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { data, contentRange };
}

/**
 * Rank every program for one learner profile.
 * All of the economics happen in Postgres (see supabase/migrations), so the
 * browser and any future API client get identical numbers.
 */
export async function rankPaths(assumptions) {
  const body = {
    p_goal_field: assumptions.field ?? null,
    p_budget_mxn: assumptions.budget ?? 40000,
    p_current_salary_mxn: assumptions.currentSalary ?? 8500,
    p_max_months: assumptions.maxMonths ?? null,
    p_modality: assumptions.modality ?? null,
    p_credentials: assumptions.credentials ?? null,
    p_horizon_months: assumptions.horizonMonths ?? 120,
    p_limit: assumptions.limit ?? 60,
  };
  const { data } = await request("/rest/v1/rpc/rank_paths", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data || [];
}

/** Headline catalog numbers for the landing page. */
export async function catalogStats() {
  const countOf = async (table, filter = "") => {
    const { contentRange } = await request(
      `/rest/v1/${table}?select=id${filter}&limit=1`,
      { headers: { Prefer: "count=exact" } }
    );
    const total = contentRange ? Number(contentRange.split("/")[1]) : 0;
    return Number.isFinite(total) ? total : 0;
  };

  const [programs, providers, measured] = await Promise.all([
    countOf("programs", "&is_active=eq.true"),
    countOf("providers"),
    countOf("outcomes"),
  ]);

  return { programs, providers, measured };
}

/** Financing instruments attached to one program. */
export async function financingFor(programId) {
  const { data } = await request(
    `/rest/v1/program_financing?program_id=eq.${programId}` +
      `&select=financing_options(slug,name,kind,provider_name,apr,income_share_pct,cap_multiple,min_income_mxn,max_amount_mxn,notes,terms_url)`
  );
  return (data || []).map((row) => row.financing_options).filter(Boolean);
}

/**
 * Log a search. Insert-only by policy: this page can write a search but can
 * never read anyone's searches back, including its own.
 */
export async function logSimulation(input, resultCount, topProgramId) {
  try {
    await request("/rest/v1/simulations", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        input,
        result_count: resultCount,
        top_program_id: topProgramId || null,
      }),
    });
  } catch (err) {
    // Demand logging must never break a learner's search.
    console.warn("Simulation log skipped:", err.message);
  }
}

/** A learner asking a provider to contact them. This is the revenue event. */
export async function createLead(lead) {
  await request("/rest/v1/leads", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(lead),
  });
}

/** Aggregate demand. Counts only, never individual searches. */
export async function demandByField() {
  const { data } = await request("/rest/v1/demand_by_field?select=*");
  return data || [];
}
