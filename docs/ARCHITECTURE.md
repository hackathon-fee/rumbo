# Architecture

## Shape

```
Browser (static, no build)
  │  fetch → PostgREST
  ▼
Supabase Postgres 17
  ├── catalog tables         public SELECT via RLS
  ├── rank_paths()           all economics, SECURITY INVOKER
  ├── simulations / leads    INSERT only, never readable
  └── demand_counters        aggregate-only, publicly readable
```

There is no server and no build pipeline. The browser talks straight to
PostgREST with a publishable key; **row level security is the authorization
layer**. This is the whole point: fewer moving parts means fewer ways to fail on
stage, and the economics stay in one place where they can be audited.

## Tables

| Table | Purpose | Public access |
| --- | --- | --- |
| `providers` | Schools, institutes, bootcamps, certifiers, apprenticeship sponsors | SELECT |
| `programs` | One row per path. Duration, weekly hours, tuition, materials, modality, confidence | SELECT where `is_active` |
| `outcomes` | Measured cohort results: completion, 6-month employment, median salary, sample size, source | SELECT |
| `field_baselines` | Fallbacks by field × credential, used when a program has no measured outcome. Every estimate traces to one of these rows | SELECT |
| `financing_options` | Scholarships, loans, deferred tuition, income-share instruments | SELECT |
| `program_financing` | Which instruments apply to which path | SELECT |
| `simulations` | Every search, for the demand signal | INSERT only |
| `leads` | A learner asking a provider to contact them. The revenue event | INSERT only |
| `field_notes` | Interview quotes from real learners and providers | INSERT; SELECT only where `consent_to_quote` |
| `demand_counters` | Aggregate searches per field, maintained by trigger | SELECT |

### Why `simulations` and `leads` are insert-only

The browser must be able to log a search and submit a lead, but it must never be
able to read them. There is no SELECT policy on either table, so `anon` writes
and cannot read — not as a promise, as a database constraint. A learner's income
and contact details are never retrievable with the public key.

Provider-facing demand goes through `demand_counters`, which a trigger maintains
on insert and which contains **counts only**. This also makes the provider
dashboard O(1) instead of a full scan.

## The economics function

`public.rank_paths()` is the single source of truth. It is `SECURITY INVOKER`, so
RLS still applies to the caller.

```sql
select * from public.rank_paths(
  p_goal_field         => 'software',
  p_budget_mxn         => 40000,
  p_current_salary_mxn => 8500,
  p_max_months         => null,
  p_modality           => null,
  p_credentials        => null,
  p_horizon_months     => 120,
  p_limit              => 12
);
```

Pipeline:

1. **base** — join each program to its provider, to its most recent measured
   outcome via `left join lateral`, and to the field × credential baseline.
   Coalesce in that order, so a measured outcome always beats a baseline. Record
   which one was used as `data_confidence`.
2. **priced** — compute forgone income:
   `months × current_income × study_load(hours) × opportunity_factor(modality)`.
3. **scored** — `success_prob = completion × employment`;
   `monthly_gain = max(salary − current_income, 0) × success_prob`.
4. **output** — payback, net over the horizon, budget fit, evidence and source.

Ordering: affordable first, then fastest payback, then highest net.

### Implementation notes

- Both helpers (`study_load`, `opportunity_factor`) are `IMMUTABLE` with a pinned
  `search_path`.
- In a `language sql` function with `RETURNS TABLE`, output column names shadow
  table columns. Every column inside is aliased (`s.pfield`, not `field`) to
  avoid `column reference is ambiguous`.
- `assets/roi.js` mirrors this arithmetic exactly so assumption sliders recompute
  with no round trip. **If you change one, change both.**

## Frontend

- Hash routing (`#/routes`, `#/route/:slug`). Chosen deliberately: it cannot 404
  on reload, and it works unchanged on Netlify and on a GitHub Pages subpath.
- `assets/api.js` retries once with a legacy anonymous key if the publishable key
  is ever rejected, so a key-format change cannot kill a live demo.
- Charts are hand-written SVG strings. No chart library.
- The query parser is deterministic and bilingual. No LLM call, so there is no
  API key to expire and no rate limit to hit mid-pitch.

## Reproducing the database

Migrations were applied in this order:

1. `core_schema` — extensions, 10 tables, 6 indexes
2. `row_level_security` — RLS on every table, 12 policies
3. `roi_engine` — helpers, `rank_paths`, `program_roi`
4. `seed_mexico_city_catalog` — 27 providers, 27 field baselines
5. `seed_programs_and_outcomes` — 48 programs, 34 outcomes, 6 financing options
6. `roi_engine_v2_horizon_and_security` — configurable horizon, invoker-rights views
7. `demand_counters_no_definer` — aggregate counters, zero elevated-privilege API surface

To pull them into a local project:

```bash
supabase link --project-ref <your-ref>
supabase db pull
```
