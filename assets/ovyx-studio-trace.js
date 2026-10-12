(function () {
  'use strict';

  if (window.__OVYX_STUDIO_TRACE__) return;
  const nativeFetch = window.fetch.bind(window);
  if (typeof nativeFetch !== 'function') return;

  const ROOT_ID = 'ovyx-studio-trace';
  const state = {
    visible: false,
    busy: false,
    status: 'Waiting for a Web Studio build or edit.',
    mode: '',
    startedAt: 0,
    elapsedMs: 0,
    events: [],
  };
  let ui = null;

  const css = [
    '#ovyx-studio-trace{position:fixed;right:18px;bottom:18px;z-index:2147483500;font:13px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f4f4f5}',
    '#ovyx-studio-trace *{box-sizing:border-box}',
    '#ovyx-studio-trace .ost-toggle{display:flex;align-items:center;gap:9px;border:1px solid rgba(232,182,79,.42);border-radius:999px;padding:10px 14px;background:rgba(13,15,19,.97);color:#f7dfa0;box-shadow:0 12px 40px rgba(0,0,0,.35);cursor:pointer;font:inherit;font-weight:750}',
    '#ovyx-studio-trace .ost-dot{width:8px;height:8px;border-radius:50%;background:#a1a1aa;flex:0 0 auto}',
    '#ovyx-studio-trace[data-busy="true"] .ost-dot{background:#fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.13);animation:ostPulse 1.4s ease-in-out infinite}',
    '#ovyx-studio-trace[data-status="success"] .ost-dot{background:#34d399}#ovyx-studio-trace[data-status="error"] .ost-dot{background:#fb7185}#ovyx-studio-trace[data-status="warning"] .ost-dot{background:#fbbf24}',
    '#ovyx-studio-trace .ost-panel{width:min(390px,calc(100vw - 24px));max-height:min(72vh,640px);overflow:auto;margin-bottom:10px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(12,14,18,.985);box-shadow:0 24px 80px rgba(0,0,0,.45);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}',
    '#ovyx-studio-trace .ost-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px;border-bottom:1px solid rgba(255,255,255,.08)}',
    '#ovyx-studio-trace .ost-kicker{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#e8b64f;font-weight:850}',
    '#ovyx-studio-trace .ost-title{font-size:17px;font-weight:800;letter-spacing:-.02em;margin-top:3px}',
    '#ovyx-studio-trace .ost-status{color:#cbd5e1;font-size:12px;margin-top:4px;overflow-wrap:anywhere}',
    '#ovyx-studio-trace .ost-close{border:0;border-radius:9px;width:30px;height:30px;background:rgba(255,255,255,.07);color:#d4d4d8;cursor:pointer;font-size:19px;line-height:1}',
    '#ovyx-studio-trace .ost-events{display:grid;gap:0;padding:5px 15px 12px}',
    '#ovyx-studio-trace .ost-event{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06)}#ovyx-studio-trace .ost-event:last-child{border-bottom:0}',
    '#ovyx-studio-trace .ost-mark{width:22px;height:22px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.15);border-radius:50%;color:#a1a1aa;font-size:11px;font-weight:850}',
    '#ovyx-studio-trace .ost-event[data-kind="success"] .ost-mark{border-color:rgba(52,211,153,.35);color:#6ee7b7;background:rgba(16,185,129,.09)}#ovyx-studio-trace .ost-event[data-kind="error"] .ost-mark{border-color:rgba(251,113,133,.35);color:#fda4af;background:rgba(244,63,94,.08)}#ovyx-studio-trace .ost-event[data-kind="warning"] .ost-mark{border-color:rgba(251,191,36,.35);color:#fcd34d;background:rgba(245,158,11,.08)}',
    '#ovyx-studio-trace .ost-event-title{font-weight:750;font-size:12px;color:#f4f4f5}#ovyx-studio-trace .ost-event-copy{font-size:11px;color:#a1a1aa;margin-top:2px;overflow-wrap:anywhere;white-space:pre-wrap}',
    '#ovyx-studio-trace .ost-note{padding:12px 16px;border-top:1px solid rgba(255,255,255,.07);font-size:10px;line-height:1.5;color:#858b98}',
    '@keyframes ostPulse{50%{box-shadow:0 0 0 7px rgba(251,191,36,0)}}@media(max-width:560px){#ovyx-studio-trace{right:10px;bottom:max(10px,env(safe-area-inset-bottom))}#ovyx-studio-trace .ost-panel{width:calc(100vw - 20px);max-height:68vh}}@media(prefers-reduced-motion:reduce){#ovyx-studio-trace .ost-dot{animation:none!important}}'
  ].join('');

  function addStyle() {
    if (document.getElementById('ovyx-studio-trace-style')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-studio-trace-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = String(text);
    return item;
  }

  function ensureUI() {
    if (ui && document.contains(ui.root)) return ui;
    addStyle();

    const root = node('section');
    root.id = ROOT_ID;
    root.setAttribute('aria-label', 'Web Studio trace');
    root.setAttribute('aria-live', 'polite');
    root.dataset.busy = 'false';
    root.dataset.status = 'info';

    const panel = node('div', 'ost-panel');
    panel.hidden = true;

    const head = node('div', 'ost-head');
    const titleWrap = node('div');
    titleWrap.appendChild(node('div', 'ost-kicker', 'OVYX · BUILD QUALITY'));
    titleWrap.appendChild(node('div', 'ost-title', 'Studio Trace'));
    const status = node('div', 'ost-status', state.status);
    titleWrap.appendChild(status);
    const close = node('button', 'ost-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Minimize Studio Trace');
    close.addEventListener('click', function () {
      panel.hidden = true;
      state.visible = false;
      renderToggle();
    });
    head.appendChild(titleWrap);
    head.appendChild(close);

    const events = node('div', 'ost-events');
    const note = node('div', 'ost-note',
      'This trace shows request-level progress and checks returned by OVYX. Live per-file build events are not streamed here. Always inspect the preview; browser behavior and external integrations require separate testing.');
    panel.appendChild(head);
    panel.appendChild(events);
    panel.appendChild(note);

    const toggle = node('button', 'ost-toggle');
    toggle.type = 'button';
    toggle.addEventListener('click', function () {
      state.visible = !state.visible;
      panel.hidden = !state.visible;
      renderToggle();
    });

    root.appendChild(panel);
    root.appendChild(toggle);
    document.body.appendChild(root);
    ui = { root, panel, status, events, toggle };
    return ui;
  }

  function renderToggle() {
    if (!ui) return;
    ui.toggle.replaceChildren();
    ui.toggle.appendChild(node('span', 'ost-dot'));
    const label = state.busy
      ? 'Studio Trace · Working'
      : state.status === 'Needs your input'
        ? 'Studio Trace · Action needed'
        : state.status === 'Request failed'
          ? 'Studio Trace · Failed'
          : 'Studio Trace';
    ui.toggle.appendChild(node('span', '', label));
    ui.root.dataset.busy = state.busy ? 'true' : 'false';
    ui.root.dataset.status = state.status === 'Request failed'
      ? 'error'
      : state.status === 'Needs your input' || state.status === 'Output checks need attention'
        ? 'warning'
        : state.status === 'Output checks passed'
          ? 'success'
          : 'info';
  }

  function render() {
    const view = ensureUI();
    view.status.textContent = state.status + (state.elapsedMs ? ' · ' + (state.elapsedMs / 1000).toFixed(1) + 's' : '');
    view.events.replaceChildren();
    state.events.slice(-8).forEach(function (event) {
      const row = node('div', 'ost-event');
      row.dataset.kind = event.kind || 'info';
      const mark = node('span', 'ost-mark', event.kind === 'success' ? '✓' : event.kind === 'error' ? '×' : event.kind === 'warning' ? '!' : '·');
      mark.setAttribute('aria-hidden', 'true');
      const copy = node('div');
      copy.appendChild(node('div', 'ost-event-title', event.title));
      copy.appendChild(node('div', 'ost-event-copy', event.description));
      row.appendChild(mark);
      row.appendChild(copy);
      view.events.appendChild(row);
    });
    view.panel.hidden = !state.visible;
    renderToggle();
  }

  function record(title, description, kind) {
    state.events.push({
      title: String(title || '').slice(0, 120),
      description: String(description || '').slice(0, 650),
      kind: kind || 'info',
      at: Date.now(),
    });
    if (state.events.length > 20) state.events = state.events.slice(-20);
    render();
  }

  function getURL(input) {
    const raw = typeof input === 'string' ? input : input && input.url;
    if (!raw) return null;
    try {
      return new URL(raw, window.location && window.location.href || 'https://ovyx.local');
    } catch (_) {
      return null;
    }
  }

  function parsePayload(input, init) {
    const body = init && init.body;
    if (typeof body !== 'string' || !body.trim()) return null;
    try { return JSON.parse(body); } catch (_) { return null; }
  }

  function isStudioBuild(url, payload) {
    if (!url || !/^\/api\/ai\/(?:gateway|assistant)$/.test(url.pathname)) return false;
    const data = payload || {};
    const mode = String(data.mode || '').toLowerCase();
    if (/^(?:build|fix|web-studio-build|web-studio-fix|web-studio-plan|web-studio-ask)$/.test(mode)) return true;
    return false;
  }

  function start(mode, payload) {
    state.visible = true;
    state.busy = true;
    state.mode = mode;
    state.startedAt = Date.now();
    state.elapsedMs = 0;
    state.status = 'Request in progress';
    state.events = [];
    record('Request sent to OVYX', 'Mode: ' + mode + '. The full prompt and project contents are not copied into this trace.', 'success');
    record('Waiting for the AI build response', 'OVYX is processing the request. This panel updates when the server responds.', 'info');
    render();
  }

  function finish(payload, response) {
    state.busy = false;
    state.elapsedMs = Date.now() - state.startedAt;

    if (!response.ok || payload && payload.ok === false) {
      state.status = 'Request failed';
      const message = payload && (payload.message || payload.error && payload.error.message) || 'OVYX returned an error response (HTTP ' + response.status + ').';
      record('OVYX returned an error', message, 'error');
      render();
      return;
    }

    if (payload && payload.needsUserInput) {
      state.status = 'Needs your input';
      record('Waiting for your details', payload.message || payload.text || 'Answer the question in Web Studio to continue.', 'warning');
      render();
      return;
    }

    const verification = payload && (payload.requirementVerification || payload.data && payload.data.requirementVerification);
    if (verification && verification.ok === true) {
      state.status = 'Output checks passed';
      record('Required-output checks passed', 'Checked ' + Number(verification.checkedFiles || 0) + ' files (' + Number(verification.checkedHtmlFiles || 0) + ' HTML files). This checks requested structure/signals, not full browser behavior.', 'success');
    } else if (verification && verification.ok === false) {
      state.status = 'Output checks need attention';
      const issues = Array.isArray(verification.issues) ? verification.issues : [];
      record('Some requested items were not verified', issues.map(item => item.message || item.code || 'Requirement needs review').slice(0, 5).join('\n') || 'Review the generated files and preview before publishing.', 'warning');
    } else {
      state.status = 'Response received';
      record('AI response received', 'This response did not include automated output-check results. Review every requested detail in the preview before publishing.', 'warning');
    }
    render();
  }

  window.fetch = async function (input, init) {
    const url = getURL(input);
    const payload = parsePayload(input, init);
    if (!isStudioBuild(url, payload)) return nativeFetch.apply(this, arguments);

    const mode = String(payload.mode || 'build').toLowerCase();
    start(mode, payload);
    const args = arguments;
    try {
      const response = await nativeFetch.apply(this, args);
      let result = null;
      try {
        result = JSON.parse(await response.clone().text());
      } catch (_) {
        result = null;
      }
      finish(result, response);
      return response;
    } catch (error) {
      state.busy = false;
      state.elapsedMs = Date.now() - state.startedAt;
      state.status = 'Request failed';
      record('Request could not complete', error && error.message || 'A network error interrupted the request.', 'error');
      render();
      throw error;
    }
  };

  window.__OVYX_STUDIO_TRACE__ = Object.freeze({
    getState: function () {
      return {
        visible: state.visible,
        busy: state.busy,
        status: state.status,
        mode: state.mode,
        elapsedMs: state.elapsedMs,
        events: state.events.map(function (item) { return { title: item.title, description: item.description, kind: item.kind }; }),
      };
    },
  });
})();