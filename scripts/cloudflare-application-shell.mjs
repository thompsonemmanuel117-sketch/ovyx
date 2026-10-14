const REQUEST_TIMEOUT_MS = 10_000;

function normalizedOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!['https:', 'http:'].includes(parsed.protocol)) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

async function getWithTimeout(fetchImpl, url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: accept },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    return { response, error: '' };
  } catch (error) {
    return {
      response: null,
      error: error && error.name === 'AbortError' ? 'Request timed out.' : 'Request failed.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify the public Pages shell and the exact Web Studio quality runtime it
 * advertises. The probe records statuses and boolean signatures only; it never
 * returns HTML, JavaScript source, cookies, headers or environment values.
 */
export async function probeApplicationShell(deploymentUrl, fetchImpl = globalThis.fetch) {
  const origin = normalizedOrigin(deploymentUrl);
  if (!origin) {
    return { ok: false, status: 'unavailable', httpStatus: null, qualityRuntimeInjected: false, error: 'Deployment URL is missing or invalid.' };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, status: 'unavailable', httpStatus: null, qualityRuntimeInjected: false, error: 'HTTP fetch is unavailable.' };
  }

  const shellRequest = await getWithTimeout(fetchImpl, new URL('/', origin), 'text/html');
  const shellResponse = shellRequest.response;
  if (!shellResponse || !shellResponse.ok) {
    return {
      ok: false,
      status: 'unavailable',
      httpStatus: shellResponse ? shellResponse.status : null,
      contentType: shellResponse ? String(shellResponse.headers.get('content-type') || '').slice(0, 100) : '',
      qualityRuntimeInjected: false,
      qualityRuntimeAssetOk: false,
      error: shellRequest.error || 'Application shell did not return a successful HTTP response.',
    };
  }

  const contentType = String(shellResponse.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) {
    return {
      ok: false,
      status: 'degraded',
      httpStatus: shellResponse.status,
      contentType: contentType.slice(0, 100),
      qualityRuntimeInjected: false,
      qualityRuntimeAssetOk: false,
      error: 'Application root did not return HTML.',
    };
  }

  const html = await shellResponse.text().catch(() => '');
  const match = html.match(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']*\/assets\/ovyx-webstudio-quality\.js(?:\?[^"']*)?)\1[^>]*>/i);
  if (!match) {
    return {
      ok: false,
      status: 'degraded',
      httpStatus: shellResponse.status,
      contentType: contentType.slice(0, 100),
      htmlCharacters: html.length,
      qualityRuntimeInjected: false,
      qualityRuntimeAssetOk: false,
      error: 'Application shell is missing the Web Studio quality inspector script.',
    };
  }

  const runtimeUrl = new URL(match[2], origin);
  if (runtimeUrl.origin !== origin || runtimeUrl.pathname !== '/assets/ovyx-webstudio-quality.js') {
    return {
      ok: false,
      status: 'degraded',
      httpStatus: shellResponse.status,
      contentType: contentType.slice(0, 100),
      htmlCharacters: html.length,
      qualityRuntimeInjected: true,
      qualityRuntimeAssetOk: false,
      error: 'Web Studio quality inspector URL is not an approved same-origin application asset.',
    };
  }

  const runtimeRequest = await getWithTimeout(fetchImpl, runtimeUrl, 'text/javascript, application/javascript');
  const runtimeResponse = runtimeRequest.response;
  const runtimeContentType = runtimeResponse ? String(runtimeResponse.headers.get('content-type') || '').toLowerCase() : '';
  const runtimeSource = runtimeResponse && runtimeResponse.ok
    ? await runtimeResponse.text().catch(() => '')
    : '';
  const runtimeSignaturePresent =
    runtimeSource.includes('function auditSources') &&
    runtimeSource.includes('cross-page fragment link') &&
    runtimeSource.includes('publishVerifiedPreview');
  const runtimeVersion = runtimeUrl.searchParams.get('v');
  const assetOk = !!(
    runtimeResponse &&
    runtimeResponse.ok &&
    (runtimeContentType.includes('javascript') || runtimeContentType.includes('ecmascript')) &&
    runtimeSignaturePresent
  );
  const ok = !!assetOk;

  return {
    ok,
    status: ok ? 'healthy' : 'degraded',
    httpStatus: shellResponse.status,
    contentType: contentType.slice(0, 100),
    htmlCharacters: html.length,
    qualityRuntimeInjected: true,
    qualityRuntimeVersion: runtimeVersion ? runtimeVersion.slice(0, 80) : null,
    qualityRuntimeAssetOk: !!(runtimeResponse && runtimeResponse.ok),
    qualityRuntimeAssetHttpStatus: runtimeResponse ? runtimeResponse.status : null,
    qualityRuntimeAssetContentType: runtimeContentType.slice(0, 100),
    qualityRuntimeSignaturePresent,
    error: ok ? '' : runtimeRequest.error || (
      !runtimeResponse || !runtimeResponse.ok
        ? 'Web Studio quality inspector asset did not return a successful HTTP response.'
        : !runtimeContentType.includes('javascript') && !runtimeContentType.includes('ecmascript')
          ? 'Web Studio quality inspector asset did not return a JavaScript content type.'
          : 'Served quality inspector is missing expected QA behavior signatures.'
    ),
  };
}
