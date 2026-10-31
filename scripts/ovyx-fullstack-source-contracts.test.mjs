import assert from 'node:assert/strict';
import { evaluateFullStackSourceContracts } from './ovyx-fullstack-source-contracts.mjs';

const architecture = {
  apiContracts: [
    { id: 'api-checkout', method: 'POST', path: '/api/checkout', authPolicy: 'session-or-authenticated' },
    { id: 'api-payment-webhook', method: 'POST', path: '/api/webhooks/payments', authPolicy: 'provider-signature-and-replay-protected' },
  ],
  dataModels: [
    { id: 'model-order', name: 'Order' },
    { id: 'model-orderline', name: 'OrderLine' },
    { id: 'model-product', name: 'Product' },
  ],
  dataIntegrity: {
    relationships: [
      { id: 'relation-orderline-order', from: 'model-orderline', to: 'model-order', foreignKeyField: 'orderId' },
      { id: 'relation-orderline-product', from: 'model-orderline', to: 'model-product', foreignKeyField: 'productId' },
    ],
  },
};

const completeFiles = {
  'app/api/checkout/route.ts': 'import { requireAuth } from "@/server/auth"; export async function POST(request: Request) { const user = await requireAuth(request); return Response.json({ userId: user.id }); }',
  'app/api/webhooks/payments/route.ts': 'import { verifyWebhookSignature } from "@/server/payments"; export async function POST(request: Request) { const event = await verifyWebhookSignature(request); return Response.json({ eventId: event.id }); }',
  'prisma/schema.prisma': 'model Order { id String @id lines OrderLine[] } model OrderLine { id String @id orderId String order Order @relation(fields: [orderId], references: [id]) productId String product Product @relation(fields: [productId], references: [id]) } model Product { id String @id orderLines OrderLine[] }',
};
const complete = evaluateFullStackSourceContracts(completeFiles, architecture);
assert.equal(complete.status, 'source-evidence-present-runtime-unverified');
assert.equal(complete.requestedRouteCount, 2);
assert.equal(complete.routeSourceEvidenceCount, 2);
assert.equal(complete.modelSchemaEvidenceCount, 3);
assert.equal(complete.relationshipSourceEvidenceCount, 2);
assert.equal(complete.missingRouteSourceCount, 0);
assert.equal(complete.missingMethodEvidenceCount, 0);
assert.equal(complete.missingAuthorizationEvidenceCount, 0);
assert.equal(complete.missingSchemaSourceCount, 0);
assert.equal(complete.missingRelationshipSourceCount, 0);
assert.equal(complete.runtimeBehaviorVerified, false);
assert.equal(complete.databasePersistenceVerified, false);
assert.equal(complete.integrationDeliveryVerified, false);

const incompleteFiles = {
  'app/api/checkout/route.ts': 'export async function POST(){ return Response.json({ ok: true }); }',
  'prisma/schema.prisma': 'model Order { id String @id }',
};
const incomplete = evaluateFullStackSourceContracts(incompleteFiles, architecture);
assert.equal(incomplete.status, 'missing-full-stack-source-evidence');
assert.equal(incomplete.missingRouteSourceCount, 1);
assert.equal(incomplete.missingAuthorizationEvidenceCount, 1);
assert.equal(incomplete.missingSchemaSourceCount, 2);
assert.equal(incomplete.missingRelationshipSourceCount, 2);

const policyArchitecture = {
  apiContracts: [
    { id: 'auth-session', method: 'POST', path: '/api/auth/session', authPolicy: 'public-with-credential-provider' },
    { id: 'unsubscribe', method: 'POST', path: '/api/newsletter/unsubscribe', authPolicy: 'signed-unsubscribe-token' },
    { id: 'admin-audit', method: 'GET', path: '/api/admin/audit-events', authPolicy: 'administrator-role-and-resource-scope' },
  ],
  dataModels: [],
  dataIntegrity: { relationships: [] },
};
const policyFiles = {
  'functions/api/auth/session.js': 'export async function onRequestPost(context) { const identity = await verifyCredentials(context.data); return Response.json(identity); }',
  'functions/api/newsletter/unsubscribe.js': 'export async function onRequestPost(context) { const claim = verifyUnsubscribeToken(context.request); return Response.json(claim); }',
  'functions/api/admin/audit-events.js': 'export async function onRequestGet(context) { const user = assertAuthenticated(context.data.user); requireAdmin(user); return Response.json({ events: [] }); }',
};
const policyEvidence = evaluateFullStackSourceContracts(policyFiles, policyArchitecture);
assert.equal(policyEvidence.status, 'source-evidence-present-runtime-unverified');
assert.ok(policyEvidence.routeEvidence.every(item => item.authorizationExpected && item.authorizationDetected));

const sqlAndDrizzleArchitecture = {
  apiContracts: [
    { id: 'booking-cancel', method: 'POST', path: '/api/bookings/:bookingId/cancel', authPolicy: 'public-with-abuse-controls' },
  ],
  dataModels: [
    { id: 'model-order', name: 'Order' },
    { id: 'model-product', name: 'Product' },
  ],
  dataIntegrity: { relationships: [] },
};
const sqlAndDrizzle = evaluateFullStackSourceContracts({
  'server/routes.ts': "router.post('/api/bookings/:bookingId/cancel', cancelBooking);",
  'db/schema.sql': 'CREATE TABLE "orders" (id TEXT PRIMARY KEY);',
  'db/schema.ts': "export const products = pgTable('products', { id: text('id').primaryKey() });",
}, sqlAndDrizzleArchitecture);
assert.equal(sqlAndDrizzle.missingRouteSourceCount, 0,
  'A central route declaration with a dynamic path parameter should be detected.');
assert.equal(sqlAndDrizzle.modelSchemaEvidenceCount, 2,
  'SQL and Drizzle schema declarations should be detected.');

const empty = evaluateFullStackSourceContracts({}, { apiContracts: [], dataModels: [], dataIntegrity: { relationships: [] } });
assert.equal(empty.status, 'source-evidence-present-runtime-unverified');
assert.equal(empty.requestedRouteCount, 0);
assert.equal(empty.modelCount, 0);

console.log('OVYX full-stack source contract tests passed: route/method/auth source, schema and relationship evidence with runtime claims kept unverified.');
