import { buildExperienceBrief } from './experience.js';
import { buildPromptContract, getWebStudioBuildClarification } from './prompt-contract.js';
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
      sourceRequirement: 'brief-derived-page-candidate',
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
  // Keep a line-preserving source brief for requirement extraction. The local
  // display/planning cleaner intentionally flattens whitespace, but the prompt
  // contract uses line boundaries to retain distinct user requirements.
  const sourceBrief = String(prompt ?? '').replace(/\u0000/g, '').trim();
  const brief = clean(sourceBrief, 80000);
  const safeContext = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  const promptContract = buildPromptContract(sourceBrief);
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
      pageCandidateCount: pages.length,
      pages,
      rule: pages.length
        ? 'Preserve every page explicitly named or clearly implied by the brief, and give each a distinct responsibility.'
        : 'Do not invent a fixed page list; derive the minimum complete architecture from the brief and primary workflow.',
    },
    experience,
    designArchitecture: {
      mission: experience.mission || '',
      audience: experience.audience || '',
      direction: experience.brandDirection || '',
      designIntelligence: experience.designIntelligence || {},
      mustHave: experience.mustHave || [],
      delighters: experience.delighters || [],
      motion: experience.motion || '',
      experiencePrinciples: experience.experiencePrinciples || [],
      conversionPrinciples: experience.conversionPrinciples || [],
      conversionAudit: experience.conversionAudit || [],
      signatureMoments: experience.signatureMoments || [],
      contentRules: experience.contentRules || [],
      architecture: experience.architecture || {},
      customizationContract: experience.customizationContract || [],
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


export function buildWebsiteEngineReadiness(prompt, context = {}, options = {}) {
  if (String(options.mode || '').toLowerCase() !== 'build') return null;
  const source = String(prompt || '');
  const conversationText = String(options.conversationText || '');
  const files = context && typeof context === 'object'
    ? (context.files || options.files || {})
    : (options.files || {});
  const hasExistingHtml = Object.entries(files && typeof files === 'object' ? files : {})
    .some(([filePath, value]) => {
      const content = typeof value === 'string' ? value : value && (value.content || value.text || value.source || value.code);
      return /\.html?$/i.test(filePath) && typeof content === 'string' && content.length > 500 && /<body\b/i.test(content);
    });
  const readinessSensitiveRequest =
    /\b(?:contact\s+forms?|enquir(?:y|ies)\s+forms?|email delivery|send (?:form )?messages|payments?|checkout|paystack|flutterwave|stripe|paypal|booking|reservations?|appointments?|newsletter|subscriptions?|login|log in|sign in|sign up|authentication|database|customer records?|order records?)\b/i.test(source) ||
    /\b(?:add|create|include|build|put|make)\b.{0,55}\b(?:contact|email|phone|whatsapp|address|booking|reservation|newsletter)\b/i.test(source);
  const isExistingSiteEdit = hasExistingHtml &&
    /\b(?:fix|edit|change|update|modify|repair|tweak|adjust|redesign|remove|replace|add)\b/i.test(source) &&
    !readinessSensitiveRequest;
  if (isExistingSiteEdit) return null;
  return getWebStudioBuildClarification(source, {
    ...(context && typeof context === 'object' ? context : {}),
    files,
    conversationText,
  });
}

const WEBSITE_ENGINE_PLAN_JSON_LIMIT = 18000;

function compactPlanValue(value, depth = 0) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return clean(value, depth >= 3 ? 120 : 200);
  if (Array.isArray(value)) {
    const limit = depth >= 2 ? 6 : 10;
    return value.slice(0, limit).map(item => compactPlanValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const limit = depth >= 2 ? 8 : 12;
    const output = {};
    for (const [key, child] of Object.entries(value).slice(0, limit)) {
      output[String(key).slice(0, 64)] = compactPlanValue(child, depth + 1);
    }
    return output;
  }
  return clean(value, 120);
}

function compactPlanList(values, maxItems, maxChars) {
  return (Array.isArray(values) ? values : []).slice(0, maxItems).map(item => {
    if (typeof item === 'string') return clean(item, maxChars);
    return compactPlanValue(item);
  });
}

/**
 * Keep the model-facing plan valid JSON even for the largest accepted brief.
 * The complete user brief is already sent as the task prompt; this bounded
 * index keeps every requirement ID while making long clause excerpts shorter.
 */
function serializeWebsiteEngineModelPlan(plan) {
  const requirements = Array.isArray(plan.requirementManifest?.requirements)
    ? plan.requirementManifest.requirements
    : [];
  const makeModelPlan = excerptChars => {
    const manifest = plan.requirementManifest || {};
    const design = plan.designArchitecture || {};
    const interaction = plan.interactionArchitecture || {};
    const pages = Array.isArray(plan.pageArchitecture?.pages) ? plan.pageArchitecture.pages : [];
    return {
      version: plan.version,
      strategy: plan.strategy,
      requirementManifest: {
        complete: manifest.complete === true,
        total: Number(manifest.total) || requirements.length,
        omitted: Number(manifest.omitted) || 0,
        sourcePromptRemainsAuthoritative: true,
        indexEntriesAreExcerpts: true,
        requirements: requirements.map((value, index) => {
          const source = String(value || '');
          const match = source.match(/^(R\d{1,4}):\s*/);
          const id = match ? match[1] : 'R' + String(index + 1).padStart(3, '0');
          return [id, clean(source.slice(match ? match[0].length : 0), excerptChars)];
        }),
        constraints: compactPlanList(manifest.constraints, 20, 96),
      },
      pageArchitecture: {
        pageCandidateCount: Number(plan.pageArchitecture?.pageCandidateCount) || pages.length,
        pages: pages.map(page => ({
          title: clean(page?.title, 80),
          route: clean(page?.route, 120),
          responsibility: clean(page?.responsibility, 140),
        })),
        rule: clean(plan.pageArchitecture?.rule, 200),
      },
      designArchitecture: {
        mission: compactPlanValue(design.mission),
        audience: compactPlanValue(design.audience),
        direction: clean(design.direction, 180),
        designIntelligence: compactPlanValue(design.designIntelligence),
        mustHave: compactPlanList(design.mustHave, 10, 140),
        delighters: compactPlanList(design.delighters, 8, 140),
        motion: clean(design.motion, 140),
        experiencePrinciples: compactPlanList(design.experiencePrinciples, 10, 140),
        conversionPrinciples: compactPlanList(design.conversionPrinciples, 8, 140),
        conversionAudit: compactPlanList(design.conversionAudit, 8, 140),
        signatureMoments: compactPlanList(design.signatureMoments, 6, 140),
        contentRules: compactPlanList(design.contentRules, 6, 140),
        architecture: compactPlanValue(design.architecture),
        customizationContract: compactPlanList(design.customizationContract, 6, 150),
        antiTemplateRules: compactPlanList(design.antiTemplateRules, 8, 140),
        visualAssetPlan: compactPlanValue(design.visualAssetPlan),
        marketContext: compactPlanValue(design.marketContext),
      },
      interactionArchitecture: {
        primaryOutcome: compactPlanValue(interaction.primaryOutcome),
        journey: compactPlanList(interaction.journey, 8, 140),
        capabilities: compactPlanList(interaction.capabilities, 10, 64),
        interactionConcepts: compactPlanList(interaction.interactionConcepts, 8, 140),
        motionChoreography: compactPlanList(interaction.motionChoreography, 8, 140),
      },
      integrations: (Array.isArray(plan.integrations) ? plan.integrations : []).slice(0, 8).map(item => ({
        capability: clean(item?.capability, 48),
        requested: item?.requested === true,
        connection: clean(item?.connection, 48),
        verification: clean(item?.verification, 120),
      })),
      qualityGates: compactPlanList(plan.qualityGates, 14, 140),
      implementationRules: compactPlanList(plan.implementationRules, 10, 160),
      detailSummariesAreBounded: true,
    };
  };

  for (const excerptChars of [96, 80, 64, 48, 32, 16, 0]) {
    const serialized = JSON.stringify(makeModelPlan(excerptChars));
    if (serialized.length <= WEBSITE_ENGINE_PLAN_JSON_LIMIT) return serialized;
  }

  const minimal = makeModelPlan(0);
  minimal.designArchitecture = {
    mission: clean(plan.designArchitecture?.mission, 120),
    direction: clean(plan.designArchitecture?.direction, 120),
    experiencePrinciples: compactPlanList(plan.designArchitecture?.experiencePrinciples, 6, 100),
    antiTemplateRules: compactPlanList(plan.designArchitecture?.antiTemplateRules, 6, 100),
  };
  minimal.interactionArchitecture = {
    capabilities: compactPlanList(plan.interactionArchitecture?.capabilities, 10, 64),
    interactionConcepts: compactPlanList(plan.interactionArchitecture?.interactionConcepts, 6, 100),
  };
  minimal.qualityGates = compactPlanList(plan.qualityGates, 8, 100);
  minimal.implementationRules = compactPlanList(plan.implementationRules, 8, 100);
  const serialized = JSON.stringify(minimal);
  if (serialized.length > WEBSITE_ENGINE_PLAN_JSON_LIMIT) {
    throw new RangeError('The Website Engine plan exceeds its safe instruction budget.');
  }
  return serialized;
}

export function buildWebsiteEngineInstructions(plan) {
  if (!plan || plan.engine !== 'ovyx-unified-website-engine') return '';
  const serializedPlan = serializeWebsiteEngineModelPlan(plan);
  return [
    'OVYX UNIFIED WEBSITE ENGINE — AUTHORITATIVE PRE-GENERATION PLAN',
    'The complete original user brief is supplied separately as the task prompt and remains authoritative. The JSON below is a bounded architecture plan and requirement index; its clause excerpts never replace the original brief.',
    serializedPlan,
    'Before returning files, internally reconcile every requirement and exclusion against the complete original brief and the actual output. If a real service is not connected and verified, provide an honest pending/UI-only boundary instead of a fake success path.',
  ].join('\n\n');
}

export function websiteEngineClientSummary(plan) {
  if (!plan || plan.engine !== 'ovyx-unified-website-engine') return null;
  return {
    version: plan.version,
    stage: plan.stage,
    strategy: plan.strategy,
    pageCandidates: plan.pageArchitecture.pageCandidateCount,
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
