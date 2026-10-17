import { assertAuthenticated } from '../../_lib/firebase.js';
import { enforceSameOrigin, errorResponse, jsonResponse, readJson, requestId } from '../_lib/http.js';
import { analyzePublicWebsite } from '../../_lib/url-analyzer.js';

export async function onRequest(context) {
  const request = context.request;
  const id = requestId(request);
  if (request.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'POST is required.', id);
  if (!enforceSameOrigin(request)) return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin website analysis is not permitted.', id);
  try {
    assertAuthenticated(context.data?.user);
    if (context.data?.entitlements?.capabilities?.appStudio !== true) {
      return errorResponse(403, 'FEATURE_NOT_INCLUDED', 'App Studio access is required to analyze a source website.', id);
    }
    const body = await readJson(request, 8000);
    const input = String(body.url || '').trim();
    if (!input) return errorResponse(400, 'URL_REQUIRED', 'Enter a public website URL to analyze.', id);
    const result = await analyzePublicWebsite(input);
    return jsonResponse({ ok: true, report: result.report, requestId: id }, 200, {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-OVYX-Request-ID': id,
    });
  } catch (error) {
    const known = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599;
    return errorResponse(
      known ? error.status : 502,
      known && error.code ? error.code : 'URL_ANALYSIS_FAILED',
      known && error.message ? error.message : 'OVYX could not safely analyze this website. Check the URL or try again later.',
      id,
    );
  }
}
