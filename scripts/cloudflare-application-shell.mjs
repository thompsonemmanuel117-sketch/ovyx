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

async function getTextWithTimeout(fetchImpl, url, accept) {
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
    // Read the response body before clearing the deadline; a server that sends
    // headers but stalls the body must not hang the release diagnostic.
    const body = response && response.ok ? await response.text() : '';
    return { response, body, error: '' };
  } catch (error) {
    return {
      response: null,
      body: '',
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
const REQUIRED_RUNTIMES = [
  {
    id: 'reliability',
    label: 'Web Studio reliability',
    path: '/assets/ovyx-webstudio-reliability.js',
    signatures: ['__ovyxBuildArtifactGuard', 'installFollowUpIntentRouter'],
  },
  {
    id: 'research',
    label: 'Web Studio web research and live progress',
    path: '/assets/ovyx-webstudio-research.js',
    signatures: ['function runResearch', 'addResearchContext', 'ovyx-ws-live-activity'],
  },
  {
    id: 'applySuggestions',
    label: 'Web Studio Apply this suggestion',
    path: '/assets/ovyx-webstudio-apply-suggestions.js',
    signatures: ['OVYX_APPLY_SUGGESTIONS', 'function applySuggestion', 'studio.submitPrompt()'],
  },
  {
    id: 'quality',
    label: 'Web Studio quality inspector',
    path: '/assets/ovyx-webstudio-quality.js',
    signatures: ['function auditSources', 'cross-page fragment link', 'publishVerifiedPreview'],
  },
];

function findInjectedRuntimeUrls(html, origin) {
  const scripts = [];
  const pattern = /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    try {
      scripts.push(new URL(match[2], origin));
    } catch {}
  }
  return scripts;
}

async function probeRuntime(origin, spec, scripts, fetchImpl) {
  const asset = scripts.find(url => url.pathname === spec.path);
  const blocked = {
    ok: false,
    injected: false,
    version: null,
    httpStatus: null,
    assetOk: false,
    contentType: '',
    signaturePresent: false,
    error: 'Application shell is missing the ' + spec.label + ' script.',
  };

  if (!asset) return blocked;
  if (asset.origin !== origin) {
    return {
      ...blocked,
      injected: true,
      error: 'The ' + spec.label + ' script URL is not a same-origin application asset.',
    };
  }

  const request = await getTextWithTimeout(fetchImpl, asset, 'text/javascript, application/javascript');
  const response = request.response;
  const contentType = response ? String(response.headers.get('content-type') || '').toLowerCase() : '';
  const source = response && response.ok ? request.body : '';
  let redirectedOffOrigin = false;
  try {
    redirectedOffOrigin = !!(response && response.url && new URL(response.url).origin !== origin);
  } catch {
    redirectedOffOrigin = true;
  }
  const signaturePresent = spec.signatures.every(signature => source.includes(signature));
  const assetOk = !!(
    response &&
    response.ok &&
    !redirectedOffOrigin &&
    (contentType.includes('javascript') || contentType.includes('ecmascript'))
  );
  const ok = assetOk && signaturePresent;
  const version = asset.searchParams.get('v');

  return {
    ok,
    injected: true,
    version: version ? version.slice(0, 80) : null,
    httpStatus: response ? response.status : null,
    assetOk,
    contentType: contentType.slice(0, 100),
    signaturePresent,
    error: ok ? '' : request.error || (
      redirectedOffOrigin
        ? 'The ' + spec.label + ' asset redirected away from the application origin.'
        : !response || !response.ok
          ? 'The ' + spec.label + ' asset did not return a successful HTTP response.'
          : !contentType.includes('javascript') && !contentType.includes('ecmascript')
            ? 'The ' + spec.label + ' asset did not return a JavaScript content type.'
            : 'The served ' + spec.label + ' asset is missing expected behavior signatures.'
    ),
  };
}

/**
 * Smoke-check the public Pages shell and the actual Web Studio runtimes used by
 * research, source-scoped editing, one-click suggestion application, and QA.
 * Record statuses/signatures only; never persist HTML or JavaScript contents.
 */
export async function probeApplicationShell(deploymentUrl, fetchImpl = globalThis.fetch) {
  const origin = normalizedOrigin(deploymentUrl);
  if (!origin) {
    return { ok: false, status: 'unavailable', httpStatus: null, qualityRuntimeInjected: false, error: 'Deployment URL is missing or invalid.' };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, status: 'unavailable', httpStatus: null, qualityRuntimeInjected: false, error: 'HTTP fetch is unavailable.' };
  }

  const shellRequest = await getTextWithTimeout(fetchImpl, new URL('/', origin), 'text/html');
  const shellResponse = shellRequest.response;
  if (!shellResponse || !shellResponse.ok) {
    return {
      ok: false,
      status: 'unavailable',
      httpStatus: shellResponse ? shellResponse.status : null,
      contentType: shellResponse ? String(shellResponse.headers.get('content-type') || '').slice(0, 100) : '',
      qualityRuntimeInjected: false,
      qualityRuntimeAssetOk: false,
      requiredRuntimes: {},
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
      requiredRuntimes: {},
      error: 'Application root did not return HTML.',
    };
  }

  const html = shellRequest.body;
  const scripts = findInjectedRuntimeUrls(html, origin);
  const runtimes = await Promise.all(REQUIRED_RUNTIMES.map(spec => probeRuntime(origin, spec, scripts, fetchImpl)));
  const requiredRuntimes = Object.fromEntries(REQUIRED_RUNTIMES.map((spec, index) => [
    spec.id,
    { ...runtimes[index], label: spec.label, path: spec.path },
  ]));
  const quality = requiredRuntimes.quality;
  const ok = runtimes.every(runtime => runtime.ok);
  const error = ok
    ? ''
    : runtimes.filter(runtime => !runtime.ok).map(runtime => runtime.error).filter(Boolean).join(' ');
  return {
    ok,
    status: ok ? 'healthy' : 'degraded',
    httpStatus: shellResponse.status,
    contentType: contentType.slice(0, 100),
    htmlCharacters: html.length,
    requiredRuntimes,
    qualityRuntimeInjected: !!quality.injected,
    qualityRuntimeVersion: quality.version,
    qualityRuntimeAssetOk: !!quality.assetOk,
    qualityRuntimeAssetHttpStatus: quality.httpStatus,
    qualityRuntimeAssetContentType: quality.contentType,
    qualityRuntimeSignaturePresent: !!quality.signaturePresent,
    error,
  };
}
