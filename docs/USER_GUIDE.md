# SENTINEL — User Guide

A 20-step tutorial that walks an analyst from "I just opened SENTINEL" to "I have an exported report and a validated conjunction". Follow the steps in order; each step references the doc that explains the underlying mechanism.

## Prerequisites

- A browser pointed at the SENTINEL Preview Panel (see your platform instructions — never use `localhost:3000` directly).
- ~30 minutes for a full walkthrough, longer if you want to inspect every detail.

## The 20 Steps

### Step 1 — Start SENTINEL
Open the application in the Preview Panel. The first thing you'll see is the Dashboard view, with the `TopBar` showing the data mode badge (`LIVE` / `CACHED` / `DEMO`). On a fresh install with no prior refresh, the badge reads `DEMO` because the only data is the bundled synthetic catalog. That's normal. See `FRONTEND.md`.

### Step 2 — Select LIVE DATA
Click the `FETCH REAL CELESTRAK` button on the DashboardView (`FRONTEND.md`). This calls `POST /api/orbits/refresh` with `groups: ['stations', 'active']` (`API.md`). The button's label changes to `Fetching…` and the badge in the TopBar transitions through `CACHED` to `LIVE` when the refresh completes (typically 30–90 seconds for the `stations` group, several minutes for the full `active` set). See `CELESTRAK_INTEGRATION.md`.

### Step 3 — Refresh orbital catalog
After the refresh completes, the Dashboard's `Total Satellites` KPI updates to reflect the new catalog size (a few thousand for `stations`, ~10,000 for `active`). The `Latest Refresh` timestamp shows the completion time. If you ever need to refresh again, the same button works — it's idempotent (`DEPLOYMENT.md`).

### Step 4 — Search ISS / 25544
Click the `Catalog` tab in the `Sidebar`. In the search bar, type `iss` or `25544`. The `SatellitesView` (`FRONTEND.md`) filters live; you should see the `ISS (ZARYA)` card with NORAD ID `25544`, source badge `LIVE` (green border, indicating real CelesTrak data).

### Step 5 — Select the satellite
Click the ISS card. A `SatelliteDetail` drawer opens with the full OMM fields: epoch, mean motion, eccentricity, inclination, RAAN, argument of pericenter, mean anomaly, BSTAR, classification type, element set number, and the snapshot ID linking to the CatalogSnapshot row that produced this record.

### Step 6 — Start 7-day screening
In the `SatelliteDetail` drawer, click `Screen for 7 days`. This opens the Conjunctions view with a pre-populated `POST /api/screen` call (`API.md`) configured to screen just NORAD 25544 against the entire catalog for the next 7 days. Click `Confirm`. The button shows `Screening…` for several seconds to a minute (depending on catalog size and the altitude pre-filter, `CONJUNCTION_DETECTION.md`).

### Step 7 — Wait for analysis
The screening pipeline runs the full 8-stage algorithm: candidate filtering → coarse 60s → distance evaluation → local minimum detection → fine 1s → analytical TCA refinement → relative state → threshold check (`CONJUNCTION_DETECTION.md` + `TCA_ALGORITHM.md`). The `ConjunctionsTable` populates row by row as results come in.

### Step 8 — Open a conjunction
Click any row in the `ConjunctionsTable`. The `ConjunctionDetail` full-screen overlay (`FRONTEND.md`) opens. The header shows the primary + secondary names, the TCA timestamp, and the risk + confidence badges. If the row has a green `LOW` badge, you may want to scroll to a `CRITICAL` or `HIGH` row first.

### Step 9 — Inspect TCA
In the header, the TCA (Time of Closest Approach) is shown in UTC. Hover over it to see the element-set epoch of both objects (`ORBITAL_MECHANICS.md` §6). The closer the epoch is to "now", the more trustworthy the TCA.

### Step 10 — Inspect miss distance
The `Miss Distance` field shows the refined `d*` from the analytical TCA refinement (`TCA_ALGORITHM.md`). Values below 1 km are flagged in red text. The 3D visualizer's TCA marker is exactly at this closest-approach point.

### Step 11 — Inspect relative velocity
The `Relative Velocity` field shows `|v_rel|` at TCA, in km/s (`ORBITAL_MECHANICS.md` §9). LEO-LEO encounters range from 0.1 km/s (co-planar) to ~14 km/s (head-on). The risk model weights this factor at 0.15 (`RISK_MODEL.md`).

### Step 12 — Inspect data age
The `Data Age` field shows the time between the element epoch and the screening time. Beyond 48 h, the confidence model applies a +25 age penalty (`CONFIDENCE_MODEL.md`). Hover to see the breakdown.

