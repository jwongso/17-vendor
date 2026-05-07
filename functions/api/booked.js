// Cloudflare Pages Function: proxy GET booked list from Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz7lgE39ad-4_daI-lymJmJtqfDDqCsTBv1AdmB0-_et6yim7V0pwzWu5e6holHPHb5rQ/exec';

export async function onRequest() {
  try {
    const res  = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
    const data = await res.json();
    return Response.json(data, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    return Response.json({ booked: [] }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}
