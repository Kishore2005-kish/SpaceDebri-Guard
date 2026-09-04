# SENTINEL vs STK — Capability Comparison

> **A side-by-side comparison of SENTINEL's operator-grade open stack against
> Ansys STK's professional desktop suite — and why SENTINEL integrates with
> STK rather than competing with it.**

SENTINEL and STK solve overlapping but not identical problems. SENTINEL is
an **operator-friendly, web-accessible, explainable** conjunction dashboard
built on open data (CelesTrak) and an open propagator (the `sgp4` npm
package, WGS84, TEME frame). STK is a **professional, high-fidelity** desktop
application with proprietary propagators, native 3D, and the industry-standard
Advanced CAT. They are complementary: SENTINEL is the fast, explainable front
door; STK is the high-fidelity back end that an operator with a license can
attach for the final go/no-go.

---

## 1. Capability Comparison Table

| Component | SENTINEL | STK |
|-----------|----------|-----|
| **Data ingestion** | Real CelesTrak OMM/GP via the `z-ai-web-dev-sdk` `page_reader` proxy (URL-encoded queries, no API key). Stored in Prisma/SQLite. Catalog IDs as `String` (no 6-digit truncation). | Manual import of TLE/OMM, owner-operator ephemeris, or CSpOC special perturbations data. Supports covariance via CDM ingest. |
| **Fast screening** | Own `screen()` over the whole catalog in seconds — pure SGP4, AFSPC mode, WGS84. Designed to surface candidates, not final answers. | Native, but typically run as Advanced CAT over a pre-filtered set. Full-catalog screening is slower and license-heavy. |
| **SGP4** | `sgp4` npm@1.0.10 (python-sgp4 port). WGS84 constants, TEME frame, AFSPC ops mode. Open algorithm (Vallado et al., "Revisiting Spacetrack Report #3"). | Bundled SGP4 + optional SGP4-XL + special-perturbations numerical integrator with full force models (geopotential, drag, SRP, third-body). |
| **3D visualization** | Custom HTML5 `<canvas>` renderer (`simulation-viz.tsx`) — both orbit tracks, closest-approach line + distance label, separation-vs-time chart, play/pause/Jump-to-TCA. Runs in any browser. | Native STK 3D globe with high-resolution imagery, terrain, and vector graphics. Desktop-only. |
| **Conjunction analysis** | Prototype SGP4 close-approach screen (relative position minima over the analysis window) plus the STK Advanced CAT adapter when STK is available. | **Advanced CAT** (Conjunction Analysis Tools) — the industry-standard close-approach engine. https://help.agi.com/stk/Content/cat/Cat03.htm |
| **Covariance analysis** | Not computed from public GP data (no covariance in TLE/OMM). The COLLISION PROBABILITY panel shows `UNAVAILABLE` rather than fabricate. | Full covariance propagation and integration when covariance is supplied (CDM / SP ephemeris). |
| **Collision probability (Pc)** | `UNAVAILABLE` by default (per NASA CARA: Pc requires covariance — https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/). Populated only when STK returns one with covariance. | Foster / Akella–Alfriend Pc integration when covariance is present. |
| **Operator dashboard** | Purpose-built web dashboard: conjunctions table, risk explanation cards, AI assistant, provenance, time-display (SIM TIME / TCA / COUNTDOWN). | STK's own desktop UI; no native "operator dashboard" concept — reports are exported and consumed elsewhere. |
| **Explainable risk** | Risk scores broken down by component (TCA proximity, relative velocity, object class, screening window) with a human-readable explanation card. | Reports are detailed but operator must interpret; no native explainability layer. |
| **AI assistant** | Built-in LLM assistant (`src/components/ai/ai-assistant.tsx`) answers free-text questions about conjunctions, explains risk, suggests maneuvers. | None. |
| **Provenance** | Every `SimulationRun` stores `stkVersion`, `stkScenarioId`, `stkAnalysisId`, `stkThreshold`, `stkResultTimestamp`, `stkRawReportHash` — tamper-evident audit trail. | Scenario files and reports on disk; provenance is operator-managed. |
| **Licensing & access** | Open-source stack (Next.js, Prisma, sgp4 npm, shadcn/ui). Free to run. Runs in a browser. | **Commercial Ansys license required.** Desktop install. Not bundled with SENTINEL. https://www.ansys.com/products/missions/stk |

---

