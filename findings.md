# 17-Vendor Analysis Findings

**System**: Vendor booth booking for HUT RI ke-81, backed by Google Apps Script + Google Sheets, proxied via Netlify/Cloudflare Pages.  
**Scale**: < 100 users  
**Date**: 2026-05-07

---

## CRITICAL

### 1. URL Mismatch Between Deployment Targets
**Files**: `functions/api/booking.js:2`, `functions/api/booked.js:2`, `netlify/functions/booking.js:7`, `netlify/functions/booked.js:7`

Cloudflare Pages functions and Netlify functions point to different Apps Script deployment URLs. Depending on which platform serves a request, data is written to different backends — causing silent data inconsistency. It is unclear which deployment is active in production.

### 2. Build Script Incompatible with Netlify
**Files**: `build.sh`, `netlify.toml`

`build.sh` reads `$CF_PAGES_COMMIT_SHA` (a Cloudflare Pages environment variable), but `netlify.toml` deploys to Netlify. The hash substitution never fires on Netlify, so `__HASH__` remains a literal string in production builds.

### 3. Hardcoded Apps Script URLs in 4 Files
**Files**: `functions/api/booking.js:2`, `functions/api/booked.js:2`, `netlify/functions/booking.js:7`, `netlify/functions/booked.js:7`

The Apps Script deployment URL is duplicated across 4 files with no environment variable abstraction. Changing the backend URL requires 4 manual edits, increasing the risk of version drift and deployment errors.

### 4. Booth 27 State Inconsistency
**Files**: `index.html:667`, `README.md:97`

README marks booth 27 as "Grey | N/A" (not available), but `index.html` defines it as a normal $220 bookable booth with no `available: false` flag. Users can book a booth that documentation says is blocked.

### 5. Phone Validation May Silently Reject Valid Inputs
**Files**: `apps-script.js:93`, `index.html:923`

Server-side regex `/^[\d\s\+\-\(\)]{5,20}$/` may reject edge-case valid phone formats. Frontend validation only checks `email.includes('@')` for email and has no phone validation, masking server-side rejections until form submission.

---

## HIGH

### 6. PII Disclosure via Public API
**File**: `apps-script.js:40-66`

`getBooked()` returns vendor names and stall names to any unauthenticated client. This is called on every page load and exposed at `/api/booked` with no access control or rate limiting. Anyone can enumerate all registered vendors.

**Improvement**: Return only booth IDs and a boolean `taken` status. Strip all vendor PII from the public response.

### 7. Color-to-Price Mismatches in Booth Definitions
**File**: `index.html:667-682`

Multiple booths have color codes that contradict their listed prices:
- Booths 28, 29: price $220 (red) but colored pink ($250)
- Booth 33: price $200 (yellow) but colored red ($220)
- Booth 40: price $200 but colored red ($220)
- Booth 42: price $220 but colored yellow ($200)

Vendors will misread pricing from the visual map.

### 8. Insufficient Email Validation
**Files**: `apps-script.js:88`, `index.html:923`

Server regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepts malformed emails (e.g. `a@b.c`, `test@.com`). Frontend only checks for the presence of `@`. Confirmation emails sent to invalid addresses will bounce with no recovery mechanism.

### 9. Email Notifications Not Atomic
**File**: `apps-script.js:153-200`

Booking row is written to the Sheet *before* emails are sent. Email failures are caught and marked non-fatal. If both emails fail, the booking is confirmed in the Sheet but the vendor receives no confirmation — likely triggering a duplicate submission.

**Improvement**: On email failure, flag the booking row as "pending confirmation" and surface it to the coordinator, or implement retry logic.

### 10. Missing Explicit CORS Headers on Netlify Functions
**Files**: `netlify/functions/booking.js:51-55`, `netlify/functions/booked.js:29-33`

Functions return responses without explicit `Access-Control-Allow-*` headers, relying on Netlify's automatic CORS handling. PII from `booked.js` is returned without origin validation.

### 11. No CSRF Protection or Rate Limiting
**Files**: `index.html:942-946`, `apps-script.js:24-38`

The booking endpoint accepts POST requests with no CSRF token. No per-IP or per-session rate limiting exists. Any third-party site can trigger bookings via cross-origin fetch; the endpoint is trivially spammable.

### 12. Booth Total Not Validated Server-Side
**Files**: `index.html:809-813`, `apps-script.js:73-151`

Frontend computes discounts (5% for 2 booths, 10% for 3+) and sends the resulting `total` to the server. The server records the submitted total without verifying it against actual booth prices. An attacker can submit `total: 0` for any booth.

---

## MEDIUM

### 13. Race Condition After Successful Booking
**File**: `index.html:950-955`

Success is shown immediately after the server responds, but `loadBooked()` runs asynchronously afterward. If the reload fails, the user sees a success message but the booth map remains stale and shows taken booths as available.

