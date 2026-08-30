# Rumbo — four-minute pitch

Judging criteria for this hackathon are **feasibility** and **innovation**, and
the stated goal is to *bridge the gap between technological innovation and
economic education*. This script is built to hit all three without ever
sounding like a lecture.

---

## 0:00–0:35 — The hook (no slides, just say it)

> "Ask anyone in this room what a bachelor's degree at UNAM costs. They'll say
> it's free.
>
> It isn't. For a nineteen-year-old in Iztapalapa earning eight thousand five
> hundred pesos a month, four and a half years of full-time attendance costs
> **three hundred thousand pesos** of income he never earns. Nobody tells him
> that. And nobody tells him that three out of ten students in his position drop
> out in the first year.
>
> He isn't making a bad decision. He's making a decision **without prices**."

## 0:35–1:05 — Name the economics out loud

> "This is Hayek's knowledge problem, sitting in plain sight in the largest
> single investment most Mexican families ever make.
>
> The information needed to choose well exists — it's scattered across schools
> that have no incentive to publish it. Without prices, there's no discovery, no
> competition on quality, and no way for a family to exercise what Hirschman
> called *exit* rather than just voice.
>
> We didn't build a school. We built the missing price system."

## 1:05–2:20 — Live demo (this is the pitch; do not rush it)

Open the live site. Type the query out loud, slowly:

> `I live in Iztapalapa, I have $40,000 and I want to code`

Let the ranking land. Then narrate exactly three things:

1. **Point at the top result and the bottom result.**
   > "Same goal. Same city. Top path pays itself back in **under three months**.
   > A computer engineering degree takes **more than five years** to break even —
   > and over a ten-year horizon it nets a fraction of the short path, because
   > we're counting the income you gave up to sit in the classroom."

2. **Open the top path. Point at the curve crossing zero.**
   > "That's the only chart a family actually needs. Negative while you study,
   > climbing once the raise arrives, and the crossing point is your answer."

3. **Point at the confidence badge, then at the source link.**
   > "Green means we hold a published figure. Grey means we used a sector
   > baseline and we **say so**. We never invent precision. And the only way a
   > school moves up this list is by publishing verified outcomes — ranking is
   > not for sale."

Then change one assumption live — set income to 20,000 — and let the order
visibly change.

> "Different person, different answer. That's what a price does."

## 2:20–3:00 — Why it's real, not a mockup

> "This is live. Postgres with row-level security, 48 real programs across 27
> real providers — UNAM, IPN, CONALEP, CECATI, bootcamps, AWS certifications,
> paid apprenticeships. The economics are one auditable SQL function, so the same
> numbers serve the website, an API, and a researcher.
>
> No build step, no framework, no dependencies. It can't break."

## 3:00–3:35 — The business, in one breath

> "Free for the student. Forever.
>
> Providers pay **990 pesos a month** for a verified listing and **80 to 150
> pesos** per introduction. They currently pay between fifteen hundred and five
> thousand pesos to acquire one student. We are an order of magnitude cheaper,
> and we're cheaper *because* we're honest.
>
> Three hundred reachable providers in CDMX and Monterrey is about six and a half
> million pesos a year. The national ceiling is tens of thousands of providers."

## 3:35–4:00 — The close

> "Every proposal to fix Mexican education starts with 'the government should.'
>
> Ours doesn't. Give families the prices and the market reorganizes itself:
> honest providers get cheaper distribution, dishonest ones lose students, and
> nobody had to pass a law.
>
> We're not building a school. **We're building the price system Mexican
> education never had.** The market does the rest."

---

## Anticipated judge questions

**"Your completion data is mostly estimated."**
> "Correct, and we label every one of those rows. Mexico doesn't publish
> program-level terminal efficiency — the SEP closed recent cycles without
> publishing it at all. That gap *is* the business: providers who publish
> verified outcomes get ranked on real numbers, and everyone else stays grey.
> We'd rather show an honest estimate than a confident lie."

**"Aren't you telling people not to go to university?"**
> "No. We're telling them what it costs. For some profiles a degree still wins on
> a ten-year horizon — you can watch it win if you raise the horizon control.
> What we refuse to do is let a five-year commitment be sold without its price."

**"Why won't providers just refuse to participate?"**
> "They're already in the catalog. Public data gets them listed; paying gets them
> *verified*. Absence looks worse than participation, and the first mover in each
> segment gets a permanent honesty advantage."

**"IMCO's Compara Carreras already exists."**
> "It compares university majors nationally, on salary. It doesn't price forgone
> income, doesn't include CECATI or bootcamps or apprenticeships, doesn't
> risk-adjust by completion, and doesn't generate leads. We compare *every* path
> a specific person can actually take, and we're a market, not a report."

**"How is this defensible?"**
> "The dataset of verified outcomes, and the demand signal. Once providers submit
> outcomes to be ranked, we hold the only structured record of what Mexican
> education actually returns — and the only real-time picture of what learners
> are looking for before they enrol."

---

## Slide list (5 slides, no more)

1. **"UNAM is free."** → "UNAM costs MXN 303,450." (Nothing else on the slide.)
2. The formula, in the same monospace it appears in the product.
3. Live demo. No slide.
4. Ranking screenshot: 2.2 months vs 62.3 months, side by side.
5. "We're building the price system Mexican education never had."

## Demo safety

- Screen-record a 60-second run **before** you present. Venue wifi fails.
- Rehearse the three demo queries so they are warm.
- Have the live URL open in a phone browser to hand to a judge.
- Tag the repo before you present so a bad commit can't reach production.
