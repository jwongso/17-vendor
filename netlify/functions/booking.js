// Netlify serverless function: proxy POST to Apps Script
// Uses built-in https module (no npm deps needed) with manual redirect follow.
const https = require('https');
const http  = require('http');
const { URL } = require('url');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzzt9ul4VKSXcuRZgrJxWJxdugv6kNAr0s9LgFrJ2ArxhK35eE2ghOMy7C-a-jKdcMuqw/exec';

function request(urlStr, method, body, redirects) {
  if (redirects > 10) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const u    = new URL(urlStr);
    const lib  = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method,
      headers: body
        ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
        : {}
    };
    const req = lib.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect — GET after redirect (standard browser behaviour)
        return request(res.headers.location, 'GET', null, redirects + 1)
          .then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const result = await request(APPS_SCRIPT_URL, 'POST', event.body, 0);
    console.log('Apps Script status:', result.status);
    console.log('Apps Script body:', result.body.substring(0, 300));

    let data;
    try {
      data = JSON.parse(result.body);
    } catch (e) {
      console.error('JSON parse failed:', result.body.substring(0, 300));
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Bad response from Apps Script' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('Booking proxy error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
