# SENTINEL — SGP4 Propagator Usage

## The Package

SENTINEL uses the `sgp4` npm package — version **1.0.10** (lockfile pinned). This package is a direct JavaScript port of the reference `python-sgp4` implementation maintained by Daniel Warner and CelesTrak, which in turn derives from the official Air Force Space Command SGP4 reference in Vallado's *Fundamentals of Astrodynamics and Applications*. All propagation uses the **WGS84** ellipsoid constants (Earth radius `6378.137 km`, J2 `1.082616e-3`, etc.) baked into the package.

## The Direct-Init Trick (Why We Don't Use `twoline2rv`)

The `sgp4` package exposes a convenience entry point `twoline2rv(line1, line2)` that parses a TLE pair and initializes a `satrec`. SENTINEL **does not use this** for two reasons:

1. The legacy TLE format reserves only **5 digits** for the catalog ID, breaking on the 6+ digit IDs now common in the catalog (see `ORBITAL_MECHANICS.md` and `TROUBLESHOOTING.md` issue #5).
2. SENTINEL stores OMM (JSON) elements, not TLE strings, so it already has named fields.

Instead, SENTINEL calls `sgp4init(...)` directly on the normalized OMM record. The relevant signature is:

```ts
import { sgp4init, sgp4 } from 'sgp4';

const satrec = sgp4init(
  satnum,        // number  — NORAD catalog ID (cast from string)
  whichconst,    // 'wgs84' (SENTINEL default) | 'wgs72' | 'wgs72old'
  bstar,         // BSTAR drag term (unitless)
  nddot,         // mean motion second derivative
  ndot,          // mean motion first derivative
  ecco,          // eccentricity
  argpo,         // argument of pericenter, radians
  inclo,         // inclination, radians
  mo,            // mean anomaly, radians
  no,            // mean motion, rad/min  ← NOT rev/day, see note
  nodeo,         // RAAN, radians
  satrec,        // an empty Satrec instance (mutated in place)
);
```

The package expects the mean motion `no` in **radians per minute**, so SENTINEL converts `meanMotion` (rev/day) → rad/min:

```ts
const no = (meanMotion * 2 * Math.PI) / 1440;
```

Angles (inclination, RAAN, argument of pericenter, mean anomaly) are converted from degrees to radians before being passed in.

## The Epoch Fix — Critical

The `sgp4` package's own `twoline2rv` internally calls `jday(...)` to set `satrec.jdsatepoch` (the Julian date of the epoch) and `satrec.jdsatepochF` (the fractional part). When you call `sgp4init()` directly, **this is not done for you**. If you propagate without setting `satrec.jdsatepoch`, the `sgp4()` call returns `NaN` for the position because the internal `deltat` calculation has nothing to subtract from.

The convention used by the package is:

```ts
// satrec.jdsatepoch must equal the full Julian Date of the epoch
// minus the J2000 reference offset 2433281.5 (Vallado convention).
satrec.jdsatepoch = epochJD - 2433281.5;
```

Where `epochJD` is computed from the OMM `EPOCH` ISO string via a standard `Date → Julian Date` conversion. SENTINEL performs this in `src/lib/sgp4/initSatrec.ts`. **Forgetting this step is issue #2 in `TROUBLESHOOTING.md`** — symptom: `position` is `[NaN, NaN, NaN]`.

## The TEME Frame

SGP4 returns state vectors in the **TEME** (True Equator Mean Equinox) frame. TEME is an Earth-centered inertial-like frame in which the equator is the true equator of date, but the x-axis points to the mean equinox of date. It is **not** the same as the standard J2000 ECI frame used in most flight dynamics code — converting TEME → J2000 requires a full precession/nutation model.

SENTINEL **does not** convert frames. Because every conjunction is computed pairwise (primary vs secondary) in the same TEME frame, the relative position `r_rel = r_primary - r_secondary` is well-defined in TEME and frame-consistent. The 3D visualizer renders TEME coordinates directly (after a simple ECEF-like rotation for display, see `FRONTEND.md`).

For authoritative frame reference, see https://en.wikipedia.org/wiki/Earth-centered_inertial.

## Satrec Cache

Initializing a `Satrec` (calling `sgp4init`) is ~10× more expensive than a single `sgp4` propagation, and SENTINEL may propagate the same object thousands of times during a screening run. Therefore every `Satrec` is cached in a module-level `Map<noradCatId, Satrec>` keyed by the catalog ID. The cache is invalidated when the satellite's `rawHash` changes (i.e. a refresh replaced the element set).

```ts
const satrecCache = new Map<string, Satrec>();

function getSatrec(sat: Satellite): Satrec {
  const cached = satrecCache.get(sat.noradCatId);
  if (cached && cached.rawHash === sat.rawHash) return cached.satrec;
  const satrec = initSatrec(sat);
  satrecCache.set(sat.noradCatId, { satrec, rawHash: sat.rawHash });
  return satrec;
}
```

## Propagated State Shape

A single `sgp4(satrec, minutesSinceEpoch)` call returns:

```ts
{
  position: [x, y, z],  // km, TEME
  velocity: [vx, vy, vz], // km/s, TEME
  error: 0 | 1 | 2 | ..., // 0 = OK, nonzero = SGP4 error code
}
```

SENTINEL's wrapper (`propagateSat(sat, dateMs)` in `src/lib/sgp4/propagate.ts`) accepts an absolute `Date` (milliseconds), computes `minutesSinceEpoch = (dateMs - epochMs) / 60000`, calls `sgp4(...)`, and returns a normalized `{ r: [x,y,z], v: [vx,vy,vz] }` object. If `error !== 0`, the wrapper returns `null` and logs the event; downstream screening treats `null` as "object unavailable for this time step" and skips it.

## Validation — ISS

A built-in sanity test propagates the ISS (NORAD 25544) to its own epoch (so `minutesSinceEpoch = 0`). Expected:

- `|r|` ≈ 6,780–6,820 km (Earth radius + ~415 km altitude)
- `|v|` ≈ 7.66 km/s (circular-orbit speed at that altitude)

If either is off by more than ~10%, the `initSatrec` pipeline has a bug (most commonly: missing `jdsatepoch` set, mean-motion unit mismatch, or a degrees/radians error). This is wired up in `scripts/test-sgp4.ts` — see `TESTING.md`.

## Reference URLs

- sgp4 on npm: https://www.npmjs.com/package/sgp4
- python-sgp4 reference: https://github.com/celestrak/sgp4
- Vallado's *Fundamentals of Astrodynamics* companion code: https://celestrak.org/software/vallado-david-a/
- Background on TEME frame: https://en.wikipedia.org/wiki/Earth-centered_inertial
- CelesTrak OMM documentation: https://celestrak.org/NORAD/documentation/gp-data-formats.php
