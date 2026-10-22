# SpaceDebri-Guard Final Scientific Validation Report

Generated from the repository’s existing experiment artifacts and the Task 5 targeted fixes. No production model replacement, schema migration, dataset rewrite, commit, or push was performed.

## 1. System Overview

The system combines a FastAPI space-weather model service, a Next.js frontend/API layer, Supabase PostgreSQL persistence through Prisma, npm SGP4 propagation in TEME, and coarse-to-fine conjunction screening with analytical TCA refinement. Recordings, satellites, conjunctions, provenance, and screening metadata are persisted in Supabase.

## 2. ML Validation

The model comparison used `Backend/data/processed/final_with_kp_sw.csv` (SHA-256 recorded in `model_comparison_results.json`) with a chronological train-through-2015/test-2016–2019 split: 2,717 training and 1,071 test rows. The test set contains only 5 High-risk observations. Random Forest, alternative tree models, and HistGradientBoosting were compared. The best rebuilt HistGradientBoosting result reported accuracy about 0.987, macro F1 about 0.676, balanced accuracy about 0.681, and High precision/recall about 0.80/0.80; the tiny High-risk sample prevents production certification. The production Random Forest remains unchanged.

The frontend now labels successful FastAPI output as `trained_model`, retained local output as `heuristic_fallback`, and no-input output as `unavailable`. Malformed service responses are not treated as trained-model responses.

## 3. Orbital Propagation Validation

Production npm `sgp4@1.0.10` was compared with Python `sgp4==2.25` using WGS84, AFSPC mode, direct `sgp4init`, identical OMM-style elements, UTC timestamps, TEME, km, and km/s. ISS, polar LEO, and GEO fixtures were evaluated at epoch, +1 hour, +1 day, +7 days, and +30 days. Fifteen comparisons produced 5 strict-tolerance passes and 10 failures; median position error was approximately 0.000014 km, P90 17.03 km, maximum 514.53 km.

The discrepancy investigation verified the timestamps, epoch conversion, units, frame, and Python argument order, including required zero `ndot`/`nddot`. The large differences remain reproducible and appear implementation/numerical and horizon-dependent, but no exact internal cause was established. No speculative production propagator change was justified. Agreement between two Vallado-family implementations is not proof of physical orbit accuracy.

## 4. Conjunction Validation

Controlled synthetic tests detected 2 expected encounters, missed 0, and produced 0 unexpected detections. TCA errors were 0.012 s and 0.018 s; miss-distance errors were approximately 0.0562 km and 0.0594 km. Safe-pair, analytical TCA, boundary, and zero-relative-velocity cases were exercised. No historical conjunction reference dataset exists, so real-world precision and recall remain unverified; the risk score remains heuristic, not collision probability.

Propagation now rejects non-finite states. Screening records failed object pairs in `failedPairs`, returns `complete: false` when any pair fails, and continues unrelated pairs where the surrounding screening operation can safely do so. No fallback orbital state is invented.

## 5. System Integration

The read-only system validation passed Prisma schema validation, Supabase connectivity, application-data reads, production ML artifact presence, demo-seed gating, startup synchronization checks, recording persistence wiring, and prior orbital/conjunction artifact checks. The observed database contained 26 satellites, 1 conjunction, 1 recording, and 0 analysis runs during the prior validation run.

Existing provenance includes orbital source, epoch, retrieval time, snapshot, propagator/frame, object pair, TCA, miss distance, screening configuration, and risk-model version. Remaining gaps include per-prediction weather retrieval persistence and browser-level provenance verification.

## 6. Remaining Limitations

- Confirmed defect fixed: silent ML heuristic fallback provenance.
- Confirmed defect fixed: non-finite propagation states and silent failed-pair accounting.
- Known limitation: npm/Python SGP4 long-horizon discrepancy remains unexplained.
- Known limitation: model High-risk evaluation has only 5 test examples.
- Unverified claim: real-world conjunction precision/recall and physical orbital accuracy.
- Blocked: authentication/RLS verification and browser automation.
- Future research: authoritative ephemeris comparison, larger orbital fixtures, calibrated uncertainty/covariance, and historical conjunction benchmarking.

## 7. Reproducibility

Key paths: `Backend/experiments/model_comparison/`, `orbital_validation/`, `conjunction_validation/`, `system_validation/`, and this report. Relevant commands include `Backend/.venv/bin/python Backend/experiments/orbital_validation/validate_orbital_propagation.py`, `npm test`, `npm run lint`, `npm run qa`, `npx prisma validate --schema prisma/schema.prisma`, and `python3 Backend/experiments/system_validation/validate_system.py` with `SELECT 1` supplied to its Prisma check. Dependencies include npm `sgp4@1.0.10`, Python `sgp4==2.25`, Prisma 6.11.1, and the repository lockfile versions. Existing dataset hashes and detailed numerical results remain in the experiment JSON files.

## 8. Defensible Research Claims

The evidence supports that the implemented pipeline can persist application records, produce trained-model responses when FastAPI is available, execute deterministic SGP4-based propagation, and detect the tested synthetic conjunctions. It does not support guaranteed collision avoidance, validated real-world conjunction detection, reliable collision probabilities, or production-grade High-risk ML prediction.
