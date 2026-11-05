import { authenticateRequest } from '../_lib/firebase.js';
import { readJson, jsonResponse } from '../_lib/http.js';
import { callProjectUniversalConnection } from '../../_lib/universal-connections.js';
export async function onRequestPost(context) {
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const body = await readJson(context.request, 150000);
    const result = await callProjectUniversalConnection(context.env, user, body);
    return jsonResponse(result, 200);
  } catch (error) { return jsonResponse({ ok: false, code: error?.code || 'PROJECT_CONNECTION_ACTION_FAILED', error: error?.message || 'The project connection action failed.' }, error?.status || 500); }
}
