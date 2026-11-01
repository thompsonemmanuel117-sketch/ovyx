import { buildExperienceBrief } from './experience.js';
import { buildPromptContract, getWebStudioBuildClarification } from './prompt-contract.js';
import { buildStudioMultiPage } from './studio-multipage.js';
import { validateOrRepairSinglePageBuild } from './studio-singlepage.js';
import { buildFullStackArchitecture, fullStackArchitectureClientSummary, fullStackArchitectureModelContract } from './fullstack-architecture.js';
import { buildWebsiteFileGraph, analyzeWebsiteFileImpact } from './website-file-graph.js';
import { buildRequirementIntelligence } from './requirement-intelligence.js';
import { createAutonomousQaReport, evaluateGeneratedWebsiteFiles, runAutonomousRepairCycle } from './autonomous-qa.js';

const clean = (value, max = 240) => String(value == null ? '' : value)
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

function compactPlanList(value, limit = 8, maxChars = 120) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, Math.max(0, limit)).map(item => clean(
    typeof item === 'string' ? item : item && (item.description || item.label || item.name || item.title || item.rule || item.requirement || item.purpose) || '',
    maxChars,
  )).filter(Boolean);
}

function compactPlanValue(value, maxChars = 160) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value, maxChars);
  if (Array.isArray(value)) return compactPlanList(value, 4, maxChars);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 8)) {
      if (item == null || typeof item === 'function') continue;
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') result[key] = clean(item, maxChars);
      else if (Array.isArray(item)) result[key] = compactPlanList(item, 4, Math.min(maxChars, 96));
    }
    return result;
  }
  return '';
}

function connectedFor(context, kind) {
  const source = context && typeof context === 'object' ? context : {};
  const roots = [source.connections, source.activeConnections, source.integrations,
    source.connectionStatus, source.connectedServices];
  const seen = new WeakSet();
  let visited = 0;
  const flatten = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 8 || visited >= 300 || seen.has(value)) return [];
    seen.add(value);
    visited += 1;
    const children = Array.isArray(value) ? value : Object.values(value);
    const result = Array.isArray(value) ? [] : [value];
    for (const child of children) {
      if (visited >= 300) break;
      result.push(...flatten(child, depth + 1));
    }
    return result;
  };
  const patterns = {
    payments: /stripe|paypal|paystack|flutterwave|payment|checkout/i,
    email: /email|mailgun|sendgrid|resend|postmark|smtp/i,
    auth: /firebase|supabase|auth|identity|clerk|auth0/i,
    database: /firebase|supabase|database|firestore|d1|postgres|mysql/i,
    booking: /booking|reservation|calendar|scheduling/i,
    storage: /storage|cloudflare\s*r2|firebase\s*storage|s3|supabase\s*storage/i,
    subscriptions: /subscription|recurring|billing|membership|stripe|paystack|paddle/i,
    notifications: /notification|push|email|sms|messaging|resend|sendgrid/i,
    integrations: /.+/i,
    automation: /automation|workflow|scheduler|cron|queue/i,
  };
  return flatten(roots).some(item => {
    if (!item || typeof item !== 'object') return false;
    const identity = clean(item.provider || item.name || item.id || item.type || item.service, 120);
    const active = item.connected === true || item.status === 'connected' ||
      item.state === 'connected' || item.isConnected === true;
    return active && (patterns[kind] || /$a/).test(identity);
  });
}

