# Vendor Booth Booking – HUT RI ke-81

Interactive web app for vendors to select and book stalls at an Indonesian Independence Day celebration event (KKIA 17an).

This branch is deployment-agnostic on the frontend: the page reads its API endpoints and Turnstile site key from `config.js`, so the same UI can run on Cloudflare Pages or any other host that exposes equivalent booking endpoints.

Live: https://bookingbooth.pages.dev

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Complete UI — single file, no framework |
| `config.js` | Runtime frontend config: build hash, booked endpoint, booking endpoint, Turnstile site key |
| `apps-script.js` | Google Apps Script backend — paste into Apps Script editor and deploy |
| `functions/api/booked.js` | Cloudflare Pages Function: proxy GET booked list |
| `functions/api/booking.js` | Cloudflare Pages Function: proxy POST booking + Turnstile verification |
| `build.sh` | Injects git commit hash (`$CF_PAGES_COMMIT_SHA`) and `TURNSTILE_SITE_KEY` into `config.js` at deploy |
| `Indoor.jpg` | Indoor floor plan image used by the live page; booths 1–18 |
| `Outdoor.jpg` | Outdoor floor plan image used by the live page; booths 19–47 |
| `tests/` | Integration tests (sequential, concurrent, validation, stress) |

---

## Architecture

```
Browser (index.html)
    │
    ├── GET  bookedEndpoint (from config.js)
    │         └── backend adapter → GET Apps Script → { booked: [], info: {} }
    │                                    page greys out taken booths
    │                                    page refreshes booked state on load, focus,
    │                                    visibility regain, and every 10s while visible
    │
    └── POST bookingEndpoint (from config.js)
              └── backend adapter
                        ├── verify Cloudflare Turnstile token (server-side)
                        └── GET Apps Script ?action=book&...
                        │
                        ├── Input validation (email, phone, booth range)
                        ├── LockService.tryLock()        (mutex: blocks concurrent writes)
                        ├── getDisplayValues()           (conflict check, date-safe)
                        ├── conflict? → return { success: false, conflict: [...] }
                        ├── no conflict → setValues()    (Status = Active, col F plain text)
                        ├── MailApp: vendor email        (non-fatal try-catch)
                        ├── MailApp: coordinator email   (non-fatal try-catch)
                        ├── releaseLock()
                        └── return { success: true }
```

**Why GET instead of POST to Apps Script?**
Apps Script POST requests trigger a browser-session redirect that fails server-to-server.
GET requests work reliably; all booking params are passed as query string.

**Availability refresh behavior**
The browser keeps booth state reasonably fresh without full page reloads:
- local cache for fast repeat visits
- forced refresh when the tab regains focus or becomes visible again
- background polling every 10 seconds while the page is visible
- pre-submit refresh so stale selections are removed before booking is sent

**Backend contract**
The frontend expects:
- booked endpoint: `GET` returning `{ booked: number[], info?: Record<string, { stallname?: string }> }`
- booking endpoint: `POST application/x-www-form-urlencoded` returning `{ success: true }` or `{ success: false, conflict?: number[], error?: string }`
- if Turnstile is enabled, the booking endpoint must accept and verify `cf-turnstile-response`

---

## Google Sheet Structure

Tab name: **`Bookings`** (exact spelling)

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Timestamp | Name | Email | Phone | Stall Name | Booths | Location | Total | Status |

Column F (Booths) must stay as **Plain Text** format — Google Sheets will auto-convert values like "12, 16, 29" into dates otherwise. The `onOpen()` trigger and `setNumberFormat('@')` before each write handle this automatically.

---

## Setup Guide

### 1. Google Sheet

Create a new Google Sheet. Rename the default tab to **`Bookings`**.

Add headers in row 1 matching the table above.

### 2. Google Apps Script

1. In the sheet: **Extensions → Apps Script**
2. Delete default code; paste contents of `apps-script.js`
3. Set `COORDINATOR_EMAIL` on line 12 to the coordinator's Gmail
4. Save (Ctrl+S)

### 3. Deploy as Web App

1. **Deploy → New deployment → Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Click **Deploy** — authorize when prompted
5. Copy the Web App URL

> Every time you edit the Apps Script code: **Deploy → Manage deployments → Edit (pencil) → New version → Update**

### 4. Update Cloudflare functions

In both `functions/api/booked.js` and `functions/api/booking.js`, update `APPS_SCRIPT_URL`.
Commit and push — Cloudflare Pages redeploys automatically.

### 5. Cloudflare Pages Settings

- Build command: `sh build.sh`
- Output directory: `/`
- Environment variable: `ALLOWED_ORIGINS`
  Comma-separated list of allowed frontend origins for cross-host browser requests to `functions/api/booked.js` and `functions/api/booking.js`.
  Example:
  `https://bookingbooth.pages.dev,https://your-site.netlify.app,https://your-future-domain.com`

