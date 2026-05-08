// ═══════════════════════════════════════════════════════════════
// Vendor Booth Booking – Google Apps Script
// Deploy as Web App:
//   Execute as:        Me
//   Who has access:    Anyone
//
// After deploying, copy the Web App URL and paste it into
// index.html replacing YOUR_APPS_SCRIPT_URL_HERE
// ═══════════════════════════════════════════════════════════════

const SHEET_NAME        = 'Bookings';
const COORDINATOR_EMAIL = 'YOUR_COORDINATOR_EMAIL_HERE'; // e.g. boss@gmail.com
const BOOKED_CACHE_KEY  = 'booked_v1';
const BOOKED_CACHE_TTL  = 30;

// ── Booth price map (mirrors index.html BOOTHS array) ─────────
const BOOTH_PRICES = {
   1:200,  2:200,  3:220,  4:220,  5:250,  6:250,  7:250,  8:250,
   9:220, 10:220, 11:200, 12:200, 13:220, 14:250, 15:220, 16:250,
  17:250, 18:250,
  19:250, 20:250, 21:220, 22:220, 23:220, 24:220, 25:220, 26:220,
  27:220, 28:220, 29:220, 30:220, 31:220, 32:220, 33:200, 34:200,
  35:250, 36:250, 37:250, 38:250, 39:200, 40:200, 41:220, 42:220,
  43:200, 44:220, 45:220, 46:220, 47:220
};
const INDOOR_IDS = new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);

// ── Auto-format column F as Plain Text on sheet open ──────────
// Prevents Google Sheets from converting booth numbers (e.g. "12, 16, 29") into dates.
function onOpen() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (sheet) sheet.getRange('F:F').setNumberFormat('@');
}

