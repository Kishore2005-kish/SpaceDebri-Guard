# STK Integration

> **How SENTINEL connects to Ansys Systems Tool Kit (STK) for professional-grade
> conjunction analysis — and what happens when STK is not installed.**

---

## ⚠ Proprietary Software Disclaimer

**STK (Ansys Systems Tool Kit) is proprietary commercial software owned and
licensed by Ansys, Inc. (formerly Analytical Graphics, Inc. / AGI).** STK is
*not* free, *not* open source, and *not* bundled with SENTINEL. A valid
commercial STK license is required for any part of the integration described in
this document to execute against a real STK instance. SENTINEL ships only the
*adapter code* (in `src/lib/stk/`) that knows how to talk to STK over its
documented Connect command protocol; the STK application itself must be
installed, licensed, and running separately. When STK is not available,
SENTINEL automatically falls back to its own SGP4 simulation, which is
**clearly labeled "SENTINEL SGP4 (fallback)" — never "STK"** — in every UI
surface, database field, and API response.

Official STK documentation:
- STK Connect command reference — https://help.agi.com/stk/Subsystems/connect/Content/start.htm
- STK Advanced CAT (Conjunction Analysis Tools) — https://help.agi.com/stk/Content/cat/Cat03.htm
- Collision-threat tutorial (Advanced CAT) — https://help.agi.com/stk/Content/training/AdvCatTool.htm
- STK Python API introduction — https://help.agi.com/stkdevkit/Content/python/pythonIntro.htm

---

## 1. Why STK?

SENTINEL's job is to give satellite operators a fast, explainable view of
conjunction risk using public CelesTrak data and the open SGP4 propagator.
SGP4 is excellent for screening — it is what the U.S. Space Force uses to
publish GP (General Perturbations) data, and it is fast enough to screen
thousands of objects in seconds. But SGP4 has limits: it ignores covariance
(the uncertainty ellipsoid around each object), it cannot natively compute
collision probability, and it is not the system that professional operators
use for a final go/no-go decision.

STK closes that gap. STK's **Advanced CAT (Conjunction Analysis Tools)** is
the industry-standard professional conjunction engine. It performs
high-fidelity close-approach screening, supports covariance-based collision
probability (when covariance data is supplied), and produces auditable reports
that match what operators receive from the U.S. 18 SDS / CSpOC and from
commercial SSA providers. SENTINEL therefore integrates with STK so that an
operator who already has STK licensed can move seamlessly from SENTINEL's
fast screening to STK's professional analysis **without re-keying any data**.

### What STK does
- High-fidelity propagation (SGP4, SGP4-XL, special perturbations / numerical
  integration with force models).
- **Advanced CAT** — close-approach screening of one primary against a set of
  secondary objects, returning TCA, minimum range, relative velocity, and
  optionally covariance-based probability of collision (Pc).
- Native 3D globe visualization with close-approach vectors and miss-distance
  graphics.
- Auditable, reportable outputs suitable for an operator's safety-of-flight
  review.

### What SENTINEL does
- Ingests **real CelesTrak** OMM/GP data via the `z-ai-web-dev-sdk`
  `page_reader` proxy (URL-encoded queries, no API key, no scraping).
- Stores catalog objects and conjunctions in a local Prisma/SQLite database.
- Runs **fast SGP4 screening** (sgp4 npm@1.0.10, WGS84, TEME frame) to find
  candidate conjunctions.
- Presents a **operator dashboard** with explainable risk, AI assistant,
  provenance, and a 3D simulation view.
- When STK is installed: hands the candidate conjunction to STK Advanced CAT,
  retrieves the professional result, and displays it side-by-side with
  SENTINEL's own SGP4 result and any available SOCRATES reference.

---

## 2. End-to-End Data Flow

