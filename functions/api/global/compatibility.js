import { jsonResponse } from '../_lib/http.js';
import { resolveGlobalCompatibility } from '../../_lib/global-compatibility.js';

export async function onRequestGet({ request, env }) {
  const report = resolveGlobalCompatibility({ request, env });
  return jsonResponse(report, 200, {
    'Cache-Control': 'private, no-store, max-age=0',
    'Vary': 'Accept-Language',
  });
}
