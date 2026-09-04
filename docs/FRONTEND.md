# SENTINEL — Frontend Architecture

## Overview

SENTINEL's frontend is a Next.js 16 App Router single-page application. All interactive UI is client-rendered React 18 with TypeScript. Styling is Tailwind CSS 4 with the shadcn/ui (New York) component library. There is exactly one route — `/` (see `src/app/page.tsx`) — and the rest of the UX is tabbed navigation within that single page, which keeps the URL surface trivial and the deploy story simple.

## Single-Page Tab Structure

The root renders a fixed `TopBar`, a `Sidebar`, and a `main` panel that swaps based on the active tab:

| Tab | Component | Purpose |
|-----|-----------|---------|
| Dashboard | `DashboardView` | System overview: refresh status, total conjunctions, risk distribution, latest events, evaluator summary. |
| Conjunctions | `ConjunctionsView` → `ConjunctionsTable` + `ConjunctionDetail` | The list/detail conjunction browser. |
| Catalog | `SatellitesView` | Browse the satellite catalog with search/filter. |
| Validation | `ValidationView` | SOCRATES comparison panel (`SOCRATES_VALIDATION.md`). |
| Tutorial | `TutorialView` | Embedded `ORBITAL_MECHANICS.md` walkthrough. |
| Docs | `DocsView` | Embedded reference docs index. |
| — | `AiAssistant` (always visible bottom-right) | Floating chat (`AI_ASSISTANT.md`). |

The detail view for a conjunction (`ConjunctionDetail`) renders as a **full-screen overlay**, not a route. State is held in the Zustand store, so closing the overlay returns the user to the previous list view exactly as they left it.

## State Management

- **UI state**: Zustand store (`src/store/ui.ts`). Holds `activeTab`, `selectedConjunctionId`, `dataMode` (`LIVE` / `CACHED` / `DEMO`), `lastRefresh`, `aiOpen`.
- **Server state**: Plain `useEffect` + `fetch`. TanStack Query is intentionally not used — the query set is small and stable, so the additional abstraction is not worth it. Each view has its own small data-fetch hook (`useDashboard()`, `useConjunctions(filters)`, `useSatellites(filters)`). Stale-while-revalidate is implemented manually with a per-key in-memory cache that lives in module scope, so it survives the React reconciliation cycle.

## Components (Index)

### `TopBar`
Top navigation bar with: SENTINEL logo + version, current data mode indicator (`LIVE` / `CACHED` / `DEMO`), last refresh timestamp, `Refresh` button, `Run Screening` button, theme toggle (light/dark via `next-themes`).

The data mode indicator is a colored badge:
- `LIVE` — green — last refresh within 24 h, source `CELESTRAK`.
- `CACHED` — amber — last refresh 24–72 h ago, or source still CelesTrak but stale.
- `DEMO` — gray — only demo data loaded.

### `Sidebar`
Vertical tab navigation. Collapsible on mobile. Highlights the active tab. The Dashboard entry also shows a small conjunction count next to its label.

### `DashboardView`
- Top row: 4 KPI cards (`Total Satellites`, `Total Conjunctions`, `Critical Count`, `Latest Refresh`).
- A `FETCH REAL CELESTRAK` button — triggers `POST /api/orbits/refresh` with `groups: ['stations','active']`.
- A **"How do we know this is real?"** panel — collapsible card showing the current snapshot's source URL, fetch timestamp, raw hash, propagator version, and a link to the SOCRATES validation endpoint. This is the provenance transparency surface; see `ARCHITECTURE.md` §13 and `API.md` — `GET /api/provenance/{id}`.
- Below: Recharts bar chart of conjunctions by risk level (LOW/MODERATE/HIGH/CRITICAL), Recharts time-series of conjunctions per day, latest 10 conjunctions table.

### `ConjunctionsTable`
- Filter bar: primary search, risk-level multiselect, distance slider, confidence slider, source filter.
- Each row: TCA, primary + secondary names, miss distance, rel-velocity, risk score (color-coded), confidence score, `LIVE` or `DEMO` badge.
- Row click opens `ConjunctionDetail` overlay.
- Sorted columns; supports `max-h-96 overflow-y-auto` with custom scrollbar styling.

