# Provenance and Freshness Review

Existing metadata includes satellite source, orbital epoch, retrieval timestamps, catalog snapshots, propagator version/frame, conjunction object pair, TCA, miss distance, screening window/threshold, epochs, snapshot ID, and risk-model version. Space-weather responses include NOAA status, weather source labels, and the prediction target wording; the ML client now adds explicit prediction source and model version metadata.

The screening result now returns `complete` and `failedPairs`. A failed object pair is recorded and does not abort unrelated valid pairs; the result cannot be mistaken for complete screening. Propagation rejects non-finite vectors.

Remaining gaps: the database schema does not store a dedicated space-weather retrieval timestamp for every prediction, cached predictions are not supported, and authentication/RLS and browser-level provenance display remain unverified. No timestamps or sources were fabricated and no schema change was made.
