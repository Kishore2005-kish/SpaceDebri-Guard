# Conjunction Validation Report

## Executive summary

The production `screen()` pipeline was exercised with 3 deterministic synthetic SGP4 scenarios: 2 of 2 expected encounters detected, 0 missed, and 0 unexpected detections.

This validates controlled software behavior only; no real-world conjunction accuracy claim is made.

## Production pipeline overview

The engine samples both objects every 60 seconds, selects local minima below 600 km, searches ±600 seconds at 1-second resolution, then applies a linear relative-motion TCA projection. It re-propagates the refined timestamp and accepts it only when the range improves. Final detection uses strict `minRange < thresholdKm`. States are TEME, km, and km/s.

## Analytical TCA validation

The independent linear-motion cases verify `t = -dot(r,v)/dot(v,v)` for nonzero relative velocity, clamp to interval boundaries, and report an undefined result for zero relative velocity. These cases are recorded in the JSON artifact.

## Detection results

| Scenario | Expected | Detected | TCA | Miss distance km | Relative velocity km/s |
|---|---|---|---|---:|---:|
| synthetic-showcase | detect | True | 2026-10-24T23:59:59.988Z | 0.09379746672864497 | 9.776283565140606 |
| synthetic-crossing | detect | True | 2026-10-23T11:59:59.982Z | 0.1905653235626634 | 10.765044549483457 |
| synthetic-safe-pair | no-detect | False | — | — | — |

## Thresholds and risk scoring

The configured thresholds and refinement behavior are recorded in the JSON artifact. Risk scoring is a weighted heuristic, not a collision probability: weighted sum of miss distance 40%, data uncertainty 20%, relative velocity 15%, geometry 15%, freshness 10%; rounded and clamped 0..100.

## Configuration findings

- Coarse, fine, and refinement configuration values are applied in `screen()` as documented.
- The public `screen()` function has no explicit distance/time/velocity filter beyond the coarse 600 km candidate threshold and final requested range threshold.
- Propagation exceptions during coarse/fine screening are not caught; malformed input can abort screening. This is documented only and was not changed.

## Independent reference comparison

No suitable historical conjunction reference dataset was found in the repository. Therefore precision, recall, and F1 against real events were not calculated.

## Limitations and recommendations

Synthetic SGP4 fixtures are labeled demo data and do not represent historical conjunctions. Add a provenance-controlled CDM/TLE reference dataset before assessing operational detection accuracy. Consider a structured error policy around propagation failures in a future production change.
