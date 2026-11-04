const MAX_FILES = 400;
const MAX_SOURCE_CHARS = 1_500_000;
const MAX_FILE_CHARS = 160_000;
const MAX_ITEMS = 80;

const clean = (value, max = 180) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

function safePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.length > 500 || path.startsWith('/') || /^[a-z]:/i.test(path) ||
      /[\u0000-\u001f\u007f]/.test(path) ||
      path.split('/').some(part => !part || part === '.' || part === '..' ||
        /^(?:__proto__|prototype|constructor)$/i.test(part)) ||
      /^(?:node_modules|dist|build|coverage|\.git|\.env)(?:\/|$)/i.test(path)) return '';
  return path;
}

function sourceOf(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  for (const key of ['content', 'text', 'source', 'code']) {
    if (typeof value[key] === 'string') return value[key];
  }
  return '';
}

function unique(values, limit = MAX_ITEMS) {
  return [...new Set(values.map(value => clean(value)).filter(Boolean))].slice(0, limit);
}

function routeFromPath(path) {
  if (/\.html?$/i.test(path)) {
    const name = path.split('/').pop().replace(/\.html?$/i, '');
    return { path: name === 'index' ? '/' : '/' + name + '/', source: path, kind: 'document' };
  }
  let match = path.match(/^(?:src\/)?app\/(.*)\/page\.(?:tsx?|jsx?)$/i);
  if (match) return { path: '/' + match[1].split('/').filter(Boolean).join('/') + '/', source: path, kind: 'app-router' };
  if (/^(?:src\/)?app\/page\.(?:tsx?|jsx?)$/i.test(path)) return { path: '/', source: path, kind: 'app-router' };
  match = path.match(/^(?:src\/)?pages\/(.+)\.(?:tsx?|jsx?|vue|svelte|astro)$/i);
  if (match && !/^(?:api|_app|_document|_middleware)\//i.test(match[1])) {
    return { path: match[1] === 'index' ? '/' : '/' + match[1].replace(/\/index$/i, '') + '/', source: path, kind: 'pages-router' };
  }
  match = path.match(/^(?:src\/)?routes\/(.*)\/(?:\+page|index)\.(?:svelte|tsx?|jsx?)$/i);
  if (match) return { path: '/' + match[1].split('/').filter(Boolean).join('/') + '/', source: path, kind: 'routes' };
  return null;
}

/**
 * Bounded read-only map of an existing customer project.
 * All findings are source evidence, never proof of live runtime behavior.
 */
