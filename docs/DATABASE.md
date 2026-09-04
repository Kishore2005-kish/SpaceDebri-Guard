# SENTINEL — Database Schema

## Overview

SENTINEL uses Prisma ORM. The prototype runs against **SQLite** (zero-config, single-file, perfect for laptop and sandbox deployment). The schema is **PostgreSQL-compatible** — switching providers is a one-line change plus a `DATABASE_URL` (see `DEPLOYMENT.md`).

## Schema (Prisma)

The full Prisma schema lives at `prisma/schema.prisma`. The model summary below documents the rationale for each model and field.

### `Satellite`

The fundamental object record. `id` is a `String` (not an `Int`) so 6+ digit catalog IDs work (`ORBITAL_MECHANICS.md` §3 and `TROUBLESHOOTING.md` issue #5).

```prisma
model Satellite {
  id                  String   @id @default(cuid())
  noradCatId          String   @unique           // 6+ digit support
  objectName          String?
  objectId            String?                    // international designator
  objectType          String?                    // PAYLOAD | ROCKET BODY | DEBRIS | UNKNOWN
  classificationType  String?                    // U | C | S
  epoch               DateTime
  meanMotion          Float
  eccentricity        Float
  inclination         Float
  raan                Float
  argOfPericenter     Float
  meanAnomaly         Float
  bstar               Float    @default(0)
  meanMotionDot       Float    @default(0)
  meanMotionDDot      Float    @default(0)
  ephemerisType       String?  @default("0")
  elementSetNo        Int      @default(1)
  revAtEpoch          Int      @default(0)

  source              String   @default("CELESTRAK") // CELESTRAK | DEMO | CDM_IMPORT | MANEUVER_SIMULATION
  rawHash             String?                    // SHA-256 of canonical JSON
  rawData             Json?                      // full OMM for provenance
  snapshotId          String?
  parentConjunctionId String?  @map("parent_conjunction_id")

  apoapsisKm          Float?
  periapsisKm         Float?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([source])
  @@index([objectType])
  @@index([snapshotId])
}
```

### `Conjunction`

The fundamental event record. Carries full provenance (`dataSource`, `propagator`, `snapshotId`, `analysisId`) so every event is traceable to the exact element set that produced it.

```prisma
model Conjunction {
  id                String   @id @default(cuid())
  primaryId         String                     // → Satellite.id
  secondaryId       String                     // → Satellite.id
  tca               DateTime
  minRange          Float                       // km
  relVelocity       Float                       // km/s
  radialComponent   Float?
  inTrackComponent  Float?
  crossTrackComponent Float?

  riskScore         Float                       // 0-100 heuristic
  riskLevel         String                      // LOW|MODERATE|HIGH|CRITICAL
  confidenceScore   Float                       // 0-100
  confidenceLevel   String                      // HIGH|MEDIUM|LOW
  factorBreakdown   Json?                       // {distance, uncertainty, ...}

  status            String   @default("NEW")    // NEW|INVESTIGATING|ACKNOWLEDGED|MITIGATED|FALSE_ALARM

  dataSource        String   @default("CELESTRAK")
  propagator        String   @default("SGP4-1.0.10-WGS84-TEME")
  snapshotId        String?
  analysisId        String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([primaryId])
  @@index([secondaryId])
  @@index([riskLevel])
  @@index([tca])
  @@index([analysisId])
}
```

### `CatalogSnapshot`

A logical "point-in-time" capture of the catalog. Multiple refreshes roll up under one snapshot if the user groups them.

```prisma
model CatalogSnapshot {
  id          String   @id @default(cuid())
  takenAt     DateTime @default(now())
  source      String   @default("CELESTRAK")
  groupList   String                     // comma-separated CelesTrak groups
  objectCount Int      @default(0)
  rawHash     String?                   // hash of the combined payload
  notes       String?
  satellites  Satellite[]
  refreshLogs DataRefreshLog[]
}
```

### `DataRefreshLog`

Every fetch and parse attempt is logged. Failures do not abort the run; they are persisted so the operator can see which groups failed and why.

```prisma
model DataRefreshLog {
  id          String   @id @default(cuid())
  snapshotId  String?
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  group       String                       // CelesTrak group name
  source      String                       // CELESTRAK | DEMO
  status      String                       // ok | error | cache_hit
  count       Int      @default(0)
  durationMs  Int?
  message     String?
}
```

### `AnalysisReport`

A generated analyst report (Markdown body + summary stats) for a single screening run.

```prisma
model AnalysisReport {
  id            String   @id @default(cuid())
  analysisId    String                       // links to Conjunction.analysisId
  generatedAt  DateTime @default(now())
  windowStart   DateTime
  windowEnd     DateTime
  thresholdKm  Float
  totalObjects  Int
  totalConjunctions Int
  criticalCount Int
  highCount     Int
  moderateCount Int
  lowCount      Int
  bodyMarkdown  String                       // the report
  provenance    Json                         // {snapshotId, propagator, dataSource}
}
```

### `EventLog`

Audit trail: every status change, every refresh, every maneuver simulation, every CDM import.

```prisma
model EventLog {
  id            String   @id @default(cuid())
  ts            DateTime @default(now())
  type          String   // refresh | screen | status_change | simulate | cdm_import | ...
  targetType    String?  // Conjunction | Satellite | ...
  targetId      String?
  message       String?
  payload       Json?
}
```

## Migration to PostgreSQL

For deployment with direct HTTPS to CelesTrak (`DEPLOYMENT.md`):

1. Install PostgreSQL ≥ 12.
2. In `prisma/schema.prisma`, change:
   ```
   datasource db {
     provider = "sqlite"     //  → "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Set `DATABASE_URL=postgresql://user:pass@host:5432/sentinel`.
4. Run `bun run db:push` to apply the schema.

The `Json?` fields use SQLite's text-column JSON mode in the prototype and become native `jsonb` columns on PostgreSQL. The Prisma client code is identical.

## Index Strategy

The indexes above support the dominant query patterns:

- `GET /api/conjunctions?primaryId=...` — index on `primaryId`.
- `GET /api/conjunctions?riskLevel=CRITICAL` — index on `riskLevel`.
- `GET /api/conjunctions?analysisId=...` — index on `analysisId`.
- `GET /api/satellites?source=CELESTRAK` — index on `source`.

A full catalog refresh screens ~10⁴ satellites and produces O(10²–10³) conjunctions in a 7-day window, well within SQLite's capacity for the prototype.

## Reference URLs

- CelesTrak GP/OMM API (data source for `Satellite` records): https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CCSDS 502.0-B-2 OMM standard (field naming): https://ccsds.org/searchpubs/
- Prisma ORM docs: https://www.prisma.io/docs/