## 2. Why Both Systems Are Used

### SENTINEL = operator-friendly + accessible

- **No license barrier.** An operator on watch can open SENTINEL in a browser,
  see the live conjunction picture, ask the AI assistant why a particular event
  is flagged, and pull a maneuver recommendation — all without installing
  anything or checking out a license seat.
- **Open data, open algorithm.** Every number traces back to a CelesTrak
  fetch (with `retrievedAt` timestamp) and an SGP4 propagation whose source is
  auditable (the `sgp4` npm package + the Vallado et al. paper). The PROVE THIS
  PREDICTION panel makes this auditable chain visible in the UI.
- **Explainability first.** Risk scores are decomposed; the AI assistant can
  justify them in natural language. STK's reports assume the operator already
  knows what to look at.

### STK = professional + high-fidelity

- **Advanced CAT is the reference.** When an operator needs the conjunction
  answer that matches what CSpOC and commercial SSA providers produce, STK
  Advanced CAT is that answer. It supports covariance-driven Pc, SGP4-XL,
  and special perturbations with full force models.
- **Native, publication-grade 3D.** STK's globe and vector graphics are the
  gold standard for flight-dynamics reviews and after-action reports.
- **Auditable workflow.** STK scenario files are self-contained artifacts an
  operator can hand to a safety review board.

### How they compose in SENTINEL

```text
   SENTINEL fast screen (open SGP4, free, web)
            │  finds candidate conjunctions in seconds
            ▼
   SENTINEL SimulationView  (3D, separation chart, engine comparison)
            │  operator picks one and clicks RUN ORBITAL SIMULATION
            ▼
   ┌──── STK available? (TCP probe 127.0.0.1:5001) ────┐
   │                                                     │
   │  YES → STK Advanced CAT                            │  NO → SGP4 fallback
   │        (professional path, engine = STK)           │       (engine = SENTINEL SGP4 (fallback))
   │                                                     │
   └────────────────────┬────────────────────────────────┘
                        ▼
   SimulationRun (provenance captured)
                        ▼
   SimulationView: 3D + ENGINE COMPARISON (SENTINEL vs STK vs SOCRATES)
                  + COLLISION PROBABILITY (UNAVAILABLE without covariance)
                  + PROVE THIS PREDICTION (7-item checklist)
```

The same UI renders both paths. The only thing that changes between the two
is the value of the `engine` field — `'STK Advanced CAT'` or
`'SENTINEL SGP4 (fallback)'` — and the color of the seventh PROVE THIS
PREDICTION item (green vs amber).

---

## 3. When to Use Which

| Situation | Use |
|-----------|-----|
| Initial screening over the full catalog | **SENTINEL** — seconds, free, in-browser |
| Quick "is this conjunction real?" sanity check | **SENTINEL** — PROVE THIS PREDICTION panel |
| Explain to a non-flight-dynamics stakeholder why an event is flagged | **SENTINEL** — AI assistant + risk-explanation cards |
| Pre-maneuver planning with a hypothetical ΔV | **SENTINEL** maneuver panel + (optional) STK confirmation |
| Final go/no-go with covariance-driven Pc | **STK** Advanced CAT (covariance supplied via CDM/ephemeris) |
| Auditable scenario file for a safety review board | **STK** (scenario + report artifacts) |
| Operator on watch without an STK license seat | **SENTINEL** (SGP4 fallback is honest about what it is) |

---

## 4. The Honest Disclosure Rule

The single most important rule in the SENTINEL/STK relationship:

> **SENTINEL never labels its SGP4 result as "STK".** When STK is not
> installed, the simulation runs through the SGP4 fallback and every surface —
> the `SimulationRun.engine` column, the `StkConjunctionResult.engine`
> field, the SimulationView's "SIMULATION ENGINE" badge, the ENGINE
> COMPARISON table, and the seventh item of the PROVE THIS PREDICTION panel —
> reads "SENTINEL SGP4 (fallback)". The amber "STK unavailable (SGP4
> fallback used)" item is the explicit, visible disclosure.

This is what makes the integration defensible: an operator who sees a result
from SENTINEL always knows, at a glance, whether it came from the open SGP4
engine or from a licensed STK Advanced CAT run.

For the live walkthrough of this comparison in a 5-minute demo, see
`docs/STK_DEMO.md`. For installation and licensing of STK itself, see
`docs/STK_SETUP.md`.
