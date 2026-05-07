// Netlify serverless function: proxy GET to Apps Script
// Runs server-side — no CORS restriction, no browser blocking.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzzt9ul4VKSXcuRZgrJxWJxdugv6kNAr0s9LgFrJ2ArxhK35eE2ghOMy7C-a-jKdcMuqw/exec';

exports.handler = async function () {
  try {
    const res  = await fetch(APPS_SCRIPT_URL);
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booked: data.booked || [] })
    };
  } catch (err) {
    console.error('Proxy error:', err);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booked: [] }) // fail open: show all booths as available
    };
  }
};
