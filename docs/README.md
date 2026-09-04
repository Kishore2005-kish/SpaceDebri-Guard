# SENTINEL Documentation

> SENTINEL — Conjunction Awareness for Small-Sat Operators (PS-04.3)

A prototype decision-support platform that fetches **real CelesTrak GP/OMM orbital data**, propagates it with **real SGP4**, screens for close approaches over a 7-day horizon, computes an **explainable heuristic risk score** (NOT a probability of collision), simulates hypothetical maneuvers, and validates results against the public **CelesTrak SOCRATES** reference.

## Documentation index

| File | What it covers |
| --- | --- |
| [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) | Problem, solution, what makes this real |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | End-to-end architecture diagram + module layout |
| [DATA_SOURCES.md](./DATA_SOURCES.md) | Every public URL we use (CelesTrak, SATCAT, SOCRATES, NASA CARA, CCSDS) |
| [CELESTRAK_INTEGRATION.md](./CELESTRAK_INTEGRATION.md) | How we fetch, parse, normalize, and cache real GP/OMM data |
| [ORBITAL_MECHANICS.md](./ORBITAL_MECHANICS.md) | Tutorial: orbits, state vectors, TLE, OMM, SGP4, TCA, RIC, J2, why data age matters |
| [SGP4.md](./SGP4.md) | SGP4 propagator wrapper: API, version, frame (TEME), catalog ID handling, validation |
| [CONJUNCTION_DETECTION.md](./CONJUNCTION_DETECTION.md) | The 8-step screening pipeline + pseudocode |
| [TCA_ALGORITHM.md](./TCA_ALGORITHM.md) | The coarse-to-fine + analytical TCA refinement math |
| [RISK_MODEL.md](./RISK_MODEL.md) | The 5-factor heuristic risk score with sample calculation |
| [CONFIDENCE_MODEL.md](./CONFIDENCE_MODEL.md) | The separate 0-100 data-confidence score |
| [MANEUVER_SIMULATION.md](./MANEUVER_SIMULATION.md) | Hypothetical burn what-if simulator + post-maneuver re-screen |
| [SOCRATES_VALIDATION.md](./SOCRATES_VALIDATION.md) | Compare our results against public SOCRATES data |
| [CDM.md](./CDM.md) | CCSDS Conjunction Data Message support |
| [API.md](./API.md) | Every HTTP endpoint with examples |
| [DATABASE.md](./DATABASE.md) | Prisma schema (PostgreSQL-compatible; SQLite for the prototype) |
| [FRONTEND.md](./FRONTEND.md) | React/Next.js UI architecture and key components |
| [AI_ASSISTANT.md](./AI_ASSISTANT.md) | LLM-powered assistant — explains deterministic facts only, never authorizes maneuvers |
| [TESTING.md](./TESTING.md) | Test plan + how to run tests |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | How to deploy (with direct CelesTrak HTTPS access) |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues and fixes |
| [LIMITATIONS.md](./LIMITATIONS.md) | What this prototype does NOT do |
| [USER_GUIDE.md](./USER_GUIDE.md) | 20-step beginner tutorial |
| [HACKATHON_DEMO.md](./HACKATHON_DEMO.md) | 5-minute evaluator walkthrough |
| [README.md](../README.md) | Top-level overview |

## Why we don't claim collision probability

NASA CARA explicitly states:

> "TLE-derived analytic theory data does not provide the covariance needed for probabilistic collision assessment."

References:
- https://www.nasa.gov/cara/research-and-development-2/
- https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/

We follow this rule strictly. SENTINEL shows:

```
CONJUNCTION RISK SCORE: 82/100 (heuristic, NOT probability of collision)
DATA CONFIDENCE: 64/100
Professional probability of collision: UNAVAILABLE
  (covariance information is not in the public GP dataset)
```

## Safety disclaimer

Every maneuver result is labeled:

> "Simulation only — not a flight command. Operational decisions require authoritative orbital data and qualified flight-dynamics analysis."

The system produces NO autonomous spacecraft commands.
