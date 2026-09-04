# SENTINEL — External Data Sources

## Overview

SENTINEL relies on a small set of publicly accessible web resources, each playing a specific role in the conjunction-screening pipeline. None of these sources are proprietary, and all URLs are reachable from a standard browser — although SENTINEL's sandbox fetches them through the `z-ai-web-dev-sdk` `page_reader` proxy because direct HTTPS to `celestrak.org` is not permitted from the runtime environment. See `CELESTRAK_INTEGRATION.md` for the proxy mechanism.

## Complete Source Registry

| # | Source | Purpose | Format | URL | Limitations |
|---|--------|---------|--------|-----|-------------|
| 1 | CelesTrak main portal | Landing page, search, documentation hub | HTML | https://celestrak.org/ | Portal navigation is human-oriented; programmatic access should target `gp.php` directly. |
| 2 | CelesTrak NORAD elements directory | Index of available element groupings (active, stations, starlink, cospar, etc.) | HTML | https://celestrak.org/NORAD/elements/ | Directory listing; not a structured API. Use to discover group names. |
| 3 | CelesTrak GP/OMM JSON API | Primary orbital element feed for SENTINEL — General Perturbations / Orbit Mean-Elements Message | JSON (OMM, CCSDS 502.0-B-2 compatible) | https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON | No covariance. Epoch may be up to ~48 h stale. Public GP is intended for situational awareness, not authoritative CDMs. |
| 4 | CelesTrak GP data formats documentation | Reference for OMM field names, units, and conventions | HTML | https://celestrak.org/NORAD/documentation/gp-data-formats.php | Documentation only; no programmatic schema. Field set mirrors CCSDS 502.0-B-2 OMM. |
| 5 | CelesTrak Satellite Catalog (satcat) | Master satellite catalog with names, international designators, RCS, object types | CSV / HTML | https://celestrak.org/satcat/ | Used to enrich satellite metadata (object type, name spelling, launch date). Not authoritative for element sets. |
| 6 | CelesTrak SOCRATES (Satellite Orbital Conjunction Reports Assessing Threatening Encounters in Space) | Independent public reference for predicted conjunctions — SENTINEL's validation source | CSV (HTML-wrapped) | https://celestrak.org/SOCRATES/ | SOCRATES is *not ground truth*; it uses its own screening pipeline. Updated daily. Includes only top-N close approaches per day. |
| 7 | CelesTrak SOCRATES format documentation | Schema of SOCRATES CSV columns | HTML | https://www.celestrak.org/SOCRATES/socrates-format.php | Defines columns: Satellite A Catalog Number, Satellite A Name, Satellite B Catalog Number, Satellite B Name, TCA, Min Range, Relative Velocity. |
| 8 | NASA CARA main page | Methodology context — Conjunction Assessment and Risk Analysis program | HTML | https://www.nasa.gov/cara/ | Reference for industry-standard risk assessment methodology. Not a data feed. |
| 9 | NASA CARA Research & Development | Background on probability-of-collision theory and screening approaches | HTML | https://www.nasa.gov/cara/research-and-development-2/ | Theoretical reference; SENTINEL's heuristic risk score is explicitly *not* a CARA Pc. |
| 10 | NASA CARA Step 2 Close Approach Risk Assessment | Description of the OCM (Object Covariance Message) and Pc workflow | HTML | https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/ | Explains why covariance is required for a true Pc — SENTINEL marks covariance as `UNAVAILABLE` for public GP data. |
| 11 | NASA CARA publicly available software | Open-source CARA analysis tools (Pc calculation, etc.) | Repository index | https://www.nasa.gov/cara/publicly-available-cara-software/ | Useful for upgrading SENTINEL's risk model to a real Pc if covariance becomes available. |
| 12 | NASA CARA_Analysis_Tools GitHub | Reference implementation for Pc and related calculations | Source code | https://github.com/nasa/CARA_Analysis_Tools | C++ / Python. Can be invoked via mini-service if a true Pc pipeline is needed. |
| 13 | CCSDS publications search | Standards index for CDM (CCSDS 502.0-B-2 OMM, 508.0-B-1 CDM) | Search interface | https://ccsds.org/searchpubs/ | Documents are free PDFs. SENTINEL's CDM import/export conforms to 508.0-B-1. |
| 14 | Wikipedia — Earth-centered inertial | Background reference on ECI/TEME frames | HTML | https://en.wikipedia.org/wiki/Earth-centered_inertial | Reference frame background. SGP4 returns TEME (True Equator Mean Equinox); see `SGP4.md` and `ORBITAL_MECHANICS.md`. |

## Source Roles in the SENTINEL Pipeline

- **Operational data** (#3): Drives every screening run. Without it, the pipeline degrades to `DEMO` data and the UI is badged accordingly.
- **Metadata enrichment** (#5): Resolves object names, types, and launch dates when GP fields are ambiguous.
- **Independent validation** (#6, #7): Used by `POST /api/socrates` (see `API.md`) to compare SENTINEL-predicted TCA / range / rel-vel against a second pipeline.
- **Standards conformance** (#4, #13): Drives the OMM field normalization and CDM import/export.
- **Methodology context** (#8, #9, #10, #11, #12): Justifies the explicit "this is not a Pc" disclaimer in `RISK_MODEL.md` and `LIMITATIONS.md`.
- **Reference frame documentation** (#14): Anchors the TEME discussion in `ORBITAL_MECHANICS.md`.

## Provenance and Trust

Every `Conjunction` row in the SENTINEL database records the exact source URL group, snapshot timestamp, and `rawHash` of the OMM record it was derived from. A user who clicks "How do we know this is real?" sees the upstream URL, the fetch timestamp, the SHA-256 of the raw element set, and the propagator (SGP4 v1.0.10) used to derive the conjunction. See `API.md` — `GET /api/provenance/{id}`.

## Disclaimer

These public sources are intended for situational awareness, education, and research. They are **not authoritative** for flight safety decisions. Authoritative conjunction data for operational spacecraft must be obtained from the spacecraft owner/operator's assigned SSA provider, the U.S. 18th Space Defense Squadron (18 SDS), or NASA CARA for robotic assets. See `LIMITATIONS.md`.
