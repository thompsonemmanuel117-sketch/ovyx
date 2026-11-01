const MAX_FINDINGS = 40;
const MAX_REPAIR_FILES = 6;
const MAX_FILE_CHARS = 30_000;
const MAX_CONTEXT_CHARS = 60_000;
const SOURCE_EXTENSION = /\.(?:html?|css|m?js|jsx|tsx?|vue|svelte|astro)$/i;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/i,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i,
];

const clean = (value, limit = 400) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

function redactSensitiveText(value, limit = 400) {
  let text = clean(value, limit * 2);
  text = text.replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]');
  text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED ACCESS KEY]');
  text = text.replace(/\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/gi, '[REDACTED SECRET]');
  text = text.replace(/\b((?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*)["']?[^\s"'&,;]{8,}/gi, '$1[REDACTED]');
  return text.slice(0, limit);
}

function safeSourcePath(value) {
  const path = String(value ?? '').replace(/\\/g, '/').trim();
  if (!path || path.length > 240 || path.startsWith('/') ||
      path.split('/').some(part => !part || part === '.' || part === '..') ||
      /^(?:node_modules|dist|build|coverage|\.git|\.wrangler|\.vercel|\.env)(?:\/|$)/i.test(path) ||
      /(?:^|\/)(?:secrets?|credentials?|private[-_]?keys?)(?:\/|\.|$)/i.test(path) ||
      !SOURCE_EXTENSION.test(path)) return '';
  return path;
}

function normalizeFinding(finding, channel) {
  if (!finding || typeof finding !== 'object') return null;
  const severityRaw = String(finding.severity || finding.level || 'warning').toLowerCase();
  const severity = ['blocker', 'critical', 'error'].includes(severityRaw) ? 'blocker'
    : ['warning', 'warn'].includes(severityRaw) ? 'warning' : 'info';
  return {
    channel: clean(finding.channel || channel, 40),
    severity,
    code: clean(finding.code || finding.rule || 'UNCLASSIFIED', 80),
    message: redactSensitiveText(finding.message || finding.description || 'A verification check reported an issue.', 500),
    file: safeSourcePath(finding.file || finding.path || ''),
  };
}

function normalizeEvidence(item, required = true) {
  const source = item && typeof item === 'object' ? item : {};
  const rawStatus = String(source.status || 'not-run').toLowerCase();
  let status = ['passed', 'failed', 'blocked', 'not-run'].includes(rawStatus) ? rawStatus : 'not-run';
  const testsRun = Number.isSafeInteger(Number(source.testsRun)) && Number(source.testsRun) >= 0
    ? Math.min(100_000, Number(source.testsRun)) : 0;
  if (status === 'passed' && testsRun < 1) status = 'not-run';
  const findings = (Array.isArray(source.findings) ? source.findings : [])
    .slice(0, MAX_FINDINGS)
    .map(finding => normalizeFinding(finding, source.channel || source.name || 'unknown'))
    .filter(Boolean);
  if (status === 'passed' && findings.some(finding => finding.severity === 'blocker')) status = 'failed';
  return {
    channel: clean(source.channel || source.name || 'unknown', 40),
    status,
    required,
    testsRun,
    blockedReason: status === 'blocked' ? clean(source.blockedReason || source.reason || 'Required runtime dependency is unavailable.', 300) : '',
    findings,
  };
}

export function createAutonomousQaReport(options = {}) {
  const requiredChannels = [...new Set((Array.isArray(options.requiredChannels)
    ? options.requiredChannels : ['static', 'browser', 'backend', 'journeys'])
    .map(value => clean(value, 40)).filter(Boolean))].slice(0, 12);
  const supplied = Array.isArray(options.evidence) ? options.evidence : [];
  const byChannel = new Map();
  for (const item of supplied) {
    const normalized = normalizeEvidence(item);
    if (normalized.channel && !byChannel.has(normalized.channel)) byChannel.set(normalized.channel, normalized);
  }
  const channels = requiredChannels.map(channel => byChannel.get(channel) || normalizeEvidence({ channel, status: 'not-run', testsRun: 0 }));
  const findings = channels.flatMap(channel => channel.findings).slice(0, MAX_FINDINGS * 4);
  const failed = channels.filter(channel => channel.status === 'failed').length;
  const blocked = channels.filter(channel => channel.status === 'blocked').length;
  const notRun = channels.filter(channel => channel.status === 'not-run').length;
  const passed = channels.filter(channel => channel.status === 'passed').length;
  const status = failed ? 'needs-attention'
    : blocked ? 'blocked'
      : notRun ? 'incomplete'
        : passed === requiredChannels.length && requiredChannels.length > 0 ? 'passed'
          : 'incomplete';
  return {
    schemaVersion: 1,
    engine: 'ovyx-autonomous-qa',
    status,
    generatedAt: new Date().toISOString(),
    summary: {
      requiredChannels: requiredChannels.length,
      passedChannels: passed,
      failedChannels: failed,
      blockedChannels: blocked,
      notRunChannels: notRun,
      testsRun: channels.reduce((sum, channel) => sum + channel.testsRun, 0),
      blockers: findings.filter(finding => finding.severity === 'blocker').length,
      warnings: findings.filter(finding => finding.severity === 'warning').length,
    },
    channels,
    findings,
    limitations: [
      'A channel passes only when it reports at least one executed test and no blocker finding.',
      'Missing, blocked, skipped or unexecuted checks never count as passed.',
      'A browser click or successful HTTP response alone does not prove a business transaction, database durability or external delivery.',
      'Human visual/editorial review and external provider receipts remain separate evidence.',
    ],
  };
}

export function selectAutonomousRepairTargets(files, findings, options = {}) {
  const source = files && typeof files === 'object' && !Array.isArray(files) ? files : {};
  const maxFiles = Math.max(1, Math.min(MAX_REPAIR_FILES, Number(options.maxFiles) || MAX_REPAIR_FILES));
  const maxFileChars = Math.max(1_000, Math.min(MAX_FILE_CHARS, Number(options.maxFileChars) || MAX_FILE_CHARS));
  const maxContextChars = Math.max(5_000, Math.min(MAX_CONTEXT_CHARS, Number(options.maxContextChars) || MAX_CONTEXT_CHARS));
  const counts = new Map();
  for (const finding of Array.isArray(findings) ? findings : []) {
    const path = safeSourcePath(finding?.file || finding?.path || '');
    if (path && typeof source[path] === 'string') counts.set(path, (counts.get(path) || 0) + 1);
  }
  const targets = [];
  let totalChars = 0;
  for (const [path, count] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const content = source[path];
    if (!content.trim() || content.length > maxFileChars || SECRET_PATTERNS.some(pattern => pattern.test(content))) continue;
    if (targets.length >= maxFiles || totalChars + content.length > maxContextChars) continue;
    targets.push({ path, content, findingCount: count });
    totalChars += content.length;
  }
  return targets;
}

export function buildAutonomousRepairPrompt(options = {}) {
  const targets = Array.isArray(options.targets) ? options.targets : [];
  const findings = (Array.isArray(options.findings) ? options.findings : []).slice(0, MAX_FINDINGS);
  if (!targets.length) return '';
  const files = targets.map(target => ({ path: target.path, content: target.content }));
  return [
    'OVYX AUTONOMOUS TEST-AND-REPAIR PASS.',
    'Repair only the concrete failures listed below. Preserve the original user requirements, architecture, working behavior, accessibility and security boundaries.',
    'Return strict JSON with exactly one top-level "files" object. Each key must be an exact path from the repair allowlist and each value must be the complete replacement file content.',
    'Do not add files, change dependencies, alter migrations or database schemas, introduce credentials, call external services, weaken authorization, or claim a test passed.',
    'Do not make unrelated visual redesigns or remove requirements to silence a test.',
    'The candidate will be rerun through the same tests. Any new failure or regression causes the entire candidate to be rejected.',
    'ORIGINAL USER REQUIREMENTS:\n' + redactSensitiveText(options.originalBrief, 8000),
    'FAILED TEST EVIDENCE:\n' + JSON.stringify(findings.map(item => ({
      channel: clean(item.channel, 40),
      severity: clean(item.severity, 20),
      code: clean(item.code, 80),
      message: redactSensitiveText(item.message, 500),
      file: safeSourcePath(item.file || ''),
    }))),
    'EXACT REPAIR ALLOWLIST:\n' + JSON.stringify(targets.map(item => item.path)),
    'CURRENT COMPLETE FILE CONTENTS:\n' + JSON.stringify(files),
  ].join('\n\n').slice(0, MAX_CONTEXT_CHARS + 12_000);
}

export function validateAutonomousRepairCandidate(options = {}) {
  const original = options.originalFiles && typeof options.originalFiles === 'object' ? options.originalFiles : {};
  const targets = Array.isArray(options.targets) ? options.targets : [];
  const allowlist = new Set(targets.map(item => safeSourcePath(item?.path)).filter(Boolean));
  let payload = options.repairOutput;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return { ok: false, reason: 'invalid-json' }; }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files)) {
    return { ok: false, reason: 'files-object-required' };
  }
  const entries = Object.entries(payload.files);
  if (!entries.length || entries.length > allowlist.size) return { ok: false, reason: 'repair-file-count-invalid' };
  const candidate = { ...original };
  const changedPaths = [];
  for (const [rawPath, value] of entries) {
    const path = safeSourcePath(rawPath);
    if (!path || !allowlist.has(path)) return { ok: false, reason: 'repair-path-not-allowlisted' };
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_FILE_CHARS) return { ok: false, reason: 'repair-content-invalid' };
    if (SECRET_PATTERNS.some(pattern => pattern.test(value))) return { ok: false, reason: 'secret-shaped-repair-content' };
    if (value !== original[path]) changedPaths.push(path);
    candidate[path] = value;
  }
  if (!changedPaths.length) return { ok: false, reason: 'repair-made-no-changes' };
  return { ok: true, files: candidate, changedPaths };
}

