# Analysis Configuration

This document describes how to configure a SENTINEL conjunction-screening run. Every parameter below is exposed through the `POST /api/analysis` endpoint and influences the trade-off between speed, fidelity, and the scientific certainty of the result.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `primary` | string (NORAD ID) | The protected object. Defaults to `25544` (ISS), which is flagged as a protected asset in the catalog. |
| `dataSource` | enum | `CELESTRAK` (real GP/TLE data, recommended) or `DEMO` (synthetic fixtures). |
| `timeWindowHours` | number | Prediction horizon. Used to bound the propagation start/stop times. |
| `thresholdKm` | number | Miss-distance screening threshold. Any conjunction whose minimum range is below this value is reported as a candidate. |
| `coarseStepSec` | number | Time step used during the coarse SGP4 sweep (e.g. 60–600 s). Larger steps are faster but can miss narrow encounter peaks. |
| `fineStepSec` | number | Time step used during the fine-sweep / TCA-refinement phase (e.g. 1–10 s). |
| `objectTypes` | string[] | Catalog filter (e.g. `PAYLOAD`, `ROCKET_BODY`, `DEBRIS`, `UNKNOWN`). Limits which secondary objects are screened. |
| `engine` | enum | `SGP4` (analytical, `sgp4@1.0.10`, WGS-84, TEME frame) or `STK` (high-precision numerical, only invoked for candidates). |
| `riskWeights` | object | Optional override of the five-factor heuristic weights: `distance` (40%), `uncertainty` (20%), `velocity` (15%), `geometry` (15%), `freshness` (10%). The five values must sum to 1.0. |
| `collisionAssessmentMode` | enum | `UNAVAILABLE` (default — public GP data has no covariance, so Pc cannot be computed) or `COVARIANCE` (requires a provider that ships covariance matrices). |
| `hardBodyRadiusKm` | number | Combined hard-body radius used by the Foster/Akasofu–Rhoades Pc estimator when covariance is supplied. |

## Presets

| Preset | Window | Threshold | Coarse step | Fine step | Engine |
|---|---|---|---|---|---|
| `QUICK` | 24 h | 10 km | 300 s | 10 s | SGP4 |
| `STANDARD` | 7 d | 5 km | 120 s | 5 s | SGP4 |
| `HIGH_PRECISION` | 7 d | 5 km | 60 s | 1 s | STK (candidates only) |
| `CUSTOM` | user | user | user | user | user |

`HIGH_PRECISION` does **not** propagate the entire catalog through STK — STK is only engaged for the handful of candidates that survive the SGP4 coarse/fine sweep, so the run completes in minutes rather than hours.

## API

Submit a run with:

```
POST /api/analysis
Content-Type: application/json

{
  "preset": "STANDARD",
  "config": { "primary": "25544", "thresholdKm": 5 }
}
```

The endpoint returns an `analysisId` **immediately (<1 s)** and then runs the screening asynchronously. Poll status with:

```
GET /api/analysis/{id}
```

Cancel a running job with:

```
DELETE /api/analysis/{id}
```

## Caching

Identical runs are served from the cache when the tuple `(primary, catalogSnapshotHash, timeWindow, threshold, propagator)` matches a previously stored result. The snapshot hash is derived from the GP epoch of the catalog used, so refreshing CelesTrak invalidates the cache automatically. The dashboard reads cached conjunctions directly from the database on load (<1 s) and never triggers a fresh screen on its own — screening is always an explicit user action via `POST /api/analysis`.
