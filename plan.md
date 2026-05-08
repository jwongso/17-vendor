# Booth Booking Performance and Security Plan

## Measured baseline (2026-05-08, before optimisations)

```
script-start        0.2ms
initial redraw      4.4ms   ← SVG render, very fast
dom-content-loaded  6.7ms
window-load       295.2ms
loadBooked fetch  3470.5ms  ← entire delay was here
loadBooked total  3478.9ms
startup-complete  3484.0ms  ← user saw uncoloured booths for 3.5 seconds
```

## Measured results after all optimisations (2026-05-08)

| Visit | loadBooked fetch | startup-complete | Notes |
|-------|-----------------|-----------------|-------|
| Load 1 (CDN cold) | 2925ms | 2937ms | CDN warming; Apps Script CacheService skips sheet read |
| Load 2 (cached) | **17ms** | **376ms** | CDN hit; localStorage hydrates booked booths at 6.9ms |

**Booked booths visible to repeat visitors: ~7ms (down from 3484ms)**

---

## Main startup bottleneck (resolved)

The slow part was not the booth SVG itself. The visible delay came from the path used to mark reserved booths:

`index.html` -> `/api/booked` -> Google Apps Script -> Google Sheet full read

- `loadBooked()` waited for the network before reserved booths appeared.
- `functions/api/booked.js` returned `Cache-Control: no-store`.
- `apps-script.js:getBooked()` read the whole sheet with `getDataRange().getDisplayValues()`.
- `index.html` rebuilt the SVG again after booked data arrived.

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
- Profiling confirmed: `cache-hit` fires at 6.9ms; booked booths coloured before network responds.
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

- Added `const boothNodes = {};` — registry mapping `booth.id → { g, shape, titleEl }`.
- Renamed `buildSVG(tab)` → `initSVG(tab)`: creates all DOM nodes once (geometry, text label, title element, power icon). Stores references in `boothNodes`. Click handler attached to all booths — permanently unavailable ones already have `pointer-events: none` via CSS so clicks never fire.
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
- Profiling confirmed: `loadBooked fetch` dropped to **17ms** on warm CDN hit.

### ✅ 4. Cache booked data inside Apps Script

**Status: DONE** — committed `3212e2c` (combined with item 5 below)

Target: `apps-script.js`

Implementation:

- At the top of `getBooked()`: call `CacheService.getScriptCache().get('booked_v1')`. If hit, return the cached JSON string directly — no sheet access at all.
- On cache miss: read sheet (narrow columns only — see item 5), build result, call `cache.put('booked_v1', result, 30)`.
- In `handleBooking()` after writing the booking row: call `CacheService.getScriptCache().remove('booked_v1')` so the next GET immediately reflects the new booking.
- Warm cache benchmark: Apps Script response dropped from 4.6s (cold) to 2.6s (warm) — the 2.6s residual is Google's own redirect chain, not sheet access.

### ✅ 5. Read only the columns needed from Google Sheets

**Status: DONE** — committed `3212e2c` (combined with item 4)

Target: `apps-script.js`

Implementation:

- Replaced `sheet.getDataRange().getDisplayValues()` (all columns) with three targeted range reads:
  - `sheet.getRange(2, 5, lastRow-1, 1)` — column E (stallname)
  - `sheet.getRange(2, 6, lastRow-1, 1)` — column F (booths)
  - `sheet.getRange(2, 9, lastRow-1, 1)` — column I (status)
- Each read fetches only 1 column instead of 9; reduces data transferred from Sheets API.
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
