const MAX_REQUIREMENTS = 180;

const clean = (value, max = 220) => String(value == null ? '' : value)
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

function slug(value, fallback = 'item') {
  const result = clean(value, 100).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return result || fallback;
}

function addNode(nodes, node) {
  if (!nodes.some(item => item.id === node.id)) nodes.push(node);
  return node.id;
}

function addEdge(edges, from, to, relation, requirementId = '') {
  if (!from || !to) return;
  const edge = { id: 'edge-' + slug(from + '-' + relation + '-' + to, 'edge'), from, to, relation };
  if (requirementId) edge.requirementId = requirementId;
  if (!edges.some(item => item.id === edge.id)) edges.push(edge);
}

function normalizeRequirements(contract) {
  const source = Array.isArray(contract && contract.allBriefClauses) ? contract.allBriefClauses : [];
  return source.slice(0, MAX_REQUIREMENTS).map((entry, index) => {
    const value = clean(entry, 900);
    const match = value.match(/^(R\d{1,4}):\s*/);
    return {
      id: match ? match[1] : 'R' + String(index + 1).padStart(3, '0'),
      text: clean(value.replace(/^R\d{1,4}:\s*/, ''), 280),
    };
  });
}

function inferCapabilities(prompt, contract) {
  const source = String(prompt || '');
  const signals = contract && contract.contactSignals || {};
  const admin = /\b(?:admin dashboard|administrator|back office|staff dashboard|manage users|manage orders|manage bookings)\b/i.test(source);
  const commerce = signals.shoppingCart === true || signals.addToCart === true ||
    /\b(?:e-commerce|ecommerce|online store|sell products|product catalogue|product catalog|shopping cart|add to cart)\b/i.test(source);
  const payment = signals.payments === true ||
    /\b(?:payment|paystack|flutterwave|stripe|paypal|checkout|pay now|subscription billing|recurring billing)\b/i.test(source);
  const auth = signals.authentication === true || admin ||
    /\b(?:user roles?|role-based access|admin access|staff accounts?|member portal|sign in|sign up|login|authentication)\b/i.test(source);
  const booking = signals.bookings === true ||
    /\b(?:appointment|reservation|booking|schedule a|availability calendar)\b/i.test(source);
  const contact = signals.contactForm === true || signals.emailDelivery === true ||
    /\b(?:contact form|enquiry form|inquiry form|lead capture|send a message)\b/i.test(source);
  const email = signals.emailDelivery === true || signals.newsletter === true ||
    /\b(?:email delivery|send confirmation|email notification|transactional email|newsletter)\b/i.test(source);
  const fileStorage = /\b(?:file upload|image upload|document upload|media library|file storage|user uploads?)\b/i.test(source);
  const persistentData = signals.backendData === true || commerce || booking || auth || contact || fileStorage ||
    /\b(?:database|persistent data|save records|customer records|reporting dashboard)\b/i.test(source);
  const search = /\b(?:search|filter|sort|catalogue|catalog|directory|listing)\b/i.test(source);
  const backgroundWork = email || booking || payment ||
    /\b(?:background job|scheduled task|queue|webhook|async processing|cron)\b/i.test(source);

  return {
    frontend: true, backend: contact || booking || payment || auth || persistentData || fileStorage || admin || backgroundWork,
    database: persistentData, authentication: auth, authorization: auth || admin,
    payments: payment, commerce, contact, email, booking, fileStorage, admin, search, backgroundWork,
  };
}

function buildDataModels(capabilities) {
  const models = [];
  const push = (name, purpose, fields, securityClass = 'business-data') => {
    models.push({
      id: 'model-' + slug(name), name, purpose, fields, securityClass,
      schemaState: 'derive-from-complete-brief-and-confirm-domain-rules',
      persistence: 'required-when-feature-is-enabled',
    });
  };
  if (capabilities.authentication) push('UserAccount', 'Identity and account lifecycle; credentials remain with the configured auth provider.', ['id', 'providerSubject', 'email', 'status'], 'identity');
  if (capabilities.authorization) push('RoleAssignment', 'Server-enforced workspace, resource and action permissions.', ['id', 'principalId', 'role', 'scope', 'grantedAt'], 'authorization');
  if (capabilities.contact) push('ContactSubmission', 'Validated enquiry with an auditable delivery state.', ['id', 'name', 'replyTo', 'message', 'status', 'createdAt'], 'personal-data');
  if (capabilities.booking) push('Booking', 'Availability-backed reservation with timezone-aware start/end and explicit lifecycle.', ['id', 'resourceId', 'customerId', 'startsAt', 'endsAt', 'timezone', 'status'], 'personal-data');
  if (capabilities.commerce) {
    push('Product', 'Catalog item and purchasable offer; price and availability come from an authoritative source.', ['id', 'name', 'sku', 'priceAmount', 'currency', 'status']);
    push('Cart', 'User or session cart with server-recomputed prices and inventory validation.', ['id', 'ownerId', 'items', 'updatedAt']);
    push('Order', 'Immutable order intent and fulfillment lifecycle.', ['id', 'ownerId', 'items', 'subtotalAmount', 'totalAmount', 'currency', 'status'], 'financial');
  }
  if (capabilities.payments) push('PaymentAttempt', 'Provider payment attempt linked to an order or authorized billable action.', ['id', 'orderId', 'providerReference', 'amount', 'currency', 'status', 'verifiedAt'], 'financial');
  if (capabilities.email) push('DeliveryRecord', 'Outbox/delivery state with retry and provider receipt; not a claim of delivery.', ['id', 'recipientRef', 'templateKey', 'idempotencyKey', 'status', 'attemptCount', 'providerReceipt'], 'personal-data');
  if (capabilities.fileStorage) push('StoredAsset', 'Owner-scoped metadata for uploaded objects stored outside public source control.', ['id', 'ownerId', 'storageKey', 'contentType', 'byteSize', 'checksum', 'createdAt'], 'private-file');
  if (capabilities.admin) push('AuditEvent', 'Append-only record of sensitive administrative actions and actor/resource context.', ['id', 'actorId', 'action', 'resourceType', 'resourceId', 'createdAt'], 'security-audit');
  return models;
}

