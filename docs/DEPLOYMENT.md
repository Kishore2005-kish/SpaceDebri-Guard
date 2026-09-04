# SENTINEL — Deployment Guide

## Overview

This document describes the steps to deploy SENTINEL in a production environment that has **direct HTTPS access to `celestrak.org`** (no SDK proxy) and uses **PostgreSQL** instead of SQLite for durability. The sandbox / prototype configuration (with the SDK proxy and SQLite) is the default; production switches both.

## 1. Disable the CelesTrak Proxy

The file `src/lib/data/celestrak/client.ts` exposes a `USE_PROXY` flag that toggles between the SDK `page_reader` path (sandbox) and a direct `fetch` (production).

Edit the file:

```ts
// src/lib/data/celestrak/client.ts
export const USE_PROXY = false;  // production: direct HTTPS
```

When `USE_PROXY = false`, the client:
- Calls `fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=' + group + '&FORMAT=JSON')` directly.
- Does **not** URL-encode the `?` and `&` (the workaround is only needed for the SDK proxy path).
- Parses the body the same way the proxy path does (extract JSON from the `<pre>` wrapper, normalize, persist).

The downstream normalization and persistence paths are unchanged.

## 2. Switch Prisma to PostgreSQL

Edit `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was: "sqlite"
  url      = env("DATABASE_URL")
}
```

Set the `DATABASE_URL` environment variable to your PostgreSQL DSN:

```bash
export DATABASE_URL="postgresql://sentinel:password@db.local:5432/sentinel"
```

Recommended PostgreSQL version: **12 or later**. The schema uses `Json?` fields that Prisma maps to `jsonb` columns on PostgreSQL.

## 3. Install PostgreSQL

On a Debian/Ubuntu host:

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER sentinel WITH PASSWORD 'password';"
sudo -u postgres psql -c "CREATE DATABASE sentinel OWNER sentinel;"
```

Apply the schema:

```bash
bun run db:push
```

This runs `prisma db push` which creates all tables and indexes in `DATABASE.md`. No migration files are needed for the prototype; if you adopt formal migrations, switch to `prisma migrate dev`.

## 4. Build & Run

The Next.js application is run via:

```bash
bun install
bun run build       # produces .next/ — the production bundle
bun run start       # serves on port 3000
```

For deployment behind a reverse proxy, configure your front-end (Caddy, nginx, Traefik) to forward `/` to `localhost:3000`. The single-route constraint from the sandbox is lifted in production.

## 5. Cron — Periodic Catalog Refresh

In production, you want the catalog refreshed on a schedule so the dashboard reflects recent element sets. CelesTrak publishes new elements multiple times per day; an 8-hour cadence balances freshness against API load.

Add a cron job on the host (or a systemd timer) that calls the refresh endpoint:

```cron
# /etc/cron.d/sentinel-refresh
0 */8 * * *  curl -sS -X POST http://localhost:3000/api/orbits/refresh \
  -H 'Content-Type: application/json' \
  -d '{"groups":["stations","active","starlink","cospar"]}' \
  >> /var/log/sentinel-refresh.log 2>&1
```

This calls `POST /api/orbits/refresh` (`API.md`) every 8 hours. The endpoint writes a `DataRefreshLog` row per group; failures are logged but do not abort the run. The refresh is idempotent — re-running with the same `rawHash` skips re-upserting unchanged satellites.

If you want a screening pass to immediately follow each refresh, append it to the cron job:

```bash
curl -sS -X POST http://localhost:3000/api/screen \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Omitting `primaryIds` screens the entire active catalog — see `API.md`.

## 6. Optional — SOCRATES Cron

To keep the validation comparison fresh, schedule a daily SOCRATES fetch:

```cron
30 6 * * *  curl -sS http://localhost:3000/api/socrates > /var/log/sentinel-socrates.log 2>&1
```

This populates the SOCRATES comparison table (`SOCRATES_VALIDATION.md`).

## 7. Backups

- **Database**: `pg_dump -U sentinel -Fc sentinel > /backup/sentinel-$(date +%F).dump`. Retain 14 days.
- **Element raw payloads**: every `CatalogSnapshot` has a `rawHash`; the canonical raw payload can be re-fetched from CelesTrak by replaying the source URL list (`DATA_SOURCES.md`). No separate raw-payload backup is required.

## 8. Security

- Run the Next.js process as a non-root user.
- Bind to `127.0.0.1:3000` only; expose via the reverse proxy with TLS.
- Do not commit `DATABASE_URL` (or any secret) to git; use `.env.local` or a secret manager.
- Rate-limit `/api/orbits/refresh` and `/api/screen` per IP if the host is exposed to the public internet — both are expensive.

## 9. Health Check

```bash
curl -sS http://localhost:3000/api/status
```

Returns: `{ source: "LIVE", lastRefresh: "...", propagator: "SGP4-1.0.10-WGS84-TEME", cacheSize: N, sgp4SelfTest: "ok" }`. If `sgp4SelfTest` is `"fail"`, the SGP4 self-test (ISS sanity check from `SGP4.md`) failed on startup and the screening pipeline will produce `NaN` positions — do not trust any conjunction from this run.

## 10. Upgrade Path

For deployments that require a true probability of collision, install the NASA CARA_Analysis_Tools (https://github.com/nasa/CARA_Analysis_Tools) as a mini-service, ingest owner/operator covariance data, and replace the SENTINEL risk score with a CARA-computed Pc. SENTINEL's CDM exporter already includes the `COVARIANCE = UNAVAILABLE` and `RISK_SCORE_NOTE = "heuristic NOT probability of collision"` fields precisely so a downstream Pc pipeline can be slotted in without breaking the message format.

## Reference URLs

- CelesTrak GP/OMM API (the production fetch target): https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CelesTrak SOCRATES (for cron): https://celestrak.org/SOCRATES/
- NASA CARA_Analysis_Tools (upgrade path): https://github.com/nasa/CARA_Analysis_Tools
- CCSDS 508.0-B-1 CDM standard: https://ccsds.org/searchpubs/
