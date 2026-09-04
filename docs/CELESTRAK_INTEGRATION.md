# SENTINEL — CelesTrak Integration

## Overview

CelesTrak (https://celestrak.org/) is the canonical public source of General Perturbations (GP) orbital elements, derived from the U.S. Space Surveillance Network and reformatted as Orbit Mean-Elements Messages (OMM) — the CCSDS 502.0-B-2 standard. SENTINEL fetches CelesTrak's `gp.php` JSON endpoint to populate its catalog at the start of every screening run.

This document describes the three stages of integration: **fetch**, **parse**, and **normalize/cache**. The fetch path has a non-obvious workaround documented below, because the SENTINEL sandbox environment does not have direct HTTPS access to `celestrak.org`.

## 1. Fetching — the SDK page_reader Proxy

### Why a Proxy?

The SENTINEL sandbox cannot make outbound HTTPS requests to `celestrak.org` directly — that domain is not in the runtime's egress allow-list. Instead, SENTINEL uses the `z-ai-web-dev-sdk` `page_reader` capability, which fetches arbitrary URLs server-side and returns the rendered HTML body. The SDK is server-only; it is never invoked from client components.

### The Query-String Workaround

The `gp.php` endpoint takes query parameters — e.g. `?GROUP=active&FORMAT=JSON`. The SDK `page_reader` internally URL-decodes and re-processes the path, and in some configurations strips the raw query string before forwarding. To survive that, SENTINEL URL-encodes the `?` and `&` characters as `%3F` and `%26` in the URL it passes to `page_reader`:

```ts
// src/lib/data/celestrak/client.ts
const rawUrl = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON';
const encoded = rawUrl
  .replace(/\?/g, '%3F')
  .replace(/&/g, '%26');
// Pass `encoded` to page_reader, not `rawUrl`.
```

If `?` is left un-encoded, `page_reader` strips the parameters and CelesTrak returns the default HTML index instead of JSON — symptoms: "Invalid query" / blank `<pre>`. See `TROUBLESHOOTING.md` issue #1.

### Production Toggle

For deployments with direct HTTPS (see `DEPLOYMENT.md`), set `USE_PROXY = false` in `src/lib/data/celestrak/client.ts`. The same module then issues a plain `fetch(rawUrl)` and skips the SDK entirely. The two paths share the same parser and normalizer, so downstream code is identical.

### Caching at the Fetch Layer

- **In-memory**: 15-minute TTL keyed by group name. A second refresh within 15 minutes reuses the cached buffer and emits a `cache_hit` entry in `DataRefreshLog`.
- **Persistent**: After a successful parse, every satellite is upserted into SQLite via Prisma, so a process restart does not lose the catalog. A new `CatalogSnapshot` row is created on every successful refresh.

## 2. Parsing — Extracting JSON from `<pre>`

CelesTrak's `gp.php?FORMAT=JSON` returns the JSON payload wrapped in a `<pre>` HTML element (for browser rendering). The raw body looks like:

```html
<pre>
[
  {
    "OBJECT_NAME": "ISS (ZARYA)",
    "OBJECT_ID": "1998-067A",
    "EPOCH": "2024-01-15T12:34:56.789000",
    "MEAN_MOTION": 15.5,
    "ECCENTRICITY": 0.0001,
    "INCLINATION": 51.6,
    ...
    "NORAD_CAT_ID": "25544",
    "OBJECT_TYPE": "PAYLOAD"
  },
  ...
]
</pre>
```

The parser:

1. Decodes the SDK's response body (already a UTF-8 string).
2. Strips the surrounding `<pre>...</pre>` tags and any leading/trailing whitespace.
3. `JSON.parse`s the result into an array of raw OMM records.
4. Validates that the result is a non-empty array. If not, throws a `CelestrakParseError` with the first 200 bytes of the body for diagnostics.

## 3. Normalization — UPPER_SNAKE to camelCase

OMM field names follow the CCSDS convention (`UPPER_SNAKE_CASE`). Prisma and the rest of the SENTINEL codebase use camelCase. The `normalizeOmm` mapper performs the translation:

| OMM (CelesTrak) | SENTINEL (Prisma `Satellite`) |
|-----------------|--------------------------------|
| `OBJECT_NAME`   | `objectName` |
| `OBJECT_ID`     | `objectId` (international designator) |
| `NORAD_CAT_ID`  | `noradCatId` (string — supports 6+ digit IDs) |
| `OBJECT_TYPE`   | `objectType` (PAYLOAD / DEBRIS / ROCKET BODY / etc.) |
| `EPOCH`         | `epoch` (ISO 8601 string, parsed to `Date`) |
| `MEAN_MOTION`   | `meanMotion` (rev/day) |
| `ECCENTRICITY`  | `eccentricity` (unitless) |
| `INCLINATION`   | `inclination` (deg) |
| `RA_OF_ASC_NODE`| `raan` (deg) |
| `ARG_OF_PERICENTER` | `argOfPericenter` (deg) |
| `MEAN_ANOMALY`  | `meanAnomaly` (deg) |
| `BSTAR`         | `bstar` (drag term) |
| `MEAN_MOTION_DOT`   | `meanMotionDot` |
| `MEAN_MOTION_DDOT`  | `meanMotionDDot` |
| `EPHEMERIS_TYPE`| `ephemerisType` |
| `CLASSIFICATION_TYPE` | `classificationType` (U / C / S) |
| `ELEMENT_SET_NO`| `elementSetNo` |
| `REV_AT_EPOCH`  | `revAtEpoch` |

In addition to the field-for-field copy, the normalizer computes:

- `rawHash`: SHA-256 of the canonical JSON string. Used to skip re-upserting unchanged records during the next refresh.
- `source`: set to `'CELESTRAK'` (vs `'DEMO'` for the fallback catalog).
- `snapshotId`: foreign key to the active `CatalogSnapshot`.

## 4. Cache and Upsert

The Prisma upsert key is `noradCatId`:

```ts
await db.satellite.upsert({
  where: { noradCatId: rec.noradCatId },
  create: { ...normalized, snapshotId, source: 'CELESTRAK' },
  update: { ...normalized, snapshotId, source: 'CELESTRAK' },
});
```

This means SENTINEL can be refreshed repeatedly without bloating the database — each satellite has one row, updated in place, with provenance (snapshot + rawHash) preserved on the row.

## Reference URLs

- JSON API: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- Format documentation: https://celestrak.org/NORAD/documentation/gp-data-formats.php
- Satcat (metadata): https://celestrak.org/satcat/
- See `CELESTRAK_INTEGRATION` references throughout `DATA_SOURCES.md`, `TROUBLESHOOTING.md`, and `DEPLOYMENT.md`.
