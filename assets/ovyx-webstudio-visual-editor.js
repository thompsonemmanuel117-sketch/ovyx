(function () {
  'use strict';
  if (window.__OVYX_VISUAL_EDITOR_V1__) return;
  window.__OVYX_VISUAL_EDITOR_V1__ = true;

  var STYLE_ID = 'ovyx-visual-editor-v1-style';
  var PANEL_ATTR = 'data-ovyx-visual-advanced';
  var ALLOWED = {
    color: 'color', 'background-color': 'color', 'border-color': 'color',
    'font-size': 'length', 'border-radius': 'length', padding: 'length',
    margin: 'length', gap: 'length', width: 'length', 'max-width': 'length',
    'min-height': 'length', 'line-height': 'line', 'letter-spacing': 'length',
    'font-weight': 'weight', display: 'display', 'flex-direction': 'direction',
    'align-items': 'align', 'justify-content': 'justify', 'text-align': 'alignText',
    'font-family': 'font', 'box-shadow': 'shadow', opacity: 'opacity'
  };
  var CHOICES = {
    display: ['block', 'flex', 'grid', 'inline-block', 'none'],
    direction: ['row', 'column', 'row-reverse', 'column-reverse'],
    align: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
    justify: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
    alignText: ['left', 'center', 'right', 'justify'],
    font: ['Inter, sans-serif', 'system-ui, sans-serif', 'Arial, sans-serif', 'Georgia, serif', 'monospace'],
    shadow: ['none', '0 8px 24px rgba(0,0,0,.16)', '0 12px 32px rgba(0,0,0,.24)']
  };

  function studio() { return window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null; }
  function project() { return window.KernelState && window.KernelState.activeProject || null; }
  function clean(value, max) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 500); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }
  function toast(message, kind) { try { window.showToast && window.showToast(message, kind || 'info'); } catch (_) {} }
  function activeDevice(w) {
    var value = String(w && (w.previewPreset || w.viewport) || document.documentElement.getAttribute('data-ovyx-ws-preview-preset') || 'desktop');
    return ['desktop', 'tablet', 'mobile'].indexOf(value) >= 0 ? value : 'desktop';
  }
  function safeSelector(value) {
    var selector = String(value || '').trim();
    if (!selector || selector.length > 700) return '';
    return /^(?:[a-z][a-z0-9-]*:nth-of-type\([1-9]\d*\))(?:\s*>\s*[a-z][a-z0-9-]*:nth-of-type\([1-9]\d*\))*$/i.test(selector) ? selector : '';
  }
  function resolveElement(doc, info) {
    if (!doc || !info) return null;
    if (info.id && !String(info.id).includes(':')) {
      try { var byId = doc.querySelector('[data-ov-node="' + CSS.escape(String(info.id)) + '"]'); if (byId) return byId; } catch (_) {}
    }
    var selector = safeSelector(info.selector);
    if (selector) { try { return doc.querySelector(selector); } catch (_) {} }
    return null;
  }
  function sourceContext(w) {
    if (!w) throw new Error('Web Studio is not ready.');
    w.ensureProjectGraph && w.ensureProjectGraph();
    var info = w.selectedElement;
    if (!info) throw new Error('Select an element in the live preview first.');
    var file = clean(info.file || (w.entryFile && w.entryFile()) || w.graph && w.graph.entry, 240);
    var record = w.graph && w.graph.files && w.graph.files[file];
    var source = record && typeof record.content === 'string' ? record.content : '';
    if (!file || !source) throw new Error('The selected element source is not available in the active project.');
    return { file: file, source: source, info: info };
  }
  function serialize(doc) { return '<!doctype html>\n' + doc.documentElement.outerHTML; }
  function snapshot(w) { return typeof w.snapshotGraph === 'function' ? w.snapshotGraph() : JSON.parse(JSON.stringify(w.graph || {})); }
  function commit(w, context, doc, label, before) {
    var record = w.graph.files[context.file];
    record.content = serialize(doc);
    record.previousContent = context.source;
    record.dirty = true;
    w.syncGraphToProject && w.syncGraphToProject();
    if (typeof w.commitHistory === 'function') w.commitHistory(label, before, snapshot(w));
    else if (typeof w.recordHistory === 'function') w.recordHistory();
    if (typeof w.renderPreview === 'function') w.renderPreview();
    if (typeof w.syncWebContainerFiles === 'function') Promise.resolve(w.syncWebContainerFiles()).catch(function () {});
    window.dispatchEvent(new CustomEvent('ovyx:visual-edit-saved', { detail: { file: context.file, label: label } }));
  }
  function parseDocument(source) {
    var doc = new DOMParser().parseFromString(String(source || ''), 'text/html');
    if (!doc || !doc.documentElement) throw new Error('The selected page could not be parsed safely.');
    return doc;
  }
  function normalizeValue(property, raw) {
    var kind = ALLOWED[property];
    var value = clean(raw, 120);
    if (!kind) return null;
    if (kind === 'color') return /^(#[0-9a-f]{3,8}|transparent|currentColor)$/i.test(value) ? value : null;
    if (kind === 'length') return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|rem|em|vw|vh)?$/i.test(value) ? value : null;
    if (kind === 'line') return /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem)?$/i.test(value) ? value : null;
    if (kind === 'weight') return /^(?:100|200|300|400|500|600|700|800|900)$/.test(value) ? value : null;
    if (kind === 'opacity') return /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value) ? value : null;
    if (CHOICES[kind]) return CHOICES[kind].indexOf(value) >= 0 ? value : null;
    return null;
  }
  function writeStyle(property, raw) {
    var w = studio(), context, doc, el, value = normalizeValue(property, raw);
    if (!value) { toast('That style value is not supported.', 'warning'); return false; }
    try {
      context = sourceContext(w); doc = parseDocument(context.source); el = resolveElement(doc, context.info);
      if (!el) throw new Error('The selected element no longer matches the project source. Select it again.');
      var before = snapshot(w), device = activeDevice(w);
      if (device === 'desktop') {
        el.style.setProperty(property, value);
      } else {
        var style = doc.querySelector('style[data-ovyx-responsive-editor]');
        if (!style) { style = doc.createElement('style'); style.setAttribute('data-ovyx-responsive-editor', ''); (doc.head || doc.documentElement).appendChild(style); }
        var state = {};
        try { state = JSON.parse(style.getAttribute('data-ovyx-responsive-state') || '{}') || {}; } catch (_) { state = {}; }
        state[device] = state[device] || {};
        var selector = safeSelector(context.info.selector);
        if (!selector) throw new Error('Responsive styling requires a stable preview element selector.');
        state[device][selector] = state[device][selector] || {};
        state[device][selector][property] = value;
        style.setAttribute('data-ovyx-responsive-state', JSON.stringify(state));
        var css = [];
        ['tablet', 'mobile'].forEach(function (preset) {
          var rules = state[preset] || {};
          Object.keys(rules).forEach(function (path) {
            var declarations = Object.keys(rules[path] || {}).map(function (key) { return key + ':' + rules[path][key] + ' !important'; }).join(';');
            if (declarations) css.push((preset === 'mobile' ? '@media (max-width: 600px)' : '@media (min-width: 601px) and (max-width: 1024px)') + '{' + path + '{' + declarations + '}}');
          });
        });
        style.textContent = '/* OVYX responsive visual styles — managed by the visual editor */\n' + css.join('\n');
      }
      commit(w, context, doc, 'Visual style · ' + property + ' · ' + device, before);
      return true;
    } catch (error) { toast(error && error.message || 'Visual style could not be saved.', 'error'); return false; }
  }
  function writeAttribute(name, raw) {
    var w = studio(), context, doc, el, value = clean(raw, 2000);
    if (['src', 'alt', 'title', 'aria-label'].indexOf(name) < 0) return false;
    if (name === 'src') {
      if (!/^(?:https:\/\/|\/(?!\/)|\.{1,2}\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(value)) {
        toast('Only secure or project-local image URLs can be applied.', 'warning'); return false;
      }
    }
    try {
      context = sourceContext(w); doc = parseDocument(context.source); el = resolveElement(doc, context.info);
      if (!el) throw new Error('The selected element no longer matches the project source.');
      if (name === 'src' && el.tagName.toLowerCase() !== 'img') throw new Error('Select an image element to replace its image.');
      var before = snapshot(w); el.setAttribute(name, value);
      commit(w, context, doc, 'Visual content · ' + name, before); return true;
    } catch (error) { toast(error && error.message || 'The selected content could not be updated.', 'error'); return false; }
  }
  function writeText(raw) {
    var w = studio(), context, doc, el, value = String(raw == null ? '' : raw).slice(0, 12000);
    try {
      context = sourceContext(w); doc = parseDocument(context.source); el = resolveElement(doc, context.info);
      if (!el) throw new Error('The selected element no longer matches the project source.');
      if (el.children.length) throw new Error('This component contains nested elements. Use Open Code or Ask OVYX to edit its content safely.');
      var before = snapshot(w); el.textContent = value;
      commit(w, context, doc, 'Visual text edit', before); return true;
    } catch (error) { toast(error && error.message || 'Text could not be edited.', 'error'); return false; }
  }
  function moveNode(fromSelector, toSelector, position) {
    var w = studio(), info = w && w.selectedElement, context, doc, from, to;
    try {
      if (!info) throw new Error('Select a component before moving it.');
      context = sourceContext(w); doc = parseDocument(context.source);
      from = doc.querySelector(safeSelector(fromSelector || info.selector));
      to = doc.querySelector(safeSelector(toSelector));
      if (!from || !to || !from.parentElement || from.parentElement !== to.parentElement) throw new Error('Components can only be reordered within the same parent.');
      var forbidden = ['HTML','HEAD','BODY','SCRIPT','STYLE','FORM','INPUT','TEXTAREA','SELECT','OPTION','TABLE','TBODY','THEAD','TR','TD','TH'];
      if (forbidden.indexOf(from.tagName) >= 0 || forbidden.indexOf(to.tagName) >= 0 || from === to || from.contains(to)) throw new Error('This component cannot be moved in that position.');
      var before = snapshot(w);
      if (position === 'after') to.parentElement.insertBefore(from, to.nextSibling);
      else to.parentElement.insertBefore(from, to);
      commit(w, context, doc, 'Visual component reorder', before);
      return true;
    } catch (error) { toast(error && error.message || 'Component could not be moved.', 'error'); return false; }
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style'); style.id = STYLE_ID;
    style.textContent = [
      '#ws-select-inspector .ovyx-ve-advanced{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.09)}',
      '#ws-select-inspector .ovyx-ve-field{display:flex;flex-direction:column;gap:4px;min-width:0;color:#929aa4;font:800 7px/1.2 JetBrains Mono,monospace;text-transform:uppercase;letter-spacing:.06em}',
      '#ws-select-inspector .ovyx-ve-field input,#ws-select-inspector .ovyx-ve-field select{width:100%;min-width:0;height:29px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#101317;color:#eef0f3;padding:4px 7px;font:700 9px Inter,system-ui,sans-serif;box-sizing:border-box}',
      '#ws-select-inspector .ovyx-ve-device,#ws-select-inspector .ovyx-ve-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}',
      '#ws-select-inspector .ovyx-ve-device button,#ws-select-inspector .ovyx-ve-actions button{border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#101317;color:#cbd1d8;padding:7px 8px;font:800 7px Inter,system-ui,sans-serif;cursor:pointer}',
      '#ws-select-inspector .ovyx-ve-device button.active{border-color:rgba(232,182,79,.55);color:#f3d69d;background:rgba(232,182,79,.08)}',
      '#ws-select-inspector .ovyx-ve-asset-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:8px;max-height:150px;overflow:auto}',
      '#ws-select-inspector .ovyx-ve-asset-list button{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid rgba(255,255,255,.1);background:#101317;color:#d8dde3;border-radius:7px;padding:7px;font:700 7px Inter,sans-serif}',
      '@media(max-width:700px){#ws-select-inspector{max-width:calc(100% - 20px)!important;left:10px!important;right:10px!important;bottom:10px!important;max-height:48vh;overflow:auto}#ws-select-inspector .ovyx-ve-advanced{grid-template-columns:repeat(2,minmax(0,1fr))}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }
  function make(tag, text) { var node = document.createElement(tag); if (text != null) node.textContent = text; return node; }
  function field(host, label, property, type, options) {
    var wrap = make('label'); wrap.className = 'ovyx-ve-field'; wrap.appendChild(make('span', label));
    var input;
    if (type === 'select') {
      input = make('select');
      (options || []).forEach(function (option) { var item = make('option', option.label || option.value); item.value = option.value; input.appendChild(item); });
    } else { input = make('input'); input.type = type || 'text'; }
    input.setAttribute('aria-label', label);
    if (type === 'color') input.value = '#ffffff';
    if (type === 'number') { input.min = '0'; input.max = '2400'; input.step = '1'; }
    if (property) input.addEventListener('change', function () {
      var value = input.value;
      if (['font-size','border-radius','padding','margin','gap','width','max-width','min-height','letter-spacing'].indexOf(property) >= 0 && value && !/[%a-z]$/i.test(value)) value += 'px';
      writeStyle(property, value);
    });
    wrap.appendChild(input); host.appendChild(wrap); return input;
  }
  function button(host, label, action) { var b = make('button', label); b.type = 'button'; b.addEventListener('click', action); host.appendChild(b); return b; }
  function currentComputed(property) {
    var w = studio(), info = w && w.selectedElement;
    var frame = document.getElementById('ws-canvas-iframe');
    try { var el = frame.contentDocument.querySelector(safeSelector(info && info.selector)); return el ? getComputedStyle(el).getPropertyValue(property) : ''; } catch (_) { return ''; }
  }
  function renderInspector() {
    var box = document.getElementById('ws-select-inspector'), w = studio();
    if (!box || !w || !w.selectedElement) return;
    addStyles();
    var existing = box.querySelector('[' + PANEL_ATTR + ']');
    if (existing) existing.remove();
    var panel = make('div'); panel.className = 'ovyx-ve-advanced'; panel.setAttribute(PANEL_ATTR, '');
    var deviceRow = make('div'); deviceRow.className = 'ovyx-ve-device'; deviceRow.style.gridColumn = '1 / -1';
    ['desktop','tablet','mobile'].forEach(function (preset) {
      var b = button(deviceRow, preset.charAt(0).toUpperCase() + preset.slice(1), function () {
        if (typeof w.setPreviewPreset === 'function') w.setPreviewPreset(preset);
        else { w.previewPreset = preset; w.renderPreview && w.renderPreview(); }
        renderInspector();
      });
      b.classList.toggle('active', activeDevice(w) === preset);
    });
    panel.appendChild(deviceRow);
    var bg = field(panel, 'Background', 'background-color', 'color');
    var font = field(panel, 'Font family', 'font-family', 'select', CHOICES.font.map(function (v) { return { value: v, label: v.split(',')[0] }; }));
    var weight = field(panel, 'Weight', 'font-weight', 'select', [300,400,500,600,700,800,900].map(function (v) { return { value: String(v), label: String(v) }; }));
    var align = field(panel, 'Text align', 'text-align', 'select', CHOICES.alignText.map(function (v) { return { value: v, label: v }; }));
    var display = field(panel, 'Display', 'display', 'select', CHOICES.display.map(function (v) { return { value: v, label: v }; }));
    var direction = field(panel, 'Flex direction', 'flex-direction', 'select', CHOICES.direction.map(function (v) { return { value: v, label: v }; }));
    var justify = field(panel, 'Justify', 'justify-content', 'select', CHOICES.justify.map(function (v) { return { value: v, label: v.replace('space-','') }; }));
    var width = field(panel, 'Width', 'width', 'number');
    var maxWidth = field(panel, 'Max width', 'max-width', 'number');
    var minHeight = field(panel, 'Min height', 'min-height', 'number');
    var gap = field(panel, 'Gap', 'gap', 'number');
    var margin = field(panel, 'Margin', 'margin', 'number');
    var shadow = field(panel, 'Shadow', 'box-shadow', 'select', CHOICES.shadow.map(function (v) { return { value: v, label: v === 'none' ? 'None' : v.indexOf('8px') >= 0 ? 'Soft' : 'Strong' }; }));
    panel.appendChild(make('div')).className = 'ovyx-ve-actions';
    var actions = panel.lastChild; actions.style.gridColumn = '1 / -1';
    button(actions, 'Edit text', function () { var w2 = studio(), current = w2 && w2.selectedElement && w2.selectedElement.title || ''; var next = window.prompt('Edit this element text', current); if (next !== null) writeText(next); });
    button(actions, 'Replace image', function () { showImagePicker(panel); });
    button(actions, 'Move up', function () { moveSibling(-1); });
    button(actions, 'Move down', function () { moveSibling(1); });
    button(actions, 'Reorder sections', function () { try { window.OVYXPreviewProjectControls && window.OVYXPreviewProjectControls.openSections(); } catch (_) {} });
    button(actions, 'Undo', function () { w.undo && w.undo(); });
    button(actions, 'Redo', function () { w.redo && w.redo(); });
    panel.appendChild(make('div', 'Responsive values are saved to the active page source and scoped to the selected viewport.')).className = 'ovyx-ve-note';
    box.appendChild(panel);
    // Show current values when the selected element is available in the preview.
    try {
      var c = currentComputed('background-color'); if (c) { var m = c.match(/\d+/g); if (m && m.length >= 3) bg.value = '#' + m.slice(0,3).map(function (n) { return Number(n).toString(16).padStart(2,'0'); }).join(''); }
      font.value = currentComputed('font-family').replace(/["']/g,'') || font.value;
      weight.value = currentComputed('font-weight') || weight.value;
      align.value = currentComputed('text-align') || align.value;
      display.value = currentComputed('display') || display.value;
      direction.value = currentComputed('flex-direction') || direction.value;
      justify.value = currentComputed('justify-content') || justify.value;
      shadow.value = currentComputed('box-shadow') === 'none' ? 'none' : shadow.value;
      [width,maxWidth,minHeight,gap,margin].forEach(function (input) { var property = input.getAttribute('aria-label').toLowerCase().replace(' ','-'); var v = currentComputed(property); if (v && /^\d+(?:\.\d+)?px$/.test(v)) input.value = parseFloat(v); });
    } catch (_) {}
  }
  function moveSibling(direction) {
    var w = studio(), context, doc, el, sibling;
    try {
      context = sourceContext(w); doc = parseDocument(context.source); el = resolveElement(doc, context.info);
      if (!el || !el.parentElement) throw new Error('The selected component cannot be moved.');
      sibling = direction < 0 ? el.previousElementSibling : el.nextElementSibling;
      if (!sibling) { toast('There is no component in that direction.', 'info'); return; }
      moveNode(context.info.selector, selectorFor(sibling), direction < 0 ? 'before' : 'after');
    } catch (error) { toast(error && error.message || 'Component could not be moved.', 'error'); }
  }
  function selectorFor(el) {
    var parts = [];
    while (el && el.nodeType === 1 && parts.length < 7) {
      var tag = el.tagName.toLowerCase(), index = 1, sibling = el;
      while ((sibling = sibling.previousElementSibling)) if (sibling.tagName === el.tagName) index++;
      parts.unshift(tag + ':nth-of-type(' + index + ')'); el = el.parentElement;
    }
    return parts.join(' > ');
  }
  function showImagePicker(panel) {
    var w = studio(), p = project(), store = window.OVYXAssetStore;
    if (!p || !p.id || !store || typeof store.list !== 'function') { toast('Project image storage is not available yet.', 'warning'); return; }
    var old = panel.querySelector('.ovyx-ve-asset-list'); if (old) old.remove();
    var list = make('div'); list.className = 'ovyx-ve-asset-list'; list.style.gridColumn = '1 / -1'; list.textContent = 'Loading project images…'; panel.appendChild(list);
    Promise.resolve(store.list(p.id)).then(function (assets) {
      list.textContent = '';
      (assets || []).filter(function (asset) { return /^image\//i.test(String(asset.contentType || asset.type || '')); }).forEach(function (asset) {
        button(list, clean(asset.name || 'Image', 80), async function () {
          try {
            var url = await store.url(asset);
            var context = sourceContext(w), doc = parseDocument(context.source), el = resolveElement(doc, context.info);
            if (!el) throw new Error('Select an element again before applying an image.');
            if (el.tagName.toLowerCase() === 'img') writeAttribute('src', url);
            else writeStyle('background-image', 'url("' + String(url).replace(/["\\\n\r]/g, '') + '")');
            list.remove();
          } catch (error) { toast(error && error.message || 'Image could not be applied.', 'error'); }
        });
      });
      if (!list.children.length) list.textContent = 'No uploaded images found for this project.';
    }).catch(function (error) { list.textContent = error && error.message || 'Project images could not be loaded.'; });
  }
  function uploadImage(file, panel) {
    var p = project(), store = window.OVYXAssetStore;
    if (!p || !p.id || !store || typeof store.upload !== 'function') { toast('Project image storage is not available yet.', 'warning'); return; }
    if (!file || !/^image\/(?:png|jpeg|webp|gif|svg\+xml)$/i.test(file.type || '') || file.size > 15 * 1024 * 1024) { toast('Choose an image under 15 MB.', 'warning'); return; }
    Promise.resolve(store.upload(file, p.id, {})).then(async function (uploaded) {
      var asset = uploaded;
      if (!asset || !(asset.assetId || asset.id || asset.path || asset.name)) {
        var assets = await store.list(p.id); asset = (assets || []).find(function (item) { return item.name === file.name; });
      }
      if (!asset) throw new Error('The uploaded image was stored but its project record could not be found.');
      var url = await store.url(asset), w = studio(), context = sourceContext(w), doc = parseDocument(context.source), el = resolveElement(doc, context.info);
      if (!el) throw new Error('Select an element again before applying an image.');
      if (el.tagName.toLowerCase() === 'img') writeAttribute('src', url);
      else writeStyle('background-image', 'url("' + String(url).replace(/["\\\n\r]/g, '') + '")');
      toast('Image uploaded and applied to the selected component.', 'success');
      var list = panel.querySelector('.ovyx-ve-asset-list'); if (list) list.remove();
    }).catch(function (error) { toast(error && error.message || 'Image upload failed.', 'error'); });
  }
  function installImageUpload(panel) {
    if (panel.querySelector('[data-ovyx-ve-upload]')) return;
    var input = make('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'; input.hidden = true; input.setAttribute('data-ovyx-ve-upload','');
    input.addEventListener('change', function () { var file = input.files && input.files[0]; input.value = ''; if (file) uploadImage(file, panel); });
    panel.appendChild(input);
    var actions = panel.querySelector('.ovyx-ve-actions');
    if (actions) button(actions, 'Upload image', function () { input.click(); });
  }
  function renderInspectorWithUpload() {
    var box = document.getElementById('ws-select-inspector');
    if (!box || !box.querySelector('[' + PANEL_ATTR + ']')) return;
    installImageUpload(box.querySelector('[' + PANEL_ATTR + ']'));
  }
  function setDragMode(enabled) {
    ['ws-canvas-iframe','ws-mobile-preview-frame'].forEach(function (id) {
      var frame = document.getElementById(id);
      try { frame && frame.contentWindow && frame.contentWindow.postMessage({ ovyxVisualDragMode: !!enabled }, '*'); } catch (_) {}
    });
  }
  function dragHook() {
    return '<script>(function(){var active=false,from=null,over=null;function path(el){var a=[];while(el&&el.nodeType===1&&a.length<7){var n=el.tagName.toLowerCase(),i=1,s=el;while(s=s.previousElementSibling){if(s.tagName===el.tagName)i++}a.unshift(n+":nth-of-type("+i+")");el=el.parentElement}return a.join(" > ")}function allowed(el){return el&&/^(SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|ASIDE|DIV|LI)$/.test(el.tagName)&&el.parentElement&&!/^(HTML|HEAD|BODY)$/.test(el.parentElement.tagName)}function clear(){if(over){over.style.outline="";over=null}}window.addEventListener("message",function(e){if(e.data&&Object.prototype.hasOwnProperty.call(e.data,"ovyxVisualDragMode")){active=!!e.data.ovyxVisualDragMode;document.querySelectorAll("[data-ovyx-ve-drag]").forEach(function(n){n.removeAttribute("draggable");n.removeAttribute("data-ovyx-ve-drag")});if(active)document.querySelectorAll("[data-ov-node],section,article,header,footer,main,nav,aside").forEach(function(n){if(allowed(n)){n.setAttribute("draggable","true");n.setAttribute("data-ovyx-ve-drag","1")}});clear()}});document.addEventListener("dragstart",function(e){if(!active)return;var el=e.target.closest("[data-ovyx-ve-drag]");if(!el)return;from=path(el);try{e.dataTransfer.setData("text/plain",from);e.dataTransfer.effectAllowed="move"}catch(_){}},true);document.addEventListener("dragover",function(e){if(!active||!from)return;var el=e.target.closest("[data-ovyx-ve-drag]");if(!el||el===e.target.closest("[data-ovyx-ve-drag]")&&path(el)===from)return;e.preventDefault();clear();over=el;over.style.outline="2px solid #d6ad62";},true);document.addEventListener("drop",function(e){if(!active||!from)return;var target=e.target.closest("[data-ovyx-ve-drag]");if(!target)return;e.preventDefault();var rect=target.getBoundingClientRect(),position=e.clientY>rect.top+rect.height/2?"after":"before";parent.postMessage({ovyxVisualMove:{from:from,to:path(target),position:position}},"*");from=null;clear()},true);document.addEventListener("dragend",function(){from=null;clear()},true)})()<\\/script>';
  }
  function install(w) {
    if (!w || w.__ovyxVisualEditorInstalled) return;
    w.__ovyxVisualEditorInstalled = true;
    w.applyVisualEditorStyle = writeStyle;
    w.applyVisualEditorAttribute = writeAttribute;
    w.applyVisualEditorText = writeText;
    var originalSelect = typeof w.selectPreviewElement === 'function' ? w.selectPreviewElement : null;
    if (originalSelect) w.selectPreviewElement = function (info) { var result = originalSelect.apply(this, arguments); window.requestAnimationFrame(function () { renderInspector(); renderInspectorWithUpload(); }); return result; };
    var originalBuild = typeof w.buildPreviewDocument === 'function' ? w.buildPreviewDocument : null;
    if (originalBuild) w.buildPreviewDocument = function () { var html = originalBuild.apply(this, arguments); if (typeof html !== 'string' || html.indexOf('ovyxVisualDragMode') >= 0) return html; var hook = dragHook(); return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, hook + '</body>') : html + hook; };
    var originalRender = typeof w.renderPreview === 'function' ? w.renderPreview : null;
    if (originalRender) w.renderPreview = function () { var result = originalRender.apply(this, arguments); var enabled = !!this.__ovyxVisualDragEnabled; window.setTimeout(function () { setDragMode(enabled); }, 80); return result; };
    var originalMenu = typeof w.handlePreviewMenu === 'function' ? w.handlePreviewMenu : null;
    if (originalMenu) w.handlePreviewMenu = function (action) {
      if (String(action || '').toLowerCase() === 'visual') {
        this.__ovyxVisualDragEnabled = !this.__ovyxVisualDragEnabled;
        var enabled = this.__ovyxVisualDragEnabled;
        var result = originalMenu.apply(this, arguments);
        window.setTimeout(function () { setDragMode(enabled); }, 120);
        toast(enabled ? 'Visual drag mode enabled. Drag a highlighted section or component to reorder it.' : 'Visual drag mode paused.', 'info');
        return result;
      }
      return originalMenu.apply(this, arguments);
    };
    window.addEventListener('message', function (event) {
      var desktop = document.getElementById('ws-canvas-iframe'), mobile = document.getElementById('ws-mobile-preview-frame');
      if (!event.source || event.source !== (desktop && desktop.contentWindow) && event.source !== (mobile && mobile.contentWindow)) return;
      var move = event.data && event.data.ovyxVisualMove;
      if (!move) return;
      if (!safeSelector(move.from) || !safeSelector(move.to) || ['before','after'].indexOf(move.position) < 0) return;
      var info = w.selectedElement;
      if (!info) return;
      var old = info.selector;
      info.selector = move.from;
      var moved = moveNode(move.from, move.to, move.position);
      info.selector = moved ? move.from : old;
      if (moved) window.setTimeout(function () { setDragMode(!!w.__ovyxVisualDragEnabled); }, 180);
    });
    window.addEventListener('ovyx:view-changed', function (event) {
      var view = String(event && event.detail && event.detail.view || window.KernelState && window.KernelState.activeView || '').replace(/^view-/, '');
      if (view !== 'webstudio') { w.__ovyxVisualDragEnabled = false; setDragMode(false); }
    });
  }
  function boot() {
    var w = studio();
    if (w) install(w);
    window.addEventListener('ovyx:view-changed', function () { window.setTimeout(function () { install(studio()); }, 80); });
    window.addEventListener('ovyx:project-loaded', function () { window.setTimeout(function () { install(studio()); }, 80); });
    window.addEventListener('ovyx:project-activated', function () { window.setTimeout(function () { install(studio()); }, 80); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.OVYXVisualEditor = { version: '1.0.0', applyStyle: writeStyle, applyAttribute: writeAttribute, applyText: writeText, move: moveNode, refresh: renderInspector };
})();