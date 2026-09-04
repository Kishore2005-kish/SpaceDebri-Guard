# SENTINEL — Conjunction Detection Pipeline

## Goal

Given a catalog of N active satellites, find every pair (primary, secondary) whose separation distance falls below a configurable threshold (default 10 km) at any time within the screening window (default 7 days), and for each such pair compute the exact Time of Closest Approach (TCA), miss distance, relative velocity, and encounter geometry.

A naïve all-pairs N² propagation at 1-second resolution is intractable for N ≈ 10,000 satellites and 604,800 seconds in 7 days (~3.6 × 10¹⁰ propagations per pair, × 5 × 10⁷ pairs). SENTINEL uses an 8-stage pipeline with aggressive pruning to bring a full catalog screen down to minutes.

## The 8 Stages

### Stage 1 — Candidate filtering (altitude pre-filter)

Before propagating anything, SENTINEL pre-computes each satellite's apogee and perigee from its classical elements:

```
a = (μ / n²)^(1/3)              // semi-major axis from mean motion n (rad/s)
apo = a * (1 + e) - Re
per = a * (1 - e) - Re
```

Two satellites can only physically approach within distance `D` if their altitude bands overlap:

```
canApproachByAltitude(s1, s2, D) :=
  abs( (s1.apo + s1.per)/2 - (s2.apo + s2.per)/2 ) < D + (s1.apo - s1.per)/2 + (s2.apo - s2.per)/2
```

For a 600 km threshold, this immediately eliminates the vast majority of pairs (a Starlink at 550 km cannot approach a GEO satellite). The check is O(N²) but is constant-time per pair, and `apo/per` are precomputed once per refresh.

### Stage 2 — Coarse 60-second propagation

For each surviving candidate pair, SENTINEL propagates both objects every **60 seconds** across the screening window (so 10,080 samples over 7 days) and evaluates `d(t)`:

```python
for t in coarse_grid:
    r1 = propagate(primary, t)
    r2 = propagate(secondary, t)
    if r1 is None or r2 is None: continue
    d  = norm(r1 - r2)
    if d < COARSE_THRESHOLD (600 km): record sample (t, d)
```

This is the bottleneck. The 600 km threshold is chosen because SGP4 position error per day is ~1–3 km, and over a 60-second interval the satellites move at most ~14 km/s × 60 s ≈ 840 km — so any true conjunction inside 10 km is guaranteed to surface inside 600 km at the 60-second sampling rate. See `TCA_ALGORITHM.md` for the rigorous justification.

### Stage 3 — Distance evaluation

Each surviving `(t, d)` sample from Stage 2 is recorded. We keep only samples below 600 km. For a 7-day window and a typical active catalog, this typically reduces 10,000 pairs × 10,080 samples to a few thousand qualifying samples across all pairs.

### Stage 4 — Local minimum detection

Within the coarse sample stream for each pair, we look for local minima — a sample where `d(t_i) < d(t_{i-1})` and `d(t_i) < d(t_{i+1})`. Each local minimum is a candidate conjunction. Long stretches of sub-threshold (e.g. co-orbiting GEO satellites) are handled by retaining only the global min within each contiguous run.

### Stage 5 — Fine 1-second search

For each coarse minimum at `t_coarse`, SENTINEL refines by propagating every **1 second** over a ±2-minute window around `t_coarse`:

```python
fine_grid = [t_coarse - 120s ... t_coarse + 120s, step=1s]
d_fine_min, t_fine_min = min( (d(t), t) for t in fine_grid )
```

This localizes TCA to ±0.5 s. For slow encounters (relative velocity ~1 km/s, so the close-approach window is ~1 s), this is sufficient.

### Stage 6 — Analytical TCA refinement

For high-relative-velocity encounters (10+ km/s), the close-approach window is sub-100-ms, so 1-second sampling still misses TCA by tens of meters to kilometers. SENTINEL applies an analytical projection assuming constant relative velocity over the short window — see `TCA_ALGORITHM.md` for the full derivation:

```
t*  = t_fine - (r · v) / |v|²
d*  = sqrt( |r|² - (r · v)² / |v|² )
```

`t*` is the refined TCA, `d*` the refined miss distance. Both come from the relative state `(r, v)` at `t_fine`.

### Stage 7 — Relative state calculation

At `t*`, SENTINEL computes:

- `r_rel = r_primary(t*) - r_secondary(t*)` — TEME relative position.
- `v_rel = v_primary(t*) - v_secondary(t*)` — TEME relative velocity.
- The **RIC frame** decomposition of `r_rel`: project `r_rel` onto the primary's radial (R), in-track (I), and cross-track (C) unit vectors. The R/I share is the **geometry factor** input to the risk model.

### Stage 8 — Threshold check + event creation

If `d*` is below the conjunction threshold (default 10 km; 1 km triggers `HIGH` risk, 5 km triggers `MODERATE`), a `Conjunction` row is created in the database:

```
Conjunction:
  primaryId, secondaryId,
  tca = t*,
  minRange = d*,
  relVelocity = |v_rel|,
  radialComponent, inTrackComponent, crossTrackComponent,
  riskScore, confidenceScore,           // computed in the risk+confidence stage
  dataSource = 'CELESTRAK',
  propagator = 'SGP4-1.0.10-WGS84-TEME',
  snapshotId, analysisId                 // provenance
```

The row is then ready for the risk+confidence stage (see `RISK_MODEL.md` and `CONFIDENCE_MODEL.md`) and downstream visualization, maneuver simulation, and SOCRATES validation.

## Pseudocode (Compact)

```python
def screen_catalog(catalog, t_start, t_end, threshold_km=10):
    aps = {sat.id: (apo(sat), per(sat)) for sat in catalog}
    pairs = [
        (a, b) for a in catalog for b in catalog
        if a.id < b.id
        and canApproachByAltitude(a, b, aps, 600)
    ]
    for (p, s) in pairs:
        coarse = [(t, dist(p, s, t)) for t in coarse_60s_grid(t_start, t_end)]
        for window in find_sub_threshold_windows(coarse, 600):
            t_coarse_min = local_min_time(coarse, window)
            t_fine, d_fine = fine_1s_search(p, s, t_coarse_min, ±120s)
            r, v = relative_state(p, s, t_fine)
            t_star, d_star = refine_TCA(r, v, t_fine)   # see TCA_ALGORITHM.md
            if d_star < threshold_km:
                create_conjunction(p, s, t_star, d_star, |v|)
```

## Performance Notes

- **Single-threaded baseline**: A 1,000-satellite catalog screened for 7 days on a laptop runs in ~2–5 minutes after the altitude pre-filter.
- **Satrec cache**: The dominant cost is `sgp4()` calls; the cache (see `SGP4.md`) amortizes init.
- **Parallelism**: SENTINEL's screening loop is single-threaded in the prototype; a worker-thread pool over pairs is a natural extension and the database schema is ready for it (`analysisId` partitions the work).

## Reference URLs

- CelesTrak GP/OMM API: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- NASA CARA Step 2 (Pc methodology context): https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/
- Vallado SGP4 reference code: https://celestrak.org/software/vallado-david-a/
- SOCRATES (independent reference screening): https://celestrak.org/SOCRATES/
