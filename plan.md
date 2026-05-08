# Booth Booking Performance and Security Plan

This file contains suggestions only. No runtime behavior changes are included here.

## Main startup bottleneck

The slow part is not the booth SVG itself. The visible delay comes from the path used to mark reserved booths:

`index.html` -> `/api/booked` -> Google Apps Script -> Google Sheet full read

Right now:

- `loadBooked()` waits for the network before reserved booths appear.
- `functions/api/booked.js` always returns `Cache-Control: no-store`.
- `apps-script.js:getBooked()` reads the whole sheet with `getDataRange().getDisplayValues()`.
- `index.html` rebuilds the SVG again after booked data arrives.

For a system with fewer than 50 users, this is still workable, but it is the clearest place to reduce startup latency.

## Recommended plan

### 1. Fastest visible improvement: show cached booked booths immediately

Target: `index.html`

Suggested change:

- Save the last successful `/api/booked` payload in `localStorage`.
- On page load, hydrate `taken` and `bookedNames` from that cache before the network request finishes.
- Keep a short TTL such as 30 to 60 seconds.
- Still call `/api/booked` in the background and refresh the UI when the latest data arrives.

Why this helps:

- Reserved booths appear almost instantly for repeat visitors.
- Even if Apps Script is slow for a moment, the page does not look empty.

Low-risk implementation notes:

- Use a key like `booked-cache-v1`.
- Validate shape before using cached data.
- If cache is invalid or expired, fall back to current behavior.

### 2. Reduce repeat work on the frontend

Target: `index.html`

Suggested change:

- Build each booth SVG only once.
- Store references to the booth nodes.
- Update booth colors, classes, and tooltips in place instead of recreating all SVG elements on every selection and every booked refresh.

Why this helps:

- Smoother interaction on mobile.
- Less unnecessary DOM churn during startup and selection changes.

### 3. Add short edge caching for booked status

Target: `functions/api/booked.js`

Suggested change:

- Change the response to use short CDN caching, for example:
  - `s-maxage=10` or `15`
  - `stale-while-revalidate=30` or `60`
- Support a `fresh=1` query parameter to bypass cache when needed after a successful booking.

Why this helps:

- Most visitors will get the reserved-booth list from Cloudflare instead of waiting on Apps Script every time.
- Short TTL is enough for a small volunteer booking system.

Tradeoff:

- Startup becomes faster, but there is a brief stale window. That is acceptable if booking submission still performs the server-side conflict check, which it already does.

### 4. Cache booked data inside Apps Script

Target: `apps-script.js`

Suggested change:

- Cache the JSON result of `getBooked()` using `CacheService`.
- Use a short TTL such as 30 seconds.
- Invalidate that cache after a successful booking.
- Also clear it on sheet edits affecting booth or status columns.

Why this helps:

- Repeated reads stop hitting the spreadsheet on every page load.
- Manual cancellations in the sheet can still become visible quickly if cache invalidation is wired correctly.

### 5. Read only the columns needed from Google Sheets

Target: `apps-script.js`

Suggested change:

- For `getBooked()`, read only columns `E:I` or just the exact booth/status columns needed.
- For conflict checks in `handleBooking()`, read only columns `F:I`.
- Avoid `getDataRange()` when only a subset of columns is required.

Why this helps:

- Lower Apps Script execution time.
- Less data moved from Sheets into the script.

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