function buildApiContracts(capabilities) {
  const routes = [];
  const add = (method, path, capability, auth, purpose, modelIds, extra = {}) => routes.push({
    id: 'api-' + slug(method + '-' + path), method, path, capability, authPolicy: auth, purpose,
    requestValidation: 'strict-server-side-schema; reject unknown or invalid fields',
    responseContract: 'stable typed success/error envelope; never expose secrets or internal stack traces',
    modelIds, idempotency: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? 'required-for-retryable-side-effects' : 'not-applicable',
    rateLimit: capability === 'authentication' || capability === 'payments' ? 'strict-per-identity-and-ip' : 'risk-based',
    implementationState: 'planned-not-generated-or-verified-by-this-planner', ...extra,
  });

  if (capabilities.contact) add('POST', '/api/contact-submissions', 'contact', 'public-with-abuse-controls', 'Validate and persist a contact request, then enqueue owner-approved delivery.', ['model-contactsubmission'], { sideEffect: 'enqueue-delivery-after-commit' });
  if (capabilities.booking) {
    add('GET', '/api/availability', 'booking', 'public-read-with-rate-limit', 'Return current authoritative availability for a requested resource and time window.', ['model-booking'], { cachePolicy: 'short-lived-only-if-provider-allows' });
    add('POST', '/api/bookings', 'booking', 'public-with-abuse-controls', 'Recheck availability and atomically create a booking; never trust client availability.', ['model-booking'], { sideEffect: 'reserve-resource-with-conflict-check' });
    add('POST', '/api/bookings/:bookingId/cancel', 'booking', 'owner-or-authorized-staff', 'Cancel an owned booking subject to provider and lifecycle rules.', ['model-booking']);
  }
  if (capabilities.authentication) {
    add('POST', '/api/auth/session', 'authentication', 'public-with-credential-provider', 'Create a session only after provider-backed identity verification.', ['model-useraccount'], { sideEffect: 'rotate-session-and-csrf-state' });
    add('DELETE', '/api/auth/session', 'authentication', 'authenticated', 'Revoke the current session and clear session cookies.', ['model-useraccount']);
  }
  if (capabilities.commerce) {
    add('GET', '/api/products', 'commerce', 'public-read', 'Read catalog items from the configured authoritative source.', ['model-product'], { cachePolicy: 'source-aware' });
    add('POST', '/api/cart/quote', 'commerce', 'session-or-authenticated', 'Recalculate line items, discounts, tax and inventory on the server.', ['model-cart', 'model-product', 'model-order']);
    if (!capabilities.payments) {
      add('POST', '/api/orders', 'commerce', 'session-or-verified-customer', 'Create an order intent without representing it as paid; fulfillment waits for the configured business process.', ['model-cart', 'model-order'], { sideEffect: 'order-intent-only' });
    }
    if (capabilities.payments) {
      add('POST', '/api/checkout', 'payments', 'session-or-authenticated', 'Create provider checkout from a server-calculated order; never accept client totals.', ['model-cart', 'model-order', 'model-paymentattempt'], { sideEffect: 'provider-checkout-with-idempotency' });
    }
  }
  if (capabilities.payments) {
    if (!capabilities.commerce) add('POST', '/api/payments/intents', 'payments', 'authenticated-or-authorized-customer', 'Create a payment intent for a server-authorized invoice or billable action; amount and currency are server-derived.', ['model-paymentattempt'], { sideEffect: 'provider-payment-intent-with-idempotency' });
    add('POST', '/api/webhooks/payments', 'payments', 'provider-signature-and-replay-protected', 'Verify webhook signature, timestamp and event identity before idempotent reconciliation.', ['model-paymentattempt', ...(capabilities.commerce ? ['model-order'] : [])], { sideEffect: 'idempotent-payment-reconciliation', csrf: 'provider signature required' });
  }
  if (capabilities.fileStorage) {
    add('POST', '/api/assets', 'storage', 'authenticated-owner-scoped', 'Authorize upload intent and enforce MIME, size, quota and ownership rules.', ['model-storedasset'], { sideEffect: 'signed-upload-or-server-mediated-upload' });
    add('GET', '/api/assets/:assetId', 'storage', 'authenticated-owner-or-explicit-public-policy', 'Resolve an asset only after ownership/publication checks.', ['model-storedasset']);
  }
  if (capabilities.admin) add('GET', '/api/admin/audit-events', 'administration', 'administrator-role-and-resource-scope', 'Read authorized audit history with pagination and sensitive-field redaction.', ['model-auditevent']);
  return routes;
}

