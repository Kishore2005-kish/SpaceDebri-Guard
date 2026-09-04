# SENTINEL — AI Assistant

## Overview

SENTINEL includes an LLM-powered conversational assistant backed by the `z-ai-web-dev-sdk`. The assistant lives in the `AiAssistant` floating panel (`FRONTEND.md`) and answers analyst questions about the currently selected conjunction, the screening run, or general concepts. It is **deterministic by design** — the LLM is fed a fact sheet, not a free-form prompt — and **bounded by a strict system prompt** that forbids it from inventing numbers, doing orbital-mechanics math, or authorizing flight decisions.

The `z-ai-web-dev-sdk` is invoked **server-side only** (`POST /api/ai/ask` route handler), never on the client.

## The Fact Sheet

Every question is accompanied by a structured fact sheet built deterministically from the currently selected conjunction (or from the dashboard if no conjunction is selected). The fact sheet contains:

```
PRIMARY:
  name: ISS (ZARYA)
  noradCatId: 25544
  objectType: PAYLOAD
  epoch: 2024-01-15T12:34:56Z

SECONDARY:
  name: (some debris)
  noradCatId: 39468
  objectType: DEBRIS

CONJUNCTION:
  tca: 2024-01-18T03:14:22.817Z
  minRange: 0.096 km
  relVelocity: 14.2 km/s
  radialComponent: 28 m
  inTrackComponent: 75 m
  crossTrackComponent: 50 m

RISK:
  riskScore: 76 / 100     (CRITICAL)
  factors:
    distance: 0.72
    uncertainty: 0.90
    velocity: 0.95
    geometry: 0.70
    freshness: 0.50
  disclaimer: NOT a probability of collision; this is a 5-factor heuristic.

CONFIDENCE:
  confidenceScore: 59 / 100  (MEDIUM)
  penalties: age=15, source=5, format=0, covariance=15, propagation=6, metadata=0
  covarianceAvailable: false

DATA:
  source: CELESTRAK GP/OMM
  propagator: SGP4-1.0.10-WGS84-TEME
  snapshotId: abc123def456
  rawHash: sha256:...
  lastRefresh: 2024-01-16T09:00:00Z
```

The fact sheet is appended (as a fenced block) to the user's question and sent together. The LLM never sees a question alone.

## System Prompt — Hard Rules

The system prompt sent with every request contains these hard rules:

1. **Never invent numbers.** If a value is not in the fact sheet, say it is not available. Do not estimate TCA, miss distance, or velocity.
2. **Never calculate orbital mechanics.** If the user asks you to propagate an orbit, solve Kepler's equation, or compute a Pc, refuse and direct them to the appropriate tool (the pipeline, or for Pc, a real covariance-based tool like CARA_Analysis_Tools — https://github.com/nasa/CARA_Analysis_Tools).
3. **Never authorize a maneuver.** If asked *"should I execute this burn?"*, respond that SENTINEL is a screening tool, the AI is not in the command loop, and only the operator / flight director can authorize flight maneuvers. Specifically: this system cannot authorize, plan, or issue flight commands.
4. **Always reference the disclaimer** that the risk score is a heuristic, not a probability of collision, when answering risk questions.
5. **Always reference provenance** (source, snapshot, propagator) when answering "how do we know" questions.

These rules are enforced by the system prompt; the SDK endpoint retries with a stronger prompt if the first response violates them (a regex-based post-check rejects responses containing phrases like "the probability of collision is", "I estimate", or "you should execute").

## Rule-Based Fallback

If the `z-ai-web-dev-sdk` is unavailable (network failure, quota, sandbox without LLM access), the `/api/ai/ask` endpoint falls back to a deterministic rule-based responder that pattern-matches the question and returns a templated answer built from the fact sheet. The response includes `"source": "RULE_BASED"` (vs `"LLM"`) so the UI can badge it as not-AI-generated.

The rule-based responder handles the suggested questions (`why risky`, `which conjunction first`, `what is TCA`, `why is confidence low`, `compare maneuver scenarios`, `summarize today's events`, `should I execute this burn`) and otherwise returns a generic *"I cannot answer that without the LLM. Try one of the suggested questions."*

## Suggested Questions

The `AiAssistant` panel surfaces these as clickable chips:

- **Why is this event risky?** — explains the 5-factor breakdown and which factor dominates.
- **Which conjunction should I investigate first?** — sorts the current list by risk×confidence and points to the top.
- **What does TCA mean?** — definition of Time of Closest Approach; pointer to `TCA_ALGORITHM.md`.
- **Why is confidence low?** — walks through which confidence penalties are active (age / source / covariance / propagation / metadata).
- **Compare these maneuver scenarios.** — reads the `simulate` results and describes which scenario is best (★) and why; warns if any new conjunction was introduced.
- **Summarize today's events.** — counts by risk level; flags CRITICALs; reports last refresh timestamp.
- **Should I execute this burn?** — the canonical "no" answer, with the hard-rule explanation above.

## What the AI Assistant Is Not

- **It is not a Pc calculator.** It will not produce a probability of collision.
- **It is not an orbital mechanics solver.** It will not propagate orbits, solve Kepler's equation, or compute ΔV budgets.
- **It is not a flight operations authority.** It cannot authorize, plan, or issue maneuvers.
- **It is not a substitute for reading the docs.** Every answer that touches on a methodology cites the relevant doc (`RISK_MODEL.md`, `CONFIDENCE_MODEL.md`, `TCA_ALGORITHM.md`, etc.).

## API

```bash
curl -s -X POST /api/ai/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Why is this event risky?","conjunctionId":"42"}'
```

Response:
```json
{
  "answer": "This event is flagged CRITICAL because the miss distance (96 m) places the distance factor at 0.72, and the secondary is debris with no covariance, contributing 0.90 to the uncertainty factor. Note: this risk score is a heuristic, NOT a probability of collision. See RISK_MODEL.md.",
  "source": "LLM",
  "factSheetHash": "sha256:..."
}
```

## Reference URLs

- NASA CARA_Analysis_Tools (real Pc tool, not used by SENTINEL): https://github.com/nasa/CARA_Analysis_Tools
- NASA CARA Step 2 (Pc methodology context): https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/
- CelesTrak GP/OMM API (data source): https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
