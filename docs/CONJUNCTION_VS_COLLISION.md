# Conjunction vs. Collision

A **conjunction** is a prediction that two trajectories will come within some screening distance of each other over a given time window. A **collision** is a physical impact between two bodies. The two are frequently conflated in popular coverage of "near misses"; SENTINEL keeps them strictly separate, in line with the NASA Conjunction Assessment Risk Analysis (CARA) framework.

## Why They Are Different

A conjunction is a *geometric* event: it depends only on the predicted positions of the two objects and a chosen threshold. Whether that conjunction translates into a non-negligible *probability of collision* depends on the uncertainty ellipses of both objects, the encounter geometry on the b-plane, the combined hard-body radius, and the relative velocity. Two objects can pass within 1 km of each other yet still have a Pc of 10⁻⁶ if their covariance ellipses are tight and the combined hard-body radius is small; conversely a 10 km miss can correspond to a Pc above the standard 10⁻⁴ maneuver threshold if the covariance is enormous.

## Miss Distance ≠ Collision Probability

Reporting a minimum range alone — "ISS and CYGNUS NG-24 passed at 952 m" — is informative for triage but says nothing about whether a collision was actually likely. The 952 m figure is a deterministic output of two SGP4 trajectories; it has no uncertainty band attached because public GP data carries no covariance. It is a conjunction, not a collision assessment.

## The Scientifically Correct Pipeline

```
CONJUNCTION PREDICTION  →  RISK ASSESSMENT  →  MITIGATION ANALYSIS
   (SGP4 + threshold)        (Pc with covariance)     (maneuver trade)
```

Each stage feeds the next but uses different inputs and answers a different question. SENTINEL implements the first two stages and exposes hooks for the third. Jumping straight from "conjunction" to "maneuver now" is the error this pipeline exists to prevent.

## NASA CARA References

- Step 1 — Conjunction Event Prediction: <https://www.nasa.gov/cara/step-1-conjunction-event-prediction/>
- Step 2 — Close Approach Risk Assessment: <https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/>
- Research and Development (covariance estimation, Pc methods): <https://www.nasa.gov/cara/research-and-development-2/>

## Why TLE/GP Data Is Insufficient for Mitigation Decisions

Public GP elements from CelesTrak contain only the mean elements and the SGP4 drag/mean-motion terms. They carry **no covariance**. Without covariance the Foster / Akasofu–Rhoades / Alfano Pc estimators cannot be evaluated, so any "probability of collision" derived purely from GP data is necessarily a fabrication. Operators with a real need to make maneuver decisions must obtain a Conjunction Data Message (CDM) from the U.S. Space Force 18th Space Defense Squadron, which does include covariance.

## SENTINEL Risk Score ≠ Pc

The SENTINEL `riskScore` (0–100) is a five-factor heuristic for ranking and triage. It is explicitly **not** a probability of collision. When covariance is unavailable — the default for public data — the Pc field is rendered as `UNAVAILABLE` no matter how high the risk score is. A high risk score with `UNAVAILABLE` Pc is a YELLOW event: interesting, worth watching, but not by itself a maneuver trigger.
