import { buildExperienceBrief } from './experience.js';
import { buildPromptContract } from './prompt-contract.js';
import { buildStudioMultiPage } from './studio-multipage.js';
import { validateOrRepairSinglePageBuild } from './studio-singlepage.js';

const clean = (value, max = 240) => String(value == null ? '' : value)
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

function connectedFor(context, kind) {
  const source = context && typeof context === 'object' ? context : {};
  const roots = [source.connections, source.activeConnections, source.integrations,
    source.connectionStatus, source.connectedServices];
  const flatten = value => {
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (!value || typeof value !== 'object') return [];
    return [value, ...Object.values(value).flatMap(flatten)];
  };
  const patterns = {
    payments: /stripe|paypal|paystack|flutterwave|payment|checkout/i,
    email: /email|mailgun|sendgrid|resend|postmark|smtp/i,
    auth: /firebase|supabase|auth|identity|clerk|auth0/i,
    database: /firebase|supabase|database|firestore|d1|postgres|mysql/i,
    booking: /booking|reservation|calendar|scheduling/i,
  };
  return flatten(roots).some(item => {
    if (!item || typeof item !== 'object') return false;
    const identity = clean(item.provider || item.name || item.id || item.type || item.service, 120);
    const active = item.connected === true || item.status === 'connected' ||
      item.state === 'connected' || item.isConnected === true;
    return active && (patterns[kind] || /$a/).test(identity);
  });
}

function integrationRequirements(contract, context) {
  const signals = contract.contactSignals || {};
  const requested = [
    ['payments', signals.payments],
    ['email', signals.emailDelivery || signals.contactForm || signals.newsletter],
    ['auth', signals.authentication],
    ['database', signals.backendData],
    ['booking', signals.bookings],
  ];
  return requested.filter(([, needed]) => needed).map(([kind]) => ({
    capability: kind,
    requested: true,
    connection: connectedFor(context, kind) ? 'connected-in-context' : 'not-confirmed',
    verification: 'connection metadata is not a live transaction or delivery test',
  }));
}

function pagePlan(contract) {
  const pages = Array.isArray(contract.explicitPages) ? contract.explicitPages : [];
  return pages.map((title, index) => {
    const slug = clean(title, 80).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page-' + (index + 1);
    return {
      title: clean(title, 80),
      route: /^(?:home|homepage|index)$/i.test(title) ? '/' : '/' + slug + '/',
      responsibility: 'derive page-specific content, layout, primary action and states from the original brief',
      sourceRequirement: 'explicit-user-page-request',
    };
  });
}

/**
 * One deterministic pre-generation architecture pass shared by every
 * Web Studio generation entry point. It composes the existing prompt contract,
 * experience intelligence, market context and visual-asset plan instead of
 * maintaining route-specific versions of those decisions.
 */
export function buildWebsiteEnginePlan(prompt, context = {}) {
  const brief = clean(prompt, 80000);
  const safeContext = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  const promptContract = buildPromptContract(brief);
  const experience = buildExperienceBrief(brief, safeContext);
  const pages = pagePlan(promptContract);
  const explicitMultiPage = pages.length > 1 ||
    /\b(?:multi[- ]?page|multiple pages|several pages|\d+ pages)\b/i.test(brief);
  const signals = promptContract.contactSignals || {};
  const workflowCapabilities = [
    ['forms', signals.contactForm || signals.emailDelivery],
    ['booking', signals.bookings],
    ['commerce', signals.shoppingCart || signals.addToCart || signals.payments],
    ['authentication', signals.authentication],
    ['persistent-data', signals.backendData],
    ['newsletter', signals.newsletter],
  ].filter(([, needed]) => needed).map(([name]) => name);

  return {
    version: 1,
    engine: 'ovyx-unified-website-engine',
    stage: 'pre-generation-architecture',
    strategy: explicitMultiPage ? 'multi-page' : 'single-page-or-context-derived',
    promptContract,
    requirementManifest: {
      complete: promptContract.requirementManifestComplete === true,
      total: promptContract.requirementClauseCount || 0,
      omitted: promptContract.omittedRequirementClauseCount || 0,
      requirements: promptContract.allBriefClauses || [],
      constraints: promptContract.explicitConstraints || [],
    },
    pageArchitecture: {
      explicitPageCount: pages.length,
      pages,
      rule: pages.length
        ? 'Preserve every explicitly requested page and its distinct responsibility.'
        : 'Do not invent a fixed page list; derive the minimum complete architecture from the brief and primary workflow.',
    },
    experience,
    designArchitecture: {
      direction: experience.brandDirection || '',
      designIntelligence: experience.designIntelligence || {},
      experiencePrinciples: experience.experiencePrinciples || [],
      antiTemplateRules: experience.antiTemplateRules || [],
      visualAssetPlan: experience.visualAssetPlan || {},
      marketContext: experience.marketContext || {},
    },
    interactionArchitecture: {
      primaryOutcome: experience.designIntelligence?.primaryOutcome || null,
      journey: experience.designIntelligence?.customerJourney || [],
      capabilities: workflowCapabilities,
      interactionConcepts: experience.architecture?.interactionConcepts || [],
      motionChoreography: experience.architecture?.motionChoreography || [],
    },
    integrations: integrationRequirements(promptContract, safeContext),
    qualityGates: experience.qualityGates || [],
    implementationRules: [
      'Plan the complete experience before writing files; do not stop at a visually attractive first screen.',
      'Preserve every requirement and exclusion in the manifest; do not silently discard requirements.',
      'Design each requested page independently while maintaining one coherent design system.',
      'Every visible control must have an intentional action, state transition and user feedback.',
      'Never fabricate credentials, data, testimonials, prices, availability, delivery receipts or connected integrations.',
      'Distinguish UI/demo behavior, configured connections and live-verified behavior.',
      'Preserve unrelated existing files and project behavior during targeted edits.',
      'Use the existing Cloudflare AI routing and quota controls; do not create a second provider path.',
    ],
  };
}

