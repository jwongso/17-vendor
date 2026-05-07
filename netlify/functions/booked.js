// Netlify serverless function: proxy GET to Apps Script
// Uses built-in https module (no npm deps needed) with manual redirect follow.
const https = require('https');
const http  = require('http');
const { URL } = require('url');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyw5-vUfeRTnq5xrbBQ8UI5tnfKOqkAK27L5oCHKmIvanmeg6VdoTB7YkwoFsCyBqtBSQ/exec';

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

exports.handler = async function () {
  try {
    const body = await get(APPS_SCRIPT_URL, 0);
    const data = JSON.parse(body);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booked: data.booked || [] })
    };
  } catch (err) {
    console.error('Proxy error:', err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booked: [] })
    };
  }
};
