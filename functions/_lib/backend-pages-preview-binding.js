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

function validateBindingName(value) {
  const name = String(value || 'OVYX_DB').trim();
  if (!SAFE_BINDING.test(name)) {
    fail('BACKEND_PAGES_BINDING_NAME_INVALID', 'The database binding name is invalid.');
  }
  return name;
}

/**
 * Adds one owner-scoped D1 binding to a Pages project's Preview environment.
 * It reads and preserves the existing Preview configuration, never writes the
 * Production configuration, refuses to replace a conflicting managed binding,
 * and verifies the saved binding with a fresh GET before returning.
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

  async function bindPreviewD1({
    projectName,
    expectedProjectPrefix,
    databaseId,
    bindingName = 'OVYX_DB',
  } = {}) {
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
    const preview = configs.preview && typeof configs.preview === 'object' ? configs.preview : {};
    const currentBindings = preview.d1_databases && typeof preview.d1_databases === 'object'
      ? preview.d1_databases : {};
    const current = currentBindings[binding];
    if (current?.id && String(current.id) !== id) {
      fail('BACKEND_PAGES_BINDING_CONFLICT', 'The existing Preview database binding points to a different database. OVYX will not replace it automatically.', 409);
    }

    const nextPreview = {
      ...preview,
      d1_databases: {
        ...currentBindings,
        [binding]: { id },
      },
    };
    await request(projectPath, {
      method: 'PATCH',
      body: JSON.stringify({ deployment_configs: { preview: nextPreview } }),
    });

    const verified = await request(projectPath, { method: 'GET' });
    const actual = verified?.deployment_configs?.preview?.d1_databases?.[binding]?.id;
    if (String(actual || '') !== id) {
      fail('BACKEND_PAGES_BINDING_VERIFY_FAILED', 'Cloudflare did not confirm the expected Preview database binding.', 502);
    }
    return Object.freeze({
      projectName: project,
      environment: 'preview',
      bindingName: binding,
      databaseId: id,
      verified: true,
    });
  }

  return Object.freeze({ bindPreviewD1 });
}
