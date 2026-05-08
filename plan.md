# Booth Booking Performance and Security Plan

## Measured baseline (2026-05-08, before optimisations)

```
script-start        0.2ms
initial redraw      4.4ms   <- SVG render, very fast
dom-content-loaded  6.7ms
window-load       295.2ms
loadBooked fetch  3470.5ms  <- entire delay was here
loadBooked total  3478.9ms
startup-complete  3484.0ms  <- user saw uncoloured booths for 3.5 seconds
```

## Measured results after all optimisations (2026-05-08)

| Visit | loadBooked fetch | startup-complete | Notes |
|-------|-----------------|-----------------|-------|
| Load 1 (CDN cold) | 2925ms | 2937ms | CDN warming; Apps Script CacheService skips sheet read |
| Load 2 (cached) | **17ms** | **376ms** | CDN hit; localStorage hydrates booked booths at 6.9ms |

**Booked booths visible to repeat visitors: ~7ms (down from 3484ms)**

---

## Latest verification from browser console (2026-05-08, user-provided)

### Run A: "First boot"

```
script-start         0.2ms
initial redraw       2.5ms
loadBooked cache-hit 4.3ms   <- booked booths were already shown from localStorage
dom-content-loaded  23.0ms
window-load         28.6ms
loadBooked fetch  2779.4ms   <- backend/network path still slow on this request
loadBooked total  2781.7ms
startup-complete  2785.3ms
```

Notes:

- This was **not a true cold first visit**, because `loadBooked cache-hit` fired and the cache age was `40052ms`.
- User-visible booth colouring was already fast.
- The remaining slow part was still the background `/api/booked` fetch.

### Run B: second refresh

```
script-start         0.0ms
initial redraw       1.0ms
loadBooked cache-hit 1.5ms
dom-content-loaded   2.3ms
loadBooked fetch     3.9ms
loadBooked total     5.2ms
window-load         22.7ms
startup-complete    22.7ms
```

Notes:

- Repeat-visit user experience is now very good.
- Reserved booths become visible almost immediately from `localStorage`.
- Warm `/api/booked` fetch is now effectively negligible.

### Findings from these numbers

- Frontend rendering is not the bottleneck.
- The optimisation work succeeded for repeat visits and refreshes.
- The remaining slow path is the **cold upstream fetch** (`browser -> Cloudflare -> Apps Script -> Google Sheets`).
- To measure a true cold first visit, clear `localStorage` or use a private window before testing.

---

## Main startup bottleneck (partially resolved)

The slow part was not the booth SVG itself. The visible delay came from the path used to mark reserved booths:

`index.html` -> `/api/booked` -> Google Apps Script -> Google Sheet full read

- `loadBooked()` waited for the network before reserved booths appeared.
- `functions/api/booked.js` returned `Cache-Control: no-store`.
- `apps-script.js:getBooked()` read the whole sheet with `getDataRange().getDisplayValues()`.
- `index.html` rebuilt the SVG again after booked data arrived.

Current status:

- **Resolved for repeat visitors**: cached booked booths appear in ~1ms to ~7ms.
- **Resolved for warm edge hits**: `/api/booked` can return in ~4ms to ~17ms.
- **Not fully resolved for cold backend fetches**: one measured request still took `2779.4ms`.

---

## Recommended plan

### ✅ 1. Fastest visible improvement: show cached booked booths immediately

**Status: DONE** — committed `23d8aa5`

Target: `index.html`

Implementation:

- Added `BOOKED_CACHE_KEY = 'booked-cache-v1'` and `BOOKED_CACHE_TTL = 60000` (60s) constants.
- Added `loadBookedFromCache()`: reads `localStorage`, validates shape and TTL, hydrates `taken` + `bookedNames`, returns `true` on hit.
- Added `saveBookedToCache(data)`: writes `{ ts, data }` to `localStorage`; silently ignores write errors (private mode / storage full).
- In `loadBooked()`: call `loadBookedFromCache()` first; if hit, immediately call `redrawSVGs()` + `updateBar()` before the fetch even starts.
- After successful fetch: call `saveBookedToCache(data)` to update the cache.
- In `submitBooking()` on `data.success`: call `localStorage.removeItem(BOOKED_CACHE_KEY)` to invalidate so the next load gets fresh data.
- Profiling confirmed: `cache-hit` fires in single-digit milliseconds; booked booths are coloured before network responds.
- Still call `/api/booked` in the background and refresh the UI when the latest data arrives.

Why this helps:

- Reserved booths appear almost instantly for repeat visitors.
- Even if Apps Script is slow for a moment, the page does not look empty.

Low-risk implementation notes:

- Use a key like `booked-cache-v1`.
- Validate shape before using cached data.
- If cache is invalid or expired, fall back to current behavior.

### ✅ 2. Reduce repeat work on the frontend

