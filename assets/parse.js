// Turns something a person would actually type into structured search
// parameters. Deliberately rule-based rather than an LLM call:
//
//  1. It runs in the browser with zero latency and zero cost.
//  2. It cannot fail in front of a judge because of a rate limit or an expired
//     API key.
//  3. It is fully auditable, which matters when the output is financial advice.
//
// The interface is English, but the parser accepts Spanish and English in the
// same sentence on purpose. That is how people in Mexico City actually write,
// and refusing their own words would defeat the point of the product.

const FIELD_PATTERNS = [
  ["data_ai", /\b(datos|data|anal[ií]tica|analytics|analista|scientist|machine learning|inteligencia artificial|\bia\b|\bai\b|power ?bi|sql)\b/i],
  ["software", /\b(program(a|ar|aci[oó]n|mer|ming)?|software|c[oó]digo|codear|coding|code|desarrollador|developer|desarrollo web|web|frontend|front-end|backend|back-end|full ?stack|apps?|sistemas|computaci[oó]n|\bti\b|\bit\b|nube|cloud|devops|ciberseguridad|cybersecurity)\b/i],
  ["design", /\b(dise[nñ]o|design|dise[nñ]ador|\bux\b|\bui\b|gr[aá]fico|graphic|ilustraci[oó]n|figma|branding|comunicaci[oó]n visual)\b/i],
  ["health", /\b(salud|health|enfermer[ií]a|nurse|nursing|m[eé]dic|medical|paramedic|urgencias|emergency|cl[ií]nic|hospital|cuidados)\b/i],
  ["trades", /\b(oficio|trade|soldadura|welding|soldador|electricidad|electricista|electric|plomer[ií]a|plumbing|refrigeraci[oó]n|aire acondicionado|hvac|construcci[oó]n|construction|alba[nñ]il|carpinter)\b/i],
  ["automotive", /\b(mec[aá]nic|automotriz|automotive|autos?|coches?|carros?|veh[ií]culos?|diesel|di[eé]sel|hojalater)\b/i],
  ["beauty", /\b(belleza|beauty|estilis|est[eé]tica|barber|cosmetolog|u[nñ]as|nails|maquillaje|makeup|peluquer)\b/i],
  ["logistics", /\b(log[ií]stica|logistics|almac[eé]n|warehouse|inventario|inventory|cadena de suministro|supply chain|transporte|repartid)\b/i],
  ["manufacturing", /\b(manufactura|manufacturing|industrial|producci[oó]n|f[aá]brica|factory|mecatr[oó]nic|mechatronic|maquinad|cnc|electromec[aá]nic)\b/i],
  ["energy", /\b(energ[ií]a|energy|solar|paneles|el[eé]ctrica industrial|petr[oó]leo|renovable)\b/i],
  ["business", /\b(negocio|business|ventas|sales|comercial|administraci[oó]n|administration|marketing|contabilidad|accounting|finanzas|finance|emprend|atenci[oó]n a clientes|customer service|call ?center)\b/i],
  ["hospitality", /\b(turismo|tourism|hoteler|hospitality|restaurante|restaurant|chef|cocina|culinary|barista|meser)\b/i],
  ["education", /\b(educaci[oó]n|education|docente|teacher|maestr[oa]|pedagog|ense[nñ]ar|teaching)\b/i],
];

const FIELD_LABELS = {
  software: "Software",
  data_ai: "Data & AI",
  design: "Design",
  health: "Health",
  trades: "Skilled trades",
  business: "Business & sales",
  manufacturing: "Manufacturing",
  logistics: "Logistics",
  energy: "Energy",
  automotive: "Automotive",
  beauty: "Beauty",
  hospitality: "Hospitality",
  education: "Education",
};

const MODALITY_LABELS = {
  online: "Online",
  hybrid: "Hybrid",
  onsite: "On site",
};

const MODALITY_PATTERNS = [
  ["online", /\b(en l[ií]nea|online|remoto|remote|a distancia|virtual|desde casa|from home)\b/i],
  ["hybrid", /\b(h[ií]brid|hybrid|mixto|semipresencial)\b/i],
  ["onsite", /\b(presencial|onsite|on-site|in ?person|en persona|aula)\b/i],
];

