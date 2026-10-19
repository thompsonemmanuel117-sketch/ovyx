(function () {
  'use strict';
  if (window.__OVYX_WEBSTUDIO_RESEARCH_V1__) return;
  window.__OVYX_WEBSTUDIO_RESEARCH_V1__ = true;

  var STYLE_ID = 'ovyx-ws-live-activity-style-v1';
  var studioRef = null;
  var activeTask = null;
  var taskSequence = 0;

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 260);
  }
  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value == null ? null : value; }
  }
  function fileText(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    var text = value.content != null ? value.content : value.text != null ? value.text : value.source != null ? value.source : value.code;
    return typeof text === 'string' ? text : '';
  }
  function promptFrom(payload) {
    if (payload && (payload.prompt || payload.message)) return String(payload.prompt || payload.message).trim();
    var messages = payload && Array.isArray(payload.messages) ? payload.messages : [];
    for (var i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i] && messages[i].role === 'user') return String(messages[i].content || '').trim();
    }
    var input = document.getElementById('ws-chat-input');
    return String(input && input.value || '').trim();
  }
  function shouldSearchWeb(prompt) {
    var text = String(prompt || '');
    if (!text.trim()) return false;
    var explicitWeb = /\b(?:internet|online|on the web|on the internet|web search|search the web|browse the web|official documentation|external sources|online sources|competitors?|other platforms|reference websites?|research papers?)\b/i.test(text);
    var projectOnly = /\b(?:my project|this project|current project|source code|project files|these files|my website source|in the code|in my site|inside the project)\b/i.test(text);
    if (projectOnly && !explicitWeb) return false;
    if (explicitWeb) return true;
    var researchVerb = /\b(?:search|research|look up|browse|investigate|compare|find examples)\b/i.test(text);
    var researchObject = /\b(?:how|what|official|documentation|examples?|best practices|design patterns?|another platform|similar websites?|competitor|competitors|app|platform|website|service)\b/i.test(text);
    var knownPlatform = /\b(?:ovyx|chatgpt|openai|figma|notion|stripe|linear|vercel|webflow|framer|shopify|wordpress|wix|squarespace|github|claude|gemini)\b/i.test(text);
    return researchVerb && (researchObject || knownPlatform);
  }
  function asksOnlyAdvice(prompt) {
    var text = String(prompt || '');
    return /\b(?:what should i change|what would you change|what do you recommend|what would you recommend|recommend changes|suggest changes|give me suggestions|how can i improve|what can be improved|what should be improved)\b/i.test(text) &&
      !/\b(?:and then|and please|then please)?\s*(?:apply|implement|make|add|change|fix|update|build)\b/i.test(text);
  }
  function isEditPrompt(prompt, mode) {
    var text = String(prompt || '');
    if (asksOnlyAdvice(text)) return false;
    if (/\b(?:apply|implement|add|change|edit|update|fix|repair|remove|delete|replace|improve|enhance|adjust|modify|restyle|reposition|resize|polish|optimi[sz]e|build|create|generate)\b/i.test(text) &&
        /\b(?:site|website|project|page|layout|design|feature|functionality|component|menu|header|footer|hero|button|form|font|colors?|background|style|source|code|this|that|it|those|these|my|new website|website|app|flow|interaction)\b/i.test(text)) return true;
    return ['build', 'fix'].indexOf(String(mode || '').toLowerCase()) >= 0 && !/^(?:please\s+)?(?:search|find|locate|inspect|review|examine|audit|trace|verify|check|list|show|read|what|how|why|is|are|was|were|has|have|did|does|do|tell me|recommend|suggest)\b/i.test(text);
  }
  function safeWebUrl(value) {
    try {
      var url = new URL(String(value || ''));
      var host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      if (url.username || url.password || !host || host.indexOf(':') >= 0 ||
          host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
          host.endsWith('.internal') || /^127\./.test(host) || /^10\./.test(host) ||
          /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
          /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return '';
      url.hash = '';
      return url.href;
    } catch (_) { return ''; }
  }
  function activityPlan(task) {
    var plan = [{ id: 'understand', label: 'Understand your request' }];
    if (task && task.hasResearch) {
      plan.push({ id: 'search', label: 'Search and read web sources' });
      plan.push({ id: 'compare', label: task.isEdit ? 'Compare findings with your website' : 'Compare findings and prepare suggestions' });
    }
    if (task && task.isEdit) {
      plan.push({ id: 'inspect', label: 'Inspect your existing website' });
      plan.push({ id: 'apply', label: 'Apply your requested changes' });
      plan.push({ id: 'verify', label: 'Verify the result' });
    } else if (!(task && task.hasResearch)) {
      plan.push({ id: 'answer', label: 'Prepare your answer' });
    } else {
      plan.push({ id: 'complete', label: 'Share findings and source links' });
    }
    return plan;
  }
  function addActivityStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.ovyx-ws-live-activity{display:block;position:relative;margin:13px 0 8px;padding:14px 14px 12px;border:1px solid rgba(227,184,96,.23);border-radius:15px;background:linear-gradient(140deg,rgba(31,35,42,.98),rgba(16,19,24,.98));color:#e7e9ed;font:500 12px/1.5 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.12);overflow:hidden}',
      '.ovyx-ws-live-activity[data-state="success"]{border-color:rgba(72,190,134,.32)}.ovyx-ws-live-activity[data-state="warning"],.ovyx-ws-live-activity[data-state="error"]{border-color:rgba(234,167,87,.45)}',
      '.ovyx-ws-live-head{display:flex;align-items:center;gap:11px}.ovyx-ws-live-orbit{width:37px;height:37px;flex:0 0 37px;display:grid;place-items:center;border:2px solid rgba(239,197,116,.24);border-top-color:#f4d18c;border-right-color:#bda065;border-radius:50%;position:relative;animation:ovyxWsOrbit 1.3s linear infinite}',
      '.ovyx-ws-live-orbit:before{content:"O";width:23px;height:23px;display:grid;place-items:center;border-radius:8px;background:linear-gradient(135deg,#f5dda5,#bd8b3d);color:#252018;font:900 15px/1 Inter,system-ui,sans-serif;animation:ovyxWsPulse 1.8s ease-in-out infinite}',
      '.ovyx-ws-live-activity[data-state="success"] .ovyx-ws-live-orbit,.ovyx-ws-live-activity[data-state="warning"] .ovyx-ws-live-orbit,.ovyx-ws-live-activity[data-state="error"] .ovyx-ws-live-orbit{animation:none;border-color:rgba(255,255,255,.18)}.ovyx-ws-live-activity[data-state="success"] .ovyx-ws-live-orbit:before{content:"✓";background:#57bd8b;color:#0a2116;animation:none}.ovyx-ws-live-activity[data-state="warning"] .ovyx-ws-live-orbit:before{content:"!";background:#e2b16a;color:#291d0d;animation:none}.ovyx-ws-live-activity[data-state="error"] .ovyx-ws-live-orbit:before{content:"×";background:#d88484;color:#2a0e0e;animation:none}',
      '.ovyx-ws-live-copy{min-width:0;flex:1}.ovyx-ws-live-eyebrow{color:#d9ba7b;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.ovyx-ws-live-title{margin-top:2px;color:#fff;font-size:13px;font-weight:750;line-height:1.35}.ovyx-ws-live-detail{margin-top:4px;color:#aeb6c1;font-size:11px;overflow-wrap:anywhere}.ovyx-ws-live-state{margin-left:auto;align-self:flex-start;flex:0 0 auto;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.06);color:#c7ccd3;font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.ovyx-ws-live-activity[data-state="success"] .ovyx-ws-live-state{background:rgba(72,190,134,.12);color:#91e0b5}.ovyx-ws-live-activity[data-state="warning"] .ovyx-ws-live-state,.ovyx-ws-live-activity[data-state="error"] .ovyx-ws-live-state{background:rgba(234,167,87,.12);color:#f0c681}',
      '.ovyx-ws-live-steps{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0;padding:0;list-style:none}.ovyx-ws-live-steps li{display:flex;align-items:center;gap:5px;min-width:0;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:8px;background:rgba(255,255,255,.025);color:#7f8997;font-size:9px;line-height:1.35}.ovyx-ws-live-step-icon{display:inline-grid;place-items:center;width:14px;height:14px;flex:0 0 14px;border:1px solid rgba(255,255,255,.15);border-radius:50%;font-size:8px;font-weight:800}.ovyx-ws-live-steps li.is-done{color:#a8dfc0;border-color:rgba(72,190,134,.14)}.ovyx-ws-live-steps li.is-done .ovyx-ws-live-step-icon{border-color:#57bd8b;background:rgba(72,190,134,.12);color:#9ce5bb}.ovyx-ws-live-steps li.is-current{color:#f2dcae;border-color:rgba(239,197,116,.34);background:rgba(239,197,116,.055)}.ovyx-ws-live-steps li.is-current .ovyx-ws-live-step-icon{border-color:#dbb96f;color:#f3d695}.ovyx-ws-live-steps li.is-failed{color:#f0b9a1;border-color:rgba(234,130,115,.35)}',
      '.ovyx-ws-live-sources{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.ovyx-ws-live-source{display:flex;align-items:center;gap:6px;max-width:100%;min-width:0;padding:5px 7px;border:1px solid rgba(255,255,255,.085);border-radius:9px;background:rgba(255,255,255,.035);color:#d5dbe3;text-decoration:none;font-size:10px}.ovyx-ws-live-source:hover,.ovyx-ws-live-source:focus-visible{outline:2px solid rgba(239,197,116,.48);outline-offset:1px;border-color:rgba(239,197,116,.35)}.ovyx-ws-live-source.is-current{border-color:rgba(239,197,116,.42);background:rgba(239,197,116,.07)}.ovyx-ws-live-source img{display:block;width:18px;height:18px;flex:0 0 18px;border-radius:5px;object-fit:contain;background:#fff}.ovyx-ws-live-source span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ovyx-ws-live-source small{margin-left:4px;color:#8d98a7;font-size:9px}.ovyx-ws-live-files{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.ovyx-ws-live-file{max-width:100%;padding:4px 7px;border:1px solid rgba(255,255,255,.07);border-radius:7px;color:#aeb8c5;background:rgba(255,255,255,.025);font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}',
      '@keyframes ovyxWsOrbit{to{transform:rotate(360deg)}}@keyframes ovyxWsPulse{0%,100%{transform:scale(1)}50%{transform:scale(.88)}}@media(max-width:480px){.ovyx-ws-live-activity{padding:12px}.ovyx-ws-live-state{font-size:7px;padding:3px 5px}.ovyx-ws-live-steps{gap:5px}.ovyx-ws-live-steps li{font-size:8px;padding:5px 6px}}@media(prefers-reduced-motion:reduce){.ovyx-ws-live-orbit,.ovyx-ws-live-orbit:before{animation:none!important}}'
    ].join('');
    document.head.appendChild(style);
  }
  function taskState(task) {
    if (!task) return { phase: 'answer', state: 'running', title: 'Working on your request', detail: 'Getting the right context ready.' };
    return {
      phase: task.phase || 'understand',
      state: task.state || 'running',
      title: task.title || 'Working on your request',
      detail: task.detail || 'Preparing the next step.'
    };
  }
  function renderActivity() {
    var threadRoot = document.getElementById('ws-agent-thread');
    if (!threadRoot || !activeTask) return;
    addActivityStyles();
    var card = threadRoot.querySelector('.ovyx-ws-live-activity');
    if (!card) {
      card = document.createElement('section');
      card.className = 'ovyx-ws-live-activity';
      card.setAttribute('role', 'status');
      card.setAttribute('aria-live', 'polite');
      card.setAttribute('aria-atomic', 'false');
      card.innerHTML = '<div class="ovyx-ws-live-head"><div class="ovyx-ws-live-orbit" aria-hidden="true"></div><div class="ovyx-ws-live-copy"><div class="ovyx-ws-live-eyebrow">OVYX · Web Studio</div><div class="ovyx-ws-live-title"></div><div class="ovyx-ws-live-detail"></div></div><span class="ovyx-ws-live-state"></span></div><ol class="ovyx-ws-live-steps"></ol><div class="ovyx-ws-live-sources" hidden></div><div class="ovyx-ws-live-files" hidden></div>';
      threadRoot.appendChild(card);
    }
    var state = taskState(activeTask);
    card.setAttribute('data-state', state.state);
    card.querySelector('.ovyx-ws-live-title').textContent = state.title;
    card.querySelector('.ovyx-ws-live-detail').textContent = state.detail;
    card.querySelector('.ovyx-ws-live-state').textContent = state.state === 'success' ? 'Complete' : state.state === 'warning' ? 'Needs attention' : state.state === 'error' ? 'Stopped' : 'In progress';

    var list = card.querySelector('.ovyx-ws-live-steps');
    list.textContent = '';
    var plan = activityPlan(activeTask);
    var currentIndex = plan.findIndex(function (item) { return item.id === state.phase; });
    if (state.phase === 'read' || state.phase === 'search') currentIndex = plan.findIndex(function (item) { return item.id === 'search'; });
    if (state.phase === 'compare') currentIndex = plan.findIndex(function (item) { return item.id === 'compare'; });
    if (state.phase === 'complete') currentIndex = plan.length - 1;
    plan.forEach(function (item, index) {
      var row = document.createElement('li');
      var icon = document.createElement('span');
      icon.className = 'ovyx-ws-live-step-icon';
      var label = document.createElement('span');
      label.textContent = item.label;
      if (state.state === 'success' || index < currentIndex) {
        row.classList.add('is-done');
        icon.textContent = '✓';
      } else if (state.state === 'error' && index === currentIndex) {
        row.classList.add('is-failed');
        icon.textContent = '!';
      } else if (index === currentIndex && state.state !== 'success') {
        row.classList.add('is-current');
        icon.textContent = '•';
      } else {
        icon.textContent = String(index + 1);
      }
      row.appendChild(icon);
      row.appendChild(label);
      list.appendChild(row);
    });

    var sourceBox = card.querySelector('.ovyx-ws-live-sources');
    sourceBox.textContent = '';
    var displaySources = (activeTask.sources || []).slice(-5);
    (activeTask.sources || []).slice(-5).forEach(function (source) {
      if (!source || !safeWebUrl(source.url)) return;
      var link = document.createElement('a');
      link.className = 'ovyx-ws-live-source' + (activeTask.activeSource && activeTask.activeSource.url === source.url && state.state === 'running' ? ' is-current' : '');
      link.href = safeWebUrl(source.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = source.title || source.domain || source.url;
      var image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.src = String(source.favicon || '');
      image.onerror = function () { image.style.display = 'none'; };
      var label = document.createElement('span');
      label.textContent = clean(source.title || source.domain || source.url, 76);
      var domain = document.createElement('small');
      domain.textContent = clean(source.domain || '', 64);
      label.appendChild(domain);
      link.appendChild(image);
      link.appendChild(label);
      sourceBox.appendChild(link);
    });
    sourceBox.hidden = sourceBox.childElementCount === 0;

    var filesBox = card.querySelector('.ovyx-ws-live-files');
    filesBox.textContent = '';
    (activeTask.changedPaths || []).slice(0, 8).forEach(function (path) {
      var file = document.createElement('span');
      file.className = 'ovyx-ws-live-file';
      file.textContent = path;
      filesBox.appendChild(file);
    });
    filesBox.hidden = filesBox.childElementCount === 0;

    try {
      var distanceToBottom = threadRoot.scrollHeight - threadRoot.scrollTop - threadRoot.clientHeight;
      if (distanceToBottom < 220 || activeTask.scrollToActivity) {
        threadRoot.scrollTop = threadRoot.scrollHeight;
        activeTask.scrollToActivity = false;
      }
    } catch (_) {}
  }
  function stage(task, phase, title, detail, state) {
    if (!task || activeTask !== task) return;
    task.phase = phase;
    task.title = clean(title, 140);
    task.detail = clean(detail, 800);
    task.state = state || 'running';
    renderActivity();
  }
  function currentFiles(studio) {
    try {
      if (studio && typeof studio.ensureProjectGraph === 'function') studio.ensureProjectGraph();
      var bag = studio && studio.graph && studio.graph.files || window.KernelState && window.KernelState.activeProject && window.KernelState.activeProject.ovyxGraph && window.KernelState.activeProject.ovyxGraph.files || {};
      return clone(bag) || {};
    } catch (_) { return {}; }
  }
  function changedPaths(before, after) {
    var all = Array.from(new Set(Object.keys(before || {}).concat(Object.keys(after || {}))));
    return all.filter(function (path) { return fileText((before || {})[path]) !== fileText((after || {})[path]); }).sort();
  }
  function startTask(prompt, mode, studio, standalone) {
    if (!prompt) return null;
    var sourceBag = currentFiles(studio);
    var edit = isEditPrompt(prompt, mode);
    activeTask = {
      id: ++taskSequence,
      prompt: prompt,
      mode: String(mode || 'ask').toLowerCase(),
      hasResearch: shouldSearchWeb(prompt),
      isEdit: edit,
      baselineFiles: sourceBag,
      sources: [],
      changedPaths: [],
      qualityEvents: [],
      research: null,
      researchAttempted: false,
      standalone: !!standalone,
      phase: 'understand',
      state: 'running',
      title: 'Understanding your request',
      detail: edit ? 'Preparing the current website source so changes stay focused and your working pages are preserved.' : 'Working out what information, examples, or source evidence will best answer your request.',
      startedAt: Date.now(),
      scrollToActivity: true
    };
    renderActivity();
    return activeTask;
  }
  function waitForPaint() {
    return new Promise(function (resolve) {
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(function () { resolve(); });
      else window.setTimeout(resolve, 16);
    });
  }
  async function idToken() {
    try {
      var auth = window.firebase && typeof window.firebase.auth === 'function' ? window.firebase.auth() : null;
      var user = auth && auth.currentUser;
      if (!user || typeof user.getIdToken !== 'function') return '';
      return await user.getIdToken();
    } catch (_) { return ''; }
  }
  function eventPayload(block) {
    var eventName = 'message';
    var data = [];
    String(block || '').split(/\r?\n/).forEach(function (line) {
      if (line.indexOf('event:') === 0) eventName = line.slice(6).trim();
      else if (line.indexOf('data:') === 0) data.push(line.slice(5).trim());
    });
    var parsed = null;
    try { parsed = JSON.parse(data.join('\n')); } catch (_) {}
    return { event: eventName, data: parsed };
  }
  function addLiveSource(task, source) {
    if (!task || !source || !safeWebUrl(source.url)) return;
    var safe = {
      title: clean(source.title || source.domain || source.url, 240),
      url: safeWebUrl(source.url),
      domain: clean(source.domain || (new URL(source.url)).hostname, 100),
      favicon: safeWebUrl(source.favicon) || 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent((new URL(source.url)).hostname) + '&sz=48',
      readStatus: clean(source.readStatus || '', 32)
    };
    task.activeSource = safe;
    var exists = (task.sources || []).some(function (item) { return item.url === safe.url; });
    if (!exists) task.sources.push(safe);
    renderActivity();
  }
  function packResearch(research) {
    if (!research || typeof research !== 'object') return research;
    if (research.status !== 'complete') return { status: clean(research.status || 'unavailable', 32), error: clean(research.error || '', 800) };
    return {
      status: 'complete',
      query: clean(research.query || '', 260),
      queries: (research.queries || []).slice(0, 3).map(function (q) { return clean(q, 260); }),
      searchedAt: clean(research.searchedAt || '', 50),
      resultCount: Number(research.resultCount || 0),
      sourcesRead: Number(research.sourcesRead || 0),
      sources: (research.sources || []).slice(0, 5).map(function (source) {
        return {
          title: clean(source.title || '', 240),
          url: safeWebUrl(source.url),
          domain: clean(source.domain || '', 100),
          snippet: clean(source.snippet || '', 700),
          description: clean(source.description || '', 500),
          content: String(source.content || '').slice(0, 4500),
          readStatus: clean(source.readStatus || 'snippet_only', 32),
          engine: clean(source.engine || '', 40)
        };
      }).filter(function (source) { return !!source.url; }),
      results: (research.results || []).slice(0, 8).map(function (source) {
        return { title: clean(source.title || '', 180), url: safeWebUrl(source.url), domain: clean(source.domain || '', 100), snippet: clean(source.snippet || '', 600) };
      }).filter(function (source) { return !!source.url; })
    };
  }
  async function runResearch(task, prompt) {
    var token = await idToken();
    if (!token) throw new Error('Your signed-in session could not be confirmed, so online research was not started.');
    var response = await fetch('/api/ai/web-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: 'Bearer ' + token },
      body: JSON.stringify({ prompt: String(prompt || '').slice(0, 1200) })
    });
    if (!response.ok) {
      var body = await response.json().catch(function () { return {}; });
      throw new Error(clean(body.error || body.message || 'The online research service did not accept this request.', 700));
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('The browser could not stream live research progress. No online source results were confirmed.');
    }
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var completedResearch = null;
    var streamError = null;
    async function consume(block) {
      if (!block.trim()) return;
      var parsed = eventPayload(block);
      var data = parsed.data || {};
      if (parsed.event === 'progress') {
        if (data.source) addLiveSource(task, data.source);
        var phase = data.phase === 'read' ? 'search' : data.phase === 'compare' ? 'compare' : 'search';
        stage(task, phase, data.title || (phase === 'compare' ? 'Comparing findings' : 'Searching the web'), data.detail || 'Gathering public web evidence.');
      } else if (parsed.event === 'source') {
        addLiveSource(task, data.source);
      } else if (parsed.event === 'complete') {
        completedResearch = data.research || null;
        if (completedResearch) {
          task.research = completedResearch;
          task.sources = (completedResearch.sources || []).map(function (source) { return Object.assign({}, source); });
          stage(task, 'compare', 'Comparing findings with your goal', 'Collected ' + Number(completedResearch.resultCount || 0) + ' search result(s) and opened ' + Number(completedResearch.sourcesRead || 0) + ' source page(s). Matching evidence to the requested website task.');
        }
      } else if (parsed.event === 'error') {
        streamError = new Error(clean(data.error || data.message || 'The web research service reported an error.', 700));
        streamError.code = data.code || 'WEB_RESEARCH_FAILED';
      }
    }
    try {
      while (true) {
        var item = await reader.read();
        buffer += decoder.decode(item.value || new Uint8Array(), { stream: !item.done });
        var blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';
        for (var i = 0; i < blocks.length; i += 1) await consume(blocks[i]);
        if (item.done) break;
      }
      if (buffer.trim()) await consume(buffer);
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }
    if (streamError) throw streamError;
    if (!completedResearch || completedResearch.status !== 'complete') {
      throw new Error('Online research ended without a verified source summary.');
    }
    return completedResearch;
  }
  function addResearchContext(payload, research) {
    var output = Object.assign({}, payload || {});
    var prior = output.context && typeof output.context === 'object' ? output.context : {};
    output.context = Object.assign({}, prior, { webResearch: packResearch(research) });
    return output;
  }
  function shouldReuseResearch(prompt) {
    return /\b(?:apply|use|adapt|implement|add|change|build|make|based on|from|follow|the suggestion|those findings|what you found|the research|the second option|that approach|those examples)\b/i.test(String(prompt || ''));
  }
  function qualityStage(task, detail) {
    if (!task || activeTask !== task || !task.isEdit) return;
    var event = detail || {};
    var phase = 'verify';
    var status = String(event.status || 'running');
    if (event.stage === 'planning') phase = 'inspect';
    else if (/^(?:ai-generation|artifact-received|files-applied)$/.test(String(event.stage || ''))) phase = 'apply';
    else if (event.stage === 'build-failed') { phase = 'verify'; task.qualityFailed = true; }
    else if (event.stage === 'build-verified' || status === 'success' && /verified|quality gate/i.test(String(event.stage || '') + ' ' + String(event.message || ''))) task.qualityVerified = true;
    task.qualityEvents.push({ stage: clean(event.stage || '', 80), status: clean(status, 24), message: clean(event.message || '', 220) });
    stage(task, phase, event.message || 'Checking the website build', event.message || 'The Web Studio quality checks are running.', status === 'error' || status === 'failure' ? 'warning' : 'running');
  }
  function installBuildStageListener() {
    if (document.documentElement.dataset.ovyxWsResearchStageBound === '1') return;
    document.documentElement.dataset.ovyxWsResearchStageBound = '1';
    window.addEventListener('ovyx:webstudio-build-stage', function (event) {
      if (activeTask && event && event.detail) qualityStage(activeTask, event.detail);
    });
  }
  function getQualityIssues(report) {
    var checks = Array.isArray(report && report.checks) ? report.checks : [];
    return checks.filter(function (item) {
      if (!item || item.group === 'Coverage') return false;
      return item.status === 'fail' || item.status === 'warn';
    });
  }
  async function finishTask(task, studio, submitResult) {
    if (!task || activeTask !== task) return;
    if (!task.isEdit) {
      if (task.hasResearch && task.research && task.research.status === 'complete') {
        stage(task, 'complete', 'Web research complete', 'Compared public sources and opened ' + Number(task.research.sourcesRead || 0) + ' of the selected source pages. Review the linked sources above and ask to apply any suggestion.', 'success');
      } else if (task.hasResearch) {
        stage(task, 'complete', 'Answer prepared without verified web sources', 'Live web research did not complete, so this answer was not based on verified online sources. Retry the search before relying on source-specific claims.', 'warning');
      } else {
        stage(task, 'complete', 'Response ready', 'Your Web Studio response is ready. No project files were changed.', 'success');
      }
      return;
    }

    stage(task, 'verify', 'Verifying the website update', 'Checking which project files changed, then running Web Studio source and responsive/accessibility checks.');
    await waitForPaint();

    var after = currentFiles(studio);
    task.changedPaths = changedPaths(task.baselineFiles, after);
    if (!task.changedPaths.length) {
      var missingDetail = 'No changed source files were detected after the request. The existing website has not been marked as updated or verified.';
      if (task.research && task.research.status !== 'complete') missingDetail += ' Online research was also unavailable, so no online evidence was used.';
      stage(task, 'verify', 'No verified website changes detected', missingDetail, 'warning');
      return;
    }

    var testResult = null;
    var testError = '';
    try {
      if (studio && typeof studio.runTests === 'function') testResult = await studio.runTests(false);
      else testError = 'The current runtime does not expose a source-test runner.';
    } catch (error) {
      testError = clean(error && error.message || error, 260);
    }

    if (testError || testResult && testResult.ok !== true) {
      var failedTestText = testError || clean(testResult && testResult.summary || 'The source checks reported a failure.', 300);
      stage(task, 'verify', 'Changes need another check', 'Files changed (' + task.changedPaths.length + '), but source verification did not pass: ' + failedTestText, 'warning');
      return;
    }

    var report = null;
    var quality = window.OVYXWebStudioQuality;
    if (!task.qualityVerified && quality && typeof quality.run === 'function') {
      stage(task, 'verify', 'Checking desktop, mobile and accessibility', 'Running the Web Studio quality inspection against the updated project. The animation remains active while checks finish.');
      await waitForPaint();
      try {
        report = await quality.run();
        if ((!report || !Array.isArray(report.checks)) && typeof quality.getReport === 'function') report = quality.getReport();
      } catch (error) {
        task.qualityError = clean(error && error.message || error, 300);
      }
    } else if (quality && typeof quality.getReport === 'function') {
      report = quality.getReport();
    }

    var issues = getQualityIssues(report);
    var failures = issues.filter(function (item) { return item.status === 'fail'; });
    var warnings = issues.filter(function (item) { return item.status === 'warn'; });
    var localSummary = clean(testResult && testResult.summary || 'Web Studio source checks completed.', 260);
    var details = 'Updated ' + task.changedPaths.length + ' project file(s). ' + localSummary;
    if (report && Array.isArray(report.checks)) {
      if (!issues.length) details += ' The available desktop/mobile and accessibility review reported no blocking issues.';
      else {
        details += ' Quality review reported ' + failures.length + ' failure(s) and ' + warnings.length + ' warning(s): ' + issues.slice(0, 3).map(function (item) { return clean(item.title || item.detail || item.group, 100); }).join('; ') + '.';
      }
    } else {
      details += ' The detailed browser/visual quality report was not available, so that part remains unverified.';
    }
    if (task.research && task.research.status !== 'complete') details += ' Live web research was unavailable; the edit was not based on verified online sources.';
    if (task.qualityFailed) {
      stage(task, 'verify', 'Website update needs attention', details + ' The automatic Web Studio build gate reported a failure; review the quality panel before treating the site as fully verified.', 'warning');
    } else if (failures.length || warnings.length || task.qualityError || !report) {
      stage(task, 'verify', 'Website update applied — review findings', details + (task.qualityError ? ' The quality review error was: ' + task.qualityError : ''), 'warning');
    } else {
      stage(task, 'verify', 'Website update verified', details, 'success');
    }
  }
  function attachActivityToRenderer(studio) {
    if (!studio || typeof studio.renderThread !== 'function' || studio.renderThread.__ovyxLiveActivityWrapper) return;
    var originalRender = studio.renderThread;
    function renderWithActivity() {
      var value = originalRender.apply(this, arguments);
      renderActivity();
      return value;
    }
    renderWithActivity.__ovyxLiveActivityWrapper = true;
    studio.renderThread = renderWithActivity;
  }
  function installCallAIResearch(studio) {
    if (!studio || typeof studio.callAI !== 'function' || studio.callAI.__ovyxResearchWrapper) return;
    var originalCallAI = studio.callAI;
    async function researchAwareCallAI(payload, token) {
      var prompt = promptFrom(payload);
      var mode = String(payload && payload.mode || studio.mode || 'ask').toLowerCase();
      var task = activeTask;
      var standalone = false;
      if ((!task || !prompt || task.prompt !== prompt) && shouldSearchWeb(prompt)) {
        task = startTask(prompt, mode, studio, true);
        standalone = true;
      }
      var requestPayload = Object.assign({}, payload || {});
      var priorContext = requestPayload.context && typeof requestPayload.context === 'object' ? requestPayload.context : {};
      requestPayload.context = Object.assign({}, priorContext);
      if (task && task.hasResearch && !task.researchAttempted && shouldSearchWeb(prompt)) {
        task.researchAttempted = true;
        stage(task, 'search', 'Searching the web', 'Searching several query variations, collecting public results, and opening relevant source pages.');
        await waitForPaint();
        try {
          var researched = await runResearch(task, prompt);
          task.research = researched;
          task.sources = (researched.sources || []).map(function (source) { return Object.assign({}, source); });
          studio.__ovyxLastWebResearch = researched;
          requestPayload = addResearchContext(requestPayload, researched);
          stage(task, 'compare', 'Comparing findings with your website', 'Web evidence is ready. OVYX is matching it to your goal and, where requested, the existing source files.');
        } catch (error) {
          task.research = { status: 'unavailable', error: clean(error && error.message || error, 700) };
          task.researchWarning = true;
          requestPayload = addResearchContext(requestPayload, task.research);
          stage(task, task.isEdit ? 'inspect' : 'compare', 'Online research needs attention', task.research.error + ' OVYX will not claim that these sources were searched.', 'warning');
        }
      } else if (task && task.isEdit && studio.__ovyxLastWebResearch && studio.__ovyxLastWebResearch.status === 'complete' && shouldReuseResearch(prompt)) {
        requestPayload = addResearchContext(requestPayload, studio.__ovyxLastWebResearch);
        task.research = studio.__ovyxLastWebResearch;
        task.sources = (studio.__ovyxLastWebResearch.sources || []).map(function (source) { return Object.assign({}, source); });
        stage(task, 'compare', 'Using your earlier research', 'Reusing the sources gathered earlier in this Web Studio chat to apply the chosen direction to your site.');
      } else if (task && task.isEdit) {
        stage(task, 'inspect', 'Inspecting your existing website', 'Preparing the current project files and matching the requested change without rebuilding unrelated pages.');
      } else if (task) {
        stage(task, 'answer', 'Preparing your response', 'Organizing the available project context and requested answer.');
      }

      if (task) await waitForPaint();
      var result;
      try {
        result = await originalCallAI.call(this, requestPayload, token);
      } catch (error) {
        if (task && activeTask === task) stage(task, 'verify', 'The request needs attention', clean(error && error.message || 'Web Studio could not finish this step.', 500), 'error');
        throw error;
      }
      if (task) {
        if (task.isEdit) stage(task, 'apply', 'Applying the requested changes', 'The response is ready. Web Studio is applying the returned source changes to the active project, then checking the result.');
        else if (task.hasResearch && task.research && task.research.status === 'complete') stage(task, 'compare', 'Preparing source-backed suggestions', 'The sources are gathered; OVYX is turning them into a practical answer with links to the references.');
        else if (task.hasResearch) stage(task, 'compare', 'Preparing an answer with a research limitation', 'The live search did not complete. OVYX is preparing a response without pretending online sources were verified.', 'warning');
        await waitForPaint();
      }
      if (standalone && task && activeTask === task) {
        if (!task.isEdit) {
          if (task.research && task.research.status === 'complete') stage(task, 'complete', 'Web research complete', 'Open the source links below and ask Web Studio to apply a specific improvement.', 'success');
          else stage(task, 'complete', 'Web research could not be verified', 'The AI response is ready, but live internet sources were not verified.', 'warning');
        } else {
          stage(task, 'apply', 'Changes prepared for Web Studio', 'The AI proposed source edits. They are not verified as applied until the normal project update and verification flow finishes.', 'warning');
        }
      }
      return result;
    }
    researchAwareCallAI.__ovyxResearchWrapper = true;
    studio.callAI = researchAwareCallAI;
  }
  function installSubmitProgress(studio) {
    if (!studio || typeof studio.submitPrompt !== 'function' || studio.submitPrompt.__ovyxResearchSubmitWrapper) return;
    var originalSubmit = studio.submitPrompt;
    async function submitWithProgress() {
      var input = document.getElementById('ws-chat-input');
      var prompt = String(input && input.value || '').trim();
      if (!prompt) return originalSubmit.apply(this, arguments);
      var mode = String(studio.mode || 'build').toLowerCase();
      var task = startTask(prompt, mode, studio, false);
      var value;
      try {
        value = await originalSubmit.apply(this, arguments);
        await finishTask(task, studio, value);
        return value;
      } catch (error) {
        if (activeTask === task) stage(task, 'verify', 'Web Studio could not finish the request', clean(error && error.message || 'The request failed before verification.', 600), 'error');
        throw error;
      }
    }
    submitWithProgress.__ovyxResearchSubmitWrapper = true;
    studio.submitPrompt = submitWithProgress;
  }
  function install() {
    var studio = window.WebStudio;
    var view = document.getElementById('view-webstudio');
    if (!studio || !view || typeof studio.callAI !== 'function' || typeof studio.submitPrompt !== 'function') return false;
    studioRef = studio;
    addActivityStyles();
    installBuildStageListener();
    attachActivityToRenderer(studio);
    installCallAIResearch(studio);
    installSubmitProgress(studio);
    renderActivity();
    return true;
  }
  var attempts = 0;
  function boot() {
    if (install()) return;
    if (attempts++ < 70) window.setTimeout(boot, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', function () { window.setTimeout(boot, 0); });
  window.addEventListener('firebase-auth-state-ready', function () { window.setTimeout(boot, 0); });
})();