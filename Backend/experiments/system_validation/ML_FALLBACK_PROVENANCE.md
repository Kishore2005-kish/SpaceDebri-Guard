# ML Fallback and Provenance Note

Previously, `src/lib/weather-api.ts` returned a local heuristic object after FastAPI failure without identifying its source, and the no-parameter path returned a hardcoded LOW result. That could be displayed as if it were produced by the trained model.

The client now labels successful validated FastAPI responses as `prediction_source: trained_model`, malformed responses as unavailable-service fallback, and retained heuristic results as `prediction_source: heuristic_fallback`. The no-input path is explicitly `unavailable`. FastAPI responses also identify `model_version` from the loaded artifact when available.

This preserves the existing response shape while making provenance explicit. The heuristic score is not a trained-model confidence or collision probability. Cached predictions are not currently implemented.
