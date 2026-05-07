# Vendor Booth Booking – HUT RI ke-80

Interactive web app for vendors to select and book stands at an Indonesian Independence Day celebration event.

---

## Current State

### Done
- [x] `index.html` — complete single-file booking app (no framework, no build step)
- [x] `apps-script.js` — Google Apps Script backend (serverless, free)
- [x] `netlify/functions/booked.js` — Netlify proxy: GET booked list (avoids CORS)
- [x] `netlify/functions/booking.js` — Netlify proxy: POST booking → GET to Apps Script
- [x] `netlify.toml` — build command auto-injects git commit hash at deploy time
- [x] SVG overlay on JPEG floor plans (Indoor booths 1–19, Outdoor 20–47)
- [x] Clickable booths with price-tier colour coding
- [x] Sticky summary bar: selected stands + running total
- [x] Booking modal: terms, summary tags, name/email/phone form
- [x] Race condition protection: `LockService` mutex + server-side conflict check
- [x] On-load GET: page reads booked booths from Sheet and greys them out
- [x] Conflict handling: conflicted booths turn grey instantly, vendor sees error
- [x] Dual email notification: confirmation to vendor + alert to coordinator (non-fatal — email failures don't block booking)
- [x] Booth reset: coordinator changes Status column to `Cancelled` in Sheet
- [x] Build hash auto-injected by Netlify (`$COMMIT_REF`) — visible in DevTools console

### Optional / TODO
- [ ] Fine-tune SVG booth coordinate positions if any overlays are visually misaligned
- [ ] Add 30-second auto-refresh of booked status for busy event day
- [ ] Add `payment_status` column to Sheet (Unpaid / Paid / Cancelled)

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Complete UI — single file, no build step |
| `apps-script.js` | Paste into Google Apps Script editor; deploy as Web App |
| `netlify/functions/booked.js` | Serverless proxy: GET booked booth list |
| `netlify/functions/booking.js` | Serverless proxy: submit a booking |
| `netlify.toml` | Netlify config: publish dir, functions dir, Node 18, build hash injection |
| `indoor.jpeg` | Indoor floor plan (1065×654 px); booths 1–19 |
| `outdoor.jpeg` | Outdoor floor plan (1065×653 px); booths 20–47 |

---

## Architecture

```
Browser (index.html)
    │
    ├── GET  /.netlify/functions/booked
    │         └── Netlify function → GET Apps Script → { booked: [...] }
    │                                  page greys out taken booths
    │
    └── POST /.netlify/functions/booking
              └── Netlify function → GET Apps Script ?action=book&...
                        │
                        ├── LockService.tryLock()        (mutex: blocks concurrent writes)
                        ├── re-read Sheet                (check-then-act, atomic)
                        ├── conflict? → return { success: false, conflict: [...] }
                        ├── no conflict → appendRow()    (Status = Active)
                        ├── MailApp: vendor email        (non-fatal try-catch)
                        ├── MailApp: coordinator email   (non-fatal try-catch)
                        ├── releaseLock()
                        └── return { success: true }
```

**Why GET instead of POST to Apps Script?**
Apps Script POST requests trigger a browser-session redirect that fails server-to-server.
GET requests work reliably; all booking params are passed as query string.

**Google Sheet = Single Source of Truth.**
The UI has no local persistence; every page load re-reads the sheet.

### Concurrency pattern

| Term | Applied here |
|---|---|
| Race condition (TOCTOU) | Two vendors select the same booth simultaneously |
| Optimistic Concurrency Control | UI does not lock booth on selection; checks only at submit |
| Mutex | `LockService.getScriptLock()` — one writer at a time |
| Check-Then-Act (atomic) | Re-read sheet inside lock before writing |

---

## Booth Reference

### Price tiers

| Colour | Price | Indoor booths | Outdoor booths |
|---|---|---|---|
| Yellow | $200 | 1, 2, 11, 12 | 33, 34, 39, 40, 43 |
| Red | $220 | 3, 4, 9, 10, 13, 15 | 21–26, 28–32, 41, 42, 44–47 |
| Pink | $250 | 5, 6, 7, 8, 14, 16, 17, 18 | 35, 36, 37, 38 |
| Purple | $250 FT | 19 (circle, Food Truck) | 20 (Food Truck) |
| Grey | N/A | — | 27 (not available) |

### SVG states

| State | Colour | Clickable |
|---|---|---|
| Available | Price tier colour | Yes |
| Selected | Green `#27ae60` | Yes (deselects) |
| Taken / Booked | Grey `#888` | No |
| Not Available | Grey `#888` | No (pointer-events: none) |

---

## Setup Guide

### 1. Google Sheet

Create a new Google Sheet. Rename the default tab to **`Bookings`** (exact spelling).

Add these headers in row 1:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Timestamp | Name | Email | Phone | Booths | Location | Total | Status |

### 2. Google Apps Script

1. In the sheet: **Extensions → Apps Script**
2. Delete the default code; paste contents of `apps-script.js`
3. Set `COORDINATOR_EMAIL` on line 12 to the coordinator's Gmail address
   - Multiple recipients: use comma — `"a@gmail.com, b@gmail.com"`
4. Save (Ctrl+S)

### 3. Deploy as Web App

1. **Deploy → New deployment → Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Click **Deploy** — authorize Gmail + Sheets permissions when prompted
5. Copy the Web App URL

> Every time you edit the Apps Script code, go to **Deploy → Manage deployments → Edit (pencil) → New version → Update** to apply changes. The URL stays the same.

### 4. Update Netlify functions

In both `netlify/functions/booked.js` and `netlify/functions/booking.js`, update `APPS_SCRIPT_URL` to the Web App URL from step 3. Commit and push — Netlify redeploys automatically.

### 5. Test

1. Open `https://vermillion-lokum-980f0a.netlify.app`
2. Confirm DevTools console shows `Build: <commit hash>`
3. Select a booth, fill the form, submit
4. Verify: Sheet has new row with `Status = Active`
5. Verify: vendor email received
6. Verify: coordinator email received
7. Reload the page: booked booth should appear grey

---

## Coordinator: Managing Bookings

### To cancel / reset a booth

Open the Google Sheet → find the booking row → change column **H (Status)** from `Active` to `Cancelled`.

Next page reload, that booth is available again.

### To manually block a booth (without a real booking)

Add a row manually in the sheet. Fill column **E (Booths)** with the booth number and column **H (Status)** as `Active`. Leave other fields blank or add a note. The booth will appear blocked on the map.

---

## Debugging

Open DevTools → Console. On page load:
```
Build: 7ad638a        ← confirms latest Netlify deploy
```

On booking submit:
```
Booking response (HTTP 200): {"success":true}
```
or
```
Booking response (HTTP 200): {"success":false,"error":"..."}   ← exact Apps Script error
```

---

## Local Development

```bash
cd ~/proj/17-vendor
python3 -m http.server 8080
# open http://localhost:8080
```

> Netlify functions are not available locally. For local testing, temporarily set `APPS_SCRIPT_URL`
> directly in `index.html` and submit via `no-cors` fetch, or use `netlify dev` if Netlify CLI is installed.

