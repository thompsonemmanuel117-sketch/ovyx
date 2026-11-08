const API_ROOT = 'https://api.cloudflare.com/client/v4';
const TIMEOUT_MS = 15_000;
const SAFE_PROJECT = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SAFE_BINDING = /^[A-Z][A-Z0-9_]{0,39}$/;
const SAFE_DATABASE_ID = /^[a-f0-9-]{20,64}$/i;

function fail(code, message, status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function validateProjectName(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!SAFE_PROJECT.test(name)) {
    fail('BACKEND_PAGES_PROJECT_INVALID', 'The customer Pages project name is invalid.');
  }
  return name;
}

function validateDatabaseId(value) {
  const id = String(value || '').trim();
  if (!SAFE_DATABASE_ID.test(id)) {
    fail('BACKEND_PAGES_DATABASE_ID_INVALID', 'The customer database identity is invalid.');
  }
  return id;
}

function mergeRuntimeCompatibility(config, compatibilityDate, compatibilityFlags) {
  const currentDate = String(config?.compatibility_date || '').trim();
  const requiredDate = String(compatibilityDate || '2026-11-01').trim();
  const validDate = value => /^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z)?$/.test(value) && Number.isFinite(Date.parse(value));
  if (currentDate && !validDate(currentDate)) fail('BACKEND_PAGES_COMPATIBILITY_DATE_INVALID', 'The Pages project has an invalid compatibility date.');
  if (!validDate(requiredDate)) fail('BACKEND_PAGES_COMPATIBILITY_DATE_INVALID', 'The required compatibility date is invalid.');
  if (config?.always_use_latest_compatibility_date === true) fail('BACKEND_PAGES_COMPATIBILITY_CONFLICT', 'The Pages project must use a pinned compatibility date for deterministic backend builds.');
    fail('BACKEND_PAGES_COMPATIBILITY_DATE_INVALID', 'The Pages project has an invalid compatibility date.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(requiredDate)) fail('BACKEND_PAGES_COMPATIBILITY_DATE_INVALID', 'The required compatibility date is invalid.');
  const currentFlags = Array.isArray(config?.compatibility_flags) ? config.compatibility_flags.filter(value => typeof value === 'string') : [];
  if (currentFlags.some(value => ['no_nodejs_compat', 'no_nodejs_compat_v2'].includes(value))) {
    fail('BACKEND_PAGES_COMPATIBILITY_CONFLICT', 'The Pages project explicitly disables Node.js compatibility required by this backend build.');
  }
  const requiredFlags = Array.isArray(compatibilityFlags) ? compatibilityFlags : ['nodejs_compat'];
  if (requiredFlags.some(value => typeof value !== 'string' || !/^[a-z0-9_]{1,80}$/i.test(value))) {
    fail('BACKEND_PAGES_COMPATIBILITY_FLAGS_INVALID', 'The required Pages compatibility flags are invalid.');
  }
  return {
    ...config,
    compatibility_date: !currentDate || currentDate.slice(0, 10) < requiredDate.slice(0, 10) ? requiredDate : currentDate,
    always_use_latest_compatibility_date: false,
    compatibility_flags: Array.from(new Set([...currentFlags, ...requiredFlags])),
  };
}

function validateBindingName(value) {
  const name = String(value || 'OVYX_DB').trim();
  if (!SAFE_BINDING.test(name)) {
    fail('BACKEND_PAGES_BINDING_NAME_INVALID', 'The database binding name is invalid.');
  }
  return name;
}

/**
 * Adds one owner-scoped D1 binding to exactly one Pages environment.
 * Preview and Production are separate explicit methods. Existing settings and
 * unrelated bindings are preserved, conflicting managed bindings are refused,
 * and the saved configuration is verified with a fresh GET before returning.
 */
