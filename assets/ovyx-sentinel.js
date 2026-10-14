(function () {
'use strict';
if (window.__OVYX_SENTINEL_V1__) return;
window.__OVYX_SENTINEL_V1__ = true;

var ADMIN_EMAIL = 'ovyxsupportteam@gmail.com';
var ID = 'ovyx-sentinel';
var root = null;
var latestReport = null;
var busy = false;
var recognition = null;
var wakeEnabled = false;
var awaitingUntil = 0;
var restartTimer = 0;
function q(selector) { return root ? root.querySelector(selector) : null; }
function user() { try { return window.firebase && window.firebase.auth().currentUser || null; } catch (_) { return null; } }
function adminClient() { var u = user(); return !!u && String(u.email || '').trim().toLowerCase() === ADMIN_EMAIL && u.emailVerified === true; }
async function getToken() {
  var u = user();
  if (!u || typeof u.getIdToken !== 'function') throw new Error('Please sign in to your OVYX administrator account.');
  return u.getIdToken(false);
}
async function api(method, payload) {
  var idToken = await getToken();
  var response = await fetch('/api/admin/sentinel', {
    method: method, credentials: 'same-origin', cache: 'no-store',
    headers: Object.assign({ Accept: 'application/json', Authorization: 'Bearer ' + idToken }, payload ? { 'Content-Type': 'application/json' } : {}),
    body: payload ? JSON.stringify(payload) : undefined
  });
  var data = await response.json().catch(function () { return {}; });
  if (!response.ok || data.ok !== true) throw new Error(String(data.message || data.error || 'Sentinel could not complete that request.').slice(0, 320));
  return data;
}
function addStyles() {
  if (document.getElementById(ID + '-css')) return;
  var style = document.createElement('style'); style.id = ID + '-css';
  style.textContent = [
    '#' + ID + '-launch{position:fixed;right:20px;bottom:22px;z-index:2147483000;display:flex;align-items:center;gap:10px;padding:9px 15px 9px 9px;border:1px solid rgba(117,225,238,.32);border-radius:999px;background:rgba(8,13,20,.96);color:#edfaff;box-shadow:0 15px 45px rgba(0,0,0,.45),0 0 28px rgba(92,214,231,.1);font:750 12px/1.2 Inter,system-ui,sans-serif;cursor:pointer}',
    '#' + ID + '-launch .eye{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;border:1px solid rgba(130,235,246,.55);background:#101e29;box-shadow:0 0 19px rgba(76,228,241,.14)}',
    '#' + ID + '-launch svg{width:25px;height:25px}',
    '#' + ID + '-panel{position:fixed;right:20px;bottom:82px;z-index:2147483001;width:min(460px,calc(100vw - 24px));max-height:min(76dvh,760px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(148,213,232,.18);border-radius:22px;background:radial-gradient(ellipse at 0 0,rgba(69,133,157,.17),transparent 45%),#090d12;color:#e6edf3;box-shadow:0 28px 90px rgba(0,0,0,.65);font:13px/1.55 Inter,system-ui,sans-serif}',
    '#' + ID + '-panel[hidden]{display:none}',
    '#' + ID + '-panel button{font:700 11px/1.3 Inter,system-ui,sans-serif;cursor:pointer}',
    '#' + ID + '-panel .head{display:flex;align-items:center;gap:11px;padding:15px 16px;border-bottom:1px solid rgba(255,255,255,.08)}',
    '#' + ID + '-panel .headcopy{min-width:0;flex:1}',
    '#' + ID + '-panel .title{font-size:14px;font-weight:850;letter-spacing:.03em;color:#f5fbff}',
    '#' + ID + '-panel .sub{color:#91a4b4;font-size:10px;margin-top:2px}',
    '#' + ID + '-panel .close{width:34px;height:34px;border:1px solid rgba(255,255,255,.12);border-radius:11px;color:#d5e0e9;background:rgba(255,255,255,.04)}',
    '#' + ID + '-panel .actions{display:flex;flex-wrap:wrap;gap:7px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.06)}',
    '#' + ID + '-panel .btn{padding:9px 11px;border-radius:10px;border:1px solid rgba(135,215,232,.22);background:rgba(69,145,165,.1);color:#dffbff}',
    '#' + ID + '-panel .primary{background:linear-gradient(120deg,#cbf7f4,#c2daf5);color:#091116;border-color:transparent}',
    '#' + ID + '-panel button:disabled{opacity:.5;cursor:wait}',
    '#' + ID + '-panel .status{padding:10px 15px;color:#a9bac7;font-size:11px;border-bottom:1px solid rgba(255,255,255,.06)}',
    '#' + ID + '-panel .status[data-kind="error"]{color:#fda4af}',
    '#' + ID + '-panel .status[data-kind="success"]{color:#86efac}',
    '#' + ID + '-panel .body{overflow:auto;min-height:80px;padding:12px 14px 16px}',
    '#' + ID + '-panel .summary{padding:11px 12px;margin-bottom:10px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(255,255,255,.025)}',
    '#' + ID + '-panel .summary strong{display:block;color:#f0f7fa;font-size:12px;margin-bottom:4px}',
    '#' + ID + '-panel .summary small{color:#8ba0af}',
    '#' + ID + '-panel .row{display:grid;grid-template-columns:9px minmax(0,1fr) auto;align-items:start;gap:9px;padding:9px 2px;border-bottom:1px solid rgba(255,255,255,.055)}',
    '#' + ID + '-panel .dot{width:7px;height:7px;border-radius:50%;margin-top:6px;background:#6ee7b7}',
    '#' + ID + '-panel .dot.fail{background:#fb7185}#' + ID + '-panel .dot.warning{background:#fbbf24}#' + ID + '-panel .dot.skipped{background:#8495a5}',
    '#' + ID + '-panel .rowtitle{font-size:11px;font-weight:750;color:#d8e4eb}',
    '#' + ID + '-panel .rowsummary{font-size:10px;color:#8298a8;margin-top:2px;overflow-wrap:anywhere}',
    '#' + ID + '-panel .plan{margin-top:10px;padding:12px;border:1px solid rgba(139,234,244,.18);border-radius:14px;background:rgba(46,96,111,.08)}',
    '#' + ID + '-panel .plan-task{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07)}',
    '#' + ID + '-panel .plan-task:last-child{border-bottom:0}',
    '#' + ID + '-panel .plan-heading{display:flex;align-items:start;justify-content:space-between;gap:8px;color:#e7f3f8;font-size:11px;font-weight:800}',
    '#' + ID + '-panel .plan-priority{font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#fbbf24;white-space:nowrap}',
    '#' + ID + '-panel .plan-task[data-priority="critical"] .plan-priority{color:#fb7185}',
    '#' + ID + '-panel .plan-issue{color:#8fa5b4;font-size:10px;margin-top:4px;overflow-wrap:anywhere}',
    '#' + ID + '-panel .plan ol{padding-left:19px;margin:8px 0 0;color:#c3d1dc;font-size:10px}',
    '#' + ID + '-panel .plan li{padding:2px 0 2px 2px}',
    '#' + ID + '-panel .plan-note{margin-top:10px;color:#748b9b;font-size:9px}',
    '#' + ID + '-panel .badge{font-size:8px;font-weight:850;letter-spacing:.08em;color:#b7cad7;text-transform:uppercase}',
    '#' + ID + '-panel .foot{padding:10px 15px;border-top:1px solid rgba(255,255,255,.07);color:#748695;font-size:9px}',
    '#' + ID + '-panel .transcript{white-space:pre-wrap;padding:10px 11px;margin-top:9px;border-radius:11px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);color:#d8e5ed}',
    '#' + ID + '-panel [hidden]{display:none!important}',
    '@media(max-width:640px){#' + ID + '-launch{right:12px;bottom:calc(14px + env(safe-area-inset-bottom));padding:7px 12px 7px 7px}#' + ID + '-panel{right:8px;bottom:72px;width:calc(100vw - 16px);max-height:78dvh;border-radius:18px}}',
    '@media(prefers-reduced-motion:reduce){#' + ID + '-launch{scroll-behavior:auto}}'
  ].join('\n');
  document.head.appendChild(style);
}
function buildShell() {
  if (root) return root;
  root = document.createElement('div'); root.id = ID + '-root';
  root.innerHTML = '<button id="' + ID + '-launch" type="button" aria-label="Open private OVYX Sentinel administrator companion"><span class="eye" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M3 16s4.8-8 13-8 13 8 13 8-4.8 8-13 8S3 16 3 16Z" stroke="#8BEAF4" stroke-width="1.5"/><circle cx="16" cy="16" r="5.4" fill="#A5F3FC" fill-opacity=".2" stroke="#8BEAF4" stroke-width="1.4"/><circle cx="16" cy="16" r="2.4" fill="#B9FAFF"/></svg></span><span>OVYX SENTINEL</span></button>' +
  '<section id="' + ID + '-panel" role="dialog" aria-modal="false" aria-labelledby="' + ID + '-title" hidden><header class="head"><span class="eye" aria-hidden="true">◉</span><div class="headcopy"><div id="' + ID + '-title" class="title">OVYX SENTINEL</div><div class="sub">PRIVATE ADMIN COMPANION · SYSTEM HEALTH</div></div><button type="button" class="close" data-ovsx="close" aria-label="Close Sentinel">×</button></header>' +
  '<div class="actions"><button type="button" class="btn primary" data-ovsx="scan">Check now</button><button type="button" class="btn" data-ovsx="plan">Prepare fix plan</button><button type="button" class="btn" data-ovsx="diagnose">AI diagnosis</button><button type="button" class="btn" data-ovsx="wake">Enable wake word</button><button type="button" class="btn" data-ovsx="mute" disabled>Stop speaking</button></div>' +
  '<div class="status" role="status" aria-live="polite" data-ovsx-status>Verifying administrator access…</div><div class="body"><div class="summary"><strong>Welcome back, boss.</strong><small>Sentinel checks platform health and authorised service signals. It does not read private user projects or conversations.</small></div><div data-ovsx-report></div><div class="plan" hidden data-ovsx-plan></div><div class="plan" hidden data-ovsx-diagnosis></div><div class="transcript" hidden data-ovsx-transcript></div></div>' +
  '<div class="foot">Wake word requires an enabled microphone and a supported browser. It works while this page is open and active; you can pause it at any time.</div></section>';
  document.body.appendChild(root); addStyles(); bindShell(); return root;
}
function status(message, kind) {
  var element = q('[data-ovsx-status]'); if (!element) return;
  element.textContent = String(message || ''); element.dataset.kind = kind || 'info';
}
function safeText(value, max) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 320); }
function stateLabel(report) {
  var state = String(report && report.status || 'unknown');
  return state === 'healthy' ? 'HEALTHY' : state === 'critical' ? 'CRITICAL' : state === 'needs_attention' ? 'NEEDS ATTENTION' : state.replace(/_/g, ' ').toUpperCase();
}
function renderReport(report) {
  latestReport = report || null;
  var planHost = q('[data-ovsx-plan]'); if (planHost) { planHost.hidden = true; planHost.replaceChildren(); }
  var host = q('[data-ovsx-report]'); if (!host) return;
  host.replaceChildren();
  if (!report) { var empty = document.createElement('div'); empty.className = 'summary'; empty.textContent = 'No saved Sentinel report yet. Select Check now to run the first scan.'; host.appendChild(empty); return; }
  var summary = document.createElement('div'); summary.className = 'summary';
  var heading = document.createElement('strong'); heading.textContent = 'Latest report · ' + stateLabel(report);
  var desc = document.createElement('small'); desc.textContent = Number(report.passedCount || 0) + ' passed · ' + Number(report.criticalCount || 0) + ' critical · ' + Number(report.warningCount || 0) + ' warnings';
  summary.append(heading, desc); host.appendChild(summary);
  (Array.isArray(report.checks) ? report.checks : []).slice(0, 20).forEach(function (check) {
    var row = document.createElement('div'); row.className = 'row';
    var dot = document.createElement('span'); dot.className = 'dot' + (['fail','warning','skipped'].includes(check.status) ? ' ' + check.status : ''); dot.setAttribute('aria-hidden', 'true');
    var info = document.createElement('div'); var title = document.createElement('div'); title.className = 'rowtitle'; title.textContent = safeText(check.path || check.id || 'System check', 120);
    var message = document.createElement('div'); message.className = 'rowsummary'; message.textContent = safeText(check.summary || 'Check completed.', 260); info.append(title, message);
    var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = safeText(check.status || 'unknown', 24);
    row.append(dot, info, badge); host.appendChild(row);
  });
  if (report.finishedAt) { var time = document.createElement('div'); time.className = 'rowsummary'; time.style.marginTop = '11px'; time.textContent = 'Checked at ' + safeText(new Date(report.finishedAt).toLocaleString(), 80); host.appendChild(time); }
}

