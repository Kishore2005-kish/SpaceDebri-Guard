# SENTINEL — Risk Model

## Important Disclaimer (Read First)

**SENTINEL's risk score is NOT a probability of collision (Pc).** It is a transparent, auditable, 5-factor **triage heuristic** that surfaces which conjunctions most deserve an operator's attention. True probability of collision requires the position covariance of both objects at TCA — which public GP/OMM elements do not contain. Any sentence in the UI that says "risk" refers to this heuristic, never to a statistical Pc. See `LIMITATIONS.md` and NASA CARA's methodology at https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/.

## Formula

```
RiskScore (0–100) =
    w₁ · distance(p)        +
    w₂ · uncertainty(p)    +
    w₃ · velocity(p)        +
    w₄ · geometry(p)        +
    w₅ · freshness(p)
```

with weights:

| Factor     | Symbol         | Weight |
|------------|----------------|--------|
| Miss distance | `distance`  | **0.40** |
| Data uncertainty | `uncertainty` | **0.20** |
| Relative velocity | `velocity` | **0.15** |
| Encounter geometry | `geometry` | **0.15** |
| Data freshness | `freshness`  | **0.10** |
| Total      |                | **1.00** |

Each factor is a `p` ∈ [0, 1] where 1 = highest concern. The final `RiskScore ∈ [0, 100]` (multiply the weighted sum by 100).

## Factor Details

### 1. Miss distance (weight 0.40)

The refined miss `d*` (see `TCA_ALGORITHM.md`) is mapped through a saturating curve that emphasizes the sub-kilometer range and saturates below ~500 m:

```
distance(d) = clamp( log₁₀( 5000 / max(d, 5) ) , 0, 1 )
```

| Miss (m) | distance |
|----------|----------|
| 5        | 1.000    |
| 50       | ~0.83    |
| 96       | ~0.72    |
| 500      | ~0.39    |
| 1000     | ~0.22    |
| 5000     | 0.000    |

This captures the operator's intuition that a 100 m miss is qualitatively worse than a 1 km miss, but a 5 km miss is essentially the same risk as a 10 km miss — both are well outside any plausible collision footprint.

### 2. Data uncertainty (weight 0.20)

A penalty based on the **type and source** of the secondary's element set, because object type correlates with the typical position uncertainty of public GP data:

| Secondary type                          | uncertainty |
|-----------------------------------------|-------------|
| PAYLOAD                                  | 0.3         |
| ROCKET BODY                              | 0.5         |
| DEBRIS (no covariance available)         | **0.9**     |
| UNKNOWN                                  | 0.7         |

Debris is the worst case: small, hard to track, and its elements are typically less fresh. The penalty is applied uniformly; per-object covariance would refine this but is unavailable from public GP.

### 3. Relative velocity (weight 0.15)

Mapped linearly from 0 to 15 km/s into 0–1:

```
velocity(v) = clamp( v / 15, 0, 1 )
```

|v_rel| is the most physically meaningful collision input after miss distance: a 1 km/s grazing pass is far less dangerous than a 14 km/s head-on. The 15 km/s ceiling is set by LEO orbital speeds (≈7.5 km/s) doubled.

### 4. Encounter geometry (weight 0.15)

The relative position `r_rel` is decomposed in the primary's **RIC frame** (`ORBITAL_MECHANICS.md` §10). The risk model rewards misses that are **radially separated** (the satellites are at different altitudes and cannot physically collide) and penalizes misses that are **in-track / cross-track only**:

```
geometry = 1 - clamp( |r_R| / d*, 0, 1 )
```

Where `r_R` is the radial component of the miss vector and `d*` is the miss distance. A miss that is entirely radial (`|r_R| = d*`) gives `geometry = 0` (least concerning). A miss with no radial component (pure along-track) gives `geometry = 1` (most concerning — timing alone is preventing collision).

### 5. Data freshness (weight 0.10)

The age of the elements (epoch → screening time) is mapped linearly from 0 to 72 h:

```
freshness(age_h) = clamp( age_h / 72, 0, 1 )
```

Beyond 72 h, the score caps at 1 — further staleness does not further increase the risk because the risk is already as high as this factor can push it.

## Risk Levels

The numeric score maps to a categorical level used throughout the UI:

| Range | Level     | Color (Tailwind) | Operator action                                  |
|-------|-----------|------------------|--------------------------------------------------|
| ≥ 75  | CRITICAL  | red              | Immediate assessment, consider mitigation.        |
| 50–74 | HIGH      | orange           | Review; verify with secondary source / SOCRATES. |
| 25–49 | MODERATE  | amber            | Monitor; no action required.                     |
| < 25  | LOW       | green            | Routine.                                          |

## Sample Calculation — ISS at 96 m Miss

Suppose a 7-day screening run finds an ISS (NORAD 25544) close approach:

| Input | Value |
|-------|-------|
| `d*` (refined miss)         | 96 m |
| Secondary object type       | DEBRIS |
| `|v_rel|` at TCA            | 14.2 km/s |
| Radial miss share `r_R/d*`  | 0.30 (mostly in-track) |
| Element age                 | 36 h |

Compute each factor:

- `distance(96)` = `log₁₀(5000/96) = log₁₀(52.08) ≈ 0.718`
- `uncertainty(DEBRIS)` = 0.90
- `velocity(14.2)` = `14.2 / 15 ≈ 0.947`
- `geometry` = `1 - 0.30 = 0.70`
- `freshness(36)` = `36 / 72 = 0.50`

Weighted sum:

```
0.40 · 0.718  + 0.20 · 0.900 + 0.15 · 0.947 + 0.15 · 0.700 + 0.10 · 0.500
= 0.287 + 0.180 + 0.142 + 0.105 + 0.050
= 0.764
```

`RiskScore = 76.4 → CRITICAL`. This event is flagged red on the dashboard and offered to the maneuver what-if simulator.

## What This Score Does Not Capture

- **Probability of collision** — requires covariance, unavailable from public GP. NASA CARA's Pc methodology is at https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/.
- **Maneuverability of the primary** — a non-maneuverable payload cannot avoid anything; SENTINEL does not model this.
- **Object size / RCS** — a 1U cubesat vs the ISS have very different physical collision cross-sections; public GP has no shape data.
- **Solar/magnetic atmospheric state** — affects drag, but is unpredictable over 7 days.

## Reference URLs

- NASA CARA main page: https://www.nasa.gov/cara/
- NASA CARA Step 2 risk assessment: https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/
- NASA CARA Research & Development: https://www.nasa.gov/cara/research-and-development-2/
- NASA CARA publicly available software: https://www.nasa.gov/cara/publicly-available-cara-software/
- CARA_Analysis_Tools source (real Pc): https://github.com/nasa/CARA_Analysis_Tools
