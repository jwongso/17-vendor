# Vendor Booth Booking – HUT RI ke-81

Interactive web app for vendors to select and book stalls at an Indonesian Independence Day celebration event (KKIA 17an).

Live: https://bookingbooth.pages.dev

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Complete UI — single file, no framework |
| `apps-script.js` | Google Apps Script backend — paste into Apps Script editor and deploy |
| `functions/api/booked.js` | Cloudflare Pages Function: proxy GET booked list |
| `functions/api/booking.js` | Cloudflare Pages Function: proxy POST booking |
| `build.sh` | Injects git commit hash (`$CF_PAGES_COMMIT_SHA`) into index.html at deploy |
| `indoor.jpeg` | Indoor floor plan (1065×654 px); booths 1–18 |
| `outdoor.jpeg` | Outdoor floor plan (1065×653 px); booths 19–47 |
| `tests/` | Integration tests (sequential, concurrent, validation, stress) |

---

## Architecture

```
Browser (index.html)
    │
    ├── GET  /api/booked
    │         └── Cloudflare Function → GET Apps Script → { booked: [], info: {} }
    │                                    page greys out taken booths
    │
    └── POST /api/booking
              └── Cloudflare Function → GET Apps Script ?action=book&...
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

### 6. Test

```sh
sh tests/test-booking.sh      # sequential conflict test
sh tests/test-concurrent.sh   # race condition test
sh tests/test-validation.sh   # input validation test
sh tests/test-stress.sh       # stress test
```

After each test run, set test booth rows to `Cancelled` in the sheet.

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

---

## Local Development

```bash
cd ~/proj/17-vendor
python3 -m http.server 8080
# open http://localhost:8080
# Note: /api/* calls won't work locally without Cloudflare Pages dev tools
```
