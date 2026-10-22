# Orbital Propagation Validation Report

## Executive summary

The production npm SGP4 wrapper was compared against Python `sgp4` 2.25 using identical OMM-style mean elements, epochs, timestamps, TEME frame, km and km/s units. 15 valid comparisons were evaluated; 5 met the predefined tolerance and 10 were outside it.

This is an implementation-consistency test, not evidence of real-world orbital accuracy.

## Existing implementation

`src/lib/orbital/sgp4.ts` calls `sgp4init()` directly with WGS84 gravity constants and AFSPC opsmode. It converts mean motion from rev/day to rad/min and angles from degrees to radians, sets the epoch as Julian Date minus 2433281.5, and explicitly sets `satrec.jdsatepoch`. It returns TEME position in km and velocity in km/s. Propagation errors throw; non-finite outputs are rejected by this validation bridge.

## Independent reference and protocol

Reference: Python `sgp4` 2.25, using the same direct `sgp4init()` inputs and Vallado-based implementation family. Cases cover ISS/LEO/polar/GEO regimes at epoch, +1 hour, +1 day, +7 days, and +30 days. Tolerances were defined before execution: position <= 1e-6 km and velocity <= 1e-9 km/s.

## Error statistics

- Position median / P90 / max: 1.422e-05 / 1.703e+01 / 5.145e+02 km
- Velocity median / P90 / max: 1.603e-08 / 1.241e-03 / 3.752e-02 km/s
- Tolerance result: FAIL

## Orbital-element age

Agreement is strongest near epoch and degrades for the GEO fixture at longer offsets, reaching hundreds of km by +30 days. This demonstrates that implementation agreement can remain useful near epoch while long-horizon differences accumulate; it does not establish that an old element set remains physically accurate for a real satellite.

## Error handling

Invalid eccentricity, zero mean motion, and null B* inputs were exercised. The exact production responses are recorded in `orbital_validation_results.json`; malformed input must be rejected or explicitly produce a failure, never silently treated as a valid state.

## Limitations and recommendations

No independent tracking or precise ephemeris comparison was performed. The Python and npm implementations share the Vallado SGP4 algorithm lineage, so this is an independent implementation check but not a wholly independent physical truth source. Add an authoritative ephemeris comparison and larger fixture set before making operational accuracy claims.
