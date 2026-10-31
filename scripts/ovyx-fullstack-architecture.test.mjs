import assert from 'node:assert/strict';
import {
  buildFullStackArchitecture,
  buildFullStackArchitectureInstructions,
  fullStackArchitectureClientSummary,
  validateFullStackArchitectureGraph,
} from '../functions/_lib/fullstack-architecture.js';
import { buildPromptContract } from '../functions/_lib/prompt-contract.js';

const brief = [
  'Build a multi-page subscription commerce platform with Home, Products, Pricing, Login, Account and Admin Dashboard pages.',
  'Customers must create accounts, manage their profile, browse products, add products to cart and complete checkout using Paystack.',
  'Persist customers, orders and payment attempts in a database.',
  'Send order confirmation emails and store user-uploaded product documents securely.',
  'Administrators can manage orders and users with role-based access and an audit trail.',
  'Do not invent product prices, payment success, inventory or customer data.',
].join('\n');
const contract = buildPromptContract(brief);
const pages = contract.explicitPages.map(title => ({
  title,
  route: title === 'Home' ? '/' : '/' + title.toLowerCase().replace(/\s+/g, '-') + '/',
}));
const architecture = buildFullStackArchitecture(brief, contract, {
  integrations: [
    { name: 'Paystack', connected: true },
    { name: 'Firebase', connected: true },
  ],
  // Secret-shaped values must never flow into an architecture plan or its model-facing instructions.
  paymentSecret: 'sk_test_must-never-be-included',
  apiKey: 'must-never-be-included',
}, pages);

assert.equal(architecture.engine, 'ovyx-fullstack-architecture');
assert.equal(architecture.architectureStatus, 'planned-not-provisioned');
assert.equal(architecture.capabilities.frontend, true);
assert.equal(architecture.capabilities.backend, true);
assert.equal(architecture.capabilities.database, true);
assert.equal(architecture.capabilities.authentication, true);
assert.equal(architecture.capabilities.authorization, true);
assert.equal(architecture.capabilities.payments, true);
assert.equal(architecture.capabilities.commerce, true);
assert.equal(architecture.capabilities.email, true);
assert.equal(architecture.capabilities.fileStorage, true);
assert.equal(architecture.capabilities.admin, true);

assert.ok(architecture.apiContracts.some(route => route.path === '/api/checkout' && route.authPolicy === 'session-or-authenticated'));
assert.ok(architecture.apiContracts.some(route => route.path === '/api/webhooks/payments' && route.authPolicy === 'provider-signature-and-replay-protected'));
assert.ok(architecture.apiContracts.some(route => route.path === '/api/assets' && route.authPolicy === 'authenticated-owner-scoped'));
assert.ok(architecture.apiContracts.some(route => route.path === '/api/admin/audit-events' && /administrator-role/.test(route.authPolicy)));
assert.ok(architecture.dataModels.some(model => model.name === 'PaymentAttempt' && model.securityClass === 'financial'));
assert.ok(architecture.dataModels.some(model => model.name === 'RoleAssignment'));
assert.ok(architecture.integrations.some(item => item.capability === 'payments' && item.connectionMetadata === 'connected-in-context-not-live-verified'));
assert.ok(architecture.integrations.every(item => item.verification === 'not-run' && item.liveDeliveryOrTransaction === 'not-verified'));
assert.ok(architecture.security.controls.some(item => item.id === 'payment-integrity'));
assert.ok(architecture.security.controls.some(item => item.id === 'object-level-authorization'));
assert.ok(architecture.security.controls.some(item => item.id === 'upload-isolation'));
assert.equal(architecture.security.migrationPolicy.destructiveChanges, 'require-explicit-owner-approval');
assert.match(architecture.crossLayerContracts.dataConsistency.money, /integer minor units/i);
assert.match(architecture.crossLayerContracts.transactionSafety.duplicateDelivery, /Deduplicate/i);
assert.match(architecture.crossLayerContracts.privacyAndRetention.lifecycle, /retention/i);
assert.match(architecture.crossLayerContracts.observability.correlation, /correlation ID/i);
assert.equal(architecture.graphIntegrity.missingModelReferences.length, 0);
assert.equal(architecture.graphIntegrity.missingRelationshipReferences.length, 0);
assert.ok(architecture.dataIntegrity.relationships.some(item => item.from === 'model-orderline' && item.to === 'model-order'));
assert.ok(architecture.dataIntegrity.relationships.some(item => item.from === 'model-orderline' && item.to === 'model-product'));
assert.ok(architecture.dataIntegrity.constraints.some(item => item.id === 'money-minor-units'));
assert.ok(architecture.dataIntegrity.constraints.some(item => item.id === 'no-client-authoritative-prices'));
assert.ok(architecture.dataIntegrity.indexes.some(item => item.entity === 'PaymentAttempt' && item.unique));
assert.ok(architecture.graph.edges.some(edge => edge.relation === 'relates-to'));
const modelById = new Map(architecture.dataModels.map(model => [model.id, model]));
for (const relation of architecture.dataIntegrity.relationships) {
  assert.ok(modelById.has(relation.from) && modelById.has(relation.to));
  assert.ok(modelById.get(relation.from).fields.includes(relation.foreignKeyField),
    relation.from + ' must declare foreign key field ' + relation.foreignKeyField);
}
for (const index of architecture.dataIntegrity.indexes) {
  const model = architecture.dataModels.find(item => item.name === index.entity);
  assert.ok(model, 'Every declared index must target a declared data model: ' + index.entity);
  assert.ok(index.fields.every(field => model.fields.includes(field)),
    index.entity + ' index fields must exist in its model definition.');
}
assert.ok(architecture.dataIntegrity.relationships.some(item => item.foreignKeyField === 'principalId'));
assert.equal(architecture.graphIntegrity.unreachableNodeIds.length, 0);
assert.ok(architecture.backgroundWork.controls.includes('dead-letter-visibility'));
assert.ok(architecture.testPlan.some(item => item.id === 'payment-sandbox' && item.requiresExplicitOwnerApproval === true));
assert.ok(architecture.testPlan.some(item => item.id === 'business-state-transitions'));

