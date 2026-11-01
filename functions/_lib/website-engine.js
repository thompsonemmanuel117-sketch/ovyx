import { buildExperienceBrief } from './experience.js';
import { buildPromptContract, getWebStudioBuildClarification } from './prompt-contract.js';
import { buildStudioMultiPage } from './studio-multipage.js';
import { validateOrRepairSinglePageBuild } from './studio-singlepage.js';
import { buildFullStackArchitecture, fullStackArchitectureClientSummary, fullStackArchitectureModelContract } from './fullstack-architecture.js';

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
  const brief = String(prompt ?? '')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, 80000);
  const safeContext = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  const promptContract = buildPromptContract(brief);
  const experience = buildExperienceBrief(brief, safeContext);
  const pages = pagePlan(promptContract);
  const fullStackArchitecture = buildFullStackArchitecture(brief, promptContract, safeContext, pages);
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
    fullStackArchitecture,
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
      fullStackArchitecture: fullStackArchitectureModelContract(plan.fullStackArchitecture),
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
    mustHave: compactPlanList(plan.designArchitecture?.mustHave, 6, 100),
    conversionPrinciples: compactPlanList(plan.designArchitecture?.conversionPrinciples, 6, 100),
    experiencePrinciples: compactPlanList(plan.designArchitecture?.experiencePrinciples, 6, 100),
    antiTemplateRules: compactPlanList(plan.designArchitecture?.antiTemplateRules, 6, 100),
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
    minimal.fullStackArchitecture = {
      version: fullStack.version,
      capabilities: fullStack.capabilities,
      pages: (fullStack.pages || []).slice(0, 14).map(page => [page.id, clean(page.title, 64), clean(page.route, 96)]),
      apiContracts: (fullStack.apiContracts || []).slice(0, 20).map(route => ({
        id: route.id, method: route.method, path: route.path, capability: route.capability,
        authPolicy: route.authPolicy, modelIds: (route.modelIds || []).slice(0, 5),
        sideEffect: route.sideEffect || '',
      })),
      dataModels: (fullStack.dataModels || []).slice(0, 16).map(model => [
        model.id, model.name, (model.fields || []).slice(0, 10), model.securityClass,
      ]),
      dataIntegrity: {
        relationships: (fullStack.dataIntegrity?.relationships || []).slice(0, 16).map(item =>
          [item.from, item.to, item.cardinality, item.foreignKeyField, item.kind, item.optional]),
        constraints: (fullStack.dataIntegrity?.constraints || []).slice(0, 16).map(item =>
          [item.id, clean(item.appliesTo, 64), clean(item.rule, 96)]),
        indexes: (fullStack.dataIntegrity?.indexes || []).slice(0, 16).map(item =>
          [item.entity, (item.fields || []).slice(0, 5), item.unique === true]),
      },
      integrations: (fullStack.integrations || []).slice(0, 8).map(item =>
        [item.capability, item.provider, item.connectionMetadata, item.verification]),
      requirementTraceabilityGroups: [...groupedRequirements.values()],
      graphIntegrity: {
        valid: fullStack.graphIntegrity?.valid === true,
        nodeCount: fullStack.graphIntegrity?.nodeCount || 0,
        edgeCount: fullStack.graphIntegrity?.edgeCount || 0,
        unreachableNodeIds: (fullStack.graphIntegrity?.unreachableNodeIds || []).slice(0, 12),
      },
      security: {
        defaultPosture: fullStack.security?.defaultPosture,
        controls: (fullStack.security?.controls || []).slice(0, 16).map(item => [item.id, clean(item.requirement, 100)]),
        migrationPolicy: fullStack.security?.migrationPolicy,
      },
      backgroundWork: {
        required: fullStack.backgroundWork?.required === true,
        pattern: fullStack.backgroundWork?.pattern,
        controls: (fullStack.backgroundWork?.controls || []).slice(0, 8),
      },
      stateMachines: (fullStack.stateMachines || []).slice(0, 8).map(machine => ({
        entity: machine.entity,
        initialState: machine.initialState,
        states: (machine.states || []).slice(0, 10),
        transitions: (machine.transitions || []).slice(0, 8).map(item =>
          [item.from, item.to, clean(item.authority, 88), clean(item.sideEffect, 72)]),
        invariant: clean(machine.invariant, 100),
      })),
      testPlan: (fullStack.testPlan || []).slice(0, 12).map(test =>
        [test.id, test.type, test.status, test.requiresExplicitOwnerApproval === true]),
      honestyRules: compactPlanList(fullStack.honestyRules, 8, 100),
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
  const fullStackRules = plan.fullStackArchitecture ? [
    'OVYX FULL-STACK ARCHITECTURE CONTRACT — ONE COHERENT APPLICATION',
    'Implement the declared architecture as connected source code, not as a proposal, mockup or disconnected collection of files. When backend capability is requested, do not silently return a frontend-only site.',
    'For each declared API contract, generate the matching server route/handler for the selected framework and HTTP method, validate inputs on the server, enforce the stated authorization policy, return the declared safe success/error contract, and connect every consumer in the frontend to that exact route.',
    'Generate the declared domain schema, relationships, constraints and indexes from one consistent source of truth. Ensure route model references resolve to the actual schema. Include additive migrations and a dry-run/rollback path; do not execute destructive or production migrations without explicit owner approval.',
    'Implement the declared workflow state machines with server-authoritative transitions. Never trust browser-supplied roles, owners, prices, totals, inventory, payment success, availability or provider events.',
    'Use server-side adapters for integrations, bounded timeouts, retry only safe/idempotent operations, idempotency keys, replay protection and auditable reconciliation. A configured connection is not a live delivery or transaction.',
    'Keep provider credentials in server bindings or encrypted server-side storage. Add only variable names and safe setup guidance to environment templates; never generate real secrets or expose them to browser code, URLs, logs or exported client bundles.',
    'Generate tests for route contracts, schemas, authorization-negative cases, business state transitions and end-to-end user journeys. Do not mark a route, database write, integration or deployment complete because its source file or mock test exists.',
    'Preserve existing project files and scoped-edit boundaries. Build the dependency graph before broad edits, update every affected consumer, and report unresolved requirements instead of silently omitting them.',
  ] : [];
  return [
    'OVYX UNIFIED WEBSITE ENGINE — AUTHORITATIVE PRE-GENERATION PLAN',
    'The complete original user brief is supplied separately as the task prompt and remains authoritative. The JSON below is a bounded architecture plan and requirement index; its clause excerpts never replace the original brief.',
    serializedPlan,
    ...fullStackRules,
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
    fullStackArchitecture: fullStackArchitectureClientSummary(plan.fullStackArchitecture),
  };
}