**Status: DONE** — committed `41d924b`

Target: `index.html`

Implementation:

- Added `const boothNodes = {};` — registry mapping `booth.id -> { g, shape, titleEl }`.
- Renamed `buildSVG(tab)` -> `initSVG(tab)`: creates all DOM nodes once (geometry, text label, title element, power icon). Stores references in `boothNodes`. Click handler attached to all booths — permanently unavailable ones already have `pointer-events: none` via CSS so clicks never fire.
- Added `updateSVG(tab)`: loops through booths, updates only the dynamic parts in-place:
  - `shape.setAttribute('fill', boothColor(booth))` — colour
  - `shape.setAttribute('stroke', ...)` — stroke colour
  - `g.classList.toggle('taken', isTaken)` — taken class
  - `titleEl.textContent = ...` — tooltip text (empty string clears it for unbooked)
  - Unavailable tooltip is set once in `initSVG` and never touched again.
- `redrawSVGs()` now calls `updateSVG('indoor'); updateSVG('outdoor');` — no DOM destroy/recreate.
- Boot sequence changed to `initSVG('indoor'); initSVG('outdoor'); redrawSVGs();`

Why this helps:

- Smoother interaction on mobile — no DOM churn on every booth tap.
- Less garbage collection pressure during startup and selection changes.

### ✅ 3. Add short edge caching for booked status

**Status: DONE** — committed `f9ce56d`

Target: `functions/api/booked.js`

Implementation:

- Changed `Cache-Control` from `no-store` to `public, s-maxage=15, stale-while-revalidate=30`.
- Cloudflare serves cached response (15s max-age) to all visitors at the same edge node.
- `stale-while-revalidate=30` means Cloudflare revalidates in the background; visitors never block on a cache miss.
- The server-side conflict check in `handleBooking()` is unaffected — a stale display window is safe.
- Profiling confirmed: `loadBooked fetch` dropped to single-digit or low double-digit milliseconds on warm hits.

### ✅ 4. Cache booked data inside Apps Script

**Status: DONE** — committed `3212e2c` (combined with item 5 below)

Target: `apps-script.js`

Implementation:

- At the top of `getBooked()`: call `CacheService.getScriptCache().get('booked_v1')`. If hit, return the cached JSON string directly — no sheet access at all.
- On cache miss: read sheet (narrow columns only — see item 5), build result, call `cache.put('booked_v1', result, 30)`.
- Warm cache benchmark: Apps Script response dropped substantially, but there is still residual cold-path latency from the Google redirect/network chain.

Verification note:

- The latest measured `2779.4ms` fetch confirms there is still a slow cold-path cost even after Apps Script caching.
- This means the current implementation improves perceived startup a lot, but it does not eliminate platform/network cold-start latency.

### ✅ 5. Read only the columns needed from Google Sheets

**Status: DONE** — committed `3212e2c` (combined with item 4)

Target: `apps-script.js`

Implementation:

- Replaced `sheet.getDataRange().getDisplayValues()` (all columns) with targeted reads for:
  - column E (stallname)
  - column F (booths)
  - column I (status)
- Edge case handled: `lastRow < 2` (empty sheet) returns `{ booked: [], info: {} }` and caches it.

### 6. Preload the first visible floor-plan image

Target: `index.html`

Suggested change:

- Add preload for the indoor map image because that tab is shown first.
- Optionally prefetch the outdoor image.

Why this helps:

- Faster perceived startup, especially on mobile or slower connections.

## Security hardening

These do not materially change the booking flow, but they reduce avoidable risk.

### 7. Stop logging request/response content with user data

Target: `functions/api/booking.js`

Issue:

- The proxy currently logs a truncated Apps Script response.
- That response can contain booking-related data and should not be logged unless needed for debugging.

Suggested change:

- Remove the response logging or replace it with status-only logging.

### 8. Tighten request validation at the Cloudflare layer

Target: `functions/api/booking.js`

Suggested change:

- Reject non-`POST` methods as it already does.
- Also validate:
  - content type is `application/x-www-form-urlencoded`
  - request body length stays within a small limit
  - only expected fields are forwarded upstream

Why this helps:

- Reduces noisy or malformed traffic before it reaches Apps Script.

### 9. Keep server-side validation authoritative

Target: `apps-script.js`

Suggested change:

- Continue ignoring client-provided `location` and `total`.
- Also:
  - deduplicate booth IDs server-side
  - enforce max field lengths
  - reject control characters
  - normalize booth number formatting before writing to Sheets

Why this helps:

- Prevents malformed data from being stored.
- Makes the sheet more reliable over time.

### 10. Add basic response security headers

Target: `functions/api/booked.js`, `functions/api/booking.js`, optionally `index.html`

Suggested change:

- Add:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
- Optionally add a CSP for the static page, but only after testing because the page uses inline script and style.

