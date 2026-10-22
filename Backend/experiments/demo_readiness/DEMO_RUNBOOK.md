# SpaceDebri-Guard Demonstration Runbook

1. Confirm a clean terminal, PostgreSQL `DATABASE_URL`, Node 20+, npm dependencies, and the Python backend virtual environment.
2. If port 8000 is free, run `npm run sentinel`. If it is occupied by another process, use `SPACE_WEATHER_PORT=8001 NEXT_PUBLIC_SPACE_WEATHER_API_URL=http://127.0.0.1:8001 npm run sentinel` and confirm Next.js at `http://localhost:3000`, FastAPI at the selected port, and no startup errors. The alternate-port command was verified for the FastAPI service in this audit; a clean full sentinel launch remains environment-dependent because another Next dev process held the `.next` lock.
3. Open the dashboard. Point out the status/source panel. If it says `SENTINEL-DEMO`, explicitly describe the objects as synthetic demonstration data.
4. Open the satellite catalog, select `MYSAT-01` or another listed object, and show catalog ID, epoch, source, retrieval time, TEME frame, and km/km/s units.
5. Open the conjunction view. Explain TCA and miss distance in kilometres. State that the displayed risk is a prototype heuristic, not collision probability, and note whether screening is complete.
6. Open visualization/simulation. Label SGP4 fallback output as SGP4 fallback; do not describe it as independently validated operational prediction.
7. Open space weather. With FastAPI healthy, show `prediction_source: trained_model`; if unavailable, show the explicitly labeled `heuristic_fallback` or `unavailable` state and do not claim trained-model output.
8. Finish by showing provenance and limitations: synthetic/live source, timestamps, model/propagator versions, lack of covariance, and scientific validation scope.

Controlled alternative: use the existing `SENTINEL-DEMO` records already stored in Supabase for the orbital/conjunction portion. Do not call seed or schema synchronization commands during the presentation.

Troubleshooting: identify a port owner with `lsof -nP -iTCP:8000 -sTCP:LISTEN` (or the selected port); do not kill an unknown process. Verify FastAPI with `http://127.0.0.1:<port>/health` and verify `/predict` before opening the weather page. Stop only processes started by your terminal with Ctrl+C.