function integrationRequirements(contract, context, capabilities = {}) {
  const requested = [
    ['payments', capabilities.payments],
    ['email', capabilities.email],
    ['auth', capabilities.authentication],
    ['database', capabilities.database],
    ['booking', capabilities.booking],
    ['storage', capabilities.fileStorage],
    ['subscriptions', capabilities.subscriptions],
    ['notifications', capabilities.notifications],
    ['integrations', capabilities.integrations],
    ['automation', capabilities.automation],
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
  const fullStackArchitecture = buildFullStackArchitecture(sourceBrief, promptContract, safeContext, pages);
  const requirementIntelligence = buildRequirementIntelligence(sourceBrief, promptContract, fullStackArchitecture);
  const projectFiles = safeContext.files || safeContext.projectFiles || {};
  const fileGraph = buildWebsiteFileGraph(projectFiles);
  const fileArchitecture = {
    status: fileGraph.status,
    fileCount: fileGraph.nodes.length,
    dependencyCount: fileGraph.edges.length,
    unresolvedLocalReferenceCount: fileGraph.missingReferences.length,
    truncated: fileGraph.limits.truncated,
    limits: fileGraph.limits,
    graph: fileGraph,
    impactAnalysis: analyzeWebsiteFileImpact(fileGraph, safeContext.changedPaths || []),
  };
  const explicitMultiPage = pages.length > 1 ||
    /\b(?:multi[- ]?page|multiple pages|several pages|\d+ pages)\b/i.test(brief);
  const signals = promptContract.contactSignals || {};
  const workflowCapabilities = [
    ['forms', fullStackArchitecture.capabilities.forms || fullStackArchitecture.capabilities.contact],
    ['booking', fullStackArchitecture.capabilities.booking],
    ['file-storage', fullStackArchitecture.capabilities.fileStorage],
    ['commerce', fullStackArchitecture.capabilities.commerce],
    ['authentication', fullStackArchitecture.capabilities.authentication],
    ['persistent-data', fullStackArchitecture.capabilities.database],
    ['newsletter', fullStackArchitecture.capabilities.newsletter],
    ['email-delivery', fullStackArchitecture.capabilities.email],
    ['payments', fullStackArchitecture.capabilities.payments],
    ['subscriptions', fullStackArchitecture.capabilities.subscriptions],
    ['notifications', fullStackArchitecture.capabilities.notifications],
    ['dashboards', fullStackArchitecture.capabilities.dashboards],
    ['integrations', fullStackArchitecture.capabilities.integrations],
    ['automation', fullStackArchitecture.capabilities.automation],
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
    integrations: integrationRequirements(promptContract, safeContext, fullStackArchitecture.capabilities),
    fullStackArchitecture,
    requirementIntelligence,
    fileArchitecture,
    qualityGates: experience.qualityGates || [],
    implementationRules: [
      'Plan the complete experience before writing files; do not stop at a visually attractive first screen.',
      'Preserve every requirement and exclusion in the manifest; do not silently discard requirements.',
      'Design each requested page independently while maintaining one coherent design system.',
      'Every visible control must have an intentional action, state transition and user feedback.',
      'Never fabricate credentials, data, testimonials, prices, availability, delivery receipts or connected integrations.',
      'Distinguish UI/demo behavior, configured connections and live-verified behavior.',
      'Preserve unrelated existing files and project behavior during targeted edits.',
      'Reconcile the complete requirement ledger: preserve exclusions, surface unmapped requirements, and never silently resolve contradictory instructions.',
      'When existing source files are supplied, use the file dependency graph and transitive impact analysis to update dependent consumers safely; do not claim complete dependency coverage when the graph is bounded or partial.',
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

function compactWebsiteFullStackContract(architecture) {
  const source = fullStackArchitectureModelContract(architecture);
  if (!source) return source;
  const routes = source.apiContracts || [];
  const selected = [];
  const selectedKeys = new Set();
  const addRoute = route => {
    if (!route) return;
    const key = route.method + ' ' + route.path;
    if (!selectedKeys.has(key)) {
      selectedKeys.add(key);
      selected.push(route);
    }
  };
  const capabilitySeen = new Set();
  for (const route of routes) {
    if (!capabilitySeen.has(route.capability)) {
      addRoute(route);
      capabilitySeen.add(route.capability);
    }
  }
  const criticalPaths = new Set([
    '/api/bookings', '/api/checkout', '/api/payments/intents',
    '/api/auth/session', '/api/forms/:formId/submissions',
    '/api/assets', '/api/cart/items', '/api/subscriptions/checkout',
    '/api/notifications', '/api/dashboard/summary', '/api/webhooks/:provider',
  ]);
  for (const route of routes) if (criticalPaths.has(route.path)) addRoute(route);
  return {
    version: source.version,
    capabilities: source.capabilities,
    pages: (source.pages || []).slice(0, 10),
    apiContracts: selected.slice(0, 20).map(route => ({
      method: route.method, path: route.path, capability: route.capability,
      authPolicy: route.authPolicy, modelIds: (route.modelIds || []).slice(0, 3),
    })),
    dataModels: (source.dataModels || []).slice(0, 28).map(model => ({
      id: model.id, name: model.name, securityClass: model.securityClass,
    })),
    dataIntegrity: {
      relationships: (source.dataIntegrity?.relationships || []).slice(0, 8),
      constraints: (source.dataIntegrity?.constraints || []).slice(0, 10),
      indexes: (source.dataIntegrity?.indexes || []).slice(0, 8),
    },
    integrations: (source.integrations || []).slice(0, 10).map(item =>
      [item.capability, item.provider, item.connectionMetadata]),
    requirementTraceabilityGroups: source.requirementTraceabilityGroups || [],
    requirementsNeedingSemanticMapping: (source.requirementsNeedingSemanticMapping || []).slice(0, 20),
    dependencyEdges: (source.dependencyEdges || []).slice(0, 24),
    graphIntegrity: {
      valid: source.graphIntegrity?.valid === true,
      nodeCount: source.graphIntegrity?.nodeCount || 0,
      edgeCount: source.graphIntegrity?.edgeCount || 0,
      unreachableNodeIds: (source.graphIntegrity?.unreachableNodeIds || []).slice(0, 5),
    },
    crossLayerContracts: source.crossLayerContracts,
    security: {
      defaultPosture: source.security?.defaultPosture,
      controls: (source.security?.controls || []).slice(0, 10),
      migrationPolicy: source.security?.migrationPolicy,
    },
    backgroundWork: {
      required: source.backgroundWork?.required === true,
      pattern: source.backgroundWork?.pattern,
      controls: (source.backgroundWork?.controls || []).slice(0, 5),
    },
    stateMachines: (source.stateMachines || []).slice(0, 14).map(machine => ({
      entity: machine.entity,
      initialState: machine.initialState,
      states: (machine.states || []).slice(0, 6),
      transitions: (machine.transitions || []).slice(0, 3),
      invariant: machine.invariant,
    })),
    testPlan: (source.testPlan || []).slice(0, 12).map(test => ({
      id: test.id, type: test.type, status: test.status,
      requiresExplicitOwnerApproval: test.requiresExplicitOwnerApproval === true,
    })),
    deployment: source.deployment,
    honestyRules: (source.honestyRules || []).slice(0, 8),
  };
}

function serializeWebsiteEngineModelPlan(plan) {
  const requirements = Array.isArray(plan.requirementManifest?.requirements)
    ? plan.requirementManifest.requirements
    : [];
  // The model receives a compact classification for every requirement, not
  // just excerpts. This makes hard exclusions, critical needs and unmapped
  // clauses visible even when the full brief is too large for a long excerpt.
  const categoryCodes = {
    security: 's', identity: 'i', data: 'd', commerce: 'c',
    integration: 'x', routes: 'r', interaction: 'u', design: 'v',
    content: 't', responsive: 'w', accessibility: 'a',
    performance: 'p', seo: 'o', assets: 'm', localization: 'l',
    constraints: 'q', general: 'g',
  };
  // Each compact entry is positionally aligned with requirementManifest.requirements.
  // Omitting repeated IDs keeps all 180 classifications inside the existing
  // 18 KB model-plan budget, including for complex full-stack briefs.
  const requirementSignals = (plan.requirementIntelligence?.requirements || [])
    .slice(0, 180)
    .map(item => {
      const polarity = item.polarity === 'prohibited' ? '!' : item.polarity === 'required' ? '+' : '~';
      const priority = item.priority === 'critical' ? 'C' : item.priority === 'high' ? 'H' : 'N';
      const categories = (Array.isArray(item.categories) ? item.categories : [])
        .map(category => categoryCodes[category] || 'g').join('');
      const mapping = item.mappingStatus === 'mapped' ? 'M' : 'U';
      return polarity + priority + ':' + categories + ':' + mapping;
    });
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
      requirementIntelligence: {
        status: clean(plan.requirementIntelligence?.status, 48),
        // Positionally aligned compact entries: [polarity][priority]:[category letters]:[mapping].
        requirementSignals,
        counts: compactPlanValue(plan.requirementIntelligence?.counts),
        conflicts: compactPlanList((plan.requirementIntelligence?.conflicts || []).map(item => item.requirementIds.join(' / ') + ': ' + item.sharedIntent), 8, 180),
        unmappedRequirementIds: compactPlanList(plan.requirementIntelligence?.unmappedRequirementIds, 30, 12),
      },
      fileArchitecture: {
        status: clean(plan.fileArchitecture?.status, 40),
        fileCount: Number(plan.fileArchitecture?.fileCount) || 0,
        dependencyCount: Number(plan.fileArchitecture?.dependencyCount) || 0,
        unresolvedLocalReferenceCount: Number(plan.fileArchitecture?.unresolvedLocalReferenceCount) || 0,
        truncated: plan.fileArchitecture?.truncated === true,
        impactAnalysis: compactPlanValue(plan.fileArchitecture?.impactAnalysis),
        nodes: compactPlanList((plan.fileArchitecture?.graph?.nodes || []).map(node => node.path + ' [' + node.kind + ']'), 24, 100),
        dependencies: compactPlanList((plan.fileArchitecture?.graph?.edges || []).map(edge => edge.from + ' -> ' + edge.to + ' (' + edge.kind + ')'), 40, 140),
        missingReferences: compactPlanList((plan.fileArchitecture?.graph?.missingReferences || []).map(item => item.from + ' -> ' + item.specifier), 12, 120),
      },
      qualityGates: compactPlanList(plan.qualityGates, 14, 140),
      fullStackArchitecture: compactWebsiteFullStackContract(plan.fullStackArchitecture),
      implementationRules: compactPlanList(plan.implementationRules, 10, 160),
      detailSummariesAreBounded: true,
    };
  };

  for (const excerptChars of [96, 80, 64, 48, 32, 16, 0]) {
    const serialized = JSON.stringify(makeModelPlan(excerptChars));
    if (serialized.length <= WEBSITE_ENGINE_PLAN_JSON_LIMIT) return serialized;
  }

  const minimal = makeModelPlan(0);
  minimal.requirementManifest.constraints = minimal.requirementManifest.constraints.slice(0, 10);
  minimal.requirementIntelligence.unmappedRequirementIds = minimal.requirementIntelligence.unmappedRequirementIds.slice(0, 12);
  minimal.integrations = minimal.integrations.slice(0, 5);
  minimal.fileArchitecture = {
    status: minimal.fileArchitecture.status,
    fileCount: minimal.fileArchitecture.fileCount,
    dependencyCount: minimal.fileArchitecture.dependencyCount,
    unresolvedLocalReferenceCount: minimal.fileArchitecture.unresolvedLocalReferenceCount,
    truncated: minimal.fileArchitecture.truncated,
    nodes: minimal.fileArchitecture.nodes.slice(0, 10),
    dependencies: minimal.fileArchitecture.dependencies.slice(0, 12),
    missingReferences: minimal.fileArchitecture.missingReferences.slice(0, 6),
  };
  minimal.designArchitecture = {
    mission: clean(plan.designArchitecture?.mission, 120),
    direction: clean(plan.designArchitecture?.direction, 120),
    mustHave: compactPlanList(plan.designArchitecture?.mustHave, 6, 96),
    experiencePrinciples: compactPlanList(plan.designArchitecture?.experiencePrinciples, 6, 96),
    conversionPrinciples: compactPlanList(plan.designArchitecture?.conversionPrinciples, 6, 96),
    antiTemplateRules: compactPlanList(plan.designArchitecture?.antiTemplateRules, 6, 96),
  };
  minimal.interactionArchitecture = {
    capabilities: compactPlanList(plan.interactionArchitecture?.capabilities, 10, 64),
    interactionConcepts: compactPlanList(plan.interactionArchitecture?.interactionConcepts, 6, 100),
  };
  minimal.qualityGates = compactPlanList(plan.qualityGates, 8, 100);
  minimal.implementationRules = compactPlanList(plan.implementationRules, 8, 100);
  if (plan.fullStackArchitecture) {
    const fullStack = plan.fullStackArchitecture;
    const groupedRequirements = new Map();
    for (const item of fullStack.requirementMappings || []) {
      const targets = (item.targetNodeIds || []).slice(0, 3);
      const key = item.assessment + '|' + targets.join('|');
      if (!groupedRequirements.has(key)) groupedRequirements.set(key, {
        assessment: item.assessment,
        targetNodeIds: targets,
        requirementIds: [],
      });
      groupedRequirements.get(key).requirementIds.push(item.requirementId);
    }
    const compactRoutes = fullStack.apiContracts || [];
    const prioritizedRoutes = [];
    const routeKeys = new Set();
    const addCompactRoute = route => {
      if (!route) return;
      const key = route.method + ' ' + route.path;
      if (!routeKeys.has(key)) { routeKeys.add(key); prioritizedRoutes.push(route); }
    };
    const criticalRoutePaths = ['/api/payments/intents', '/api/bookings', '/api/assets', '/api/forms/:formId/submissions', '/api/cart', '/api/subscriptions/checkout'];
    for (const route of compactRoutes) if (criticalRoutePaths.includes(route.path)) addCompactRoute(route);
    for (const route of compactRoutes) if (prioritizedRoutes.length < 10) addCompactRoute(route);
    const compactControls = fullStack.security?.controls || [];
    const prioritizedControls = [
      ...compactControls.filter(item => ['payment-integrity', 'upload-isolation', 'tenant-isolation'].includes(item.id)),
      ...compactControls.filter(item => !['payment-integrity', 'upload-isolation', 'tenant-isolation'].includes(item.id)),
    ].slice(0, 8);
    const compactConstraints = fullStack.dataIntegrity?.constraints || [];
    const prioritizedConstraints = [
      ...compactConstraints.filter(item => ['money-minor-units', 'inventory-reservation-integrity', 'booking-conflict-integrity'].includes(item.id)),
      ...compactConstraints.filter(item => !['money-minor-units', 'inventory-reservation-integrity', 'booking-conflict-integrity'].includes(item.id)),
    ].slice(0, 6);
    const compactTests = fullStack.testPlan || [];
    const prioritizedTests = [
      ...compactTests.filter(item => ['upload-isolation', 'payment-integrity', 'booking-conflicts', 'tenant-isolation'].includes(item.id)),
      ...compactTests.filter(item => !['upload-isolation', 'payment-integrity', 'booking-conflicts', 'tenant-isolation'].includes(item.id)),
    ].slice(0, 8);
    minimal.fullStackArchitecture = {
      version: fullStack.version,
      capabilities: fullStack.capabilities,
      apiContracts: prioritizedRoutes.slice(0, 8).map(route => ({
        id: route.id, method: route.method, path: route.path, capability: route.capability,
        authPolicy: route.authPolicy,
      })),
      dataModels: (fullStack.dataModels || []).slice(0, 8).map(model => [model.id, model.name]),
      dataIntegrity: {
        constraints: prioritizedConstraints.map(item => [item.id, clean(item.appliesTo, 40), clean(item.rule, 64)]),
      },
      requirementTraceabilityGroups: [...groupedRequirements.values()].map(group => ({
        assessment: group.assessment,
        targetNodeIds: group.targetNodeIds.slice(0, 2),
        requirementIds: group.requirementIds,
      })),
      graphIntegrity: {
        valid: fullStack.graphIntegrity?.valid === true,
        nodeCount: fullStack.graphIntegrity?.nodeCount || 0,
        edgeCount: fullStack.graphIntegrity?.edgeCount || 0,
        unreachableNodeIds: (fullStack.graphIntegrity?.unreachableNodeIds || []).slice(0, 3),
      },
      security: {
        defaultPosture: fullStack.security?.defaultPosture,
        controls: prioritizedControls.map(item => [item.id, clean(item.requirement, 64)]),
      },
      stateMachines: (fullStack.stateMachines || [])
        .filter(machine => ['PaymentAttempt', 'Booking', 'Order', 'CustomerSubscription'].includes(machine.entity))
        .slice(0, 4)
        .map(machine => ({
          entity: machine.entity,
          initialState: machine.initialState,
          states: (machine.states || []).slice(0, 6),
          transitions: (machine.transitions || []).slice(0, 2).map(item => [item.from, item.to]),
        })),
      testPlan: prioritizedTests.map(test => [test.id, test.type, test.status]),
    };
  }
  const serialized = JSON.stringify(minimal);
  if (serialized.length > WEBSITE_ENGINE_PLAN_JSON_LIMIT) {
    throw new RangeError('The Website Engine plan exceeds its safe instruction budget.');
  }
  return serialized;
}

export function buildWebsiteEngineInstructions(plan) {
  if (!plan || plan.engine !== 'ovyx-unified-website-engine') return '';
  const serializedPlan = serializeWebsiteEngineModelPlan(plan);
  const requirementRules = Array.isArray(plan.requirementIntelligence?.rules) ? plan.requirementIntelligence.rules : [];
  const fullStackRules = plan.fullStackArchitecture ? [
    'OVYX FULL-STACK ARCHITECTURE CONTRACT — ONE COHERENT APPLICATION',
    'Implement the declared architecture as connected source code, not as a proposal, mockup or disconnected collection of files. When backend capability is requested, do not silently return a frontend-only site.',
    'For each declared API contract, generate the matching server route/handler for the selected framework and HTTP method, validate inputs on the server, enforce the stated authorization policy, return the declared safe success/error contract, and connect every consumer in the frontend to that exact route.',
    'Generate the declared domain schema, relationships, constraints and indexes from one consistent source of truth. Ensure route model references resolve to the actual schema. Include additive migrations and a dry-run/rollback path; do not execute destructive or production migrations without explicit owner approval.',
    'Implement the declared workflow state machines with server-authoritative transitions. Never trust browser-supplied roles, owners, prices, totals, inventory, payment success, availability or provider events.',
    'For commerce, implement persistent cart read/add/update/remove, server-recomputed quote, atomic stock reservation/release, checkout, immutable order snapshots, customer order history and role-scoped staff fulfillment. Every UI action must call its matching API and reflect persisted results.',
    'For subscriptions, implement server-owned plan catalog, recurring provider checkout, invoice history, renewal/failure/grace-period handling, cancellation/resume and entitlement gates. Activate or revoke paid access only after authoritative provider reconciliation; never trust a browser redirect.',
    'For dashboards, derive every KPI from tenant-scoped persisted records with bounded date ranges, explicit timezone, pagination and role-safe aggregation. Do not invent sample revenue, order counts or customer metrics in production views.',
    'For notifications, create events only after the business transaction commits, use an idempotent outbox, separate queued/accepted/delivered/read states, enforce recipient ownership and provide retry/failure feedback.',
    'For integrations, use typed server-only adapters with per-environment credentials, health probes, bounded timeouts, signature-verified webhooks, replay protection, redacted logs and visible disconnected/degraded states. Never fake a successful connection or delivery.',
    'For automation, generate tenant-scoped scheduled/event workflows with unique run keys, bounded execution, retry budgets, dead-letter visibility and explicit approval for irreversible or financial actions.',
    'Use server-side adapters for integrations, bounded timeouts, retry only safe/idempotent operations, idempotency keys, replay protection and auditable reconciliation. A configured connection is not a live delivery or transaction.',
    'Keep provider credentials in server bindings or encrypted server-side storage. Add only variable names and safe setup guidance to environment templates; never generate real secrets or expose them to browser code, URLs, logs or exported client bundles.',
    'Generate tests for route contracts, schemas, authorization-negative cases, business state transitions and end-to-end user journeys. Do not mark a route, database write, integration or deployment complete because its source file or mock test exists.',
    'Preserve existing project files and scoped-edit boundaries. Build the dependency graph before broad edits, update every affected consumer, and report unresolved requirements instead of silently omitting them.',
  ] : [];
  return [
    'OVYX UNIFIED WEBSITE ENGINE — AUTHORITATIVE PRE-GENERATION PLAN',
    'The complete original user brief is supplied separately as the task prompt and remains authoritative. The JSON below is a bounded architecture plan and requirement index; its clause excerpts never replace the original brief.',
    serializedPlan,
    'REQUIREMENT SIGNAL LEGEND: requirementSignals is positionally aligned with requirementManifest.requirements; entry N describes the requirement at index N. Each compact entry is [polarity][priority]:[category letters]:[mapping]. Polarity + means required, ! means prohibited and must remain excluded, ~ means preference. Priority C is critical, H is high, N is normal. Mapping M means linked to architecture nodes; U means still unmapped. Category letters: s=security, i=identity, d=data, c=commerce, x=integration, r=routes, u=interaction, v=design, t=content, w=responsive, a=accessibility, p=performance, o=SEO, m=assets, l=localization, q=explicit constraints, g=general. These are deterministic signals, not a substitute for reading the complete brief.',
    ...fullStackRules,
    ...requirementRules.map(rule => 'REQUIREMENT RECONCILIATION: ' + rule),
    'AUTONOMOUS QA PLAN OUTPUT: For a new website build, add a root file named ovyx-qa-plan.json with strict JSON {"version":1,"journeys":[...],"apiChecks":[...],"backendChecks":[...]}. Derive journeys from the original brief and the actual implemented UI. Include at least one executable journey for every website (for a simple brochure site, verify its primary page and navigation/CTA). Each journey has id, name, startRoute and ordered steps. Limit the manifest to 12 journeys total, no more than 4 journeys per route, and no more than 30 steps per journey. Supported step actions are click {selector}, fill {selector,value}, check {selector}, uncheck {selector}, select {selector,value}, expectText {selector?,text}, expectVisible {selector}, expectHidden {selector}, expectUrl {route}, and expectValue {selector,value}. Create a separate journey for each page route rather than using a cross-page goto step. Use stable, unique data-testid selectors for important controls. Assert observable outcomes and resulting UI state after each action, not merely that a click occurred. Include the primary navigation, main call-to-action, form validation/success state, and every explicitly requested critical user journey that can be safely exercised without real credentials or financial side effects.',
    'For supported Cloudflare Pages Functions + D1 projects, add backendChecks for important real API workflows. Each check has id, name, method, /api/ route, expectedStatus, optional synthetic body, optional identity (anonymous/synthetic-owner-a/synthetic-owner-b), and optional expect {jsonPath, equals or contains}. GET/HEAD checks are read-only. POST/PUT/PATCH/DELETE checks must declare sideEffect:"disposable-local-only" and use synthetic non-personal data. Never include credentials, personal data or real provider calls. These checks run only in an outbound-network-disabled disposable Pages/D1 runtime; unsupported bindings or framework targets must be reported blocked, never passed.\n' +
    'For each safe unauthenticated API health/read contract, add an apiChecks entry with id, name, route, method GET or HEAD, expectedStatus, and optional jsonPath/expectedValue. Do not put credentials, tokens, personal data or secret query parameters in the plan. The runner permits only same-origin GET/HEAD probes; it will not submit real forms, create real orders, book real appointments, charge/refund payments, change subscriptions or send messages. Mark authenticated/destructive workflows as requiring an isolated synthetic-account backend fixture instead of inventing a passing browser-only test.',
    'The QA plan is test intent, not evidence of success. Keep it synchronized with real routes and controls, and never add a fake API endpoint or success response solely to satisfy a test.',
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
    requirementIntelligence: {
      status: plan.requirementIntelligence?.status || 'not-built',
      counts: plan.requirementIntelligence?.counts || null,
    },
    fileArchitecture: {
      status: plan.fileArchitecture?.status || 'not-analyzed',
      fileCount: plan.fileArchitecture?.fileCount || 0,
      dependencyCount: plan.fileArchitecture?.dependencyCount || 0,
      unresolvedLocalReferenceCount: plan.fileArchitecture?.unresolvedLocalReferenceCount || 0,
      truncated: plan.fileArchitecture?.truncated === true,
      impactAnalysis: plan.fileArchitecture?.impactAnalysis || null,
    },
    fullStackArchitecture: fullStackArchitectureClientSummary(plan.fullStackArchitecture),
  };
}

/**
 * Shared build lifecycle for the Assistant and Gateway endpoints. A fresh
 * website build uses the same multi-page planner/builder, then the same
 * single-page repair fallback if the staged builder cannot return a project.
 * Scoped edits deliberately bypass full-site rebuild and repair.
 */

function mergeGenerationUsage(...records) {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let found = false;
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const prompt = Number(record.prompt_tokens ?? record.input_tokens);
    const completion = Number(record.completion_tokens ?? record.output_tokens);
    const total = Number(record.total_tokens);
    if (Number.isFinite(prompt) || Number.isFinite(completion) || Number.isFinite(total)) {
      found = true;
      if (Number.isFinite(prompt)) promptTokens += prompt;
      if (Number.isFinite(completion)) completionTokens += completion;
      if (Number.isFinite(total)) totalTokens += total;
      else totalTokens += (Number.isFinite(prompt) ? prompt : 0) + (Number.isFinite(completion) ? completion : 0);
    }
  }
  return found ? {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  } : null;
}

function parseBackendFiles(response) {
  const candidates = [response, response && response.output, response && response.result, response && response.data];
  for (const item of candidates) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    let files = item.files || item.generatedFiles || item.projectFiles;
    if (!files && typeof item.text === 'string') {
      let raw = item.text.trim();
      const fence = String.fromCharCode(96).repeat(3);
      if (raw.startsWith(fence)) {
        const newline = raw.indexOf('\n');
        raw = newline >= 0 ? raw.slice(newline + 1) : '';
      }
      if (raw.endsWith(fence)) raw = raw.slice(0, -3).trim();
      try { files = JSON.parse(raw).files; } catch {
        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        if (first >= 0 && last > first) {
          try { files = JSON.parse(raw.slice(first, last + 1)).files; } catch {}
        }
      }
    }
    if (!files || typeof files !== 'object' || Array.isArray(files)) continue;
    const output = {};
    let totalSourceBytes = 0;
    const maxBackendFiles = 80;
    const maxBackendSourceBytes = 900000;
    for (const [rawPath, value] of Object.entries(files)) {
      let filePath = String(rawPath || '').trim();
      while (filePath.startsWith('/')) filePath = filePath.slice(1);
      const fileContent = typeof value === 'string' ? value : value && (value.content || value.text || value.code);
      const allowedRoot = [
        'functions/', 'api/', 'app/api/', 'src/app/api/', 'pages/api/', 'src/pages/api/',
        'prisma/', 'migrations/', 'drizzle/', 'db/', 'database/', 'server/', 'src/server/',
        'src/lib/server/', 'src/routes/', 'app/routes/', 'server/api/', 'server/routes/', 'tests/', 'test/', '__tests__/',
      ].some(prefix => filePath.startsWith(prefix));
      const allowedExtension = [
        '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.prisma', '.sql',
        '.graphql', '.gql', '.yaml', '.yml', '.toml', '.json',
      ].some(extension => filePath.toLowerCase().endsWith(extension));
      const lowerPath = filePath.toLowerCase();
      const containsCredentialMaterial = typeof fileContent === 'string' && (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(fileContent) ||
        /sk_(?:live|test)_[A-Za-z0-9]{12,}/.test(fileContent) ||
        /AIza[0-9A-Za-z_-]{30,}/.test(fileContent) ||
        /AKIA[0-9A-Z]{16}/.test(fileContent) ||
        /Bearer\s+[A-Za-z0-9._-]{24,}/i.test(fileContent)
      );
      const containsUnsafeExecution = typeof fileContent === 'string' &&
        /\beval\s*\(|new\s+Function\s*\(|\bchild_process\b|\bexecSync\s*\(|\bspawn\s*\(/i.test(fileContent);
      if (!filePath || filePath.length > 300 || filePath.includes('..') || filePath.includes(String.fromCharCode(92)) ||
          lowerPath.includes('.env') || lowerPath.includes('secret') || lowerPath.includes('credential') ||
          lowerPath.includes('private-key') || lowerPath.includes('service-account') ||
          !allowedExtension || !allowedRoot || typeof fileContent !== 'string' ||
          !fileContent.trim() || fileContent.length > 180000 || containsCredentialMaterial || containsUnsafeExecution ||
          Object.keys(output).length >= maxBackendFiles || totalSourceBytes + fileContent.length > maxBackendSourceBytes) continue;
      output[filePath] = fileContent;
      totalSourceBytes += fileContent.length;
    }
    if (Object.keys(output).length) return output;
  }
  return {};
}

function collectLocalBackendModuleSource(entryFile, files) {
  const pathMap = new Map(Object.keys(files || {}).map(filePath => [filePath.toLowerCase(), filePath]));
  const visited = new Set();
  let total = 0;
  function resolve(fromFile, specifier) {
    if (!specifier || !specifier.startsWith('.')) return '';
    const parts = fromFile.split('/');
    parts.pop();
    for (const part of specifier.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) return '';
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    const base = parts.join('/');
    const candidates = [base, ...['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].map(ext => base + ext),
      ...['index.js', 'index.ts', 'index.tsx'].map(name => base + '/' + name)];
    return candidates.map(candidate => pathMap.get(candidate.toLowerCase())).find(Boolean) || '';
  }
  function visit(filePath, depth) {
    if (!filePath || depth > 6 || visited.size >= 24 || visited.has(filePath.toLowerCase()) || total >= 500000) return '';
    visited.add(filePath.toLowerCase());
    const source = String(files[filePath] || '');
    total += source.length;
    const imports = [];
    for (const match of source.matchAll(/(?:\bimport\s+(?:[\s\S]*?\s+from\s+)?|\bexport\s+[\s\S]*?\s+from\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const dependency = resolve(filePath, match[1]);
      if (dependency) imports.push(dependency);
    }
    return source + '\n' + imports.map(dependency => visit(dependency, depth + 1)).join('\n');
  }
  return visit(entryFile, 0);
}

function auditBackendFiles(files, architecture) {
  const entries = Object.entries(files || {});
  const pathMap = new Map(entries.map(([filePath]) => [filePath.toLowerCase(), filePath]));
  const routes = (architecture.apiContracts || []).map(route => {
    let suffix = String(route.path || '').trim();
    while (suffix.startsWith('/')) suffix = suffix.slice(1);
    if (suffix.toLowerCase().startsWith('api/')) suffix = suffix.slice(4);
    suffix = suffix.split('/').filter(Boolean).map(part =>
      part.startsWith(':') ? '[' + part.slice(1) + ']' : part
    ).join('/');
    const remixSuffix = suffix.split('/').map(part => part.startsWith('[') ? String.fromCharCode(36) + part.slice(1, -1) : part).join('.');
    const verb = String(route.method || 'GET').toLowerCase();
    const candidates = [
      'functions/api/' + suffix + '.js', 'functions/api/' + suffix + '.ts',
      'functions/api/' + suffix + '/index.js', 'app/api/' + suffix + '/route.js',
      'app/api/' + suffix + '/route.ts', 'src/app/api/' + suffix + '/route.ts',
      'pages/api/' + suffix + '.js', 'pages/api/' + suffix + '.ts',
      'src/routes/api/' + suffix + '/+server.js', 'src/routes/api/' + suffix + '/+server.ts',
      'server/api/' + suffix + '.' + verb + '.js', 'server/api/' + suffix + '.' + verb + '.ts',
      'server/api/' + suffix + '.js', 'server/api/' + suffix + '.ts',
      'app/routes/api.' + remixSuffix + '.js', 'app/routes/api.' + remixSuffix + '.ts',
      'server/routes/' + suffix + '.js', 'server/routes/' + suffix + '.ts',
      'api/' + suffix + '.js', 'api/' + suffix + '.ts',
    ];
    const file = candidates.map(candidate => pathMap.get(candidate.toLowerCase())).find(Boolean) || '';
    const code = file ? collectLocalBackendModuleSource(file, files) : '';
    const method = String(route.method || 'GET').toUpperCase();
    const pascal = method.charAt(0) + method.slice(1).toLowerCase();
    const lowerFile = file.toLowerCase();
    const methodOk = !!file && (
      code.includes('onRequest' + pascal) ||
      code.includes('export const ' + method) ||
      code.includes('export async function ' + method) ||
      code.includes('export const ' + (method === 'GET' ? 'loader' : 'action')) ||
      code.includes('function ' + method) ||
      code.includes('function ' + pascal) ||
      (lowerFile.startsWith('server/api/') && code.includes('defineEventHandler')) ||
      code.toLowerCase().includes('router.' + method.toLowerCase() + '(') ||
      code.toLowerCase().includes('app.' + method.toLowerCase() + '(') ||
      (lowerFile.includes('/+server.') && code.includes('export const ' + method)) ||
      (lowerFile.includes('/routes/api.') && code.includes(method === 'GET' ? 'loader' : 'action')) ||
      (lowerFile.startsWith('server/api/') && lowerFile.includes('.' + method.toLowerCase() + '.') && code.includes('defineEventHandler'))
    );
    const policy = String(route.authPolicy || '').toLowerCase();
    const publicRoute = policy.startsWith('public');
    const routeNeedsValidation = ['POST', 'PUT', 'PATCH'].includes(method);
    const validationDetected = !routeNeedsValidation ||
      /(?:\.safeParse|\.parse|\bvalidate(?:[A-Z][A-Za-z]+|Request|Input|Body|Schema)?|\bassertValid)\s*\(/i.test(code);
    const databaseClientDetected = /\.prepare\s*\(|\b(?:prisma|drizzle|supabase|firestore|collection|database|repository|db)\s*(?:\.|\()/i.test(code);
    const databaseReadDetected = /\bSELECT\s+|\.first\s*\(|\.all\s*\(|\.get\s*\(|\.find(?:Many|First|Unique|One)?\s*\(|\.select\s*\(|\.query\s*\(/i.test(code);
    const databaseWriteDetected = /\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_][\w.]*\s+SET|DELETE\s+FROM)\b|\.run\s*\(|\.execute\s*\(|\.insert\s*\(|\.create\s*\(|\.update\s*\(|\.delete\s*\(|\.set\s*\(|\.add\s*\(|\.upsert\s*\(|\.put\s*\(/i.test(code);
    const persistenceExpected = Array.isArray(route.modelIds) && route.modelIds.length > 0;
    const persistenceDetected = !persistenceExpected || (databaseClientDetected &&
      (method === 'GET' ? databaseReadDetected : databaseWriteDetected));
    const abuseExpected = policy.includes('abuse-controls') || policy.includes('rate-limit');
    const abuseDetected = !abuseExpected || /enforceRateLimit|checkRateLimit|rateLimiter|rateLimitRequest|verifyTurnstile|verifyCaptcha|throttleRequest/i.test(code);
    const consentExpected = policy.includes('consent');
    const consentDetected = !consentExpected || /consent|doubleOptIn|confirmedAt/i.test(code);
    const publicationExpected = policy.includes('published');
    const publicationDetected = !publicationExpected || /isPublished|publishedAt|publicationStatus|assertPublished/i.test(code);
    const quarantineExpected = policy.includes('quarantine');
    const quarantineDetected = !quarantineExpected || /quarantine|scanStatus|malwareScan|publicationApproval/i.test(code);
    const credentialExpected = policy.includes('credential-provider');
    const credentialDetected = !credentialExpected || /verifyCredentials|verifyPassword|verifyIdToken|identityToken|credentialProvider|providerSubject/i.test(code);
    const ownerScopeExpected = policy.includes('owner') || policy.includes('resource-scope') || policy.includes('object-level') || policy.includes('tenant');
    const ownerScopeDetected = !ownerScopeExpected || /assertOwner|assertResourceOwner|requireOwner|verifyOwnership|tenantId|ownerId|resourceOwner|scopeToUser/i.test(code);
    let authorizationDetected;
    if (policy.includes('provider-signature')) {
      const signature = /verifyWebhookSignature|verifySignature|constructEvent/i.test(code);
      const replay = /eventId|event\.id|idempotencyKey|replay|processedEvent|webhookEvent/i.test(code);
      authorizationDetected = signature && replay;
    } else if (policy.includes('signed-unsubscribe-token')) {
      authorizationDetected = /verifyUnsubscribeToken|validateUnsubscribeToken|verifySignature|tokenHash/i.test(code);
    } else if (publicRoute) {
      authorizationDetected = abuseDetected && consentDetected && publicationDetected && quarantineDetected && credentialDetected;
    } else {
      const authenticated = /requireAuth|assertAuthenticated|getAuthenticatedUser|verifySession|verifyIdToken/i.test(code);
      const elevated = !(/administrator|role|permission|staff/.test(policy)) ||
        /requireAdmin|requireRole|authorize|assertPermission/i.test(code);
      authorizationDetected = authenticated && elevated && ownerScopeDetected;
    }
    return {
      id: route.id, method, path: route.path, file: file || null, methodOk,
      authOk: authorizationDetected, ownerScopeExpected, ownerScopeDetected,
      validationExpected: routeNeedsValidation, validationDetected,
      persistenceExpected, persistenceDetected, databaseClientDetected, databaseReadDetected, databaseWriteDetected,
      abuseExpected, abuseDetected, consentExpected, consentDetected, publicationExpected, publicationDetected, quarantineExpected, quarantineDetected,
    };
  });
  const schemaFiles = entries.filter(([filePath]) => {
    const lower = filePath.toLowerCase();
    return lower.includes('schema') || lower.includes('migration') || lower.includes('prisma') || lower.includes('drizzle') || lower.includes('database') || lower.includes('index');
  });
  const schema = schemaFiles.map(entry => entry[1]).join('\n').toLowerCase();
  const databaseIntegration = (architecture.integrations || []).find(item => item.capability === 'database');
  const databaseProvider = String(databaseIntegration && databaseIntegration.provider || 'not-selected-by-architecture-planner');
  const documentDatabase = /firebase|firestore/i.test(databaseProvider);
  const migrationFiles = entries.filter(([filePath]) => {
    const lower = filePath.toLowerCase();
    return lower.startsWith('migrations/') || lower.startsWith('drizzle/') || lower.includes('/migrations/') ||
      lower.startsWith('prisma/migrations/');
  });
  const migrationEvidence = (architecture.dataModels || []).length === 0 ||
    (documentDatabase
      ? schemaFiles.some(([filePath]) => filePath.toLowerCase().includes('firestore'))
      : migrationFiles.length > 0);
  const models = (architecture.dataModels || []).map(model => {
    const name = String(model.name || '');
    const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const plural = snake.endsWith('s') ? snake : snake + 's';
    const present = schema.includes('model ' + name.toLowerCase()) ||
      schema.includes(name.toLowerCase() + 'schema') ||
      schema.includes('collection(' + String.fromCharCode(39) + plural + String.fromCharCode(39) + ')') ||
      schema.includes('create table ' + plural) ||
      schema.includes('create table if not exists ' + plural) ||
      schema.includes('create table "' + plural + '"') ||
      schema.includes("create table '" + plural + "'") ||
      schema.includes('createtable("' + plural + '"') ||
      schema.includes("createtable('" + plural + "'");
    return { id: model.id, name, present };
  });
  const modelNamesById = new Map((architecture.dataModels || []).map(model => [String(model.id), String(model.name || '')]));
  const relations = (architecture.dataIntegrity && architecture.dataIntegrity.relationships || []).map(relation => {
    const field = String(relation.foreignKeyField || '').toLowerCase();
    const from = modelNamesById.get(String(relation.from)) || String(relation.from || '').replace(/^model-/, '');
    const to = modelNamesById.get(String(relation.to)) || String(relation.to || '').replace(/^model-/, '');
    const toTable = value => {
      const snake = String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
      return snake.endsWith('s') ? snake : snake + 's';
    };
    const relationSignal = /foreign key|references|@relation|relation|reference|ref\b/i.test(schema);
    const polymorphic = relation.kind === 'polymorphic-reference'
      ? /sourceType|targetType|entityType/i.test(schema)
      : schema.includes(from.toLowerCase()) || schema.includes(toTable(from));
    const targetPresent = relation.kind === 'polymorphic-reference'
      ? true
      : schema.includes(to.toLowerCase()) || schema.includes(toTable(to));
    return {
      id: relation.id, field,
      present: !!field && schema.includes(field) && polymorphic && targetPresent && relationSignal,
    };
  });
  const uniqueSource = entries.map(entry => entry[1]).join('\n').toLowerCase();
  const indexes = (architecture.dataIntegrity && architecture.dataIntegrity.indexes || []).map(index => {
    const entity = String(index.entity || '');
    const snake = entity.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const table = snake.endsWith('s') ? snake : snake + 's';
    const fields = Array.isArray(index.fields) ? index.fields.map(field => String(field).toLowerCase()) : [];
    const fieldsPresent = fields.length > 0 && fields.every(field => schema.includes(field));
    const entityPresent = schema.includes(entity.toLowerCase()) || schema.includes(table);
    const sqlIndex = schema.includes('create index') || schema.includes('create unique index');
    const ormIndex = schema.includes('@@index') || schema.includes('uniqueindex(') || schema.includes('index(');
    const documentIndex = schema.includes('collectiongroup') || schema.includes('indexes');
    const uniquePresent = !index.unique || (documentDatabase
      ? /transaction|runtransaction/.test(uniqueSource) && /unique|reservation/.test(uniqueSource)
      : schema.includes('unique') || schema.includes('@@unique') || schema.includes('uniqueindex('));
    return {
      entity, fields, unique: Boolean(index.unique),
      present: fieldsPresent && entityPresent && (sqlIndex || ormIndex || documentIndex) && uniquePresent,
    };
  });
  const allGeneratedSource = entries.map(entry => entry[1]).join('\n').toLowerCase();
  const testFiles = entries.filter(([filePath]) =>
    filePath.startsWith('tests/') || filePath.startsWith('test/') || filePath.startsWith('__tests__/')
  );
  const generatedTestSource = testFiles.map(entry => entry[1]).join('\n').toLowerCase();
  const testEvidence = testFiles.length > 0 &&
    /\btest\s*\(|\bit\s*\(|\bdescribe\s*\(|\bassert\./i.test(generatedTestSource) &&
    /authorization|permission|owner|role|rate.?limit/i.test(generatedTestSource) &&
    /idempotency/i.test(generatedTestSource) &&
    /transition|state.?machine/i.test(generatedTestSource);
  const workflows = (architecture.stateMachines || []).map(machine => {
    const entity = String(machine.entity || '').toLowerCase();
    const states = Array.isArray(machine.states) ? machine.states.map(state => String(state).toLowerCase()) : [];
    const statesPresent = states.length > 0 && states.every(state => allGeneratedSource.includes(state));
    const transitionPresent = allGeneratedSource.includes('transition') && !!entity && allGeneratedSource.includes(entity);
    return { id: machine.id, entity: machine.entity, statesExpected: states.length, statesPresent, transitionPresent };
  });
  const missing = [];
  routes.forEach(route => {
    if (!route.file) missing.push('Missing route file: ' + route.method + ' ' + route.path);
    else if (!route.methodOk) missing.push('Missing HTTP method handler: ' + route.method + ' ' + route.path);
    if (!route.authOk) missing.push('Missing authorization/signature evidence: ' + route.path);
    if (!route.validationDetected) missing.push('Missing strict server-side request validation: ' + route.path);
    if (!route.persistenceDetected) missing.push('Missing executable database read/write evidence for declared route models: ' + route.path);
  });
  models.filter(model => !model.present).forEach(model => missing.push('Missing database schema model: ' + model.name));
  if (!migrationEvidence) missing.push(documentDatabase ? 'Missing Firestore collection/index schema artifact.' : 'Missing versioned database migration artifact.');
  relations.filter(relation => !relation.present).forEach(relation => missing.push('Missing database relationship field: ' + relation.field));
  indexes.filter(index => !index.present).forEach(index => missing.push('Missing database index: ' + index.entity + '(' + index.fields.join(', ') + ')'));
  workflows.filter(workflow => !workflow.statesPresent || !workflow.transitionPresent).forEach(workflow =>
    missing.push('Missing business workflow implementation evidence: ' + workflow.entity)
  );
  if (!testEvidence) missing.push('Missing safe generated backend regression tests for authorization, idempotency and workflow transitions.');
  return {
    status: missing.length ? 'incomplete-source-generation' : 'source-evidence-present-runtime-unverified',
    routeCount: routes.length, routeSourceCount: routes.filter(route => route.file).length,
    routeMethodCount: routes.filter(route => route.methodOk).length,
    authorizationEvidenceCount: routes.filter(route => route.authOk).length,
    requestValidationEvidenceCount: routes.filter(route => route.validationDetected).length,
    persistenceEvidenceCount: routes.filter(route => route.persistenceDetected).length,
    modelCount: models.length, modelSchemaEvidenceCount: models.filter(model => model.present).length,
    databaseProvider, migrationEvidence, migrationFileCount: migrationFiles.length,
    relationshipCount: relations.length, relationshipEvidenceCount: relations.filter(relation => relation.present).length,
    indexCount: indexes.length, indexEvidenceCount: indexes.filter(index => index.present).length,
    workflowCount: workflows.length, workflowEvidenceCount: workflows.filter(workflow => workflow.statesPresent && workflow.transitionPresent).length,
    workflowEvidence: workflows, generatedTestFileCount: testFiles.length, generatedTestEvidence: testEvidence,
    runtimeBehaviorVerified: false, databasePersistenceVerified: false, integrationDeliveryVerified: false,
    missing: missing.slice(0, 40), routeEvidence: routes,
  };
}

function buildBackendSourcePrompt(architecture, originalPrompt, existingPaths, failures) {
  const contract = fullStackArchitectureModelContract(architecture);
  return [
    'OVYX FULL-STACK SOURCE GENERATION — REQUIRED IMPLEMENTATION STAGE',
    'Return only valid JSON: {"files":{"relative/path":"complete source text"}}. No Markdown fences.',
    'Generate real server route handlers, database schema, versioned migrations, relationships, constraints, indexes and safe tests for every declared API contract and model. A frontend-only response is not acceptable.',
    'Preserve the framework detected in existing project paths: Cloudflare Pages Functions, Next.js App Router/Pages Router, SvelteKit, Remix, Nuxt or an existing Node server. Use that framework’s native route-handler conventions. Prefer the explicitly selected database/auth/payment/email provider in the architecture contract; its connection metadata is not proof of live access, so generate server-only adapters and fail safely when bindings are absent. Only when no framework or database provider is selected, target Cloudflare Pages Functions with Cloudflare D1-compatible SQLite migrations and matching onRequestGet/onRequestPost/onRequestPut/onRequestPatch/onRequestDelete exports.',
    'Every route that declares data models must execute a real provider-backed read or write through a server-only repository/service in the same route or an imported local module. Generate actual create/read/update/delete operations required by the declared routes; never satisfy persistence with hard-coded arrays, in-memory maps, TODOs, mock repositories or success-shaped responses. Mutating handlers must validate request bodies with a concrete schema/validator before side effects. Use prepared database statements, safe error envelopes, size limits, owner scoping, deny-by-default authorization, idempotency and transactional business-state changes. Missing DB/auth bindings must fail explicitly; never simulate persistence or success.',
    'Generate provider-appropriate schemas, migrations, relationships, constraints and indexes for every model. Use SQL CREATE TABLE/foreign keys plus a versioned migrations/0001_initial.sql for relational databases; for Firebase Firestore emit db/firestore-schema.js and db/firestore.indexes.json with explicit collection/document validators, reference fields and required composite-index declarations. Keep money in integer minor units with ISO currency and timestamps in UTC with IANA timezone context.',
    'Generate protected identity/authorization middleware and negative permission tests when requested. Payment webhooks require signature and replay verification; booking commits must recheck availability; external email requires an outbox and verified receipt.',
    'For uploaded assets, implement provider-native private object storage with short-lived signed upload/download URLs where supported. Generate opaque owner-scoped object keys; enforce per-file and per-project quotas, allowlisted MIME types, actual content/signature checks, byte limits and checksum verification. Persist metadata only after upload verification, keep private/quarantined objects inaccessible by default, and never trust browser-supplied owner IDs, paths, MIME claims or public URLs.',
    'For forms, load the active server-owned schema version, reject unknown fields, validate each field type/length/format and required consent, enforce abuse throttles and idempotency, derive submitter ownership from verified identity, and redact personal data from logs.',
    'For bookings, require a valid IANA timezone and parse explicit local time into UTC instants. Recheck the slot inside the reservation transaction or provider lock, prevent overlapping active reservations under concurrency, and make confirmation/cancellation transitions idempotent.',
    'For authentication, use the selected identity provider rather than custom password storage. Verify issuer/audience/expiry, rotate and revoke sessions, use secure HttpOnly SameSite cookies and CSRF protection for cookie-authenticated mutations, and enforce resource-level authorization on every protected operation.',
    'For payments and external services, calculate billable amounts on the server, verify provider signatures and event replay windows, reconcile provider receipts before fulfillment, use a transactional outbox for notifications, and bound provider timeouts/retries without duplicating side effects.',
    'For commerce, generate persistent cart CRUD, stock movement/reservation records, order history and staff fulfillment routes; enforce atomic inventory changes and server-calculated totals. Never trust client price, discount, tax, quantity availability or paid status.',
    'For recurring subscriptions, generate plan catalog, provider subscription checkout, invoice ledger, renewal reconciliation, failed-payment/grace-period policy, cancellation/resume and server-enforced entitlements. A success redirect is not proof of payment or an active subscription.',
    'For dashboards, compute tenant-scoped metrics from real persisted records with bounded date filters, timezone correctness, role checks and paginated activity. Do not hard-code production KPIs.',
    'For notifications, persist an outbox event after the source transaction commits, deduplicate retries, enforce recipient ownership and distinguish queued, provider-accepted, delivered and read states.',
    'For integrations and webhooks, generate per-provider typed adapters, isolated environment credentials, health diagnostics, signature/timestamp/replay checks, safe timeouts, bounded retries, redacted event records and explicit disconnected/degraded states.',
    'For automation, implement scheduled/event-triggered workers with tenant scope, idempotent run IDs, bounded time/resources, retry and dead-letter states, and explicit approval before financial or irreversible actions.',
    'For commerce, generate persistent cart CRUD, stock movement/reservation records, order history and staff fulfillment routes; enforce atomic inventory changes and server-calculated totals. Never trust client price, discount, tax, quantity availability or paid status.',
    'For recurring subscriptions, generate plan catalog, provider subscription checkout, invoice ledger, renewal reconciliation, failed-payment/grace-period policy, cancellation/resume and server-enforced entitlements. A success redirect is not proof of payment or an active subscription.',
    'For dashboards, compute tenant-scoped metrics from real persisted records with bounded date filters, timezone correctness, role checks and paginated activity. Do not hard-code production KPIs.',
    'For notifications, persist an outbox event after the source transaction commits, deduplicate retries, enforce recipient ownership and distinguish queued, provider-accepted, delivered and read states.',
    'For integrations and webhooks, generate per-provider typed adapters, isolated environment credentials, health diagnostics, signature/timestamp/replay checks, safe timeouts, bounded retries, redacted event records and explicit disconnected/degraded states.',
    'For automation, implement scheduled/event-triggered workers with tenant scope, idempotent run IDs, bounded time/resources, retry and dead-letter states, and explicit approval before financial or irreversible actions.',
    'Never include secrets, .env files, credentials, private keys, real customer data or invented production prices/availability. Do not execute migrations or contact real providers.',
    'Only output backend, schema, migration, server-service and test files. Do not overwrite frontend pages, styles, browser scripts, package manifests or unrelated files.',
    'Existing project paths: ' + existingPaths.join(', '),
    failures.length ? 'Fix these missing source contracts: ' + failures.join(' | ') : '',
    'Original user brief:\n' + String(originalPrompt || '').slice(0, 80000),
    'Architecture contract:\n' + JSON.stringify(contract),
  ].filter(Boolean).join('\n\n');
}

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
    fullStackArchitecture = null,
    originalPrompt = '',
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

  let fullStackSourceEvidence = null;
  if (shouldBuild && !scopedEdit && fullStackArchitecture &&
      fullStackArchitecture.capabilities && fullStackArchitecture.capabilities.backend === true) {
    let failures = [];
    let generatedFiles = {};
    let backendResponse = null;
    let backendUsage = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourcePrompt = buildBackendSourcePrompt(
        fullStackArchitecture, originalPrompt || multiPageOptions.prompt || modelOptions.taskPrompt || '',
        [...new Set(Object.keys(multiPageOptions.files || {}).concat(Object.keys(result.files || {})))], failures
      );
      quotaInputText += (quotaInputText ? '\n\n' : '') + sourcePrompt;
      try {
        backendResponse = await callModel(env, {
          ...modelOptions,
          taskPrompt: sourcePrompt,
          system: [String(modelOptions.system || ''), 'Generate complete backend source code and output only the requested JSON files object. Never simulate database writes, identity verification or provider success.'].filter(Boolean).join('\n\n'),
          responseFormat: 'json',
        });
      } catch (generationError) {
        generationError.partialUsage = mergeGenerationUsage(result.rawUsage, backendUsage, generationError.partialUsage);
        generationError.quotaInputText = quotaInputText;
        generationError.quotaOutputText = quotaOutputText;
        throw generationError;
      }
      backendUsage = mergeGenerationUsage(backendUsage, backendResponse && (backendResponse.usage || backendResponse.rawUsage));
      quotaOutputText += (quotaOutputText ? '\n\n' : '') + String(backendResponse && backendResponse.text || '');
      generatedFiles = parseBackendFiles(backendResponse);
      fullStackSourceEvidence = auditBackendFiles(generatedFiles, fullStackArchitecture);
      if (fullStackSourceEvidence.status === 'source-evidence-present-runtime-unverified') break;
      failures = fullStackSourceEvidence.missing.length
        ? fullStackSourceEvidence.missing
        : ['No valid backend files object was returned.'];
    }
    if (!Object.keys(generatedFiles).length ||
        fullStackSourceEvidence.status !== 'source-evidence-present-runtime-unverified') {
      const error = new Error('Full-stack source generation did not satisfy the required route, authorization, schema and relationship contracts.');
      error.code = 'WEBSTUDIO_FULLSTACK_SOURCE_INCOMPLETE';
      error.fullStackSourceEvidence = fullStackSourceEvidence;
      error.partialUsage = mergeGenerationUsage(result.rawUsage, backendUsage);
      error.quotaInputText = quotaInputText;
      error.quotaOutputText = quotaOutputText;
      throw error;
    }
    result = {
      ...result,
      files: { ...(result.files || {}), ...generatedFiles },
      rawUsage: mergeGenerationUsage(result.rawUsage, backendUsage) || result.rawUsage || null,
      fullStackSourceEvidence,
      fullStackGeneration: {
        status: 'source-generated-runtime-unverified',
        filesGenerated: Object.keys(generatedFiles).length,
      },
    };

    if (!multiPageBuild) {
      const frontendHtml = typeof result.html === 'string' ? result.html
        : typeof result.content === 'string' ? result.content
          : typeof result.text === 'string' ? result.text : '';
      const hasFrontendFile = Object.keys(result.files || {}).some(filePath => {
        const backendPrefixes = [
          'functions/', 'api/', 'app/api/', 'src/app/api/', 'pages/api/', 'src/pages/api/',
          'server/', 'src/server/', 'src/lib/server/', 'src/routes/api/', 'app/routes/api.',
          'prisma/', 'migrations/', 'db/', 'database/', 'tests/', 'test/', '__tests__/',
        ];
        const isBackendPath = backendPrefixes.some(prefix => filePath.startsWith(prefix));
        return !isBackendPath && /\.(?:html?|tsx?|jsx?|astro|vue|svelte)$/i.test(filePath);
      });
      if (result.files && typeof result.files === 'object' && Object.keys(result.files).length) {
        if (!hasFrontendFile && /<(?:!doctype\s+html|html\b)/i.test(frontendHtml)) {
          result = { ...result, files: { ...result.files, 'index.html': frontendHtml } };
        }
        multiPageBuild = true;
      } else if (/<(?:!doctype\s+html|html\b)/i.test(frontendHtml)) {
        result = { ...result, files: { 'index.html': frontendHtml } };
        multiPageBuild = true;
      } else {
        const error = new Error('Full-stack generation produced backend source but no exportable frontend project file.');
        error.code = 'WEBSTUDIO_FULLSTACK_FRONTEND_FILE_MISSING';
        error.partialUsage = result.rawUsage || null;
        error.quotaInputText = quotaInputText;
        error.quotaOutputText = quotaOutputText;
        throw error;
      }
    }
  }
  if (shouldBuild && !scopedEdit) {
    const existingFiles = result.files && typeof result.files === 'object' && !Array.isArray(result.files)
      ? result.files : {};
    const frontendHtml = typeof result.html === 'string' ? result.html
      : typeof result.content === 'string' ? result.content
        : typeof result.text === 'string' && /<(?:!doctype\s+html|html\b)/i.test(result.text) ? result.text : '';
    if (!Object.keys(existingFiles).length || !Object.keys(existingFiles).some(file => /\.html?$/i.test(file))) {
      result = { ...result, files: { ...existingFiles, ...(frontendHtml ? { 'index.html': frontendHtml } : {}) } };
    }
  }

  let autonomousQa = null;
  if (shouldBuild && !scopedEdit && result.files && typeof result.files === 'object' && !Array.isArray(result.files)) {
    const initialStaticEvidence = evaluateGeneratedWebsiteFiles(result.files);
    const repairCycle = await runAutonomousRepairCycle({
      files: result.files,
      originalBrief: originalPrompt || multiPageOptions.prompt || modelOptions.taskPrompt || '',
      requiredChannels: ['static'],
      initialEvidence: [initialStaticEvidence],
      repair: async ({ prompt }) => {
        quotaInputText += (quotaInputText ? '\n\n' : '') + prompt;
        const repairResponse = await callModel(env, {
          ...modelOptions,
          taskPrompt: prompt,
          system: [
            String(modelOptions.system || ''),
            'You are performing one bounded OVYX generated-site QA repair. Return strict JSON with a files object containing complete replacements for only the exact allowlisted files. Do not claim verification or change unrelated files.',
          ].filter(Boolean).join('\n\n'),
          responseFormat: 'json',
          maxTokens: Math.min(Number(modelOptions.maxTokens || 12000), 12000),
        });
        result = {
          ...result,
          rawUsage: mergeGenerationUsage(result.rawUsage, repairResponse && (repairResponse.usage || repairResponse.rawUsage)) || result.rawUsage || null,
        };
        quotaOutputText += (quotaOutputText ? '\n\n' : '') + String(repairResponse?.text || '');
        return repairResponse?.text || '';
      },
      verify: async ({ files }) => [evaluateGeneratedWebsiteFiles(files)],
      limits: { maxFiles: 4, maxFileChars: 24000, maxContextChars: 48000 },
    });
    if (repairCycle.repair.status === 'repaired-and-passed' ||
        repairCycle.repair.status === 'repaired-needs-attention') {
      result = { ...result, files: repairCycle.files };
    }
    const backendRequired = fullStackArchitecture?.capabilities?.backend === true;
    const requiredChannels = backendRequired
      ? ['static', 'browser', 'backend', 'journeys']
      : ['static', 'browser', 'journeys'];
    const evidence = [
      repairCycle.report.channels.find(channel => channel.channel === 'static'),
      {
        channel: 'browser',
        status: 'blocked',
        testsRun: 0,
        blockedReason: 'Chromium execution is performed by the isolated generated-site browser QA runner, not inside the Cloudflare generation request.',
      },
      ...(backendRequired ? [{
        channel: 'backend',
        status: 'blocked',
        testsRun: 0,
        blockedReason: 'Generated backend source has been audited, but a disposable framework runtime and synthetic provider/auth fixtures are required to execute its real database workflows.',
      }] : []),
      {
        channel: 'journeys',
        status: 'blocked',
        testsRun: 0,
        blockedReason: 'Requirement-derived journeys are emitted in ovyx-qa-plan.json and must be executed by the isolated browser QA runner.',
      },
    ];
    autonomousQa = {
      ...createAutonomousQaReport({ requiredChannels, evidence }),
      repair: repairCycle.repair,
      repairBeforeReport: repairCycle.beforeReport || null,
      sourceEvidence: fullStackSourceEvidence || null,
    };
    result = { ...result, autonomousQa };
  }
  return { result, multiPageBuild, quotaInputText, quotaOutputText, fullStackSourceEvidence, autonomousQa };
}