// ── GET: list booked booths OR process a booking ──────────────
// ?action=book&name=...&email=...&phone=...&booths=...&location=...&total=...
// Returns: { booked: [...] }  or  { success: true }  or  { success: false, conflict: [...] }
function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};

    if (p.action === 'book') {
      return handleBooking(p);
    }

    return getBooked();
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getBooked() {
  const cache   = CacheService.getScriptCache();
  const cached  = cache.get(BOOKED_CACHE_KEY);
  if (cached) {
    return ContentService
      .createTextOutput(cached)
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    const empty = JSON.stringify({ booked: [], info: {} });
    cache.put(BOOKED_CACHE_KEY, empty, BOOKED_CACHE_TTL);
    return ContentService.createTextOutput(empty).setMimeType(ContentService.MimeType.JSON);
  }

  // Read one contiguous block (E:I) instead of three separate range calls.
  const rows = sheet.getRange(2, 5, lastRow - 1, 5).getDisplayValues();

  const booked = [];
  const info   = {};
  for (let i = 0; i < rows.length; i++) {
    const stallname = rows[i][0];
    const booths    = rows[i][1];
    const status    = rows[i][4];
    if (String(status).trim().toLowerCase() === 'cancelled') continue;
    String(booths).split(',').forEach(s => {
      const n = parseInt(s.trim(), 10);
      if (!isNaN(n)) {
        booked.push(n);
        if (!info[n]) {
          info[n] = { stallname }; // col E only — no vendor name (PII)
        }
      }
    });
  }

  const result = JSON.stringify({ booked, info });
  cache.put(BOOKED_CACHE_KEY, result, BOOKED_CACHE_TTL);
  return ContentService
    .createTextOutput(result)
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Security helpers ──────────────────────────────────────────

// Escape HTML special chars before interpolating user data into email htmlBody
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Reject strings that start with spreadsheet formula characters (injection guard)
function isSafe(s) {
  return !/^[=+\-@]/.test(String(s));
}

// Compute server-side total from validated booth IDs (ignores client-supplied value)
function serverTotal(ids) {
  const base = ids.reduce((sum, id) => sum + (BOOTH_PRICES[id] || 0), 0);
  const discount = ids.length >= 3 ? 0.10 : ids.length === 2 ? 0.05 : 0;
  return Math.round(base * (1 - discount));
}

// Derive location label from booth IDs (all indoor → 'Indoor', else 'Outdoor')
function serverLocation(ids) {
  return ids.every(id => INDOOR_IDS.has(id)) ? 'Indoor' : 'Outdoor';
}

// Convenience: return a JSON error response
function errResponse(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── handleBooking: validate, record booking, send emails ──────
// Called by doGet (action=book) — GET works reliably server-to-server.
// Uses LockService to prevent double-booking race conditions.
// Returns: { success: true }
//       or { success: false, conflict: [5, 21] }
function handleBooking(params) {
  // ── Server-side input validation ────────────────────────────
  const name      = String(params.name      || '').trim();
  const stallname = String(params.stallname || '').trim();
  const email     = String(params.email     || '').trim();
  const phone     = String(params.phone     || '').trim();
  const booths    = String(params.booths    || '').trim();
  // location and total are NOT accepted from client — computed server-side below

  if (!name || !stallname || !email || !phone || !booths) {
    return errResponse('Semua field wajib diisi.');
  }
  if (!isSafe(name) || !isSafe(stallname)) {
    return errResponse('Input mengandung karakter yang tidak diizinkan.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errResponse('Format email tidak valid.');
  }
  if (!/^[\d\s\+\-\(\)]{5,20}$/.test(phone)) {
    return errResponse('Format nomor HP tidak valid.');
  }

  const requested = booths.split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n >= 1 && n <= 47);

  if (requested.length === 0) {
    return errResponse('Nomor stall tidak valid.');
  }

  // ── Compute location & total server-side (client values ignored) ──
  const location = serverLocation(requested);
  const total    = '$' + serverTotal(requested);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return errResponse('Server sedang sibuk, coba lagi.');
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const lastDataRow = sheet.getLastRow();
    const rows = lastDataRow < 2
      ? []
      : sheet.getRange(2, 6, lastDataRow - 1, 4).getDisplayValues(); // F:I only
    const requestedSet = new Set(requested);

    // Check every Active row for overlap with requested booths
    const conflictSet = new Set();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][3]).trim().toLowerCase() === 'cancelled') continue; // column I (Status)
      String(rows[i][0]).split(',').forEach(s => { // column F (Booths)
        const n = parseInt(s.trim(), 10);
        if (requestedSet.has(n)) conflictSet.add(n);
      });
    }
    const conflict = Array.from(conflictSet);

    if (conflict.length > 0) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, conflict }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // No conflict: write the booking row
    // Set column A to date+time, columns B–H to plain text BEFORE writing
    const timestamp = new Date();
    const lastRow = sheet.getLastRow() + 1;
    sheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss'); // column A: full date+time
    sheet.getRange(lastRow, 2, 1, 7).setNumberFormat('@');             // columns B–H: plain text
    sheet.getRange(lastRow, 1, 1, 9).setValues([[
      timestamp,                  // A: Timestamp
      name,                       // B: Name
      email,                      // C: Email
      phone,                      // D: Phone
      stallname,                  // E: Stall Name
      requested.join(', '),       // F: Booths (server-normalised, plain text)
      location,                   // G: Location (server-computed)
      total,                      // H: Total   (server-computed)
      'Active'                    // I: Status  (change to 'Cancelled' to unblock)
    ]]);
    CacheService.getScriptCache().remove(BOOKED_CACHE_KEY);

    // Confirmation email to the vendor (non-fatal if it fails)
    try {
      MailApp.sendEmail({
        to:       email,
        subject:  '✅ Konfirmasi Pemesanan Stall – HUT RI ke-81',
        htmlBody: `
          <div style="font-family:sans-serif; max-width:480px;">
            <h2 style="color:#CC0001; border-bottom:2px solid #CC0001; padding-bottom:8px;">
              Pemesanan Stall Diproses
            </h2>
            <p>Yth. <strong>${escHtml(name)}</strong>,</p>
            <p>Terima kasih! Berikut rincian pemesanan stall Anda:</p>
            <table style="width:100%; border-collapse:collapse; margin:14px 0;">
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666; width:40%;">Stall</td>
                <td style="padding:8px 12px;"><strong>#${escHtml(requested.join(', '))}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Nama Stall</td>
                <td style="padding:8px 12px;"><strong>${escHtml(stallname)}</strong></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Lokasi</td>
                <td style="padding:8px 12px;">${escHtml(location)}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Total</td>
                <td style="padding:8px 12px;"><strong style="color:#CC0001;">${escHtml(total)}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">No. HP</td>
                <td style="padding:8px 12px;">${escHtml(phone)}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Waktu</td>
                <td style="padding:8px 12px;">${timestamp.toLocaleString('id-ID')}</td>
              </tr>
            </table>
            <p>Panitia akan menghubungi Anda dalam <strong>1x24 jam</strong> untuk approval dan informasi pembayaran.</p>
            <p style="color:#888; font-size:12px; margin-top:20px;">
              Panitia HUT Kemerdekaan RI ke-81
            </p>
          </div>
        `
      });
    } catch (mailErr) {
      console.error('Vendor email failed:', mailErr.message);
    }

    // Notification email to the coordinator (non-fatal if it fails)
    try {
      MailApp.sendEmail({
        to:      COORDINATOR_EMAIL,
        subject: `📦 Pemesanan Baru: Stall #${requested.join(', ')} – ${name}`,
        htmlBody: `
          <div style="font-family:sans-serif; max-width:480px;">
            <h2 style="color:#CC0001;">Pemesanan Stall Baru Masuk</h2>
            <table style="width:100%; border-collapse:collapse;">
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666; width:35%;">Nama</td>
                <td style="padding:8px 12px;"><strong>${escHtml(name)}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Email</td>
                <td style="padding:8px 12px;">${escHtml(email)}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">No. HP</td>
                <td style="padding:8px 12px;">${escHtml(phone)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Stall</td>
                <td style="padding:8px 12px;"><strong>#${escHtml(requested.join(', '))}</strong></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Nama Stall</td>
                <td style="padding:8px 12px;"><strong>${escHtml(stallname)}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Lokasi</td>
                <td style="padding:8px 12px;">${escHtml(location)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Total</td>
                <td style="padding:8px 12px;"><strong style="color:#CC0001;">${escHtml(total)}</strong></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Waktu</td>
                <td style="padding:8px 12px;">${timestamp.toLocaleString('id-ID')}</td>
              </tr>
            </table>
            <hr style="margin:16px 0; border:none; border-top:1px solid #ddd;">
            <p style="font-size:12px; color:#888;">
              Untuk membatalkan / mereset stall: buka Google Sheet → kolom I (Status) → ubah menjadi <strong>Cancelled</strong>.
            </p>
            <p style="font-size:12px; margin-top:8px;">
              🔗 <a href="${SpreadsheetApp.getActiveSpreadsheet().getUrl()}" style="color:#CC0001;">Buka Google Sheet</a>
            </p>
          </div>
        `
      });
    } catch (mailErr) {
      console.error('Coordinator email failed:', mailErr.message);
    }

    CacheService.getScriptCache().remove('booked_v1'); // invalidate so next GET is fresh
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock(); // always release, even if an error occurs above
  }
}
