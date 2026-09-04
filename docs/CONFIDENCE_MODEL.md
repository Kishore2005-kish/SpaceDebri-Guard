# SENTINEL — Confidence Model

## Why a Separate Score?

The risk score (`RISK_MODEL.md`) tells the operator **how concerning** a conjunction is. The confidence score tells the operator **how much to trust the risk score itself**. They are deliberately separate axes: a 50 m miss against tracked debris is "high risk" but if the underlying elements are 60 hours stale and have no covariance, the confidence is low and the operator should treat the risk number as advisory, not authoritative.

The risk score answers: *"If the data is right, how bad is this?"*
The confidence score answers: *"How right is the data?"*

A high-risk + low-confidence conjunction is exactly the case where the operator should escalate to a second source (e.g. request an OCM from 18 SDS, or wait for the next CelesTrak refresh) rather than burn fuel on stale information.

## Formula

```
Confidence (0–100) = 100
                      − agePenalty
                      − sourcePenalty
                      − formatPenalty
                      − covariancePenalty
                      − propagationPenalty
                      − metadataPenalty
```

All penalties are non-negative. The score is clamped to `[0, 100]`. There is no "boost" — confidence only decreases from the baseline.

## Penalty Schedule

### Age penalty

Penalizes elements whose epoch is far from the screening time. Older elements → larger SGP4 propagation error → lower confidence in the predicted TCA / miss.

| Element age        | Age penalty |
|--------------------|-------------|
| ≤ 12 h             | 0           |
| 12–24 h            | 8           |
| > 24 h             | 15          |
| > 48 h             | 25          |
| > 96 h             | 40          |

### Source penalty

Penalizes the data source. CelesTrak is the best public source available to SENTINEL, but it is still public GP — not authoritative. Demo data is for UI demonstration only.

| Source             | Source penalty |
|--------------------|----------------|
| CELESTRAK (live GP)| 5              |
| DEMO (synthetic)   | 30             |
| CDM_IMPORT (external)| 0            |

### Format penalty

Penalizes element-set formats that carry less information. OMM/JSON is the modern CCSDS 502.0-B-2 standard; TLE is the legacy 1970s format with truncated fields.

| Format             | Format penalty |
|--------------------|----------------|
| OMM (JSON)         | 0              |
| TLE (legacy)       | 5              |

### Covariance penalty

Probability of collision requires position covariance at TCA. Public GP elements carry no covariance. SENTINEL records the state of covariance availability per object and penalizes accordingly.

| Covariance state                          | Covariance penalty |
|-------------------------------------------|--------------------|
| Available (full 3×3 or 6×6)               | 0                  |
| Partial (radial only, e.g. from RCS estimate) | 8                  |
| **Unavailable (public GP default)**       | **15**             |

### Propagation horizon penalty

Penalizes conjunctions whose TCA is far in the future from the element epoch. SGP4 accuracy degrades roughly 1–3 km per day in LEO, so a 5-day-out TCA carries meaningful position uncertainty.

| Time from epoch → TCA | Propagation penalty |
|-----------------------|---------------------|
| ≤ 2 days              | 0                   |
| 2–5 days              | 6                   |
| > 5 days              | 12                  |

### Metadata penalty

Penalizes records with missing or inconsistent metadata fields. A well-formed OMM has all of: `OBJECT_NAME`, `OBJECT_ID`, `OBJECT_TYPE`, `BSTAR`, `CLASSIFICATION_TYPE`, `ELEMENT_SET_NO`. If any are missing or implausible (e.g. `meanMotion ≤ 0`, `eccentricity < 0` or `≥ 1`), the penalty accumulates.

| Missing/invalid metadata       | Per-field penalty |
|--------------------------------|-------------------|
| `OBJECT_NAME` missing           | 1                 |
| `OBJECT_ID` missing             | 1                 |
| `OBJECT_TYPE` missing           | 2                 |
| `BSTAR` missing                 | 1                 |
| `CLASSIFICATION_TYPE` missing  | 1                 |
| `ELEMENT_SET_NO` missing        | 1                 |
| Implausible `meanMotion` / `eccentricity` | 2     |
| Total metadata penalty (capped) | ≤ 8               |

## Levels

The numeric confidence score maps to a level used in the UI:

| Range | Level   | Interpretation                                                          |
|-------|---------|-------------------------------------------------------------------------|
| ≥ 75  | HIGH    | Trust the risk score. Act on it.                                        |
| 50–74 | MEDIUM  | Trust with caveats. Cross-check before acting.                          |
| < 50  | LOW     | Treat risk score as advisory only. Escalate to a second source.         |

## Example — Typical Live CelesTrak Conjunction

- Element age: 36 h → age penalty 15
- Source: CELESTRAK → source penalty 5
- Format: OMM (JSON) → format penalty 0
- Covariance: Unavailable → covariance penalty 15
- Propagation horizon: TCA 3 days out → propagation penalty 6
- Metadata: complete → metadata penalty 0

```
Confidence = 100 − 15 − 5 − 0 − 15 − 6 − 0 = 59 → MEDIUM
```

The operator sees: HIGH risk + MEDIUM confidence. Recommendation: confirm with SOCRATES (`SOCRATES_VALIDATION.md`) before planning a maneuver.

## Example — Demo-data conjunction

- Element age: synthetic, treated as 0 h → age penalty 0
- Source: DEMO → source penalty 30
- Format: OMM → format penalty 0
- Covariance: Unavailable → covariance penalty 15
- Propagation: ≤2 days → propagation penalty 0
- Metadata: complete → metadata penalty 0

```
Confidence = 100 − 0 − 30 − 0 − 15 − 0 − 0 = 55 → MEDIUM
```

Even with a 0 m miss, the demo-data badge and confidence level make it visually obvious that this is not a real event.

## Coupling With the Risk Model

The UI shows both numbers in close proximity:

```
Risk: 76  CRITICAL     Confidence: 59  MEDIUM
```

The maneuver what-if simulator (`MANEUVER_SIMULATION.md`) refuses to label a scenario as "best" if confidence is LOW — instead it surfaces the scenario but flags it with `⚠ verify`. This prevents an operator from acting on a confident-looking result that rests on unconfident data.

## What Confidence Is Not

- It is **not** a probability of collision. See `RISK_MODEL.md`.
- It is **not** an error ellipse. It does not produce a 3σ position uncertainty in kilometers — that would require covariance, which the public GP lacks.
- It is **not** a measure of SOCRATES agreement. That is reported separately by `POST /api/socrates` (`API.md`).

## Reference URLs

- NASA CARA main page: https://www.nasa.gov/cara/
- NASA CARA Step 2 risk assessment methodology: https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/
- CCSDS OMM standard search: https://ccsds.org/searchpubs/
- CelesTrak GP/OMM API: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
