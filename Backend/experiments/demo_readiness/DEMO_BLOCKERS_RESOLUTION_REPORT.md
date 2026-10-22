# Demonstration Blockers Resolution Report

## Original problems and root causes

Port 8000 was occupied by an unrelated process, so the previous audit’s HTTP 200 was not evidence that SpaceDebri-Guard FastAPI was running. The project client also used a hardcoded ML URL. Separately, no browser automation package was installed, although Google Chrome was available on the machine.

## Changes implemented

- Added `NEXT_PUBLIC_SPACE_WEATHER_API_URL` configuration with the existing 8000 URL as the default.
- Added `SPACE_WEATHER_PORT` support to the sentinel startup script without killing unknown processes.
- Added a Chrome headless smoke test under `tests/e2e/browser-smoke.mjs`.
- Added ML, browser, and resolution evidence JSON files.
- Updated the demonstration runbook with alternate-port startup, health checks, and safe port-conflict recovery.

## ML verification evidence

The intended service started successfully on `http://127.0.0.1:8001`. `/health` returned the project model and training-data paths. `/predict` returned a real response from `Backend/model.pkl` with `prediction_source: trained_model` and `model_version: production-artifact`. No fabricated response was used and no model artifact was changed.

The client source explicitly distinguishes trained-model, heuristic-fallback, and unavailable states. A full frontend live request against the alternate build-time URL was blocked because another Next process held the shared `.next/dev` lock; the direct service and configuration checks passed.

## Browser verification evidence

Chrome headless actually tested the existing Next instance on port 3001. Dashboard, catalog, status, satellites, and conjunction API-backed pages passed. Interactive weather source display and Cesium controls remain blocked; the test does not claim those interactions passed.

## Startup and recovery

Preferred clean startup:

```bash
npm run sentinel
```

Safe alternate when 8000 is occupied:

```bash
SPACE_WEATHER_PORT=8001 NEXT_PUBLIC_SPACE_WEATHER_API_URL=http://127.0.0.1:8001 npm run sentinel
```

Verify `GET /health` and a real `POST /predict` before presenting. Inspect port ownership with `lsof`; do not terminate unknown processes. Stop project-owned processes with Ctrl+C.

## Test results

Unit tests, lint, typecheck, Prisma validation, and production build passed before this targeted verification. FastAPI health and prediction passed. Browser smoke tests passed for dashboard/catalog/API-backed workflows. Blocked tests are frontend live ML request under alternate build and interactive Cesium/weather controls. The known SGP4 scientific discrepancy remains unresolved and is not a demonstration fix.

## Final readiness assessment

The main API-backed demonstration is ready when run in a clean environment with the intended FastAPI service verified first. It is not fully browser-verified: interactive weather-source rendering and Cesium controls still require a clean browser session/manual confirmation. Synthetic `SENTINEL-DEMO` records, heuristic conjunction risk, lack of covariance, and unresolved SGP4 comparison differences must remain visible in the presentation.
