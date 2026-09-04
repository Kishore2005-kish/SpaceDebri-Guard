# SENTINEL — Test Plan

## Overview

SENTINEL's test strategy mixes runnable scripts (ad-hoc validations that exercise the real CelesTrak + SGP4 pipeline end-to-end) with structured unit/integration tests for the deterministic modules. The scripts live in `scripts/` and are runnable directly with `bun`. The structured tests live in `tests/` and run via `bun test` (or `vitest` if added).

**Note per project rules**: this prototype ships with the scripts below; the structured test files are listed as "to add" with a clear specification of what they cover.

## Runnable Scripts

### `scripts/test-sgp4.ts`
Verifies the SGP4 propagator setup (`SGP4.md`) using the ISS (NORAD 25544).

What it does:
1. Loads a known-good OMM record for the ISS (bundled or fetched live).
2. Calls `initSatrec(...)` (the direct-`sgp4init` path) to build the `Satrec`.
3. Propagates to the element epoch (`minutesSinceEpoch = 0`).
4. Asserts:
   - `|r|` is in the range **6,780–6,820 km** (Earth radius + ~415 km altitude).
   - `|v|` is in the range **7.60–7.70 km/s** (circular-orbit speed at that altitude).
5. Propagates to +1 day; asserts the result is non-`NaN`, non-null.
6. Prints a green/red pass line per check.