### Step 13 — Inspect risk factors
The `Risk Explanation` section in the overlay shows the 5-factor breakdown:

- `distance`: how close (log-saturating curve).
- `uncertainty`: secondary-object type penalty (debris = 0.9).
- `velocity`: linear 0–15 km/s mapping.
- `geometry`: RIC along/radial share.
- `freshness`: element age 0–72 h mapping.

Above the breakdown, the explicit disclaimer: **"This is NOT a probability of collision."** See `RISK_MODEL.md`.

### Step 14 — Open 3D view
The orbit visualizer canvas (top of the overlay) renders both trajectories in TEME coordinates, with the primary in one color and the secondary in another. The TCA marker is a highlighted dot at the closest-approach point. Use the small dial to tilt the camera. The separation chart (Recharts line chart below) shows `d(t)` over the TCA window with a vertical line at the minimum.

### Step 15 — Run maneuver simulation
Click the `Run Maneuver Simulation` button in the `Maneuver Panel` section. This calls `POST /api/conjunctions/{id}/simulate` (`API.md`) with the default burn times (72/48/36/24/12/6 h before TCA) and the default ΔV (0.05 m/s along-track). The simulation runs the full algorithm in `MANEUVER_SIMULATION.md`: propagate to burn time, apply ΔV in RIC, convert back to elements, re-screen against the original secondary AND the entire catalog.

### Step 16 — Compare scenarios
The scenario table populates with rows for each (burn time, direction, ΔV) combination. The best scenario is marked with a ★ (`MANEUVER_SIMULATION.md` §"Scenario Comparison"). If any scenario introduces a new CRITICAL conjunction (the post-maneuver primary now approaches a different object), the table flags it in red. Hover over the scenario to see the post-maneuver trajectory overlaid on the 3D visualizer.

### Step 17 — Re-screen after maneuver
Click the `★ best scenario` row to expand it. The expansion shows:

- `original_conjunction.miss_after`: the post-burn miss distance against the original secondary (should be much larger than the original miss).
- `new_conjunctions`: any new close approaches the burn introduced.
- `passes`: whether the scenario resolves the original AND introduces no new CRITICAL.

### Step 18 — Inspect secondary conjunctions
If `new_conjunctions` is non-empty, click each new entry to open it in a second `ConjunctionDetail` overlay. This is the post-maneuver "did I just create a new problem?" check.

### Step 19 — Validate against SOCRATES
Close the maneuver scenarios and scroll to the `SOCRATES Comparison` section of the original overlay. Click `Compare with SOCRATES`. This calls `POST /api/socrates { conjunctionId }` (`API.md`), which fetches the public CelesTrak SOCRATES CSV and searches for the same primary/secondary pair. The result shows:

- `SENTINEL` TCA / range / rel-vel.
- `SOCRATES` TCA / range / rel-vel.
- `TCA error (min)` and `range error (km)`.

See `SOCRATES_VALIDATION.md`. If `matched: false`, the conjunction is outside SOCRATES' top-N published list — not a bug.

### Step 20 — Export report
At the top of the overlay, click `Export Report`. Two options appear:

- `Generate Analysis Report` — calls `POST /api/reports/generate` (`API.md`) with the current `analysisId`. The report aggregates the screening run: total objects, total conjunctions, distribution by risk level, top events, provenance (`DATABASE.md` — `AnalysisReport` row).
- `Export CDM` — calls `GET /api/cdm/{id}/export` (`API.md`) and downloads a CCSDS 508.0-B-1 KVN-format CDM (`CDM.md`). The CDM includes the explicit `RISK_SCORE_NOTE = "heuristic NOT probability of collision"` and `COVARIANCE = UNAVAILABLE` fields.

Open the report from the `Reports` view (or `GET /api/reports/{id}`).

## Done

You've gone from a fresh install to a validated conjunction with an exported report and provenance trail. The "How do we know this is real?" panel on the Dashboard now shows the snapshot ID, source URL, fetch timestamp, raw hash, and propagator version — the full provenance trail (`ARCHITECTURE.md` §13). Every claim SENTINEL makes about this event is traceable back to a public CelesTrak fetch.

## Reference URLs

- CelesTrak GP/OMM API: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CelesTrak SOCRATES (validation): https://celestrak.org/SOCRATES/
- NASA CARA (methodology context): https://www.nasa.gov/cara/
- CCSDS 508.0-B-1 CDM standard: https://ccsds.org/searchpubs/
