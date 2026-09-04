# SENTINEL — SOCRATES Validation

## What SOCRATES Is

**SOCRATES** (Satellite Orbital Conjunction Reports Assessing Threatening Encounters in Space) is a public service operated by CelesTrak at https://celestrak.org/SOCRATES/. It independently screens the publicly catalogued object set, publishes the top predicted close approaches for the next several days, and exposes the results as a downloadable CSV. The format is documented at https://www.celestrak.org/SOCRATES/socrates-format.php.

SOCRATES is valuable to SENTINEL because it is an **independent implementation of essentially the same pipeline**: it ingests GP elements from CelesTrak, propagates them with SGP4, and finds TCAs and miss distances. When SENTINEL's pipeline agrees with SOCRATES to within seconds-of-TCA and meters-of-miss, both pipelines are unlikely to share a gross bug. When they disagree, that disagreement is itself diagnostic.

**Important**: SOCRATES is a reference, not ground truth. It is also computed from public GP data via SGP4 and is subject to the same limitations SENTINEL has. A discrepancy between SENTINEL and SOCRATES does not mean either is wrong — both could be wrong in the same way (same element set, same propagator). True ground truth requires owner/operator covariance data, which is not public.

## SOCRATES CSV Format

Documented at https://www.celestrak.org/SOCRATES/socrates-format.php. The columns SENTINEL consumes:

| Column | Description |
|--------|-------------|
| Satellite A Catalog Number | NORAD catalog ID of the primary (string) |
| Satellite A Name | Object name |
| Satellite B Catalog Number | NORAD catalog ID of the secondary (string) |
| Satellite B Name | Object name |
| TCA | Time of closest approach, ISO 8601 |
| Min Range | Predicted miss distance, km |
| Relative Velocity | Predicted relative speed at TCA, km/s |

SOCRATES also publishes dilution-window fields and Pc estimates for a small subset (those with covariance) — SENTINEL does not consume these because it does not compute Pc.

## Validation Workflow

SENTINEL's `POST /api/socrates` endpoint (see `API.md`) takes a conjunction ID and:

1. Loads the conjunction's primary and secondary catalog IDs.
2. Fetches the current SOCRATES CSV from https://celestrak.org/SOCRATES/ (via the same `z-ai-web-dev-sdk` `page_reader` proxy as GP — see `CELESTRAK_INTEGRATION.md`).
3. Searches the CSV for a row matching both catalog IDs (in either A/B order — SOCRATES can list either object as A).
4. If found, computes:
   - **TCA error (minutes)**: `|tca_SENTINEL − tca_SOCRATES|` in minutes.
   - **Range error (km)**: `|minRange_SENTINEL − minRange_SOCRATES|`.
   - **Relative velocity error (km/s)**: `|relVel_SENTINEL − relVel_SOCRATES|`.
5. Persists a `ValidationRecord` with the comparison, returning it to the UI.
6. If no SOCRATES row matches (common — SOCRATES only publishes the top-N closest approaches), the endpoint returns a `not_in_socrates` flag rather than an error.

## Interpretation

The validation panel in the UI shows a small table:

| Field              | SENTINEL | SOCRATES | Error      |
|--------------------|----------|----------|------------|
| TCA                | …        | …        | ±X.X min   |
| Min range (km)     | …        | …        | ±X.XX km   |
| Relative velocity  | …        | …        | ±X.XX km/s |

General guidance shown to the operator:

| TCA error | Range error | Interpretation                                              |
|-----------|-------------|-------------------------------------------------------------|
| < 1 min   | < 0.5 km    | Excellent agreement; pipelines corroborate.                |
| 1–5 min   | 0.5–2 km    | Reasonable agreement given SGP4 error floor.                |
| 5–30 min  | 2–10 km     | Likely different element sets (one stale). Refresh both.  |
| > 30 min  | > 10 km     | Material disagreement; investigate (epoch, propagator).   |

## Sources of Disagreement

Even when both pipelines are correct, the following can produce apparent disagreement:

1. **Different element sets**: SOCRATES may have refreshed more or less recently than SENTINEL. Both should be re-checked against the live `gp.php` endpoint.
2. **Different propagator version / constants**: SOCRATES uses Vallado's reference SGP4 with WGS72 constants by default; SENTINEL uses WGS84. The position difference between WGS72 and WGS84 SGP4 outputs is sub-meter for short horizons.
3. **Different screening threshold**: SOCRATES publishes top-N; SENTINEL publishes everything below 10 km. A SENTINEL conjunction might not be in SOCRATES' published list at all even if SOCRATES computed it.
4. **Different TCA definition**: SOCRATES reports TCA in a specific time scale (UTC). SENTINEL also uses UTC; conversion should be exact.
5. **Identical element set, identical propagator**: Then both should agree to sub-second TCA and sub-meter miss. If they do not, there is a bug.

## What the Validation Does Not Show

- It does **not** prove either pipeline is correct. SOCRATES can be wrong in the same direction SENTINEL is.
- It does **not** validate the risk score or confidence score — only the TCA / range / rel-vel mechanics.
- It does **not** authorize any maneuver. Even a perfectly corroborated conjunction is still advisory until the operator consults their authoritative SSA provider.

## Reference URLs

- SOCRATES main page: https://celestrak.org/SOCRATES/
- SOCRATES CSV format documentation: https://www.celestrak.org/SOCRATES/socrates-format.php
- CelesTrak main portal: https://celestrak.org/
- NASA CARA (methodology context, NOT ground truth): https://www.nasa.gov/cara/
