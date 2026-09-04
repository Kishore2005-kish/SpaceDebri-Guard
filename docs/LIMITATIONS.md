# SENTINEL — Limitations

## Overview

SENTINEL is a transparent first-layer conjunction awareness tool. It is not professional SSA software, not a probability-of-collision calculator, and not an authoritative source of conjunction truth. The list below is exhaustive — the project ships these limitations explicitly to the user in the UI ("How do we know this is real?" panel), in the CDM export (`RISK_SCORE_NOTE`), and in every conjunction detail view.

If you are reading this and considering SENTINEL for an operational spacecraft decision: stop. Use your assigned SSA provider, 18 SDS, or NASA CARA.

## 1. Public GP/TLE data is not authoritative

SENTINEL's source elements are General Perturbations (GP) messages published by CelesTrak at https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON. These are derived from the U.S. Space Surveillance Network but are reformatted for public consumption. They are intended for situational awareness, education, and research — **not** for flight safety decisions. They may be:

- Stale (typically 12–48 hours between updates per object).
- Incomplete (some classified or recently-launched objects are excluded or classified `U`).
- Inaccurate compared to the special-perturbations (SP) ephemerides used by the operator.

Authoritative conjunction data for operational spacecraft must come from the spacecraft owner/operator's assigned SSA provider, the U.S. 18th Space Defense Squadron (18 SDS), or NASA CARA for robotic assets.

## 2. Heuristic risk score is NOT probability of collision

The `riskScore` field (0–100) is a 5-factor triage heuristic (`RISK_MODEL.md`) — it is **not** a probability of collision (Pc). True Pc requires position covariance of both objects at TCA, which public GP elements do not contain. The CDM exporter annotates every risk score with `RISK_SCORE_NOTE = "heuristic NOT probability of collision"` (`CDM.md`). The UI repeats this disclaimer on every conjunction detail view. See NASA CARA's methodology at https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/ for the proper Pc workflow.

## 3. Covariance is unavailable in the prototype

For every conjunction, SENTINEL records `COVARIANCE = UNAVAILABLE` in the exported CDM (`CDM.md`) and applies a +15 confidence penalty (`CONFIDENCE_MODEL.md`). Without covariance, SENTINEL cannot compute:

- A 3σ position uncertainty ellipsoid.
- A 2-D or 3-D Pc.
- A "dilution threshold" beyond which the predicted miss is meaningless.

The prototype accepts this; the production upgrade path is to install the NASA CARA_Analysis_Tools (https://github.com/nasa/CARA_Analysis_Tools) as a mini-service and ingest owner/operator covariance.

## 4. Maneuver simulations are hypothetical

The maneuver what-if simulator (`MANEUVER_SIMULATION.md`) applies an **impulsive, point-ΔV** at a chosen time before TCA. It does not model:

- Finite burn duration (real spacecraft burns take seconds to minutes).
- Thruster direction constraints (attitude coupling, plume impingement).
- Propellant mass / budget.
- Attitude dynamics before, during, or after the burn.
- Multi-burn sequences.

The simulator is a triage tool to answer "is this burn worth modeling in a real propagator?" — not a flight-ready maneuver planner. The post-maneuver re-screen against the full catalog is real (the same pipeline runs again with the maneuvered primary), but the underlying SGP4 propagation of a maneuvered object has its own accuracy limits (see #5).

## 5. SGP4 has accuracy limits over multi-day horizons

SGP4 is an analytic propagator (`SGP4.md`). Its position error grows roughly **1–3 km per day** in LEO for typical GP elements. Over a 7-day screening window, this means:

- TCAs predicted >5 days out have ±minutes of uncertainty.
- Miss distances predicted >5 days out have ±kilometers of uncertainty.
- The confidence model penalizes propagation horizon >5 days (`CONFIDENCE_MODEL.md`) — this is a direct acknowledgment of the error growth.

For sub-kilometer conjunctions >5 days out, the predicted miss is **statistically indistinguishable** from a collision. Operators should re-screen daily as elements refresh.

## 6. SENTINEL does not replace professional SSA

SENTINEL is a first layer of conjunction awareness. It surfaces candidates. It does not:

- Authorize maneuvers.
- Compute Pc.
- Issue CDMs to other operators (it can export a CDM, but it is not in the operator's formal CDM exchange workflow).
- Interface with flight operations systems.
- Replace Astroscale, LeoLabs, ExoAnalytic Solutions, or the U.S. SSA enterprise.

## 7. No autonomous spacecraft commands

SENTINEL does not command spacecraft. It does not issue thrust commands, attitude commands, or any flight directive. The AI assistant (`AI_ASSISTANT.md`) has a hard system-prompt rule that when asked "should I execute this burn?" it responds that the system cannot authorize or issue flight commands. There is no code path in SENTINEL that connects to a spacecraft's command uplink.

## 8. SOCRATES is a reference, not ground truth

The SOCRATES validation path (`SOCRATES_VALIDATION.md`) compares SENTINEL's predictions against the public CelesTrak SOCRATES product. SOCRATES is **also** computed from public GP via SGP4 — it is an independent implementation of the same pipeline, not an independent truth source. Agreement between SENTINEL and SOCRATES does not prove either is correct; it proves they don't have gross bugs in different directions. True ground truth requires owner/operator covariance and (ideally) tracking data.

## 9. Sandbox lacks direct HTTPS to CelesTrak

The default SENTINEL sandbox fetches CelesTrak through the `z-ai-web-dev-sdk` `page_reader` proxy (`CELESTRAK_INTEGRATION.md`), because the runtime environment cannot reach `celestrak.org` directly over HTTPS. This adds latency and a dependency on the SDK. For deployments with direct HTTPS access, set `USE_PROXY = false` in `src/lib/data/celestrak/client.ts` (`DEPLOYMENT.md`).

## 10. Risk model does not model object physical size or maneuverability

The risk score (`RISK_MODEL.md`) does not account for:

- The physical collision cross-section of the primary vs. the secondary (a 1U cubesat and the ISS have very different sizes).
- Whether either object is maneuverable (a non-maneuverable payload cannot avoid anything).
- The RCS / brittleness of either object.

These would refine the heuristic but are not available in public GP data.

## 11. Confidence model is a heuristic, not a position-uncertainty ellipse

The confidence score (`CONFIDENCE_MODEL.md`) tells the operator how much to trust the risk score. It is a penalty schedule — not a 3σ position uncertainty in kilometers. A confidence of 50 does not mean "±X km" — it means "treat this as advisory until you cross-check".

## Reference URLs

- CelesTrak GP/OMM API: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CelesTrak SOCRATES (reference, not ground truth): https://celestrak.org/SOCRATES/
- NASA CARA Step 2 risk assessment (Pc methodology): https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/
- NASA CARA publicly available software (upgrade path): https://www.nasa.gov/cara/publicly-available-cara-software/
- CARA_Analysis_Tools source (real Pc): https://github.com/nasa/CARA_Analysis_Tools
- CCSDS 508.0-B-1 CDM standard: https://ccsds.org/searchpubs/
