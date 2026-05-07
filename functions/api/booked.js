// Cloudflare Pages Function: proxy GET booked list from Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyozsW9ZCU214KtzkvC4oMPxTRb1RdkxMGJAmCfSsIIgD1una8y9BRu1f9GkOu4eSL8KA/exec';

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