export function buildProjectIntelligence(input) {
  const bag = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const files = [];
  let sourceChars = 0;
  let truncated = false;
  for (const [rawPath, value] of Object.entries(bag)) {
    const path = safePath(rawPath);
    const source = sourceOf(value);
    if (!path || !source) continue;
    if (source.length > MAX_FILE_CHARS || files.length >= MAX_FILES ||
        sourceChars + source.length > MAX_SOURCE_CHARS) {
      truncated = true;
      continue;
    }
    files.push({ path, source });
    sourceChars += source.length;
  }

  const routes = [];
  const apiRoutes = [];
  const schemaFiles = [];
  const migrationFiles = [];
  const componentFiles = [];
  const integrations = new Set();
  const authEvidence = new Set();
  const dataEvidence = new Set();
  const detectedCapabilities = new Set();

  for (const { path, source } of files) {
    const route = routeFromPath(path);
    if (route) routes.push(route);

    if (/^(?:functions\/api\/|api\/|(?:src\/)?pages\/api\/|(?:src\/)?app\/api\/)/i.test(path)) {
      const methods = [
        ...[...source.matchAll(/\bonRequest(Get|Post|Put|Patch|Delete|Options|Head)\b/g)].map(match => match[1].toUpperCase()),
        ...[...source.matchAll(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map(match => match[1]),
      ];
      apiRoutes.push({ source: path, methods: unique(methods, 8) });
    }
    if (/(?:schema\.(?:prisma|graphql)|drizzle|models?\.(?:ts|js)|entities?\.(?:ts|js)|\.sql$)/i.test(path)) schemaFiles.push(path);
    if (/(?:^|\/)(?:migrations?|\.wrangler\/migrations?)(?:\/|$)/i.test(path) || /\.sql$/i.test(path)) migrationFiles.push(path);
    if (/\.(?:tsx?|jsx?|vue|svelte|astro)$/i.test(path) &&
        /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+[A-Z][A-Za-z0-9_$]*/.test(source)) componentFiles.push(path);

    if (/\b(?:firebase-admin|firebase\/auth|createUserWithEmailAndPassword|signInWithEmailAndPassword|supabase\.auth|verifyIdToken|verifySessionCookie)\b/i.test(source)) authEvidence.add('authentication-source');
    if (/\b(?:requireAuth|assertAuthenticated|verifySession|authorize|hasPermission|tenantId|ownerId)\b/i.test(source)) authEvidence.add('authorization-or-ownership-source');
    if (/\b(?:\.prepare\s*\(|\.batch\s*\(|D1Database|drizzle\(|prisma\.|firestore\(|collection\s*\(|supabase\.from\s*\(|\.insert\s*\(|\.upsert\s*\()/i.test(source)) dataEvidence.add('database-access-source');
    if (/\b(?:CREATE\s+TABLE|ALTER\s+TABLE|REFERENCES\s+[\w"]+|FOREIGN\s+KEY)\b/i.test(source)) dataEvidence.add('relational-schema-source');
    if (/\b(?:new\s+Map\s*\(|new\s+Set\s*\(|mock|fake|demo)\b/i.test(source) &&
        /(?:store|database|repository|persist|mock|fake|demo)/i.test(path + ' ' + source.slice(0, 4000))) {
      dataEvidence.add('review-needed-in-memory-or-fixture-pattern');
    }

    const providers = [
      ['paystack', /paystack/i], ['opay', /opay/i], ['stripe', /stripe/i],
      ['flutterwave', /flutterwave/i], ['resend', /resend/i], ['postmark', /postmark/i],
      ['mailgun', /mailgun/i], ['twilio', /twilio/i], ['cloudflare-r2', /(?:R2_BUCKET|r2\.dev|cloudflare.*r2)/i],
      ['supabase', /supabase/i], ['firebase', /firebase/i], ['cal.com', /cal\.com/i],
    ];
    for (const [name, pattern] of providers) if (pattern.test(path + ' ' + source)) integrations.add(name);

    if (/\b(?:payment|checkout|paystack|stripe|opay)\b/i.test(source)) detectedCapabilities.add('payments');
    if (/\b(?:booking|reservation|appointment|availability)\b/i.test(source)) detectedCapabilities.add('booking');
    if (/\b(?:newsletter|subscribe|unsubscribe)\b/i.test(source)) detectedCapabilities.add('newsletter');
    if (/\b(?:upload|file storage|R2_BUCKET|firebase storage)\b/i.test(source)) detectedCapabilities.add('file-storage');
    if (/\b(?:sendEmail|sendMail|resend|postmark|mailgun)\b/i.test(source)) detectedCapabilities.add('email-delivery');
  }

  let dependencies = [];
  const packageFile = files.find(file => file.path === 'package.json');
  if (packageFile) {
    try {
      const pkg = JSON.parse(packageFile.source);
      dependencies = unique(Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }), 60);
    } catch { dependencies = []; }
  }

  const frameworkSignals = [
    dependencies.includes('next') ? 'Next.js' : '',
    dependencies.includes('vite') ? 'Vite' : '',
    dependencies.includes('astro') ? 'Astro' : '',
    dependencies.includes('react') ? 'React' : '',
    dependencies.includes('vue') ? 'Vue' : '',
    dependencies.includes('svelte') ? 'Svelte' : '',
    files.some(file => file.path.startsWith('functions/')) ? 'Cloudflare Pages Functions' : '',
  ];
  const status = !files.length ? 'no-project-files' : truncated ? 'bounded-partial' : 'source-mapped';

  return {
    version: 1,
    status,
    evidenceLevel: 'static-source-only-runtime-unverified',
    project: {
      fileCount: files.length,
      sourceCharsAnalyzed: sourceChars,
      truncated,
      frameworks: unique(frameworkSignals, 10),
      routes: routes.filter((item, index, all) =>
        all.findIndex(other => other.path === item.path && other.source === item.source) === index
      ).slice(0, MAX_ITEMS),
      apiRoutes: apiRoutes.slice(0, MAX_ITEMS),
      schemaFiles: unique(schemaFiles),
      migrationFiles: unique(migrationFiles),
      componentFiles: unique(componentFiles),
      dependencies,
      authEvidence: [...authEvidence].sort(),
      dataEvidence: [...dataEvidence].sort(),
      integrationEvidence: [...integrations].sort(),
      detectedCapabilities: [...detectedCapabilities].sort(),
    },
    changeSafety: {
      preserveExistingFiles: true,
      inspectDependentsBeforeEditing: true,
      requireOwnerApprovalForDestructiveChanges: true,
      neverTreatStaticEvidenceAsRuntimeVerification: true,
    },
    limits: { maxFiles: MAX_FILES, maxSourceChars: MAX_SOURCE_CHARS, maxFileChars: MAX_FILE_CHARS, maxItems: MAX_ITEMS },
  };
}

export function projectIntelligenceInstructions(intelligence) {
  if (!intelligence || intelligence.version !== 1) return [];
  if (intelligence.status === 'no-project-files') return [
    'No existing project source files were supplied. Treat this as a new project build; do not pretend to have inspected a pre-existing codebase.',
  ];
  return [
    'EXISTING PROJECT INTELLIGENCE MAP — READ BEFORE EDITING',
    'This bounded map comes from supplied project files. It is source evidence, not proof that routes, databases, logins, providers or workflows run successfully.',
    JSON.stringify(intelligence),
    'Treat existing routes, API handlers, schemas, migrations, components and dependencies as the project baseline. Reuse and extend them where appropriate; do not create duplicate systems.',
    'Before editing, inspect direct and transitive dependents in the supplied dependency graph. Update affected consumers and tests together. Preserve unrelated user files and working behavior.',
    'If source evidence is incomplete or bounded-partial, inspect relevant files directly and state uncertainty rather than assuming missing functionality.',
    'A provider name in source is not a connected account. A database client, schema or migration is not proof of provisioned persistent storage. Require isolated runtime evidence and provider-specific verification.',
    'For each requested feature, determine whether it already exists, is incomplete, disconnected or missing. Prefer a minimal compatible extension over a rewrite.',
    'Never silently remove user data, authentication, authorization, billing, routes, content or settings. Destructive data/schema changes require explicit owner approval and a tested recovery plan.',
  ];
}