export function createCloudflarePagesPreviewBindingAdapter({
  accountId,
  apiToken,
  fetchImpl = fetch,
} = {}) {
  const account = String(accountId || '').trim();
  const token = String(apiToken || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(account) || token.length < 20) {
    fail('BACKEND_PAGES_NOT_CONFIGURED', 'Cloudflare Pages provisioning is not configured.', 503);
  }

  async function request(path, init = {}) {
    let response;
    try {
      response = await fetchImpl(API_ROOT + path, {
        ...init,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(init.headers || {}),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      fail('BACKEND_PAGES_UNAVAILABLE', 'Cloudflare Pages could not be reached. Retry the preview setup safely.', 503);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
      const error = new Error('Cloudflare Pages rejected the preview binding operation.');
      error.status = response.status >= 400 && response.status <= 599 ? response.status : 502;
      error.code = 'BACKEND_PAGES_REQUEST_FAILED';
      error.providerCode = Array.isArray(payload.errors) ? String(payload.errors[0]?.code || '') : '';
      throw error;
    }
    return payload.result;
  }

  async function bindD1({
    environment,
    projectName,
    expectedProjectPrefix,
    databaseId,
    bindingName = 'DB',
    compatibilityDate = '2026-11-01',
    compatibilityFlags = ['nodejs_compat'],
  } = {}) {
    if (!['preview', 'production'].includes(environment)) {
      fail('BACKEND_PAGES_ENVIRONMENT_INVALID', 'Choose Preview or Production for the database binding.', 400);
    }
    const project = validateProjectName(projectName);
    const prefix = String(expectedProjectPrefix || '').trim().toLowerCase();
    if (!prefix || !project.startsWith(prefix)) {
      fail('BACKEND_PAGES_PROJECT_OWNERSHIP_INVALID', 'The Pages project is not in the expected customer namespace.', 403);
    }
    const id = validateDatabaseId(databaseId);
    const binding = validateBindingName(bindingName);
    const projectPath = '/accounts/' + encodeURIComponent(account) + '/pages/projects/' + encodeURIComponent(project);
    const before = await request(projectPath, { method: 'GET' });
    if (before?.source?.type) {
      fail('BACKEND_PAGES_SOURCE_CONFLICT', 'This Pages project is connected to a different publishing source.', 409);
    }
    const configs = before?.deployment_configs && typeof before.deployment_configs === 'object'
      ? before.deployment_configs : {};
    const existingConfig = configs[environment] && typeof configs[environment] === 'object'
      ? configs[environment] : {};
    const currentBindings = existingConfig.d1_databases && typeof existingConfig.d1_databases === 'object'
      ? existingConfig.d1_databases : {};
    const current = currentBindings[binding];
    if (current?.id && String(current.id) !== id) {
      fail('BACKEND_PAGES_BINDING_CONFLICT', 'The existing ' + environment + ' database binding points to a different database. OVYX will not replace it automatically.', 409);
    }

    const compatibleConfig = mergeRuntimeCompatibility(existingConfig, compatibilityDate, compatibilityFlags);
    const nextConfig = {
      ...compatibleConfig,
      d1_databases: {
        ...currentBindings,
        [binding]: { id },
      },
    };
    await request(projectPath, {
      method: 'PATCH',
      body: JSON.stringify({ deployment_configs: { [environment]: nextConfig } }),
    });

    const verified = await request(projectPath, { method: 'GET' });
    const verifiedConfig = verified?.deployment_configs?.[environment] || {};
    const actual = verifiedConfig?.d1_databases?.[binding]?.id;
    if (String(actual || '') !== id) {
      fail('BACKEND_PAGES_BINDING_VERIFY_FAILED', 'Cloudflare did not confirm the expected ' + environment + ' database binding.', 502);
    }
    if (verifiedConfig.compatibility_date !== nextConfig.compatibility_date || !Array.isArray(verifiedConfig.compatibility_flags) || compatibilityFlags.some(flag => !verifiedConfig.compatibility_flags.includes(flag))) {
      fail('BACKEND_PAGES_COMPATIBILITY_VERIFY_FAILED', 'Cloudflare did not confirm the required Pages runtime compatibility settings.', 502);
    }
    return Object.freeze({
      projectName: project,
      environment,
      bindingName: binding,
      databaseId: id,
      verified: true,
    });
  }

  async function bindPreviewD1(options = {}) {
    return bindD1({ ...options, environment: 'preview' });
  }
  async function bindProductionD1(options = {}) {
    return bindD1({ ...options, environment: 'production' });
  }

  return Object.freeze({ bindPreviewD1, bindProductionD1 });
}