export function buildWebsiteEngineInstructions(plan) {
  if (!plan || plan.engine !== 'ovyx-unified-website-engine') return '';
  const modelPlan = {
    version: plan.version,
    strategy: plan.strategy,
    requirementManifest: plan.requirementManifest,
    pageArchitecture: plan.pageArchitecture,
    designArchitecture: plan.designArchitecture,
    interactionArchitecture: plan.interactionArchitecture,
    integrations: plan.integrations,
    qualityGates: plan.qualityGates,
    implementationRules: plan.implementationRules,
  };
  return [
    'OVYX UNIFIED WEBSITE ENGINE — AUTHORITATIVE PRE-GENERATION PLAN',
    'The following deterministic plan is derived from the complete supplied brief and project context. Follow it while preserving the existing route-specific output schema.',
    JSON.stringify(modelPlan).slice(0, 18000),
    'Before returning files, internally reconcile every requirement and exclusion against the actual output. If a real service is not connected and verified, provide an honest pending/UI-only boundary instead of a fake success path.',
  ].join('\n\n');
}

export function websiteEngineClientSummary(plan) {
  if (!plan || plan.engine !== 'ovyx-unified-website-engine') return null;
  return {
    version: plan.version,
    stage: plan.stage,
    strategy: plan.strategy,
    explicitPages: plan.pageArchitecture.explicitPageCount,
    requirementCount: plan.requirementManifest.total,
    requirementManifestComplete: plan.requirementManifest.complete,
    workflowCapabilities: plan.interactionArchitecture.capabilities,
    integrations: plan.integrations.map(item => ({
      capability: item.capability,
      requested: item.requested,
      connection: item.connection,
    })),
    qualityGateCount: plan.qualityGates.length,
  };
}

/**
 * Shared build lifecycle for the Assistant and Gateway endpoints. A fresh
 * website build uses the same multi-page planner/builder, then the same
 * single-page repair fallback if the staged builder cannot return a project.
 * Scoped edits deliberately bypass full-site rebuild and repair.
 */
export async function runWebsiteGeneration(options = {}) {
  const {
    env,
    callModel,
    shouldBuild = false,
    scopedEdit = false,
    multiPageOptions = {},
    modelOptions = {},
    singlePageOptions = {},
    initialQuotaInputText = '',
    buildMultiPage = buildStudioMultiPage,
    repairSinglePage = validateOrRepairSinglePageBuild,
  } = options;
  if (typeof callModel !== 'function') throw new TypeError('Website generation requires a model caller.');

  let result = null;
  let multiPageBuild = false;
  let quotaInputText = String(initialQuotaInputText || '');
  let quotaOutputText = '';

  if (shouldBuild && !scopedEdit) {
    const generated = await buildMultiPage({ ...multiPageOptions, env, callModel });
    if (generated) {
      result = generated;
      multiPageBuild = true;
      quotaInputText = generated.quotaInputText || quotaInputText;
      quotaOutputText = generated.quotaOutputText || generated.text || '';
    }
  }

  if (!result) {
    result = await callModel(env, modelOptions);
    quotaOutputText = result?.text || '';
    if (shouldBuild && !scopedEdit) {
      const repaired = await repairSinglePage({
        ...singlePageOptions,
        env,
        callModel,
        result,
        quotaInputText,
        quotaOutputText,
      });
      result = repaired?.result || result;
      quotaInputText = repaired?.quotaInputText || quotaInputText;
      quotaOutputText = repaired?.quotaOutputText || result?.text || quotaOutputText;
    }
  }

  if (!result) throw new Error('Website generation returned no result.');
  return { result, multiPageBuild, quotaInputText, quotaOutputText };
}
