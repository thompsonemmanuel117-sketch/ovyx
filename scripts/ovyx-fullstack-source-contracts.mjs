const TEXT_SOURCE = /\.(?:[cm]?[jt]sx?|html?|json|prisma|sql|graphql|gql|yaml|yml|toml)$/i;
const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'];

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function escapeRegExp(value) {
  return [...String(value)].map(character =>
    '|\\^$.*+?()[]{}'.includes(character) ? '\\' + character : character
  ).join('');
}

function routePathSegments(routePath) {
  return normalizePath(routePath).replace(/^api\//i, '').split('/').filter(Boolean)
    .map(segment => segment.startsWith(':') ? '[' + segment.slice(1) + ']' : segment);
}

function routeCandidates(routePath) {
  const parts = routePathSegments(routePath);
  const suffix = parts.join('/');
  if (!suffix) return [];
  const candidates = [];
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.push(
      'functions/api/' + suffix + ext,
      'functions/api/' + suffix + '/index' + ext,
      'api/' + suffix + ext,
      'api/' + suffix + '/index' + ext,
      'pages/api/' + suffix + ext,
      'src/pages/api/' + suffix + ext,
      'app/api/' + suffix + '/route' + ext,
      'src/app/api/' + suffix + '/route' + ext,
    );
  }
  return candidates.map(normalizePath);
}

function methodEvidence(source, method) {
  const verb = String(method || 'GET').toUpperCase();
  const pascal = verb.charAt(0) + verb.slice(1).toLowerCase();
  const patterns = [
    new RegExp('\\bonRequest' + pascal + '\\b'),
    new RegExp('\\bexport\\s+(?:async\\s+)?function\\s+' + verb + '\\b'),
    new RegExp('\\bexport\\s+(?:const|let|var)\\s+' + verb + '\\b'),
    new RegExp('\\b(?:router|app|server)\\s*\\.\\s*' + verb.toLowerCase() + '\\s*\\('),
    new RegExp('\\bmethod\\s*:\\s*["\\x27]' + verb + '["\\x27]', 'i'),
  ];
  return patterns.some(pattern => pattern.test(String(source || '')));
}

function routeHandlerSource(route, files, pathMap) {
  const candidates = routeCandidates(route.path);
  for (const candidate of candidates) {
    const exact = pathMap.get(candidate.toLowerCase());
    if (exact && typeof files[exact] === 'string') {
      return { file: exact, source: files[exact], match: 'framework-route-file' };
    }
  }
  const literal = String(route.path || '').replace(/:\w+/g, '').replace(/\/+/g, '/');
  for (const [file, source] of Object.entries(files)) {
    if (!TEXT_SOURCE.test(file)) continue;
    const pathSignals = literal.length > 4 && String(source).includes(literal);
    if (pathSignals && methodEvidence(source, route.method)) {
      return { file, source, match: 'central-router-path-and-method-source' };
    }
  }
  return null;
}

function authorizationEvidence(source, policy) {
  const value = String(policy || '').toLowerCase();
  const text = String(source || '');
  if (value.includes('provider-signature')) {
    const signature = /(?:verify|validate|construct|check).{0,40}(?:signature|webhook)|(?:signature|hmac).{0,40}(?:verify|validate|secret)|webhooksecret|constructevent/i.test(text);
    const replay = /eventId|event\.id|idempotencyKey|replay|processedEvent|webhookEvent/i.test(text);
    return signature && replay;
  }
  if (value.includes('signed-unsubscribe-token')) {
    return /(?:verify|validate|decode).{0,40}(?:unsubscribe|token)|unsubscribe.{0,40}(?:token|signature)|tokenHash|verifySignature/i.test(text);
  }
  if (value.includes('public-with-credential-provider')) {
    return /signInWith|verifyPassword|verifyCredentials|credentialProvider|verifyIdToken|identityToken|providerSubject/i.test(text);
  }
  if (value.startsWith('public')) return true;
  const authentication = /assertAuthenticated|requireAuth|verifyIdToken|verifySession|context\.data\??\.user|request\.auth|authUser|session\??\.user|verifyJWT|verifyJwt|requireUser/i.test(text);
  const elevated = /requireAdmin|requireRole|hasRole|authorize|permission|ownerId|tenantId|resourceOwner|role\s*===?|role\s*:/i.test(text);
  if (/administrator|role-and-resource|owner-or|owner-only|resource-scope|object-level/.test(value)) return authentication && elevated;
  if (value.includes('verified-customer-or-server-authorized-billable-reference')) {
    return authentication || /authorizeBillableReference|verifyBillableReference|serverAuthorizedInvoice/i.test(text);
  }
  return authentication;
}

function schemaDeclarationEvidence(model, files) {
  const name = String(model && model.name || '').trim();
  if (!name) return null;
  const escaped = escapeRegExp(name);
  const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const plural = snake.endsWith('s') ? snake : snake + 's';
  const patterns = [
    new RegExp('\\bmodel\\s+' + escaped + '\\s*\\{', 'i'),
    new RegExp('\\b(?:interface|type)\\s+' + escaped + '\\b', 'i'),
    new RegExp('\\b(?:const|let|var)\\s+' + escaped + '(?:Schema|Model|Definition)\\b', 'i'),
    new RegExp('\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\\x27]?' + escaped + '["\\x27]?\\b', 'i'),
    new RegExp('\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\\x27]?' + escapeRegExp(plural) + '["\\x27]?\\b', 'i'),
    new RegExp('\\b(?:collection|table)\\s*\\(\\s*["\\x27]' + escapeRegExp(plural) + '["\\x27]\\s*\\)', 'i'),
  ];
  for (const [file, source] of Object.entries(files)) {
    if (!TEXT_SOURCE.test(file)) continue;
    if (patterns.some(pattern => pattern.test(String(source || '')))) return file;
  }
  return null;
}

