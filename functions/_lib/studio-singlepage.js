import { auditWebsiteIntegrity } from './site-integrity.js';
import { buildPromptContract, verifyPromptContractOutput } from './prompt-contract.js';
import { validateChanges } from './validator.js';

const MAX_FILE_PATH = 400;
const DEFAULT_REPAIR_FILES = 6;
const DEFAULT_REPAIR_FILE_CHARS = 28000;
const DEFAULT_REPAIR_CONTEXT_CHARS = 60000;

function cap(env, key, fallback) {
  const number = Number(env && env[key]);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function parseStructured(text) {
  const raw = String(text || '').trim().replace(/^\x60{3}(?:json)?/i, '').replace(/\x60{3}$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  return null;
}

function safeRelativePath(value) {
  const path = String(value || '').trim().replace(/^\.\/+/, '');
  if (!path || path.length > MAX_FILE_PATH || path.startsWith('/') || path.includes('\\') ||
      path.split('/').some(part => part === '..' || part === '.') ||
      /^(?:node_modules|dist|build|coverage|\.git|\.wrangler)(?:\/|$)/i.test(path)) return '';
  return path;
}

function normalizeGeneratedFiles(payload) {
  const candidate = payload && typeof payload === 'object'
    ? payload.files ?? payload.fileEdits ?? payload.projectFiles
    : null;
  const files = {};
  const invalidPaths = [];
  const add = (rawPath, rawContent) => {
    const path = safeRelativePath(rawPath);
    const content = typeof rawContent === 'string'
      ? rawContent
      : rawContent && typeof rawContent === 'object'
        ? String(rawContent.content ?? rawContent.code ?? rawContent.text ?? '')
        : '';
    if (!path) {
      invalidPaths.push(String(rawPath || '').slice(0, 120));
      return;
    }
    if (content.trim()) files[path] = content;
  };

  if (Array.isArray(candidate)) {
    for (const file of candidate) {
      if (!file || typeof file !== 'object') continue;
      add(file.path, file);
    }
  } else if (candidate && typeof candidate === 'object') {
    for (const [path, file] of Object.entries(candidate)) add(path, file);
  }

  if (!Object.keys(files).length && payload && typeof payload.html === 'string' && payload.html.trim()) {
    files['index.html'] = payload.html;
  }

  return { files, invalidPaths };
}

function languageForPath(path) {
  const lower = String(path || '').toLowerCase();
  if (/\.html?$/.test(lower)) return 'html';
  if (/\.css$/.test(lower)) return 'css';
  if (/\.m?js$/.test(lower)) return 'javascript';
  if (/\.json$/.test(lower)) return 'json';
  if (/\.svg$/.test(lower)) return 'svg';
  return 'text';
}

function applyFilesToPayload(payload, files, hasHtmlField) {
  const next = { ...(payload && typeof payload === 'object' ? payload : {}) };
  if (Array.isArray(next.files)) {
    next.files = Object.entries(files).map(([path, content]) => {
      const prior = next.files.find(item => item && item.path === path) || {};
      return { ...prior, path, language: prior.language || languageForPath(path), content };
    });
  } else if (next.files && typeof next.files === 'object' && !Array.isArray(next.files)) {
    next.files = { ...files };
  } else if (Array.isArray(next.fileEdits)) {
    next.fileEdits = Object.entries(files).map(([path, content]) => {
      const prior = next.fileEdits.find(item => item && item.path === path) || {};
      return { ...prior, path, language: prior.language || languageForPath(path), content };
    });
  } else if (hasHtmlField && files['index.html']) {
    next.html = files['index.html'];
    next.files = Object.entries(files).map(([path, content]) => ({ path, language: languageForPath(path), content }));
  } else {
    next.files = Object.entries(files).map(([path, content]) => ({ path, language: languageForPath(path), content }));
  }
  return next;
}

function inferSiteMap(files) {
  const htmlPaths = Object.keys(files).filter(path => /\.html?$/i.test(path));
  const pages = htmlPaths.map(path => {
    const name = path.split('/').pop().replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim() || 'Home';
    const route = htmlPaths.length === 1 || /^(?:index|home|homepage)$/i.test(name.replace(/\s+/g, ''))
      ? '/'
      : '/' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '/';
    return { title: name, path, url: route };
  });
  return { architecture: 'Single-page build route inference for static source validation only.', pages };
}

function inspectFiles(files, prompt, siteMap) {
  const entries = Object.entries(files);
  const validation = validateChanges(entries.map(([path, content]) => ({
    path,
    action: 'update',
    content,
  })), { allowDeletes: false });
  const requirementVerification = verifyPromptContractOutput(prompt, files, siteMap);
  const integrity = auditWebsiteIntegrity(files, siteMap);
  return { validation, requirementVerification, integrity };
}

function findingKey(issue) {
  return [issue && issue.code, issue && issue.file, issue && issue.reference].join('|').toLowerCase();
}

function hasNewIntegrityFindings(before, after) {
  const old = new Set((before && before.findings || []).map(findingKey));
  return (after && after.findings || []).some(issue => !old.has(findingKey(issue)));
}

function mergeRawUsage(first, second) {
  if (!first && !second) return null;
  const output = { ...(first || {}), ...(second || {}) };
  const keys = [
    'prompt_tokens', 'completion_tokens', 'total_tokens',
    'input_tokens', 'output_tokens',
    'promptTokens', 'completionTokens', 'totalTokens',
    'inputTokens', 'outputTokens',
  ];
  for (const key of keys) {
    const left = Number(first && first[key]);
    const right = Number(second && second[key]);
    if ((Number.isFinite(left) && left >= 0) || (Number.isFinite(right) && right >= 0)) {
      output[key] = (Number.isFinite(left) && left >= 0 ? left : 0) +
        (Number.isFinite(right) && right >= 0 ? right : 0);
    }
  }
  return output;
}

function selectRepairTargets(files, checks, limit, maxFileChars, maxContextChars) {
  const preferred = [];
  const add = path => { if (path && Object.prototype.hasOwnProperty.call(files, path) && !preferred.includes(path)) preferred.push(path); };
  for (const issue of checks.validation || []) {
    const path = String(issue || '').split(':', 1)[0].trim();
    add(path);
  }
  for (const issue of checks.requirementVerification.issues || []) {
    const code = String(issue.code || '');
    const pattern = code === 'BOOKING_FLOW_MISSING'
      ? /reservation|booking|appointment|calendar|home/i
      : code === 'SHOPPING_CART_MISSING' || code === 'ADD_TO_CART_ACTION_MISSING' || code === 'PAYMENT_FLOW_MISSING'
        ? /shop|product|cart|checkout|store|payment|home/i
        : code === 'CONTACT_FORM_MISSING'
          ? /contact|enquir|inquir|home/i
          : code === 'NEWSLETTER_MISSING'
            ? /newsletter|subscribe|home/i
            : code === 'AUTHENTICATION_UI_MISSING'
              ? /login|sign.?in|account|auth|home/i
              : /home|index|main/i;
    for (const [path, content] of Object.entries(files)) {
      if (/\.(?:html?|css|m?js)$/i.test(path) && pattern.test(path + '\n' + String(content).slice(0, 16000))) add(path);
    }
  }
  for (const issue of checks.integrity.findings || []) add(issue.file);
  for (const path of Object.keys(files)) if (/\.(?:html?|css|m?js)$/i.test(path)) add(path);

  const selected = [];
  let used = 0;
  for (const path of preferred) {
    const content = String(files[path] || '');
    if (!content.trim() || content.length > maxFileChars) continue;
    if (selected.length >= limit || used + content.length > maxContextChars) continue;
    selected.push({ path, content });
    used += content.length;
  }
  return selected;
}

function repairPrompt(prompt, targets, contract, checks, contextText) {
  const currentFiles = Object.fromEntries(targets.map(item => [item.path, item.content]));
  return [
    'OVYX WEB STUDIO SINGLE-PAGE BUILD REPAIR PHASE.',
    'The initial single-page build failed these deterministic source checks. Make one narrow repair of the exact missing requirement or structural defect. Do not redesign the entire page, replace sound structure, or change unrelated behavior.',
    'Return strict JSON only: {"summary":"...","files":[{"path":"allowlisted/path","language":"html|css|javascript|json|text","content":"complete updated file content"}]}. Return only updated files from the explicit allowlist. Do not add, delete, rename, or move files.',
    'A requested booking/cart/form feature must contain an actionable user-facing control or appropriately labelled form, not merely a heading or nav label. Fix source errors without introducing placeholders, dead controls, fake success states or new external dependencies.',
    'Do not invent public business facts, prices, schedule/availability, testimonials, credentials, addresses or provider status. Do not claim that email delivery, bookings, payments, authentication or data persistence are connected unless the real integration is provided and verified. Never expose secrets.',
    'ORIGINAL USER BRIEF:\n' + String(prompt || ''),
    'PROMPT REQUIREMENT CONTRACT JSON:\n' + JSON.stringify(contract || {}),
    'FAILED STRUCTURAL CHECKS JSON:\n' + JSON.stringify((checks.validation || []).slice(0, 24)),
    'FAILED PROMPT REQUIREMENT CHECKS JSON:\n' + JSON.stringify(checks.requirementVerification || {}),
    'CURRENT STATIC SITE-INTEGRITY AUDIT JSON:\n' + JSON.stringify(checks.integrity || {}),
    'PROJECT CONTEXT (bounded):\n' + String(contextText || '').slice(0, 5000),
    'REPAIR TARGET FILES JSON:\n' + JSON.stringify(targets.map(item => ({ path: item.path, currentCharacters: item.content.length }))),
    'REPAIR CURRENT FILE CONTENTS JSON:\n' + JSON.stringify(currentFiles),
    'REPAIR ALLOWLIST JSON:\n' + JSON.stringify(targets.map(item => item.path)),
  ].join('\n\n');
}

export async function validateOrRepairSinglePageBuild(options) {
  const originalResult = options && options.result;
  const prompt = String(options && options.prompt || '');
  const initialText = String(originalResult && originalResult.text || '');
  const payload = parseStructured(initialText);
  const normalized = normalizeGeneratedFiles(payload);
  const files = normalized.files;
  const htmlPaths = Object.keys(files).filter(path => /\.html?$/i.test(path));

  if (normalized.invalidPaths.length) {
    const report = {
      qualityVerification: { status: 'failed', structuralChecksPassed: false, requirementsPassed: false, validationIssues: ['The generated output included an unsafe or invalid file path.'] },
      siteIntegrity: null,
      requirementRepair: { status: 'rejected', filesConsidered: 0, filesUpdated: 0, integrityAuditIsStaticOnly: true },
    };
    const error = Object.assign(new Error('The single-page build returned an unsafe file path. Web Studio did not mark the build complete.'), {
      status: 422,
      code: 'WEBSTUDIO_SINGLE_PAGE_PATH_NOT_ALLOWED',
      qualityVerification: report.qualityVerification,
      siteIntegrity: report.siteIntegrity,
      requirementRepair: report.requirementRepair,
      partialUsage: originalResult && originalResult.rawUsage || null,
      quotaInputText: String(options && options.quotaInputText || ''),
      quotaOutputText: String(options && options.quotaOutputText || initialText),
    });
    throw error;
  }

  if (!payload || !Object.keys(files).length || !htmlPaths.length) {
    const report = {
      qualityVerification: {
        status: 'not-evaluated',
        structuralChecksPassed: false,
        requirementsPassed: false,
        message: 'No parseable generated HTML file set was available for deterministic single-page source checks.',
      },
      siteIntegrity: null,
      requirementRepair: { status: 'not-attempted', filesConsidered: 0, filesUpdated: 0, integrityAuditIsStaticOnly: true },
    };
    return {
      result: { ...originalResult, qualityVerification: report.qualityVerification, siteIntegrity: null, requirementRepair: report.requirementRepair },
      qualityVerification: report.qualityVerification,
      siteIntegrity: null,
      requirementRepair: report.requirementRepair,
      quotaInputText: String(options && options.quotaInputText || ''),
      quotaOutputText: String(options && options.quotaOutputText || initialText),
      evaluated: false,
    };
  }

  const contract = buildPromptContract(prompt);
  const siteMap = inferSiteMap(files);
  let checks = inspectFiles(files, prompt, siteMap);
  const initialChecks = checks;
  const repairRequired = checks.validation.length > 0 ||
    !checks.requirementVerification.ok ||
    checks.integrity.totalFindings > 0;
  const repairRecord = {
    status: repairRequired ? 'pending' : 'not-needed',
    issuesBefore: checks.requirementVerification.issues,
    issuesAfter: checks.requirementVerification.issues,
    validationIssuesBefore: checks.validation.slice(0, 24),
    validationIssuesAfter: checks.validation.slice(0, 24),
    filesConsidered: 0,
    filesUpdated: 0,
    integrityBefore: checks.integrity.totalFindings,
    integrityAfter: checks.integrity.totalFindings,
    integrityAuditIsStaticOnly: true,
  };
  let result = originalResult;
  let rawUsage = originalResult && originalResult.rawUsage || null;
  const quotaInputs = [String(options && options.quotaInputText || '')];
  const quotaOutputs = [String(options && options.quotaOutputText || initialText)];

  if (repairRequired && typeof options.callModel === 'function') {
    const repairLimit = Math.max(1, Math.min(8, cap(options.env, 'OVYX_WEBSTUDIO_SINGLEPAGE_REPAIR_MAX_FILES', DEFAULT_REPAIR_FILES)));
    const repairFileChars = Math.max(1000, Math.min(45000, cap(options.env, 'OVYX_WEBSTUDIO_SINGLEPAGE_REPAIR_MAX_FILE_CHARS', DEFAULT_REPAIR_FILE_CHARS)));
    const repairContextChars = Math.max(10000, Math.min(100000, cap(options.env, 'OVYX_WEBSTUDIO_SINGLEPAGE_REPAIR_MAX_CONTEXT_CHARS', DEFAULT_REPAIR_CONTEXT_CHARS)));
    const targets = selectRepairTargets(files, checks, repairLimit, repairFileChars, repairContextChars);
    repairRecord.filesConsidered = targets.length;

    if (!targets.length) {
      repairRecord.status = 'no-safe-targets';
    } else {
      const userInput = repairPrompt(prompt, targets, contract, checks, options.projectContext);
      quotaInputs.push(userInput);
      try {
        const repairResult = await options.callModel(options.env, {
          provider: options.provider || 'automatic',
          model: options.model,
          authUser: options.authUser,
          taskPrompt: prompt,
          system: [
            String(options.system || '').trim(),
            'You are OVYX Web Studio, performing one bounded source repair. Change only allowlisted files and return full file contents in strict JSON.',
          ].filter(Boolean).join('\n\n'),
          user: userInput,
          maxTokens: Math.max(1000, Math.min(12000, cap(options.env, 'OVYX_WEBSTUDIO_SINGLEPAGE_REPAIR_TOKENS', 8000))),
        });
        quotaOutputs.push(String(repairResult && repairResult.text || ''));
        rawUsage = mergeRawUsage(rawUsage, repairResult && repairResult.rawUsage);
        const repairPayload = parseStructured(repairResult && repairResult.text);
        const normalizedRepair = normalizeGeneratedFiles(repairPayload);
        const repairedPaths = Object.keys(normalizedRepair.files);
        const allowlist = new Set(targets.map(item => item.path));
        const invalid = normalizedRepair.invalidPaths.length > 0 ||
          !repairedPaths.length ||
          repairedPaths.length > targets.length ||
          repairedPaths.some(path => !allowlist.has(path) || !String(normalizedRepair.files[path]).trim());

        if (invalid) {
          repairRecord.status = 'rejected';
        } else {
          const candidate = { ...files };
          for (const path of repairedPaths) candidate[path] = normalizedRepair.files[path];
          const candidateChecks = inspectFiles(candidate, prompt, siteMap);
          const changedPaths = repairedPaths.filter(path => candidate[path] !== files[path]);
          if (!changedPaths.length) {
            repairRecord.status = 'unchanged';
          } else if (
            candidateChecks.validation.length > 0 ||
            !candidateChecks.requirementVerification.ok ||
            hasNewIntegrityFindings(initialChecks.integrity, candidateChecks.integrity)
          ) {
            repairRecord.status = 'rejected';
          } else {
            for (const path of changedPaths) files[path] = candidate[path];
            checks = candidateChecks;
            repairRecord.status = 'applied';
            repairRecord.filesUpdated = changedPaths.length;
            repairRecord.issuesAfter = checks.requirementVerification.issues;
            repairRecord.validationIssuesAfter = checks.validation.slice(0, 24);
            repairRecord.integrityAfter = checks.integrity.totalFindings;
          }
        }
      } catch (error) {
        if (error && error.partialUsage) rawUsage = mergeRawUsage(rawUsage, error.partialUsage);
        repairRecord.status = 'failed';
      }
    }
  } else if (repairRequired) {
    repairRecord.status = 'unavailable';
  }

  const qualityVerification = {
    status: checks.validation.length === 0 && checks.requirementVerification.ok
      ? repairRecord.status === 'applied' ? 'repaired-and-passed' : 'passed'
      : 'failed',
    structuralChecksPassed: checks.validation.length === 0,
    requirementsPassed: checks.requirementVerification.ok,
    requirementCount: checks.requirementVerification.requirementCount,
    explicitPages: checks.requirementVerification.explicitPages,
    checkedFiles: Object.keys(files).length,
    checkedHtmlFiles: htmlPaths.length,
    validationIssues: checks.validation.slice(0, 24),
    requirementIssues: checks.requirementVerification.issues,
    integrityFindingCount: checks.integrity.totalFindings,
    notes: [
      'These are deterministic source-level checks, not proof that browser interactions or third-party services work.',
      'External resources, licensing, network reachability and real integration delivery were not verified by this check.',
    ],
  };
  const siteIntegrity = checks.integrity;

  if (checks.validation.length || !checks.requirementVerification.ok) {
    const details = [
      ...checks.validation.slice(0, 5),
      ...checks.requirementVerification.issues.slice(0, 5).map(issue => issue.message),
    ];
    const error = Object.assign(new Error(
      'Web Studio could not verify the single-page build after one bounded repair attempt (' +
      repairRecord.status + '): ' + details.join(' | ') + '. The site was not marked complete.',
    ), {
      status: 422,
      code: 'WEBSTUDIO_SINGLE_PAGE_QUALITY_FAILED',
      qualityVerification,
      siteIntegrity,
      requirementRepair: repairRecord,
      partialUsage: rawUsage,
      quotaInputText: quotaInputs.join('\n\n'),
      quotaOutputText: quotaOutputs.join('\n\n'),
    });
    throw error;
  }

  const nextPayload = applyFilesToPayload(payload, files, typeof payload.html === 'string');
  nextPayload.qualityVerification = qualityVerification;
  nextPayload.siteIntegrity = siteIntegrity;
  nextPayload.requirementRepair = repairRecord;
  if (repairRecord.status === 'applied') {
    nextPayload.summary = String(nextPayload.summary || 'Single-page website generated.') +
      ' One bounded repair pass was applied and passed structural and prompt-requirement checks.';
  }
  result = {
    ...originalResult,
    text: JSON.stringify(nextPayload),
    rawUsage,
    qualityVerification,
    siteIntegrity,
    requirementRepair: repairRecord,
  };

  return {
    result,
    qualityVerification,
    siteIntegrity,
    requirementRepair: repairRecord,
    quotaInputText: quotaInputs.join('\n\n'),
    quotaOutputText: quotaOutputs.join('\n\n'),
    evaluated: true,
  };
}