function buildIntegrationContracts(capabilities, context) {
  const requests = [
    ['payments', capabilities.payments], ['database', capabilities.database],
    ['authentication', capabilities.authentication], ['email', capabilities.email],
    ['booking', capabilities.booking], ['storage', capabilities.fileStorage],
  ].filter(([, requested]) => requested);
  const roots = [context && context.connections, context && context.activeConnections,
    context && context.integrations, context && context.connectionStatus, context && context.connectedServices];
  const flatten = value => {
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (!value || typeof value !== 'object') return [];
    return [value, ...Object.values(value).flatMap(flatten)];
  };
  const connectionRecords = flatten(roots);
  const patterns = {
    payments: /payment|paystack|flutterwave|stripe|paypal/i, database: /database|firestore|firebase|d1|postgres|mysql|supabase/i,
    authentication: /auth|identity|firebase|supabase|clerk/i, email: /email|mail|resend|sendgrid|postmark|smtp/i,
    booking: /booking|reservation|calendar|scheduling/i, storage: /storage|r2|firebase|s3|supabase/i,
  };
  return requests.map(([capability]) => {
    const connectedInContext = connectionRecords.some(item => {
      if (!item || typeof item !== 'object') return false;
      const identity = clean(item.provider || item.name || item.id || item.type || item.service, 120);
      return (item.connected === true || item.status === 'connected' || item.state === 'connected' || item.isConnected === true) &&
        patterns[capability].test(identity);
    });
    return {
      capability, required: true, provider: 'not-selected-by-architecture-planner',
      connectionMetadata: connectedInContext ? 'connected-in-context-not-live-verified' : 'not-confirmed',
      credentialBoundary: 'server-only; values must never enter prompts, browser bundles, logs or exported source',
      verification: 'not-run', liveDeliveryOrTransaction: 'not-verified',
      failurePolicy: 'fail-closed-for-protected-actions; never simulate provider success',
    };
  });
}

function buildSecurityArchitecture(capabilities) {
  const controls = [
    ['secret-isolation', 'Keep secrets in server-side encrypted storage or platform bindings; client-visible config contains names/status only.'],
    ['deny-by-default', 'Protect every server route by explicit authentication, authorization, resource ownership and action policy.'],
    ['input-validation', 'Validate path, query, body, content type, size and domain invariants on the server.'],
    ['output-encoding', 'Escape untrusted content and avoid unsafe HTML execution/injection sinks.'],
    ['rate-abuse-control', 'Apply per-user and IP-aware throttles to public forms, auth, uploads and expensive actions.'],
    ['audit-redaction', 'Record security outcomes while redacting credentials, tokens, personal data and raw payloads.'],
    ['transport-and-browser-policy', 'Require HTTPS and maintain a least-privilege CSP, secure headers and safe cookie attributes.'],
    ['dependency-and-supply-chain', 'Pin reproducible dependencies, inspect vulnerabilities/licenses and keep lockfiles consistent.'],
    ['backup-and-recovery', 'Define backup, restore, recovery point and recovery time expectations for persistent business data.'],
  ];
  if (capabilities.authentication) controls.push(['session-security', 'Use provider-verified identities, secure session lifecycle, rotation, expiry, CSRF protection where cookie-authenticated and safe logout.']);
  if (capabilities.authorization) controls.push(['object-level-authorization', 'Check resource ownership and scope on every read/write; role labels alone never grant cross-tenant access.']);
  if (capabilities.payments) controls.push(['payment-integrity', 'Recompute amounts server-side; verify signatures, replay windows and provider references; reconcile idempotently before fulfillment.']);
  if (capabilities.booking) controls.push(['booking-integrity', 'Recheck authoritative availability at commit time and prevent overlapping reservations transactionally or through provider locking.']);
  if (capabilities.fileStorage) controls.push(['upload-isolation', 'Validate MIME by content, enforce per-file/project limits, randomize storage keys and scan files before public distribution.']);
  return controls.map(([id, requirement]) => ({ id, requirement, mandatory: true, status: 'acceptance-required' }));
}