### `ConjunctionDetail` (full-screen overlay)
A full-viewport modal with sections:

1. **Header**: primary name + secondary name + TCA + risk/confidence badges + status dropdown (`PATCH /api/conjunctions/{id}/status`).
2. **Orbit Visualizer**: custom HTML5 canvas rendering both satellites' propagated trajectories in TEME (rotated for display) over the TCA window. The TCA point is highlighted. The encounter trajectory is color-coded. Camera tilt controlled by a small dial.
3. **Separation chart**: Recharts line chart of `d(t)` over the TCA window, fetched from `GET /api/conjunctions/{id}/timeline`. The minimum is marked with a vertical line.
4. **Maneuver panel**: scenario table (`POST /api/conjunctions/{id}/simulate`). Best scenario marked with ★. New conjunctions (from re-screen) flagged. Inline button to export CDM.
5. **Risk explanation**: human-readable factor breakdown (miss distance, uncertainty, relative velocity, geometry, freshness) with the explicit "NOT a probability of collision" disclaimer. The `RISK_SCORE_NOTE` from `RISK_MODEL.md`.
6. **Timeline**: linear analyst timeline of this conjunction — when it was screened, when status changed, when SOCRATES comparison ran, when CDM was exported (`EventLog` rows).
7. **Provenance** mini-panel: snapshot ID, source URL, fetch timestamp, raw hash, propagator.
8. **SOCRATES comparison** inline: TCA error / range error / rel-vel error vs SOCRATES (`POST /api/socrates`).

### `SatellitesView`
- Search bar.
- Filter chips: source (`LIVE` / `DEMO`), type (`PAYLOAD` / `ROCKET BODY` / `DEBRIS`), epoch freshness.
- Grid of `SatelliteCard` components, color-coded by `source`: green border for LIVE, gray for DEMO. Each card shows NORAD ID, name, type, epoch, source badge.
- Click → opens a small `SatelliteDetail` drawer with full OMM fields and a link to run a screening for just that primary.

### `ValidationView`
- Table of all SOCRATES comparisons run.
- Per-row: conjunction, SENTINEL TCA / range / rel-vel, SOCRATES TCA / range / rel-vel, TCA error (min), range error (km), status (`excellent` / `reasonable` / `disagreement`).
- A `Run comparison for all critical conjunctions` bulk button.

### `TutorialView`
- Embedded `ORBITAL_MECHANICS.md` rendered as styled HTML with section navigation.
- A glossary of all terms (TLE, OMM, SGP4, TCA, RIC, J2, TEME) as quick-reference chips.

### `DocsView`
- Index of all docs files (the `docs/` folder) with markdown rendering.
- Search across docs.

### `AiAssistant`
- Floating button bottom-right; expands to a chat panel.
- Sends the deterministic fact sheet (`AI_ASSISTANT.md`) with every question.
- Suggested questions chips: *"Why is this event risky?"*, *"Which conjunction should I investigate first?"*, *"What does TCA mean?"*, *"Why is confidence low?"*, *"Compare these maneuver scenarios."*, *"Summarize today's events."*, *"Should I execute this burn?"*.

## Hydration-Safety Rules

- `Date.now()` and any "now"-derived value must be computed inside `useEffect` (with `setTimeout(0)` to defer past hydration, see `TROUBLESHOOTING.md` issue #4) — never synchronously during render. This prevents React hydration mismatches between the server (which renders at one time) and the client (which hydrates later).
- All data-fetch hooks return `null` initially and populate after the first client-side effect, so the server render is deterministic.

## Theme

- Light/dark via `next-themes` (`ThemeProvider` in the root layout).
- Tailwind CSS variables for all colors (`bg-background`, `text-foreground`, `bg-primary`).
- No indigo or blue per the project color policy.

## Reference URLs

- shadcn/ui: https://ui.shadcn.com/
- Recharts: https://recharts.org/
- Tailwind CSS 4: https://tailwindcss.com/
- Next.js 16 docs: https://nextjs.org/docs
