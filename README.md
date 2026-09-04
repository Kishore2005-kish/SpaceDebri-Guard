# SENTINEL — Quick Start

## Installation

```bash
npm install
npm run sentinel
```

Then open: http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `npm run sentinel` | One-command startup (checks deps, DB, starts server) |
| `npm run dev` | Start Next.js dev server only |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm test` | Run unit tests (parser, SGP4, STK) |
| `npm run qa` | Full QA pass (lint + typecheck + tests + build) |
| `npm run smoke` | Smoke test (start server, verify endpoints) |
| `npm run db:push` | Push Prisma schema to database |

## Architecture

- **Frontend:** Next.js 16 + TypeScript + Tailwind + shadcn/ui + CesiumJS
- **Backend:** Next.js API routes + Prisma ORM + SQLite
- **Orbital mechanics:** SGP4 (`sgp4` npm package v1.0.10, WGS84, TEME frame)
- **Data source:** Real CelesTrak GP/OMM data (fetched via z-ai-web-dev-sdk proxy)
- **Professional simulation:** STK Advanced CAT adapter (optional — requires STK installation)
- **Risk model:** 5-factor heuristic (NOT probability of collision)
- **Collision probability:** UNAVAILABLE (public GP data lacks covariance — per NASA CARA)

## Navigation

- **Overview** — Clean landing page with ANALYZE SATELLITE button
- **Satellites** — Catalog search (real CelesTrak objects)
- **Analyze** — Multi-step configuration wizard + background analysis with progress
- **Simulation** — List of close approach events → click to open 3D globe
- **History** — Paginated analysis history (lightweight, no JSON blobs)
- **Documentation** — All technical docs

## Key Design Decisions

1. **Conjunction ≠ Collision** — A predicted close approach is NOT a collision. NASA CARA workflow: Prediction → Risk Assessment → Mitigation.
2. **No Pc without covariance** — Public GP/TLE data does not contain covariance. Pc is always UNAVAILABLE.
3. **STK never faked** — When STK is unavailable, the comparison shows "NOT EXECUTED", never copies SGP4 values.
4. **Real data in LIVE mode** — Synthetic MySat-01/Debris-2841 only in DEMO mode.
5. **Background analysis** — POST /api/analysis returns immediately. Poll GET /api/analysis/:id for progress.

## Developer Status

```
GET /api/system/status
```

Returns: database health, CelesTrak status, SGP4 version, Cesium status, STK status, AI status, data counts.