```
   CelesTrak (public GP/OMM data)
            │
            ▼  page_reader proxy (z-ai-web-dev-sdk)
   SENTINEL DB (Prisma/SQLite)
            │
            ▼  SGP4 fast screening  (src/lib/orbital/conjunction.ts)
   Candidate conjunctions  (TCA, min range, rel velocity)
            │
            ├──► STK scenario  (when STK is available)
            │       │
            │       ▼  New / Scenario / SENTINEL_<id>
            │       ▼  SetState * Satellite/<name> J2000 ... TLE <l1> <l2>
            │       ▼  CAT * /Scenario/<scn>/Satellite/<primary> AdvCat
            │       ▼  AdvCatRun * /Scenario/<scn>/Satellite/<primary>/AdvCat
            │       ▼  Report * .../AdvCat Type Conjunction
            │       ▼  Report * Satellite/<name> Type Ephemeris
            │       │
            │       ▼  TCA, min range, rel vel, trajectory, (optional Pc)
            │
            └──► SGP4 fallback  (when STK is NOT available)
                    │  (src/lib/stk/fallback.ts — same interface)
                    ▼  labeled "SENTINEL SGP4 (fallback)"
            │
            ▼
   SimulationRun (Prisma)  — full provenance captured
            │
            ▼
   SimulationView UI  — 3D canvas + separation chart
                    + ENGINE COMPARISON (SENTINEL vs STK vs SOCRATES)
                    + COLLISION PROBABILITY panel
                    + PROVE THIS PREDICTION panel
```

Every arrow is implemented in code that ships in this repository. The STK
arrows are **real production code** (not mocks): `src/lib/stk/client.ts` opens
a TCP socket to `127.0.0.1:5001` and sends ASCII Connect commands; if nothing
is listening, the call rejects and the orchestrator routes to `fallback.ts`.

---

## 3. How STK Is Automated — the Connect Command Protocol

STK exposes a **Connect command interface**: a TCP socket (default
`localhost:5001`) that accepts ASCII commands terminated by `\n` and returns
ASCII responses (`ACK` on success, `ERROR: <msg>` on failure, or multi-line
data for `Report` commands). The full reference is at
https://help.agi.com/stk/Subsystems/connect/Content/start.htm.

SENTINEL's adapter (`src/lib/stk/client.ts`) opens a `net.Socket` to that port,
writes the command, and parses the response. The high-level service
(`src/lib/stk/service.ts`) walks the entire scenario lifecycle:

| Step | Connect command | Purpose |
|------|-----------------|---------|
| 1 | `New / */Scenario/SENTINEL_<id>` | Create a new scenario |
| 2 | `SetTimePeriod * "<start>" "<end>"` | Set the analysis interval (STK date format: `DD Mon YYYY HH:MM:SS.SSS`) |
| 3 | `New / */Scenario/<scn>/Satellite/<name>` | Create the primary satellite object |
| 4 | `SetState * Satellite/<name> J2000 "<epoch>" TLE "<l1>" "<l2>"` | Load its state from a two-line element set |
| 5 | `CAT * /Scenario/<scn>/Satellite/<primary> AdvCat` | Create the Advanced CAT object |
| 6 | `Conjunction * ... AdvCat Threshold <km>` | Set the miss-distance threshold |
| 7 | `AdvCatRun * /Scenario/<scn>/Satellite/<primary>/AdvCat` | Run the analysis (timeout up to 5 min) |
| 8 | `Report * .../AdvCat Type Conjunction` | Extract the conjunction result |
| 9 | `Report * Satellite/<name> Type Ephemeris` | Extract the trajectory for 3D viz |
| 10 | `Unload / */Scenario/<scn>` | Close (unload) the scenario |

Every command in the table above is the *actual* Connect command string issued
by the adapter. The TLE lines are reconstructed from the stored OMM elements by
`ommToTle()` (`src/lib/orbital/tle.ts`) so that 6+ digit catalog IDs are not
truncated.

---

## 4. How Conjunctions Are Calculated in STK — Advanced CAT

**Advanced CAT (Conjunction Analysis Tools)** is STK's purpose-built
close-approach engine. The official documentation lives at
https://help.agi.com/stk/Content/cat/Cat03.htm and the operator tutorial at
https://help.agi.com/stk/Content/training/AdvCatTool.htm.

Given a primary satellite and a set of secondary objects, Advanced CAT:

1. Propagates each object across the analysis interval using the configured
   propagator (default SGP4 for TLE-driven objects; SGP4-XL or special
   perturbations if licensed and configured).
2. At each time step computes the relative position vector between the primary
   and each secondary.
3. Finds the **Time of Closest Approach (TCA)** — the instant of minimum
   3-D range — and records the minimum range and relative velocity at that
   instant.
4. Optionally, when covariance data is supplied, integrates the combined
   position covariance ellipsoid and computes a **probability of collision
   (Pc)** per the standard Akella–Alfriend / Foster formulas.
5. Emits a structured conjunction report and a close-approach report.

SENTINEL retrieves both reports via the `Report` Connect command, parses them
(`src/lib/stk/parser.ts`), and stores the raw text + a hash in the
`SimulationRun` row for provenance.

---

## 5. How Results Are Returned

After `AdvCatRun` completes, the orchestrator extracts:

