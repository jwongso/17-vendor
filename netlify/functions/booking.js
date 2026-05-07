// Netlify serverless function: proxy POST to Apps Script
// Runs server-side — no CORS restriction, response is fully readable.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzzt9ul4VKSXcuRZgrJxWJxdugv6kNAr0s9LgFrJ2ArxhK35eE2ghOMy7C-a-jKdcMuqw/exec';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const res  = await fetch(APPS_SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    event.body
    });
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('Booking proxy error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
