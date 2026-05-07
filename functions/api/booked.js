// Cloudflare Pages Function: proxy GET booked list from Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxv0JGRgrgjQLLBwdpP0KNW_M_JCSBhX_IfRj1G6eXw2iMExrNsC-wHb5QttN-0rRpfxA/exec';

export async function onRequest() {
  try {
    const res  = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ booked: [] });
  }
}