### 5a. Cloudflare Turnstile

Create a Turnstile widget in Cloudflare and configure these variables in your Pages project:

- `TURNSTILE_SITE_KEY`
  Public site key. Exposed to the browser and injected into `config.js` during build.
- `TURNSTILE_SECRET_KEY`
  Secret key. Kept server-side and used only by `functions/api/booking.js` to call Turnstile Siteverify.

Behavior:

- Booking submission requires a valid Turnstile token when `TURNSTILE_SECRET_KEY` is configured.
- The widget hostname list must include the exact deployed hostname, e.g. `bookingbooth.pages.dev`.
- If you rotate the Turnstile secret, update `TURNSTILE_SECRET_KEY` in Pages and redeploy.

### 5b. Frontend Runtime Config

The frontend reads `window.BOOKING_CONFIG` from `config.js`:

```js
window.BOOKING_CONFIG = {
  buildHash: 'dev',
  bookedEndpoint: '/api/booked',
  bookingEndpoint: '/api/booking',
  turnstileSiteKey: ''
};
```

Notes:

- `bookedEndpoint` and `bookingEndpoint` may be relative paths or full absolute URLs.
- `turnstileSiteKey` may be left empty to hide the widget on environments where Turnstile is not enabled.
- On Cloudflare Pages, `build.sh` replaces the `buildHash` and `turnstileSiteKey` placeholders automatically.

### 5c. Non-Cloudflare Hosting

To use this frontend on another host:

1. Keep `index.html`, `config.js`, and the static assets together.
2. Point `bookedEndpoint` and `bookingEndpoint` at your backend URLs.
3. Re-implement the same API contract on that backend.
4. Verify Turnstile server-side there if you enable it.

The bundled `functions/api/*` files are still useful when testing this branch on Cloudflare Pages previews or production.

### 5d. Netlify Frontend + Cloudflare Backend

If the frontend moves to Netlify while the backend stays on Cloudflare Pages:

1. Edit `config.js` before uploading the frontend.
2. Set absolute Cloudflare API URLs, for example:

```js
window.BOOKING_CONFIG = {
  buildHash: 'netlify',
  bookedEndpoint: 'https://bookingbooth.pages.dev/api/booked',
  bookingEndpoint: 'https://bookingbooth.pages.dev/api/booking',
  turnstileSiteKey: 'YOUR_TURNSTILE_SITE_KEY'
};
```

3. In the Cloudflare Pages project that serves the backend, set `ALLOWED_ORIGINS` to include the Netlify origin.
4. In Turnstile hostname management, add the Netlify hostname as an allowed hostname for the widget.

This lets the static frontend move hosts while the booking API remains on Cloudflare.

### 6. Test

```sh
sh tests/test-booking.sh      # sequential conflict test
sh tests/test-concurrent.sh   # race condition test
sh tests/test-validation.sh   # input validation test
sh tests/test-stress.sh       # stress test
```

After each test run, set test booth rows to `Cancelled` in the sheet.

Current limitation: these shell scripts post directly to the production booking endpoint and do not generate Turnstile tokens. If Turnstile enforcement is enabled in production, the scripts must be updated to send a valid `cf-turnstile-response` token or they will fail with security verification errors.

---

## Coordinator: Managing Bookings

### Cancel / reset a booth

Open Google Sheet → find row → change column **I (Status)** from `Active` to `Cancelled`.

### Manually block a booth

Add a row manually. Fill column **F (Booths)** with the booth number and column **I (Status)** as `Active`.

---

## Booth Reference

### Price tiers

| Colour | Price | Indoor booths | Outdoor booths |
|---|---|---|---|
| Yellow | $200 | 1, 2, 11, 12 | 33, 39, 43 |
| Red | $220 | 3, 4, 9, 10, 13, 15, 28, 29 | 21–26, 30–32, 41, 44–47 |
| Pink | $250 | 5, 6, 7, 8, 14, 16, 17, 18 | 35, 36, 37, 38 |
| Purple | $250 FT | — | 19, 20 (Food Truck) |
| Yellow | $200 special | — | 34, 40, 42 |

### SVG states

| State | Colour | Clickable |
|---|---|---|
| Available | Price tier colour | Yes |
| Selected | Green `#27ae60` | Yes (deselects) |
| Taken / Booked | Grey `#888` | No |
| Not Available | Grey `#888` | No |

### Extra UX details

- Browser tab icon is declared explicitly via `logo81.png`.
- If another user books a selected booth, the client removes it from the current selection and shows a warning before submit.

---

## Local Development

```bash
cd ~/proj/17-vendor
python3 -m http.server 8080
# open http://localhost:8080
# Note: booking calls only work if config.js points to a reachable backend
```
