# Prediction Validation

> **How SENTINEL defends a predicted close approach: the three-engine
> comparison, the seven-item PROVE THIS PREDICTION checklist, and the
> close-approach-vs-collision distinction that operators must understand
> before acting on a Pc.**

A conjunction screening is only useful if an operator can trust it. SENTINEL
therefore refuses to present a single number as "the truth." Every predicted
close approach is exposed as a **three-way comparison** — SENTINEL SGP4 vs
STK Advanced CAT vs CelesTrak SOCRATES — and the simulation view surfaces a
PROVE THIS PREDICTION panel that itemizes exactly what was real, what was
propagated, and what was *not* computed (notably: collision probability when
covariance is unavailable).

---

## 1. The Three-Way Engine Comparison

The `GET /api/simulation/[id]/comparison` route returns a structure built by
`getEngineComparison()` in the orchestrator:

```ts
{
  sentinel:  { tca, minimumRangeKm, relativeVelocityKmPerSec },   // from the Conjunction row (SGP4 screen)
  stk:       { tca, minimumRangeKm, relativeVelocityKmPerSec } | null,  // from the SimulationRun (STK or fallback)
  socrates:  { tca, minimumRangeKm, relativeVelocityKmPerSec } | null, // from the SOCRATES cross-reference
  tcaDifferenceSec:  number | null,   // |sentinel.tca - stk.tca|
  rangeDifferenceKm: number | null,   // |sentinel.minRange - stk.minRange|
}
```

| Engine | Where the number comes from | Trust level |
|--------|------------------------------|-------------|
| **SENTINEL SGP4** | Our own `screen()` over CelesTrak GP data (sgp4 npm@1.0.10, WGS84, TEME). Open algorithm, open data, reproducible. | Open / auditable |
| **STK Advanced CAT** | Ansys STK's professional CAT (when licensed and installed). Industry standard. | Professional / auditable |
| **CelesTrak SOCRATES** | The published weekly SOCRATES (Satellite Orbital Conjunction Reports Assessing Threatening Encounters on Space) list from CelesTrak. External reference. | External reference |

### Why no single result is "ground truth"

None of these three is a measurement. All three are *predictions* from
different propagators applied to the *same* public GP data. The actual
satellite position at TCA is only known to the satellite owner (and to CSpOC
through their internal high-accuracy catalog). The honest framing is:

- If all three engines agree to within a few seconds on TCA and a few
  hundred meters on minimum range, the conjunction is **robust** — the
  prediction does not depend on a quirk of one propagator.
- If they diverge, the divergence itself is the most important piece of
  information: it quantifies the *epistemic uncertainty* that no single
  engine could surface alone.

---

## 2. Why Engines Differ

Even when two engines consume the *same* TLE/OMM elements, their TCA and
minimum range can differ. The common causes:

| Source of divergence | Explanation |
|----------------------|-------------|
| **SGP4 model differences** | The "Revisiting Spacetrack Report #3" SGP4 has multiple operational modes (`a` = AFSPC, `i` = improved) and two constants sets (WGS84 / WGS72). Different libraries pick different defaults. SENTINEL uses AFSPC + WGS84 to match CelesTrak's public GP. STK may use SGP4-XL or a numerically integrated special-perturbations propagator. |
| **Epoch handling** | SGP4 measures time as minutes-since-epoch (`m = (jdsatepoch_current - jdsatepoch_epoch) × 1440`). Sub-second epoch round-tripping in TLEs (and in JSON OMM) introduces small drifts. STK and the `sgp4` npm package round differently. |
| **Frame differences** | SGP4 returns position/velocity in the **TEME** (True Equator Mean Equinox) frame, *not* J2000 ECI. For *relative* conjunction metrics (range, relative velocity) this cancels — both objects are in the same frame. But if one engine converts to ECI/ECEF before differencing and the other does not, a small rotation error enters the range. SENTINEL differencing happens in TEME directly. |
| **Atmospheric model** | B* (the drag term) is modeled as a constant in SGP4. Real drag varies with solar flux. STK's special-perturbations engine can use a Jacchia-Bowman atmosphere; SENTINEL cannot, so long-arc predictions diverge more than short ones. |
| **Tesseral/sectoral harmonics** | SGP4 lumps these into secular corrections. Numerical integrators apply the full geopotential. For objects below ~600 km the difference is meters-to-kilometers over a day. |
| **Threshold and step** | SENTINEL's fast screen uses a coarse step then refines around the candidate. STK's CAT uses its own step. The reported TCA is the minimum of whichever grid was used. |

The comparison table is not a contest to see who is "right" — it is a
confidence interval. A `tcaDifferenceSec` of < 60 s and a
`rangeDifferenceKm` of < 1 km between SENTINEL and STK is the normal case
and is the basis for the green check in the PROVE THIS PREDICTION panel.

---

## 3. The "PROVE THIS PREDICTION" Panel

The SimulationView renders a PROVE THIS PREDICTION card
(`src/components/simulation/simulation-view.tsx`) listing seven verification
items. Each item is a check the user can independently verify by looking at
the underlying data — not a marketing claim.

```text
┌──────────────────────────────────────────────────────────┐
│  PROVE THIS PREDICTION                                   │
│                                                          │
│  ✓ Real CelesTrak data                                   │
│  ✓ Real catalog IDs (no truncation)                      │
│  ✓ Real SGP4 propagation                                 │
│  ✓ Trajectory from actual state vectors                  │
│  ✓ Engine comparison (SENTINEL vs STK vs SOCRATES)       │
│  ✓ Provenance recorded                                   │
│  ⚠ STK unavailable (SGP4 fallback used)                   │
│    (or ✓ STK Advanced CAT executed, when STK ran)        │
└──────────────────────────────────────────────────────────┘
```

