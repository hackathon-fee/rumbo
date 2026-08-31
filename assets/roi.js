// Client-side mirror of the SQL in the roi_engine migration.
//
// Why duplicate the maths? So that changing an assumption recomputes the whole
// comparison instantly, with no network round trip. Postgres stays the source of
// truth for the initial ranking and for any future API consumer; this file must
// stay numerically identical to it. If you change one, change both.

export const DEFAULTS = {
  currentSalary: 8500, // MXN per month, a common wage for a young CDMX worker
  budget: 40000, // MXN of cash the learner can actually put in
  horizonMonths: 120, // 10 years
};

export const FIELDS = [
  ["", "Any field"],
  ["software", "Software"],
  ["data_ai", "Data & AI"],
  ["design", "Design"],
  ["health", "Health"],
  ["trades", "Skilled trades"],
  ["business", "Business & sales"],
  ["manufacturing", "Manufacturing"],
  ["logistics", "Logistics"],
  ["energy", "Energy"],
  ["automotive", "Automotive"],
  ["beauty", "Beauty"],
  ["hospitality", "Hospitality"],
  ["education", "Education"],
];

export const FIELD_LABELS = Object.fromEntries(
  FIELDS.filter(([value]) => value).map(([value, label]) => [value, label])
);

export const CREDENTIAL_LABELS = {
  bachelor: "Bachelor's degree",
  associate: "Associate degree",
  technical_diploma: "Technical diploma",
  certificate: "Short course",
  industry_certification: "Industry certification",
  apprenticeship: "Paid apprenticeship",
};

export const MODALITY_LABELS = {
  onsite: "On site",
  hybrid: "Hybrid",
  online: "Online",
};

export const CONFIDENCE_LABELS = {
  verified: "Verified",
  self_reported: "Self-reported",
  estimated: "Estimated",
};

/** Share of a full-time schedule the program consumes. Capped at 1. */
export function studyLoad(hoursPerWeek) {
  return Math.min(1, Math.max(0, Number(hoursPerWeek) / 45));
}

/**
 * How much of that study load actually costs you income.
 * Online study is mostly done around a job; on-site study rarely is.
 */
export function opportunityFactor(modality) {
  if (modality === "online") return 0.3;
  if (modality === "hybrid") return 0.6;
  return 0.85;
}

/**
 * Recompute one program against a set of assumptions.
 * `row` is a raw record from the rank_paths RPC.
 */
export function score(row, assumptions) {
  const currentSalary = Number(assumptions.currentSalary) || 0;
  const horizon = Math.max(Number(assumptions.horizonMonths) || 120, 12);
  const budget = Number(assumptions.budget) || 0;

  const months = Number(row.months);
  const tuition = Number(row.tuition_mxn) || 0;
  const materials = Number(row.materials_mxn) || 0;
  const completion = Number(row.completion_rate) || 0;
  const employment = Number(row.employment_rate_6m) || 0;
  const salary = Number(row.median_salary_mxn) || 0;

  const outOfPocket = tuition + materials;
  const forgone =
    months *
    currentSalary *
    studyLoad(row.hours_per_week) *
    opportunityFactor(row.modality);
  const totalCost = outOfPocket + forgone;

  const successProb = completion * employment;
  const monthlyGain = Math.max(salary - currentSalary, 0) * successProb;

  const paybackMonths = monthlyGain > 0 ? totalCost / monthlyGain : null;
  const earningMonths = Math.max(horizon - months, 0);
  const netHorizon = monthlyGain * earningMonths - totalCost;

  return {
    ...row,
    currentSalary,
    outOfPocket,
    forgone,
    totalCost,
    successProb,
    monthlyGain,
    paybackMonths,
    netHorizon,
    horizonMonths: horizon,
    fitsBudget: outOfPocket <= budget,
  };
}

/** Same ordering rule as the SQL: affordable first, then fastest payback. */
export function rank(rows, assumptions) {
  return rows
    .map((row) => score(row, assumptions))
    .sort((a, b) => {
      if (a.fitsBudget !== b.fitsBudget) return a.fitsBudget ? -1 : 1;
      const pa = a.paybackMonths ?? Infinity;
      const pb = b.paybackMonths ?? Infinity;
      if (pa !== pb) return pa - pb;
      return b.netHorizon - a.netHorizon;
    });
}

/**
 * Cumulative cash position, month by month.
 * Negative while studying, then climbing. The point where it crosses zero is
 * the only number most learners actually need.
 */
export function cashFlowCurve(scored) {
  const months = Number(scored.months);
  const horizon = scored.horizonMonths;
  const monthlyOutOfPocket = months > 0 ? scored.outOfPocket / months : 0;
  const monthlyForgone = months > 0 ? scored.forgone / months : 0;

  const points = [];
  for (let m = 0; m <= horizon; m += 1) {
    const value =
      m <= months
        ? -(monthlyOutOfPocket + monthlyForgone) * m
        : -scored.totalCost + scored.monthlyGain * (m - months);
    points.push({ month: m, value });
  }
  return points;
}

/* ------------------------------- formatting ------------------------------- */

const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Pesos, written the way an English-language financial page would write them. */
export function money(n) {
  const value = Math.round(Number(n) || 0);
  const sign = value < 0 ? "\u2212" : "";
  return `${sign}$${plain.format(Math.abs(value))}`;
}

export const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;

export function duration(months) {
  const m = Number(months);
  if (!Number.isFinite(m)) return "\u2014";
  if (m < 12) return `${m} months`;
  const years = m / 12;
  const text = Number.isInteger(years) ? `${years}` : years.toFixed(1);
  return `${text} ${text === "1" ? "year" : "years"}`;
}

export function payback(scored) {
  if (scored.paybackMonths == null) return { text: "Never", tone: "bad" };
  const m = scored.paybackMonths;
  const text = m < 12 ? `${m.toFixed(1)} mo` : `${(m / 12).toFixed(1)} yr`;
  const tone = m <= 12 ? "good" : m <= 36 ? "mid" : "bad";
  return { text, tone };
}
