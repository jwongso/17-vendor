// Cloudflare Pages Function: proxy GET booked list from Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBP3mXsaF39d7KE7tREkluxt9fy9GqzFeMu9eS2R5r2B4a4U_jaY0tCuCbCHKgKr7Z/exec';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const fresh = url.searchParams.get('fresh') === '1';

  try {
    const upstreamUrl = fresh ? `${APPS_SCRIPT_URL}?t=${Date.now()}` : APPS_SCRIPT_URL;
    const res = await fetch(upstreamUrl, { redirect: 'follow' });
    const data = await res.json();
    return Response.json(data, {
      headers: {
        ...SECURITY_HEADERS,
        'Cache-Control': fresh
          ? 'no-store'
          : 'public, s-maxage=15, stale-while-revalidate=30'
      }
    });
  } catch (err) {
    return Response.json(
      { error: 'Gagal memuat data pemesanan.' },
      { status: 503, headers: { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' } }
    );
  }
}
