(function () {
  'use strict';
  if (window.__OVYX_WS_PROJECT_EXPORT_V1__) return;
  window.__OVYX_WS_PROJECT_EXPORT_V1__ = true;

  var BUTTON_ATTR = 'data-ovyx-project-export';
  var MAX_FILES = 800;
  var MAX_FILE_BYTES = 8 * 1024 * 1024;
  var MAX_TOTAL_BYTES = 80 * 1024 * 1024;
  var CRC_TABLE = null;

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 180);
  }
  function asText(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return null;
    var keys = ['content', 'text', 'source', 'code'];
    for (var i = 0; i < keys.length; i += 1) if (typeof value[keys[i]] === 'string') return value[keys[i]];
    return null;
  }
  function getStudio() {
    return window.WebStudio && typeof window.WebStudio === 'object' ? window.WebStudio : null;
  }
  function getGraph(studio) {
    try { if (typeof studio.ensureProjectGraph === 'function') studio.ensureProjectGraph(); } catch (_) {}
    var graph = studio && studio.graph || window.KernelState && window.KernelState.activeProject && window.KernelState.activeProject.ovyxGraph;
    return graph && graph.files && typeof graph.files === 'object' ? graph : null;
  }
  function getProject(studio) {
    return window.KernelState && window.KernelState.activeProject || studio && studio.project || {};
  }
  function slug(value) {
    var text = clean(value, 100);
    if (typeof text.normalize === 'function') text = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ovyx-website';
  }
  function safePath(raw) {
    if (typeof raw !== 'string') return null;
    var path = raw.trim().replace(/\\/g, '/');
    if (!path || path.charAt(0) === '/' || /^[a-z]:/i.test(path) || /[\u0000-\u001f\u007f]/.test(path)) return null;
    path = path.replace(/^\.\//, '');
    var parts = path.split('/');
    if (parts.some(function (part) { return !part || part === '.' || part === '..'; })) return null;
    if (parts.some(function (part) { return part === '__proto__' || part === 'constructor' || part === 'prototype'; })) return null;
    return path;
  }
  function isSensitivePath(path) {
    var base = path.split('/').pop().toLowerCase();
    if (base === '.env' || /^\.env\.(?!example$|sample$|template$|dist$)/i.test(base)) return true;
    if (/^(?:\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519|id_ecdsa|credentials\.json|service-account(?:-[^/]*)?\.json|secrets?(?:\.[^/]*)?)$/i.test(base)) return true;
    if (/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(base)) return true;
    return false;
  }
  function containsLikelySecret(source) {
    var text = String(source || '');
    return /\b(?:sk_live_[A-Za-z0-9]{16,}|sk_test_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|AIzaSy[A-Za-z0-9_-]{30,})\b/.test(text) ||
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(text);
  }
  function utf8(value) { return new TextEncoder().encode(String(value)); }
  function getCrcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
  }
  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    var table = getCrcTable();
    for (var i = 0; i < bytes.length; i += 1) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function put16(view, offset, value) { view.setUint16(offset, value, true); }
  function put32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }
  function zipDate(date) {
    var year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }
  function buildZip(files) {
    var encoder = new TextEncoder();
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    var stamp = zipDate(new Date());
    files.forEach(function (file) {
      var name = encoder.encode(file.path);
      var data = file.bytes;
      if (name.length > 65535 || data.length > 0xFFFFFFFF) throw new Error('A project path or file is too large for ZIP export.');
      var crc = crc32(data);
      var localBuffer = new ArrayBuffer(30 + name.length);
      var localView = new DataView(localBuffer);
      put32(localView, 0, 0x04034B50);
      put16(localView, 4, 20);
      put16(localView, 6, 0x0800);
      put16(localView, 8, 0);
      put16(localView, 10, stamp.time);
      put16(localView, 12, stamp.date);
      put32(localView, 14, crc);
      put32(localView, 18, data.length);
      put32(localView, 22, data.length);
      put16(localView, 26, name.length);
      put16(localView, 28, 0);
      new Uint8Array(localBuffer, 30).set(name);
      localParts.push(new Uint8Array(localBuffer), data);
      var centralBuffer = new ArrayBuffer(46 + name.length);
      var centralView = new DataView(centralBuffer);
      put32(centralView, 0, 0x02014B50);
      put16(centralView, 4, 0x0314);
      put16(centralView, 6, 20);
      put16(centralView, 8, 0x0800);
      put16(centralView, 10, 0);
      put16(centralView, 12, stamp.time);
      put16(centralView, 14, stamp.date);
      put32(centralView, 16, crc);
      put32(centralView, 20, data.length);
      put32(centralView, 24, data.length);
      put16(centralView, 28, name.length);
      put16(centralView, 30, 0);
      put16(centralView, 32, 0);
      put16(centralView, 34, 0);
      put16(centralView, 36, 0);
      put32(centralView, 38, 0);
      put32(centralView, 42, offset);
      new Uint8Array(centralBuffer, 46).set(name);
      centralParts.push(new Uint8Array(centralBuffer));
      offset += 30 + name.length + data.length;
    });
    var centralSize = centralParts.reduce(function (total, part) { return total + part.length; }, 0);
    var endBuffer = new ArrayBuffer(22);
    var end = new DataView(endBuffer);
    put32(end, 0, 0x06054B50);
    put16(end, 4, 0);
    put16(end, 6, 0);
    put16(end, 8, files.length);
    put16(end, 10, files.length);
    put32(end, 12, centralSize);
    put32(end, 16, offset);
    put16(end, 20, 0);
    return new Blob(localParts.concat(centralParts, [new Uint8Array(endBuffer)]), { type: 'application/zip' });
  }
  function readExportFiles(graph, project) {
    var output = [];
    var excluded = [];
    var total = 0;
    var entries = Object.entries(graph.files || {}).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
    entries.forEach(function (entry) {
      if (output.length >= MAX_FILES) { excluded.push({ path: entry[0], reason: 'project file-count limit' }); return; }
      var path = safePath(entry[0]);
      var text = asText(entry[1]);
      if (!path || text === null) { excluded.push({ path: clean(entry[0], 180), reason: 'invalid path or non-text file' }); return; }
      if (isSensitivePath(path)) { excluded.push({ path: path, reason: 'secret or credential file' }); return; }
      if (containsLikelySecret(text)) { excluded.push({ path: path, reason: 'possible embedded credential' }); return; }
      var bytes = utf8(text);
      if (bytes.byteLength > MAX_FILE_BYTES) { excluded.push({ path: path, reason: 'file exceeds export size limit' }); return; }
      if (total + bytes.byteLength > MAX_TOTAL_BYTES) { excluded.push({ path: path, reason: 'project export size limit' }); return; }
      output.push({ path: path, bytes: bytes });
      total += bytes.byteLength;
    });
    var slugName = slug(project && (project.name || project.title || project.slug));
    var hasSetup = output.some(function (file) { return /(^|\/)FULL_STACK_SETUP\.md$/i.test(file.path); });
    var backendPaths = output.map(function (file) { return file.path; }).filter(function (path) {
      return /(^|\/)(?:api|functions|server|backend|migrations|prisma|drizzle)(?:\/|$)/i.test(path) || /(^|\/)(?:schema\.sql|schema\.prisma)$/i.test(path);
    });
    var envExample = output.some(function (file) { return /(^|\/)\.env\.(?:example|sample|template|dist)$/i.test(file.path); });
    var readme = [
      '# OVYX website project export',
      '',
      'This archive contains the text-based project files that were saved in OVYX Web Studio at export time. Keep the directory structure intact.',
      '',
      '## What is included',
      '- The current website source files and assets that are stored in the Web Studio project graph.',
      '- Backend/API routes, data models, migrations, tests, and configuration files if they were generated and saved in the project.',
      '- FULL_STACK_SETUP.md if the full-stack upgrade created it.',
      '',
      '## Put this project in your GitHub repository',
      '1. Extract this ZIP on your computer.',
      '2. Create or open the GitHub repository for this website.',
      '3. Upload the extracted project contents into the repository root, preserving every folder. Do not upload only the HTML page if the project also contains API/server files.',
      '4. Commit and push the files to GitHub, then connect that repository to a hosting provider that supports the detected framework and backend runtime.',
      '5. Set required environment variables in the hosting provider settings. Keep real .env files, API keys, private keys, and passwords out of GitHub.',
      '',
      '## Run and deploy it',
      hasSetup ? '- Read FULL_STACK_SETUP.md first. It contains the project-specific backend and connection handoff.' : '- Read the project README and inspect package.json, framework configuration and deployment files for the correct commands.',
      envExample ? '- Copy .env.example to a local .env only when the setup guide directs you to, then replace placeholders privately. Do not commit the real .env file.' : '- Add environment variables only when required by the generated code and setup instructions. No real credentials are included in this export.',
      backendPaths.length ? '- Backend-related source paths detected in this export: ' + backendPaths.slice(0, 30).join(', ') + (backendPaths.length > 30 ? ', …' : '') + '.' : '- No conventional backend directory was detected from file paths. Confirm the intended hosting/runtime before deployment.',
      '- Apply any database migrations documented by the project before using persistent production data.',
      '- After configuring the services, run the project tests and verify the key workflows against the deployed runtime.',
      '',
      '## Important limits',
      '- Downloading this ZIP does not publish the website, create a GitHub repository, provision a database, or connect external services automatically.',
      '- Generated source code is not proof of a live connection. Configure and test authentication, database, email, payments, storage or other providers required by this project.',
      '- Credential files and files containing recognizable high-risk secret patterns are deliberately omitted. Check the export notice and recreate needed secrets in your hosting provider secret settings.',
      '- This archive includes text-based files stored in the current Web Studio project graph. Binary files or assets not stored in that graph are not reconstructed by this exporter.',
      '',
      'Exported from OVYX Web Studio on ' + new Date().toISOString() + '.',
      ''
    ].join('\n');
    var manifest = {
      schemaVersion: 1,
      project: clean(project && (project.name || project.title || project.slug) || 'OVYX website', 160),
      exportedAt: new Date().toISOString(),
      source: 'OVYX Web Studio current project graph',
      fileCount: output.length + 2 + (excluded.length ? 1 : 0),
      backendPathsDetected: backendPaths.slice(0, 100),
      setupGuideIncluded: hasSetup,
      environmentExampleIncluded: envExample,
      credentialsIntentionallyExcluded: true
    };
    output.push({ path: 'README_OVYX_EXPORT.md', bytes: utf8(readme) });
    output.push({ path: 'OVYX_EXPORT_MANIFEST.json', bytes: utf8(JSON.stringify(manifest, null, 2) + '\n') });
    if (excluded.length) {
      var exclusionReport = [
        '# Files omitted from this export',
        '',
        'The following current-project files were not added to the ZIP. Some were omitted to avoid leaking credentials; others exceeded safety or size limits.',
        '',
        '| Path | Reason |',
        '| --- | --- |',
        ...excluded.map(function (item) { return '| ' + String(item.path || 'unknown').replace(/[|\\n\\r]/g, ' ') + ' | ' + String(item.reason || 'not exported').replace(/[|\\n\\r]/g, ' ') + ' |'; }),
        '',
        'If an omitted file is needed, recreate it locally or in your hosting provider's secret settings. Do not commit passwords, private keys, or real environment files to GitHub.',
        ''
      ].join('\\n');
      output.push({ path: 'OVYX_EXPORT_EXCLUSIONS.md', bytes: utf8(exclusionReport) });
    }
    return { files: output, excluded: excluded, slug: slugName };
  }
  function showMessage(message, kind) {
    try {
      if (typeof window.showToast === 'function') window.showToast(clean(message, 420), kind || 'info');
      else if (typeof window.toast === 'function') window.toast(clean(message, 420), kind || 'info');
    } catch (_) {}
  }
  function exportProject() {
    var studio = getStudio();
    var graph = studio && getGraph(studio);
    if (!graph || !Object.keys(graph.files || {}).length) {
      showMessage('No saved website files were found. Build or open a website first.', 'warning');
      return;
    }
    try {
      var project = getProject(studio);
      var data = readExportFiles(graph, project);
      if (!data.files.length) throw new Error('No safe text files were available to export.');
      var blob = buildZip(data.files);
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = data.slug + '-source-' + new Date().toISOString().slice(0, 10) + '.zip';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      if (data.excluded.length) {
        showMessage('Project ZIP downloaded with ' + data.files.length + ' files. ' + data.excluded.length + ' file(s) were excluded for safety or size; review README_OVYX_EXPORT.md and the export notice.', 'warning');
      } else {
        showMessage('Project ZIP downloaded with ' + data.files.length + ' files. Backend/API files are included when saved in this project.', 'success');
      }
    } catch (error) {
      showMessage('Could not export project ZIP: ' + clean(error && error.message || 'unknown export error', 220), 'error');
    }
  }
  function ensureButton() {
    var view = document.getElementById('view-webstudio');
    if (!view) return;
    Array.prototype.forEach.call(view.querySelectorAll('.ovyx-ws-header-actions'), function (host) {
      if (host.querySelector('[' + BUTTON_ATTR + ']')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ovyx-ws-header-button ovyx-ws-project-export-trigger';
      button.setAttribute(BUTTON_ATTR, '1');
      button.setAttribute('aria-label', 'Download all saved website source and backend files as a ZIP');
      button.title = 'Download the current website project, including generated backend files';
      var icon = document.createElement('i');
      icon.className = 'fa-solid fa-file-arrow-down';
      icon.setAttribute('aria-hidden', 'true');
      button.appendChild(icon);
      var label = document.createElement('span');
      label.textContent = 'Download code';
      button.appendChild(label);
      button.addEventListener('click', function (event) {
        event.preventDefault();
        exportProject();
      });
      var fullstack = host.querySelector('[data-ovyx-fullstack-upgrade]');
      var preview = host.querySelector('#ws-preview-trigger');
      if (fullstack && fullstack.parentNode === host) host.insertBefore(button, fullstack.nextSibling);
      else if (preview) host.insertBefore(button, preview);
      else host.appendChild(button);
    });
  }
  function boot() {
    ensureButton();
    var attempts = 0;
    if (!document.querySelector('#view-webstudio [' + BUTTON_ATTR + ']')) {
      var timer = window.setInterval(function () {
        ensureButton();
        attempts += 1;
        if (document.querySelector('#view-webstudio [' + BUTTON_ATTR + ']') || attempts >= 80) window.clearInterval(timer);
      }, 200);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', boot);
  window.addEventListener('firebase-auth-state-ready', boot);
  window.addEventListener('ovyx:webstudio-initial-site-built', function () { window.setTimeout(boot, 0); });
  window.OVYXWebStudioProjectExport = { export: exportProject, version: '1.0.0' };
})();