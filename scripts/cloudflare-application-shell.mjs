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
  {
    id: 'faviconLock',
    label: 'browser tab favicon lock',
    path: '/assets/ovyx-shell-favicon-lock.js',
    signatures: ['__OVYX_SHELL_FAVICON_LOCK_V3__', '/ovyx-tab-v6.svg?v=20261021-6', 'window.OVYXShellFavicon'],
  },
  {
    id: 'cancelSafety',
    label: 'Web Studio mobile Cancel and rollback',
    path: '/assets/ovyx-webstudio-cancel-safety.js',
    signatures: ['__OVYX_WEBSTUDIO_CANCEL_SAFETY_V3__', 'function restoreProjectOnly', 'installBrowserFetchCancellation', 'ovyx.webstudio.rollback.snapshot.v3.'],
  },
];

function readTagAttributes(tag) {
  const attributes = {};
  const pattern = /([a-z][\w:-]*)\s*=\s*(["'])(.*?)\2/gi;
  let match;
  while ((match = pattern.exec(String(tag || '')))) {
    attributes[match[1].toLowerCase()] = match[3];
  }
  return attributes;
}

async function probeIconEndpoint(origin, path, fetchImpl) {
  const request = await getTextWithTimeout(fetchImpl, new URL(path, origin), 'image/svg+xml');
  const response = request.response;
  const contentType = response ? String(response.headers.get('content-type') || '').toLowerCase() : '';
  const cacheControl = response ? String(response.headers.get('cache-control') || '').toLowerCase() : '';
  let redirectedOffOrigin = false;
  try {
    redirectedOffOrigin = !!(response && response.url && new URL(response.url).origin !== origin);
  } catch {
    redirectedOffOrigin = true;
  }
  const brandMarkPresent = request.body.includes('M32 5L55 18.5V45.5L32 59L9 45.5V18.5L32 5Z');
  const noStore = /no-store|no-cache/i.test(cacheControl)
    && /(?:^|,)\s*max-age=0(?:\s*(?:,|$))/i.test(cacheControl);
  const ok = !!(
    response &&
    response.status === 200 &&
    !redirectedOffOrigin &&
    contentType.includes('image/svg+xml') &&
    request.body.trim().startsWith('<svg') &&
    brandMarkPresent &&
    noStore
  );
  let error = '';
  if (!ok) {
    error = request.error || (
      redirectedOffOrigin
        ? path + ' redirected away from the production origin.'
        : !response || response.status !== 200
          ? path + ' did not return HTTP 200.'
          : !contentType.includes('image/svg+xml')
            ? path + ' did not return an SVG content type.'
            : !request.body.trim().startsWith('<svg') || !brandMarkPresent
              ? path + ' did not return the expected OVYX double-hexagon SVG.'
              : 'Cache-control protection is missing from ' + path + '.'
    );
  }
  return {
    ok,
    path,
    httpStatus: response ? response.status : null,
    contentType: contentType.slice(0, 100),
    cacheControl: cacheControl.slice(0, 160),
    noStore,
    brandMarkPresent,
    error,
  };
}

async function probeBrowserTabIcon(origin, html, fetchImpl) {
  const links = [];
  const pattern = /<link\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    const attributes = readTagAttributes(match[0]);
    const rel = String(attributes.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (rel.includes('icon')) links.push(attributes);
  }

  const canonicalHref = '/ovyx-tab-v6.svg?v=20261021-6';
  const canonical = links.filter(link => {
    try {
      const url = new URL(link.href || '', origin);
      return String(link.type || '').toLowerCase() === 'image/svg+xml'
        && url.origin === origin
        && url.pathname === '/ovyx-tab-v6.svg'
        && url.searchParams.get('v') === '20261021-6';
    } catch {
      return false;
    }
  });
  const tabIcon = await probeIconEndpoint(origin, canonicalHref, fetchImpl);
  const faviconFallback = await probeIconEndpoint(origin, '/favicon.ico', fetchImpl);
  const canonicalLinkOk = links.length === 1 && canonical.length === 1;
  const ok = canonicalLinkOk && tabIcon.ok && faviconFallback.ok;
  const errors = [];
  if (!canonicalLinkOk) {
    errors.push('The production shell must declare exactly one canonical OVYX favicon link at ' + canonicalHref + '.');
  }
  if (!tabIcon.ok && tabIcon.error) errors.push(tabIcon.error);
  if (!faviconFallback.ok && faviconFallback.error) errors.push(faviconFallback.error);
  return {
    ok,
    iconLinkCount: links.length,
    canonicalHref: canonical.length === 1 ? canonicalHref : null,
    canonicalLinkOk,
    tabIcon,
    faviconFallback,
    error: errors.join(' '),
  };
}

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
  const [runtimes, browserTabIcon] = await Promise.all([
    Promise.all(REQUIRED_RUNTIMES.map(spec => probeRuntime(origin, spec, scripts, fetchImpl))),
    probeBrowserTabIcon(origin, html, fetchImpl),
  ]);
  const requiredRuntimes = Object.fromEntries(REQUIRED_RUNTIMES.map((spec, index) => [
    spec.id,
    { ...runtimes[index], label: spec.label, path: spec.path },
  ]));
  const quality = requiredRuntimes.quality;
  const ok = runtimes.every(runtime => runtime.ok) && browserTabIcon.ok;
  const runtimeErrors = runtimes.filter(runtime => !runtime.ok).map(runtime => runtime.error).filter(Boolean);
  if (!browserTabIcon.ok && browserTabIcon.error) runtimeErrors.push(browserTabIcon.error);
  const error = ok ? '' : runtimeErrors.join(' ');
  return {
    ok,
    status: ok ? 'healthy' : 'degraded',
    httpStatus: shellResponse.status,
    contentType: contentType.slice(0, 100),
    htmlCharacters: html.length,
    requiredRuntimes,
    browserTabIcon,
    qualityRuntimeInjected: !!quality.injected,
    qualityRuntimeVersion: quality.version,
    qualityRuntimeAssetOk: !!quality.assetOk,
    qualityRuntimeAssetHttpStatus: quality.httpStatus,
    qualityRuntimeAssetContentType: quality.contentType,
    qualityRuntimeSignaturePresent: !!quality.signaturePresent,
    error,
  };
}
