# SENTINEL — Orbital Mechanics Primer

This document is a brief, self-contained tutorial on the orbital mechanics concepts that SENTINEL is built on. It is written for a reader who has a working knowledge of high-school physics and is meeting the SSA vocabulary for the first time. If you already know what a TLE, a TCA, and a TEME frame are, you can skip to `SGP4.md` and `CONJUNCTION_DETECTION.md`.

## 1. What is an orbit?

An orbit is the trajectory a body follows under the gravitational influence of a dominant central mass (for us, the Earth). Ignoring perturbations, an orbit is a closed ellipse — Kepler's first law — with the Earth at one focus. The shape of the ellipse is fully described by six **classical orbital elements** (also called Keplerian elements):

- **Semi-major axis (a)** — half the long axis of the ellipse; sets the orbital period.
- **Eccentricity (e)** — 0 for a circle, <1 for an ellipse.
- **Inclination (i)** — tilt of the orbital plane relative to the equator.
- **Right ascension of the ascending node (Ω / RAAN)** — longitude where the orbit crosses the equator going north.
- **Argument of pericenter (ω)** — orientation of the ellipse within the orbital plane.
- **Mean anomaly (M)** — position along the ellipse at the epoch.

Given these six numbers and an epoch time, the satellite's position can be computed at any future time (ignoring perturbations) by solving Kepler's equation.

## 2. What is a state vector?

An alternative representation is the **state vector**: a position `r` (3-vector, kilometers) and velocity `v` (3-vector, km/s) at a specific instant. Given `r` and `v`, the six classical elements can be computed analytically (and vice versa). SENTINEL uses state vectors internally because the SGP4 propagator produces them directly.

## 3. TLE — Two-Line Element set

A **TLE** is a legacy text format (two 69-character lines) that encodes the classical elements plus a drag-like term (`BSTAR`) and metadata. TLEs were defined in the 1970s when NORAD catalogued a few thousand objects. Two important constraints:

- The `NORAD_CAT_ID` field is **5 digits wide**, so catalog IDs ≥ 100000 (which exist today, post-2020) get truncated or misparsed.
- The epoch is encoded as `YYDDD.DDDDDDDD` (2-digit year, day-of-year), which is awkward to handle in modern code.

SENTINEL therefore prefers OMM (see below) and uses TLE only for legacy ingestion.

## 4. OMM — Orbit Mean-Elements Message

**OMM** is the CCSDS 502.0-B-2 standardized replacement for TLE. It is a JSON (or KVN) object with named fields, supports arbitrary-length catalog IDs, and uses ISO 8601 epochs. CelesTrak's `gp.php?FORMAT=JSON` endpoint returns OMM. SENTINEL fetches and stores OMM as its canonical element representation.

## 5. SGP4 — Simplified General Perturbations 4

**SGP4** is the analytic propagator the U.S. Space Surveillance Network uses to convert OMM/TLE elements into position and velocity. It accounts for:

- Earth's oblateness (the **J2 perturbation**) — the dominant gravitational perturbation in LEO, causing RAAN drift and pericenter rotation.
- Atmospheric drag (via `BSTAR` and the mean-motion decay terms).
- Some higher-order zonal harmonics (J3, J4) and lunar/solar gravity in a simplified way.

SGP4 is fast (microseconds per propagation) but its accuracy degrades over multi-day horizons because it does not model drag, solar radiation pressure, or maneuvers that occurred after the epoch. See `SGP4.md` for SENTINEL's exact usage.

## 6. Epoch

The **epoch** is the reference time at which the orbital elements are exactly correct. After the epoch, every propagation is a forecast whose error grows. Public GP elements from CelesTrak can be up to ~48 hours stale by the time SENTINEL fetches them, which is one of the dominant uncertainty sources — see `RISK_MODEL.md` and `CONFIDENCE_MODEL.md`.

## 7. TCA — Time of Closest Approach