function failureKey(finding) {
  return [finding.channel, finding.severity, finding.code, finding.file, finding.message].join('|');
}

export async function runAutonomousRepairCycle(options = {}) {
  const originalFiles = options.files && typeof options.files === 'object' ? options.files : {};
  const requiredChannels = Array.isArray(options.requiredChannels) ? options.requiredChannels : ['static', 'browser', 'backend', 'journeys'];
  const initialEvidence = Array.isArray(options.initialEvidence) ? options.initialEvidence : [];
  const before = createAutonomousQaReport({ requiredChannels, evidence: initialEvidence });
  const unchanged = { files: { ...originalFiles }, report: before, repair: { status: 'not-needed', attempts: 0, changedPaths: [] } };
  if (before.status === 'passed') return unchanged;
  if (typeof options.repair !== 'function' || typeof options.verify !== 'function') {
    return { ...unchanged, repair: { status: 'unavailable', attempts: 0, changedPaths: [], reason: 'repair-and-verification-adapters-required' } };
  }
  const targets = selectAutonomousRepairTargets(originalFiles, before.findings, options.limits);
  if (!targets.length) {
    return { ...unchanged, repair: { status: 'no-safe-targets', attempts: 0, changedPaths: [] } };
  }
  const prompt = buildAutonomousRepairPrompt({ originalBrief: options.originalBrief, findings: before.findings, targets });
  let repairOutput;
  try {
    repairOutput = await options.repair({ prompt, targets: targets.map(({ path, content }) => ({ path, content })), findings: before.findings });
  } catch {
    return { ...unchanged, repair: { status: 'failed', attempts: 1, changedPaths: [], reason: 'repair-adapter-failed' } };
  }
  const candidate = validateAutonomousRepairCandidate({ originalFiles, targets, repairOutput });
  if (!candidate.ok) {
    return { ...unchanged, repair: { status: 'rejected', attempts: 1, changedPaths: [], reason: candidate.reason } };
  }
  let afterEvidence;
  try {
    afterEvidence = await options.verify({ files: candidate.files, changedPaths: candidate.changedPaths });
  } catch {
    return { ...unchanged, repair: { status: 'rejected', attempts: 1, changedPaths: [], reason: 'verification-after-repair-failed' } };
  }
  const after = createAutonomousQaReport({ requiredChannels, evidence: afterEvidence });
  const beforeKeys = new Set(before.findings.map(failureKey));
  const newFailures = after.findings.filter(finding => !beforeKeys.has(failureKey(finding)));
  const beforeChannels = new Map(before.channels.map(channel => [channel.channel, channel]));
  const channelStatusRank = { passed: 0, failed: 1, blocked: 2, 'not-run': 3 };
  const channelRegressions = after.channels.filter(channel => {
    const previous = beforeChannels.get(channel.channel);
    if (!previous) return false;
    return channelStatusRank[channel.status] > channelStatusRank[previous.status] ||
      channel.testsRun < previous.testsRun;
  });
  const improved = after.summary.blockers < before.summary.blockers ||
    after.findings.length < before.findings.length ||
    after.status === 'passed';
  if (newFailures.length || channelRegressions.length || !improved) {
    return {
      ...unchanged,
      repair: {
        status: 'rejected',
        attempts: 1,
        changedPaths: [],
        reason: newFailures.length ? 'repair-introduced-new-findings'
          : channelRegressions.length ? 'repair-reduced-or-blocked-test-coverage'
            : 'repair-did-not-improve-evidence',
        newFindingCount: newFailures.length,
        regressedChannels: channelRegressions.map(channel => channel.channel),
      },
      afterReport: after,
    };
  }
  return {
    files: candidate.files,
    report: after,
    repair: {
      status: after.status === 'passed' ? 'repaired-and-passed' : 'repaired-needs-attention',
      attempts: 1,
      changedPaths: candidate.changedPaths,
      remainingFindings: after.findings.length,
    },
    beforeReport: before,
  };
}
