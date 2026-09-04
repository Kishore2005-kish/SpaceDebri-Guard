# Collision Assessment

SENTINEL uses a three-state traffic-light model for the *overall* status of a screening run. The states are deliberately conservative: RED is reserved for situations where a *probability of collision* has actually been computed, not merely where two objects come close.

## States

| State | Meaning |
|---|---|
| **GREEN** | No conjunction within the screening threshold was detected during the prediction window. |
| **YELLOW** | A conjunction was predicted — trajectories come within the threshold — but the *likelihood of collision* cannot be determined because the covariance data required to compute Pc is unavailable. |
| **RED** | A valid collision risk assessment has been performed and the resulting probability of collision exceeds the operator's acceptable threshold. |

RED is **not** triggered by "distance < X". A 1 km miss distance with a large along-track uncertainty and a small combined hard-body radius may correspond to a vanishingly small Pc; conversely a 5 km miss with a very tight covariance and a large hard-body radius can legitimately be RED. The state is driven by Pc, not by raw range.

## Risk Assessment Is Separate From Conjunction Screening

Conjunction screening answers *will two trajectories come close?* and is fully computable from public GP/TLE data via SGP4. Collision risk assessment answers *how likely is an actual physical impact?* and requires additional information that public GP data does not carry:

1. **Primary state covariance** (position and velocity uncertainty of the protected object).
2. **Secondary state covariance** (position and velocity uncertainty of the conjuncting object).
3. **Combined hard-body radius** (the sum of the physical radii of both objects, sometimes inflated by a safety factor).
4. **Encounter geometry** (relative velocity vector, b-plane orientation, encounter duration).

When any of these is missing — which is the common case with public CelesTrak GP data — the Pc column is rendered as `UNAVAILABLE`, not as a fabricated number. See NASA CARA Step 2: <https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/>.

## Do Not Substitute the Heuristic Risk Score for Pc

SENTINEL also publishes a `riskScore` in the range 0–100. This is a **five-factor weighted heuristic** (distance 40%, uncertainty 20%, velocity 15%, geometry 15%, freshness 10%) intended for triage and ranking. It is explicitly **not** a probability of collision and must never be divided by 100 and presented as Pc. When covariance is unavailable, the Pc field stays `UNAVAILABLE` regardless of how high `riskScore` is — a 90 risk score with no covariance is a YELLOW event, not a RED one.