function renderFixPlan(plan) {
  var host = q('[data-ovsx-plan]'); if (!host) return;
  host.replaceChildren();
  host.hidden = false;

  var header = document.createElement('div'); header.className = 'summary';
  var title = document.createElement('strong'); title.textContent = 'Safe remediation plan';
  var summary = document.createElement('small'); summary.textContent = safeText(plan && plan.summary || 'No remediation plan is available.', 280);
  header.append(title, summary); host.appendChild(header);

  var tasks = Array.isArray(plan && plan.tasks) ? plan.tasks.slice(0, 12) : [];
  if (!tasks.length) {
    var empty = document.createElement('div'); empty.className = 'plan-task';
    empty.textContent = plan && plan.status === 'no_report'
      ? 'Run a Sentinel scan first, then prepare a plan from its saved findings.'
      : 'No remediation actions are indicated by the latest saved health checks.';
    host.appendChild(empty);
  }
  tasks.forEach(function (task) {
    var item = document.createElement('article');
    item.className = 'plan-task';
    item.dataset.priority = task && task.priority === 'critical' ? 'critical' : 'warning';
    var heading = document.createElement('div'); heading.className = 'plan-heading';
    var name = document.createElement('span'); name.textContent = safeText(task && task.title || 'Review system check', 160);
    var priority = document.createElement('span'); priority.className = 'plan-priority'; priority.textContent = safeText(task && task.priority || 'review', 24);
    heading.append(name, priority); item.appendChild(heading);

    var issue = document.createElement('div'); issue.className = 'plan-issue';
    issue.textContent = safeText(task && task.issue || 'A system check needs attention.', 260);
    item.appendChild(issue);

    var names = Array.isArray(task && task.configurationNames)
      ? task.configurationNames.filter(function (value) { return /^[A-Z][A-Z0-9_]{1,79}$/.test(String(value || '')); }).slice(0, 16)
      : [];
    if (names.length) {
      var config = document.createElement('div'); config.className = 'plan-issue';
      config.textContent = 'Configuration names: ' + names.join(', ');
      item.appendChild(config);
    }
    var steps = Array.isArray(task && task.steps) ? task.steps.slice(0, 6) : [];
    if (steps.length) {
      var ordered = document.createElement('ol');
      steps.forEach(function (step) {
        var li = document.createElement('li'); li.textContent = safeText(step, 320); ordered.appendChild(li);
      });
      item.appendChild(ordered);
    }
    host.appendChild(item);
  });

  var note = document.createElement('div'); note.className = 'plan-note';
  note.textContent = safeText(plan && plan.note || 'Advisory only. No changes have been applied.', 360);
  host.appendChild(note);
}
function renderDiagnosis(data) {
  var host = q('[data-ovsx-diagnosis]'); if (!host) return;
  host.replaceChildren(); host.hidden = false;
  var header = document.createElement('div'); header.className = 'summary';
  var title = document.createElement('strong'); title.textContent = 'AI incident diagnosis';
  var detail = document.createElement('small'); detail.textContent = 'Evidence report ' + safeText(data && data.reportId || 'unknown', 100) + ' · ' + safeText(data && data.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'just now', 80);
  header.append(title, detail); host.appendChild(header);
  var body = document.createElement('div'); body.className = 'plan-issue'; body.style.whiteSpace = 'pre-wrap';
  body.textContent = safeText(data && data.diagnosis || 'The diagnostic brain did not return a result.', 6000);
  host.appendChild(body);
  var note = document.createElement('div'); note.className = 'plan-note';
  note.textContent = 'Diagnosis only. No source files, provider keys, Cloudflare settings, or deployments were changed.';
  host.appendChild(note);
}
async function diagnoseLatest(shouldSpeak) {
  if (busy) return;
  busy = true;
  var button = q('[data-ovsx="diagnose"]'); if (button) button.disabled = true;
  status('Investigating the latest saved report with the diagnostic AI brain…');
  try {
    var idToken = await getToken();
    var response = await fetch('/api/admin/sentinel-diagnose', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ action: 'diagnose' })
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || data.ok !== true) throw new Error(String(data.message || data.error || 'Sentinel could not diagnose the report.').slice(0, 320));
    renderDiagnosis(data);
    var message = safeText(data.diagnosis || 'The diagnosis is ready.', 900);
    transcript('Sentinel AI diagnosis:\\n' + message);
    status('Diagnosis ready. It is based on the saved report; no changes were applied.', 'success');
    if (shouldSpeak) speak(message);
  } catch (error) {
    status(String(error.message || 'AI diagnosis failed.') + ' Run Check now and retry.', 'error');
    if (shouldSpeak) speak('Sorry boss, I could not complete the AI diagnosis. ' + String(error.message || ''));
  } finally {
    busy = false;
    var current = q('[data-ovsx="diagnose"]'); if (current) current.disabled = false;
  }
}
function speak(text) {
  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
  try {
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(String(text || '').slice(0, 1000));
    var mute = q('[data-ovsx="mute"]'); if (mute) mute.disabled = false;
    utterance.onend = utterance.onerror = function () { if (mute) mute.disabled = true; };
    window.speechSynthesis.speak(utterance);
  } catch (_) {}
}
function showPanel(show, refreshReport) {
  buildShell();
  var panel = q('#' + ID + '-panel');
  var wasHidden = panel.hidden;
  panel.hidden = !show;
  if (show) { if (refreshReport !== false && wasHidden) void loadLatest(); q('[data-ovsx="scan"]').focus(); }
}
async function loadLatest() {
  if (busy) return;
  try { var data = await api('GET'); renderReport(data.latestReport); status(data.lastScanAt ? 'Last saved scan: ' + new Date(data.lastScanAt).toLocaleString() : 'Sentinel is connected. Run the first check when ready.', 'success'); }
  catch (error) { status(error.message || 'Sentinel history is unavailable.', 'error'); }
}
async function prepareFixPlan() {
  if (busy) return;
  var button = q('[data-ovsx="plan"]'); if (button) button.disabled = true;
  status('Preparing a safe remediation plan from the latest saved checks…');
  try {
    var data = await api('GET');
    renderReport(data.latestReport || null);
    renderFixPlan(data.fixPlan || null);
    status('Fix plan prepared for review. Sentinel has not changed code, settings, secrets, or deployments.', 'success');
  } catch (error) {
    status(error.message || 'Sentinel could not prepare a remediation plan.', 'error');
  } finally {
    var current = q('[data-ovsx="plan"]'); if (current) current.disabled = false;
  }
}
async function scanNow(shouldSpeak) {
  if (busy) return;
  busy = true; var button = q('[data-ovsx="scan"]'); if (button) button.disabled = true;
  status('Checking platform health, configuration, CI signals, and assistant assets…');
  try {
    var data = await api('POST', { action: 'scan' }); renderReport(data.report);
    var message = 'Sentinel scan finished. Status: ' + stateLabel(data.report) + '. ' + Number(data.report.criticalCount || 0) + ' critical issues and ' + Number(data.report.warningCount || 0) + ' warnings.';
    status(message, Number(data.report.criticalCount || 0) ? 'error' : Number(data.report.warningCount || 0) ? 'info' : 'success');
    if (shouldSpeak) speak(message);
  } catch (error) { status(error.message || 'Sentinel could not complete its scan.', 'error'); if (shouldSpeak) speak('Sorry boss, I could not complete the scan. ' + String(error.message || '')); }
  finally { busy = false; if (button) button.disabled = false; }
}
function transcript(message) { var element = q('[data-ovsx-transcript]'); if (!element) return; element.hidden = false; element.textContent = safeText(message, 1400); }
async function askAI(question) {
  var reportSummary = latestReport ? { status: latestReport.status, checkedAt: latestReport.finishedAt, checks: (latestReport.checks || []).slice(0, 16).map(function (c) { return { path: c.path, status: c.status, code: c.code, summary: c.summary }; }) } : null;
  status('Thinking about your question…');
  try {
    var idToken = await getToken();
    var response = await fetch('/api/ai/ovyx', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken }, body: JSON.stringify({
      prompt: safeText(question, 1500),
      system: 'You are OVYX Sentinel, the verified root administrator’s private platform guardian. Answer conversationally. Use only the supplied operational report. Never claim background monitoring unless scheduled runs are recorded; never claim a fix was applied when it was not; never request private end-user files or conversations; never expose secrets. Distinguish evidence from hypotheses. Code changes still require the guarded development workflow.',
      context: { sentinelReport: reportSummary, scope: 'platform-operational-health-only' }
    }) });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || data.ok !== true) throw new Error(data.message || data.error || 'OVYX AI could not answer right now.');
    var answer = safeText(data.text || data.message || 'I did not receive a response.', 1300);
    transcript('You: ' + safeText(question, 300) + '\nSentinel: ' + answer); status('Sentinel replied using the available report.', 'success'); speak(answer);
  } catch (error) { status(String(error.message || 'Voice request failed.') + ' Use Check now for a fresh report.', 'error'); speak('Sorry boss, I could not answer that right now.'); }
}
function normalize(text) { return String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function handleVoice(raw) {
  var text = normalize(raw); if (!text) return;
  if (/\b(?:stop listening|pause listening|disable wake word|turn off wake word)\b/.test(text)) { disableWake('Wake word disabled. Microphone listening has stopped.'); speak('Wake word disabled, boss.'); return; }
  var wake = text.match(/\b(?:ovyx|o\s*v\s*y\s*x|oh\s*v\s*y\s*x|oh\s*vyx)\b/i);
  if (wake) {
    showPanel(true, false);
    var command = text.slice((wake.index || 0) + wake[0].length).trim();
    if (command) { awaitingUntil = 0; runVoiceCommand(command); }
    else { awaitingUntil = Date.now() + 12000; status('I heard OVYX. Tell me what you need within 12 seconds.', 'success'); speak('I’m listening, boss. What should I check?'); }
    return;
  }
  if (Date.now() < awaitingUntil) { awaitingUntil = 0; runVoiceCommand(text); }
}
async function runVoiceCommand(command) {
  var text = normalize(command); transcript('Heard: ' + text);
  if (/\b(?:scan|check|diagnos|health|status|inspect platform|system report|check now)\b/.test(text)) { await scanNow(true); return; }
  if (/\b(?:report|what did you find|latest results|last check|summary)\b/.test(text) && latestReport) {
    var summary = stateLabel(latestReport) + '. ' + Number(latestReport.criticalCount || 0) + ' critical issues and ' + Number(latestReport.warningCount || 0) + ' warnings.';
    status(summary, latestReport.status === 'critical' ? 'error' : 'success'); transcript(summary); speak(summary); return;
  }
  await askAI(command);
}
function disableWake(message) {
  wakeEnabled = false; awaitingUntil = 0; clearTimeout(restartTimer);
  if (recognition) { try { recognition.onend = null; recognition.stop(); } catch (_) {} recognition = null; }
  var button = q('[data-ovsx="wake"]'); if (button) button.textContent = 'Enable wake word';
  if (message) status(message, 'info');
}
function makeRecognition() {
  var Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Constructor || !wakeEnabled || document.hidden) return;
  try {
    recognition = new Constructor(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US'; recognition.maxAlternatives = 1;
    recognition.onresult = function (event) { for (var i = event.resultIndex; i < event.results.length; i += 1) if (event.results[i].isFinal) handleVoice(event.results[i][0] && event.results[i][0].transcript); };
    recognition.onerror = function (event) { if (!wakeEnabled || ['no-speech','aborted'].includes(String(event.error || ''))) return; if (['not-allowed','service-not-allowed','audio-capture'].includes(String(event.error || ''))) { disableWake('Microphone permission or audio capture is unavailable. Enable microphone access in your browser settings, then try again.'); return; } status('Speech recognition issue: ' + safeText(event.error || 'unknown', 60) + '. You can pause and re-enable the wake word.', 'error'); };
    recognition.onend = function () { recognition = null; if (wakeEnabled && !document.hidden) restartTimer = setTimeout(makeRecognition, 700); };
    recognition.start();
  } catch (_) { recognition = null; disableWake('The browser could not start listening. Check microphone permission and try again.'); }
}
function toggleWake() {
  if (wakeEnabled) { disableWake('Wake word paused. Microphone listening has stopped.'); return; }
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { status('This browser does not support speech recognition. You can still use Check now.', 'error'); return; }
  wakeEnabled = true; q('[data-ovsx="wake"]').textContent = 'Pause wake word';
  status('Wake word enabled. Say OVYX to get my attention. The page must remain open and active.', 'success');
  makeRecognition();
}
function bindShell() {
  q('#' + ID + '-launch').addEventListener('click', function () { showPanel(true); });
  root.addEventListener('click', function (event) {
    var button = event.target.closest('[data-ovsx]'); if (!button) return;
    if (button.dataset.ovsx === 'close') showPanel(false);
    else if (button.dataset.ovsx === 'scan') void scanNow(false);
    else if (button.dataset.ovsx === 'plan') void prepareFixPlan();
    else if (button.dataset.ovsx === 'diagnose') void diagnoseLatest(false);
    else if (button.dataset.ovsx === 'wake') toggleWake();
    else if (button.dataset.ovsx === 'mute') { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {} button.disabled = true; }
  });
}
async function bootstrap() {
  if (!adminClient()) return;
  buildShell();
  status('Administrator identity detected. Verifying access with Sentinel server…');
  try { var data = await api('GET'); renderReport(data.latestReport); status('Welcome back, boss. Sentinel is ready.', 'success'); }
  catch (error) { status('Private Sentinel interface is ready, but the server could not load its report: ' + error.message, 'error'); }
}
function observeAuth() {
  try {
    var auth = window.firebase && window.firebase.auth();
    if (auth && typeof auth.onAuthStateChanged === 'function') {
      auth.onAuthStateChanged(function (u) {
        if (!u || String(u.email || '').trim().toLowerCase() !== ADMIN_EMAIL || u.emailVerified !== true) {
          disableWake(); if (root) root.remove(); root = null; latestReport = null; return;
        }
        void bootstrap();
      });
      return;
    }
  } catch (_) {}
  var tries = 0; var timer = setInterval(function () { tries += 1; if (user()) { clearInterval(timer); void bootstrap(); } else if (tries >= 80) clearInterval(timer); }, 500);
}
document.addEventListener('visibilitychange', function () {
  if (document.hidden && wakeEnabled && recognition) { try { recognition.stop(); } catch (_) {} }
  else if (!document.hidden && wakeEnabled && !recognition) makeRecognition();
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeAuth, { once: true }); else observeAuth();
window.OVYXSentinel = { open: function () { showPanel(true); }, scan: function () { return scanNow(false); }, pauseWakeWord: function () { disableWake('Wake word paused.'); }, getReport: function () { return latestReport ? JSON.parse(JSON.stringify(latestReport)) : null; } };
})();