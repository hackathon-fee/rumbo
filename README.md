# Rumbo

**The price system Mexican education never had.**

Rumbo compares every education path in Mexico City by the two numbers that
actually decide a person's life and that nobody publishes: what the path
**truly costs**, and **when it pays you back**.

Built for the [FEE Mexico City Hackathon 2026](https://fee.org/mexico-city-hackathon/).

---

## The problem

A market cannot allocate anything without prices. Mexican post-secondary
education publishes tuition and hides everything that matters:

- **The dominant cost is invisible.** A "free" public degree that takes 4.5 years
  of full-time attendance costs someone earning MXN 8,500/month over **MXN
  300,000 of forgone income**. No brochure mentions this.
- **The risk is unpriced.** Roughly **3 in 10 Mexican university students drop out
  in their first year**, and only **4.4% of low-income young people** reach a
  bachelor's degree at all. A program advertising a salary that 40% of its
  students never reach is advertising a number, not an outcome.
- **So families guess.** And the guess costs them years.

Rumbo makes both numbers visible, side by side, for 48 real paths — from a
nine-month CECATI welding course to a MXN 1.5M private engineering degree.

## What it does

1. You type what you want in plain Spanish or English:
   *"I live in Iztapalapa, I have $40,000 and I want to code."*
2. Rumbo ranks every path by **payback period**, not tuition.
3. Each path opens into a cash-flow curve showing exactly when you cross zero,
   a full cost breakdown, the evidence behind every figure, and financing
   options.
4. Every assumption is editable. Change your income, budget, or time horizon and
   the whole comparison re-scores instantly.

## The economics

All of it lives in one auditable Postgres function, `public.rank_paths`:

```
true_cost          = tuition + materials + (months × current_income × study_load × opportunity_factor)
study_load         = min(1, hours_per_week / 45)
opportunity_factor = 0.30 online | 0.60 hybrid | 0.85 on site

success_prob       = completion_rate × employment_rate_6m
monthly_gain       = max(median_salary − current_income, 0) × success_prob

payback_months     = true_cost / monthly_gain
net_horizon        = monthly_gain × (horizon_months − months) − true_cost
```

Two design decisions carry the whole product:

- **Forgone income is a real cost.** This alone reorders the entire market.
- **No program gets credit for outcomes its students do not reach.** The expected
  raise is discounted by completion × employment, always.

## Confidence labels

Nothing is presented as more certain than it is.

| Label | Meaning |
| --- | --- |
| 🟢 Verified | We hold a citable published figure |
| 🟡 Self-reported | The provider published it about itself |
| ⚪ Estimated | We fell back to a sector baseline, and we say so |

Providers can only move up the ranking by publishing **verified** outcomes.
Ranking position is not for sale, ever. That is the incentive the sector lacks.

## Business model

- **Free for learners. Forever.** No account, no paywall, no dark patterns.
- **MXN 990/month** for a verified provider listing.
- **MXN 80–150** per qualified introduction. Customer acquisition cost in Mexican
  private education runs MXN 1,500–5,000, so a converting introduction is an
  order of magnitude cheaper than what providers pay today.
- Aggregate demand data and an API for policy and research use.

A provider at 990 + 8 introductions ≈ **MXN 1,790/month**. Roughly 300 reachable
providers in CDMX and Monterrey ≈ **MXN 6.4M/year**, against a ceiling of tens of
thousands of post-secondary providers nationally.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Database + API | Supabase (Postgres 17) | The economics belong in SQL where they are auditable and reusable |
| Frontend | Static HTML + vanilla ES modules | **Zero build step, zero runtime dependencies.** Nothing can break on stage |
| Charts | Hand-written SVG | No chart library, no CDN dependency |
| Routing | Hash routing | Cannot 404 on reload, works on Netlify and on GitHub Pages subpaths |
| Hosting | Netlify | Static, instant |

There is no `package.json` on purpose. A demo that cannot fail to build is worth
more than a demo with a nicer toolchain.

## Security

- Row level security is on for **every** table.
- The catalog is publicly **readable**; `simulations`, `leads` and `field_notes`
  are **insert-only** — the browser can write a search or a lead but can never
  read anyone's back, including its own.
- Provider demand data is exposed through `demand_by_field`, which serves
  **counts only**, from an aggregate table. Individual learner searches are
  unreadable by database policy, not by promise.
- Only the publishable (anonymous) key ever reaches the browser. The service role
  key appears nowhere in this repository.

## Running it

It is a static site. Clone it and open `index.html`, or:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

The Supabase project URL and publishable key are in `assets/api.js`. They are
meant to be public — RLS is what protects the data.

To point it at your own Supabase project, see `docs/ARCHITECTURE.md` for the
full schema and the `rank_paths` function.

## Layout

```
index.html            app shell
assets/api.js         PostgREST client, with automatic key fallback
assets/roi.js         browser mirror of the SQL economics
assets/parse.js       bilingual rule-based query parser
assets/app.js         router and all four views
assets/styles.css     hand-written CSS
docs/PITCH.md         four-minute pitch script
docs/ARCHITECTURE.md  schema, RLS policies, the ROI function
docs/DATA-SOURCES.md  every source behind every number
```

## Honest limitations

Named here because a comparison tool that hides its own limits is just another
brochure.

- Most completion and employment figures are **sector estimates**, not measured
  cohorts. Mexico does not publish program-level terminal efficiency; the SEP has
  closed recent cycles without publishing it at all. Fixing that is the product.
- No wage growth over time, no informal income, no option value of a degree for
  later study, no non-monetary returns.
- Mexico City only.
- The query parser is rule-based, not an LLM. It handles the common phrasings and
  falls back to editable controls when it misreads.

## License

MIT. See `LICENSE`.
