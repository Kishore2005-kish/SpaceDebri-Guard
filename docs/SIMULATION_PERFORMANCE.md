# Simulation Performance

The full catalog screened at 1-second resolution against a 7-day window would require on the order of 10⁹ propagations — an impractical workload for an interactive tool. SENTINEL avoids this by screening hierarchically: cheap filters discard the vast majority of objects before any expensive propagation runs.

## Hierarchical Pipeline

| Stage | Input | Output | Notes |
|---|---|---|---|
| Catalog fetch | ~12,000 GP objects | ~12,000 records | CelesTrak snapshot. |
| Cheap filters | 12,000 | ~5,000 | Discard non-physical candidates (e.g. regimes that cannot intersect the primary's orbit). |
| Altitude filter | 5,000 | ~1,000 | Apoapsis/periapsis overlap test against the primary. |
| Coarse SGP4 sweep | 1,000 | ~50 candidates | 60–300 s time step, `sgp4@1.0.10`, WGS-84, TEME frame. |
| Candidate detection | 50 | ~5 conjunctions | Threshold crossing detection on the coarse relative-distance curve. |
| Fine propagation | 5 | 5 refined TCAs | 1–10 s step, parabolic interpolation around the minimum. |
| STK analysis | 5 | 5 high-fidelity results | Invoked only for the candidates above, not the whole catalog. |

The funnel reduces work by roughly four orders of magnitude before any expensive numerical integrator is engaged.

## Background Job Pattern

`POST /api/analysis` returns an `analysisId` in **<1 second**. The screening itself runs on a background worker. The frontend polls `GET /api/analysis/{id}` to read the current stage and percentage, and `DELETE /api/analysis/{id}` cancels the run.

## Progress Stages

```
QUEUED → LOADING_DATA → FILTERING → COARSE_SCREEN → FINE_SCREEN →
TCA_REFINEMENT → STK_ANALYSIS → RISK_ASSESSMENT → VALIDATION → COMPLETE
```

Each stage reports a `progress` value in the range 0–100 so the UI can render a deterministic progress bar rather than an indeterminate spinner.

## Dashboard Load

The dashboard view is designed to render in **<1 second**. On mount it issues `GET /api/conjunctions`, which reads previously-computed conjunctions straight from the SQLite database. The dashboard **does not** auto-trigger a new screen — that is an explicit user action via the *Run analysis* button, which calls `POST /api/analysis`. This separation keeps page loads snappy and prevents the server from being coerced into a multi-minute computation by a single page view.

## Cancellation

`DELETE /api/analysis/{id}` flips the run's status to `CANCELLED`, interrupts the current stage, and short-circuits any further propagation. In-flight conjunctions that were already written to the database are preserved so a partial result can be inspected if desired.
