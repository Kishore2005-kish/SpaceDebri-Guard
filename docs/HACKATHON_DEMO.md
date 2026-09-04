# SENTINEL — 5-Minute Evaluator Walkthrough

## Overview

This document is a tight, timestamped 5-minute walkthrough for an evaluator (judge, stakeholder, hackathon reviewer) that demonstrates every load-bearing feature of SENTINEL: live CelesTrak fetch, screening, conjunction detail, the risk-vs-confidence distinction, 3D encounter visualization, maneuver what-if, post-maneuver re-screening, SOCRATES validation, report export, and the provenance / "How do we know this is real?" panel.

Open the application in the Preview Panel. If you are using a web interface, click the "Open in New Tab" button above the Preview Panel; if communicating via IM, use the supplied preview link. **Never** point a browser at `localhost:3000` — that address is internal to the sandbox.

## Timestamped Run

### 00:00 — Problem (15 s)
Open the Dashboard. State the problem: *"Low Earth Orbit is congested, commercial SSA subscriptions cost tens of thousands of dollars a month, and the first layer of conjunction awareness is gated behind paywalls. SENTINEL makes that first layer accessible, transparent, and free."* Point at the `DEMO` badge in the `TopBar` — a fresh install starts with synthetic data, by design.

### 00:15 — Sentinel overview (15 s)
Click through the `Sidebar` tabs: Dashboard, Conjunctions, Catalog, Validation, Tutorial, Docs. Point out the floating `AiAssistant` button bottom-right. Note that all of this is a single Next.js 16 + TypeScript app backed by SQLite + Prisma, no external services.

### 00:30 — Fetch real CelesTrak data (30 s)
Click `FETCH REAL CELESTRAK` on the Dashboard. Explain that this calls `POST /api/orbits/refresh` with `groups: ['stations', 'active']` (`API.md`), which routes through the `z-ai-web-dev-sdk` `page_reader` proxy (with the `%3F` / `%26` URL-encoding workaround documented in `CELESTRAK_INTEGRATION.md`), parses the JSON out of the `<pre>` wrapper, normalizes UPPER_SNAKE to camelCase, upserts every satellite by NORAD catalog ID, and writes a `CatalogSnapshot` + `DataRefreshLog` for provenance.

Watch the badge transition `DEMO` → `CACHED` → `LIVE` (green). The `Total Satellites` KPI jumps from a handful to several thousand.

### 01:00 — Run screening (30 s)
Click the `Conjunctions` tab. In the filter bar, set the primary filter to `25544` (ISS) — or just click `Run 7-day screening` on the ISS satellite card in the Catalog view. Explain the 8-stage pipeline (`CONJUNCTION_DETECTION.md`): altitude pre-filter → coarse 60 s @ 600 km threshold → local minimum detection → fine 1 s sweep → analytical TCA refinement (`TCA_ALGORITHM.md`) → relative state → threshold check + Conjunction row creation.

The `ConjunctionsTable` populates with rows. Click the row with the highest risk score (red badge).

### 01:30 — Open a conjunction event (30 s)
The `ConjunctionDetail` overlay opens (`FRONTEND.md`). Point at the header: primary name, secondary name, TCA timestamp, risk + confidence badges. Briefly read out the four numbers: miss distance, relative velocity, data age, risk score.

### 02:00 — Explain risk / confidence + disclaimer (30 s)
Scroll to the `Risk Explanation` section. Walk the evaluator through the 5-factor breakdown (`RISK_MODEL.md`): miss distance (weight 0.40), uncertainty (0.20), relative velocity (0.15), geometry (0.15), freshness (0.10). Read the disclaimer aloud: **"This is NOT a probability of collision."** Explain why — true Pc requires covariance, public GP doesn't carry it (`LIMITATIONS.md` §2).

Then point at the `Confidence` badge (`CONFIDENCE_MODEL.md`): "If risk answers *'how concerning is this?'*, confidence answers *'how much do we trust the risk score?'* — they are deliberately separate axes." Walk through the penalty schedule: age, source, format, covariance, propagation, metadata.

### 02:30 — 3D encounter (30 s)
Scroll back up to the orbit visualizer canvas. Explain that it renders both satellites' propagated trajectories in TEME (the SGP4 output frame, `SGP4.md`) over the TCA window, with a highlighted TCA marker. The Recharts chart below shows `d(t)` over the same window, with the refined TCA marked. Use the camera dial to tilt the view.

