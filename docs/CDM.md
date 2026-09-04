# SENTINEL — Conjunction Data Message (CDM)

## Standard

SENTINEL's CDM import and export conform to the **CCSDS 508.0-B-1** Conjunction Data Message standard, published by the Consultative Committee for Space Data Systems. The red book (current recommendation) is searchable at https://ccsds.org/searchpubs/.

A CDM is a structured message exchanged between spacecraft operators (or between operators and SSA providers) describing a predicted conjunction. The format supports both KVN (Keyword = Value, line-oriented text) and XML encodings. SENTINEL handles KVN for both import and export.

## KVN Syntax

Each line of a KVN CDM is `KEY = VALUE`. Sections are introduced by a `HEADER` line and a `META` line; per-object metadata appears under `RELATIVE_METADATA` and the two `OBJECT_1` / `OBJECT_2` blocks. Example skeleton:

```
CCSDS_CDM_VERS = 1.0
CREATION_DATE = 2024-01-15T12:00:00.000Z
ORIGINATOR = SENTINEL

OBJECT1_CAT_ID = 25544
OBJECT1_NAME = ISS (ZARYA)
OBJECT1_OBJECT_TYPE = PAYLOAD

OBJECT2_CAT_ID = 39468
OBJECT2_NAME = ...
OBJECT2_OBJECT_TYPE = DEBRIS

TCA = 2024-01-18T03:14:22.817Z
MIN_RNG = 0.096
REL_VEL = 14.2

RISK_SCORE = 76
RISK_SCORE_NOTE = heuristic NOT probability of collision
COVARIANCE = UNAVAILABLE
SCREEN_THRESHOLD = 10
PROPAGATOR = SGP4-1.0.10-WGS84-TEME
DATA_SOURCE = CELESTRAK GP/OMM JSON
SNAPSHOT_ID = abc123def456
```

## SENTINEL-supported CDM Operations

### 1. Import a CDM (`POST /api/cdm/import`)

Accepts a `multipart/form-data` upload or `application/json` body containing the raw KVN text. The parser:

1. Splits the body on newlines.
2. For each line, splits on the first `=`, trims whitespace, builds a `Record<string, string>`.
3. Validates the presence of required keys: `CCSDS_CDM_VERS`, `OBJECT1_CAT_ID`, `OBJECT2_CAT_ID`, `TCA`.
4. Creates a `Conjunction` row in the database (or upserts by the pair + TCA + snapshot).
5. Returns the new conjunction ID.

### 2. View a parsed CDM (`GET /api/cdm/{id}/export?format=kv`)

Returns the parsed fields as JSON, suitable for rendering in the UI's `ConjunctionDetail` overlay's CDM panel.

### 3. Export a CDM (`GET /api/cdm/{id}/export`)

Generates a KVN-formatted CDM from a conjunction row and returns it as `text/plain` with `Content-Disposition: attachment; filename="sentinel-cdm-{id}.cdm"`.

## Fields SENTINEL Generates on Export

| CDM field | Source | Notes |
|-----------|--------|-------|
| `CCSDS_CDM_VERS` | constant `1.0` | |
| `CREATION_DATE` | `now()` ISO 8601 UTC | When the CDM was generated. |
| `ORIGINATOR` | `SENTINEL` | Identifies this system as the producer. |
| `OBJECT1_CAT_ID` | `Satellite.noradCatId` | String — supports 6+ digit IDs. |
| `OBJECT1_NAME` | `Satellite.objectName` | |
| `OBJECT1_OBJECT_TYPE` | `Satellite.objectType` | |
| `OBJECT2_CAT_ID` | `Satellite.noradCatId` | |
| `OBJECT2_NAME` | `Satellite.objectName` | |
| `OBJECT2_OBJECT_TYPE` | `Satellite.objectType` | |
| `TCA` | `Conjunction.tca` | Refined TCA (`TCA_ALGORITHM.md`). |
| `MIN_RNG` | `Conjunction.minRange` | km. |
| `REL_VEL` | `Conjunction.relVelocity` | km/s. |
| `RISK_SCORE` | `Conjunction.riskScore` | 0–100. |
| `RISK_SCORE_NOTE` | `"heuristic NOT probability of collision"` | **Always** present. |
| `COVARIANCE` | `UNAVAILABLE` | Public GP does not provide covariance. |
| `SCREEN_THRESHOLD` | 10 | km; the conjunction threshold used. |
| `PROPAGATOR` | `SGP4-1.0.10-WGS84-TEME` | Provenance. |
| `DATA_SOURCE` | `CELESTRAK GP/OMM JSON` | Provenance. |
| `SNAPSHOT_ID` | `Conjunction.snapshotId` | Links to the `CatalogSnapshot` row. |

## Fields That Are NOT Available From Public GP Data

A CCSDS 508.0-B-1 CDM, in its full form, includes covariance and probability-of-collision fields that SENTINEL cannot populate from public GP elements. We explicitly omit (or set to `UNAVAILABLE` / `N/A`) the following:

| CDM field | Why unavailable |
|-----------|-----------------|
| `OBJECT1_COV_RX`, `OBJECT1_COV_RY`, ... (full 3×3 covariance) | Public GP/OMM elements do not carry covariance. |
| `OBJECT2_COV_...` | Same as above. |
| `PCN_*` (Pc using various methods) | True Pc requires covariance; SENTINEL does not compute Pc. |
| `PCS_*` | Same as above. |
| `PURPOSE_OF_CDM` | SENTINEL is a screening tool, not an operator-issued CDM. We do not claim `INITIAL` / `UPDATE` / `MANEUVER` purpose; we omit. |
| `MESSAGE_ID` (true operator message ID) | SENTINEL generates a local ID (`SNAPSHOT_ID` + `Conjunction.id`); it is not an operator message ID. |
| `ADMIRAL_DATA_*` / `DECISION_ADMIRAL_*` | Operator-only decision metadata; SENTINEL has none. |
| `MANEUVERABLE_OBJECT` | Unknown from public data; SENTINEL does not guess. |
| `OBJECT1_OCS_BRIT` / etc. | RCS / brittleness; not available in public GP. |

The `RISK_SCORE_NOTE = "heuristic NOT probability of collision"` field is SENTINEL's own addition (not in the CCSDS standard) and exists to make the non-Pc nature of the risk score explicit to any downstream consumer of the exported CDM. See `RISK_MODEL.md` and `LIMITATIONS.md`.

## Interoperability Notes

- A real operator workflow expects covariance in CDMs. An operator receiving a SENTINEL CDM must treat it as a screening-level advisory, not as a 2-σ conjunction ellipsoid message.
- The `RISK_SCORE` field uses SENTINEL's 0–100 heuristic; it is **not** a Pc and is not on the [0, 1] interval that some operators expect for Pc. The `RISK_SCORE_NOTE` clarifies this.
- The `PROPAGATOR` field is SGP4 with WGS84 constants. Real CDMs from 18 SDS may use Special Perturbations (SP) ephemeris; SENTINEL cannot accept those without a full SP ephemeris ingestion path.

## Reference URLs

- CCSDS publications search: https://ccsds.org/searchpubs/
- CelesTrak GP/OMM API (source elements): https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CelesTrak SOCRATES (independent reference): https://celestrak.org/SOCRATES/
- NASA CARA methodology (Pc context): https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/
