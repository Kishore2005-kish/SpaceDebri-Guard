# SGP4 Discrepancy Investigation

The original 15 comparisons were reproducible: 5 met the strict tolerance and 10 did not, with maximum position and velocity differences of approximately 514.53 km and 0.0375 km/s.

The comparison inputs were then audited. Both sides use the same deterministic OMM-style elements, UTC timestamps, WGS84, AFSPC mode, TEME, km/km/s, and the same `JD - 2433281.5` epoch convention. The Python call includes the required zero `ndot` and `nddot` arguments before eccentricity; this matches the installed Python `sgp4` API order. The production bridge and reference use identical timestamps, not separately retrieved element snapshots.

The discrepancy remains after reproducing the harness with the documented argument order. It is concentrated in longer propagation intervals and is largest for the synthetic long-lived GEO/LEO fixtures, while near-epoch errors are small. This is consistent with a numerical/implementation difference between npm `sgp4@1.0.10` and Python `sgp4==2.25`, but the current evidence does not isolate the exact internal constant or arithmetic difference.

No speculative production change is justified. Production `src/lib/orbital/sgp4.ts` was not altered for this issue. The test is implementation consistency only, not physical orbit accuracy; authoritative ephemerides and a broader fixture set remain necessary.

Invalid eccentricity, zero mean motion, null B*, and non-finite output cases were exercised. Invalid states are rejected or reported as failures; they are not converted into valid-looking vectors.