function relationshipEvidence(relationship, files) {
  const from = String(relationship.from || '').replace(/^model-/, '');
  const to = String(relationship.to || '').replace(/^model-/, '');
  const fromName = from.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const toName = to.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const fromPattern = new RegExp('\\b' + escapeRegExp(from) + '\\b', 'i');
  const toPattern = new RegExp('\\b' + escapeRegExp(to) + '\\b', 'i');
  const fromHuman = new RegExp('\\b' + escapeRegExp(fromName) + '\\b', 'i');
  const toHuman = new RegExp('\\b' + escapeRegExp(toName) + '\\b', 'i');
  for (const [file, source] of Object.entries(files)) {
    if (!TEXT_SOURCE.test(file)) continue;
    const text = String(source || '');
    const namesTogether = (fromPattern.test(text) || fromHuman.test(text)) &&
      (toPattern.test(text) || toHuman.test(text));
    const relationSignal = /(?:references|foreign\s+key|relation|connect|belongsTo|hasMany|hasOne|@relation|references\s*:)/i.test(text);
    if (namesTogether && relationSignal) return file;
  }
  return null;
}

export function evaluateFullStackSourceContracts(rawFiles, architecture) {
  const files = {};
  for (const [rawPath, rawContent] of Object.entries(rawFiles || {})) {
    const file = normalizePath(rawPath);
    const content = typeof rawContent === 'string'
      ? rawContent
      : rawContent && typeof rawContent.content === 'string' ? rawContent.content : '';
    if (file && content) files[file] = content;
  }
  const pathMap = new Map(Object.keys(files).map(file => [file.toLowerCase(), file]));
  const routes = Array.isArray(architecture && architecture.apiContracts) ? architecture.apiContracts : [];
  const models = Array.isArray(architecture && architecture.dataModels) ? architecture.dataModels : [];
  const relationships = Array.isArray(architecture && architecture.dataIntegrity && architecture.dataIntegrity.relationships)
    ? architecture.dataIntegrity.relationships : [];

  const routeEvidence = routes.map(route => {
    const handler = routeHandlerSource(route, files, pathMap);
    const source = handler && handler.source || '';
    const methodDetected = Boolean(handler && methodEvidence(source, route.method));
    const policy = String(route.authPolicy || '').toLowerCase();
    const authorizationExpected = !policy.startsWith('public') || policy.includes('credential-provider');
    const authorizationDetected = !authorizationExpected || Boolean(handler && authorizationEvidence(source, route.authPolicy));
    return {
      routeId: route.id,
      method: route.method,
      path: route.path,
      authPolicy: route.authPolicy,
      sourceFile: handler && handler.file || null,
      sourceMatch: handler && handler.match || 'not-found',
      methodDetected,
      authorizationExpected,
      authorizationDetected,
      runtimeBehaviorVerified: false,
      status: !handler ? 'missing-route-source'
        : !methodDetected ? 'http-method-source-not-detected'
          : !authorizationDetected ? 'authorization-source-not-detected'
            : 'source-evidence-present-behavior-unverified',
    };
  });
  const modelEvidence = models.map(model => {
    const sourceFile = schemaDeclarationEvidence(model, files);
    return {
      modelId: model.id,
      model: model.name,
      sourceFile,
      status: sourceFile ? 'schema-source-evidence-present-behavior-unverified' : 'missing-schema-source',
      runtimePersistenceVerified: false,
    };
  });
  const relationEvidence = relationships.map(relationship => {
    const sourceFile = relationshipEvidence(relationship, files);
    return {
      relationshipId: relationship.id,
      from: relationship.from,
      to: relationship.to,
      sourceFile,
      status: sourceFile ? 'relationship-source-evidence-present-behavior-unverified' : 'missing-relationship-source',
      referentialIntegrityVerified: false,
    };
  });
  const missingRouteSourceCount = routeEvidence.filter(item => item.status === 'missing-route-source').length;
  const missingMethodEvidenceCount = routeEvidence.filter(item => item.status === 'http-method-source-not-detected').length;
  const missingAuthorizationEvidenceCount = routeEvidence.filter(item => item.status === 'authorization-source-not-detected').length;
  const missingSchemaSourceCount = modelEvidence.filter(item => item.status === 'missing-schema-source').length;
  const missingRelationshipSourceCount = relationEvidence.filter(item => item.status === 'missing-relationship-source').length;
  const complete = missingRouteSourceCount + missingMethodEvidenceCount + missingAuthorizationEvidenceCount +
    missingSchemaSourceCount + missingRelationshipSourceCount === 0;
  return {
    status: complete ? 'source-evidence-present-runtime-unverified' : 'missing-full-stack-source-evidence',
    requestedRouteCount: routeEvidence.length,
    routeSourceEvidenceCount: routeEvidence.filter(item => item.sourceFile).length,
    modelCount: modelEvidence.length,
    modelSchemaEvidenceCount: modelEvidence.filter(item => item.sourceFile).length,
    relationshipCount: relationEvidence.length,
    relationshipSourceEvidenceCount: relationEvidence.filter(item => item.sourceFile).length,
    missingRouteSourceCount,
    missingMethodEvidenceCount,
    missingAuthorizationEvidenceCount,
    missingSchemaSourceCount,
    missingRelationshipSourceCount,
    routeEvidence,
    modelEvidence,
    relationEvidence,
    runtimeBehaviorVerified: false,
    databasePersistenceVerified: false,
    integrationDeliveryVerified: false,
    deploymentVerified: false,
    note: 'This audit detects bounded source declarations only. It does not execute routes, migrations, authorization, database writes, provider delivery or browser journeys.',
  };
}
