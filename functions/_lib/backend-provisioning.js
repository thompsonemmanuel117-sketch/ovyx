const SAFE_OWNER_UID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_MIGRATION = /^migrations\/(\d{4,})_[a-z0-9][a-z0-9_-]{0,79}\.sql$/i;
const SAFE_SOURCE_PATH = /^(?:functions|src|server|api|lib)\/[A-Za-z0-9_./-]{1,220}$/;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk_(?:live|test|proj)_|whsec_|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_)[A-Za-z0-9_-]{12,}/i,
  /(?:["'](?:password|secret|token|api[_-]?key|authorization)["']\s*:\s*["'][^"']{12,}["'])/i,
];
const DESTRUCTIVE_SQL = /\b(?:DROP\s+(?:TABLE|COLUMN|INDEX|TRIGGER|VIEW|DATABASE)|TRUNCATE\s+(?:TABLE\s+)?|ALTER\s+TABLE\b[\s\S]{0,240}?\bDROP\s+COLUMN|PRAGMA\s+writable_schema\s*=\s*ON|ATTACH\s+DATABASE|DETACH\s+DATABASE)\b/i;

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
function clean(value, max = 160) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function safeEnvironment(value) {
  const environment = String(value || 'preview').trim().toLowerCase();
  if (!['preview', 'production'].includes(environment)) fail('BACKEND_ENVIRONMENT_INVALID', 'Choose preview or production for the backend environment.');
  return environment;
}
function safeFiles(rawFiles) {
  if (!Array.isArray(rawFiles) || rawFiles.length < 1 || rawFiles.length > 140) {
    fail('BACKEND_FILES_INVALID', 'The backend source file manifest is invalid.');
  }
  const seen = new Set();
  const result = [];
  let total = 0;
  for (const item of rawFiles) {
    const path = clean(item?.path, 240).replace(/\\/g, '/');
    const content = typeof item?.content === 'string' ? item.content : '';
    if (!path || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..') ||
        (!SAFE_SOURCE_PATH.test(path) && !SAFE_MIGRATION.test(path)) || seen.has(path)) {
      fail('BACKEND_FILE_PATH_INVALID', 'The backend manifest contains an unsafe, unsupported or duplicate file path.');
    }
    if (content.length > 280_000) fail('BACKEND_FILE_TOO_LARGE', 'A backend source file exceeds the provisioning limit.');
    if (SECRET_PATTERNS.some(pattern => pattern.test(content))) {
      fail('BACKEND_SECRET_IN_SOURCE', 'Secret-like source content must be moved to a server-side secret binding before provisioning.');
    }
    total += new TextEncoder().encode(content).byteLength;
    if (total > 2_200_000) fail('BACKEND_SOURCE_TOO_LARGE', 'The backend source manifest exceeds the provisioning limit.');
    seen.add(path);
    result.push({ path, content });
  }
  return result;
}
async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function inspectAdditiveMigrations(files) {
  const migrations = files
    .filter(file => SAFE_MIGRATION.test(file.path))
    .map(file => {
      const match = file.path.match(SAFE_MIGRATION);
      const sql = file.content.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (!sql.trim()) fail('BACKEND_MIGRATION_EMPTY', 'A database migration cannot be empty.');
      if (DESTRUCTIVE_SQL.test(sql)) {
        fail('BACKEND_MIGRATION_DESTRUCTIVE', 'A potentially destructive database migration is blocked from automatic provisioning. Review it and obtain explicit owner approval.');
      }
      if (!/\b(?:CREATE\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX|ALTER\s+TABLE\b[\s\S]{0,240}?\bADD\s+COLUMN)\b/i.test(sql)) {
        fail('BACKEND_MIGRATION_UNSUPPORTED', 'A migration must contain a supported additive table, index or column operation.');
      }
      return { version: Number(match[1]), path: file.path, content: file.content };
    })
    .sort((left, right) => left.version - right.version);
  const versions = new Set();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || versions.has(migration.version)) {
      fail('BACKEND_MIGRATION_VERSION_INVALID', 'Database migration versions must be unique safe integers.');
    }
    versions.add(migration.version);
  }
  return migrations;
}

/**
 * Creates a deterministic, owner-scoped provisioning manifest only.
 * It never calls Cloudflare, creates resources, applies migrations or reads secrets.
 */
