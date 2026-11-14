(function () {
  'use strict';
  if (window.__OVYX_WS_APPLY_SUGGESTIONS_V1__) return;
  window.__OVYX_WS_APPLY_SUGGESTIONS_V1__ = true;

  var STYLE_ID = 'ovyx-ws-apply-suggestions-style-v1';
  var studioRef = null;
  var MARKER = /<!--\s*OVYX_APPLY_SUGGESTIONS\s*:\s*([\s\S]*?)\s*-->/i;
  var CONTROL_KEYS = ['text', 'answer', 'message', 'summary'];

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 260);
  }

  function safePublicUrl(value) {
    try {
      var url = new URL(String(value || ''));
      var host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !host ||
          url.username || url.password || host.indexOf(':') >= 0 ||
          host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
          host.endsWith('.internal') || /^127\./.test(host) || /^10\./.test(host) ||
          /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
          /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return '';
      url.hash = '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function visibleText(value) {
    return String(value == null ? '' : value)
      .replace(MARKER, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeText(value) {
    return visibleText(value).replace(/\s+/g, ' ').trim();
  }

  function isWebStudioViewActive() {
    var view = document.getElementById('view-webstudio');
    if (!view || view.hidden || view.classList.contains('hidden') || view.getAttribute('aria-hidden') === 'true') return false;
    if (typeof window.getComputedStyle === 'function') {
      var style = window.getComputedStyle(view);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    }
    return true;
  }

  function asksForRecommendations(prompt) {
    return /\b(?:recommend(?:ation|ations)?|suggest(?:ion|ions)?|what\s+(?:should|could|would)\s+i\s+(?:change|improve|add)|how\s+can\s+i\s+improve|improvements?\s+for\s+my\s+(?:website|site)|ways?\s+to\s+improve)\b/i.test(String(prompt || ''));
  }

  function verifiedPageSources(research) {
    var byUrl = Object.create(null);
    if (!research || research.status !== 'complete' || !Array.isArray(research.sources)) return byUrl;
    research.sources.forEach(function (source) {
      if (!source || source.readStatus !== 'page_read') return;
      var url = safePublicUrl(source.url);
      if (!url) return;
      byUrl[url] = {
        url: url,
        title: clean(source.title || source.domain || url, 180),
        domain: clean(source.domain || (new URL(url)).hostname, 100)
      };
    });
    return byUrl;
  }

  function extractSuggestions(value, research) {
    var text = String(value == null ? '' : value);
    var match = text.match(MARKER);
    if (!match) return { text: text, found: false, suggestions: [] };
    var stripped = visibleText(text);
    var sourceMap = verifiedPageSources(research);
    var data = null;
    try { data = JSON.parse(match[1]); } catch (_) {}
    var list = Array.isArray(data) ? data : data && Array.isArray(data.suggestions) ? data.suggestions : [];
    var seen = Object.create(null);
    var suggestions = [];
    list.slice(0, 8).forEach(function (raw, index) {
      if (!raw || typeof raw !== 'object') return;
      var title = clean(raw.title, 90);
      var prompt = clean(raw.prompt || raw.implementationPrompt, 1400);
      var summary = clean(raw.summary, 240);
      if (!title || !prompt) return;
      var key = title.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var urls = Array.isArray(raw.sourceUrls) ? raw.sourceUrls : [];
      var validSources = [];
      urls.forEach(function (candidate) {
        var url = safePublicUrl(candidate);
        if (url && sourceMap[url] && !validSources.some(function (item) { return item.url === url; })) {
          validSources.push(sourceMap[url]);
        }
      });
      if (!validSources.length) return;
      suggestions.push({
        id: clean(raw.id || 'suggestion-' + (index + 1), 64).replace(/[^A-Za-z0-9_-]/g, '') || 'suggestion-' + (index + 1),
        title: title,
        summary: summary,
        prompt: prompt,
        sources: validSources.slice(0, 3),
        status: 'idle'
      });
    });
    return { text: stripped, found: true, suggestions: suggestions.slice(0, 3) };
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.ovyx-ws-apply-suggestions{display:grid;gap:9px;margin:14px 0 3px;padding:12px;border:1px solid rgba(211,174,104,.23);border-radius:13px;background:linear-gradient(145deg,rgba(226,187,109,.055),rgba(255,255,255,.018));color:#e8eaf0;box-sizing:border-box;max-width:100%}',
      '.ovyx-ws-apply-heading{font-size:12px;font-weight:800;color:#f0d49b;letter-spacing:.01em}',
      '.ovyx-ws-apply-intro{font-size:11px;line-height:1.5;color:#aeb7c3;margin-top:-5px}',
      '.ovyx-ws-apply-card{display:grid;gap:7px;min-width:0;padding:10px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:rgba(10,13,17,.26)}',
      '.ovyx-ws-apply-title{font-size:12px;line-height:1.4;font-weight:750;color:#f5f5f6;overflow-wrap:anywhere}',
      '.ovyx-ws-apply-summary{font-size:11px;line-height:1.55;color:#b5bec9;overflow-wrap:anywhere}',
      '.ovyx-ws-apply-sources{display:flex;flex-wrap:wrap;gap:6px}',
      '.ovyx-ws-apply-source{display:inline-flex;max-width:100%;padding:4px 7px;border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#c7d5e4;background:rgba(255,255,255,.025);font-size:10px;line-height:1.35;text-decoration:none;overflow-wrap:anywhere}',
      '.ovyx-ws-apply-source:hover,.ovyx-ws-apply-source:focus-visible{outline:2px solid rgba(239,197,116,.45);outline-offset:1px;color:#f7dfac}',
      '.ovyx-ws-apply-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      '.ovyx-ws-apply-button{display:inline-flex;justify-content:center;align-items:center;gap:7px;min-height:35px;max-width:100%;padding:8px 12px;border:1px solid rgba(230,193,121,.45);border-radius:9px;background:linear-gradient(135deg,#f2d79b,#c69a50);color:#231d13;font:750 11px/1.35 Inter,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;cursor:pointer;white-space:normal;text-align:center;overflow-wrap:anywhere}',
      '.ovyx-ws-apply-button:hover:not(:disabled){filter:brightness(1.06);transform:translateY(-1px)}.ovyx-ws-apply-button:focus-visible{outline:2px solid #f6dba0;outline-offset:2px}.ovyx-ws-apply-button:disabled{opacity:.68;cursor:default;transform:none}',
      '.ovyx-ws-apply-status{min-width:0;font-size:10px;line-height:1.4;color:#aeb6c2;overflow-wrap:anywhere}',
      '.ovyx-ws-apply-status[data-state=\"success\"]{color:#9be0b8}.ovyx-ws-apply-status[data-state=\"warning\"]{color:#edcc8c}.ovyx-ws-apply-status[data-state=\"error\"]{color:#f0aaa0}',
      '@media(max-width:480px){.ovyx-ws-apply-suggestions{padding:10px}.ovyx-ws-apply-card{padding:9px}.ovyx-ws-apply-button{width:100%}.ovyx-ws-apply-status{width:100%}}@media(prefers-reduced-motion:reduce){.ovyx-ws-apply-button:hover:not(:disabled){transform:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  function currentProjectKey() {
    var project = window.KernelState && window.KernelState.activeProject;
    if (!project) return '';
    return String(project.id || project.projectId || project.name || '').trim();
  }

  function dispatchInput(input) {
    try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
  }

  function setStatus(node, text, state) {
    node.textContent = clean(text, 260);
    node.setAttribute('data-state', state || 'info');
  }

  function showToast(message, type) {
    try {
      if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
    } catch (_) {}
  }

  function buttonsFor(studio) {
    return Array.prototype.slice.call(document.querySelectorAll('.ovyx-ws-apply-button')).filter(function (button) {
      return !!button.closest('#view-webstudio');
    });
  }

  function stateLabel(suggestion) {
    if (suggestion.status === 'verified') return { text: 'Applied & verified', disabled: true };
    if (suggestion.status === 'review') return { text: 'Applied — review checks', disabled: true };
    if (suggestion.status === 'submitted') return { text: 'Submitted — check progress', disabled: true };
    if (suggestion.status === 'running') return { text: 'Applying…', disabled: true };
    if (suggestion.status === 'failed') return { text: 'Try again', disabled: false };
    return { text: 'Apply this suggestion', disabled: !!(studioRef && studioRef.__ovyxApplySuggestionBusy) };
  }

  function refreshButtonStates() {
    if (!studioRef) return;
    buttonsFor(studioRef).forEach(function (button) {
      var suggestion = button.__ovyxApplySuggestionState;
      if (!suggestion) return;
      var state = stateLabel(suggestion);
      button.textContent = state.text;
      button.disabled = state.disabled || !!studioRef.__ovyxApplySuggestionBusy && suggestion.status !== 'running';
    });
  }

  function outcomeFor(studio) {
    var card = document.querySelector('#view-webstudio .ovyx-ws-live-activity') || document.querySelector('.ovyx-ws-live-activity');
    var title = clean(card && card.querySelector('.ovyx-ws-live-title') && card.querySelector('.ovyx-ws-live-title').textContent || '', 180);
    var detail = clean(card && card.querySelector('.ovyx-ws-live-detail') && card.querySelector('.ovyx-ws-live-detail').textContent || '', 700);
    var state = String(card && card.getAttribute('data-state') || '');
    if (state === 'success' && /Website update verified/i.test(title)) return { status: 'verified', message: 'Web Studio confirmed the source update and its available verification checks passed.' };
    if (state === 'error') return { status: 'failed', message: 'Web Studio reported an error. No successful application is being claimed.' };
    if (/No verified website changes detected/i.test(title)) return { status: 'failed', message: 'No changed source files were detected. The suggestion is still available to retry.' };
    if (/Changes need another check|Website update needs attention|Website update applied.*review findings/i.test(title) || /did not pass|reported \d+ failure/i.test(detail)) {
      return { status: 'review', message: 'Web Studio changed project files, but some verification needs your review.' };
    }
    return { status: 'submitted', message: 'The request was sent to Web Studio. Check the live progress card for its final result.' };
  }

  async function applySuggestion(suggestion, button, statusNode, pending) {
    var studio = studioRef;
    if (!studio || studio.__ovyxApplySuggestionBusy) return;
    var input = document.getElementById('ws-chat-input');
    if (!input || typeof studio.submitPrompt !== 'function') {
      suggestion.status = 'failed';
      refreshButtonStates();
      setStatus(statusNode, 'Web Studio input is unavailable. Reopen the Web Studio chat and try again.', 'error');
      return;
    }
    var activeKey = currentProjectKey();
    if (!activeKey || (pending.projectKey && activeKey !== pending.projectKey)) {
      suggestion.status = 'failed';
      refreshButtonStates();
      setStatus(statusNode, pending.projectKey ? 'The active website changed after this research. Research the current website again before applying this suggestion.' : 'Open an existing website project before applying this suggestion.', 'warning');
      return;
    }

    var prompt = [
      'Apply this selected source-backed suggestion to my existing website in Web Studio.',
      'Suggestion: ' + suggestion.title,
      'Implementation requested: ' + suggestion.prompt,
      suggestion.summary ? 'Why this helps: ' + suggestion.summary : '',
      'Verified public source pages for reference only:',
      suggestion.sources.map(function (source) { return '- ' + source.url; }).join('\n'),
      'Inspect the current project source before editing. Make the smallest appropriate original change, preserve unrelated pages and existing working behavior, and do not copy another website’s proprietary code or branded assets. Run the available checks and report honestly what changed and what verification passed.'
    ].filter(Boolean).join('\n\n').slice(0, 6500);

    var originalDraft = String(input.value || '');
    studio.__ovyxApplySuggestionBusy = true;
    suggestion.status = 'running';
    refreshButtonStates();
    setStatus(statusNode, 'Sending the selected change through Web Studio’s normal edit, preview and verification flow…', 'info');

    var failure = null;
    try {
      if (typeof studio.setMode === 'function') studio.setMode('build');
      studio.__ovyxAutoReadOnlyMode = false;
      if (pending.research) studio.__ovyxLastWebResearch = pending.research;
      input.value = prompt;
      dispatchInput(input);
      await Promise.resolve(studio.submitPrompt());
      var outcome = outcomeFor(studio);
      suggestion.status = outcome.status === 'failed' ? 'failed' : outcome.status;
      setStatus(statusNode, outcome.message, outcome.status === 'verified' ? 'success' : outcome.status === 'failed' ? 'warning' : 'info');
      if (outcome.status === 'verified') showToast('Suggestion applied and verified in Web Studio.', 'success');
      else if (outcome.status === 'review') showToast('The suggestion changed the website, but verification needs review.', 'warning');
      else if (outcome.status === 'failed') showToast('Web Studio did not confirm a successful change. Review the progress card and retry if appropriate.', 'warning');
    } catch (error) {
      failure = error;
      suggestion.status = 'failed';
      setStatus(statusNode, clean(error && error.message || 'Web Studio could not submit this suggestion.', 260), 'error');
      showToast('The suggestion could not be submitted to Web Studio.', 'error');
    } finally {
      if (originalDraft && (!String(input.value || '').trim() || String(input.value || '') === prompt)) {
        input.value = originalDraft;
        dispatchInput(input);
      }
      studio.__ovyxApplySuggestionBusy = false;
      refreshButtonStates();
      if (failure) console.error('[OVYX WEB STUDIO APPLY SUGGESTION]', failure);
    }
  }

  function renderSuggestionControls(studio, bubble, pending) {
    if (!bubble || bubble.querySelector('.ovyx-ws-apply-suggestions')) return;
    var content = bubble.querySelector('.ovyx-ws-msg-content');
    if (!content) return;
    addStyles();

    var root = document.createElement('section');
    root.className = 'ovyx-ws-apply-suggestions';
    root.setAttribute('aria-label', 'Source-backed website recommendations');
    var heading = document.createElement('div');
    heading.className = 'ovyx-ws-apply-heading';
    heading.textContent = 'Choose an improvement to apply';
    var intro = document.createElement('div');
    intro.className = 'ovyx-ws-apply-intro';
    intro.textContent = 'Each option is tied to a source page opened during research. Selecting one sends it through Web Studio’s normal website-editing and verification flow.';
    root.appendChild(heading);
    root.appendChild(intro);

    var sourceRows = [];
    pending.suggestions.forEach(function (suggestion, index) {
      var card = document.createElement('article');
      card.className = 'ovyx-ws-apply-card';
      var title = document.createElement('div');
      title.className = 'ovyx-ws-apply-title';
      title.textContent = suggestion.title;
      var summary = document.createElement('div');
      summary.className = 'ovyx-ws-apply-summary';
      summary.textContent = suggestion.summary;
      card.appendChild(title);
      if (suggestion.summary) card.appendChild(summary);

      var links = document.createElement('div');
      links.className = 'ovyx-ws-apply-sources';
      suggestion.sources.forEach(function (source) {
        var link = document.createElement('a');
        link.className = 'ovyx-ws-apply-source';
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.domain || source.title || source.url;
        link.title = source.title || source.url;
        links.appendChild(link);
      });
      card.appendChild(links);

      var actions = document.createElement('div');
      actions.className = 'ovyx-ws-apply-actions';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ovyx-ws-apply-button';
      button.setAttribute('data-ovyx-apply-suggestion', suggestion.id);
      button.setAttribute('data-suggestion-index', String(index));
      button.__ovyxApplySuggestionState = suggestion;
      button.setAttribute('aria-label', 'Apply suggestion: ' + suggestion.title);
      var label = stateLabel(suggestion);
      button.textContent = label.text;
      button.disabled = label.disabled;
      var status = document.createElement('span');
      status.className = 'ovyx-ws-apply-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      if (suggestion.status === 'verified') setStatus(status, 'Applied and passed available verification.', 'success');
      button.addEventListener('click', function () {
        studio.__ovyxApplySuggestionPromise = applySuggestion(suggestion, button, status, pending);
      });
      actions.appendChild(button);
      actions.appendChild(status);
      card.appendChild(actions);
      root.appendChild(card);
    });
    content.appendChild(root);
    pending.attached = true;
    var matchedMessageId = '';
    if (Array.isArray(studio.thread)) {
      for (var messageIndex = studio.thread.length - 1; messageIndex >= 0; messageIndex -= 1) {
        var message = studio.thread[messageIndex];
        if (message && normalizeText(message.text || message.content) === normalizeText(pending.text)) {
          matchedMessageId = message.id;
          break;
        }
      }
    }
    pending.messageId = clean(matchedMessageId, 120);
  }

  function attachPendingSuggestions(studio) {
    var groups = studio && Array.isArray(studio.__ovyxApplySuggestionGroups) ? studio.__ovyxApplySuggestionGroups : [];
    var thread = Array.isArray(studio && studio.thread) ? studio.thread : [];
    var threadRoot = document.getElementById('ws-agent-thread');
    if (!threadRoot) return;
    groups.forEach(function (pending) {
      if (!pending || !Array.isArray(pending.suggestions) || !pending.suggestions.length) return;
      var messageIndex = -1;
      if (pending.messageId) {
        for (var idIndex = thread.length - 1; idIndex >= 0; idIndex -= 1) {
          if (thread[idIndex] && String(thread[idIndex].id || '') === String(pending.messageId)) {
            messageIndex = idIndex;
            break;
          }
        }
      }
      if (messageIndex < 0) {
        for (var i = thread.length - 1; i >= 0; i -= 1) {
          var message = thread[i];
          if (!message || message.role === 'user') continue;
          if (normalizeText(message.text || message.content) === normalizeText(pending.text)) {
            messageIndex = i;
            pending.messageId = clean(message.id, 120);
            break;
          }
        }
      }
      if (messageIndex < 0) return;
      var bubble = threadRoot.querySelector('.ovyx-ws-msg[data-ws-thread-index="' + messageIndex + '"]');
      if (!bubble) return;
      if (!pending.projectKey) pending.projectKey = currentProjectKey();
      renderSuggestionControls(studio, bubble, pending);
    });
  }

  function installCallAI(studio) {
    if (!studio || typeof studio.callAI !== 'function' || studio.callAI.__ovyxApplySuggestionWrapper) return;
    var originalCallAI = studio.callAI;
    if (!Array.isArray(studio.__ovyxApplySuggestionGroups)) studio.__ovyxApplySuggestionGroups = [];
    async function callAIWithSuggestionMetadata(payload, token) {
      var beforeResearch = studio.__ovyxLastWebResearch;
      var result = await originalCallAI.call(this, payload, token);
      if (!result || typeof result !== 'object') return result;
      var markerKey = CONTROL_KEYS.find(function (key) {
        return typeof result[key] === 'string' && MARKER.test(result[key]);
      });
      if (!markerKey) return result;
      MARKER.lastIndex = 0;
      var provided = payload && payload.context && payload.context.webResearch;
      var research = provided && provided.status === 'complete'
        ? provided
        : studio.__ovyxLastWebResearch && studio.__ovyxLastWebResearch.status === 'complete' && studio.__ovyxLastWebResearch !== beforeResearch
          ? studio.__ovyxLastWebResearch
          : null;
      var parsed = extractSuggestions(result[markerKey], research);
      var cleaned = Object.assign({}, result);
      CONTROL_KEYS.forEach(function (key) {
        if (typeof cleaned[key] === 'string' && MARKER.test(cleaned[key])) {
          MARKER.lastIndex = 0;
          cleaned[key] = visibleText(cleaned[key]);
        } else {
          MARKER.lastIndex = 0;
        }
      });
      var mode = String(payload && payload.mode || studio.mode || 'ask').toLowerCase();
      var prompt = String(payload && (payload.prompt || payload.message) || '');
      if (studio.__ovyxApplySuggestionBusy) return cleaned;
      if (mode === 'ask' && asksForRecommendations(prompt) && research && research.status === 'complete' && parsed.suggestions.length) {
        var pending = {
          text: parsed.text,
          suggestions: parsed.suggestions,
          research: research,
          projectKey: currentProjectKey(),
          attached: false,
          createdAt: Date.now(),
          messageId: ''
        };
        studio.__ovyxApplySuggestionGroups.push(pending);
        if (studio.__ovyxApplySuggestionGroups.length > 20) studio.__ovyxApplySuggestionGroups.shift();
        studio.__ovyxPendingApplySuggestions = pending;
      }
      return cleaned;
    }
    callAIWithSuggestionMetadata.__ovyxApplySuggestionWrapper = true;
    studio.callAI = callAIWithSuggestionMetadata;
  }

  function installRenderHook(studio) {
    if (!studio || typeof studio.renderThread !== 'function' || studio.renderThread.__ovyxApplySuggestionRenderWrapper) return;
    var originalRender = studio.renderThread;
    function renderWithApplySuggestions() {
      var value = originalRender.apply(this, arguments);
      attachPendingSuggestions(studio);
      return value;
    }
    renderWithApplySuggestions.__ovyxApplySuggestionRenderWrapper = true;
    studio.renderThread = renderWithApplySuggestions;
  }

  function install() {
    var studio = window.WebStudio;
    if (!studio || !isWebStudioViewActive() ||
        typeof studio.callAI !== 'function' || typeof studio.submitPrompt !== 'function' || typeof studio.renderThread !== 'function') return false;
    studioRef = studio;
    addStyles();
    installCallAI(studio);
    installRenderHook(studio);
    attachPendingSuggestions(studio);
    return true;
  }

  var attempts = 0;
  function boot() {
    if (!isWebStudioViewActive()) return;
    if (install()) return;
    if (attempts++ < 70) window.setTimeout(boot, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', function () { attempts = 0; window.setTimeout(boot, 0); });
  window.addEventListener('firebase-auth-state-ready', function () {
    if (!isWebStudioViewActive()) return;
    attempts = 0;
    window.setTimeout(boot, 0);
  });
})();