- **TCA** — ISO 8601 UTC string of the time of closest approach.
- **Minimum range (km)** — the 3-D miss distance at TCA.
- **Relative velocity (km/s)** — the magnitude of the relative velocity vector
  at TCA.
- **Trajectory** — a sequence of `{ t, x, y, z, vx, vy, vz }` state vectors in
  km / km/s (TEME frame for SGP4 objects) for both the primary and the
  secondary, sampled at the configured step (default 60 s).
- **Separation series** — `{ t, range }` pairs sampled across the same window,
  used to drive the separation-vs-time chart.
- **Provenance** — `stkVersion`, `stkScenarioId`, `stkAnalysisId`,
  `stkThreshold`, `stkResultTimestamp`, and `stkRawReportHash` (a stable hash
  of the raw STK report text, computed by `hashRawReport()`).

All of these are serialized into `SimulationRun.resultJson` and surfaced by
`GET /api/simulation/[id]`, `GET /api/simulation/[id]/trajectory`, and
`GET /api/simulation/[id]/comparison`.

---

## 6. What Happens Without STK — the SGP4 Fallback

The moment `checkStkAvailable()` (in `src/lib/stk/client.ts`) reports that the
Connect port is not open, the orchestrator branches to
`runSgp4Fallback()` in `src/lib/stk/fallback.ts`. The fallback implements the
*exact same* `StkConjunctionResult` interface, so the UI, the API routes, and
the simulation orchestrator are unchanged — only the `engine` field differs.

The fallback:

1. Re-runs the SGP4 screening between the primary and the secondary using the
   same `screen()` function used for fast screening
   (`src/lib/orbital/conjunction.ts`), producing TCA, minimum range, and
   relative velocity.
2. Generates ±1 hour of trajectory around TCA at the configured step (default
   60 s → 121 state vectors per object).
3. Builds a separation series by differencing the two trajectories at each
   step.
4. Returns a result with `engine: 'SENTINEL SGP4 (fallback)'`,
   `engineVersion: 'sgp4 npm@1.0.10 (python-sgp4 port; WGS84)'`, a
   `fallbackReason` string explaining *why* STK wasn't used, and
   `covarianceAvailable: false` / `collisionProbabilityAvailable: false`.

### Critical labeling rule

> The fallback result is **always labeled "SENTINEL SGP4 (fallback)"** — in the
> `SimulationRun.engine` column, in the `StkConjunctionResult.engine` field, in
> the SimulationView's "SIMULATION ENGINE" badge, and in the engine-comparison
> table. It is **never** presented as "STK". The UI surfaces a separate,
> amber-colored "STK unavailable (SGP4 fallback used)" row in the
> PROVE THIS PREDICTION panel whenever the fallback was used. This is a hard
> rule: SENTINEL never pretends its SGP4 result is an STK result.

---

## 7. Reference: Source Files

| File | Role |
|------|------|
| `src/lib/stk/types.ts` | TypeScript interfaces (`StkStatus`, `StkConjunctionResult`, `SimulationRun`, `SimulationStatus`, `TrajectoryPoint`) |
| `src/lib/stk/client.ts` | TCP socket client for the Connect command protocol |
| `src/lib/stk/service.ts` | High-level scenario lifecycle (create → set interval → add satellites → create CAT → run → extract → close) |
| `src/lib/stk/parser.ts` | `parseCatReport`, `parseTrajectoryReport`, `hashRawReport`, ACK/ERROR detection |
| `src/lib/stk/fallback.ts` | SGP4-based fallback implementing the same `StkConjunctionResult` interface |
| `src/lib/stk/index.ts` | Public barrel export |
| `src/lib/simulation/orchestrator.ts` | Decides STK vs SGP4, runs the async job, persists `SimulationRun` |
| `src/app/api/simulation/stk/status/route.ts` | `GET` — STK availability (cached 30 s) |
| `src/app/api/simulation/stk/run/route.ts` | `POST` — start a simulation, returns `simulationId` immediately |
| `src/app/api/simulation/stk/[id]/route.ts` | `GET` — poll a simulation's status/result |
| `src/app/api/simulation/[id]/trajectory/route.ts` | `GET` — propagated state vectors for the 3D view |
| `src/app/api/simulation/[id]/comparison/route.ts` | `GET` — SENTINEL vs STK vs SOCRATES comparison |

See `docs/STK_SETUP.md` for the full installation/licensing procedure, and
`docs/SIMULATION_ENGINE.md` for the orchestrator and background-job pattern.