function buildTestPlan(capabilities) {
  const tests = [
    { id: 'architecture-contract', type: 'contract', scope: 'all layers', assertion: 'Every requirement maps to relevant nodes or is explicitly not-assessable.' },
    { id: 'route-contract', type: 'contract', scope: 'backend API', assertion: 'HTTP methods, auth policy, validation, errors and idempotency match each route contract.' },
    { id: 'data-integrity', type: 'integration', scope: 'database', assertion: 'Constraints, indexes, ownership and transaction boundaries hold against the selected database.' },
    { id: 'browser-journeys', type: 'browser-e2e', scope: 'frontend and backend', assertion: 'Every requested journey runs from UI action through API and persisted/result state.' },
    { id: 'authorization-boundaries', type: 'security', scope: 'identity and APIs', assertion: 'Anonymous, wrong-role and cross-owner access are denied without data leakage.' },
    { id: 'failure-recovery', type: 'resilience', scope: 'all layers', assertion: 'Timeouts, retries, duplicate requests, partial failures and cancellation recover without duplicate side effects.' },
    { id: 'deployment-smoke', type: 'deployment', scope: 'deployed project', assertion: 'Production build, health endpoints, routes, assets, secrets and critical journeys work in target environment.' },
  ];
  if (capabilities.payments) tests.push({ id: 'payment-sandbox', type: 'external-sandbox', scope: 'payments', assertion: 'Sandbox checkout, signature verification, webhook replay, reconciliation and fulfillment pass without real charges.', requiresExplicitOwnerApproval: true });
  if (capabilities.email) tests.push({ id: 'delivery-receipt', type: 'external-sandbox', scope: 'email', assertion: 'Controlled QA message is accepted and provider delivery receipt is reconciled.', requiresExplicitOwnerApproval: true });
  if (capabilities.booking) tests.push({ id: 'booking-conflicts', type: 'integration', scope: 'booking', assertion: 'Concurrent reservations cannot claim the same unavailable slot.' });
  return tests.map(test => ({ ...test, status: 'planned-not-executed', evidence: null }));
}

function buildCrossLayerContracts(capabilities) {
  return {
    apiBoundary: {
      owner: 'server',
      clientRule: 'Frontend calls typed API contracts or authorized provider SDK flows; it never receives server secrets or writes protected records directly.',
      schemas: 'One validated domain contract is shared by route handlers, persistence adapters and generated clients.',
      errors: 'Stable machine-readable error codes with safe user messages, correlation IDs and no internal stack traces.',
    },
    dataConsistency: {
      money: 'Store monetary values as integer minor units with an explicit ISO 4217 currency; calculate totals on the server.',
      time: 'Persist timestamps in UTC and retain the IANA timezone for user-entered schedules and display.',
      identifiers: 'Use opaque stable identifiers; enforce unique and foreign-key constraints where supported.',
      ownership: 'Persist tenant/owner scope with protected records and enforce it on every server read/write.',
      concurrency: 'Use database transactions, unique constraints or provider locking for inventory, booking and payment state races.',
    },
    identityAndAuthorization: {
      identity: capabilities.authentication ? 'Verify identities through the configured authentication provider.' : 'No authentication flow inferred; do not create hidden accounts.',
      authorization: capabilities.authorization ? 'Separate identity from authorization; enforce role and object-level ownership on the server.' : 'Public access remains limited to explicitly public resources.',
      clientTrust: 'Never trust client-supplied user IDs, roles, ownership, prices, discounts, payment status or permission flags.',
    },
    transactionSafety: {
      mutations: 'Validate and authorize before mutation; commit durable state before acknowledging success.',
      sideEffects: 'Use idempotency keys and an outbox/queue for retryable provider side effects.',
      duplicateDelivery: 'Deduplicate by provider event ID and application idempotency key; keep replay outcomes auditable.',
      compensation: 'Define compensating actions and a manual reconciliation path for multi-service workflows that cannot share one transaction.',
    },
    integrationReliability: {
      adapters: 'Place each external service behind a server-side adapter and a narrow typed contract.',
      network: 'Use bounded timeouts, retry only safe/idempotent operations, exponential backoff and circuit-breaker behavior.',
      state: 'Expose configured, reachable, last-check-passed and delivery-verified as separate states.',
      failure: 'Fail closed for payments, authorization and booking confirmation; never simulate provider success.',
    },
    privacyAndRetention: {
      minimization: 'Collect only fields needed for the requested business workflow.',
      sensitiveData: 'Classify identity, financial, personal, private-file and audit data; restrict access and redact logs.',
      lifecycle: 'Define retention, export, correction and deletion behavior before production.',
      consent: 'Collect explicit consent only where the use case or applicable law requires it; preserve evidence when required.',
    },
    observability: {
      correlation: 'Propagate a request/build correlation ID across browser, API, database, queue and provider adapter.',
      events: 'Record stage outcomes, latency, retry count and normalized error codes without raw secrets or unnecessary personal data.',
      operations: 'Expose retry queues, dead-letter items, reconciliation state and deployment revision to authorized operators.',
    },
    environmentAndRelease: {
      environments: ['development', 'preview', 'production'],
      isolation: 'Separate data stores, callback URLs, domains and credentials across environments.',
      secrets: 'Inject server secrets through deployment bindings or encrypted server-side storage; never commit .env secrets.',
      release: 'Require reproducible install/build, migrations dry-run, security checks, browser journeys and post-deploy smoke tests.',
      rollback: 'Keep a known-good artifact and a tested rollback path; roll back code and data changes independently where necessary.',
    },
    qualityPrinciples: [
      'A complete user journey must cross the actual UI, server contract, persistence and provider boundary when requested.',
      'A success state may appear only after the authoritative operation has succeeded.',
      'Every async state needs loading, empty, error, retry and cancellation behavior appropriate to the operation.',
      'Use pagination and bounded queries for large collections; avoid unbounded reads and client-side authorization.',
    ],
  };
}

