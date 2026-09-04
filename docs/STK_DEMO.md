# STK Demo — 5-Minute Evaluator Script

> **A timed, click-by-click demonstration of SENTINEL's STK integration,
> designed for an evaluator with five minutes.** Every timestamp below is a
> cue, not a hard deadline — pause to answer questions.

---

## ⚠ Important Note on STK Availability

This demo is designed to run identically whether or not Ansys STK is
installed on the host. The orchestrator probes STK's Connect command port
(`127.0.0.1:5001`) at the start of every simulation:

- **If STK is installed, licensed, and running** → the simulation drives a
  real STK Advanced CAT analysis. The PROVE THIS PREDICTION panel's seventh
  item shows a green "STK Advanced CAT executed" check.
- **If STK is unavailable** → the simulation runs through the SGP4
  fallback engine, **clearly labeled "SENTINEL SGP4 (fallback)"** in every
  UI surface. The PROVE THIS PREDICTION panel's seventh item shows an amber
  "STK unavailable (SGP4 fallback used)" warning.

> **If STK is unavailable, the demo uses the SGP4 fallback (clearly labeled)
> and the result is still valid orbital mechanics — just not an STK
> professional analysis.** The 3D trajectory, TCA, minimum range, and
> relative velocity are all real SGP4 propagations of real CelesTrak data.

No part of the demo is faked. Both paths produce a real, defensible result.

Official STK references (for the evaluator who wants to verify the
professional path):
- Start a CAT tutorial — https://help.agi.com/stk/Content/training/StartCAT.htm
- Advanced CAT reference — https://help.agi.com/stk/Content/cat/Cat03.htm
- STK Python API — https://help.agi.com/stkdevkit/Content/python/pythonIntro.htm

---

## Pre-Demo Checklist (T-2 min)

- [ ] SENTINEL dev server running (`bun run dev`, port 3000).
- [ ] Preview Panel open on the right side of the IDE.
- [ ] If STK is installed: STK Desktop launched, Connect socket enabled on
      port 5001 (verify with `python3 scripts/check-stk.py` → `Status: READY`).
- [ ] Internet reachable (CelesTrak fetch goes through the
      `z-ai-web-dev-sdk` `page_reader` proxy).
- [ ] Catalog refresh run recently so the ISS / NORAD 25544 is present.

---

## Timeline

### 00:00 — Explain the Problem

> "Earth orbit has over 35,000 tracked objects larger than 10 cm. The U.S.
> Space Force publishes their positions daily as Two-Line Element sets on
> CelesTrak. An operator's job is to know, at every moment, whether any of
> those objects will come close enough to a protected asset to matter — and
> to defend that answer to a safety review. SENTINEL does the screening,
> shows the answer explainably, and hands off to STK for the professional
> high-fidelity analysis when a license is available."

Point at the dashboard top bar — show the live conjunction count and the
"data freshness" indicator.

### 00:30 — Select a Real Satellite (ISS / NORAD 25544)

Navigate to the **Satellites** tab. Filter or search for the ISS:

- Name: `SPACE STATION` (or `ISS (ZARYA)`)
- NORAD catalog ID: `25544`
- Source field: `CelesTrak`

> "This is the real International Space Station — NORAD catalog ID 25544.
> Notice the catalog ID is stored as a string, so six-digit and larger IDs
> are never truncated. The `retrievedAt` timestamp shows when we last
> pulled this from CelesTrak."

### 01:00 — Show Real CelesTrak Data

Open the satellite detail. Show the orbital elements card:

- `epoch` — the TLE epoch (a real UTC timestamp).
- `meanMotion`, `eccentricity`, `inclination`, `raan`, `argPerigee`,
  `meanAnomaly`, `bstar` — all populated from the CelesTrak OMM JSON.
- `source: CelesTrak`.

> "These elements are the same ones published on celestrak.org — fetched
> through a page-reader proxy, not a synthetic demo set. You can verify
> the epoch against the live CelesTrak page if you like."

### 01:30 — Run SENTINEL Screening

Click the **SCREEN** button (or trigger the catalog-wide screen from the
dashboard). Show the conjunctions table populating.

> "SENTINEL just ran SGP4 — the same SGP4 the U.S. Space Force uses for
> GP data — across the catalog and found every close approach within the
> screening window. Each row is a real conjunction, not a placeholder."

