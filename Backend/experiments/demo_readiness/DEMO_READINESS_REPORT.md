# SpaceDebri-Guard Demonstration Readiness Audit

## 1. Executive summary

The core Next.js/Supabase demonstration APIs are reachable and coherent on the existing test instance. They return a clearly labeled synthetic dataset: `DEMO`, source `SENTINEL-DEMO`, 26 objects, 4 protected satellites, 1 conjunction, and 1 persisted presentation recording. Existing unit, QA, type, Prisma, and build checks pass.

The demonstration is not fully ready in the observed environment because port 8000 was occupied by an unrelated service, so FastAPI ML integration could not be verified. Browser interactions, authentication/RLS, empty-state rendering, and click-through visualization behavior also remain blocked. The orbital comparison remains scientifically failed for 10/15 strict comparisons and must be presented as a limitation.

## 2. Main workflows audited

- Dashboard: API summary and source metadata verified.
- Satellite catalog: identifiers, epochs, source, retrieval metadata, and orbital fields returned.
- Conjunctions: TCA, miss distance, relative velocity, heuristic risk disclaimer, and provenance returned.
- Space weather: client contract now distinguishes trained model, heuristic fallback, and unavailable; live service verification was blocked.
- Visualization/simulation: routes and SGP4 fallback labeling were inspected; browser behavior was blocked.
- Persistence: recordings and application counts were read from Supabase without writes.

## 3. Smoke-test results

See `demo_test_results.json`. API checks on port 3001 passed for home, status, dashboard, satellites, conjunctions, and recordings. This was an existing running Next instance, not a fresh sentinel startup. The ML check is blocked because port 8000 was not SpaceDebri-Guard FastAPI. Browser checks are blocked.

## 4. Scientific-output presentation review

The application exposes TEME, km, km/s, epochs, retrieval/source metadata, TCA, miss distance, screening configuration, propagator version, and heuristic risk disclaimers in its API/domain models. Synthetic data are labeled `SENTINEL-DEMO`. The ML client now identifies prediction source. No evidence supports collision-probability, guaranteed-avoidance, or operational-accuracy claims.

## 5. Failure and empty-state review

Code inspection confirms explicit propagation failure and non-finite-state rejection, failed-pair accounting through `complete`/`failedPairs`, invalid-record 404 handling in resource routes, and explicit ML fallback provenance. Browser-level verification of database outage, missing records, stale weather, malformed responses, and empty screens was blocked. These must be manually tested before presentation.

## 6. Startup and configuration

Requirements: Node 20+, npm dependencies, Python virtual environment with FastAPI/Uvicorn and model dependencies, PostgreSQL `DATABASE_URL`, `Backend/model.pkl`, and the processed weather dataset. Required variable names include `DATABASE_URL`, optional `ALLOW_DEMO_DATA`, and the Supabase public variables used by the frontend.

Startup: `npm run sentinel`. It validates a non-file PostgreSQL URL, starts FastAPI on `127.0.0.1:8000`, and Next.js on `localhost:3000`. Health checks: `GET /health` on FastAPI and `GET /api/status` on Next. Recovery: stop unrelated processes occupying ports 3000/8000, confirm the Python environment contains `uvicorn`, verify `DATABASE_URL` without printing it, and restart. Do not run `prisma db push` or seed commands during the demo.

## 7. Prioritized defects

- P0: None found in read-only API/build checks.
- P1: ML integration cannot be demonstrated while an unrelated process owns port 8000; use a clean environment and verify the FastAPI health contract before presenting.
- P1: Browser/UI workflow verification remains blocked; perform the manual checklist below.
- P2: Existing documentation contains historical SQLite wording in `docs/DATABASE.md`; update separately before public presentation.
- P2: The strict SGP4 comparison has 10 failures; disclose it rather than hiding it.

## 8. Fixes implemented

No new production fix was required for this audit. Task 5’s targeted fixes remain active: explicit ML prediction source, non-finite SGP4 rejection, and incomplete screening reporting. Audit artifacts and runbook were added only under this directory.

## 9. Remaining limitations

Authentication/RLS, browser automation, clean startup, FastAPI prediction, live weather freshness, real-world conjunction precision/recall, and physical orbital accuracy remain unverified or limited. The current database records are synthetic demo evidence, not live observations.

## 10. Manual demonstration checklist

- [ ] Start from a clean terminal and confirm ports 3000/8000 are free.
- [ ] Confirm `/health` is SpaceDebri-Guard FastAPI, not another service.
- [ ] Confirm `/api/status` source and status before presenting counts.
- [ ] Open dashboard and catalog; select a valid satellite.
- [ ] Show epoch, retrieval time, source, TEME, and units.
- [ ] Show conjunction TCA/miss distance and heuristic disclaimer.
- [ ] Show visualization/simulation fallback label.
- [ ] Show ML `trained_model`, `heuristic_fallback`, or `unavailable` source explicitly.
- [ ] Explain synthetic-data, covariance, SGP4, and validation limitations.

## 11. Suggested sequence

Follow `DEMO_RUNBOOK.md`: startup/health → dashboard → catalog → satellite details → conjunction → visualization/simulation → space weather → provenance and limitations.

## 12. Reproduction instructions

Run `npm test`, `npm run qa`, `Backend/.venv/bin/python Backend/experiments/orbital_validation/validate_orbital_propagation.py`, and the system validator with `SELECT 1` supplied to its Prisma check. Start the application with `npm run sentinel`, then run the API checks listed in `demo_test_results.json`. No database write or schema synchronization is required.
