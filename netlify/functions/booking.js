// Netlify serverless function: proxy booking to Apps Script via GET
// GET works reliably server-to-server; POST redirect fails outside a browser.
const https = require('https');
const http  = require('http');
const { URL } = require('url');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzzt9ul4VKSXcuRZgrJxWJxdugv6kNAr0s9LgFrJ2ArxhK35eE2ghOMy7C-a-jKdcMuqw/exec';

function get(urlStr, redirects) {
  if (redirects > 10) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const u   = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    lib.get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse the URL-encoded body from the browser
    const params = new URLSearchParams(event.body);
    params.set('action', 'book');

    const url  = APPS_SCRIPT_URL + '?' + params.toString();
    const body = await get(url, 0);

    console.log('Apps Script response:', body.substring(0, 300));

    let data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      console.error('JSON parse failed:', body.substring(0, 300));
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