/**
 * Shared build lifecycle for the Assistant and Gateway endpoints. A fresh
 * website build uses the same multi-page planner/builder, then the same
 * single-page repair fallback if the staged builder cannot return a project.
 * Scoped edits deliberately bypass full-site rebuild and repair.
 */

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
    for (const [rawPath, value] of Object.entries(files)) {
      let filePath = String(rawPath || '').trim();
      while (filePath.startsWith('/')) filePath = filePath.slice(1);
      const fileContent = typeof value === 'string' ? value : value && (value.content || value.text || value.code);
      const allowedRoot = [
        'functions/', 'api/', 'app/api/', 'src/app/api/', 'pages/api/', 'src/pages/api/',
        'prisma/', 'migrations/', 'db/', 'database/', 'server/', 'src/server/',
        'src/lib/server/', 'src/routes/', 'app/routes/', 'server/api/', 'server/routes/', 'tests/', 'test/', '__tests__/',
      ].some(prefix => filePath.startsWith(prefix));
      const allowedExtension = [
        '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.prisma', '.sql',
        '.graphql', '.gql', '.yaml', '.yml', '.toml', '.json',
      ].some(extension => filePath.toLowerCase().endsWith(extension));
      const lowerPath = filePath.toLowerCase();
      if (!filePath || filePath.length > 300 || filePath.includes('..') || filePath.includes(String.fromCharCode(92)) ||
          lowerPath.includes('.env') || lowerPath.includes('secret') || lowerPath.includes('credential') ||
          lowerPath.includes('private-key') || lowerPath.includes('service-account') ||
          !allowedExtension || !allowedRoot || typeof fileContent !== 'string' ||
          !fileContent.trim() || fileContent.length > 180000) continue;
      output[filePath] = fileContent;
    }
    if (Object.keys(output).length) return output;
  }
  return {};
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
    const remixSuffix = suffix.split('/').map(part => part.startsWith('[') ? '
    const file = candidates.map(candidate => pathMap.get(candidate.toLowerCase())).find(Boolean) || '';
    const code = file ? String(files[file]) : '';
    const method = String(route.method || 'GET').toUpperCase();
    const pascal = method.charAt(0) + method.slice(1).toLowerCase();
    const lowerFile = file.toLowerCase();
    const methodOk = !!file && (
      code.includes('onRequest' + pascal) ||
      code.includes('export const ' + method) ||
      code.includes('export async function ' + method) ||
      code.includes('function ' + method) ||
      code.includes('function ' + pascal) ||
      code.toLowerCase().includes('router.' + method.toLowerCase() + '(') ||
      code.toLowerCase().includes('app.' + method.toLowerCase() + '(') ||
      (lowerFile.includes('/+server.') && code.includes('export const ' + method)) ||
      (lowerFile.includes('/routes/api.') && code.includes(method === 'GET' ? 'loader' : 'action')) ||
      (lowerFile.includes('/server/api/') && lowerFile.includes('.' + method.toLowerCase() + '.') && code.includes('defineEventHandler'))
    );
    const policy = String(route.authPolicy || '').toLowerCase();
    const publicRoute = policy.startsWith('public');
    const authOk = publicRoute || (
      policy.includes('provider-signature')
        ? code.includes('verifyWebhookSignature') || code.includes('verifySignature') || code.includes('constructEvent')
        : policy.includes('administrator') || policy.includes('role') || policy.includes('permission')
          ? code.includes('requireAdmin') || code.includes('requireRole') || code.includes('authorize') || code.includes('assertPermission')
          : code.includes('requireAuth') || code.includes('assertAuthenticated') || code.includes('getAuthenticatedUser') || code.includes('verifySession')
    );
    return { id: route.id, method, path: route.path, file: file || null, methodOk, authOk };
  });
  const schemaFiles = entries.filter(([filePath]) => {
    const lower = filePath.toLowerCase();
    return lower.includes('schema') || lower.includes('migration') || lower.includes('prisma') || lower.includes('drizzle') || lower.includes('database');
  });
  const schema = schemaFiles.map(entry => entry[1]).join('\n').toLowerCase();
  const models = (architecture.dataModels || []).map(model => {
    const name = String(model.name || '');
    const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const plural = snake.endsWith('s') ? snake : snake + 's';
    const present = schema.includes('model ' + name.toLowerCase()) ||
      schema.includes('create table ' + plural) ||
      schema.includes('create table if not exists ' + plural) ||
      schema.includes('create table "' + plural + '"') ||
      schema.includes("create table '" + plural + "'") ||
      schema.includes('createtable("' + plural + '"') ||
      schema.includes("createtable('" + plural + "'");
    return { id: model.id, name, present };
  });
  const relations = (architecture.dataIntegrity && architecture.dataIntegrity.relationships || []).map(relation => ({
    id: relation.id, field: relation.foreignKeyField,
    present: !!schema && schema.includes(String(relation.foreignKeyField || '').toLowerCase()),
  }));
  const missing = [];
  routes.forEach(route => {
    if (!route.file) missing.push('Missing route file: ' + route.method + ' ' + route.path);
    else if (!route.methodOk) missing.push('Missing HTTP method handler: ' + route.method + ' ' + route.path);
    if (!route.authOk) missing.push('Missing authorization/signature evidence: ' + route.path);
  });
  models.filter(model => !model.present).forEach(model => missing.push('Missing database schema model: ' + model.name));
  relations.filter(relation => !relation.present).forEach(relation => missing.push('Missing database relationship field: ' + relation.field));
  return {
    status: missing.length ? 'incomplete-source-generation' : 'source-evidence-present-runtime-unverified',
    routeCount: routes.length, routeSourceCount: routes.filter(route => route.file).length,
    routeMethodCount: routes.filter(route => route.methodOk).length,
    authorizationEvidenceCount: routes.filter(route => route.authOk).length,
    modelCount: models.length, modelSchemaEvidenceCount: models.filter(model => model.present).length,
    relationshipCount: relations.length, relationshipEvidenceCount: relations.filter(relation => relation.present).length,
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
    'Preserve the framework detected in existing project paths: Cloudflare Pages Functions, Next.js App Router/Pages Router, SvelteKit, Remix, Nuxt or an existing Node server. Use that framework’s native route-handler conventions. If no framework exists, target Cloudflare Pages Functions with Cloudflare D1-compatible SQLite migrations and matching onRequestGet/onRequestPost/onRequestPut/onRequestPatch/onRequestDelete exports.',
    'Use prepared database statements, strict server-side validation, safe error envelopes, size limits, owner scoping, deny-by-default authorization, idempotency and transactional business-state changes. Missing DB/auth bindings must fail explicitly; never simulate persistence or success.',
    'Generate CREATE TABLE statements, foreign keys, unique constraints and indexes for all models and relationships. Keep money in integer minor units with ISO currency and timestamps in UTC with IANA timezone context.',
    'Generate protected identity/authorization middleware and negative permission tests when requested. Payment webhooks require signature and replay verification; booking commits must recheck availability; external email requires an outbox and verified receipt.',
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourcePrompt = buildBackendSourcePrompt(
        fullStackArchitecture, originalPrompt || multiPageOptions.prompt || modelOptions.taskPrompt || '',
        [...new Set(Object.keys(multiPageOptions.files || {}).concat(Object.keys(result.files || {})))], failures
      );
      quotaInputText += (quotaInputText ? '\n\n' : '') + sourcePrompt;
      backendResponse = await callModel(env, {
        ...modelOptions,
        taskPrompt: sourcePrompt,
        system: [String(modelOptions.system || ''), 'Generate complete backend source code and output only the requested JSON files object. Never simulate database writes, identity verification or provider success.'].filter(Boolean).join('\n\n'),
        responseFormat: 'json',
      });
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
      error.partialUsage = backendResponse && backendResponse.usage || null;
      throw error;
    }
    result = {
      ...result,
      files: { ...(result.files || {}), ...generatedFiles },
      fullStackSourceEvidence,
      fullStackGeneration: {
        status: 'source-generated-runtime-unverified',
        filesGenerated: Object.keys(generatedFiles).length,
      },
    };
  }
  return { result, multiPageBuild, quotaInputText, quotaOutputText, fullStackSourceEvidence };
}
 + part.slice(1, -1) : part).join('.');
    const candidates = [
      'functions/api/' + suffix + '.js', 'functions/api/' + suffix + '.ts',
      'functions/api/' + suffix + '/index.js', 'app/api/' + suffix + '/route.js',
      'app/api/' + suffix + '/route.ts', 'src/app/api/' + suffix + '/route.ts',
      'pages/api/' + suffix + '.js', 'pages/api/' + suffix + '.ts',
      'src/routes/api/' + suffix + '/+server.js', 'src/routes/api/' + suffix + '/+server.ts',
      'server/api/' + suffix + '.' + String(route.method || 'GET').toLowerCase() + '.js',
      'server/api/' + suffix + '.' + String(route.method || 'GET').toLowerCase() + '.ts',
      'server/api/' + suffix + '.js', 'server/api/' + suffix + '.ts',
      'app/routes/api.' + remixSuffix + '.js', 'app/routes/api.' + remixSuffix + '.ts',
      'server/routes/' + suffix + '.js', 'server/routes/' + suffix + '.ts',
      'api/' + suffix + '.js', 'api/' + suffix + '.ts',
    ];
    const file = candidates.map(candidate => pathMap.get(candidate.toLowerCase())).find(Boolean) || '';
    const code = file ? String(files[file]) : '';
    const method = String(route.method || 'GET').toUpperCase();
    const pascal = method.charAt(0) + method.slice(1).toLowerCase();
    const methodOk = !!file && (
      code.includes('onRequest' + pascal) ||
      code.includes('function ' + method) ||
      code.includes('function ' + pascal) ||
      code.toLowerCase().includes('router.' + method.toLowerCase() + '(') ||
      code.toLowerCase().includes('app.' + method.toLowerCase() + '(')
    );
    const policy = String(route.authPolicy || '').toLowerCase();
    const publicRoute = policy.startsWith('public');
    const authOk = publicRoute || (
      policy.includes('provider-signature')
        ? code.includes('verifyWebhookSignature') || code.includes('verifySignature') || code.includes('constructEvent')
        : policy.includes('administrator') || policy.includes('role') || policy.includes('permission')
          ? code.includes('requireAdmin') || code.includes('requireRole') || code.includes('authorize') || code.includes('assertPermission')
          : code.includes('requireAuth') || code.includes('assertAuthenticated') || code.includes('getAuthenticatedUser') || code.includes('verifySession')
    );
    return { id: route.id, method, path: route.path, file: file || null, methodOk, authOk };
  });
  const schemaFiles = entries.filter(([filePath]) => {
    const lower = filePath.toLowerCase();
    return lower.includes('schema') || lower.includes('migration') || lower.includes('prisma') || lower.includes('drizzle') || lower.includes('database');
  });
  const schema = schemaFiles.map(entry => entry[1]).join('\n').toLowerCase();
  const models = (architecture.dataModels || []).map(model => {
    const name = String(model.name || '');
    const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const plural = snake.endsWith('s') ? snake : snake + 's';
    const present = schema.includes('model ' + name.toLowerCase()) ||
      schema.includes('create table ' + plural) ||
      schema.includes('create table if not exists ' + plural) ||
      schema.includes('create table "' + plural + '"') ||
      schema.includes("create table '" + plural + "'") ||
      schema.includes('createtable("' + plural + '"') ||
      schema.includes("createtable('" + plural + "'");
    return { id: model.id, name, present };
  });
  const relations = (architecture.dataIntegrity && architecture.dataIntegrity.relationships || []).map(relation => ({
    id: relation.id, field: relation.foreignKeyField,
    present: !!schema && schema.includes(String(relation.foreignKeyField || '').toLowerCase()),
  }));
  const missing = [];
  routes.forEach(route => {
    if (!route.file) missing.push('Missing route file: ' + route.method + ' ' + route.path);
    else if (!route.methodOk) missing.push('Missing HTTP method handler: ' + route.method + ' ' + route.path);
    if (!route.authOk) missing.push('Missing authorization/signature evidence: ' + route.path);
  });
  models.filter(model => !model.present).forEach(model => missing.push('Missing database schema model: ' + model.name));
  relations.filter(relation => !relation.present).forEach(relation => missing.push('Missing database relationship field: ' + relation.field));
  return {
    status: missing.length ? 'incomplete-source-generation' : 'source-evidence-present-runtime-unverified',
    routeCount: routes.length, routeSourceCount: routes.filter(route => route.file).length,
    routeMethodCount: routes.filter(route => route.methodOk).length,
    authorizationEvidenceCount: routes.filter(route => route.authOk).length,
    modelCount: models.length, modelSchemaEvidenceCount: models.filter(model => model.present).length,
    relationshipCount: relations.length, relationshipEvidenceCount: relations.filter(relation => relation.present).length,
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
    'Preserve the framework detected in existing project paths. If none exists, target Cloudflare Pages Functions with Cloudflare D1-compatible SQLite migrations. Use functions/api/<route>.js and matching onRequestGet/onRequestPost/onRequestPut/onRequestPatch/onRequestDelete exports for Cloudflare Pages.',
    'Use prepared database statements, strict server-side validation, safe error envelopes, size limits, owner scoping, deny-by-default authorization, idempotency and transactional business-state changes. Missing DB/auth bindings must fail explicitly; never simulate persistence or success.',
    'Generate CREATE TABLE statements, foreign keys, unique constraints and indexes for all models and relationships. Keep money in integer minor units with ISO currency and timestamps in UTC with IANA timezone context.',
    'Generate protected identity/authorization middleware and negative permission tests when requested. Payment webhooks require signature and replay verification; booking commits must recheck availability; external email requires an outbox and verified receipt.',
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourcePrompt = buildBackendSourcePrompt(
        fullStackArchitecture, originalPrompt || multiPageOptions.prompt || modelOptions.taskPrompt || '',
        Object.keys(result.files || {}), failures
      );
      quotaInputText += (quotaInputText ? '\n\n' : '') + sourcePrompt;
      backendResponse = await callModel(env, {
        ...modelOptions,
        taskPrompt: sourcePrompt,
        system: [String(modelOptions.system || ''), 'Generate complete backend source code and output only the requested JSON files object. Never simulate database writes, identity verification or provider success.'].filter(Boolean).join('\n\n'),
        responseFormat: 'json',
      });
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
      error.partialUsage = backendResponse && backendResponse.usage || null;
      throw error;
    }
    result = {
      ...result,
      files: { ...(result.files || {}), ...generatedFiles },
      fullStackSourceEvidence,
      fullStackGeneration: {
        status: 'source-generated-runtime-unverified',
        filesGenerated: Object.keys(generatedFiles).length,
      },
    };
  }
  return { result, multiPageBuild, quotaInputText, quotaOutputText, fullStackSourceEvidence };
}
