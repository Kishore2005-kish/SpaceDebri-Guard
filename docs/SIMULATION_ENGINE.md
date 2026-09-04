# Simulation Engine

> **The simulation orchestrator: how SENTINEL decides between STK and SGP4,
> runs the analysis as a background job, and serves the result to the 3D
> SimulationView.**

The orchestrator lives at
`src/lib/simulation/orchestrator.ts`. It is the single entry point for the
"RUN ORBITAL SIMULATION" button on the conjunction detail page and for the
maneuver-simulation endpoint. Its responsibilities are:

1. Decide whether to use **STK Advanced CAT** or the **SGP4 fallback**.
2. Run the chosen engine **asynchronously** (never block the HTTP request).
3. Persist a full provenance trail in the `SimulationRun` Prisma model.
4. Expose the result (status, trajectory, engine comparison) through a small
   set of REST routes.

---

## 1. The STK vs SGP4 Decision

The orchestrator begins every run by calling `getStkStatus()` (in
`src/lib/stk/service.ts`, which delegates to `checkStkAvailable()` in
`src/lib/stk/client.ts`). That function does a **TCP socket probe** to STK's
Connect command port (`127.0.0.1:5001`, 2 s timeout) and additionally tries
to `import agi.stk` via `python3 -c`. The result is cached for 30 s to avoid
hammering the port on every API call.

```text
                ┌─────────────────────────────┐
  startSimulation│  Build StkScenarioConfig      │
       │        │  from the conjunction row      │
       │        └─────────────┬───────────────────┘
       │                      │
       │                      ▼
       │        ┌─────────────────────────────┐
       │        │  Create SimulationRun        │
       │        │  status = QUEUED             │
       │        └─────────────┬───────────────────┘
       │                      │
       │                      ▼  (async; POST returns now)
       │        ┌─────────────────────────────┐
       │        │  getStkStatus()              │
       │        │  TCP probe 127.0.0.1:5001    │
       │        └─────┬───────────────────┬────┘
       │              │ available=true     │ available=false
       │              ▼                     ▼
       │   STK workflow (service.ts)    SGP4 fallback (fallback.ts)
       │   status: STARTING_STK         status: PROPAGATING
       │          LOADING_DATA                 COMPLETE
       │          RUNNING_CAT                  engine = "SENTINEL SGP4 (fallback)"
       │          EXTRACTING_RESULTS
       │          COMPLETE
       │          engine = "STK Advanced CAT"
       │              │                     │
       │              └─────────┬───────────┘
       │                        ▼
       │        ┌─────────────────────────────┐
       │        │  Persist SimulationRun      │
       │        │  (engine, engineVersion,    │
       │        │   resultJson, rawReport,    │
       │        │   stk* provenance fields)   │
       │        └─────────────────────────────┘
```

The branch is explicit in code:

```ts
const stkStatus = await getStkStatus();
if (!stkStatus.available) {
  const result = await runSgp4Fallback(config, stkStatus.reason ?? 'STK unavailable');
  // persist with engine = "SENTINEL SGP4 (fallback)"
} else {
  // real STK workflow: createScenario → setAnalysisInterval →
  // createSatelliteFromTle → createAdvancedCat → runAdvancedCat →
  // getConjunctionResults → getTrajectory → closeScenario
}
```

The fallback path is **never** labeled "STK". The `engine` field of the
result is the literal string `'SENTINEL SGP4 (fallback)'` and every UI
surface that reads `SimulationRun.engine` honors it.

---

## 2. Background-Job Pattern

STK Advanced CAT can take minutes for a large secondary set. SENTINEL cannot
hold an HTTP request open that long, so the orchestrator uses a fire-and-poll
pattern:

```http
POST /api/simulation/stk/run
Content-Type: application/json

{ "conjunctionId": "<uuid>" }

→ 200 OK
{ "simulationId": "<uuid>" }      # returns immediately
```

The `POST` handler (`src/app/api/simulation/stk/run/route.ts`) calls
`startSimulation(conjunctionId)`, which:

1. Validates the conjunction exists and loads its primary + secondary
   satellites.
2. Builds a `StkScenarioConfig` (scenario name
   `SENTINEL_<conjunctionId-suffix>`, analysis start/end from the conjunction
   screening window, threshold from the conjunction row, primary + one
   secondary).
3. Creates a `SimulationRun` row with `status = 'QUEUED'` and
   `engine = 'SENTINEL SGP4 (fallback)'` (updated to the real engine when the
   job completes).
