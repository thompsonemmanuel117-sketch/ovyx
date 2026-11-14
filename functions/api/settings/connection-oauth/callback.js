import { handleConnectionOAuthCallback } from '../connection-oauth.js';

export async function onRequest(context) {
  if (String(context.request?.method || '').toUpperCase() !== 'GET') {
    return new Response(JSON.stringify({ ok:false, code:'METHOD_NOT_ALLOWED', error:'GET is required.' }), {
      status:405,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', Allow:'GET' }
    });
  }
  return handleConnectionOAuthCallback(context);
}
