// Cloudflare Pages Function: proxy booking submission to Apps Script via GET
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBP3mXsaF39d7KE7tREkluxt9fy9GqzFeMu9eS2R5r2B4a4U_jaY0tCuCbCHKgKr7Z/exec';
const MAX_BODY_BYTES = 4096;
const FORWARDED_FIELDS = ['name', 'stallname', 'email', 'phone', 'booths'];
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function jsonResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return Response.json(body, { ...init, headers });
}

async function validateTurnstileToken(token, secret, remoteip) {
  const payload = new URLSearchParams();
  payload.set('secret', secret);
  payload.set('response', token);
  payload.set('idempotency_key', crypto.randomUUID());
  if (remoteip) payload.set('remoteip', remoteip);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString()
    });
    const result = await response.json();
    if (!response.ok) return { success: false, 'error-codes': ['internal-error'] };
    return result;
  } catch {
    return { success: false, 'error-codes': ['internal-error'] };
  }
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(request.url);
      if (originUrl.host !== requestUrl.host) {
        return jsonResponse({ success: false, error: 'Forbidden origin' }, { status: 403 });
      }
    } catch {
      return jsonResponse({ success: false, error: 'Invalid origin' }, { status: 403 });
    }
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('application/x-www-form-urlencoded')) {
    return jsonResponse(
      { success: false, error: 'Unsupported content type' },
      { status: 415 }
    );
  }

  try {
    const headerLength = Number.parseInt(request.headers.get('content-length') || '', 10);
    if (Number.isFinite(headerLength) && headerLength > MAX_BODY_BYTES) {
      return jsonResponse({ success: false, error: 'Payload too large' }, { status: 413 });
    }

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return jsonResponse({ success: false, error: 'Payload too large' }, { status: 413 });
    }

    const incoming = new URLSearchParams(body);
    const turnstileSecret = context.env && context.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      const turnstileToken = incoming.get('cf-turnstile-response') || '';
      if (!turnstileToken) {
        return jsonResponse(
          { success: false, error: 'Selesaikan verifikasi keamanan lalu coba lagi.' },
          { status: 400 }
        );
      }

      const remoteip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')
        || '';
      const validation = await validateTurnstileToken(turnstileToken, turnstileSecret, remoteip);
      if (!validation.success) {
        return jsonResponse(
          {
            success: false,
            error: 'Verifikasi keamanan gagal. Silakan coba lagi.',
            turnstileErrorCodes: validation['error-codes'] || []
          },
          { status: 403 }
        );
      }
    }

    const params = new URLSearchParams();
    params.set('action', 'book');
    FORWARDED_FIELDS.forEach((field) => {
      const value = incoming.get(field);
      if (value !== null) params.set(field, value);
    });

    const url = `${APPS_SCRIPT_URL}?${params.toString()}`;
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return jsonResponse(
        { success: false, error: 'Bad response from Apps Script' },
        { status: 502 }
      );
    }

    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, { status: 500 });
  }
}
