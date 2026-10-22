# SpaceDebri-Guard System Validation

Generated: 2026-10-22T13:47:27.878917+00:00

Result: **0 failed, 2 blocked, 10 passed**.

This run is read-only. It does not seed records, run `prisma db push`, alter production code, or push changes.

## Checks

### PASS — prisma-schema-validation

Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
Environment variables loaded from .env

### PASS — supabase-database-connectivity

Read-only SELECT 1 executed through Prisma against DATABASE_URL.

### PASS — supabase-application-data

{'satellites': 26, 'conjunctions': 1, 'analyses': 0, 'recordings': 1, 'latestSatellite': {'id': 'RB-CZ2C', 'name': 'CZ-2C R/B', 'source': 'SENTINEL-DEMO', 'epoch': '2026-10-27T13:11:24.678Z'}, 'latestConjunction': {'id': 'cmvjk80zm0001xtjcztif0c51', 'status': 'NEW', 'minRange': 0.1905653235652849}}

### PASS — production-ml-artifacts

{'model': '/Users/kishorep/Desktop/Space-debri/Backend/model.pkl', 'training_data': '/Users/kishorep/Desktop/Space-debri/Backend/data/processed/final_with_kp_sw.csv', 'model_exists': True, 'training_data_exists': True}

### PASS — demo-seed-disabled-by-default

ALLOW_DEMO_DATA !== 'true'

### PASS — startup-does-not-run-db-push

db:push is not invoked by scripts/start-sentinel.mjs

### PASS — recordings-use-supabase

src/lib/supabase/recordings.ts

### PASS — orbital-validation-artifact

Backend/experiments/orbital_validation/validation_results.json

### PASS — conjunction-validation-artifact

Backend/experiments/conjunction_validation/validation_results.json

### PASS — ml-failure-integrity

ML responses and fallback responses carry explicit prediction_source values.

### BLOCKED — authenticated-api-boundary

No authenticated runtime session was supplied to this read-only validator.

Limitation: Review route authentication and Supabase RLS policies before production deployment.

### BLOCKED — browser-ui-workflow

No browser automation driver is configured in this environment.

Limitation: API/database checks do not prove that every frontend interaction renders and persists correctly.

## Prior independent evidence

- ML holdout comparison: High class has only five test examples; model selection is informative, not production certification.
- Orbital propagation: npm/Python SGP4 comparison contains tolerance failures documented in `orbital_validation`.
- Conjunction detection: synthetic cases detected as expected; malformed propagation exceptions remain unhandled by production screening.
- No historical conjunction reference dataset was available for recall/precision validation.