assert.ok(architecture.testPlan.every(item => item.status === 'planned-not-executed' && item.evidence === null));
assert.ok(architecture.stateMachines.some(machine => machine.entity === 'Order'));
assert.ok(architecture.stateMachines.some(machine => machine.entity === 'PaymentAttempt'));
assert.ok(architecture.stateMachines.some(machine => machine.entity === 'NewsletterSubscription'));
assert.ok(architecture.graph.nodes.some(node => node.type === 'business-workflow'));
assert.ok(architecture.graph.edges.some(edge => edge.relation === 'enforces-state-machine'));
const paymentMachine = architecture.stateMachines.find(machine => machine.entity === 'PaymentAttempt');
assert.ok(paymentMachine.transitions.some(transition =>
  transition.from === 'pending' && transition.to === 'succeeded' && /verified signed provider event/i.test(transition.authority)
));
assert.match(paymentMachine.invariant, /deduplicated/i);
assert.equal(architecture.graphIntegrity.valid, true);
assert.ok(architecture.graph.nodes.some(node => node.type === 'api-route'));
assert.ok(architecture.graph.nodes.some(node => node.type === 'data-model'));
assert.ok(architecture.graph.nodes.some(node => node.type === 'security-boundary'));
assert.ok(architecture.graph.nodes.some(node => node.type === 'acceptance-test'));
assert.ok(architecture.graph.edges.some(edge => edge.relation === 'reads-or-writes'));
assert.ok(architecture.graph.edges.some(edge => edge.relation === 'must-verify'));
assert.ok(architecture.requirementMappings.length <= contract.allBriefClauses.length);
assert.ok(architecture.requirementMappings.every(item => item.requirementId && Array.isArray(item.targetNodeIds)));
assert.ok(architecture.requirementMappings.some(item => item.assessment === 'mapped-to-architecture'));
assert.ok(architecture.requirementMappings.some(item => item.assessment === 'needs-semantic-mapping'));
assert.ok(architecture.graph.edges.some(edge => edge.relation === 'persists-through-server-adapter'));
assert.ok(architecture.graph.edges.some(edge => edge.relation === 'queues-delivery-through-server-adapter'));

const instructions = buildFullStackArchitectureInstructions(architecture);
assert.match(instructions, /ONE COHERENT APPLICATION/);
assert.match(instructions, /transactional/i);
assert.match(instructions, /destructive or production migrations/);
assert.doesNotMatch(instructions, /sk_test_must-never-be-included|must-never-be-included/);
const summary = fullStackArchitectureClientSummary(architecture);
assert.equal(summary.architectureStatus, 'planned-not-provisioned');
assert.ok(summary.apiContractCount > 0);
assert.equal(summary.graph.valid, true);

const explicitFullStackBrief = 'Build a full-stack business website with a custom backend, database and server-rendered pages. Do not add checkout or user accounts unless a later requirement asks for them.';
const explicitFullStack = buildFullStackArchitecture(explicitFullStackBrief, buildPromptContract(explicitFullStackBrief));
assert.equal(explicitFullStack.capabilities.fullStackRequested, true);
assert.equal(explicitFullStack.capabilities.backend, true);
assert.equal(explicitFullStack.capabilities.database, true);
assert.ok(explicitFullStack.integrations.some(item => item.capability === 'database'));
assert.equal(explicitFullStack.capabilities.payments, false);
assert.equal(explicitFullStack.capabilities.authentication, false);

