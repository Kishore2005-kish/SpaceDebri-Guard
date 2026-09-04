# SENTINEL — Analytical TCA Refinement

## The Problem

After Stage 5 of the conjunction pipeline (`CONJUNCTION_DETECTION.md`), SENTINEL has localized TCA to within ±0.5 seconds by propagating both satellites at 1-second resolution over a ±2-minute window around the coarse minimum. For low-relative-velocity encounters (e.g. two co-planar LEO satellites with similar velocities), this is sufficient — the close-approach "window" (the duration for which `d < 1 km`) can be several seconds.

But for **high-relative-velocity encounters** — which are exactly the ones operators care about most — the close-approach window is sub-second. With a relative velocity of 10 km/s:

```
Time to traverse 1 km = 1 km / 10 km/s = 100 ms
```

A 1-second sampling rate has a Nyquist-style problem: the true minimum can fall anywhere between two adjacent 1-second samples, and the error in TCA can be up to ±0.5 s, which translates to a **miss-distance error of up to 5 km** (0.5 s × 10 km/s). That is larger than the threshold itself. A naive 1-second sweep would routinely misreport a 96-meter miss as a 4-km miss or vice versa.

The brute-force solution would be to re-propagate at millisecond resolution. But that is expensive: a fine grid of 240,000 propagations per pair (±2 min at 1 ms) × thousands of candidate pairs is intractable.

The analytical solution, derived below, is **O(1) per candidate** and gives sub-meter accuracy for typical conjunctions.

## Derivation

### Setup

At the fine-search minimum `t_fine`, SENTINEL has the relative state in TEME:

```
r_rel = r_primary(t_fine) - r_secondary(t_fine)
v_rel = v_primary(t_fine) - v_secondary(t_fine)
```

We treat these as vectors in inertial space. The relative position as a function of time, relative to `t_fine`, is:

```
r_rel(Δt) = r_rel + v_rel · Δt + (1/2) a_rel · Δt² + ...
```

### Key approximation

For a ±1-second window, `Δt` is small. The relative acceleration `a_rel` arises from differential gravity across the encounter geometry, of order `μ/R³ · |r_rel|` ≈ `3.5e-3 · |r_rel| m/s²` for LEO. Even for a 100 km miss, that's ~0.35 m/s² — over 1 second, the position contribution is `(1/2) · 0.35 · 1² ≈ 18 cm`, negligible compared to the kilometer-scale miss distances.

**Approximation**: assume `v_rel` is constant over the refinement window.

### Minimizing the squared distance

The squared miss distance as a function of `Δt` is:

```
f(Δt) = |r_rel + v_rel · Δt|²
      = |r_rel|² + 2 Δt (r_rel · v_rel) + Δt² |v_rel|²
```

Take the derivative and set it to zero:

```
f'(Δt) = 2 (r_rel · v_rel) + 2 Δt |v_rel|² = 0
```

Solve for `Δt`:

```
Δt* = - (r_rel · v_rel) / |v_rel|²
```

Therefore the refined TCA is:

```
t* = t_fine + Δt*
   = t_fine - (r_rel · v_rel) / |v_rel|²
```

### The refined miss distance

Substitute `Δt*` back into `f`:

```
f(Δt*) = |r_rel|² + 2 Δt* (r_rel · v_rel) + (Δt*)² |v_rel|²
```

With `Δt* = - (r_rel · v_rel) / |v_rel|²`, simplifying:

```
f(Δt*) = |r_rel|² - (r_rel · v_rel)² / |v_rel|²
```

So:

```
d* = sqrt( |r_rel|² - (r_rel · v_rel)² / |v_rel|² )
```

### Geometric interpretation

The dot product `r_rel · v_rel` is `|r_rel| |v_rel| cos(θ)` where `θ` is the angle between the relative position and relative velocity. The expression

```
|r_rel|² - (|r_rel| cos θ)² = |r_rel|² sin²θ
```

is the squared length of the component of `r_rel` **perpendicular to `v_rel`**. So `d*` is the perpendicular distance from the secondary's trajectory (a straight line at constant `v_rel`) to the origin — i.e. the closest the two satellites would come if they continued inertially from `t_fine`.

This is the standard "closest approach between a point and a moving line" formula, applied to the relative-motion frame. It is exact under the constant-`v_rel` approximation and accurate to sub-meter under the (much smaller) acceleration neglect.

## Implementation

The refinement is two lines of code after the fine search:

```ts
function refineTCA(r_rel: Vec3, v_rel: Vec3, t_fine_ms: number) {
  const rvDot   = dot(r_rel, v_rel);
  const vSq     = dot(v_rel, v_rel);
  if (vSq < 1e-9) return { tca: t_fine_ms, minRange: norm(r_rel) }; // degenerate
  const dtStar  = -rvDot / vSq;                                  // seconds
  const tca     = t_fine_ms + dtStar * 1000;                     // ms
  const rSq     = dot(r_rel, r_rel);
  const minRange = Math.sqrt(Math.max(0, rSq - (rvDot * rvDot) / vSq));
  return { tca, minRange };
}
```

The `Math.max(0, ...)` guards against the rare floating-point underflow that makes `rSq - (rvDot²/vSq)` slightly negative when the true miss is zero.

## When to Skip It

If the relative velocity is small (`|v_rel| < 0.5 km/s`) — typical for co-orbiting satellites in a constellation — the close-approach window is many seconds long and `t_fine` itself is accurate enough. SENTINEL still applies the refinement (it is cheap) but the correction `Δt*` is then typically < 1 s and the resulting `d*` is within meters of `d(t_fine)`.

## Why This Matters for the Risk Model

The refined `d*` is the value that enters the risk model (`RISK_MODEL.md`) as the miss-distance input. Without refinement, a true 96 m miss could be reported as 4+ km, dropping the event entirely out of the threshold and out of the operator's view. With refinement, SENTINEL reliably localizes even fast conjunctions to sub-100 m accuracy — bounded only by SGP4's own error floor, which is the confidence model's responsibility to express (`CONFIDENCE_MODEL.md`).

## Reference URLs

- CelesTrak SOCRATES (independent validation): https://celestrak.org/SOCRATES/
- NASA CARA methodology overview: https://www.nasa.gov/cara/
- SGP4 reference code (Vallado): https://celestrak.org/software/vallado-david-a/
- Background on TEME frame: https://en.wikipedia.org/wiki/Earth-centered_inertial