/**
 * Deterministic cross-layer blueprint derived from the complete original brief.
 * It describes contracts and dependencies; it does not provision resources or
 * claim that generated files, credentials or integrations exist.
 */
export function buildFullStackArchitecture(prompt, contract = {}, context = {}, pages = []) {
  const capabilities = inferCapabilities(prompt, contract);
  const requirements = normalizeRequirements(contract);
  const models = buildDataModels(capabilities);
  const apiContracts = buildApiContracts(capabilities);
  const integrations = buildIntegrationContracts(capabilities, context || {});
  const nodes = [];
  const edges = [];
  const projectId = addNode(nodes, { id: 'project', type: 'project', name: 'Coherent application', status: 'architecture-planned' });
  const pageEntries = (Array.isArray(pages) && pages.length ? pages : [{ title: 'Primary experience', route: null }]).map((page, index) => {
    const title = clean(page && page.title || 'Page ' + (index + 1), 80);
    const id = addNode(nodes, { id: 'page-' + slug(title, 'page-' + (index + 1)), type: 'frontend-page', name: title, route: page && page.route || null, status: 'architecture-planned', acceptance: 'rendered-and-interacted-in-browser' });
    addEdge(edges, projectId, id, 'contains');
    return { title, id, route: page && page.route || null };
  });
  const addComponent = (name, purpose) => {
    const id = addNode(nodes, { id: 'component-' + slug(name), type: 'frontend-component', name, purpose, status: 'architecture-planned' });
    addEdge(edges, projectId, id, 'owns-component');
    return id;
  };
  const navigationId = addComponent('Shared navigation', 'Consistent routes and accessible active-state navigation.');
  for (const page of pageEntries) addEdge(edges, page.id, navigationId, 'uses');
  const featureComponents = {};
  if (capabilities.contact) featureComponents.contact = addComponent('Contact form', 'Validated fields, consent/error/success states and honest submission status.');
  if (capabilities.booking) featureComponents.booking = addComponent('Booking experience', 'Timezone-aware selection, authoritative availability and explicit pending/confirmed states.');
  if (capabilities.commerce) featureComponents.commerce = addComponent('Commerce experience', 'Catalog, cart and checkout using server-calculated prices.');
  if (capabilities.authentication) featureComponents.authentication = addComponent('Account experience', 'Provider-backed sign-in/session state with protected-route handling.');
  if (capabilities.admin) featureComponents.admin = addComponent('Administration workspace', 'Role-scoped management with auditable sensitive actions.');
  if (capabilities.search) featureComponents.search = addComponent('Search and filtering', 'Accessible search/filter state with empty, loading and failure behavior.');
  if (capabilities.fileStorage) featureComponents.storage = addComponent('Asset upload manager', 'Owner-scoped upload lifecycle with progress, failure and retry feedback.');

  const modelIds = [];
  for (const model of models) {
    addNode(nodes, { id: model.id, type: 'data-model', name: model.name, securityClass: model.securityClass, status: 'schema-required' });
    modelIds.push(model.id);
    addEdge(edges, projectId, model.id, 'owns-data-contract');
  }
  const integrationIds = [];
  for (const integration of integrations) {
    const id = addNode(nodes, { id: 'integration-' + slug(integration.capability), type: 'integration', name: integration.capability, status: integration.connectionMetadata });
    integrationIds.push(id);
    addEdge(edges, projectId, id, 'requires-capability');
  }
  const apiIds = [];
  for (const route of apiContracts) {
    addNode(nodes, { id: route.id, type: 'api-route', name: route.method + ' ' + route.path, method: route.method, path: route.path, status: 'contract-required' });
    apiIds.push(route.id);
    addEdge(edges, projectId, route.id, 'exposes-api');
    for (const modelId of route.modelIds) if (modelIds.includes(modelId)) addEdge(edges, route.id, modelId, 'reads-or-writes');
    const targetIntegration = integrationIds.find(id => id === 'integration-' + slug(route.capability));
    if (targetIntegration) addEdge(edges, route.id, targetIntegration, 'calls-through-server-adapter');
    const databaseIntegration = integrationIds.find(id => id === 'integration-database');
    if (databaseIntegration && route.modelIds.length) addEdge(edges, route.id, databaseIntegration, 'persists-through-server-adapter');
    if (route.capability === 'contact') {
      const emailIntegration = integrationIds.find(id => id === 'integration-email');
      if (emailIntegration) addEdge(edges, route.id, emailIntegration, 'queues-delivery-through-server-adapter');
    }
  }
  for (const page of pageEntries) {
    const title = page.title;
    const pageCapabilityMatchers = {
      contact: /contact|enquir|inquir/i,
      booking: /book|reserv|appointment/i,
      commerce: /shop|product|catalog|cart|checkout|order/i,
      payments: /shop|product|catalog|cart|checkout|order|billing/i,
      authentication: /login|sign|account|dashboard|profile/i,
      administration: /admin|dashboard|manage/i,
      storage: /upload|asset|media|document/i,
      search: /search|directory|catalog|product|listing/i,
    };
    const matchingCapabilities = Object.entries(featureComponents)
      .filter(([capability]) => pageCapabilityMatchers[capability] && pageCapabilityMatchers[capability].test(title))
      .map(([, componentId]) => componentId);
    if (pageEntries.length === 1 || !matchingCapabilities.length && page === pageEntries[0]) {
      for (const componentId of Object.values(featureComponents)) addEdge(edges, page.id, componentId, 'renders');
    } else {
      for (const componentId of matchingCapabilities) addEdge(edges, page.id, componentId, 'renders');
    }
    const requiredRoutes = apiContracts.filter(route => {
      const pattern = pageCapabilityMatchers[route.capability] || pageCapabilityMatchers[route.capability === 'payments' ? 'payments' : ''];
      return pattern && pattern.test(title);
    });
    for (const route of requiredRoutes) addEdge(edges, page.id, route.id, 'submits-to');
  }
  const linkedRouteIds = new Set(edges.filter(edge => edge.relation === 'submits-to').map(edge => edge.to));
  for (const route of apiContracts) {
    if (!linkedRouteIds.has(route.id)) addEdge(edges, pageEntries[0].id, route.id, 'submits-to');
  }
  if (capabilities.backgroundWork) {
    const queueId = addNode(nodes, { id: 'background-outbox', type: 'background-workflow', name: 'Reliable background outbox', status: 'implementation-required', purpose: 'Process delivery and async work with bounded retries, dead-letter visibility and idempotency.' });
    addEdge(edges, projectId, queueId, 'runs-background-work');
    for (const route of apiContracts.filter(item => ['contact', 'payments', 'booking'].includes(item.capability))) addEdge(edges, route.id, queueId, 'enqueues-after-commit');
  }
  const requirementMappings = requirements.map(requirement => {
    const text = requirement.text;
    const targets = [];
    const addTarget = value => { if (value && !targets.includes(value)) targets.push(value); };
    if (/\b(?:database|persist|save|record|store|customer|order|booking|reservation)\b/i.test(text)) modelIds.forEach(addTarget);
    if (/\b(?:api|backend|server|endpoint|webhook|integration)\b/i.test(text)) apiIds.forEach(addTarget);
    if (/\b(?:login|auth|role|permission|admin|staff|account)\b/i.test(text)) {
      nodes.filter(item => ['security-boundary'].includes(item.type) || /account|audit|admin/i.test(item.name || '')).forEach(item => addTarget(item.id));
    }
    if (/\b(?:payment|checkout|pay|cart|order)\b/i.test(text)) {
      apiContracts.filter(item => ['payments', 'commerce'].includes(item.capability)).forEach(item => addTarget(item.id));
      nodes.filter(item => item.type === 'data-model' && /order|payment|cart/i.test(item.name)).forEach(item => addTarget(item.id));
    }
    if (/\b(?:booking|reservation|appointment|availability)\b/i.test(text)) {
      apiContracts.filter(item => item.capability === 'booking').forEach(item => addTarget(item.id));
      nodes.filter(item => item.type === 'data-model' && /booking/i.test(item.name)).forEach(item => addTarget(item.id));
    }
    if (/\b(?:contact|enquiry|inquiry|form|newsletter|email|notification)\b/i.test(text)) {
      apiContracts.filter(item => ['contact', 'email'].includes(item.capability)).forEach(item => addTarget(item.id));
      nodes.filter(item => item.type === 'data-model' && /contact|delivery/i.test(item.name)).forEach(item => addTarget(item.id));
    }
    if (/\b(?:upload|asset|file|image|media)\b/i.test(text)) {
      apiContracts.filter(item => item.capability === 'storage').forEach(item => addTarget(item.id));
      nodes.filter(item => item.type === 'data-model' && /asset/i.test(item.name)).forEach(item => addTarget(item.id));
    }
    const routeName = pageEntries.find(page => text.toLowerCase().includes(page.title.toLowerCase()));
    if (routeName) addTarget(routeName.id);
    const assessment = targets.length ? 'mapped-to-architecture' : 'needs-semantic-mapping';
    for (const target of targets) addEdge(edges, 'project', target, 'implements-requirement', requirement.id);
    return { requirementId: requirement.id, excerpt: requirement.text, targetNodeIds: targets, assessment };
  });

  const securityControls = buildSecurityArchitecture(capabilities);
  const securityId = addNode(nodes, { id: 'security-baseline', type: 'security-boundary', name: 'Application security baseline', status: 'acceptance-required' });
  addEdge(edges, projectId, securityId, 'enforces-security-boundaries');
  const testPlan = buildTestPlan(capabilities);
  for (const test of testPlan) {
    const testId = addNode(nodes, { id: 'test-' + slug(test.id), type: 'acceptance-test', name: test.id, status: test.status });
    addEdge(edges, projectId, testId, 'must-verify');
    for (const page of pageEntries) addEdge(edges, testId, page.id, 'verifies');
    for (const route of apiContracts) addEdge(edges, testId, route.id, 'verifies');
  }
  const graph = { nodes, edges };
  const graphCheck = validateFullStackArchitectureGraph(graph);
  const modelIdSet = new Set(models.map(model => model.id));
  const missingModelReferences = apiContracts.flatMap(route =>
    route.modelIds.filter(modelId => !modelIdSet.has(modelId)).map(modelId => ({
      routeId: route.id, modelId,
    }))
  );
  const integrity = {
    ...graphCheck,
    valid: graphCheck.valid && missingModelReferences.length === 0,
    missingModelReferences,
  };
  return {
    version: 1, engine: 'ovyx-fullstack-architecture', sourceOfTruth: 'complete-original-user-brief',
    architectureStatus: 'planned-not-provisioned', capabilities, pages: pageEntries,
    components: nodes.filter(item => item.type === 'frontend-component'), apiContracts, dataModels: models, integrations,
    crossLayerContracts: buildCrossLayerContracts(capabilities),
    security: {
      defaultPosture: 'deny-by-default', controls: securityControls,
      migrationPolicy: {
        default: 'additive-and-backward-compatible',
        destructiveChanges: 'require-explicit-owner-approval',
        productionExecution: 'never-run-without-backup-dry-run-and-rollback-plan',
        requiredSteps: ['schema-diff', 'compatibility-review', 'backup-or-restore-point', 'dry-run', 'migration', 'post-migration-integrity-check'],
      },
    },
    backgroundWork: {
      required: capabilities.backgroundWork,
      pattern: capabilities.backgroundWork ? 'transactional-outbox-or-provider-safe-queue' : 'not-required-by-detected-capabilities',
      controls: capabilities.backgroundWork ? ['idempotency-key', 'bounded-retries', 'exponential-backoff', 'dead-letter-visibility', 'manual-replay-audit'] : [],
    },
    requirementMappings, testPlan, graph, graphIntegrity: integrity,
    deployment: {
      environmentSeparation: ['development', 'preview', 'production'],
      serverSecrets: 'platform-bindings-or-encrypted-server-store-only',
      clientConfiguration: 'public-identifiers-only',
      build: 'framework-specific-install-build-and-smoke-test-required',
      status: 'not-deployed-or-not-verified',
    },
    honestyRules: [
      'A planned API contract is not an implemented endpoint.',
      'A detected package, provider name or saved connection is not proof of reachability or live delivery.',
      'Never invent a database schema, price, available slot, provider receipt, email delivery or authenticated user.',
      'No destructive migration or production side effect may run without an explicit owner-approved release action.',
    ],
  };
}