const simpleBrief = 'Build a one-page personal portfolio with an about section and project gallery.';
const simple = buildFullStackArchitecture(simpleBrief, buildPromptContract(simpleBrief));
assert.equal(simple.capabilities.frontend, true);
assert.equal(simple.capabilities.backend, false);
assert.equal(simple.capabilities.database, false);
assert.equal(simple.apiContracts.length, 0);
assert.equal(simple.dataModels.length, 0);
assert.equal(simple.integrations.length, 0);
assert.equal(simple.graphIntegrity.valid, true);
assert.equal(simple.stateMachines.length, 0);

const withContacts = buildFullStackArchitecture(
  'Build a business website with a real contact form and send messages to the business owner.',
  buildPromptContract('Build a business website with a real contact form and send messages to the business owner.'),
);
assert.ok(withContacts.apiContracts.some(route => route.path === '/api/contact-submissions'));
assert.ok(withContacts.dataModels.some(model => model.name === 'ContactSubmission'));
assert.ok(withContacts.integrations.some(item => item.capability === 'email'));
assert.ok(withContacts.graph.edges.some(edge => edge.relation === 'queues-delivery-through-server-adapter'));

const catalogOnlyBrief = 'Build a product catalogue for a distributor with searchable products and product detail pages. No checkout or payment is requested.';
const catalogOnly = buildFullStackArchitecture(catalogOnlyBrief, buildPromptContract(catalogOnlyBrief));
assert.equal(catalogOnly.capabilities.commerce, true);
assert.equal(catalogOnly.capabilities.payments, false, 'A catalog must not silently imply a payment provider.');
assert.ok(catalogOnly.apiContracts.some(route => route.path === '/api/products'));
assert.ok(!catalogOnly.apiContracts.some(route => route.path === '/api/checkout'));
assert.ok(!catalogOnly.integrations.some(item => item.capability === 'payments'));

const adminBrief = 'Create an admin dashboard to manage customer records and orders with staff roles.';
const adminArchitecture = buildFullStackArchitecture(adminBrief, buildPromptContract(adminBrief));
assert.equal(adminArchitecture.capabilities.authentication, true, 'Admin surfaces require protected identity by default.');
assert.equal(adminArchitecture.capabilities.authorization, true);

const newsletterBrief = 'Build a community site with a newsletter signup, double opt-in confirmation email and secure unsubscribe link.';
const newsletterArchitecture = buildFullStackArchitecture(newsletterBrief, buildPromptContract(newsletterBrief));
assert.equal(newsletterArchitecture.capabilities.newsletter, true);
assert.equal(newsletterArchitecture.capabilities.contact, false, 'Newsletter signup must not silently create a contact form feature.');
assert.ok(!newsletterArchitecture.dataModels.some(model => model.name === 'ContactSubmission'));
assert.ok(newsletterArchitecture.dataModels.some(model => model.name === 'NewsletterSubscription'));
assert.ok(newsletterArchitecture.stateMachines.some(machine => machine.entity === 'NewsletterSubscription'));
assert.ok(newsletterArchitecture.apiContracts.some(route => route.path === '/api/newsletter/subscriptions'));
assert.ok(newsletterArchitecture.apiContracts.some(route => route.path === '/api/newsletter/unsubscribe'));
assert.ok(newsletterArchitecture.graph.edges.some(edge => edge.relation === 'enqueues-after-commit' &&
  edge.from === newsletterArchitecture.apiContracts.find(route => route.path === '/api/newsletter/subscriptions').id));
assert.ok(newsletterArchitecture.graph.edges.some(edge => edge.relation === 'queues-delivery-through-server-adapter'));
assert.ok(newsletterArchitecture.dataIntegrity.constraints.some(item => item.id === 'newsletter-consent-evidence'));
assert.ok(newsletterArchitecture.dataIntegrity.constraints.some(item => item.id === 'newsletter-unsubscribe-effective'));
assert.equal(newsletterArchitecture.graphIntegrity.valid, true);

const corrupted = validateFullStackArchitectureGraph({
  nodes: [{ id: 'one' }],
  edges: [{ id: 'edge-a', from: 'one', to: 'missing', relation: 'uses' }],
});
assert.equal(corrupted.valid, false);
assert.ok(corrupted.errors.some(error => /missing node/.test(error)));

const longBrief = Array.from({ length: 180 }, (_, index) => (
  'Requirement ' + (index + 1) + ': Preserve a working project behavior and validate it before deployment.'
)).join('\n');
const long = buildFullStackArchitecture(longBrief, buildPromptContract(longBrief));
assert.equal(long.requirementMappings.length, 180);
assert.equal(long.requirementMappings[0].requirementId, 'R001');
assert.equal(long.requirementMappings.at(-1).requirementId, 'R180');
assert.equal(long.graphIntegrity.valid, true);

console.log('OVYX full-stack architecture tests passed: graph integrity, frontend/backend/data/auth/security/integrations/verification contracts, secret isolation and honest unverified states.');
