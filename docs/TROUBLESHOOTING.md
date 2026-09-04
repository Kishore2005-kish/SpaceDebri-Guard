# SENTINEL — Troubleshooting

A field guide to the issues most likely to bite when standing up or operating SENTINEL.

---

## Issue 1 — CelesTrak returns "Invalid query" or empty JSON

### Symptom
The `POST /api/orbits/refresh` endpoint succeeds but the resulting `DataRefreshLog` row has `status = error` and `message = 'Invalid query'`, or the count of new satellites is 0. The raw response body (in `message` when `status = error`) is HTML, not JSON — the default `gp.php` index page rather than the JSON payload.

### Cause
The `z-ai-web-dev-sdk` `page_reader` proxy internally URL-decodes and re-processes the path. When SENTINEL passes `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON` with a raw `?` and `&`, the SDK strips the query string before forwarding — CelesTrak never sees `GROUP` or `FORMAT` and returns the default HTML.

### Fix
URL-encode the `?` and `&` as `%3F` and `%26` in the URL passed to `page_reader`:

```ts
const rawUrl = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON';
const encoded = rawUrl.replace(/\?/g, '%3F').replace(/&/g, '%26');
// pass `encoded` to page_reader
```

This is the default in `src/lib/data/celestrak/client.ts` (`CELESTRAK_INTEGRATION.md` §1).

### Verification
After the fix, the raw response body should start with `<pre>[` and contain valid JSON inside the `<pre>`. The `DataRefreshLog` row should have `status = ok` and `count > 0`.

---

## Issue 2 — SGP4 returns `[NaN, NaN, NaN]` for position

### Symptom
The `propagateSat(sat, dateMs)` wrapper returns `{ r: [NaN, NaN, NaN], v: [NaN, NaN, NaN] }`, or `null` if the wrapper's error-check is engaged. Downstream, the screening pipeline produces no conjunctions because every propagation is filtered out.

### Cause
SENTINEL calls `sgp4init(...)` directly on the OMM fields, bypassing the package's `twoline2rv` entry point. The package's `twoline2rv` internally calls `jday(...)` to set `satrec.jdsatepoch` (Julian date of the epoch). The direct-`sgp4init` path does not do this, so when `sgp4(satrec, minutesSinceEpoch)` is called, the internal `deltat` calculation has no epoch to subtract from, and the resulting position is `NaN`.

### Fix
After calling `sgp4init(...)`, set the Julian date of the epoch manually, using the package's convention (`jdsatepoch - 2433281.5`):

```ts
satrec.jdsatepoch = epochJD - 2433281.5;
```

Where `epochJD` is computed from the OMM `EPOCH` ISO string via the standard `Date → Julian Date` conversion. This is implemented in `src/lib/sgp4/initSatrec.ts` (`SGP4.md` §"The Epoch Fix — Critical").

### Verification
Run `scripts/test-sgp4.ts`. The ISS sanity check should report `|r|` in 6,780–6,820 km and `|v|` in 7.60–7.70 km/s.

---

## Issue 3 — Screening takes too long

### Symptom
A 7-day, full-catalog screening run takes >10 minutes (or never completes within the API timeout). `POST /api/screen` returns 504.

### Cause
The O(N²) candidate pair count is not being pruned aggressively enough. Without the altitude pre-filter (`CONJUNCTION_DETECTION.md` Stage 1), SENTINEL screens every satellite against every other satellite at 60-second resolution, which is intractable for N ≈ 10⁴.

### Fix
Enable `canApproachByAltitude` in `src/lib/screen/pairs.ts` and verify the apogee/perigee precomputation is being populated by the refresh pipeline:

```ts
// in src/lib/orbits/refresh.ts after parsing OMM:
sat.apoapsisKm  = a * (1 + e) - Re;
sat.periapsisKm = a * (1 - e) - Re;
```

And in the screening pair generator:

```ts
if (!canApproachByAltitude(a, b, 600)) continue;
```

### Verification
`scripts/test-real-data.ts` should complete the 3-day pairwise screen of the `stations` group in <60 seconds on a laptop.

---