Why this helps:

- Small improvement with little cost.

### 11. Optional origin checking for browser requests

Target: `functions/api/booking.js`

Suggested change:

- If an `Origin` header is present, require it to match the site host.
- Do not rely on this as the only control.

Why this helps:

- Blocks casual cross-site browser submissions.

## Recommended order

If the goal is the best speed gain for the least complexity, implement in this order:

1. Frontend local cache for booked booths.
2. Short edge cache in `/api/booked`.
3. Apps Script `CacheService` for `getBooked()`.
4. Narrower sheet reads.
5. In-place SVG updates instead of full rebuilds.
6. Security cleanup in the proxy and Apps Script.

## Expected outcome

For a system this size, the combination of local cache + short CDN cache + Apps Script cache should make reserved booths appear much faster on startup without changing the booking rules.

The conflict check during booking remains the final source of truth, so a short-lived stale display is acceptable as long as the server keeps rejecting already-booked booths.

Updated assessment from measured runs:

- For real users on repeat visits, the startup experience is now good.
- For true cold fetches, the system is still bounded by Apps Script/network latency.
- If further improvement is needed, the next step is not more SVG work; it is either:
  - better cold-path cache invalidation strategy and verification, or
  - moving booked-status storage/read logic off Apps Script entirely.

---

## Review findings: better, but not yet ideal

The startup path is clearly better, but it is still not optimal or ideal.

### 1. High: Apps Script booked-booth cache is not invalidated after a successful booking

Issue:

- `getBooked()` stores `booked_v1` in `apps-script.js` using `CacheService`.
- `handleBooking()` writes the new booking row, but does not remove that cache entry afterwards.
- `functions/api/booked.js` also adds CDN caching on top.
- Combined, this means other visitors can still see a newly booked booth as available until the cache chain expires.

Why this matters:

- This is a correctness gap, not just a performance tradeoff.
- The booking conflict check still protects final booking integrity, but the UI can remain stale longer than necessary.
- Earlier text in this plan implied this invalidation was already implemented; the current code does not match that claim.

Improvement needed:

- In `apps-script.js`, remove `booked_v1` from `CacheService` immediately after a successful booking write.
- After that, verify the stale-window behaviour again with browser profiling and two-browser booking tests.
- If needed, add a `fresh=1` bypass mode to `/api/booked` for post-booking refreshes.

### 2. Medium: narrower sheet reads are improved, but not yet ideal

Issue:

- `getBooked()` no longer uses `getDataRange()`, which is an improvement.
- However, it now makes three separate Sheets reads for columns E, F, and I.
- In Apps Script, one contiguous `E:I` read is often a better tradeoff than multiple separate calls while still avoiding a full-sheet scan.

Why this matters:

- The current change is better than the original implementation.
- It is probably not the most efficient version of the optimisation.
- Multiple range calls add extra Apps Script / Sheets call overhead.

Improvement needed:

- Replace the three single-column reads with one contiguous `E:I` range read.
- Keep the same logic of only using stall name, booth list, and status from that smaller range.
- Re-measure cold and warm `loadBooked fetch` after the change.

### 3. Medium: security hardening is still incomplete

Issue:

- `functions/api/booking.js` still logs the upstream Apps Script response body.
- The booking proxy still accepts and forwards arbitrary form payloads without tighter filtering.
- There is still no explicit origin/content-type/body-size filtering at the Cloudflare layer.

Why this matters:

- For a small volunteer system, this may be acceptable operationally.
- It is still not ideal relative to the original goal of improving both speed and security.
- Logging response bodies can expose unnecessary booking data in logs.

Improvement needed:

- Remove response-body logging or replace it with status-only logging.
- Accept only expected fields before forwarding upstream.
- Reject unsupported content types.
- Add a small request-size limit.
- Optionally validate `Origin` when present.
- Add small response-security headers where safe.

## What “ideal” would look like

For this project size, a closer-to-ideal state would be:

1. Repeat visits show booked booths immediately from browser cache.
2. Warm `/api/booked` requests are served from edge cache in a few milliseconds.
3. Apps Script cache is invalidated immediately after bookings so stale display windows stay short.
4. `getBooked()` uses a single narrow sheet read instead of full-sheet or multiple fragmented reads.
5. The booking proxy strips unnecessary input and logs no booking payload content.
6. Cold-load performance is re-measured after correctness and cache invalidation changes.

## Practical next steps

If the goal is to move from “better” to “closer to ideal”, do these next:

1. Fix Apps Script cache invalidation after successful bookings.
2. Replace the three separate sheet reads with one contiguous `E:I` read.
3. Tighten `functions/api/booking.js` request validation and remove response-body logging.
4. Re-run the browser profiler in three scenarios:
   - private window / no localStorage
   - repeat visit with localStorage
   - after a successful booking from a second browser session
