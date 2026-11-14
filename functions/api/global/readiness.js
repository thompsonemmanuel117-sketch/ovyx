import { jsonResponse } from '../_lib/http.js';
import { resolveGlobalReadiness } from '../../_lib/global-readiness.js';

export async function onRequestGet({ request, env }) {
  const readiness = resolveGlobalReadiness({ request, env });
  return jsonResponse(readiness, 200, {
    'Cache-Control': 'private, no-store, max-age=0',
    'Vary': 'Accept-Language',
  });
}
