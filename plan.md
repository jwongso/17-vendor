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

### ✅ 6. Preload the first visible floor-plan image

**Status: DONE** — committed `45c151b`

Target: `index.html`

Implementation:

- Added `<link rel="preload" as="image" href="Indoor.jpg">` — browser fetches the indoor map in parallel with CSS/JS during page load.
- Added `<link rel="prefetch" href="Outdoor.jpg">` — browser fetches the outdoor map in idle time, ready when the user switches tabs.

## Security hardening

These do not materially change the booking flow, but they reduce avoidable risk.

### ✅ 7. Stop logging request/response content with user data

**Status: DONE** — committed `3b426ff`

Target: `functions/api/booking.js`

Implementation:

- Removed `console.log('Apps Script response:', text.substring(0, 300))`.
- No booking payload content is logged anywhere in the proxy.

### ✅ 8. Tighten request validation at the Cloudflare layer

**Status: DONE** — committed `3b426ff`

Target: `functions/api/booking.js`

Implementation:

- Added `MAX_BODY_BYTES = 4096` constant; checked both `Content-Length` header and actual body length — returns 413 if exceeded.
- Added content-type check: rejects with 415 if not `application/x-www-form-urlencoded`.
- Added `FORWARDED_FIELDS = ['name', 'stallname', 'email', 'phone', 'booths']` allowlist; only those fields are forwarded upstream — all other fields are silently dropped.
- Added `jsonResponse()` helper that adds `Cache-Control: no-store` and security headers to all responses.

### ✅ 9. Keep server-side validation authoritative

**Status: DONE** — committed `1c18b6e`

Target: `apps-script.js`

Implementation:

- Added `hasControlChars(s)`: rejects strings containing ASCII control characters `\x00–\x08`, `\x0B`, `\x0C`, `\x0E–\x1F`, `\x7F`. Applied to `name`, `stallname`, `email`.
- Added max length checks: `name` and `stallname` ≤ 100 chars; `email` ≤ 200 chars.
- Booth IDs deduplicated with `[...new Set(...)]` after parsing — prevents a client sending `"5,5,5"` to inflate pricing or conflict checks.
- Booth parse now uses explicit radix `parseInt(s.trim(), 10)`.

### ✅ 10. Add basic response security headers

**Status: DONE (booking.js)** — committed `3b426ff` — ⚠️ booked.js still missing headers

Target: `functions/api/booking.js` ✅, `functions/api/booked.js` ⏳

Implementation so far:

- `booking.js` `jsonResponse()` helper adds to every response:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Cache-Control: no-store`
- `booked.js` still returns responses without these headers — needs a follow-up fix.

### ✅ 11. Optional origin checking for browser requests

**Status: DONE** — committed `3b426ff`

Target: `functions/api/booking.js`

Implementation:

- If `Origin` header is present, parses it as a URL and compares `host` to the request's own `host`.
- Returns 403 `Forbidden origin` if they don't match.
- If `Origin` is absent (e.g. server-to-server), the check is skipped — not relied on as sole control.

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

## Review findings — addressed in commit `3b426ff`

### ✅ 1. High: Apps Script cache invalidated after successful booking

Verified: `handleBooking()` calls `CacheService.getScriptCache().remove(BOOKED_CACHE_KEY)` at line 221 immediately after the booking row is written, before sending emails. A redundant second `remove('booked_v1')` also exists at line 328 — safe but should be cleaned up to use the constant.

### ✅ 2. Medium: Single contiguous E:I read

Fixed: `getBooked()` now uses one `sheet.getRange(2, 5, lastRow - 1, 5).getDisplayValues()` call. Column offsets: `[0]` stallname, `[1]` booths, `[4]` status.

### ✅ 3. Medium: Security hardening in booking proxy

Fixed in `booking.js`: PII logging removed; field allowlist, content-type check, body-size limit, origin check, and security response headers all added via `jsonResponse()` helper.

⏳ Still pending: `booked.js` missing `X-Content-Type-Options` / `Referrer-Policy` headers (item 10 follow-up).

## ✅ All items complete

- **Item 6** (`45c151b`): `Indoor.jpg` preloaded; `Outdoor.jpg` prefetched.
- **Item 9** (`1c18b6e`): Booth dedup, max field lengths (name/stallname ≤ 100, email ≤ 200), control character rejection.
- **Item 10 follow-up** (`0c55a1b`): `booked.js` now adds `X-Content-Type-Options` and `Referrer-Policy` on all responses.
- **Cleanup** (`27337d5`): `apps-script.js` line 328 uses `BOOKED_CACHE_KEY` constant.

⚠️ **Please redeploy `apps-script.js`** — commits `1c18b6e` and `27337d5` changed the script.
