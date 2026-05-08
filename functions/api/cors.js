const DEFAULT_MAX_AGE = '86400';

function parseAllowedOrigins(envValue) {
  return String(envValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getOriginPolicy(origin, requestUrl, env) {
  if (!origin) {
    return { allowed: true, headerValue: null };
  }

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return { allowed: false, reason: 'Invalid origin' };
  }

  const requestOrigin = new URL(requestUrl).origin;
  if (originUrl.origin === requestOrigin) {
    return { allowed: true, headerValue: originUrl.origin };
  }

  const allowedOrigins = parseAllowedOrigins(env && env.ALLOWED_ORIGINS);
  if (allowedOrigins.includes('*')) {
    return { allowed: true, headerValue: '*' };
  }
  if (allowedOrigins.includes(originUrl.origin)) {
    return { allowed: true, headerValue: originUrl.origin };
  }

  return { allowed: false, reason: 'Forbidden origin' };
}

export function corsHeaders(origin, requestUrl, env, methods) {
  const policy = getOriginPolicy(origin, requestUrl, env);
  if (!policy.allowed) return { policy, headers: null };

  const headers = new Headers();
  if (policy.headerValue) {
    headers.set('Access-Control-Allow-Origin', policy.headerValue);
    if (policy.headerValue !== '*') {
      headers.set('Vary', 'Origin');
    }
  }
  headers.set('Access-Control-Allow-Methods', methods.join(', '));
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', DEFAULT_MAX_AGE);
  return { policy, headers };
}

export function preflightResponse(request, env, methods) {
  const origin = request.headers.get('origin');
  const { policy, headers } = corsHeaders(origin, request.url, env, methods);
  if (!policy.allowed) {
    return new Response(policy.reason, { status: 403 });
  }
  return new Response(null, { status: 204, headers });
}
