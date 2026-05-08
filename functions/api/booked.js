// Cloudflare Pages Function: proxy GET booked list from Apps Script
import { corsHeaders, preflightResponse } from './cors.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBP3mXsaF39d7KE7tREkluxt9fy9GqzFeMu9eS2R5r2B4a4U_jaY0tCuCbCHKgKr7Z/exec';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return preflightResponse(request, env, ['GET', 'OPTIONS']);
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const origin = request.headers.get('origin');
  const { policy, headers } = corsHeaders(origin, request.url, env, ['GET', 'OPTIONS']);
  if (!policy.allowed) {
    return new Response(policy.reason, { status: 403 });
  }

  const url = new URL(request.url);
  const fresh = url.searchParams.get('fresh') === '1';

  try {
    const upstreamUrl = fresh ? `${APPS_SCRIPT_URL}?t=${Date.now()}` : APPS_SCRIPT_URL;
    const res = await fetch(upstreamUrl, { redirect: 'follow' });
    const data = await res.json();
    return Response.json(data, {
      headers: {
        ...Object.fromEntries(headers || []),
        ...SECURITY_HEADERS,
        'Cache-Control': fresh
          ? 'no-store'
          : 'public, s-maxage=15, stale-while-revalidate=30'
      }
    });
  } catch (err) {
    return Response.json(
      { error: 'Gagal memuat data pemesanan.' },
      {
        status: 503,
        headers: {
          ...Object.fromEntries(headers || []),
          ...SECURITY_HEADERS,
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}
