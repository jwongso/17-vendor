// Netlify serverless function: proxy GET to Apps Script
// Runs server-side — no CORS restriction, no browser blocking.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxVQRKhg-GHIefQOz0H6csxwWKwUaVb0w-exXlQd4zxJi_02DN5i9n3Y5P0jmZLLdJItw/exec';

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