For two satellites in independent orbits, the distance between them is a continuous function of time. The **TCA** is the time at which this distance reaches a local minimum during a screening window. SENTINEL finds the coarse minimum via a 60-second propagation sweep, refines it via a 1-second sweep, then applies an analytical projection to sub-second precision (see `TCA_ALGORITHM.md`).

## 8. Miss distance

The **miss distance** `d` at TCA is the scalar magnitude of the relative position vector:

```
r_rel(t) = r_primary(t) - r_secondary(t)
d(t)     = || r_rel(t) ||
TCA      = argmin_t  d(t)
```

If `d(TCA)` falls below a configurable threshold (default 10 km, with separate warning at 1 km and 5 km), the event becomes a **conjunction**.

## 9. Relative velocity

The **relative velocity** at TCA is:

```
v_rel(t) = v_primary(t) - v_secondary(t)
|v_rel|  = || v_rel(TCA) ||
```

For LEO-LEO encounters, `|v_rel|` is typically 0.1–14 km/s. A relative velocity of 10 km/s means the satellites close by 10 km every second — and the close-approach "window" (the time during which `d < 1 km`) can be under 100 ms. This is why 1-second sampling alone cannot localize TCA precisely; see `TCA_ALGORITHM.md`.

## 10. RIC frame — Radial / In-track / Cross-track

To describe the encounter geometry, SSA analysts use the **RIC frame** (also RTN: Radial / Transverse / Normal) attached to the primary satellite:

- **R (radial)** — points outward from Earth's center along the primary's position vector.
- **I (in-track / along-track)** — in the direction of the primary's motion (close to `v̂` for near-circular orbits).
- **C (cross-track)** — perpendicular to both, completing the right-handed system.

A miss in the radial direction is geometrically different from a miss in the along-track direction: a radial miss means the satellites are at different altitudes and cannot physically collide at TCA regardless of timing; an in-track miss means timing alone is preventing collision. SENTINEL's risk model uses the along-track / radial share of the miss vector as a **geometry factor** — see `RISK_MODEL.md`.

## 11. J2 perturbation

Earth is not a perfect sphere; it is an oblate spheroid (the equatorial radius is ~21 km larger than the polar radius). The largest spherical-harmonic correction to the central-force gravity is the **J2 term**, and SGP4 models it. The practical effect is:

- The orbital plane's RAAN precesses westward at a rate of approximately `-2.06374e14 * cos(i) / a^3.5 * (1-e²)^-2` degrees/day. For the ISS (`i ≈ 51.6°`), that's about -5°/day.
- The argument of pericenter rotates at a similar rate.

This means that even with no maneuvers, the geometry of an encounter can change significantly between screening runs separated by a few hours.

## 12. Why propagation error grows

SGP4 is an **analytic** propagator — it approximates the true equations of motion with closed-form series expansions. Sources of error after the epoch:

1. **Unmodeled maneuvers** — the satellite performed a burn; the elements no longer describe reality.
2. **Atmospheric drag variability** — `BSTAR` is a fitted parameter; drag itself varies with solar activity and atmospheric density, both unpredictable.
3. **Higher-order gravity terms** — SGP4 only models J2, J3, J4 (simplified).
4. **Solar radiation pressure** — not modeled for most GP objects.
5. **Third-body gravity** (Sun, Moon) — approximated, not full ephemeris.

Roughly, SGP4 position error grows as **~1–3 km per day** in LEO for typical GP elements.

## 13. Why data age matters

Because error grows with time since epoch, **data freshness** is a first-class risk input. A conjunction evaluated with 48-hour-old elements has an effective position uncertainty of kilometers — making a "96 m miss distance" physically meaningless as a collision probability. SENTINEL's risk model degrades the score for stale data (see `RISK_MODEL.md`) and the confidence model explicitly penalizes aged elements (see `CONFIDENCE_MODEL.md`).

## Reference URLs

- CelesTrak GP/OMM API: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CelesTrak GP data format documentation: https://celestrak.org/NORAD/documentation/gp-data-formats.php
- ECI / TEME background: https://en.wikipedia.org/wiki/Earth-centered_inertial
- NASA CARA risk assessment methodology: https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/