export async function createBackendProvisioningPlan({
  ownerUid,
  projectId,
  environment = 'preview',
  architecture,
  files,
} = {}) {
  const uid = clean(ownerUid, 128);
  const rawProjectId = String(projectId ?? '');
  const id = clean(rawProjectId, 160);
  if (!SAFE_OWNER_UID.test(uid) || !id || rawProjectId.length > 160 || rawProjectId === '.' || rawProjectId === '..' || rawProjectId.includes('/') || /[\u0000-\u001f\u007f]/.test(rawProjectId)) {
    fail('BACKEND_PROJECT_IDENTITY_INVALID', 'A verified owner and saved project ID are required.');
  }
  if (!architecture || architecture.engine !== 'ovyx-fullstack-architecture' ||
      architecture.architectureStatus !== 'planned-not-provisioned') {
    fail('BACKEND_ARCHITECTURE_INVALID', 'A valid OVYX full-stack architecture is required.');
  }
  if (architecture.capabilities?.backend !== true) {
    fail('BACKEND_CAPABILITY_NOT_REQUESTED', 'This saved website has no trusted backend capability to provision.');
  }
  if (!Array.isArray(architecture.apiContracts) || architecture.apiContracts.length < 1 ||
      architecture.apiContracts.length > 64) {
    fail('BACKEND_ARCHITECTURE_INVALID', 'A valid OVYX full-stack architecture with backend API contracts is required.');
  }
  const targetEnvironment = safeEnvironment(environment);
  const unsupportedCapabilities = ['payments', 'commerce', 'email', 'newsletter', 'subscriptions', 'notifications', 'integrations', 'automation', 'booking', 'fileStorage', 'backgroundWork']
    .filter(capability => architecture.capabilities?.[capability] === true);
  if (unsupportedCapabilities.length) {
    fail('BACKEND_CAPABILITY_UNSUPPORTED', 'This deployment path currently verifies Cloudflare Pages Functions + D1 only. Add and verify dedicated adapters before enabling: ' + unsupportedCapabilities.join(', ') + '.');
  }
  const sourceFiles = safeFiles(files);
  const routes = architecture.apiContracts.map(route => {
    const method = clean(route?.method, 12).toUpperCase();
    const path = clean(route?.path, 180);
    if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(method) || !path.startsWith('/') || path.includes('..')) {
      fail('BACKEND_ROUTE_CONTRACT_INVALID', 'The architecture contains an invalid backend route contract.');
    }
    return {
      id: clean(route.id, 100),
      method,
      path,
      authPolicy: clean(route.authPolicy, 80),
      modelIds: Array.isArray(route.modelIds) ? route.modelIds.slice(0, 12).map(value => clean(value, 100)) : [],
    };
  });
  const migrations = inspectAdditiveMigrations(sourceFiles);
  if (architecture.capabilities.database === true && migrations.length === 0) {
    fail('BACKEND_MIGRATIONS_REQUIRED', 'This application requires persistent data, but no versioned SQL migrations were supplied.');
  }
  if (architecture.capabilities.database !== true && migrations.length > 0) {
    fail('BACKEND_DATABASE_CAPABILITY_MISMATCH', 'Database migrations were supplied without a database capability in the trusted architecture.');
  }
  const identityHash = await sha256(uid + ':' + id);
  const namespace = identityHash.slice(0, 16);
  const migrationManifest = await Promise.all(migrations.map(async migration => ({
    version: migration.version,
    path: migration.path,
    sha256: await sha256(migration.content),
  })));
  return Object.freeze({
    schemaVersion: 1,
    engine: 'ovyx-backend-provisioning',
    status: 'planned-not-provisioned',
    ownerScope: 'firebase-uid-hash',
    projectScope: 'saved-project-id-hash',
    environment: targetEnvironment,
    namespace,
    resources: Object.freeze({
      workerScript: 'ovyx-' + namespace + '-' + targetEnvironment,
      database: architecture.capabilities.database ? 'ovyx-' + namespace + '-' + targetEnvironment : null,
      databaseBinding: architecture.capabilities.database ? 'DB' : null,
    }),
    routes,
    migrations: migrationManifest,
    sourceFiles: sourceFiles.map(file => file.path).sort(),
    requiredGates: [
      'verify-firebase-owner-and-saved-project',
      'reserve-idempotent-provisioning-operation',
      'create-or-verify-owner-scoped-cloudflare-resources',
      'apply-additive-migrations-to-preview-database',
      'bind-server-only-secrets-and-resource-bindings',
      'deploy-backend-worker',
      'verify-api-authentication-and-project-isolation',
      'verify-database-persistence-and-migration-state',
      'owner-approve-production-promotion',
    ],
    safety: Object.freeze({
      executesCloudflareOperations: false,
      appliesMigrations: false,
      includesSecretValues: false,
      productionPromotionAllowed: false,
      destructiveMigrationsAllowed: false,
    }),
  });
}
