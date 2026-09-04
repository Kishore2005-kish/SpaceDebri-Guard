# SENTINEL — Maneuver What-If Simulator

## Purpose

When a conjunction is flagged CRITICAL or HIGH, the operator's next question is: *"If I burn now, does the conjunction go away — and does it create any new ones?"* SENTINEL's maneuver simulator answers that question for a hypothetical ΔV applied at a chosen time before TCA.

This is **not** a flight-readiness maneuver planner. It does not optimize fuel, account for attitude constraints, model thruster curves, or interface with a flight operations system. It is a what-if exploration tool that lets the analyst see, in seconds, whether a candidate burn is even worth modeling in a real propagator.

## Burn Times

SENTINEL simulates burns at six canonical times before TCA:

| Burn time before TCA | Operator context                          |
|----------------------|-------------------------------------------|
| 72 h                 | Long-lead, low-cost slot.                 |
| 48 h                 | Standard planning lead.                   |
| 36 h                 | Backup to 48 h if rejected/failed.        |
| 24 h                 | Late planning, still cheap.              |
| 12 h                 | Urgent; increasing ΔV cost.              |
| 6 h                  | Last-resort, expensive burn.             |

Earlier burns require less ΔV for the same miss-distance improvement (because the trajectory has more time to diverge), but commit the operator to a plan with less current information. Later burns are cheaper to plan but more expensive to execute and riskier operationally.

## Directions

The ΔV is applied in the primary's **RIC frame** (`ORBITAL_MECHANICS.md` §10) — three independent scenarios:

- **Radial (+R / −R)**: thrust outward/inward along the position vector. Most efficient at changing *altitude* and therefore *phasing*; commonly used for collision avoidance because a small radial kick at apogee shifts the orbital period.
- **Along-track (+I / −I)**: thrust forward/backward along the velocity vector. Most efficient at changing *orbital energy* and therefore *period*. A small prograde burn raises the opposite side of the orbit; a retrograde burn lowers it.
- **Cross-track (+C / −C)**: thrust normal to the orbital plane. Most efficient at changing *inclination* and *RAAN*; rarely used alone for conjunction avoidance but useful for out-of-plane geometry.

Each direction is simulated independently with the default ΔV magnitude.

## Default ΔV

The default ΔV is **0.05 m/s along-track** (the most common conjunction-avoidance direction), with a range of 0.05–0.12 m/s explored for the comparison sweep. This range brackets the actual burns Starlink and the ISS execute for collision avoidance — typically tens of mm/s to a few cm/s.

## Algorithm

For each (burn_time, direction, ΔV) scenario:

1. **SGP4 propagate the primary** from its epoch to `t_burn = TCA − burn_time`. This gives the primary's state `(r_burn, v_burn)` at the burn in TEME.
2. **Construct the RIC basis** at `(r_burn, v_burn)`:
   - `R̂ = r_burn / |r_burn|`
   - `Ĉ = (r_burn × v_burn) / |r_burn × v_burn|`
   - `Î = Ĉ × R̂`
3. **Apply the ΔV** in the chosen direction:
   - `v_after = v_burn + ΔV · d̂` where `d̂ ∈ {R̂, Î, Ĉ}`.
4. **Convert back to classical elements** via the `cartesianToClassical(r_burn, v_after, μ)` helper. This gives a new set of `(a, e, i, Ω, ω, M)` at `t_burn`.
5. **Construct a new `OrbitalObject`** (the "post-maneuver primary") carrying the new elements + the same catalog metadata + a `source = 'MANEUVER_SIMULATION'` flag.
6. **Re-screen** the post-maneuver primary against:
   - the original secondary (does the original conjunction go away?),
   - **and every other satellite in the catalog** (does the burn create a *new* conjunction?).

Step 6 is the crucial one — SENTINEL does not assume the original conjunction is resolved by the burn. Avoiding one conjunction can produce another, because a small period change shifts phasing against every other co-altitude object.

## Re-screening

The re-screening reuses the full pipeline (`CONJUNCTION_DETECTION.md`) for the single post-maneuver primary against the catalog. Because only one object changes, this is much cheaper than a full catalog refresh (it is O(N) rather than O(N²)). The simulator reports:

- `original_conjunction`: miss distance after burn (should grow if burn is effective).
- `new_conjunctions`: list of any new pairs created, each with TCA, miss, rel-vel, risk.
- `max_new_risk`: the highest risk among new conjunctions (this caps how good the burn is).
- `delta_v_used`: total ΔV applied (m/s).
- `passes`: boolean — does this scenario resolve the original conjunction below threshold AND introduce no new CRITICAL conjunction?

## Scenario Comparison

The simulator tabulates all scenarios (6 times × 3 directions × ΔV sweep, e.g. 18 or 36 rows). The **best scenario** is highlighted with a ★ marker and is selected by the rule:

```
best = scenario with:
  passes = true
  min delta_v_used
  max_new_risk < CRITICAL
  original miss_after > 5 km  (comfortable margin)
```

If no scenario satisfies these, no ★ is awarded and the table is presented "as-is" for the operator to judge.

## UI Integration

The simulator panel is part of the `ConjunctionDetail` overlay (`FRONTEND.md`), next to the 3D view and separation chart. The user clicks "Run Maneuver Simulation", waits for the POST to `/api/conjunctions/{id}/simulate` to return (`API.md`), and sees:

- A table of scenarios with star marker on the best.
- A 3D overlay showing the post-maneuver trajectory in a different color.
- An inline warning if `max_new_risk ≥ CRITICAL`.
- A "Re-screen against full catalog" inline result listing any new conjunctions.

## Limitations

- **No attitude / thruster model**: ΔV is treated as an impulsive point burn at `t_burn`. Real spacecraft need finite burn times and may have thruster-direction constraints.
- **No fuel accounting**: ΔV is a number; SENTINEL does not model propellant mass.
- **SGP4 limits**: The post-maneuver primary is propagated with SGP4 — which was never designed for maneuvers. SGP4 will treat the new elements as a fresh trajectory; over 1–3 days, the maneuver-shifted elements propagate correctly, but over multi-day horizons the drag model (`BSTAR`) is unchanged from the original which can introduce error.
- **Same elements, same epoch**: The post-maneuver primary carries the *same* epoch as the original, with a `MANEUVER_SIMULATION` source flag and a `parentConjunctionId` foreign key for provenance.

## Reference URLs

- NASA CARA maneuver planning methodology: https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/
- CelesTrak GP/OMM API (data source for primary/secondary): https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- SGP4 reference code (Vallado): https://celestrak.org/software/vallado-david-a/