4. Calls `runSimulationAsync(...)` **without awaiting** it — the function
   returns `{ simulationId }` to the caller immediately.
5. The async runner updates the row's `status` field as it progresses, so the
   frontend can poll:

```http
GET /api/simulation/stk/<id>

→ 200 OK
{
  "id": "<uuid>",
  "status": "RUNNING_CAT",
  "engine": "SENTINEL SGP4 (fallback)",   # or "STK Advanced CAT"
  "engineVersion": "...",
  "scenarioId": "SENTINEL_a1b2c3d4",
  ...
}
```

The SimulationView component polls this endpoint until `status === 'COMPLETE'`
or `status === 'FAILED'`, then fetches the trajectory.

---

## 3. Status Values

`SimulationStatus` is a discriminated union defined in
`src/lib/stk/types.ts`. The orchestrator writes exactly one of these values
into `SimulationRun.status` at each stage:

| Status | Meaning | Set by |
|--------|---------|--------|
| `QUEUED` | Row created; async runner not yet started | `startSimulation()` |
| `STARTING_STK` | About to probe the STK Connect port | async runner, first step |
| `LOADING_DATA` | STK scenario created, interval set, satellites being added | STK branch |
| `PROPAGATING` | SGP4 trajectory being generated | SGP4 fallback branch |
| `RUNNING_CAT` | `AdvCatRun` Connect command in flight (up to 5 min) | STK branch |
| `EXTRACTING_RESULTS` | `Report` Connect commands pulling CAT + ephemeris | STK branch |
| `COMPLETE` | Result written to `resultJson`; `completedAt` set | both branches |
| `FAILED` | Exception caught; message in `error`; `completedAt` set | `catch` block |
| `STK_UNAVAILABLE` | (Reserved) STK went down mid-run | — |

The SimulationView maps these to human-readable labels and progress hints
(`STK_UNAVAILABLE: 'STK unavailable — using SGP4 fallback'`).

---

## 4. The `SimulationRun` Prisma Model

Every simulation — STK or fallback — is persisted as a `SimulationRun` row.
The model captures both the **operational result** and the full
**provenance trail** needed to defend the prediction later:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | String (UUID) | Primary key, returned to the frontend as `simulationId` |
| `conjunctionId` | String | FK to the `Conjunction` that triggered the run |
| `engine` | String | `'SENTINEL SGP4 (fallback)'` or `'STK Advanced CAT'` — **never ambiguous** |
| `engineVersion` | String | e.g. `sgp4 npm@1.0.10 (...)` or STK's reported version |
| `status` | String | One of the `SimulationStatus` values above |
| `startedAt` | DateTime | When the row was created |
| `completedAt` | DateTime? | When `COMPLETE` / `FAILED` was written |
| `scenarioId` | String? | STK scenario name (`SENTINEL_<id>`) or fallback equivalent |
| `analysisStart` | String | ISO 8601 — start of the screening window |
| `analysisEnd` | String | ISO 8601 — end of the screening window |
| `thresholdKm` | Float | Miss-distance threshold used for CAT |
| `resultJson` | String? | Full `StkConjunctionResult` JSON (TCA, min range, rel vel, trajectories, separation series) |
| `rawReport` | String? | Raw STK `Report` text (or a note for the fallback) |
| `error` | String? | Exception message if `status = FAILED` |
| `stkVersion` | String? | STK's reported version (null for fallback) |
| `stkScenarioId` | String? | STK scenario path used (null for fallback) |
| `stkAnalysisId` | String? | UUID of the CAT analysis (null for fallback) |
| `stkThreshold` | Float? | Threshold value passed to STK (null for fallback) |
| `stkAnalysisStart` | String? | Analysis start echoed back by STK |
| `stkAnalysisEnd` | String? | Analysis end echoed back by STK |
| `stkResultTimestamp` | String? | When STK returned the result |
| `stkRawReportHash` | String? | Stable FNV-1a hash of the raw STK report text — tamper evidence |

> **Catalog IDs are stored as `String` everywhere** (in `Satellite.id`,
> `Conjunction.primarySatId` / `secondarySatId`, and the `StkSecondaryCandidate.catalogId`
> field). This avoids the historical 5-digit truncation that affected
> integer-typed catalog IDs — 6+ digit IDs (e.g. NORAD 48078) round-trip
> unchanged.

---

## 5. The Trajectory API