### 02:00 — Open a Real Conjunction

Pick the conjunction involving the ISS (or the closest one in the table).
Click into the detail page. Show:

- Primary + secondary names + catalog IDs.
- Predicted TCA, minimum range, relative velocity.
- Risk-explanation card.
- The two action buttons: **"RUN ORBITAL SIMULATION"** and
  **"PROVE THIS PREDICTION"**.

### 02:30 — Click "PROVE THIS PREDICTION"

This scrolls to / highlights the PROVE THIS PREDICTION panel and triggers
the seven-item checklist.

> "Before we even run the simulation, SENTINEL shows you what is
> defensible about this prediction right now."

Walk through the seven items:

1. ✓ **Real CelesTrak data** — point at the `source` field.
2. ✓ **Real catalog IDs (no truncation)** — point at the 5- or 6-digit ID.
3. ✓ **Real SGP4 propagation** — name the `sgp4` npm@1.0.10 package.
4. ✓ **Trajectory from actual state vectors** — note this is pending the
   simulation run.
5. ✓ **Engine comparison (SENTINEL vs STK vs SOCRATES)** — note this is
   pending the simulation run.
6. ✓ **Provenance recorded** — note the `SimulationRun` row will be created.
7. ⚠ / ✓ — **the engine-disclosure item.** If STK is running, this is green;
   if not, it's amber.

### 03:00 — Simulation View Opens

Click **"RUN ORBITAL SIMULATION"**.

> "POST `/api/simulation/stk/run` returns a `simulationId` instantly. The
> actual analysis runs in the background — STK's Advanced CAT can take
> minutes for a large secondary set, so we never block the HTTP request."

The SimulationView opens. Show the status badge cycling through:
`QUEUED → STARTING_STK → LOADING_DATA → RUNNING_CAT → EXTRACTING_RESULTS
→ COMPLETE` (or `QUEUED → STARTING_STK → PROPAGATING → COMPLETE` for the
fallback). Point at the **SIMULATION ENGINE** badge — read its label aloud:

- If STK ran: **"STK Advanced CAT"**.
- If fallback ran: **"SENTINEL SGP4 (fallback)"**.

> "This badge is the honest disclosure. It is never ambiguous. If STK is
> unavailable, you see SGP4 (fallback) here, not a fake STK label."

### 03:30 — Show Two Objects Approaching in 3D

Press **play** on the time control. The 3D canvas animates both orbit tracks
in TEME. As the simulation time advances toward TCA, the two tracks
converge. A closest-approach line is drawn between them with a live distance
label.

> "Every frame is a real propagated state vector at that instant — 121 state
> vectors per object, ±1 hour around TCA, 60-second step. This is not
> keyframed animation."

Show the separation-vs-time chart converging to its minimum.

### 04:00 — Freeze at TCA — Minimum Separation

Click **Jump-to-TCA**. The view freezes at the time of closest approach.
Show:

- The minimum-separation number on the closest-approach label.
- The TCA timestamp in the time display (`TCA`).
- The relative-velocity readout.

> "This is the predicted minimum range between the two objects at the
> predicted time of closest approach. It is a close-approach prediction,
> not a collision prediction — those are different things."

### 04:15 — Compare SENTINEL vs STK vs SOCRATES

Point at the **ENGINE COMPARISON** table:

| Engine | TCA | Min Range (km) | Rel Vel (km/s) |
|--------|-----|-----------------|------------------|
| SENTINEL | … | … | … |
| STK (or SGP4 fallback) | … | … | … |
| SOCRATES | … or — | … | … |

> "Three independent engines on the same public data. If they agree to
> within a minute on TCA and a kilometer on range, the prediction is
> robust. The disagreement, when present, *is* the uncertainty — no
> single engine could surface it alone."

Then point at the **COLLISION PROBABILITY** panel — it reads `UNAVAILABLE`.

> "This is honest. A real probability of collision requires the position
> covariance, which public GP data does not contain. NASA CARA — the U.S.
> human-spaceflight standard — refuses to compute Pc without covariance
> for the same reason. SENTINEL shows UNAVAILABLE rather than fabricate a
> number." (https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/)

### 04:30 — Run a Hypothetical Maneuver