### 03:00 — Maneuver what-if simulator (30 s)
Scroll to the `Maneuver Panel`. Click `Run Maneuver Simulation`. Explain (`MANEUVER_SIMULATION.md`): hypothetical burns at 72/48/36/24/12/6 h before TCA, in Radial/Along-track/Cross-track directions, default ΔV 0.05 m/s. For each scenario: SGP4 propagate to burn time, apply ΔV in RIC, convert back to classical elements via `cartesianToClassical`, re-screen against the original secondary AND the entire catalog.

The scenario table populates. Point at the row marked ★ — that's the "best scenario" by the rule in `MANEUVER_SIMULATION.md` §"Scenario Comparison".

### 03:30 — Post-maneuver re-screening (30 s)
Expand the ★ scenario row. Explain that the re-screen is the critical step most simple conjunction tools skip: avoiding one conjunction can create another. Point at the `new_conjunctions` list — any new CRITICAL flagged there means the burn shifted phasing against a third object and a new close approach was introduced. If the list is empty, the burn is "safe" against the catalog.

### 04:00 — SOCRATES comparison (30 s)
Scroll to the `SOCRATES Comparison` section. Click `Compare with SOCRATES`. Explain (`SOCRATES_VALIDATION.md`): the same primary/secondary pair is looked up in the public CelesTrak SOCRATES reference (https://celestrak.org/SOCRATES/) — an independent implementation of the same SGP4 + GP pipeline. The result table shows `SENTINEL` vs `SOCRATES` TCA / range / rel-vel with errors in minutes and km.

State explicitly: SOCRTAES is a **reference, not ground truth** (`LIMITATIONS.md` §8). Agreement between SENTINEL and SOCRATES proves the pipelines don't share a gross bug; it doesn't prove either is correct.

### 04:30 — Export report (15 s)
At the top of the overlay, click `Export Report` → `Export CDM`. A `.cdm` file downloads. Open it in a text editor (or show the inline preview). Point out:
- The `RISK_SCORE_NOTE = "heuristic NOT probability of collision"` field (`CDM.md`).
- The `COVARIANCE = UNAVAILABLE` field — public GP lacks covariance.
- The `PROPAGATOR = SGP4-1.0.10-WGS84-TEME` and `DATA_SOURCE = CELESTRAK GP/OMM JSON` and `SNAPSHOT_ID` — full provenance in the message itself.

### 04:45 — Provenance (15 s)
Close the overlay and return to the Dashboard. Open the `How do we know this is real?` panel. Read out:
- The source URL: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- The fetch timestamp (live from the `CatalogSnapshot` row).
- The raw hash (SHA-256 of the canonical JSON).
- The propagator: SGP4 v1.0.10, WGS84, TEME.
- The snapshot ID linking to the database row.

This is the transparency surface — every claim SENTINEL makes about a conjunction is traceable back to a public CelesTrak fetch.

### 05:00 — Done
Wrap up: *"SENTINEL makes the first layer of conjunction awareness accessible — fetch, screen, explain, simulate, validate, export — all from one Next.js instance, on a SQLite database, with full provenance to the public CelesTrak source. It is not professional SSA, it is not a probability of collision, it cannot authorize maneuvers, but it lowers the barrier to entry for conjunction awareness from a $50,000 invoice to a single click."*

## Backup Material

- If the live fetch fails (network blip, SDK quota), click `POST /api/demo/seed` (`API.md`) and walk through the same flow with the demo catalog. The `DEMO` badges on every satellite card and conjunction row make it visually obvious that the data is synthetic (`FRONTEND.md`).
- If the AI assistant is available, click it and ask *"Should I execute this burn?"* to demonstrate the hard-rule refusal (`AI_ASSISTANT.md`).
- If `bun run lint` is needed for the evaluator, run it live — passes clean.

## Reference URLs

- CelesTrak GP/OMM API: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CelesTrak SOCRATES (validation reference): https://celestrak.org/SOCRATES/
- NASA CARA (methodology context): https://www.nasa.gov/cara/
- CCSDS 508.0-B-1 CDM standard: https://ccsds.org/searchpubs/