export function validateFullStackArchitectureGraph(graph) {
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph && graph.edges) ? graph.edges : [];
  const ids = new Set();
  const errors = [];
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id) {
      errors.push('Graph node is missing a stable id.');
      continue;
    }
    if (ids.has(node.id)) errors.push('Duplicate graph node id: ' + node.id);
    ids.add(node.id);
  }
  const edgeIds = new Set();
  const adjacency = new Map([...ids].map(id => [id, new Set()]));
  for (const edge of edges) {
    if (!edge || !ids.has(edge.from) || !ids.has(edge.to)) errors.push('Graph edge references a missing node.');
    if (edge && edgeIds.has(edge.id)) errors.push('Duplicate graph edge id: ' + edge.id);
    if (edge) {
      edgeIds.add(edge.id);
      if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
        adjacency.get(edge.from).add(edge.to);
        adjacency.get(edge.to).add(edge.from);
      }
    }
  }
  const root = ids.has('project') ? 'project' : '';
  if (nodes.length && !root) errors.push('Graph project root is missing.');
  const visited = new Set();
  if (root) {
    const queue = [root];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      for (const nextId of adjacency.get(id) || []) if (!visited.has(nextId)) queue.push(nextId);
    }
  }
  const unreachableNodeIds = [...ids].filter(id => !visited.has(id));
  if (unreachableNodeIds.length) errors.push('Graph contains disconnected nodes: ' + unreachableNodeIds.slice(0, 12).join(', '));
  return {
    valid: errors.length === 0,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    reachableNodeCount: visited.size,
    unreachableNodeIds,
    errors,
  };
}

