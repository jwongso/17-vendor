// Cloudflare Pages Function: proxy GET booked list from Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBP3mXsaF39d7KE7tREkluxt9fy9GqzFeMu9eS2R5r2B4a4U_jaY0tCuCbCHKgKr7Z/exec';

export async function onRequest() {
  try {
    const res  = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
    const data = await res.json();
    return Response.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' }
    });
  } catch (err) {
    return Response.json(
      { error: 'Gagal memuat data pemesanan.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
