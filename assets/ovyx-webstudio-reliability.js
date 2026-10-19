(function () {
  'use strict';
  if (window.__OVYX_WEBSTUDIO_RELIABILITY_V1__) return;
  window.__OVYX_WEBSTUDIO_RELIABILITY_V1__ = true;

  var STYLE_ID = 'ovyx-webstudio-feedback-style-v1';
  var FEEDBACK_STORAGE = 'ovyx.webstudio.feedback.v1';
  var root = window;

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value == null ? null : value; }
  }
  function clean(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 160);
  }
  function contentOf(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    var candidate = value.content != null ? value.content :
      value.text != null ? value.text :
      value.source != null ? value.source :
      value.code != null ? value.code : '';
    return typeof candidate === 'string' ? candidate : '';
  }
  function safePath(value) {
    var path = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path || path.split('/').some(function (part) { return part === '..' || part === '.'; })) return '';
    return path.slice(0, 240);
  }
  function isHtmlPath(path) { return /\.html?$/i.test(String(path || '')); }
  function pathForPage(page, index) {
    if (page && page.__ovyxFile) return safePath(page.__ovyxFile);
    var name = clean(page && (page.name || page.slug) || ('Page ' + (index + 1)), 100);
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('page-' + (index + 1));
    return 'src/pages/' + slug + '.html';
  }
  function parseFileBag(bag) {
    if (!bag || typeof bag !== 'object') return [];
    var out = [];
    Object.keys(bag).slice(0, 300).forEach(function (key) {
      var path = safePath(key);
      if (!path || !isHtmlPath(path)) return;
      var value = bag[key];
      var text = contentOf(value);
      if (text.trim().length > 80) out.push({ path: path, content: text });
    });
    return out;
  }
  function collectHtmlArtifacts(result, studio, baseProject) {
    if (!result || typeof result !== 'object') return [];
    var out = [];
    var bag = result.files || result.fileEdits || result.patch && result.patch.files;
    out = out.concat(parseFileBag(bag));
    if (typeof result.html === 'string' && result.html.trim().length > 80) {
      out.push({ path: safePath(studio && studio.entryFile ? studio.entryFile() : 'src/pages/Home.html') || 'src/pages/Home.html', content: result.html });
    } else if (typeof result.code === 'string' && result.code.trim().length > 80 && /<(?:!doctype|html|body)\b/i.test(result.code)) {
      out.push({ path: safePath(studio && studio.entryFile ? studio.entryFile() : 'src/pages/Home.html') || 'src/pages/Home.html', content: result.code });
    }
    var project = result.project || result.updatedProject;
    var pages = Array.isArray(project && project.pages) ? project.pages : [];
    var priorPages = Array.isArray(baseProject && baseProject.pages) ? baseProject.pages : [];
    if (studio && typeof studio.pageToHtml === 'function') {
      pages.slice(0, 60).forEach(function (page, index) {
        if (!page || typeof page !== 'object') return;
        var prior = priorPages.find(function (old) {
          return String(old && (old.id || old.slug || old.name) || '').toLowerCase() ===
            String(page.id || page.slug || page.name || '').toLowerCase();
        });
        if (prior && JSON.stringify(prior) === JSON.stringify(page)) return;
        var path = pathForPage(page, index);
        var direct = [page.html, page.renderedHtml, page.source, page.code, page.previewHtml]
          .find(function (v) { return typeof v === 'string' && v.trim().length > 80; });
        var generated = typeof direct === 'string' ? direct : '';
        if (!generated && Array.isArray(page.sections) && page.sections.length) {
          try { generated = studio.pageToHtml(page); } catch (_) { generated = ''; }
        }
        if (isHtmlPath(path) && generated.trim().length > 80) out.push({ path: path, content: generated });
      });
    }
    var unique = new Map();
    out.forEach(function (item) {
      if (item.path && item.content) unique.set(item.path, item);
    });
    return Array.from(unique.values());
  }
  function isChangedArtifact(item, baselineFiles) {
    var old = baselineFiles && baselineFiles[item.path];
    var oldContent = contentOf(old);
    return item.content.trim().length > 80 && item.content !== oldContent;
  }
  function hasCodeOutput(result) {
    if (!result || typeof result !== 'object') return false;
    var bag = result.files || result.fileEdits || result.patch && result.patch.files;
    if (bag && typeof bag === 'object' && Object.keys(bag).some(function (path) {
      var normalized = safePath(path);
      return normalized && /\.(html?|css|m?js|jsx|tsx|json)$/i.test(normalized) && contentOf(bag[path]).trim().length > 0;
    })) return true;
    return [result.html, result.code].some(function (value) { return typeof value === 'string' && value.trim().length > 80; });
  }
  function seedOnlyProject(project) {
    if (!project || project.ovyxBuildState === 'verified') return false;
    var pages = Array.isArray(project.pages) ? project.pages : [];
    if (pages.length !== 1) return false;
    var page = pages[0];
    var sections = Array.isArray(page && page.sections) ? page.sections : [];
    if (sections.length !== 1) return false;
    var section = sections[0] || {};
    var data = section.content || {};
    return String(section.type || '').toLowerCase() === 'hero' &&
      /^A polished .+ experience generated in OVYX\.$/i.test(String(data.subheading || '').trim()) &&
      String(data.heading || '').trim() === String(page.name || 'Home').trim();
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.ovyx-ws-feedback{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:10px 0 2px;padding-top:8px;border-top:1px solid rgba(255,255,255,.055);color:#777f88;font:600 10px/1.4 Inter,system-ui,sans-serif}',
      '.ovyx-ws-feedback-label{margin-right:2px}',
      '.ovyx-ws-feedback button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:29px;min-width:33px;padding:5px 9px;border:1px solid rgba(255,255,255,.10);border-radius:8px;background:rgba(255,255,255,.025);color:#9ca3af;font:700 10px Inter,system-ui,sans-serif;cursor:pointer;transition:background .16s,border-color .16s,color .16s}',
      '.ovyx-ws-feedback button:hover,.ovyx-ws-feedback button:focus-visible{outline:none;color:#f7d78e;border-color:rgba(232,182,79,.45);background:rgba(232,182,79,.075)}',
      '.ovyx-ws-feedback button.is-selected{color:#f5d88f;border-color:rgba(232,182,79,.52);background:rgba(232,182,79,.10)}',
      '.ovyx-ws-feedback button:disabled{opacity:.5;cursor:wait}',
      '.ovyx-ws-feedback button i{font-size:11px}',
      '.ovyx-ws-feedback-note{flex:1 1 100%;font-size:9px;color:#8c949d}',
      '@media(prefers-reduced-motion:reduce){.ovyx-ws-feedback button{transition:none}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }
  function readVotes() {
    try { return JSON.parse(localStorage.getItem(FEEDBACK_STORAGE) || '{}') || {}; } catch (_) { return {}; }
  }
  function saveVote(messageId, vote) {
    try {
      var votes = readVotes();
      votes[messageId] = vote;
      var keys = Object.keys(votes);
      if (keys.length > 120) keys.slice(0, keys.length - 120).forEach(function (key) { delete votes[key]; });
      localStorage.setItem(FEEDBACK_STORAGE, JSON.stringify(votes));
    } catch (_) {}
  }
  function toast(message, kind) {
    try { if (typeof window.showToast === 'function') window.showToast(String(message || ''), kind || 'info'); } catch (_) {}
  }
  function authUser() {
    try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser || null; } catch (_) { return null; }
  }
  async function sendVote(studio, message, vote, button) {
    var user = authUser();
    if (!user) throw new Error('Sign in to submit response feedback.');
    var messageId = clean(message.id, 120);
    if (!/^[A-Za-z0-9_-]+$/.test(messageId)) throw new Error('This response cannot be identified for feedback.');
    if (button) button.disabled = true;
    try {
      var token = await user.getIdToken();
      var response = await fetch('/api/ai/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          vote: vote,
          messageId: messageId,
          projectId: clean(window.KernelState && window.KernelState.activeProject && window.KernelState.activeProject.id, 120),
          provider: clean(studio && studio.brain || 'automatic', 40).toLowerCase(),
          model: clean(studio && (studio.model || studio.lastModel) || '', 100)
        })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || data.ok !== true) {
        throw new Error(data.message || 'Feedback could not be saved.');
      }
      saveVote(messageId, vote);
      return true;
    } finally {
      if (button) button.disabled = false;
    }
  }
  function markVoteControls(studio, messageId, vote) {
    var controls = document.querySelectorAll('.ovyx-ws-feedback[data-message-id="' + CSS.escape(messageId) + '"]');
    controls.forEach(function (node) {
      node.querySelectorAll('[data-ovyx-feedback-vote]').forEach(function (button) {
        var active = button.getAttribute('data-ovyx-feedback-vote') === vote;
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-pressed', String(active));
      });
      var note = node.querySelector('.ovyx-ws-feedback-note');
      if (note) note.textContent = vote ? (vote === 'up' ? 'Thanks for the feedback.' : 'You marked this response as not helpful.') : '';
    });
  }
  async function waitForHelpForm() {
    if (window.Router && typeof window.Router.go === 'function') window.Router.go('faq');
    else {
      var view = document.getElementById('view-faq');
      if (view) view.classList.remove('hidden');
    }
    for (var i = 0; i < 35; i += 1) {
      var form = document.getElementById('ovyx-help-support-form');
      if (form) return form;
      await new Promise(function (resolve) { setTimeout(resolve, 100); });
    }
    return null;
  }
  async function openSupportForVote(studio, message, saved) {
    var form = await waitForHelpForm();
    if (!form) {
      toast(saved ? 'Your feedback has been saved. Visit Help → Contact Support to share more details.' : 'Your feedback could not be saved. Visit Help → Contact Support for assistance.', saved ? 'success' : 'warning');
      return;
    }
    var subject = document.getElementById('ovyx-help-support-subject');
    var messageBox = document.getElementById('ovyx-help-support-message');
    var project = window.KernelState && window.KernelState.activeProject || {};
    var details = [
      'I marked an OVYX Web Studio AI response as not helpful.',
      'Response ID: ' + clean(message.id, 120),
      'Project: ' + clean(project.name || 'Untitled project', 120),
      'Provider selected: ' + clean(studio && studio.brain || 'automatic', 40),
      '',
      'What went wrong?'
    ].join('\n');
    if (subject && !subject.value.trim()) subject.value = 'Web Studio AI response was not helpful';
    if (messageBox && !messageBox.value.trim()) messageBox.value = details;
    var target = subject || messageBox || form;
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    try { target.focus({ preventScroll: true }); } catch (_) { try { target.focus(); } catch (_) {} }
    toast(saved ? 'Help is open. Add details and submit your support request.' : 'Help is open. Add details and submit your support request; the vote could not be saved.', saved ? 'info' : 'warning');
  }

  function attachFeedback(studio) {
    var originalRender = studio.renderThread;
    if (typeof originalRender !== 'function' || originalRender.__ovyxFeedbackWrapper) return;
    function wrappedRenderThread() {
      originalRender.apply(this, arguments);
      var threadRoot = document.getElementById('ws-agent-thread');
      if (!threadRoot || !Array.isArray(this.thread)) return;
      addStyles();
      var votes = readVotes();
      Array.prototype.slice.call(threadRoot.querySelectorAll('.ovyx-ws-msg[data-ws-thread-index]')).forEach(function (bubble) {
        if (!bubble.classList.contains('agent')) return;
        var index = Number(bubble.getAttribute('data-ws-thread-index'));
        if (!Number.isInteger(index) || index < 0) return;
        var message = this.thread[index];
        if (!message || message.role === 'user' || !String(message.text || '').trim()) return;
        var id = clean(message.id, 120);
        if (!/^[A-Za-z0-9_-]+$/.test(id)) return;
        if (bubble.querySelector('.ovyx-ws-feedback')) return;
        var content = bubble.querySelector('.ovyx-ws-msg-content');
        if (!content) return;
        var controls = document.createElement('div');
        controls.className = 'ovyx-ws-feedback';
        controls.setAttribute('data-message-id', id);
        var label = document.createElement('span');
        label.className = 'ovyx-ws-feedback-label';
        label.textContent = 'Was this helpful?';
        controls.appendChild(label);
        [['up', 'fa-thumbs-up', 'Yes, helpful'], ['down', 'fa-thumbs-down', 'No, not helpful']].forEach(function (entry) {
          var button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('data-ovyx-feedback-vote', entry[0]);
          button.setAttribute('aria-label', entry[2]);
          button.setAttribute('aria-pressed', String(votes[id] === entry[0]));
          button.setAttribute('title', entry[2]);
          if (votes[id] === entry[0]) button.classList.add('is-selected');
          var icon = document.createElement('i');
          icon.className = 'fa-solid ' + entry[1];
          icon.setAttribute('aria-hidden', 'true');
          button.appendChild(icon);
          var text = document.createElement('span');
          text.textContent = entry[0] === 'up' ? 'Helpful' : 'Not helpful';
          button.appendChild(text);
          controls.appendChild(button);
        });
        var note = document.createElement('span');
        note.className = 'ovyx-ws-feedback-note';
        note.setAttribute('aria-live', 'polite');
        note.textContent = votes[id] ? (votes[id] === 'up' ? 'Thanks for the feedback.' : 'You marked this response as not helpful.') : '';
        controls.appendChild(note);
        var actionMenu = content.querySelector('.ovyx-ws-msg-actions');
        if (actionMenu) content.insertBefore(controls, actionMenu);
        else content.appendChild(controls);
      }, this);
    }
    wrappedRenderThread.__ovyxFeedbackWrapper = true;
    studio.renderThread = wrappedRenderThread;
  }

  function installFeedbackActions(studio) {
    if (document.documentElement.dataset.ovyxFeedbackClickBound === '1') return;
    document.documentElement.dataset.ovyxFeedbackClickBound = '1';
    document.addEventListener('click', async function (event) {
      var button = event.target && event.target.closest && event.target.closest('[data-ovyx-feedback-vote]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      var vote = button.getAttribute('data-ovyx-feedback-vote');
      var control = button.closest('.ovyx-ws-feedback');
      var messageId = control && control.getAttribute('data-message-id') || '';
      var message = (Array.isArray(studio.thread) ? studio.thread : []).find(function (item) { return String(item && item.id || '') === messageId; });
      if (!message) { toast('This response is no longer available in the current thread.', 'warning'); return; }
      var wasSaved = false;
      try {
        wasSaved = await sendVote(studio, message, vote, button);
        markVoteControls(studio, messageId, vote);
        toast('Thank you. Your feedback was saved.', 'success');
      } catch (error) {
        toast(error && error.message || 'Feedback could not be saved.', 'warning');
      }
      if (vote === 'down') await openSupportForVote(studio, message, wasSaved);
    }, true);
  }

  function installSeedPreviewGuard(studio) {
    if (typeof studio.hasProjectWebsite !== 'function' || studio.hasProjectWebsite.__ovyxSeedGuard) return;
    var original = studio.hasProjectWebsite;
    function guardedHasWebsite() {
      var project = window.KernelState && window.KernelState.activeProject;
      if (seedOnlyProject(project)) return false;
      return original.apply(this, arguments);
    }
    guardedHasWebsite.__ovyxSeedGuard = true;
    studio.hasProjectWebsite = guardedHasWebsite;
  }

  async function validateHomeBuildResult(result, studio, baseProject, baselineFiles) {
    var candidates = collectHtmlArtifacts(result, studio, baseProject);
    var changed = candidates.filter(function (item) { return isChangedArtifact(item, baselineFiles); });
    if (!changed.length) {
      throw new Error('A website draft was not ready for preview. Your existing preview remains unchanged. Try again or choose another AI option.');
    }
    var state = window.KernelState;
    var project = result && (result.project || result.updatedProject) || state && state.activeProject;
    if (!project || typeof project !== 'object') throw new Error('The website draft could not be prepared. Please try again.');
    if (result && !result.project) result.project = project;
    if (state) {
      state.activeProject = project;
      state.projects = Array.isArray(state.projects) ? state.projects : [];
      var projectIndex = state.projects.findIndex(function (item) { return String(item && item.id || '') === String(project.id || ''); });
      if (projectIndex >= 0) state.projects[projectIndex] = project;
      else state.projects.unshift(project);
    }
    studio.graph = null;
    studio.ensureProjectGraph();
    studio.applyAIResult(result);
    studio.ensureProjectGraph();
    var chosen = changed.find(function (item) { return /(^|\/)(index|home)\.html?$/i.test(item.path); }) || changed[0];
    studio.graph.files[chosen.path] = studio.graph.files[chosen.path] || { type: 'text/html', content: chosen.content, updatedAt: Date.now() };
    studio.graph.files[chosen.path].content = chosen.content;
    studio.graph.files[chosen.path].type = 'text/html';
    studio.graph.files[chosen.path].updatedAt = Date.now();
    studio.graph.entry = chosen.path;
    var page = studio.getActivePage && studio.getActivePage();
    if (page) page.__ovyxFile = chosen.path;
    var tests = studio.runTests(false);
    if (!tests || tests.ok !== true) throw new Error('The website draft needs a few fixes before it can be previewed. ' + clean(tests && tests.summary || 'Please retry the build.', 220));
    project.ovyxBuildState = 'verified';
    project.ovyxBuildVerifiedAt = new Date().toISOString();
    project.ovyxGraph = studio.graph;
    studio.syncGraphToProject();
    if (window.ProjectStore && typeof window.ProjectStore.save === 'function') window.ProjectStore.save();
    return result;
  }

  function installHomeBuildGuard(studio) {
    var service = window.OVYXAIService;
    if (service && typeof service.generate === 'function' && !service.generate.__ovyxHomeBuildGuard) {
      var originalGenerate = service.generate.bind(service);
      async function guardedGenerate(payload, options) {
        var isHomeBuild = String(payload && payload.mode || 'build').toLowerCase() === 'build' &&
          String(payload && payload.context && payload.context.activeView || '') === 'home';
        if (!isHomeBuild) return originalGenerate(payload, options);
        var state = window.KernelState || {};
        var baseProject = clone(state.activeProject || {});
        studio.graph = null;
        studio.ensureProjectGraph();
        var baselineGraph = studio.snapshotGraph();
        var baselineFiles = clone(baselineGraph && baselineGraph.files || {});
        var response = await originalGenerate(payload, options);
        return validateHomeBuildResult(response, studio, baseProject, baselineFiles);
      }
      guardedGenerate.__ovyxHomeBuildGuard = true;
      service.generate = guardedGenerate;
    }

    var orchestrator = window.AIOrchestrator;
    if (!orchestrator || typeof orchestrator.runSynthesis !== 'function' || orchestrator.runSynthesis.__ovyxHomeSynthesisGuard) return;
    var originalSynthesis = orchestrator.runSynthesis.bind(orchestrator);
    async function guardedSynthesis(mode) {
      var state = window.KernelState;
      var previousProjects = clone(state && state.projects || []);
      var previousActive = clone(state && state.activeProject || null);
      var previousId = String(previousActive && previousActive.id || '');
      try {
        return await originalSynthesis(mode);
      } catch (error) {
        if (state) {
          state.projects = Array.isArray(previousProjects) ? previousProjects : [];
          state.activeProject = state.projects.find(function (item) { return String(item && item.id || '') === previousId; }) || previousActive;
          if (state.activeProject && !state.projects.some(function (item) { return String(item && item.id || '') === String(state.activeProject.id || ''); })) {
            state.projects.unshift(state.activeProject);
          }
        }
        try {
          studio.graph = null;
          if (state && state.activeProject) studio.ensureProjectGraph();
          studio.renderPreview();
          window.ProjectStore && window.ProjectStore.renderHome && window.ProjectStore.renderHome();
          window.ProjectStore && window.ProjectStore.renderProjects && window.ProjectStore.renderProjects();
        } catch (_) {}
        toast(error && error.message || 'We could not prepare the website preview. Your existing work is unchanged.', 'error');
        return null;
      }
    }
    guardedSynthesis.__ovyxHomeSynthesisGuard = true;
    orchestrator.runSynthesis = guardedSynthesis;
  }

  function installBuildArtifactGuard(studio) {
    if (typeof studio.callAI !== 'function' || studio.callAI.__ovyxBuildArtifactGuard) return;
    var originalCallAI = studio.callAI;
    async function guardedCallAI(payload, token) {
      var isBuild = String(payload && payload.mode || '').toLowerCase() === 'build';
      var baseProject = clone(window.KernelState && window.KernelState.activeProject || {});
      var baselineFiles = {};
      if (isBuild) {
        studio.ensureProjectGraph();
        baselineFiles = clone(studio.graph && studio.graph.files || {});
      }
      var requestPayload = Object.assign({}, payload || {});
      var priorContext = requestPayload.context && typeof requestPayload.context === 'object' ? requestPayload.context : {};
      requestPayload.context = Object.assign({}, priorContext, {
        activeView: 'webstudio',
        project: requestPayload.project || priorContext.project || null,
        files: requestPayload.files || priorContext.files || null
      });
      var result = await originalCallAI.call(this, requestPayload, token);
      if (!isBuild) return result;
      var candidates = collectHtmlArtifacts(result, studio, baseProject);
      var changed = candidates.some(function (item) { return isChangedArtifact(item, baselineFiles); });
      if (!changed) {
        throw Object.assign(new Error('The website draft was not updated. Your existing preview remains unchanged. Try again or select another AI option.'), { code: 'AI_BUILD_NO_ARTIFACTS' });
      }
      return result;
    }
    guardedCallAI.__ovyxBuildArtifactGuard = true;
    studio.callAI = guardedCallAI;
  }

  function installFollowUpIntentRouter(studio) {
    if (!studio || typeof studio.submitPrompt !== 'function' || studio.submitPrompt.__ovyxFollowUpIntentRouter) return;
    var originalSubmit = studio.submitPrompt;
    var originalSetMode = typeof studio.setMode === 'function' ? studio.setMode : null;
    if (originalSetMode && !originalSetMode.__ovyxFollowUpModeTracker) {
      function trackedSetMode(mode) {
        if (!studio.__ovyxAutoModeSwitch) studio.__ovyxAutoReadOnlyMode = false;
        return originalSetMode.apply(this, arguments);
      }
      trackedSetMode.__ovyxFollowUpModeTracker = true;
      studio.setMode = trackedSetMode;
      originalSetMode = trackedSetMode;
    }
    function switchMode(mode, autoReadOnly) {
      if (typeof studio.setMode !== 'function') return;
      studio.__ovyxAutoModeSwitch = true;
      try { studio.setMode(mode); } finally { studio.__ovyxAutoModeSwitch = false; }
      studio.__ovyxAutoReadOnlyMode = !!autoReadOnly;
    }
    function editAction(text) {
      return /\b(?:add|change|edit|update|fix|repair|apply|remove|delete|replace|improve|enhance|adjust|modify|restyle|reposition|resize|shrink|enlarge|increase|decrease|align|move|rearrange|polish|optimi[sz]e|implement|make)\b/i.test(text);
    }
    function explicitNewBuild(text) {
      return /\b(?:build|create|generate|design|develop|launch)\s+(?:(?:me|us)\s+)?(?:(?:a|an|the|brand\s+new|new|complete|full|multi[- ]page|single[- ]page)\s+){0,2}(?:website|web\s+site|site|web\s+app|application|digital\s+product)\b/i.test(text);
    }
    function targetedEdit(text) {
      return editAction(text) && !explicitNewBuild(text) && (
        /\b(?:this|that|it|here|above|existing|current|selected|my\s+(?:site|website|page|project)|the\s+(?:website|site|page|project|layout|design|header|footer|hero|menu|navigation|button|form|section|card|font|typography|colors?|colou?rs?|spacing|logo|image|background|contrast)|website|site|page|project|layout|design|header|footer|hero|headline|heading|title|text|copy|menu|navigation|button|form|section|card|font|typography|colors?|colou?rs?|spacing|logo|image|background|contrast|padding|margin|responsive|mobile|desktop|tablet|accessibility|feature|component|style|stylesheet|skip\s+link|label|link|dropdown|sidebar|control|icon)\b/i.test(text)
      );
    }
    function readOnlyFollowUp(text) {
      var startsAsInspection = /^(?:(?:please|now|then)\s+)*(?:(?:can|could|would)\s+you\s+)?(?:search|find|locate|inspect|review|examine|audit|trace|verify|check|list|show|read|where\b|why\b|how\b|what\b|is\b|was\b|has\b|have\b|tell\s+me\b|recommend\b|suggest\b)/i.test(text);
      if (!startsAsInspection || explicitNewBuild(text)) return false;
      var asksForAdvice = /\b(?:what\s+should\s+i\s+change|what\s+would\s+you\s+change|tell\s+me\s+what\s+to\s+change|what\s+do\s+you\s+recommend|recommend\s+changes|suggest\s+changes|should\s+i\s+change|how\s+can\s+i\s+improve|how\s+should\s+i)\b/i.test(text);
      if (editAction(text) && !asksForAdvice) return false;
      return /\b(?:project|website|site|page|file|files|source|code|menu|header|footer|section|button|font|layout|design|feature|already|implemented|working|done|css|html|javascript|function|component|app|it|this|that|the)\b/i.test(text);
    }
    async function routedSubmitPrompt() {
      var input = document.getElementById('ws-chat-input');
      var prompt = String(input && input.value || '').trim();
      var mode = String(studio.mode || 'build').toLowerCase();
      if (mode === 'build' && readOnlyFollowUp(prompt)) {
        switchMode('ask', true);
      } else if (mode === 'ask' && studio.__ovyxAutoReadOnlyMode && targetedEdit(prompt)) {
        switchMode('build', false);
      }
      return originalSubmit.apply(this, arguments);
    }
    routedSubmitPrompt.__ovyxFollowUpIntentRouter = true;
    studio.submitPrompt = routedSubmitPrompt;
  }

  function install() {
    var studio = window.WebStudio;
    if (!studio || typeof studio.renderThread !== 'function' || typeof studio.callAI !== 'function' || !window.AIOrchestrator) return false;
    addStyles();
    installSeedPreviewGuard(studio);
    attachFeedback(studio);
    installFeedbackActions(studio);
    installFollowUpIntentRouter(studio);
    installBuildArtifactGuard(studio);
    installHomeBuildGuard(studio);
    try { studio.renderThread(); } catch (_) {}
    try { studio.renderPreview(); } catch (_) {}
    return true;
  }
  var attempts = 0;
  function boot() {
    if (install()) return;
    if (attempts++ < 50) setTimeout(boot, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', function () { setTimeout(boot, 0); });
  window.addEventListener('firebase-auth-state-ready', function () { setTimeout(boot, 0); });
})();
