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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows  = sheet.getDataRange().getValues();

  const booked = [];
  const info   = {};
  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][8]; // column I (Status)
    if (String(status).trim().toLowerCase() === 'cancelled') continue;
    String(rows[i][5]).split(',').forEach(s => { // column F (Booths)
      const n = parseInt(s.trim());
      if (!isNaN(n)) {
        booked.push(n);
        if (info[n]) {
          // Duplicate active booking — append name to flag conflict
          info[n].name += ' ⚠️ ' + rows[i][1];
        } else {
          info[n] = { name: rows[i][1], stallname: rows[i][4] }; // col B, E
        }
      }
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify({ booked, info }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── handleBooking: validate, record booking, send emails ──────
// Called by doGet (action=book) — GET works reliably server-to-server.
// Uses LockService to prevent double-booking race conditions.
// Returns: { success: true }
//       or { success: false, conflict: [5, 21] }
function handleBooking(params) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Server sedang sibuk, coba lagi.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const rows  = sheet.getDataRange().getValues();

    const requested = String(params.booths)
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n));

    // Check every Active row for overlap with requested booths
    const conflict = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][8]).trim().toLowerCase() === 'cancelled') continue; // column I (Status)
      String(rows[i][5]).split(',').forEach(s => { // column F (Booths)
        const n = parseInt(s.trim());
        if (requested.includes(n) && !conflict.includes(n)) conflict.push(n);
      });
    }

    if (conflict.length > 0) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, conflict }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // No conflict: write the booking row
    const timestamp = new Date();
    sheet.appendRow([
      timestamp,           // A: Timestamp
      params.name,         // B: Name
      params.email,        // C: Email
      params.phone,        // D: Phone
      params.stallname,    // E: Stall Name
      params.booths,       // F: Booths
      params.location,     // G: Location
      params.total,        // H: Total
      'Active'             // I: Status  (change to 'Cancelled' to unblock)
    ]);

    // Confirmation email to the vendor (non-fatal if it fails)
    try {
      MailApp.sendEmail({
        to:       params.email,
        subject:  '✅ Konfirmasi Pemesanan Stand – HUT RI ke-81',
        htmlBody: `
          <div style="font-family:sans-serif; max-width:480px;">
            <h2 style="color:#CC0001; border-bottom:2px solid #CC0001; padding-bottom:8px;">
              Pemesanan Stall Diproses
            </h2>
            <p>Yth. <strong>${params.name}</strong>,</p>
            <p>Terima kasih! Berikut rincian pemesanan stand Anda:</p>
            <table style="width:100%; border-collapse:collapse; margin:14px 0;">
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666; width:40%;">Stand</td>
                <td style="padding:8px 12px;"><strong>#${params.booths}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Nama Stall</td>
                <td style="padding:8px 12px;"><strong>${params.stallname}</strong></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Lokasi</td>
                <td style="padding:8px 12px;">${params.location}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Total</td>
                <td style="padding:8px 12px;"><strong style="color:#CC0001;">${params.total}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">No. HP</td>
                <td style="padding:8px 12px;">${params.phone}</td>
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
        subject: `📦 Pemesanan Baru: Stand #${params.booths} – ${params.name}`,
        htmlBody: `
          <div style="font-family:sans-serif; max-width:480px;">
            <h2 style="color:#CC0001;">Pemesanan Stand Baru Masuk</h2>
            <table style="width:100%; border-collapse:collapse;">
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666; width:35%;">Nama</td>
                <td style="padding:8px 12px;"><strong>${params.name}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Email</td>
                <td style="padding:8px 12px;">${params.email}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">No. HP</td>
                <td style="padding:8px 12px;">${params.phone}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Stand</td>
                <td style="padding:8px 12px;"><strong>#${params.booths}</strong></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Nama Stall</td>
                <td style="padding:8px 12px;"><strong>${params.stallname}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Lokasi</td>
                <td style="padding:8px 12px;">${params.location}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px; color:#666;">Total</td>
                <td style="padding:8px 12px;"><strong style="color:#CC0001;">${params.total}</strong></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px 12px; color:#666;">Waktu</td>
                <td style="padding:8px 12px;">${timestamp.toLocaleString('id-ID')}</td>
              </tr>
            </table>
            <hr style="margin:16px 0; border:none; border-top:1px solid #ddd;">
            <p style="font-size:12px; color:#888;">
              Untuk membatalkan / mereset stand: buka Google Sheet → kolom I (Status) → ubah menjadi <strong>Cancelled</strong>.
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

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock(); // always release, even if an error occurs above
  }
}