## Issue 4 — React hydration mismatch on the dashboard

### Symptom
The browser console shows `Warning: Text content did not match. Server: ... Client: ...` and the DashboardView's "last refresh" timestamp jumps on first interaction.

### Cause
`Date.now()` (or any "now"-derived value) is being called synchronously during render. The server renders at time `T1`, the client hydrates at `T1 + ε`, and the timestamps differ.

### Fix
Move the "now" computation into `useEffect` and defer it past hydration with `setTimeout(0)`:

```ts
const [now, setNow] = useState<number | null>(null);
useEffect(() => {
  const id = setTimeout(() => setNow(Date.now()), 0);
  return () => clearTimeout(id);
}, []);
if (now === null) return <Skeleton />;
// use `now` here
```

This pattern is mandatory anywhere a clock-derived value is rendered.

### Verification
Hard-reload the dashboard. The browser console should not show hydration warnings.

---

## Issue 5 — 6-digit catalog IDs are truncated / mis-parsed

### Symptom
Newer satellites (NORAD IDs ≥ 100000) appear in the catalog with truncated IDs (`00001` instead of `100001`) or as entirely different objects when fetched via the legacy TLE format.

### Cause
The legacy TLE format reserves only **5 digits** for the catalog ID column. When parsed by a strict TLE parser, the leading `1` of a 6-digit ID like `123456` is silently dropped or wrapped into the classification field.

### Fix
Use the OMM/JSON path (`gp.php?FORMAT=JSON`), never the legacy TLE path (`gp.php?FORMAT=TLE`). The OMM format supports arbitrary-length catalog IDs because the field is a JSON string. SENTINEL's `Satellite.noradCatId` is a Prisma `String` (`DATABASE.md`), so 6+ digit IDs are preserved through the full pipeline.

### Verification
`GET /api/satellites?q=` for a recent Starlink satellite (NORAD ID ≥ 100000) should return the correct 6-digit ID. The Prisma row's `noradCatId` should match the OMM `NORAD_CAT_ID` exactly.

---

## Issue 6 — 3D visualizer shows nothing or a single point

### Symptom
The `ConjunctionDetail` overlay's canvas orbit visualizer shows only a single dot or nothing at all, even though the conjunction has a valid TCA and miss distance.

### Cause
The visualizer's data hook fetches from `GET /api/orbits/{id}?start=&end=&step=`. If `start`/`end`/`step` are mis-set (e.g. `start == end` or `step = 0`), the propagation series is empty and the canvas has no points to draw.

### Fix
Verify the overlay passes a sensible window (`start = TCA − 2 hours`, `end = TCA + 2 hours`, `step = 60 s`) and that the propagation wrapper returns non-`null` values. If the underlying satellite has `source = DEMO` and the demo seed did not include a real epoch, propagate to the demo epoch first.

### Verification
The canvas should render two trajectories (primary in one color, secondary in another) with a highlighted TCA marker.

---

## Issue 7 — SOCRATES comparison returns `matched: false` for a real conjunction

### Symptom
The `POST /api/socrates { conjunctionId }` endpoint returns `{ matched: false }` even though the user is confident the conjunction is real and recent.

### Cause
SOCRATES publishes only the top-N close approaches per day — typically the closest ~200 events. SENTINEL's threshold is 10 km, which is much wider; many SENTINEL conjunctions (especially MODERATE/LOW ones) are not in SOCRATES' published list at all. This is not a bug.

### Fix
This is expected behavior. The UI should label `matched: false` as "Not in SOCRATES published list (likely outside top-N)" rather than as an error. For CRITICAL conjunctions, re-run the SOCRATES fetch after a few hours — SOCRATES is republished daily.

### Verification
Run `POST /api/socrates` on a CRITICAL-risk conjunction with a miss distance < 1 km. It should match.

---

## Reference URLs

- CelesTrak GP/OMM API: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON
- CelesTrak SOCRATES: https://celestrak.org/SOCRATES/
- sgp4 npm package: https://www.npmjs.com/package/sgp4
- Next.js 16 docs (hydration): https://nextjs.org/docs
