# SENTINEL — API Reference

All endpoints are implemented as Next.js 16 App Router route handlers under `src/app/api/`. Requests and responses use JSON unless noted. Server-side only — the `z-ai-web-dev-sdk` is never invoked from the client.

Conventions:
- All paths are relative (`/api/...`).
- `GET` with no body. `POST`/`PATCH` body is JSON unless noted.
- Errors return `{ error: string, code?: string }` with appropriate HTTP status.

---

## Satellites

### `GET /api/satellites`
List satellites with optional filters.

Query params:
- `protected=true|false` — restrict to user-flagged protected objects.
- `source=CELESTRAK|DEMO|CDM_IMPORT`
- `type=PAYLOAD|ROCKET BODY|DEBRIS|UNKNOWN`
- `q=<name fragment>` — case-insensitive substring on `objectName` or `noradCatId`.
- `limit` (default 100, max 1000), `offset`.

```bash
curl -s "/api/satellites?q=iss&limit=5"
```

### `POST /api/satellites`
Create or upsert a single satellite (admin / test seeding).

```bash
curl -s -X POST /api/satellites \
  -H 'Content-Type: application/json' \
  -d '{"noradCatId":"25544","objectName":"ISS (ZARYA)","epoch":"2024-01-15T12:00:00","meanMotion":15.5,"eccentricity":0.0001,"inclination":51.6,"raan":120.0,"argOfPericenter":0,"meanAnomaly":180,"bstar":0.0001,"source":"CELESTRAK"}'
```

### `GET /api/satellites/{id}`
Fetch a single satellite by `noradCatId`. Returns full OMM fields plus `source`, `rawHash`, `snapshotId`.

```bash
curl -s "/api/satellites/25544"
```

---

## Orbits & Refresh

### `POST /api/orbits/refresh`
Triggers a catalog refresh from CelesTrak. Long-running; returns a refresh log immediately and runs in the background, writing the result to `DataRefreshLog`.

Body:
```json
{ "groups": ["stations", "active", "starlink"] }
```

```bash
curl -s -X POST /api/orbits/refresh \
  -H 'Content-Type: application/json' \
  -d '{"groups":["stations","active"]}'
```

### `GET /api/orbits/refresh`
List refresh log entries (most recent first).

```bash
curl -s "/api/orbits/refresh?limit=20"
```

### `GET /api/orbits/{id}?start=&end=&step=`
Propagates satellite `{id}` over `[start, end]` at `step`-second resolution using SGP4. Returns a series of `{ t, r: [x,y,z], v: [vx,vy,vz] }` TEME state vectors.

```bash
curl -s "/api/orbits/25544?start=2024-01-15T12:00:00Z&end=2024-01-16T12:00:00Z&step=300"
```

---

## Screening & Conjunctions

### `POST /api/screen`
Run the full conjunction-screening pipeline (`CONJUNCTION_DETECTION.md`). Body:
```json
{
  "primaryIds": ["25544", "39468"],
  "start": "2024-01-15T12:00:00Z",
  "end": "2024-01-22T12:00:00Z",
  "thresholdKm": 10
}
```
If `primaryIds` is omitted, screens every active satellite in the catalog. Returns the `analysisId` and a summary; full results via `GET /api/conjunctions?analysisId=`.

```bash
curl -s -X POST /api/screen \
  -H 'Content-Type: application/json' \
  -d '{"primaryIds":["25544"],"start":"2024-01-15T12:00:00Z","end":"2024-01-22T12:00:00Z","thresholdKm":10}'
```

### `GET /api/conjunctions`
List conjunctions with filters.

Query params: `primaryId`, `status`, `riskLevel` (LOW|MODERATE|HIGH|CRITICAL), `type` (PAYLOAD/DEBRIS/...), `minRisk` (0–100), `maxDistance` (km), `minConf` (0–100), `analysisId`, `limit`, `offset`.

```bash
curl -s "/api/conjunctions?minRisk=50&maxDistance=1&limit=20"
```

### `GET /api/conjunctions/{id}`
Full conjunction detail: TCA, miss, rel-vel, risk factors, confidence factors, primary & secondary OMM, snapshot, analysis.

```bash
curl -s "/api/conjunctions/42"
```

### `POST /api/conjunctions/{id}/simulate`
Run the maneuver what-if simulator (`MANEUVER_SIMULATION.md`). Body:
```json
{
  "burnTimesH": [72, 48, 36, 24, 12, 6],
  "directions": ["RADIAL", "ALONG_TRACK", "CROSS_TRACK"],
  "deltaVs": [0.05, 0.10]
}
```
Returns scenario table + best-scenario marker (★) + new conjunctions.

