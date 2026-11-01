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

function hasPositiveIntent(source, pattern) {
  return String(source || '').split(/[\r\n.!?;]+/).some(clause => {
    const match = pattern.exec(clause);
    if (!match) return false;
    return !/\b(?:do not|don't|dont|never|avoid|exclude|without|no)\b/i.test(clause.slice(0, match.index));
  });
}

function inferCapabilities(prompt, contract) {
  const source = String(prompt || '');
  const signals = contract && contract.contactSignals || {};
  const explicitFullStack = hasPositiveIntent(source, /\b(?:full[- ]stack|backend[- ]enabled|server[- ]backed application)\b/i);
  const admin = hasPositiveIntent(source, /\b(?:admin dashboard|administrator|back office|staff dashboard|manage users|manage orders|manage bookings)\b/i);
  const commerce = signals.shoppingCart === true || signals.addToCart === true ||
    hasPositiveIntent(source, /\b(?:e-commerce|ecommerce|online store|sell products|product catalogue|product catalog|shopping cart|add to cart)\b/i);
  const payment = signals.payments === true ||
    hasPositiveIntent(source, /\b(?:payment|paystack|flutterwave|stripe|paypal|checkout|pay now|subscription billing|recurring billing)\b/i);
  const auth = signals.authentication === true || admin || subscriptions || notifications || dashboards ||
    hasPositiveIntent(source, /\b(?:member portal|sign in|sign up|login|authentication|user account|customer account|staff accounts?)\b/i);
  const authorization = admin ||
    hasPositiveIntent(source, /\b(?:user roles?|role-based access|admin access|permissions?|permission policies|tenant access|workspace roles?|staff permissions?)\b/i);
  const booking = signals.bookings === true ||
    hasPositiveIntent(source, /\b(?:appointment|reservation|booking|schedule a|availability calendar)\b/i);
  const contact = signals.contactForm === true ||
    hasPositiveIntent(source, /\b(?:contact form|enquiry form|inquiry form|lead capture|send (?:us )?a message|contact submission)\b/i);
  const forms = signals.forms === true || hasPositiveIntent(source, /\b(?:application forms?|registration forms?|feedback forms?|survey forms?|intake forms?|custom forms?|multi[- ]step forms?|form builder|form submissions?)\b/i);
  const newsletter = signals.newsletter === true ||
    hasPositiveIntent(source, /\b(?:newsletter|mailing list|email updates|subscribe for updates)\b/i);
  const subscriptions = hasPositiveIntent(source, /\b(?:subscriptions?|recurring billing|membership plans?|paid memberships?|subscription management|manage subscriptions?)\b/i) && !newsletter;
  const notifications = hasPositiveIntent(source, /\b(?:notifications?|alerts?|reminders?|order updates|booking confirmations?)\b/i);
  const dashboards = admin || hasPositiveIntent(source, /\b(?:dashboard|analytics|reports?|reporting|business metrics)\b/i);
  const integrations = hasPositiveIntent(source, /\b(?:integrations?|connect to|third[- ]party services?|external services?|sync with|webhook integrations?)\b/i);
  const automation = hasPositiveIntent(source, /\b(?:automations?|automated workflows?|workflow automation|scheduled reports?|recurring jobs?)\b/i);
  const email = signals.emailDelivery === true || newsletter ||
    hasPositiveIntent(source, /\b(?:email delivery|send\b.{0,80}\bemails?\b|emails?\b.{0,80}\b(?:send|deliver|dispatch)|email notification|transactional email)\b/i);
  const fileStorage = hasPositiveIntent(source, /\b(?:file uploads?|image uploads?|document uploads?|media library|file storage|user uploads?|user[- ]uploaded|uploaded by users|users?\s+to\s+upload)\b/i) ||
    hasPositiveIntent(source, /\b(?:upload|store)\b.{0,60}\b(?:files?|documents?|images?|media)\b/i) ||
    hasPositiveIntent(source, /\b(?:files?|documents?|images?|media)\b.{0,60}\b(?:upload|store)\b/i);
  const persistentData = explicitFullStack || signals.backendData === true || commerce || booking || auth || contact || forms || email || payment || fileStorage || subscriptions || notifications || dashboards || integrations || automation ||
    hasPositiveIntent(source, /\b(?:database|persistent data|save records|customer records|reporting dashboard)\b/i);
  const search = hasPositiveIntent(source, /\b(?:search|filter|sort|catalogue|catalog|directory|listing)\b/i);
  const backgroundWork = email || booking || payment || subscriptions || notifications || integrations || automation ||
    hasPositiveIntent(source, /\b(?:background job|scheduled task|queue|webhook|async processing|cron)\b/i);

  return {
    frontend: true,
    backend: explicitFullStack || contact || forms || booking || payment || auth || persistentData || fileStorage || admin || subscriptions || notifications || dashboards || integrations || automation || backgroundWork,
    fullStackRequested: explicitFullStack,
    database: persistentData,
    authentication: auth,
    authorization,
    payments: payment,
    commerce,
    contact,
    forms,
    email,
    newsletter,
    subscriptions,
    notifications,
    dashboards,
    integrations,
    automation,
    booking,
    fileStorage,
    admin,
    search,
    backgroundWork,
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
  if (capabilities.authentication) {
    push('UserAccount', 'Identity and account lifecycle; credentials remain with the configured auth provider.', ['id', 'providerSubject', 'email', 'emailNormalized', 'status'], 'identity');
    push('Session', 'Server-controlled session lifecycle with hashed opaque tokens, CSRF binding, expiry, rotation and revocation.', ['id', 'userId', 'tokenHash', 'csrfTokenHash', 'createdAt', 'expiresAt', 'rotatedFrom', 'revokedAt', 'lastSeenAt'], 'identity');
  }
  if (capabilities.authorization) push('RoleAssignment', 'Server-enforced workspace, resource and action permissions.', ['id', 'principalId', 'role', 'scope', 'grantedAt'], 'authorization');
  if (capabilities.contact) push('ContactSubmission', 'Validated enquiry with an auditable delivery state.', ['id', 'name', 'replyTo', 'message', 'status', 'createdAt'], 'personal-data');
  if (capabilities.forms) {
    push('FormDefinition', 'Versioned server-owned form schema and retention policy.', ['id', 'slug', 'version', 'status', 'fieldSchema', 'submitPolicy', 'retentionPolicy']);
    push('FormSubmission', 'Validated form response with schema version, idempotency and consent evidence.', ['id', 'formId', 'formVersion', 'ownerId', 'submitterRef', 'fieldValues', 'consentEvidence', 'idempotencyKey', 'status', 'createdAt'], 'personal-data');
  }
  if (capabilities.booking) {
    push('BookableResource', 'A resource, service or staff calendar whose availability can be reserved.', ['id', 'name', 'timezone', 'capacity', 'status']);
    push('Booking', 'Availability-backed reservation with timezone-aware start/end, atomic holds and idempotent lifecycle.', ['id', 'resourceId', 'customerId', 'startsAt', 'endsAt', 'timezone', 'status', 'idempotencyKey', 'holdExpiresAt', 'createdAt', 'updatedAt'], 'personal-data');
  }
  if (capabilities.commerce) {
    push('Product', 'Catalog item and purchasable offer; price and availability come from an authoritative source.', ['id', 'name', 'sku', 'priceAmount', 'currency', 'stockOnHand', 'stockReserved', 'trackInventory', 'status']);
    push('InventoryMovement', 'Auditable stock reservation, release, receipt and adjustment ledger.', ['id', 'productId', 'quantityDelta', 'reason', 'referenceType', 'referenceId', 'actorId', 'createdAt']);
    push('Cart', 'User or session cart with server-recomputed prices and inventory validation.', ['id', 'ownerId', 'sessionKeyHash', 'currency', 'updatedAt']);
    push('CartItem', 'A selected product and quantity; client prices are never authoritative.', ['id', 'cartId', 'productId', 'quantity', 'addedAt']);
    push('Order', 'Immutable order intent and fulfillment lifecycle.', ['id', 'ownerId', 'currency', 'subtotalAmount', 'taxAmount', 'totalAmount', 'status', 'createdAt'], 'financial');
    push('OrderLine', 'Immutable purchase-time snapshot of product identity, name, quantity and unit amount.', ['id', 'orderId', 'productId', 'productNameSnapshot', 'quantity', 'unitAmount', 'lineAmount', 'currency'], 'financial');
  }
  if (capabilities.payments) push('PaymentAttempt', 'Provider payment attempt linked to an order or authorized billable action.', ['id', 'orderId', ...(capabilities.subscriptions ? ['subscriptionId'] : []), 'billableReference', 'provider', 'providerReference', 'idempotencyKey', 'amount', 'currency', 'status', 'verifiedAt'], 'financial');
  if (capabilities.subscriptions) {
    push('SubscriptionPlan', 'Server-owned recurring offer with immutable price and billing interval.', ['id', 'name', 'priceAmount', 'currency', 'billingInterval', 'trialDays', 'status']);
    push('CustomerSubscription', 'Provider-reconciled customer entitlement and recurring billing lifecycle.', ['id', 'ownerId', 'planId', 'provider', 'providerCustomerRef', 'providerSubscriptionRef', 'status', 'currentPeriodStart', 'currentPeriodEnd', 'cancelAtPeriodEnd', 'trialEndAt', 'idempotencyKey', 'createdAt', 'updatedAt'], 'financial');
    push('SubscriptionInvoice', 'Immutable invoice record reconciled against a provider payment attempt.', ['id', 'subscriptionId', 'amount', 'currency', 'status', 'dueAt', 'paidAt', 'paymentAttemptId'], 'financial');
  }
  if (capabilities.notifications) push('Notification', 'Owner-scoped in-app notification with explicit read and delivery state.', ['id', 'ownerId', 'channel', 'templateKey', 'payload', 'status', 'readAt', 'sentAt', 'idempotencyKey', 'createdAt'], 'personal-data');
  if (capabilities.integrations) push('IntegrationEvent', 'Deduplicated, redacted inbound/outbound integration event ledger.', ['id', ...(capabilities.authentication ? ['ownerId'] : []), 'provider', 'externalEventId', 'eventType', 'status', 'idempotencyKey', 'receivedAt', 'processedAt', 'redactedError'], 'security-audit');
  if (capabilities.automation) push('AutomationRun', 'Auditable scheduled or event-triggered business workflow execution.', ['id', ...(capabilities.authentication ? ['ownerId'] : []), 'workflowKey', 'triggerType', 'triggerRef', 'status', 'idempotencyKey', 'attemptCount', 'startedAt', 'completedAt', 'redactedError'], 'business-data');
  if (capabilities.email) push('DeliveryRecord', 'Outbox/delivery state with retry and provider receipt; not a claim of delivery.', ['id', 'recipientRef', 'sourceType', 'sourceId', 'templateKey', 'idempotencyKey', 'status', 'attemptCount', 'nextAttemptAt', 'providerReceipt'], 'personal-data');
  if (capabilities.newsletter) push('NewsletterSubscription', 'Permission-aware subscription state with consent evidence and secure unsubscribe lifecycle.', ['id', 'listId', 'userId', 'email', 'emailNormalized', 'status', 'consentAt', 'confirmationTokenHash', 'createdAt'], 'personal-data');
  if (capabilities.fileStorage) push('StoredAsset', 'Owner-scoped metadata for quarantined objects with verified content, scan and publication lifecycle.', ['id', 'ownerId', 'storageKey', 'contentType', 'byteSize', 'checksum', 'uploadState', 'scanStatus', 'visibility', 'idempotencyKey', 'createdAt', 'updatedAt', 'deletedAt'], 'private-file');
  if (capabilities.admin) push('AuditEvent', 'Append-only record of sensitive administrative actions and actor/resource context.', ['id', 'actorId', 'action', 'resourceType', 'resourceId', 'createdAt'], 'security-audit');
  return models;
}

function buildDataIntegrityContracts(capabilities) {
  const relationships = [];
  const addRelation = (from, to, cardinality, purpose, foreignKeyField, optional = false, kind = 'foreign-key') => {
    relationships.push({
      id: 'relation-' + slug(from + '-' + to),
      from: 'model-' + slug(from),
      to: 'model-' + slug(to),
      cardinality,
      foreignKeyField,
      kind,
      purpose,
      optional,
    });
  };
  if (capabilities.authentication) addRelation('Session', 'UserAccount', 'many-to-one', 'Every session belongs to one verified provider identity and can be revoked independently.', 'userId');
  if (capabilities.authentication && capabilities.authorization) addRelation('RoleAssignment', 'UserAccount', 'many-to-one', 'Every role grant belongs to a verified principal.', 'principalId');
  if (capabilities.booking) {
    addRelation('Booking', 'BookableResource', 'many-to-one', 'A booking reserves one resource or service.', 'resourceId');
    if (capabilities.authentication) addRelation('Booking', 'UserAccount', 'many-to-one', 'The booking customer is the verified account owner.', 'customerId', true);
  }
  if (capabilities.commerce) {
    addRelation('CartItem', 'Cart', 'many-to-one', 'Each cart line belongs to one cart.', 'cartId');
    addRelation('CartItem', 'Product', 'many-to-one', 'Each cart line references an active catalog product.', 'productId');
    addRelation('OrderLine', 'Order', 'many-to-one', 'Each immutable order line belongs to one order.', 'orderId');
    addRelation('OrderLine', 'Product', 'many-to-one', 'Each order line references its catalog source and preserves a purchase-time snapshot.', 'productId');
    addRelation('InventoryMovement', 'Product', 'many-to-one', 'Every stock change is attributed to one catalog product.', 'productId');
    if (capabilities.authentication) addRelation('Order', 'UserAccount', 'many-to-one', 'The order belongs to the verified principal.', 'ownerId', true);
  }
  if (capabilities.payments && capabilities.commerce) addRelation('PaymentAttempt', 'Order', 'many-to-one', 'Payment attempts reconcile against an order.', 'orderId');
  if (capabilities.subscriptions) {
    addRelation('CustomerSubscription', 'SubscriptionPlan', 'many-to-one', 'Every subscription uses a server-owned recurring plan.', 'planId');
    addRelation('SubscriptionInvoice', 'CustomerSubscription', 'many-to-one', 'Every recurring invoice belongs to one subscription.', 'subscriptionId');
    if (capabilities.authentication) addRelation('CustomerSubscription', 'UserAccount', 'many-to-one', 'A subscription entitlement belongs to the verified account owner.', 'ownerId');
    if (capabilities.payments) {
      addRelation('PaymentAttempt', 'CustomerSubscription', 'many-to-one', 'Recurring payment attempts reconcile to their subscription.', 'subscriptionId', true);
      addRelation('SubscriptionInvoice', 'PaymentAttempt', 'many-to-one', 'An invoice is paid only by its reconciled payment attempt.', 'paymentAttemptId', true);
    }
  }
  if (capabilities.notifications && capabilities.authentication) addRelation('Notification', 'UserAccount', 'many-to-one', 'A private notification belongs to the verified account owner.', 'ownerId');
  if (capabilities.integrations && capabilities.authentication) addRelation('IntegrationEvent', 'UserAccount', 'many-to-one', 'Tenant-scoped integration event belongs to its verified application owner.', 'ownerId', true);
  if (capabilities.automation && capabilities.authentication) addRelation('AutomationRun', 'UserAccount', 'many-to-one', 'Automation execution is scoped to its verified application owner.', 'ownerId', true);
  if (capabilities.fileStorage && capabilities.authentication) addRelation('StoredAsset', 'UserAccount', 'many-to-one', 'Private assets belong to the verified owner.', 'ownerId');
  if (capabilities.admin && capabilities.authentication) addRelation('AuditEvent', 'UserAccount', 'many-to-one', 'Sensitive actions record the verified actor.', 'actorId');
  if (capabilities.email && capabilities.contact) addRelation('DeliveryRecord', 'ContactSubmission', 'many-to-one', 'Contact delivery events retain a link to the original submission.', 'sourceId', false, 'polymorphic-reference');
  if (capabilities.newsletter && capabilities.email) addRelation('DeliveryRecord', 'NewsletterSubscription', 'many-to-one', 'Subscription confirmation and unsubscribe notices retain a link to subscription state.', 'sourceId', false, 'polymorphic-reference');
  if (capabilities.newsletter && capabilities.authentication) addRelation('NewsletterSubscription', 'UserAccount', 'many-to-one', 'Account linkage is optional; public subscriptions remain possible.', 'userId', true);
  if (capabilities.forms) addRelation('FormSubmission', 'FormDefinition', 'many-to-one', 'Every submission is validated against the immutable form schema version it used.', 'formId');
  if (capabilities.forms && capabilities.authentication) addRelation('FormSubmission', 'UserAccount', 'many-to-one', 'Authenticated submitter linkage is optional; public submissions remain possible.', 'submitterRef', true);

  const constraints = [
    { id: 'owner-scope-not-null', appliesTo: 'all owner-scoped entities', rule: 'Protected records must carry a server-derived owner or tenant scope; never accept it from an untrusted client.' },
    { id: 'money-minor-units', appliesTo: 'Product, Order, OrderLine, PaymentAttempt', rule: 'Amounts are integer minor units paired with a valid ISO 4217 currency code.' },
    { id: 'no-client-authoritative-prices', appliesTo: 'CartItem, OrderLine', rule: 'Recompute price, tax, discounts and total from trusted server-side catalog and rules.' },
    { id: 'immutable-purchase-snapshot', appliesTo: 'OrderLine', rule: 'Persist product name, unit amount, currency and tax basis as a purchase-time snapshot.' },
    { id: 'idempotent-provider-event', appliesTo: 'PaymentAttempt, DeliveryRecord', rule: 'Provider event IDs and application idempotency keys are unique within their provider/tenant scope.' },
    { id: 'explicit-state-transitions', appliesTo: 'Order, PaymentAttempt, Booking, DeliveryRecord', rule: 'Reject invalid or backward state transitions except explicit audited compensation flows.' },
  ];
  if (capabilities.booking) constraints.push(
    { id: 'booking-no-overlap', appliesTo: 'Booking', rule: 'Prevent overlapping active reservations for the same resource using a transaction, exclusion constraint or provider lock.' },
    { id: 'booking-time-valid', appliesTo: 'Booking', rule: 'Require startsAt before endsAt; persist UTC instants and the user’s IANA timezone.' },
    { id: 'booking-hold-expiry', appliesTo: 'Booking', rule: 'Every temporary hold has a bounded expiry; an expiry worker releases it idempotently and expired holds never appear as confirmed availability.' },
    { id: 'booking-idempotency', appliesTo: 'Booking', rule: 'Scope a unique idempotency key to the customer or anonymous session and resource so retries cannot create duplicate reservations.' },
    { id: 'booking-duration-policy', appliesTo: 'Booking', rule: 'Validate resource-specific duration, lead time, business hours, buffers and capacity on the server before acquiring a slot.' },
    { id: 'booking-confirmation-authority', appliesTo: 'Booking', rule: 'A booking becomes confirmed only after the authoritative resource/provider confirms the reservation; pending holds remain visibly pending.' },
  );
  if (capabilities.fileStorage) constraints.push(
    { id: 'asset-publication-gate', appliesTo: 'StoredAsset', rule: 'Only scanned, policy-approved assets may become available; quarantined, rejected and deleted objects must never be served by public routes.' },
    { id: 'asset-content-integrity', appliesTo: 'StoredAsset', rule: 'Verify actual file signature, byte count and checksum server-side; client-declared MIME type and size are advisory only.' },
    { id: 'asset-deletion-consistency', appliesTo: 'StoredAsset', rule: 'Delete or tombstone metadata and object storage through an idempotent cleanup workflow; never leave a public stale object reference.' },
  );
  if (capabilities.subscriptions) constraints.push(
    { id: 'subscription-period-valid', appliesTo: 'CustomerSubscription', rule: 'Persist UTC billing period boundaries with currentPeriodStart before currentPeriodEnd; provider period values are authoritative.' },
    { id: 'subscription-entitlement-authority', appliesTo: 'CustomerSubscription', rule: 'Grant or revoke paid entitlements only after verified provider reconciliation; browser plan selection or return URLs never activate access.' },
    { id: 'subscription-idempotency', appliesTo: 'CustomerSubscription, SubscriptionInvoice, PaymentAttempt', rule: 'Deduplicate provider subscription events, invoices and renewals by provider-scoped event/reference IDs.' },
    { id: 'subscription-cancellation-policy', appliesTo: 'CustomerSubscription', rule: 'Distinguish immediate cancellation from cancel-at-period-end and retain access only until the authoritative paid-through boundary.' },
  );
  if (capabilities.notifications) constraints.push(
    { id: 'notification-owner-scope', appliesTo: 'Notification', rule: 'Derive recipient ownership from verified identity and prevent cross-account reads or read-state updates.' },
    { id: 'notification-delivery-truth', appliesTo: 'Notification, DeliveryRecord', rule: 'Keep queued, accepted, delivered, failed and read states distinct; never display delivery success without provider evidence.' },
  );
  if (capabilities.integrations) constraints.push(
    { id: 'integration-secret-isolation', appliesTo: 'IntegrationEvent', rule: 'Store credentials only in server-side secret bindings; event logs retain redacted metadata and never raw secrets or full sensitive payloads.' },
    { id: 'integration-event-idempotency', appliesTo: 'IntegrationEvent', rule: 'Verify webhook authenticity and deduplicate external event IDs within provider and tenant scope before applying side effects.' },
  );
  if (capabilities.automation) constraints.push(
    { id: 'automation-idempotency', appliesTo: 'AutomationRun', rule: 'Scheduled and event-triggered workflows require unique run keys, bounded retries, timeout limits and dead-letter visibility.' },
  );
  if (capabilities.commerce) constraints.push(
    { id: 'inventory-never-negative', appliesTo: 'Product', rule: 'Reserve and release inventory atomically; available stock is stockOnHand minus stockReserved and may never become negative.' },
    { id: 'inventory-reservation-expiry', appliesTo: 'Order', rule: 'Pending checkout stock reservations have a bounded expiry and are released idempotently after failed or expired payment.' },
  );
  if (capabilities.newsletter) constraints.push(
    { id: 'newsletter-consent-evidence', appliesTo: 'NewsletterSubscription', rule: 'Store consent source/time and confirmation status; do not activate a subscription before required confirmation.' },
    { id: 'newsletter-unsubscribe-effective', appliesTo: 'NewsletterSubscription', rule: 'Opt-out takes effect immediately and blocks future campaign delivery.' },
  );

  if (capabilities.forms) constraints.push(
    { id: 'form-schema-versioned', appliesTo: 'FormSubmission', rule: 'Validate each submission against the active server-owned schema version.' },
    { id: 'form-abuse-and-consent', appliesTo: 'FormSubmission', rule: 'Apply per-IP/per-form abuse controls, require applicable consent and never trust client owner or status fields.' },
    { id: 'form-data-minimization', appliesTo: 'FormDefinition, FormSubmission', rule: 'Collect declared fields only, redact logs and enforce retention/deletion policy.' },
  );

  if (capabilities.authentication) constraints.push(
    { id: 'session-token-hashing', appliesTo: 'Session', rule: 'Store only cryptographic hashes of opaque session and CSRF tokens; never persist raw bearer tokens.' },
    { id: 'session-expiry-and-revocation', appliesTo: 'Session', rule: 'Enforce absolute and idle expiry, rotate tokens on sensitive transitions, revoke on logout/password or identity-provider events, and reject revoked sessions immediately.' },
    { id: 'session-csrf-binding', appliesTo: 'Session', rule: 'Bind CSRF tokens to the authenticated session and require origin/CSRF validation for cookie-authenticated state-changing requests.' },
  );

  const indexes = [];
  const addIndex = (entity, fields, unique = false, purpose = '') => indexes.push({ entity, fields, unique, purpose });
  if (capabilities.authentication) {
    addIndex('UserAccount', ['providerSubject'], true, 'Resolve a verified identity uniquely.');
    addIndex('UserAccount', ['emailNormalized'], true, 'Prevent account identity ambiguity where the identity provider requires unique email.');
    addIndex('Session', ['tokenHash'], true, 'Resolve opaque session cookies without storing raw bearer tokens.');
    addIndex('Session', ['userId', 'expiresAt'], false, 'List and expire a user’s active sessions efficiently.');
    addIndex('Session', ['revokedAt', 'expiresAt'], false, 'Find expired or revoked sessions for bounded cleanup.');
  }
  if (capabilities.authorization) addIndex('RoleAssignment', ['principalId', 'role', 'scope'], true, 'Prevent duplicate role grants.');
  if (capabilities.booking) {
    addIndex('Booking', ['resourceId', 'startsAt', 'endsAt', 'status'], false, 'Find candidate overlapping reservations for an atomic conflict check.');
    addIndex('Booking', ['customerId', 'startsAt'], false, 'List a customer’s upcoming bookings.');
    addIndex('Booking', ['resourceId', 'customerId', 'idempotencyKey'], true, 'Make reservation retries idempotent within a resource and customer/session scope.');
    addIndex('Booking', ['status', 'holdExpiresAt'], false, 'Find expired temporary holds for safe release.');
  }
  if (capabilities.commerce) {
    addIndex('Product', ['sku'], true, 'Enforce unique catalog SKU within the configured catalog scope.');
    addIndex('CartItem', ['cartId', 'productId'], true, 'Avoid duplicate product lines in one cart.');
    addIndex('Order', ['ownerId', 'createdAt'], false, 'List an owner’s order history efficiently.');
    addIndex('OrderLine', ['orderId'], false, 'Load order details with bounded queries.');
    addIndex('InventoryMovement', ['productId', 'createdAt'], false, 'Audit stock movement and reconcile inventory changes.');
  }
  if (capabilities.payments) addIndex('PaymentAttempt', ['provider', 'providerReference'], true, 'Prevent duplicate provider payment references.');
  if (capabilities.subscriptions) {
    addIndex('CustomerSubscription', ['ownerId', 'status', 'currentPeriodEnd'], false, 'Resolve a customer’s current entitlement and upcoming renewal.');
    addIndex('CustomerSubscription', ['provider', 'providerSubscriptionRef'], true, 'Prevent duplicate provider subscription references.');
    addIndex('SubscriptionInvoice', ['subscriptionId', 'dueAt'], false, 'List recurring invoices in billing order.');
  }
  if (capabilities.notifications) addIndex('Notification', ['ownerId', 'createdAt'], false, 'Paginate private notifications for one verified account.');
  if (capabilities.integrations) addIndex('IntegrationEvent', ['provider', 'externalEventId'], true, 'Deduplicate inbound provider events.');
  if (capabilities.automation) addIndex('AutomationRun', ['workflowKey', 'idempotencyKey'], true, 'Prevent duplicate scheduled or event-triggered workflow runs.');
  if (capabilities.email) addIndex('DeliveryRecord', ['status', 'nextAttemptAt'], false, 'Find due outbox deliveries without scanning all records.');
  if (capabilities.newsletter) addIndex('NewsletterSubscription', ['listId', 'emailNormalized'], true, 'Prevent duplicate subscriptions to one list.');
  if (capabilities.forms) {
    addIndex('FormSubmission', ['formId', 'createdAt'], false, 'Paginate submissions for one form.');
    addIndex('FormSubmission', ['formId', 'idempotencyKey'], true, 'Prevent duplicate submission side effects for one form request.');
  }
  if (capabilities.fileStorage) addIndex('StoredAsset', ['storageKey'], true, 'Prevent storage object-key collisions.');
  if (capabilities.fileStorage) {
    addIndex('StoredAsset', ['ownerId', 'createdAt'], false, 'List a verified owner’s assets with bounded pagination.');
    addIndex('StoredAsset', ['uploadState', 'scanStatus', 'createdAt'], false, 'Find quarantined assets awaiting inspection or cleanup.');
    addIndex('StoredAsset', ['ownerId', 'idempotencyKey'], true, 'Prevent duplicate asset ingestion on retried upload intents.');
  }
  if (capabilities.admin) addIndex('AuditEvent', ['resourceType', 'resourceId', 'createdAt'], false, 'Review sensitive activity for a resource.');
  return { relationships, constraints, indexes };
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

  if (capabilities.contact) add('POST', '/api/contact-submissions', 'contact', 'public-with-abuse-controls', 'Validate and persist a contact request with an explicit receipt state; delivery is only claimed when the requested email adapter is verified.', ['model-contactsubmission'], { sideEffect: capabilities.email ? 'enqueue-delivery-after-commit' : 'persist-submission-without-claiming-delivery' });
  if (capabilities.forms) {
    add('GET', '/api/forms/:formId', 'forms', 'public-read-of-published-schema', 'Return only the published versioned schema and public metadata.', ['model-formdefinition']);
    add('POST', '/api/forms/:formId/submissions', 'forms', 'public-with-abuse-controls-and-schema-validation', 'Validate allowlisted fields against the server schema, enforce consent and rate limits, derive ownership from verified identity and persist idempotently.', ['model-formdefinition', 'model-formsubmission'], { sideEffect: capabilities.email ? 'persist-then-enqueue-notification' : 'persist-validated-submission' });
    if (capabilities.admin) add('GET', '/api/admin/forms/:formId/submissions', 'forms', 'administrator-role-and-form-scope', 'List authorized submissions with bounded pagination, field redaction and audit logging.', ['model-formsubmission']);
  }
  if (capabilities.newsletter) {
    add('POST', '/api/newsletter/subscriptions', 'newsletter', 'public-with-abuse-controls-and-consent', 'Create a pending subscription and issue an owner-configured confirmation message; never assume consent before confirmation.', ['model-newslettersubscription'], { sideEffect: 'double-opt-in-outbox' });
    add('POST', '/api/newsletter/unsubscribe', 'newsletter', 'signed-unsubscribe-token', 'Verify a scoped, expiring unsubscribe token and record the opt-out.', ['model-newslettersubscription']);
  }
  if (capabilities.booking) {
    add('GET', '/api/availability', 'booking', 'public-read-with-rate-limit', 'Return current authoritative availability for a requested resource and time window.', ['model-booking'], { cachePolicy: 'short-lived-only-if-provider-allows' });
    add('GET', '/api/bookings', 'booking', capabilities.authentication ? 'authenticated-owner-or-authorized-staff' : 'signed-scoped-booking-management-token', 'List only bookings visible to the verified customer or authorized staff member with bounded cursor pagination and redacted personal data.', ['model-booking']);
    add('POST', '/api/bookings', 'booking', 'public-with-abuse-controls', 'Recheck availability and atomically create a booking; never trust client availability.', ['model-booking'], { sideEffect: 'reserve-resource-with-conflict-check' });
    add('POST', '/api/bookings/:bookingId/cancel', 'booking', capabilities.authentication ? 'owner-or-authorized-staff' : 'signed-scoped-booking-management-token', 'Cancel an owned booking subject to provider and lifecycle rules; enforce a replay-safe idempotency key and release the slot only after the authoritative cancellation succeeds.', ['model-booking'], { sideEffect: 'idempotent-provider-cancellation-and-slot-release' });
    add('PATCH', '/api/bookings/:bookingId/reschedule', 'booking', capabilities.authentication ? 'owner-or-authorized-staff' : 'signed-scoped-booking-management-token', 'Recheck availability and atomically acquire the new slot before releasing the old slot; preserve the existing booking if the move conflicts.', ['model-booking'], { sideEffect: 'atomic-reschedule-with-compensation' });
  }
  if (capabilities.authentication) {
    add('POST', '/api/auth/registration', 'authentication', 'public-with-credential-provider-and-abuse-controls', 'Create an identity only through the configured authentication provider, enforce registration policy and consent, and require provider email verification before granting protected access.', ['model-useraccount'], { sideEffect: 'provider-managed-registration-and-verification' });
    add('POST', '/api/auth/recovery', 'authentication', 'public-with-credential-provider-and-abuse-controls', 'Start provider-managed account recovery with uniform responses that do not reveal whether an account exists.', ['model-useraccount'], { sideEffect: 'provider-managed-recovery-with-enumeration-resistance' });
    add('POST', '/api/auth/session', 'authentication', 'public-with-credential-provider', 'Create a session only after provider-backed identity verification; persist only hashed opaque session/CSRF tokens and revoke any rotated predecessor.', ['model-useraccount', 'model-session'], { sideEffect: 'rotate-session-and-csrf-state' });
    add('GET', '/api/account/profile', 'authentication', 'authenticated', 'Read the current verified principal profile; derive identity from the session, never a client UID.', ['model-useraccount']);
    add('PATCH', '/api/account/profile', 'authentication', 'authenticated-owner-only', 'Update only allowlisted profile fields for the current authenticated principal.', ['model-useraccount']);
    add('DELETE', '/api/auth/session', 'authentication', 'authenticated', 'Revoke the current session and clear session cookies.', ['model-useraccount', 'model-session']);
  }
  if (capabilities.commerce) {
    add('GET', '/api/products', 'commerce', 'public-read', 'Read catalog items from the configured authoritative source.', ['model-product'], { cachePolicy: 'source-aware' });
    add('GET', '/api/cart', 'commerce', 'session-or-authenticated', 'Read only the current session or verified owner cart with server-authoritative product and stock data.', ['model-cart', 'model-cartitem', 'model-product']);
    add('POST', '/api/cart/items', 'commerce', 'session-or-authenticated', 'Add an active product to the current cart after server-side quantity, price and inventory checks.', ['model-cart', 'model-cartitem', 'model-product'], { sideEffect: 'idempotent-cart-mutation' });
    add('PATCH', '/api/cart/items/:itemId', 'commerce', 'session-or-authenticated-owner', 'Update only an owned cart line and revalidate quantity and available stock.', ['model-cart', 'model-cartitem', 'model-product']);
    add('DELETE', '/api/cart/items/:itemId', 'commerce', 'session-or-authenticated-owner', 'Remove only an owned cart line from the active cart.', ['model-cart', 'model-cartitem']);
    add('POST', '/api/cart/quote', 'commerce', 'session-or-authenticated', 'Recalculate line items, discounts, tax and inventory on the server.', ['model-cart', 'model-cartitem', 'model-product', 'model-order']);
    add('GET', '/api/orders', 'commerce', 'authenticated-owner-or-scoped-guest-session', 'List only the current customer’s orders with bounded pagination and immutable purchase snapshots.', ['model-order', 'model-orderline']);
    add('GET', '/api/orders/:orderId', 'commerce', 'authenticated-owner-or-scoped-guest-session', 'Read an order only after owner or signed guest-session authorization.', ['model-order', 'model-orderline']);
    if (capabilities.admin) {
      add('GET', '/api/admin/orders', 'commerce', 'administrator-or-fulfillment-role', 'List orders for authorized staff with filters, pagination and audit-safe customer fields.', ['model-order', 'model-orderline']);
      add('GET', '/api/admin/inventory', 'commerce', 'administrator-or-inventory-role', 'Read authoritative stock, reservations and low-stock alerts.', ['model-product']);
      add('POST', '/api/admin/products', 'commerce', 'administrator-or-catalog-manager-role', 'Create a catalog product with server-validated integer minor-unit price, currency and stock policy.', ['model-product']);
      add('PATCH', '/api/admin/products/:productId', 'commerce', 'administrator-or-catalog-manager-role', 'Update allowlisted catalog fields without rewriting immutable order snapshots.', ['model-product']);
      add('POST', '/api/admin/inventory/adjustments', 'commerce', 'administrator-or-inventory-role', 'Apply an atomic stock adjustment with a required reason and append-only inventory movement record.', ['model-product', 'model-inventorymovement']);
      add('PATCH', '/api/admin/orders/:orderId', 'commerce', 'administrator-or-fulfillment-role', 'Apply only allowed fulfillment transitions and record an audit event.', ['model-order']);
    }
    if (!capabilities.payments) {
      add('POST', '/api/orders', 'commerce', 'session-or-verified-customer', 'Create an order intent without representing it as paid; fulfillment waits for the configured business process.', ['model-cart', 'model-cartitem', 'model-order', 'model-orderline'], { sideEffect: 'order-intent-only' });
    }
    if (capabilities.payments) {
      add('POST', '/api/checkout', 'payments', 'session-or-authenticated', 'Create provider checkout from a server-calculated order; never accept client totals.', ['model-cart', 'model-cartitem', 'model-order', 'model-orderline', 'model-paymentattempt'], { sideEffect: 'provider-checkout-with-idempotency' });
    }
  }
  if (capabilities.subscriptions) {
    add('GET', '/api/subscription-plans', 'subscriptions', 'public-read-of-active-plans', 'Return only active server-owned plans with fixed currency and billing intervals.', ['model-subscriptionplan']);
    add('GET', '/api/subscriptions', 'subscriptions', 'authenticated-owner-or-authorized-billing-staff', 'List only subscriptions visible to the verified owner or billing staff.', ['model-customersubscription', 'model-subscriptionplan']);
    add('GET', '/api/subscriptions/:subscriptionId/invoices', 'subscriptions', 'authenticated-owner-or-billing-staff', 'List immutable invoices only for an owned or authorized subscription.', ['model-customersubscription', 'model-subscriptioninvoice']);
    add('POST', '/api/subscriptions/:subscriptionId/portal', 'subscriptions', 'authenticated-owner-only', 'Create a short-lived provider billing-portal session for the verified subscription owner.', ['model-customersubscription'], { sideEffect: 'provider-billing-portal-session' });
    if (capabilities.payments) add('POST', '/api/subscriptions/checkout', 'subscriptions', 'authenticated-owner-only', 'Create recurring provider checkout from a server-owned plan; never accept client price, currency or entitlement state.', ['model-customersubscription', 'model-subscriptionplan', 'model-subscriptioninvoice', 'model-paymentattempt'], { sideEffect: 'provider-subscription-checkout-with-idempotency' });
    else add('POST', '/api/subscriptions', 'subscriptions', 'authenticated-owner-only', 'Create a free membership only when the selected server-owned plan has zero price.', ['model-customersubscription', 'model-subscriptionplan']);
    add('POST', '/api/subscriptions/:subscriptionId/cancel', 'subscriptions', 'authenticated-owner-or-billing-staff', 'Request immediate or period-end cancellation through the authoritative provider and reconcile the effective end date.', ['model-customersubscription'], { sideEffect: 'provider-cancellation-with-idempotency' });
    add('POST', '/api/subscriptions/:subscriptionId/resume', 'subscriptions', 'authenticated-owner-or-billing-staff', 'Resume only a provider-supported subscription before its paid-through period ends.', ['model-customersubscription'], { sideEffect: 'provider-resume-with-idempotency' });
  }
  if (capabilities.notifications) {
    add('GET', '/api/notifications', 'notifications', 'authenticated-owner-only', 'List the current owner’s notifications with unread counts and bounded pagination.', ['model-notification']);
    add('POST', '/api/notifications/:notificationId/read', 'notifications', 'authenticated-owner-only', 'Mark only an owned notification as read; repeated requests are idempotent.', ['model-notification']);
    add('POST', '/api/notifications/read-all', 'notifications', 'authenticated-owner-only', 'Mark the current owner’s visible notifications as read without affecting other accounts.', ['model-notification']);
  }
  if (capabilities.dashboards) {
    const enabledDashboardModels = { 'model-useraccount': capabilities.authentication, 'model-product': capabilities.commerce, 'model-order': capabilities.commerce, 'model-orderline': capabilities.commerce, 'model-booking': capabilities.booking, 'model-customersubscription': capabilities.subscriptions, 'model-paymentattempt': capabilities.payments, 'model-notification': capabilities.notifications };
    const dashboardModels = Object.keys(enabledDashboardModels).filter(id => enabledDashboardModels[id] === true);
    add('GET', '/api/dashboard/summary', 'dashboards', 'authenticated-owner-or-authorized-staff', 'Return tenant-scoped business KPIs derived from persisted records with an explicit reporting timezone and bounded date range.', dashboardModels);
    add('GET', '/api/dashboard/activity', 'dashboards', 'authenticated-owner-or-authorized-staff', 'Return a paginated, redacted activity feed from authorized business events.', dashboardModels);
    if (capabilities.admin) add('GET', '/api/admin/dashboard/metrics', 'dashboards', 'administrator-role-and-tenant-scope', 'Return aggregate business metrics without exposing cross-tenant personal or financial records.', dashboardModels);
  }
  if (capabilities.integrations) {
    if (capabilities.admin) {
      add('GET', '/api/admin/integrations/health', 'integrations', 'administrator-role-and-tenant-scope', 'Return configured, reachable and last-verified integration health without exposing credentials.', ['model-integrationevent']);
      add('POST', '/api/admin/integrations/:provider/connect', 'integrations', 'administrator-role-and-tenant-scope', 'Start a provider-approved OAuth or credential setup handshake without returning secrets to the browser.', ['model-integrationevent']);
      add('DELETE', '/api/admin/integrations/:provider', 'integrations', 'administrator-role-and-tenant-scope', 'Revoke or disconnect the selected integration and audit the action without exposing stored credentials.', ['model-integrationevent']);
    }
    add('POST', '/api/webhooks/:provider', 'integrations', 'provider-signature-timestamp-and-replay-protected', 'Verify provider-specific webhook authenticity and deduplicate event IDs before applying scoped business changes.', ['model-integrationevent'], { sideEffect: 'verified-idempotent-integration-event' });
  }
  if (capabilities.automation && capabilities.admin) add('GET', '/api/admin/automation/runs', 'automation', 'administrator-role-and-tenant-scope', 'Inspect scheduled and event-triggered workflow runs, retries and dead letters with redacted errors.', ['model-automationrun']);
  if (capabilities.payments) {
    if (!capabilities.commerce && !capabilities.subscriptions) add('POST', '/api/payments/intents', 'payments', 'verified-customer-or-server-authorized-billable-reference', 'Create a payment intent for a server-authorized invoice or billable action; amount and currency are server-derived.', ['model-paymentattempt'], { sideEffect: 'provider-payment-intent-with-idempotency' });
    add('POST', '/api/webhooks/payments', 'payments', 'provider-signature-and-replay-protected', 'Verify webhook signature, timestamp and event identity before idempotent reconciliation.', ['model-paymentattempt', ...(capabilities.commerce ? ['model-order'] : [])], { sideEffect: 'idempotent-payment-reconciliation', csrf: 'provider signature required' });
  }
  if (capabilities.fileStorage) {
    add('GET', '/api/assets', 'storage', capabilities.authentication ? 'authenticated-owner-scoped' : 'signed-scoped-upload-session', 'List only the current owner’s assets with bounded pagination and exclude quarantined or rejected objects from public results.', ['model-storedasset']);
    add('POST', '/api/assets', 'storage',
      capabilities.authentication ? 'authenticated-owner-scoped' : 'public-with-abuse-controls-and-quarantine',
      'Authorize upload intent, enforce MIME/size/quota, and keep unauthenticated uploads quarantined until an explicit owner/publication policy allows access.',
      ['model-storedasset'], { sideEffect: 'signed-upload-or-server-mediated-upload' });
    add('GET', '/api/assets/:assetId', 'storage',
      capabilities.authentication ? 'authenticated-owner-or-explicit-public-policy' : 'public-only-for-explicitly-published-assets',
      'Resolve an asset only after ownership/publication checks; never expose quarantined or private objects by identifier alone.',
      ['model-storedasset']);
    add('DELETE', '/api/assets/:assetId', 'storage', capabilities.authentication ? 'authenticated-owner-only' : 'signed-scoped-upload-session', 'Tombstone the owner-authorized asset and enqueue idempotent object deletion; never trust a client storage key.', ['model-storedasset'], { sideEffect: 'idempotent-object-cleanup' });
  }
  if (capabilities.admin) add('GET', '/api/admin/audit-events', 'administration', 'administrator-role-and-resource-scope', 'Read authorized audit history with pagination and sensitive-field redaction.', ['model-auditevent']);
  return routes;
}

function buildIntegrationContracts(capabilities, context) {
  const requests = [
    ['payments', capabilities.payments], ['database', capabilities.database],
    ['authentication', capabilities.authentication], ['email', capabilities.email],
    ['booking', capabilities.booking], ['storage', capabilities.fileStorage],
    ['subscriptions', capabilities.subscriptions], ['notifications', capabilities.notifications],
    ['integrations', capabilities.integrations], ['automation', capabilities.automation],
  ].filter(([, requested]) => requested);
  const roots = [context && context.connections, context && context.activeConnections,
    context && context.integrations, context && context.connectionStatus, context && context.connectedServices];
  const flatten = (value, depth = 0) => {
    if (depth > 5) return [];
    if (Array.isArray(value)) return value.slice(0, 50).flatMap(item => flatten(item, depth + 1));
    if (!value || typeof value !== 'object') return [];
    return [value, ...Object.values(value).slice(0, 50).flatMap(item => flatten(item, depth + 1))];
  };
  const connectionRecords = flatten(roots);
  const patterns = {
    payments: /payment|paystack|flutterwave|stripe|paypal/i, database: /database|firestore|firebase|d1|postgres|mysql|supabase/i,
    authentication: /auth|identity|firebase|supabase|clerk/i, email: /email|mail|resend|sendgrid|postmark|smtp/i,
    booking: /booking|reservation|calendar|scheduling/i, storage: /storage|r2|firebase|s3|supabase/i,
    subscriptions: /subscription|recurring|membership|billing/i, notifications: /notification|push|alert|messaging/i,
    integrations: /integration|webhook|api|external|third.party/i, automation: /automation|workflow|scheduler|cron/i,
  };
  return requests.map(([capability]) => {
    const matchingConnections = connectionRecords.filter(item => {
      if (!item || typeof item !== 'object') return false;
      const identity = clean(item.provider || item.name || item.id || item.type || item.service, 120);
      return (item.connected === true || item.status === 'connected' || item.state === 'connected' || item.isConnected === true) &&
        patterns[capability].test(identity);
    });
    const connectedInContext = matchingConnections.length > 0;
    const providerIdentity = matchingConnections.length
      ? clean(matchingConnections[0].provider || matchingConnections[0].name || matchingConnections[0].id || matchingConnections[0].type || matchingConnections[0].service, 120)
      : 'not-selected-by-architecture-planner';
    return {
      capability, required: true, provider: providerIdentity,
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
  if (capabilities.subscriptions) controls.push(['subscription-entitlement-integrity', 'Grant paid access only from verified provider lifecycle events; reconcile renewals, grace periods, cancellations, refunds and chargebacks against server-owned plan rules.']);
  if (capabilities.notifications) controls.push(['notification-privacy', 'Authorize every notification read/update by recipient ownership; redact payloads and separate queued, delivered and read states.']);
  if (capabilities.integrations) controls.push(['integration-boundary', 'Validate webhook signatures, scope credentials by tenant/environment, prevent SSRF and replay, and redact provider payloads and secrets.']);
  if (capabilities.automation) controls.push(['automation-safety', 'Use scoped service identities, idempotent run keys, bounded execution time, retry budgets and human approval for high-impact actions.']);
  if (capabilities.booking) controls.push(['booking-integrity', 'Recheck authoritative availability at commit time and prevent overlapping reservations transactionally or through provider locking.']);
  if (capabilities.forms) controls.push(['form-submission-integrity', 'Use versioned server-owned schemas, abuse throttles, idempotency, applicable consent, personal-data redaction and retention/deletion controls.']);
  if (capabilities.fileStorage) controls.push(['upload-isolation', 'Validate MIME by content, enforce per-file/project limits, randomize storage keys and scan files before public distribution.']);
  return controls.map(([id, requirement]) => ({ id, requirement, mandatory: true, status: 'acceptance-required' }));
}

function buildTestPlan(capabilities) {
  const tests = [
    { id: 'architecture-contract', type: 'contract', scope: 'all layers', assertion: 'Every requirement maps to relevant nodes or is explicitly not-assessable.' },
    { id: 'business-state-transitions', type: 'contract-and-integration', scope: 'domain workflows', assertion: 'Only declared transitions execute; each transition’s authority, side effects, idempotency and audit requirements are enforced.' },
    { id: 'route-contract', type: 'contract', scope: 'backend API', assertion: 'HTTP methods, auth policy, validation, errors and idempotency match each route contract.' },
    { id: 'data-integrity', type: 'integration', scope: 'database', assertion: 'Constraints, indexes, ownership and transaction boundaries hold against the selected database.' },
    { id: 'browser-journeys', type: 'browser-e2e', scope: 'frontend and backend', assertion: 'Every requested journey runs from UI action through API and persisted/result state.' },
    { id: 'authorization-boundaries', type: 'security', scope: 'identity and APIs', assertion: 'Anonymous, wrong-role and cross-owner access are denied without data leakage.' },
    { id: 'failure-recovery', type: 'resilience', scope: 'all layers', assertion: 'Timeouts, retries, duplicate requests, partial failures and cancellation recover without duplicate side effects.' },
    { id: 'deployment-smoke', type: 'deployment', scope: 'deployed project', assertion: 'Production build, health endpoints, routes, assets, secrets and critical journeys work in target environment.' },
  ];
  if (capabilities.payments) tests.push({ id: 'payment-sandbox', type: 'external-sandbox', scope: 'payments', assertion: 'Sandbox checkout, signature verification, webhook replay, reconciliation and fulfillment pass without real charges.', requiresExplicitOwnerApproval: true });
  if (capabilities.forms) tests.push({ id: 'form-schema-validation', type: 'contract-and-security', scope: 'forms', assertion: 'Unknown fields, stale schemas, missing required values, forged owner/status fields, duplicate requests and abuse thresholds are handled safely.' });
  if (capabilities.email) tests.push({ id: 'delivery-receipt', type: 'external-sandbox', scope: 'email', assertion: 'Controlled QA message is accepted and provider delivery receipt is reconciled.', requiresExplicitOwnerApproval: true });
  if (capabilities.booking) tests.push({ id: 'booking-conflicts', type: 'integration', scope: 'booking', assertion: 'Concurrent reservations cannot claim the same unavailable slot.' });
  if (capabilities.commerce) tests.push({ id: 'commerce-journey', type: 'browser-and-integration', scope: 'catalog-cart-order-inventory', assertion: 'A customer can browse, mutate a persistent cart, receive a server-calculated quote, complete the configured checkout path and see an owner-scoped order; stock reservation and release remain correct under retries and concurrency.' });
  if (capabilities.subscriptions) tests.push({ id: 'subscription-lifecycle', type: 'integration-and-security', scope: 'subscriptions', assertion: 'Plan checkout, activation, renewal, failed payment, grace period, cancellation, resume, refund and entitlement changes reconcile only from authoritative provider events.', requiresExplicitOwnerApproval: true });
  if (capabilities.notifications) tests.push({ id: 'notification-journey', type: 'browser-and-integration', scope: 'notifications', assertion: 'Owner-scoped notifications are created from committed business events, can be read idempotently and distinguish queued, accepted, delivered and read states.' });
  if (capabilities.dashboards) tests.push({ id: 'dashboard-data-integrity', type: 'browser-and-integration', scope: 'dashboards', assertion: 'Dashboard KPIs match tenant-scoped persisted source records, respect role permissions, timezone and date filters, and do not leak other tenants’ data.' });
  if (capabilities.integrations) tests.push({ id: 'integration-contracts', type: 'sandbox-and-security', scope: 'integrations', assertion: 'Each requested adapter validates configuration, authenticates webhook events, handles timeout/rate-limit/retry/replay cases and records redacted health evidence.', requiresExplicitOwnerApproval: true });
  if (capabilities.automation) tests.push({ id: 'automation-recovery', type: 'integration', scope: 'automation', assertion: 'Scheduled/event-triggered jobs are idempotent, bounded, observable and recover through retry and dead-letter handling.' });
  return tests.map(test => ({ ...test, status: 'planned-not-executed', evidence: null }));
}

function buildWorkflowStateMachines(capabilities) {
  const machines = [];
  const add = (name, entity, initialState, states, transitions, invariant) => machines.push({
    id: 'workflow-' + slug(name),
    name,
    entity,
    initialState,
    states,
    transitions: transitions.map(([from, to, authority, sideEffect = 'none']) => ({
      from, to, authority, sideEffect,
      requiresAudit: sideEffect !== 'none',
    })),
    invariant,
    executionState: 'contract-only-not-executed',
  });
  if (capabilities.commerce) add(
    'Order lifecycle', 'Order', 'draft',
    ['draft', 'pending_payment', 'paid', 'processing', 'fulfilled', 'payment_failed', 'cancelled', 'refund_pending', 'refunded'],
    [
      ['draft', 'pending_payment', 'server-calculated order validation', 'create-checkout-session'],
      ['draft', 'processing', 'authorized offline/manual settlement policy', 'reserve-stock'],
      ['pending_payment', 'paid', 'verified payment provider event only', 'commit-order-payment'],
      ['pending_payment', 'payment_failed', 'verified provider failure or terminal timeout', 'release-reservation'],
      ['pending_payment', 'cancelled', 'owner or customer policy with no captured payment', 'release-reservation'],
      ['paid', 'processing', 'server fulfillment policy', 'enqueue-fulfillment'],
      ['processing', 'fulfilled', 'verified fulfillment completion', 'notify-customer'],
      ['paid', 'refund_pending', 'authorized refund request', 'request-provider-refund'],
      ['processing', 'refund_pending', 'authorized compensation policy', 'request-provider-refund'],
      ['refund_pending', 'refunded', 'verified provider refund event', 'reconcile-refund'],
    ],
    'Never mark an order paid from browser input, never fulfill a failed/pending payment, and never transition backwards without an explicit audited compensation.'
  );
  if (capabilities.payments) add(
    'Payment attempt lifecycle', 'PaymentAttempt', 'created',
    ['created', 'pending', 'succeeded', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded'],
    [
      ['created', 'pending', 'server provider adapter', 'create-provider-attempt'],
      ['pending', 'succeeded', 'verified signed provider event or authoritative server verification', 'reconcile-payment'],
      ['pending', 'failed', 'verified provider failure', 'release-payment-reservation'],
      ['pending', 'expired', 'provider or server timeout policy after reconciliation', 'release-payment-reservation'],
      ['pending', 'cancelled', 'authorized customer or owner cancellation confirmed by provider', 'cancel-provider-attempt'],
      ['succeeded', 'partially_refunded', 'verified partial refund event', 'reconcile-partial-refund'],
      ['succeeded', 'refunded', 'verified full refund event', 'reconcile-refund'],
      ['partially_refunded', 'refunded', 'verified remaining refund event', 'reconcile-refund'],
    ],
    'Provider event IDs, references and idempotency keys must be deduplicated; amount and currency must match the server-authorized billable record.'
  );
  if (capabilities.subscriptions) add(
    'Customer subscription lifecycle', 'CustomerSubscription', 'incomplete',
    ['incomplete', 'trialing', 'active', 'past_due', 'paused', 'cancel_at_period_end', 'canceled', 'expired', 'refunded', 'suspended'],
    [
      ['incomplete', 'trialing', 'verified provider trial creation', 'grant-trial-entitlement'],
      ['incomplete', 'active', 'verified provider subscription and first payment', 'grant-paid-entitlement'],
      ['trialing', 'active', 'verified first successful recurring payment', 'convert-trial-entitlement'],
      ['active', 'past_due', 'verified renewal failure', 'apply-configured-grace-policy'],
      ['past_due', 'active', 'verified recovered renewal payment', 'restore-paid-entitlement'],
      ['active', 'cancel_at_period_end', 'verified provider cancellation schedule', 'retain-access-until-paid-through'],
      ['cancel_at_period_end', 'canceled', 'authoritative paid-through expiry', 'revoke-paid-entitlement'],
      ['active', 'canceled', 'verified immediate provider cancellation', 'revoke-paid-entitlement'],
      ['active', 'refunded', 'verified provider refund or chargeback', 'reconcile-entitlement-revocation'],
      ['past_due', 'expired', 'grace period elapsed and provider reconciled', 'revoke-paid-entitlement'],
    ],
    'Never activate paid access from a browser redirect; derive access from verified provider state and the server-owned billing period. Cancellation timing and grace periods must be explicit and provider-reconciled.'
  );
  if (capabilities.notifications) add(
    'Notification lifecycle', 'Notification', 'queued',
    ['queued', 'sending', 'accepted', 'delivered', 'read', 'failed', 'suppressed'],
    [
      ['queued', 'sending', 'idempotent worker claim after business transaction commit', 'claim-notification'],
      ['sending', 'accepted', 'provider accepted the delivery request', 'record-provider-acceptance'],
      ['accepted', 'delivered', 'provider delivery receipt or trusted channel acknowledgement', 'record-delivery-receipt'],
      ['delivered', 'read', 'verified recipient read action', 'record-read-state'],
      ['sending', 'failed', 'permanent provider failure or retry budget exhausted', 'record-delivery-failure'],
      ['queued', 'suppressed', 'consent or recipient suppression policy', 'record-suppression'],
    ],
    'In-app read state is distinct from external delivery; never claim push/email delivery from queue acceptance alone.'
  );
  if (capabilities.integrations) add(
    'Integration event lifecycle', 'IntegrationEvent', 'received',
    ['received', 'verified', 'processing', 'processed', 'retrying', 'dead_letter', 'rejected'],
    [
      ['received', 'verified', 'provider-specific signature and timestamp validation', 'record-authentic-event'],
      ['verified', 'processing', 'unique event claim and tenant scope validation', 'claim-event'],
      ['processing', 'processed', 'business side effect committed', 'record-event-result'],
      ['processing', 'retrying', 'transient failure within bounded retry budget', 'schedule-retry'],
      ['retrying', 'processing', 'backoff elapsed and idempotent retry claim', 'retry-event'],
      ['retrying', 'dead_letter', 'retry budget exhausted', 'surface-dead-letter'],
      ['received', 'rejected', 'invalid signature, replay or unsupported event', 'record-safe-rejection'],
    ],
    'Unverified or replayed provider events must never trigger business mutations; retain redacted evidence for reconciliation.'
  );
  if (capabilities.automation) add(
    'Automation run lifecycle', 'AutomationRun', 'queued',
    ['queued', 'running', 'succeeded', 'retrying', 'failed', 'canceled', 'dead_letter'],
    [
      ['queued', 'running', 'scoped worker claims unique run key', 'claim-run'],
      ['running', 'succeeded', 'all declared steps commit successfully', 'record-completion'],
      ['running', 'retrying', 'retryable failure within policy', 'schedule-retry'],
      ['retrying', 'running', 'backoff elapsed and idempotent claim', 'retry-run'],
      ['retrying', 'dead_letter', 'retry budget exhausted', 'surface-dead-letter'],
      ['queued', 'canceled', 'authorized owner cancels before execution', 'cancel-run'],
    ],
    'Automation runs must be tenant-scoped, time-bounded, idempotent and unable to perform high-impact actions without the declared approval policy.'
  );
  if (capabilities.booking) add(
    'Booking lifecycle', 'Booking', 'requested',
    ['requested', 'pending_confirmation', 'confirmed', 'rejected', 'completed', 'cancelled', 'no_show', 'expired'],
    [
      ['requested', 'pending_confirmation', 'server availability recheck and atomic hold', 'hold-resource-slot'],
      ['pending_confirmation', 'confirmed', 'authoritative provider or owner confirmation', 'confirm-resource-slot'],
      ['pending_confirmation', 'rejected', 'availability conflict or provider rejection', 'release-resource-slot'],
      ['pending_confirmation', 'expired', 'hold expiry worker after authoritative time check', 'release-expired-resource-slot'],
      ['confirmed', 'completed', 'verified service completion', 'close-booking'],
      ['confirmed', 'cancelled', 'authorized cancellation under policy', 'release-resource-slot'],
      ['confirmed', 'no_show', 'authorized staff action after scheduled time', 'record-no-show'],
    ],
    'No two active bookings may occupy the same exclusive resource/time slot; never show confirmed before the authoritative reservation succeeds.'
  );
  if (capabilities.forms) add(
    'Form submission lifecycle', 'FormSubmission', 'received',
    ['received', 'accepted', 'quarantined', 'rejected', 'archived'],
    [
      ['received', 'accepted', 'server schema, consent and abuse checks pass', 'persist-validated-submission'],
      ['received', 'quarantined', 'abuse or moderation policy requires review', 'quarantine-submission'],
      ['received', 'rejected', 'schema validation or consent requirements fail', 'record-safe-validation-failure'],
      ['quarantined', 'accepted', 'authorized owner/staff moderation decision', 'audit-moderation-decision'],
      ['accepted', 'archived', 'retention policy or authorized archive action', 'apply-retention-policy'],
    ],
    'Only allowlisted fields from the active server-owned schema may be stored; rejected or quarantined submissions never trigger business side effects.'
  );
  if (capabilities.contact) add(
    'Contact submission delivery', 'ContactSubmission', 'received',
    ['received', 'queued', 'sending', 'delivered', 'failed', 'closed'],
    [
      ['received', 'queued', 'email service configured and submission accepted', 'enqueue-delivery'],
      ['queued', 'sending', 'worker claims the idempotent outbox item', 'claim-delivery'],
      ['sending', 'delivered', 'provider receipt reconciled', 'record-provider-receipt'],
      ['sending', 'failed', 'retry budget exhausted or permanent provider failure', 'record-delivery-failure'],
      ['failed', 'queued', 'authorized retry after correction', 'retry-delivery'],
      ['received', 'closed', 'owner-defined retention/triage policy', 'audit-close'],
    ],
    'A stored submission is not a delivered message; show pending, unavailable or failed states until a real provider receipt is reconciled.'
  );
  if (capabilities.newsletter) add(
    'Newsletter consent lifecycle', 'NewsletterSubscription', 'pending_confirmation',
    ['pending_confirmation', 'subscribed', 'unsubscribed', 'expired', 'suppressed'],
    [
      ['pending_confirmation', 'subscribed', 'confirmed opt-in through valid scoped token', 'record-consent-confirmation'],
      ['pending_confirmation', 'expired', 'confirmation token expires', 'expire-token'],
      ['subscribed', 'unsubscribed', 'valid signed unsubscribe request or verified owner request', 'suppress-campaign-delivery'],
      ['subscribed', 'suppressed', 'complaint, hard bounce or legal suppression signal', 'suppress-campaign-delivery'],
    ],
    'Do not send campaigns before confirmed consent; honor unsubscribe immediately and keep a minimal suppression record.'
  );
  if (capabilities.fileStorage) add(
    'Asset ingestion lifecycle', 'StoredAsset', 'upload_pending',
    ['upload_pending', 'quarantined', 'available', 'rejected', 'deleted'],
    [
      ['upload_pending', 'quarantined', 'upload completed with checksum and ownership validation', 'quarantine-object'],
      ['quarantined', 'available', 'content inspection and policy checks pass', 'publish-private-object'],
      ['quarantined', 'rejected', 'content inspection, malware or policy checks fail', 'delete-or-isolate-object'],
      ['available', 'deleted', 'owner-authorized deletion and retention policy', 'delete-object-and-metadata'],
    ],
    'Do not expose a file before content, size, ownership and publication-policy checks pass. Every upload intent is idempotent; verify content signature, exact byte count and checksum, scan or inspect before publication, serve through an owner/publication authorization check, and clean up abandoned multipart uploads and deleted objects.'
  );
  if (capabilities.email && !capabilities.contact) add(
    'Provider delivery lifecycle', 'DeliveryRecord', 'queued',
    ['queued', 'sending', 'delivered', 'failed', 'suppressed'],
    [
      ['queued', 'sending', 'worker claims the idempotent outbox item', 'claim-delivery'],
      ['sending', 'delivered', 'provider receipt reconciled', 'record-provider-receipt'],
      ['sending', 'failed', 'retry budget exhausted or permanent provider failure', 'record-delivery-failure'],
      ['queued', 'suppressed', 'recipient consent or suppression policy blocks delivery', 'record-suppression'],
    ],
    'Never equate accepted-for-send with delivered; respect opt-outs and provider suppression.'
  );
  return machines;
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
  const dataIntegrity = buildDataIntegrityContracts(capabilities);
  const apiContracts = buildApiContracts(capabilities);
  const stateMachines = buildWorkflowStateMachines(capabilities);
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
  if (capabilities.forms) featureComponents.forms = addComponent('Dynamic form experience', 'Versioned schema-driven fields, server validation, consent evidence, abuse protection and explicit submission states.');
  if (capabilities.newsletter) featureComponents.newsletter = addComponent('Newsletter signup', 'Consent-aware double opt-in, confirmation, unsubscribe and delivery status.');
  if (capabilities.booking) featureComponents.booking = addComponent('Booking experience', 'Timezone-aware selection, authoritative availability and explicit pending/confirmed states.');
  if (capabilities.commerce) featureComponents.commerce = addComponent('Commerce experience', 'Catalog, persistent cart, server-calculated checkout, stock reservations, customer orders and staff fulfillment.');
  if (capabilities.subscriptions) featureComponents.subscriptions = addComponent('Subscription management', 'Server-owned plans, recurring checkout, invoices, renewal state, cancellation/resume and entitlement-aware account access.');
  if (capabilities.notifications) featureComponents.notifications = addComponent('Notification center', 'Owner-scoped in-app notifications, unread state, delivery receipts and retry/error feedback.');
  if (capabilities.dashboards) featureComponents.dashboards = addComponent('Business dashboards', 'Live tenant-scoped KPIs, date/timezone filters, paginated activity and role-safe reporting.');
  if (capabilities.integrations) featureComponents.integrations = addComponent('Integration settings and status', 'Server-side adapters, safe connection health, webhook state and honest configured/reachable/verified indicators.');
  if (capabilities.automation) featureComponents.automation = addComponent('Business automation', 'Scheduled and event-triggered workflows with approval gates, bounded retries and execution history.');
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
  for (const relationship of dataIntegrity.relationships) {
    if (modelIds.includes(relationship.from) && modelIds.includes(relationship.to)) {
      addEdge(edges, relationship.from, relationship.to, 'relates-to');
    }
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
    if (capabilities.email && (
      ['contact', 'forms', 'newsletter', 'subscriptions', 'notifications'].includes(route.capability) ||
      route.sideEffect === 'idempotent-payment-reconciliation' ||
      route.sideEffect === 'order-intent-only' ||
      route.sideEffect === 'provider-subscription-checkout-with-idempotency'
    )) {
      const emailIntegration = integrationIds.find(id => id === 'integration-email');
      if (emailIntegration) addEdge(edges, route.id, emailIntegration, 'queues-delivery-through-server-adapter');
    }
  }
  for (const page of pageEntries) {
    const title = page.title;
    const pageCapabilityMatchers = {
      contact: /contact|enquir|inquir/i,
      forms: /form|application|registration|feedback|survey|intake/i,
      newsletter: /newsletter|subscribe|updates/i,
      booking: /book|reserv|appointment/i,
      commerce: /shop|product|catalog|cart|checkout|order/i,
      payments: /shop|product|catalog|cart|checkout|order|billing/i,
      authentication: /login|sign|account|dashboard|profile/i,
      administration: /admin|dashboard|manage/i,
      subscriptions: /subscription|membership|billing|pricing|account/i,
      notifications: /notification|inbox|activity|account/i,
      dashboards: /dashboard|analytics|report|overview/i,
      integrations: /integration|connection|webhook|settings/i,
      automation: /automation|workflow|activity|admin/i,
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
    for (const route of apiContracts.filter(item => ['contact', 'forms', 'newsletter', 'payments', 'booking', 'subscriptions', 'notifications', 'integrations', 'automation'].includes(item.capability))) addEdge(edges, route.id, queueId, 'enqueues-after-commit');
  }
  const workflowNodeIds = [];
  for (const machine of stateMachines) {
    const nodeId = addNode(nodes, {
      id: machine.id, type: 'business-workflow', name: machine.name,
      entity: machine.entity, initialState: machine.initialState,
      status: machine.executionState,
    });
    workflowNodeIds.push(nodeId);
    addEdge(edges, projectId, nodeId, 'owns-state-machine');
    const relevantRoutes = apiContracts.filter(route => {
      const path = route.path.toLowerCase();
      if (machine.entity === 'Order') return route.capability === 'commerce' || path.includes('checkout') || path.includes('/orders');
      if (machine.entity === 'CustomerSubscription') return route.capability === 'subscriptions' || path.includes('subscriptions');
      if (machine.entity === 'Notification') return route.capability === 'notifications' || path.includes('notifications');
      if (machine.entity === 'IntegrationEvent') return route.capability === 'integrations' || path.includes('webhooks');
      if (machine.entity === 'AutomationRun') return route.capability === 'automation' || path.includes('automation');
      if (machine.entity === 'PaymentAttempt') return route.capability === 'payments';
      if (machine.entity === 'Booking') return route.capability === 'booking';
      if (machine.entity === 'ContactSubmission') return route.capability === 'contact';
      if (machine.entity === 'FormSubmission') return route.capability === 'forms';
      if (machine.entity === 'NewsletterSubscription') return route.capability === 'newsletter';
      if (machine.entity === 'StoredAsset') return route.capability === 'storage';
      if (machine.entity === 'DeliveryRecord') return route.capability === 'email';
      return false;
    });
    for (const route of relevantRoutes) addEdge(edges, route.id, nodeId, 'enforces-state-machine');
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
      apiContracts.filter(item => ['contact', 'forms', 'email'].includes(item.capability)).forEach(item => addTarget(item.id));
      nodes.filter(item => item.type === 'data-model' && /contact|form|delivery/i.test(item.name)).forEach(item => addTarget(item.id));
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
  const missingRelationshipReferences = dataIntegrity.relationships.filter(relationship =>
    !modelIdSet.has(relationship.from) || !modelIdSet.has(relationship.to)
  );
  const integrity = {
    ...graphCheck,
    valid: graphCheck.valid && missingModelReferences.length === 0 && missingRelationshipReferences.length === 0,
    missingModelReferences,
    missingRelationshipReferences,
  };
  return {
    version: 1, engine: 'ovyx-fullstack-architecture', sourceOfTruth: 'complete-original-user-brief',
    architectureStatus: 'planned-not-provisioned', capabilities, pages: pageEntries,
    components: nodes.filter(item => item.type === 'frontend-component'), apiContracts, dataModels: models, dataIntegrity, integrations, stateMachines,
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
    dataModelCount: architecture.dataModels.length,
    dataRelationshipCount: architecture.dataIntegrity.relationships.length,
    dataConstraintCount: architecture.dataIntegrity.constraints.length,
    indexCount: architecture.dataIntegrity.indexes.length,
    integrationCount: architecture.integrations.length,
    workflowStateMachineCount: architecture.stateMachines.length,
    securityControlCount: architecture.security.controls.length,
    acceptanceTestCount: architecture.testPlan.length,
    requirementsNeedingSemanticMappingCount: architecture.requirementMappings.filter(item => item.assessment === 'needs-semantic-mapping').length,
    graph: architecture.graphIntegrity,
  };
}

export function fullStackArchitectureModelContract(architecture) {
  if (!architecture || architecture.engine !== 'ovyx-fullstack-architecture') return null;
  const text = value => String(value || '').slice(0, 112);
  const compact = values => (Array.isArray(values) ? values : []).slice(0, 10).map(text);
  return {
    version: architecture.version,
    capabilities: architecture.capabilities,
    pages: architecture.pages.map(page => [page.id, text(page.title), text(page.route)]).slice(0, 14),
    components: architecture.components.map(item => [item.id, text(item.name), text(item.purpose)]).slice(0, 10),
    apiContracts: architecture.apiContracts.map(route => ({
      id: route.id, method: route.method, path: route.path, capability: route.capability,
      authPolicy: route.authPolicy, modelIds: route.modelIds.slice(0, 5), idempotency: route.idempotency,
      rateLimit: route.rateLimit, sideEffect: text(route.sideEffect),
    })).slice(0, 18),
    dataModels: architecture.dataModels.map(model => ({
      id: model.id, name: model.name, fields: model.fields.slice(0, 10), securityClass: model.securityClass,
    })).slice(0, 14),
    dataIntegrity: {
      relationships: architecture.dataIntegrity.relationships.map(item => [item.from, item.to, item.cardinality, item.foreignKeyField, item.kind, item.optional, text(item.purpose)]).slice(0, 14),
      constraints: architecture.dataIntegrity.constraints.map(item => [item.id, text(item.appliesTo), text(item.rule)]).slice(0, 14),
      indexes: architecture.dataIntegrity.indexes.map(item => [item.entity, item.fields.slice(0, 5), item.unique]).slice(0, 14),
    },
    integrations: architecture.integrations.map(item => ({
      capability: item.capability, provider: text(item.provider),
      connectionMetadata: item.connectionMetadata, verification: item.verification,
      liveDeliveryOrTransaction: item.liveDeliveryOrTransaction,
    })).slice(0, 6),
    requirementTraceabilityGroups: (() => {
      const grouped = new Map();
      for (const item of architecture.requirementMappings) {
        const targetNodeIds = item.targetNodeIds.slice(0, 3);
        const key = item.assessment + '|' + targetNodeIds.join('|');
        if (!grouped.has(key)) grouped.set(key, {
          assessment: item.assessment, targetNodeIds, requirementIds: [],
        });
        grouped.get(key).requirementIds.push(item.requirementId);
      }
      return [...grouped.values()];
    })(),
    requirementsNeedingSemanticMapping: architecture.requirementMappings
      .filter(item => item.assessment === 'needs-semantic-mapping')
      .map(item => item.requirementId),
    dependencyEdges: architecture.graph.edges.slice(0, 36).map(edge => [edge.from, edge.relation, edge.to]),
    graphIntegrity: architecture.graphIntegrity,
    crossLayerContracts: {
      apiBoundary: ['typed-api-contracts', 'server-validation', 'safe-errors-no-secrets'],
      dataConsistency: ['server-derived-money', 'UTC-instants-with-IANA-timezone', 'owner-tenant-scope', 'transactional-concurrency'],
      identityAndAuthorization: ['verified-identity', 'deny-by-default-permissions', 'object-level-ownership'],
      transactionSafety: ['transactional-mutations', 'outbox-after-commit', 'idempotent-retries'],
      integrationReliability: ['server-side-adapters', 'bounded-timeouts-retries', 'verified-provider-receipts'],
      privacyAndRetention: ['data-minimization', 'sensitive-data-protection', 'retention-and-deletion'],
      observability: ['correlation-ids', 'redacted-audit-events', 'operational-reconciliation'],
      environmentAndRelease: ['environment-isolation', 'preview-before-release', 'code-and-data-rollback'],
      qualityPrinciples: compact(architecture.crossLayerContracts.qualityPrinciples),
    },
    security: {
      defaultPosture: architecture.security.defaultPosture,
      controls: architecture.security.controls.map(item => [item.id, text(item.requirement)]).slice(0, 14),
      migrationPolicy: architecture.security.migrationPolicy,
    },
    backgroundWork: architecture.backgroundWork,
    stateMachines: architecture.stateMachines.map(machine => ({
      id: machine.id, name: text(machine.name), entity: machine.entity,
      initialState: machine.initialState, states: machine.states.slice(0, 10),
      transitions: machine.transitions.slice(0, 10).map(item => ({
        from: item.from, to: item.to, authority: text(item.authority),
        sideEffect: text(item.sideEffect), audit: text(item.audit),
      })),
      invariant: text(machine.invariant),
      executionState: machine.executionState,
    })).slice(0, 8),
    testPlan: architecture.testPlan.map(test => ({
      id: test.id, type: test.type, scope: text(test.scope),
      assertion: text(test.assertion), status: test.status,
      requiresExplicitOwnerApproval: test.requiresExplicitOwnerApproval === true,
    })).slice(0, 12),
    deployment: architecture.deployment,
    honestyRules: compact(architecture.honestyRules),
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
