# SENTINEL QA REPORT

## Audit Date: 2026-08-19

## Issues Found and Fixed

### 1. Bun lockfile conflicts
- **Bug:** `bun.lock` existed alongside no `package-lock.json`, causing inconsistent dependency resolution
- **Cause:** Project was originally scaffolded with Bun
- **Fix:** Removed `bun.lock`, ran `npm install` to generate `package-lock.json`, removed `bun-types` from devDependencies, updated all scripts to use npm/npx
- **Test:** `ls bun.lock` → not found; `ls package-lock.json` → exists
- **Result:** PASS

### 2. Missing npm scripts
- **Bug:** No `test`, `qa`, `smoke`, `sentinel`, or `start:local` scripts in package.json
- **Cause:** Original package.json only had `dev`, `build`, `start`, `lint`, `db:*`
- **Fix:** Added all required scripts, removed `bun` from `start` script, added `engines.node: ">=20"`
- **Test:** `npm run` lists all scripts
- **Result:** PASS

### 3. History API returns giant JSON blobs
- **Bug:** `/api/analysis/history` fetched all fields including `resultJson`, `rawReport`, `configJson` — causing slow page loads
- **Cause:** Original `listAnalysisRuns()` used `findMany()` without `select`, loading entire rows
- **Fix:** Rewrote History API with `select` (only lightweight fields), server-side pagination, `page`/`pageSize`/`total`/`hasNext` response shape
- **Test:** `curl /api/analysis/history?page=1&pageSize=5` returns 5 items with no JSON blobs
- **Result:** PASS — History loads in <1 second

### 4. Simulation view crashes on undefined properties
- **Bug:** `Cannot read properties of undefined (reading 'slice')` in `simulation-view.tsx`
- **Cause:** `analysisStart`, `analysisEnd`, `separationSeries`, `comparison.sentinel.tca` could be undefined from API
- **Fix:** Added null checks: `simResult.analysisStart ? ... : '—'`, `(simResult.separationSeries?.length ?? 0) > 0`, `comparison.sentinel?.minimumRangeKm != null ? ... : '—'`
- **Test:** No console errors when opening simulation
- **Result:** PASS

### 5. TCA computed from array midpoint (incorrect)
- **Bug:** Old `SimulationViz` used `tcaIdx = Math.floor(totalSteps / 2)` — wrong for non-symmetric trajectories
- **Cause:** Assumed TCA was always at the center of the ±1h window
- **Fix:** New `CesiumGlobe` component finds nearest trajectory sample by timestamp: `Math.abs(new Date(p.t).getTime() - tcaTimeMs)`
- **Test:** TCA marker is at the correct timestamp, not the array midpoint
- **Result:** PASS

### 6. Cesium Ion token errors
- **Bug:** Cesium Viewer threw `INVALID_TOKEN` 401 errors, stopping the render loop
- **Cause:** Default Cesium Ion token was expired/invalid
- **Fix:** Set `baseLayer: false` in Viewer constructor, manually added free ArcGIS World Imagery tiles via `UrlTemplateImageryProvider`
- **Test:** No Ion API errors in browser console
- **Result:** PASS

### 7. Cesium Viewer React DOM conflict
- **Bug:** `TypeError: Cannot read properties of undefined (reading 'addEventListener')` during initialization
- **Cause:** Cesium Viewer manipulated DOM during React's render cycle
- **Fix:** Wrapped Viewer creation in `setTimeout(() => { ... }, 100)` to let React render first
- **Test:** Cesium globe loads without errors
- **Result:** PASS

### 8. Analysis progress not visible
- **Bug:** Clicking RUN ANALYSIS showed a toast but no visible progress
- **Cause:** Progress view was gated on `running && analysisStatus` — `analysisStatus` was null for ~1 second
- **Fix:** Changed to `if (running)` with fallback values (`status='STARTING'`, `progress=0`)
- **Test:** Progress view appears immediately on RUN click
- **Result:** PASS

### 9. Polling not robust
- **Bug:** Polling would silently stop on network errors or 404
- **Cause:** No retry logic, no AbortController, no 404 handling
- **Fix:** Added 5 retries with 2s backoff, 404 detection, timer cleanup on unmount
- **Test:** Polling survives temporary network failures
- **Result:** PASS

## Performance Benchmarks

| Metric | Value |
|--------|-------|
| Dashboard load | 0.097s |
| Conjunctions API | 0.04s |
| History API (5 items) | <0.1s |
| Status API | 0.6s (first compile) |
| Analysis Quick preset (ISS, 24h, 10km) | ~4s |
| Cesium globe init | ~100ms |
| Lint | <5s |

## API Test Results

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /` | 200 | Home page renders |
| `GET /api/status` | 200 | LIVE, 22 real objects |
| `GET /api/dashboard` | 200 | 46 objects, 11 conjunctions |
| `GET /api/conjunctions` | 200 | 11 conjunctions (7 real, 4 demo) |
| `GET /api/analysis/history` | 200 | 16 total, paginated, no JSON blobs |
| `GET /api/system/status` | 200 | DB:READY, CelesTrak:CACHED, STK:UNAVAILABLE |
| `GET /api/simulation/stk/status` | 200 | Available: false |
| `GET /api/analysis` | 200 | 4 presets |

## Test Results

| Test Suite | Assertions | Result |
|------------|-----------|--------|
| CelesTrak parser | 18 | PASS |
| SGP4 + conjunction + risk | 23 | PASS |
| STK integration (mocked) | 21 | PASS |
| **Total** | **62** | **ALL PASS** |

## Known Limitations

1. **STK not installed** — adapter code is ready but untested against real STK
2. **No Cesium Ion terrain** — using EllipsoidTerrainProvider (flat Earth, no mountains)
3. **No auto-recovery on refresh** — analysis job persists in DB but UI doesn't auto-detect active jobs
4. **No historical event mode** — would need archived conjunction data
5. **Background process instability** — unawaited promise works in dev server but would need a worker queue for production