The seven items and what each one proves:

| # | Item | What it attests |
|---|------|-----------------|
| 1 | **Real CelesTrak data** | The orbital elements came from `celestrak.org` via the `z-ai-web-dev-sdk` `page_reader` proxy with URL-encoded queries — not a synthetic demo set. The `Satellite.source` field is `'CelesTrak'` and the `retrievedAt` timestamp is set. |
| 2 | **Real catalog IDs (no truncation)** | Catalog IDs are stored and propagated as `String` throughout (Prisma schema, `OrbitalObject.catalogId`, `StkSecondaryCandidate.catalogId`). 6+ digit IDs (e.g. NORAD 48078, a Starlink) survive unchanged — no 5-digit integer truncation. |
| 3 | **Real SGP4 propagation** | The TCA / min range / rel velocity are computed by the `sgp4` npm@1.0.10 package (a port of python-sgp4, which implements the official Vallado et al. "Revisiting Spacetrack Report #3" algorithm). Not a Keplerian approximation. |
| 4 | **Trajectory from actual state vectors** | Every point on the 3D track and the separation-vs-time chart is a real propagated `{ x, y, z, vx, vy, vz }` at that instant — 121 state vectors per object by default (±1 h around TCA, 60 s step). Not keyframed animation. |
| 5 | **Engine comparison (SENTINEL vs STK vs SOCRATES)** | The `EngineComparison` row exists in the DB and is rendered in the ENGINE COMPARISON table. The user can see all three numbers, not just ours. |
| 6 | **Provenance recorded** | The `SimulationRun` row carries `stkScenarioId`, `stkAnalysisId`, `stkThreshold`, `stkResultTimestamp`, and `stkRawReportHash` — enough to defend the result later. |
| 7 | **STK Advanced CAT executed** (green) **or** **STK unavailable (SGP4 fallback used)** (amber) | Honest engine disclosure. If STK ran, this is green; if the fallback ran, this is amber and the `engine` field reads `'SENTINEL SGP4 (fallback)'`. |

Item 7 is the keystone of the whole panel: it is the one that prevents
SENTINEL from ever passing off its SGP4 result as an STK result.

---

## 4. Close Approach vs Collision — the Critical Distinction

A predicted close approach is **not** a predicted collision. The conjunction
screening returns a **minimum range** — the distance between the two nominal
(zero-uncertainty) trajectories at TCA. But both objects have an uncertainty
ellipsoid around them, and a small minimum range with a large combined
uncertainty may still be safe, while a larger minimum range with a tight
uncertainty may be dangerous.

This is why the SimulationView's **COLLISION PROBABILITY** panel shows
`UNAVAILABLE` whenever `StkConjunctionResult.collisionProbabilityAvailable`
is `false`:

```text
┌──────────────────────────────────────────┐
│  COLLISION PROBABILITY                  │
│                                         │
│            UNAVAILABLE                  │
│                                         │
│  ⚠ Trajectory uncertainty not available │
│    from current public GP data.         │
└──────────────────────────────────────────┘
```

### Why covariance is required for a real Pc

A probability of collision (Pc) is the integral of the combined position
covariance over the conjoint hard-body area. Without the covariance matrix
— the 6×6 (or 3×3 reduced) uncertainty ellipsoid for each object — there is
nothing to integrate. Public GP/TLE data from CelesTrak contains **no
covariance information**; only the mean Keplerian elements and B*. Therefore:

- SENTINEL cannot honestly compute a Pc from public GP data alone.
- STK Advanced CAT can compute a Pc **only when the operator supplies
  covariance** (e.g. from a CDM, owner-operator ephemeris, or a
  special-perturbations run that estimated covariance). Without covariance
  input, STK also reports no Pc.

This is not a SENTINEL limitation — it is the physics. NASA's Conjunction
Assessment Risk Analysis (CARA) program, the U.S. standard for human
spaceflight conjunction assessment, states this explicitly in their
"Step 2: Close Approach Risk Assessment" documentation:

> **NASA CARA — Step 2: Close Approach Risk Assessment**
> https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/

CARA's process computes Pc only from a **covariance-containing** conjunction
data message (CDM); without covariance, the assessment stops at the
close-approach screening step and no Pc is reported. SENTINEL follows the
same convention: the COLLISION PROBABILITY panel is `UNAVAILABLE` by
default, and is only populated when `StkConjunctionResult.collisionProbability`
is a real number (which requires covariance input that SENTINEL does not
manufacture).

---

## 5. What This Means for the Operator

1. **Trust the conjunction, not the collision.** A close approach with a
   small minimum range is a real event worth investigating, even without a
   Pc. The PROVE THIS PREDICTION panel lets you confirm the event was built
   from real data and real propagation.
2. **Cross-check the engines.** If SENTINEL, STK, and SOCRATES all agree,
   the prediction is robust. If they disagree, the disagreement is itself the
   headline — act with the larger of the uncertainties in mind.
3. **Demand covariance for Pc.** If a number in the COLLISION PROBABILITY
   panel is reported, ask where the covariance came from. SENTINEL shows
   `UNAVAILABLE` rather than fabricate a Pc from a point-mass approximation
   — that is the correct, defensible behavior.

For a side-by-side feature comparison of SENTINEL and STK, see
`docs/STK_VS_SGP4.md`. For the full evaluator demo that walks through the
PROVE THIS PREDICTION panel live, see `docs/STK_DEMO.md`.