Open the **maneuver panel** (or click the maneuver button). Enter a
hypothetical ΔV — e.g.:

- `hours before TCA`: `12`
- `ΔV`: `0.05` m/s
- `direction`: `RADIAL`

Click **simulate maneuver**. A new `SimulationRun` row is created with the
maneuvered primary.

> "We did not modify the real catalog object. We applied a hypothetical ΔV
> to the primary's state, re-propagated, and re-screened against the same
> secondary."

### 05:00 — Changed Trajectory + Re-Screen

Show the new trajectory in the 3D canvas (a second track, offset from the
original). Show the new minimum range — ideally larger than the original.

> "The hypothetical maneuver moved the predicted minimum range from X to Y.
> That's the operator's decision-support output: did this maneuver buy us
> enough margin to be worth the propellant and the scheduling cost?"

Close by re-pointing at the PROVE THIS PREDICTION panel — now all seven
items are checked (or the seventh is amber, with the engine clearly
labeled).

> "Every number you just saw is defensible: real data, real propagation,
> engine-disclosed, provenance-recorded. That is what SENTINEL adds on top
> of — not instead of — STK."

---

## Fallback-Specific Talking Points

If the demo ran on the SGP4 fallback (the common case in the sandbox), add
this 20-second disclosure at 05:00:

> "You'll notice the SIMULATION ENGINE badge read 'SENTINEL SGP4 (fallback)'
> and the seventh PROVE THIS PREDICTION item is amber: 'STK unavailable
> (SGP4 fallback used)'. That is intentional and disclosed. The trajectory,
> TCA, minimum range, and relative velocity are all real SGP4 propagations
> of real CelesTrak data — valid orbital mechanics — but they are not an
> STK professional analysis. To upgrade this run to a real STK Advanced
> CAT result, install and license STK per `docs/STK_SETUP.md` and re-run;
> every other piece of the UI is unchanged."

---

## Post-Demo Q&A Cheat Sheet

| Question | Answer |
|----------|--------|
| "Is this real data?" | Yes — CelesTrak OMM via the page-reader proxy. `source` field is `CelesTrak`. |
| "Did you compute a collision probability?" | No — the panel reads UNAVAILABLE. Public GP data has no covariance; Pc would be fabricated. |
| "Is this STK?" | The engine badge says which. If amber, it's SGP4 (fallback) — still real orbital mechanics, disclosed as such. |
| "How do I get a real STK run?" | Install + license STK per `docs/STK_SETUP.md`, start STK Desktop, re-run the simulation. |
| "How fast is the SGP4 screen?" | Whole-catalog screen in seconds; per-conjunction simulation in a few seconds. STK CAT can take minutes. |
| "Where's the provenance?" | The `SimulationRun` row stores `stkScenarioId`, `stkAnalysisId`, `stkThreshold`, `stkResultTimestamp`, `stkRawReportHash`. |

---

## Reference: Routes Touched in This Demo

| Route | Purpose |
|-------|---------|
| `GET /api/satellites` | List / search the catalog (incl. ISS / 25544) |
| `GET /api/satellites/[id]` | Satellite detail + orbital elements |
| `POST /api/screen` | Run the catalog-wide SGP4 screen |
| `GET /api/conjunctions` | Conjunctions table |
| `GET /api/conjunctions/[id]` | Conjunction detail (TCA, min range, rel vel) |
| `GET /api/simulation/stk/status` | STK availability (cached 30 s) |
| `POST /api/simulation/stk/run` | Start a simulation (returns `simulationId` immediately) |
| `GET /api/simulation/stk/[id]` | Poll a simulation's status |
| `GET /api/simulation/[id]/trajectory` | 121 propagated state vectors per object |
| `GET /api/simulation/[id]/comparison` | SENTINEL vs STK vs SOCRATES table |
| `POST /api/simulation/stk/[id]/maneuver` | Apply a hypothetical ΔV + re-run |
| `GET /api/provenance/[id]` | Full provenance trail for a conjunction |

For the full architecture, see `docs/STK_INTEGRATION.md`. For the install
procedure, see `docs/STK_SETUP.md`. For the engine-comparison rationale, see
`docs/STK_VS_SGP4.md`. For the validation methodology behind every number
shown, see `docs/PREDICTION_VALIDATION.md`.
