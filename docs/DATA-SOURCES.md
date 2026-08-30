# Data sources

Every number in Rumbo carries a confidence label and a source. This file is the
full list. It exists so that a judge, a journalist, or a provider can check us.

## Confidence levels

| Label | Meaning | How it is used |
| --- | --- | --- |
| 🟢 **Verified** | A citable published figure from the provider or certifier | Used as-is |
| 🟡 **Self-reported** | The provider published it about itself | Used, and discounted where it looked promotional |
| ⚪ **Estimated** | No program-level figure exists; we fell back to a field × credential baseline | Labelled in the UI on every row |

**11 of 48 programs have verified prices. 34 of 48 have a program-level outcome
record.** The rest fall back to baselines. We show which is which rather than
smoothing over the difference.

## Income and employment baselines

- **Observatorio Laboral (STPS)** — professional income and employment by field,
  and the CDMX panorama (1,323,636 professionals, average income MXN 26,544/mo).
  <https://www.observatoriolaboral.gob.mx>
- **IMSS**, May 2026 — average daily base contribution wage MXN 671.30
  (≈ MXN 20,400/month), 22,724,680 registered jobs.
  <https://www.imss.gob.mx/prensa/archivo/202606/309>
- Professional median income in Mexico, MXN 11,549/month (STPS employment
  trends). Used as a sanity ceiling on estimates, not as a headline figure.

The **MXN 8,500/month default current income** represents a young CDMX worker in
a low-wage or partly informal job — the person this product is for. It is a
chosen persona, exposed as an editable control, not a claim about the average.

## Completion and dropout

- **SEP / Carlos Iván Moreno, 2026** — 3 in 10 university students abandon in the
  first year; only 4.4% of low-income young people reach a bachelor's degree.
- Upper-secondary dropout rose from **10.3% to 11.3%** between 2019-20 and
  2023-24; the SEP has closed recent cycles **without publishing terminal
  efficiency or dropout at all**.
- A documented Mexican case study reports **45.7% terminal efficiency and 32.1%
  graduation**. <https://www.eumed.net/rev/atlante/2015/10/rendimiento-escolar.html>
- Published criticism of the SEP's calculation method, which inflates these
  rates: <http://www.scielo.org.mx/scielo.php?script=sci_arttext&pid=S0185-27602008000200009>
- **UNESCO, 2026** — 9.4% of Mexicans aged 3–14 do not attend school; 18.9% of
  adolescents are without upper-secondary education.

This is why bachelor completion baselines sit at **0.42–0.52** rather than the
official figures. It is the most consequential judgement call in the dataset and
we state it openly.

## Verified provider prices

- **TripleTen México** — list MXN 70,777; MXN 42,777 upfront or 24 × MXN 2,115.
  Published outcomes report. <https://tripleten.mx/informe-de-resultados/>
- **Le Wagon México** — MXN 109,000, full-time immersive.
  <https://info.lewagon.com/mx-bootcamps-web-dev-pr>
- **Generation México** — zero cost to the learner, employer-funded with hiring
  commitments. <https://mexico.generation.org>
- **AWS Certification** — exam fee ≈ USD 150. <https://aws.amazon.com/certification/>
- **Google Career Certificates** — Coursera subscription ≈ MXN 400/month.
  <https://grow.google/certificates/>
- **CompTIA A+** — two exams at ≈ USD 253 each. <https://www.comptia.org>
- **Microsoft** — AZ-900 and AZ-104. <https://learn.microsoft.com/credentials/>
- **Inadaptados** — RVOE 3189 / 3212. <https://inadaptados.mx/programa>
- **UNID** — reported total ≈ MXN 144,000 over three years; monthly MXN
  3,300–4,200. <https://mextudia.com/universidades/unid/>
- **UVM** — monthly MXN 5,300–11,600 by campus and modality.

## Estimated prices

Private university totals (Tec de Monterrey ≈ MXN 1.56M, Ibero ≈ MXN 1.15M,
La Salle ≈ MXN 890k) are **list prices before financial aid**, marked estimated,
with a note on every row that institutional scholarships commonly cover 30–70%.
We do not use them to score a provider unfairly; the comparison is against the
aided price a learner should actually ask for.

Public university tuition is entered as **MXN 0** with a separate materials and
transport figure, because tuition is symbolic but attending is not free.

CECATI, ICAT and CONALEP fees are modelled from published DGCFT and CONALEP fee
structures for Mexico City. These are the least well-documented prices in the
sector and the most useful to publish.

## Comparable tools

Not competitors so much as evidence the need is recognised:

- **IMCO Compara Carreras** <https://imco.org.mx/comparacarreras/> — university
  majors, national, salary-based. No forgone income, no short courses, no trades,
  no risk adjustment.
- **Observatorio Laboral** <https://www.observatoriolaboral.gob.mx> — excellent
  income data, no path comparison, no cost side.

## How to correct us

If a figure here is wrong, it should be replaced with a cited one. That is the
entire mechanism of the product: a provider publishing verified outcomes
upgrades their own rows from ⚪ to 🟢, and the ranking recomputes on real
numbers. Open an issue on the repository with a source.
