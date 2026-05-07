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

// ── GET: list booked booths OR process a booking ──────────────
// ?action=book&name=...&email=...&phone=...&booths=...&location=...&total=...
// Returns: { booked: [...] }  or  { success: true }  or  { success: false, conflict: [...] }
function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};

  if (p.action === 'book') {
    return handleBooking(p);
  }

  return getBooked();
}

function getBooked() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows  = sheet.getDataRange().getValues();

  const booked = [];
  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][7]; // column H
    if (status === 'Cancelled') continue;
    String(rows[i][4]).split(',').forEach(s => {
      const n = parseInt(s.trim());
      if (!isNaN(n)) booked.push(n);
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify({ booked }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── handleBooking: validate, record booking, send emails ──────
// Called by doGet (action=book) — GET works reliably server-to-server.
// Uses LockService to prevent double-booking race conditions.
// Returns: { success: true }
//       or { success: false, conflict: [5, 21] }
function handleBooking(params) {
  const lock = LockService.getScriptLock();
  lock.tryLock(15000);

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
      if (rows[i][7] === 'Cancelled') continue;
      String(rows[i][4]).split(',').forEach(s => {
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
      timestamp,      // A: Timestamp
      params.name,    // B: Name
      params.email,   // C: Email
      params.phone,   // D: Phone
      params.booths,  // E: Booths
      params.location,// F: Location
      params.total,   // G: Total
      'Active'        // H: Status  (change to 'Cancelled' to unblock)
    ]);

    // Confirmation email to the vendor
    MailApp.sendEmail({
      to:       params.email,
      subject:  '✅ Konfirmasi Pemesanan Stand – HUT RI ke-80',
      htmlBody: `
        <div style="font-family:sans-serif; max-width:480px;">
          <h2 style="color:#CC0001; border-bottom:2px solid #CC0001; padding-bottom:8px;">
            Pemesanan Stand Dikonfirmasi
          </h2>
          <p>Yth. <strong>${params.name}</strong>,</p>
          <p>Terima kasih! Berikut rincian pemesanan stand Anda:</p>
          <table style="width:100%; border-collapse:collapse; margin:14px 0;">
            <tr style="background:#f9f9f9;">
              <td style="padding:8px 12px; color:#666; width:40%;">Stand</td>
              <td style="padding:8px 12px;"><strong>#${params.booths}</strong></td>
            </tr>
            <tr>
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
          <p>Panitia akan menghubungi Anda dalam <strong>1x24 jam</strong> untuk informasi pembayaran.</p>
          <p style="color:#888; font-size:12px; margin-top:20px;">
            Panitia HUT Kemerdekaan RI ke-80
          </p>
        </div>
      `
    });

    // Notification email to the coordinator
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
            Untuk membatalkan / mereset stand: buka Google Sheet → kolom H (Status) → ubah menjadi <strong>Cancelled</strong>.
          </p>
        </div>
      `
    });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock(); // always release, even if an error occurs above
  }
}