// Words that tell us what a number means.
const BUDGET_CUE = /(presupuesto|budget|tengo|cuento con|puedo pagar|puedo gastar|afford|ahorr|savings?|saved|max(?:imo)?|hasta|invertir|invest)/i;
const SALARY_CUE = /(gano|gana|ganando|gan[eé]|sueldo|salario|salary|wage|earn(?:ing)?s?|i make|make about|ingreso|income|al mes gano)/i;

const num = new Intl.NumberFormat("en-US");

/** "40 mil" -> 40000, "40k" -> 40000, "40,000" -> 40000, "1.5k" -> 1500 */
function toNumber(raw) {
  if (!raw) return null;
  let text = String(raw).toLowerCase().trim();
  let multiplier = 1;

  if (/mill/.test(text)) multiplier = 1000000;
  else if (/\bmil\b|\bk\b/.test(text)) multiplier = 1000;

  // Strip everything that is not a digit or a decimal separator.
  let digits = text.replace(/[^\d.,]/g, "");
  if (!digits) return null;

  // Thousands separators: "40,000" and "40.000" both mean forty thousand.
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) {
    digits = digits.replace(/[.,]/g, "");
  } else {
    digits = digits.replace(/,/g, ".");
    const parts = digits.split(".");
    if (parts.length > 2) digits = parts.join("");
  }

  const value = Number.parseFloat(digits);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * multiplier);
}

/** Finds a number that sits near a cue phrase. */
function findCuedAmount(text, cue) {
  const pattern = new RegExp(
    cue.source + "[^\\d$]{0,24}\\$?\\s*([\\d.,]+\\s*(?:mil|k|millones?)?)",
    "i"
  );
  const match = text.match(pattern);
  return match ? toNumber(match[1]) : null;
}

export function parseQuery(raw, defaults) {
  const text = String(raw || "");
  const result = {
    field: null,
    budget: defaults.budget,
    currentSalary: defaults.currentSalary,
    maxMonths: null,
    modality: null,
    credentials: null,
    horizonMonths: defaults.horizonMonths,
  };
  const understood = [];

  for (const [field, pattern] of FIELD_PATTERNS) {
    if (pattern.test(text)) {
      result.field = field;
      understood.push({ key: "Field", value: FIELD_LABELS[field] || field });
      break;
    }
  }

  for (const [modality, pattern] of MODALITY_PATTERNS) {
    if (pattern.test(text)) {
      result.modality = modality;
      understood.push({ key: "Modality", value: MODALITY_LABELS[modality] });
      break;
    }
  }

  const salary = findCuedAmount(text, SALARY_CUE);
  if (salary != null && salary > 0 && salary < 500000) {
    result.currentSalary = salary;
    understood.push({ key: "Income now", value: `$${num.format(salary)}/mo` });
  }

  let budget = findCuedAmount(text, BUDGET_CUE);
  if (budget == null) {
    // A bare peso amount with no other cue is almost always the budget.
    const bare = text.match(/\$\s*([\d.,]+\s*(?:mil|k|millones?)?)/i);
    const candidate = bare ? toNumber(bare[1]) : null;
    if (candidate != null && candidate !== result.currentSalary) budget = candidate;
  }
  if (budget != null && budget >= 0) {
    result.budget = budget;
    understood.push({ key: "Cash budget", value: `$${num.format(budget)}` });
  }

  const monthsMatch = text.match(/(\d+)\s*(meses|mes|months?|mos?)\b/i);
  const yearsMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(a[nñ]os?|years?|yrs?)\b/i);
  if (monthsMatch) {
    result.maxMonths = Number(monthsMatch[1]);
  } else if (yearsMatch) {
    result.maxMonths = Math.round(Number(String(yearsMatch[1]).replace(",", ".")) * 12);
  } else if (/\b(r[aá]pido|fast|quick|ya|urgente|urgent|pronto|soon|corto|short)\b/i.test(text)) {
    result.maxMonths = 12;
  }
  if (result.maxMonths) {
    understood.push({ key: "Max length", value: `${result.maxMonths} months` });
  }

  if (/\b(sin licenciatura|sin universidad|no universidad|no quiero universidad|no degree|without a degree|no college|not a degree)\b/i.test(text)) {
    result.credentials = [
      "technical_diploma",
      "certificate",
      "industry_certification",
      "apprenticeship",
    ];
    understood.push({ key: "Excluding", value: "university degrees" });
  }

  return { assumptions: result, understood };
}
