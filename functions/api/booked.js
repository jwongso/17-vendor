// Cloudflare Pages Function: proxy GET booked list from Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzu-bcY5_k9vXeL5d5JElPb14JB0hxmTGqDvoQkjb8oF7wZkzFokNA-9FSerRNqMM63xA/exec';

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