If `|r|` or `|v|` are off by more than 10%, the script halts with an error code so the user knows `initSatrec` has a bug (most commonly: missing `jdsatepoch` set, mean-motion unit mismatch, or degrees/radians error — see `TROUBLESHOOTING.md` issue #2).

### `scripts/test-real-data.ts`
Verifies the live-data path end-to-end (`CELESTRAK_INTEGRATION.md` + `SGP4.md` + `CONJUNCTION_DETECTION.md`).

What it does:
1. Fetches the `stations` group from CelesTrak via `POST /api/orbits/refresh` (or directly via the celestrak client).
2. Persists to SQLite.
3. Picks the ISS (25544) as the primary.
4. Propagates ISS to +3 days.
5. Pairwise-screens ISS against every other satellite in the stations group (with the altitude pre-filter from `CONJUNCTION_DETECTION.md` Stage 1 enabled).
6. Asserts at least one close approach within 50 km over the 3-day window — because the ISS (which maneuvers regularly) typically has at least one recorded near-pass against another station.
7. Prints the top-3 closest approaches with TCA, miss, rel-vel.

This script is the closest SENTINEL gets to a real-world regression test against a live catalog.

### `scripts/debug-screen.ts`
Diagnostic for a specific (primary, secondary) pair.

What it does:
1. Takes two NORAD IDs as CLI args.
2. Fetches both OMM records from the DB (or live if missing).
3. Builds satrecs, runs the full 8-stage screening pipeline over a 7-day window.
4. Prints:
   - Whether the pair was filtered out by the altitude pre-filter.
   - The coarse 60-second distance series (so you can see local minima).
   - The fine 1-second distance series around the coarse minimum.
   - The analytical TCA refinement result (`t*` and `d*`).
   - The final TCA, miss, rel-vel, risk, confidence.
5. Useful when an expected conjunction does not show up in the table — usually because of an altitude pre-filter that is too aggressive, or a malformed OMM that produces `NaN` propagations.

### `scripts/debug-db.ts`
Same as `debug-screen.ts` but skips the live fetch — it loads both objects from the SQLite database via Prisma and screens them. Useful when the user has already refreshed the catalog and wants to re-screen a specific pair against the persisted snapshot.

## Structured Tests (To Add)

Each test file below is specified with the cases it should cover. The prototype ships without these test files (per project rules); they are the recommended additions for a production hardening pass.

### `tests/parser.test.ts` — OMM parser
- **valid**: a syntactically correct OMM JSON parses without error and produces a `Satellite` with correct field mapping.
- **malformed**: a syntactically broken JSON body throws `CelestrakParseError` with a 200-byte body prefix in the error message.
- **missing fields**: an OMM missing `EPOCH` or `MEAN_MOTION` is rejected.
- **6-digit catalog ID**: an OMM with `NORAD_CAT_ID = "123456"` is preserved (no truncation to 5 digits — the TLE legacy bug).
- **stale epoch**: an OMM with an epoch 7 days in the past parses successfully but is flagged for the confidence model (`CONFIDENCE_MODEL.md` age penalty).

### `tests/sgp4.test.ts` — SGP4 propagator
- **known object**: ISS at epoch; checks `|r|` and `|v|` ranges (same as `test-sgp4.ts`).
- **valid propagation**: propagating a LEO satellite +1 day returns a finite, non-`NaN` state inside the Earth's gravitational well (`|r| < 50,000 km`).
- **invalid element set**: a `Satrec` constructed with `eccentricity = 2` returns SGP4 error code (non-zero) — the wrapper returns `null` instead of throwing.

### `tests/conjunction.test.ts` — Conjunction pipeline
- **known close approach**: two synthetic satellites on a guaranteed-collide geometry → pipeline returns a conjunction at the expected TCA within ±2 seconds and ±200 m.
- **no conjunction**: two satellites on clearly-separated planes (e.g. ISS-plane vs. a polar GEO transfer) → pipeline returns no conjunction in the 7-day window.
- **high rel vel**: a head-on-geometry pair with `|v_rel| ≈ 14 km/s` → the analytical TCA refinement (`TCA_ALGORITHM.md`) moves TCA from the coarse-grid sample by tens of meters and the resulting miss matches the true miss within 100 m.
- **TCA refinement accuracy**: compares the analytical `t*` against a brute-force 1 ms sweep; asserts `|t_analytical − t_brute| < 10 ms` and `|d_analytical − d_brute| < 5 m` for a 10 km/s encounter.

### `tests/risk.test.ts` — Risk model
- **score boundaries**: a 96 m miss against debris at 14 km/s scores ~76 (CRITICAL); a 5 km miss against a payload at 1 km/s scores <25 (LOW) — boundary checks.
- **missing covariance**: every conjunction with `covariance = UNAVAILABLE` carries the +15 confidence penalty (`CONFIDENCE_MODEL.md`).
- **stale data**: a conjunction whose elements are >48 h old has age penalty ≥25 — its confidence is at most 75 − 25 = 50 + others = MEDIUM at best.
- **disclaimer**: every persisted `Conjunction` row's `riskScoreNote` field is the literal string `"heuristic NOT probability of collision"`.

### `tests/api.test.ts` — API endpoints
Every documented endpoint (`API.md`) returns:
- **200** on valid input.
- **400** on malformed body.
- **404** on unknown ID.
At minimum: `GET /api/satellites`, `GET /api/satellites/{id}`, `POST /api/orbits/refresh`, `GET /api/orbits/{id}`, `POST /api/screen`, `GET /api/conjunctions`, `GET /api/conjunctions/{id}`, `POST /api/conjunctions/{id}/simulate`, `GET /api/conjunctions/{id}/timeline`, `PATCH /api/conjunctions/{id}/status`, `GET /api/conjunctions/{id}/validation`, `POST /api/cdm/import`, `GET /api/cdm/{id}/export`, `POST /api/reports/generate`, `GET /api/reports/{id}`, `POST /api/ai/ask`, `GET /api/dashboard`, `GET /api/status`, `GET /api/evaluator`, `GET /api/provenance/{id}`, `GET /api/snapshots`, `POST /api/snapshots`, `GET /api/socrates`, `POST /api/socrates`, `POST /api/demo/seed`.

### `tests/e2e.test.ts` — End-to-end live-data workflow
Walks the full pipeline:
1. `POST /api/orbits/refresh` with `groups: ['stations']`.
2. `POST /api/screen` with `primaryIds: ['25544']`.
3. `GET /api/conjunctions?primaryId=25544`.
4. If any conjunction is returned, open it via `GET /api/conjunctions/{id}`, run `POST /api/conjunctions/{id}/simulate`, run `POST /api/socrates` with `conjunctionId`, and assert the response shape (matched: true|false, no server error).

## Running

```bash
bun run scripts/test-sgp4.ts
bun run scripts/test-real-data.ts
bun run scripts/debug-screen.ts 25544 39468
bun run scripts/debug-db.ts 25544 39468
# Future:
# bun test tests/parser.test.ts
# bun test tests/api.test.ts
```

## Reference URLs

- CelesTrak GP/OMM API (data source for live tests): https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- sgp4 npm package: https://www.npmjs.com/package/sgp4
- CelesTrak SOCRATES (validation reference): https://celestrak.org/SOCRATES/
- NASA CARA_Analysis_Tools (real Pc reference tool): https://github.com/nasa/CARA_Analysis_Tools