```bash
curl -s -X POST /api/conjunctions/42/simulate \
  -H 'Content-Type: application/json' \
  -d '{"burnTimesH":[48,24,12],"directions":["ALONG_TRACK"],"deltaVs":[0.05]}'
```

### `GET /api/conjunctions/{id}/timeline`
Returns the per-second separation time series for the conjunction, used by the Recharts chart.

```bash
curl -s "/api/conjunctions/42/timeline"
```

### `PATCH /api/conjunctions/{id}/status`
Update analyst status: `NEW`, `INVESTIGATING`, `ACKNOWLEDGED`, `MITIGATED`, `FALSE_ALARM`. Adds an `EventLog` row.

```bash
curl -s -X PATCH /api/conjunctions/42/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"INVESTIGATING","note":"Operator reviewing"}'
```

### `GET /api/conjunctions/{id}/validation`
Return any SOCRATES validation results for this conjunction.

```bash
curl -s "/api/conjunctions/42/validation"
```

---

## CDM

### `POST /api/cdm/import`
Import a KVN-format CDM. Body: `{ "kv": "<CDM text>" }` or multipart. Returns the new conjunction ID.

```bash
curl -s -X POST /api/cdm/import \
  -H 'Content-Type: application/json' \
  -d '{"kv":"CCSDS_CDM_VERS = 1.0\nOBJECT1_CAT_ID = 25544\n..."}'
```

### `GET /api/cdm/{id}/export`
Export a CDM for conjunction `{id}` in KVN format. Returns `text/plain` with `Content-Disposition: attachment`.

```bash
curl -s "/api/cdm/42/export" -o sentinel-cdm-42.cdm
```

---

## Reports

### `POST /api/reports/generate`
Generate an AnalysisReport from a screening run. Body: `{ "analysisId": "..." }`. Returns the report ID.

```bash
curl -s -X POST /api/reports/generate \
  -H 'Content-Type: application/json' \
  -d '{"analysisId":"abc123"}'
```

### `GET /api/reports/{id}`
Fetch a generated report. Returns Markdown-formatted body and summary statistics.

```bash
curl -s "/api/reports/7"
```

---

## AI Assistant

### `POST /api/ai/ask`
Ask the LLM assistant about a conjunction or the catalog. Body: `{ "question": "...", "conjunctionId": "..." }`. Returns `{ "answer": "...", "source": "LLM" | "RULE_BASED" }`. See `AI_ASSISTANT.md`.

```bash
curl -s -X POST /api/ai/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Why is this event risky?","conjunctionId":"42"}'
```

---

## Dashboard & Status

### `GET /api/dashboard`
Aggregated metrics for the dashboard view: total satellites, total conjunctions, counts by risk level, latest refresh timestamp, data source flag.

```bash
curl -s "/api/dashboard"
```

### `GET /api/status`
System status: data source (LIVE/CACHED/DEMO), last refresh, propagator version, satrec cache size, SGP4 test status.

```bash
curl -s "/api/status"
```

### `GET /api/evaluator`
Returns the current state needed for the evaluator walkthrough: demo progress, suggested steps, key URLs to display.

```bash
curl -s "/api/evaluator"
```

---

## Provenance

### `GET /api/provenance/{id}`
Returns the full provenance trail for a conjunction or report: `snapshotId` → source URL → fetch timestamp → `rawHash` → propagator → analysis ID.

```bash
curl -s "/api/provenance/42"
```

---

## Snapshots

### `GET /api/snapshots`
List catalog snapshots (most recent first).

```bash
curl -s "/api/snapshots?limit=20"
```

### `POST /api/snapshots`
Force-create a snapshot (admin / test). Returns the new snapshot ID.

```bash
curl -s -X POST /api/snapshots -H 'Content-Type: application/json' -d '{}'
```

---

## SOCRATES

### `GET /api/socrates`
List SOCRATES conjunctions (raw CSV parsed into JSON).

```bash
curl -s "/api/socrates?limit=20"
```

### `POST /api/socrates`
Compare a SENTINEL conjunction against SOCRATES. Body: `{ "conjunctionId": "42" }`. Returns `{ tcaErrorMin, rangeErrorKm, relVelErrorKmS, source: "SOCRATES" }` or `{ matched: false }`.

```bash
curl -s -X POST /api/socrates \
  -H 'Content-Type: application/json' \
  -d '{"conjunctionId":"42"}'
```

---

## Demo

### `POST /api/demo/seed`
Seed the database with a small synthetic catalog and demo conjunctions for offline evaluation. Idempotent.

```bash
curl -s -X POST /api/demo/seed
```

## Reference URLs

- CelesTrak GP/OMM (data source): https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CelesTrak SOCRATES (validation): https://celestrak.org/SOCRATES/
- CCSDS 508.0-B-1 CDM standard: https://ccsds.org/searchpubs/