export function fullStackArchitectureClientSummary(architecture) {
  if (!architecture || architecture.engine !== 'ovyx-fullstack-architecture') return null;
  return {
    version: architecture.version, architectureStatus: architecture.architectureStatus,
    capabilities: Object.entries(architecture.capabilities || {}).filter(([, enabled]) => enabled).map(([name]) => name),
    pageCount: architecture.pages.length, apiContractCount: architecture.apiContracts.length,
    dataModelCount: architecture.dataModels.length, integrationCount: architecture.integrations.length,
    securityControlCount: architecture.security.controls.length, acceptanceTestCount: architecture.testPlan.length,
    graph: architecture.graphIntegrity,
  };
}

export function fullStackArchitectureModelContract(architecture) {
  if (!architecture || architecture.engine !== 'ovyx-fullstack-architecture') return null;
  return {
    version: architecture.version,
    capabilities: architecture.capabilities,
    pages: architecture.pages.map(page => [page.id, page.title, page.route]).slice(0, 18),
    components: architecture.components.map(item => [item.id, item.name, item.purpose]).slice(0, 12),
    apiContracts: architecture.apiContracts.map(route => ({
      id: route.id, method: route.method, path: route.path, capability: route.capability,
      authPolicy: route.authPolicy, modelIds: route.modelIds, idempotency: route.idempotency,
      rateLimit: route.rateLimit, sideEffect: route.sideEffect || '',
    })).slice(0, 20),
    dataModels: architecture.dataModels.map(model => ({
      id: model.id, name: model.name, fields: model.fields, securityClass: model.securityClass,
    })).slice(0, 16),
    integrations: architecture.integrations.map(item => ({
      capability: item.capability, provider: item.provider,
      connectionMetadata: item.connectionMetadata, verification: item.verification,
      liveDeliveryOrTransaction: item.liveDeliveryOrTransaction,
    })).slice(0, 8),
    requirementTraceability: architecture.requirementMappings.map(item => [
      item.requirementId, item.targetNodeIds.slice(0, 3),
    ]),
    requirementsNeedingSemanticMapping: architecture.requirementMappings
      .filter(item => item.assessment === 'needs-semantic-mapping')
      .map(item => item.requirementId),
    dependencyEdges: architecture.graph.edges.slice(0, 72).map(edge => [edge.from, edge.relation, edge.to]),
    graphIntegrity: architecture.graphIntegrity,
    crossLayerContracts: architecture.crossLayerContracts,
    security: {
      defaultPosture: architecture.security.defaultPosture,
      controls: architecture.security.controls.map(item => [item.id, item.requirement]).slice(0, 18),
      migrationPolicy: architecture.security.migrationPolicy,
    },
    backgroundWork: architecture.backgroundWork,
    testPlan: architecture.testPlan.map(test => ({
      id: test.id, type: test.type, scope: test.scope,
      assertion: test.assertion, status: test.status,
      requiresExplicitOwnerApproval: test.requiresExplicitOwnerApproval === true,
    })).slice(0, 14),
    deployment: architecture.deployment,
    honestyRules: architecture.honestyRules,
  };
}

export function buildFullStackArchitectureInstructions(architecture) {
  if (!architecture || architecture.engine !== 'ovyx-fullstack-architecture') return '';
  return [
    'OVYX FULL-STACK ARCHITECTURE CONTRACT — ONE COHERENT APPLICATION',
    'Treat frontend pages, shared components, API routes, data models, integrations, security boundaries, background workflows and acceptance tests as one dependency graph. Implement cross-layer contracts consistently; do not generate isolated UI controls with fake handlers or endpoints without consumers.',
    JSON.stringify(architecture),
    'Build every requested capability or mark it explicitly pending when a real provider, credential, database, factual input or owner decision is missing. Keep secrets server-side, derive totals and authorization on the server, validate all inputs, and ensure all side effects are idempotent and auditable.',
    'Database changes default to additive migrations. Do not run destructive or production migrations without explicit approval, a restore point, a dry run and a rollback plan.',
    'Generate tests alongside implementation. A test file or mocked provider response is not proof of live delivery; only report evidence that actually ran.',
  ].join('\n\n');
}