```
GET /api/simulation/[id]/trajectory
→ 200 OK
{
  "primaryTrajectory":   [ { t, x, y, z, vx, vy, vz }, ... ],
  "secondaryTrajectory":  [ { t, x, y, z, vx, vy, vz }, ... ],
  "separationSeries":    [ { t, range }, ... ],
  "tca":                 "2026-08-19T10:32:14.000Z",
  "minimumRangeKm":      0.421,
  "engine":              "SENTINEL SGP4 (fallback)"   // or "STK Advanced CAT"
}
```

Route handler: `src/app/api/simulation/[id]/trajectory/route.ts`. It calls
`getSimulationTrajectory()` in the orchestrator, which loads the
`SimulationRun.resultJson`, parses it back into a `StkConjunctionResult`, and
returns the trajectory + separation fields.

The trajectory is **121 propagated state vectors per object** by default:
the SGP4 fallback generates ±1 hour around TCA at a 60 s step
(`2 × 3600 / 60 + 1 = 121`). Each point is a real SGP4 propagation
(`propagateSgp4()` in `src/lib/orbital/sgp4.ts`, wrapping the
`sgp4` npm@1.0.10 package — WGS84 constants, TEME frame, AFSPC ops mode)
or, when STK ran, a real STK ephemeris report. The points are *not* an
arbitrary animation; every point corresponds to a physically propagated
state vector at that instant, which is exactly what the PROVE THIS
PREDICTION panel's "Trajectory from actual state vectors" item attests to.

The companion comparison route:

```
GET /api/simulation/[id]/comparison
→ { sentinel, stk, socrates, tcaDifferenceSec, rangeDifferenceKm }
```

returns the three-way table (SENTINEL vs STK vs SOCRATES) shown in the
SimulationView's ENGINE COMPARISON card. `socrates` is null when the
conjunction was not cross-referenced against a SOCRATES publication.

---

## 6. Putting It Together — the Async Runner

The full lifecycle of `runSimulationAsync()` (the un-awaited function):

```ts
async function runSimulationAsync(simulationId, conjunctionId, config) {
  const update = (status, extra) =>
    db.simulationRun.update({ where: { id: simulationId },
                              data: { status, ...extra } });

  try {
    await update('STARTING_STK');
    const stkStatus = await getStkStatus();

    if (!stkStatus.available) {
      // ── SGP4 fallback branch ─────────────────────────────────────
      await update('PROPAGATING');
      const result = await runSgp4Fallback(config, stkStatus.reason);
      await db.simulationRun.update({ where: { id: simulationId }, data: {
        status: 'COMPLETE',
        engine: result.engine,                       // 'SENTINEL SGP4 (fallback)'
        engineVersion: result.engineVersion,
        resultJson: JSON.stringify(result),
        rawReport: JSON.stringify({ note: 'SGP4 fallback — no raw STK report' }),
        stkVersion: result.stkVersion,               // null
        stkScenarioId: result.stkScenarioId,
        stkAnalysisId: result.stkAnalysisId,
        stkThreshold: result.thresholdKm,
        stkRawReportHash: result.stkRawReportHash,
        completedAt: new Date(),
      }});
      return;
    }

    // ── STK branch ─────────────────────────────────────────────────
    await update('LOADING_DATA');
    await createScenario(config.scenarioName);
    await setAnalysisInterval(config.scenarioName, config.analysisStart, config.analysisEnd);
    const primName = await createSatelliteFromTle(...);
    for (const sec of config.secondaries) await createSatelliteFromTle(...);

    await update('RUNNING_CAT');
    await createAdvancedCat(config.scenarioName, primName, config.thresholdKm);
    await runAdvancedCat(config.scenarioName, primName);          // up to 5 min

    await update('EXTRACTING_RESULTS');
    const catReport = await getConjunctionResults(...);
    const closeApproach = await getCloseApproachReport(...);
    const primaryTraj   = await getTrajectory(..., primName);
    const secondaryTraj = await getTrajectory(..., secName);

    // build StkConjunctionResult, persist with engine = 'STK Advanced CAT'
    await db.simulationRun.update({ ... });
    await closeScenario(config.scenarioName);   // Unload / */Scenario/<name>
  } catch (e) {
    await db.simulationRun.update({ where: { id: simulationId }, data: {
      status: 'FAILED', error: e.message, completedAt: new Date(),
    }});
  }
}
```

This is the entire "professional path" — every Connect command is a real
production call, and the fallback path is a drop-in replacement that keeps
the UI honest about which engine actually ran.

See `docs/STK_INTEGRATION.md` for the Connect command reference and
`docs/PREDICTION_VALIDATION.md` for how the result is validated against
SOCRATES and against the close-approach-vs-collision distinction.
