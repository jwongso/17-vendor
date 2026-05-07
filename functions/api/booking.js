// Cloudflare Pages Function: proxy booking submission to Apps Script via GET
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzu-bcY5_k9vXeL5d5JElPb14JB0hxmTGqDvoQkjb8oF7wZkzFokNA-9FSerRNqMM63xA/exec';

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body   = await request.text();
    const params = new URLSearchParams(body);
    params.set('action', 'book');

    const url  = APPS_SCRIPT_URL + '?' + params.toString();
    const res  = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    console.log('Apps Script response:', text.substring(0, 300));

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return Response.json({ success: false, error: 'Bad response from Apps Script' }, { status: 502 });
    }

    return Response.json(data);
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