### 14. No Idempotency / Duplicate Submission Guard
**File**: `apps-script.js:136-151`

Rapid double-clicks or browser back-button navigation after success can create multiple identical rows in the Sheet. No idempotency key or deduplication check exists.

### 15. Conflict UX Closes Modal Instead of Allowing Recovery
**File**: `index.html:957-964`

When a booth conflict is detected, the modal closes entirely (line 963) rather than marking just the conflicting booth and letting the user pick a replacement. The user must reopen the modal and start the selection process over.

### 16. Google Sheet Column Indices Hardcoded
**File**: `apps-script.js:46-58, 117-149`

Sheet columns are accessed by raw numeric index (Name=1, Stallname=4, Booths=5, etc.). Any column insertion or deletion in the Sheet silently corrupts data written to wrong columns, with no validation or error surfaced.

**Improvement**: Read column positions from header row names at startup instead of hardcoding indices.

### 17. No Audit Trail for Sheet Changes
**File**: `apps-script.js`

The Google Sheet is edited directly. Status changes, cancellations, and manual edits leave no record of who made the change or when. Disputes cannot be investigated and accidental changes cannot be rolled back.

### 18. Single Point of Failure — Google Sheet
**File**: `apps-script.js:41`

The entire system depends on a single Google Sheet with no backup or replication. Sheet deletion or corruption results in total data loss and a complete system outage.

### 19. Build Hash Only Written to `console.log`
**File**: `index.html:635`

Even when hash injection works correctly (only on Cloudflare), the commit hash is only written into a `console.log()` call. It does nothing for browser cache invalidation.

### 20. Dual Deployment Architecture Unmaintained
**Files**: `functions/api/`, `netlify/functions/`

Two complete function implementations exist for Cloudflare Pages and Netlify respectively. They use different Apps Script URLs and diverge silently. It is not clear which platform is canonical production.

---

## LOW

### 21. `closeModal()` Does Not Reset Checkbox
**File**: `index.html:882-890`

`closeModal()` clears input fields but does not reset the `f-agree` checkbox. On second open, the checkbox state from the previous session persists, leaving the confirm button in an unexpected enabled/disabled state.

### 22. No Loading Indicator During `loadBooked()`
**File**: `index.html:1000-1002`

`loadBooked()` runs silently on page load. On slow networks, all booths appear available and then suddenly gray out. Users may select a booth that is already taken before the update completes.

### 23. SVG Booth Text Readability
**File**: `index.html:748-753`

Booth labels use `stroke-width: 2` for an outline effect. On small booths this makes numbers hard to read, especially on mobile. CSS `text-shadow` would produce better results.

### 24. Test Scripts Hardcode Booth Numbers
**Files**: `tests/test-*.sh`

Tests hardcode booths 44, 45, 46 with no cleanup mechanism. If those booths are legitimately booked, the tests fail and the booths are blocked for real vendors until manually cleared.

### 25. Documentation Version Mismatch
**Files**: `README.md:1`, `index.html:470`

README title says "HUT RI ke-80"; the application says "ke-81". Tab labels and booth range descriptions may also be inconsistent.

### 26. Manual Apps Script Deployment Required
**File**: `README.md:130-138`

Every change to `apps-script.js` requires a manual redeploy via the Google Apps Script UI. No CI/CD automation exists. Risk of deploying the wrong version or forgetting to redeploy after a code change.

### 27. Inconsistent Booth `color` Field Pattern
**File**: `index.html:667-682`

Some booths define an explicit `color` property; others rely on a price-to-color lookup. There is no consistent rule, making the data model hard to read and maintain.

### 28. Frontend Validation Too Weak Overall
**Files**: `index.html:923`, `apps-script.js:88-93`

Email validation is `email.includes('@')` — catches nothing useful. Phone field has no frontend validation. Server-side validation is the only gate, giving users no immediate feedback on invalid inputs.

---

## Recommended Priority Order

| # | Action |
|---|--------|
| 1 | Pick **one** deployment platform (Netlify or Cloudflare) and delete the other |
| 2 | Move Apps Script URL to an **environment variable** |
| 3 | Fix `build.sh` to use the correct env var for the chosen platform |
| 4 | Strip vendor PII from `/api/booked` — return only booth IDs + taken status |
| 5 | Validate booth `total` **server-side** in Apps Script |
| 6 | Add CSRF token and basic rate limiting |
| 7 | Fix booth 27 availability + correct all color-price mismatches |
| 8 | Fix email atomicity — retry or flag as "pending confirmation" on failure |
| 9 | Replace hardcoded column indices with header-name lookups |
| 10 | Improve email + phone validation on both frontend and server |

---

*28 total issues: 5 Critical, 7 High, 8 Medium, 8 Low*
