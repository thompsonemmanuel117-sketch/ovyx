(function () {
  'use strict';
  if (window.__OVYX_WS_PROJECT_EXPORT_V2__) return;
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
  function isBackendImplementationPath(rawPath) {
    var path = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (/^(?:api|functions|server|backend|migrations|prisma|drizzle|convex|database|db)(?:\/|$)/i.test(path)) return true;
    if (/(^|\/)(?:server|backend|migrations|prisma|drizzle|convex|database|db)(?:\/|$)/i.test(path)) return true;
    if (/(^|\/)(?:app|pages)\/api(?:\/|$)/i.test(path)) return true;
    if (/^(?:packages|apps|services)\/api(?:\/|$)/i.test(path)) return true;
    if (/^supabase\/functions(?:\/|$)/i.test(path)) return true;
    if (/(^|\/)(?:schema\.sql|schema\.prisma)$/i.test(path)) return true;
    if (/^(?:server|api|backend)\.(?:js|cjs|mjs|ts|cts|mts|py|go|rb|php)$/i.test(path)) return true;
    if (/^(?:app|main|manage|wsgi|asgi)\.(?:py|go|rb|php)$/i.test(path)) return true;
    if (/^(?:tests?|__tests__)\/.*(?:api|server|backend|database|migration|auth)/i.test(path)) return true;
    return false;
  }
  function isBackendSupportPath(rawPath) {
    var path = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    var base = path.split('/').pop() || '';
    if (isSensitivePath(path) || /(^|\/)FULL_STACK_SETUP\.md$/i.test(path)) return true;
    if (path.indexOf('/') !== -1) return false;
    return /^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock(?:b)?|wrangler\.(?:toml|jsonc?)|vercel\.json|render\.yaml|fly\.toml|railway\.(?:json|toml)|Dockerfile|docker-compose\.(?:yml|yaml)|compose\.(?:yml|yaml)|requirements\.txt|pyproject\.toml|Pipfile(?:\.lock)?|go\.(?:mod|sum)|Cargo\.(?:toml|lock)|tsconfig\.json|\.node-version|\.nvmrc|\.env\.(?:example|sample|template|dist))$/i.test(base);
  }
  function isLikelyFrontendSourcePath(path) {
    return /\.(?:html?|css|scss|sass|less|jsx?|tsx?|vue|svelte|astro)$/i.test(String(path || '')) && !isBackendImplementationPath(path) && !/(^|\/)FULL_STACK_SETUP\.md$/i.test(String(path || ''));
  }
  function readExportFiles(graph, project, options) {
    var mode = options && options.mode || 'complete';
    var backendOnly = mode === 'backend-only';
    var websiteOnly = mode === 'website-only';
    var output = [];
    var excluded = [];
    var frontendExcludedCount = 0;
    var backendExcludedCount = 0;
    var total = 0;
    var entries = Object.entries(graph.files || {}).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
    entries.forEach(function (entry) {
      var path = safePath(entry[0]);
      if (path && backendOnly && !isBackendImplementationPath(path) && !isBackendSupportPath(path)) {
        frontendExcludedCount += 1;
        return;
      }
      if (path && websiteOnly && (isBackendImplementationPath(path) || /(^|\/)FULL_STACK_SETUP\.md$/i.test(path) || /^OVYX_BACKEND_EXPORT_/i.test(path) || /^README_OVYX_BACKEND_EXPORT\.md$/i.test(path))) {
        backendExcludedCount += 1;
        return;
      }
      if (output.length >= MAX_FILES) { excluded.push({ path: entry[0], reason: 'project file-count limit' }); return; }
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
    var backendPaths = output.map(function (file) { return file.path; }).filter(isBackendImplementationPath);
    var frontendPaths = output.map(function (file) { return file.path; }).filter(isLikelyFrontendSourcePath);
    if (backendOnly && !backendPaths.length) {
      throw new Error('No separate backend source files were detected. This project may keep server routes together with the frontend, or may not have been upgraded to full-stack yet. Use the complete project download instead.');
    }
    if (websiteOnly && !frontendPaths.length) {
      throw new Error('No recognizable website source files were detected for a website-only download. Use the complete project download instead.');
    }
    var hasSetup = output.some(function (file) { return /(^|\/)FULL_STACK_SETUP\.md$/i.test(file.path); });
    var envExample = output.some(function (file) { return /(^|\/)\.env\.(?:example|sample|template|dist)$/i.test(file.path); });
    var timestamp = new Date().toISOString();
    var readmeName = backendOnly ? 'README_OVYX_BACKEND_EXPORT.md' : websiteOnly ? 'README_OVYX_WEBSITE_EXPORT.md' : 'README_OVYX_EXPORT.md';
    var manifestName = backendOnly ? 'OVYX_BACKEND_EXPORT_MANIFEST.json' : websiteOnly ? 'OVYX_WEBSITE_EXPORT_MANIFEST.json' : 'OVYX_EXPORT_MANIFEST.json';
    var exclusionName = backendOnly ? 'OVYX_BACKEND_EXPORT_EXCLUSIONS.md' : websiteOnly ? 'OVYX_WEBSITE_EXPORT_EXCLUSIONS.md' : 'OVYX_EXPORT_EXCLUSIONS.md';
    var readme;
    if (backendOnly) {
      readme = [
        '# OVYX backend-only export',
        '',
        'This advanced archive contains recognized backend/server source paths and closely related shared runtime/configuration files saved in the current OVYX Web Studio project graph.',
        '',
        '## Included',
        '- Backend/API handlers, server modules, database schemas/migrations, and related files stored under recognizable backend paths.',
        '- Root-level runtime manifests and deployment configuration where detected (for example package.json, lockfiles, or a hosting configuration). Some dependencies may be shared by frontend and backend; inspect them before installing or deploying.',
        '- FULL_STACK_SETUP.md when it exists, plus this README and a machine-readable manifest.',
        '',
        '## Deploy separately',
        '1. Extract this ZIP and preserve the folder structure.',
        '2. Put these files in a separate backend repository or in the backend folder of an existing repository.',
        '3. Connect the repository/folder to a hosting provider that supports the framework and server runtime used by the source.',
        '4. Set required environment variables and credentials in the hosting provider secret settings. Never commit a real .env file, API key, password, or private key.',
        '5. Configure database access and apply documented migrations before using production data.',
        '6. Deploy the frontend separately and configure its API/base URL to point to this backend. For cross-origin browser requests, configure only the trusted origins that should reach the API.',
        '7. Test authentication, authorization, data access, validation, error states, and key workflows against the deployed services.',
        '',
        '## Before deploying',
        hasSetup ? '- Read FULL_STACK_SETUP.md for project-specific setup and connection notes.' : '- Inspect the server entry point, package scripts, runtime config, and database notes to determine the correct build/start commands.',
        envExample ? '- Use .env.example only to learn variable names and placeholder format. Add real credentials in private local/provider settings.' : '- Add only the environment variables required by the code and provider. No real credentials are included.',
        '- Backend source paths selected: ' + backendPaths.slice(0, 40).join(', ') + (backendPaths.length > 40 ? ', …' : '') + '.',
        '',
        '## Important limits',
        '- Frontend pages, styles, and client-only source files are intentionally excluded. This is not a complete website download.',
        '- Some frameworks colocate server routes with frontend source and require additional framework files to build or deploy. When the framework/setup guide indicates that, use the complete project ZIP instead.',
        '- This export does not create a repository, provision a database, connect live services, or deploy anything automatically.',
        '- Only text-based files saved in the project graph are exported. Binary assets not stored in that graph are not reconstructed.',
        '- Recognizable credential files/secrets are omitted. Review the backend exclusion report if present and recreate required secrets in secure provider settings.',
        '',
        'Exported from OVYX Web Studio on ' + timestamp + '.',
        ''
      ].join('\n');
    } else if (websiteOnly) {
      readme = [
        '# OVYX website-only export',
        '',
        'This advanced archive contains recognizable frontend/browser source files saved in the current OVYX Web Studio project graph. Backend/server implementation files and the full-stack backend setup guide are intentionally excluded.',
        '',
        '## Included',
        '- Frontend pages, browser-side JavaScript/TypeScript, styles, and other text-based site source saved in the project graph.',
        '- Shared root-level project configuration/manifests may be included when needed to build or run the frontend; inspect them before deploying.',
        '',
        '## Deploy the website',
        '1. Extract this ZIP and preserve all file paths.',
        '2. Upload the files to a website repository or connect the repository to a static/frontend hosting provider that supports the project framework.',
        '3. Check package scripts and frontend build configuration, and set any required public frontend configuration values in the host.',
        '4. If this frontend needs a separately hosted API, configure the frontend API/base URL to that backend. This archive does not include the backend implementation.',
        '5. Run the available build/tests and verify the deployed pages, links, forms, and browser workflows.',
        '',
        '## Important limits',
        '- Backend handlers, migrations, server schemas, and FULL_STACK_SETUP.md are excluded by design. Use the backend-only option for recognized separated backend source, or the complete project ZIP for a combined deployment.',
        '- This export does not deploy the site, provision a backend, or connect third-party services.',
        '- Only text-based files saved in the current project graph are exported. Binary assets not stored in that graph are not reconstructed.',
        '- Credential files and files with recognizable high-risk embedded secret patterns are omitted. Review the exclusion report if present.',
        '',
        'Exported from OVYX Web Studio on ' + timestamp + '.',
        ''
      ].join('\n');
    } else {
      readme = [
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
        'Exported from OVYX Web Studio on ' + timestamp + '.',
        ''
      ].join('\n');
    }
    var manifest = {
      schemaVersion: 1,
      exportMode: mode,
      project: clean(project && (project.name || project.title || project.slug) || 'OVYX website', 160),
      exportedAt: timestamp,
      source: 'OVYX Web Studio current project graph',
      fileCount: output.length + 2 + (excluded.length ? 1 : 0),
      backendPathsDetected: backendPaths.slice(0, 100),
      frontendPathsDetected: frontendPaths.slice(0, 100),
      frontendFilesExcludedByDesign: backendOnly ? frontendExcludedCount : 0,
      backendFilesExcludedByDesign: websiteOnly ? backendExcludedCount : 0,
      setupGuideIncluded: hasSetup,
      environmentExampleIncluded: envExample,
      credentialsIntentionallyExcluded: true
    };
    output.push({ path: readmeName, bytes: utf8(readme) });
    output.push({ path: manifestName, bytes: utf8(JSON.stringify(manifest, null, 2) + '\n') });
    if (excluded.length) {
      var exclusionReport = [
        backendOnly ? '# Sensitive or unsupported backend files omitted' : websiteOnly ? '# Files omitted from website-only export' : '# Files omitted from this export',
        '',
        backendOnly ? 'These selected backend/configuration files were not added to the ZIP because they contain credentials or exceed safety/size limits.' : websiteOnly ? 'These selected website files were not added because they contain credentials or exceed safety/size limits.' : 'The following current-project files were not added to the ZIP. Some were omitted to avoid leaking credentials; others exceeded safety or size limits.',
        '',
        '| Path | Reason |',
        '| --- | --- |',
        ...excluded.map(function (item) { return '| ' + String(item.path || 'unknown').replace(/\|/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ') + ' | ' + String(item.reason || 'not exported').replace(/\|/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ') + ' |'; }),
        '',
        'If an omitted file is needed, recreate it locally or in your hosting provider’s secret settings. Do not commit passwords, private keys, or real environment files to GitHub.',
        ''
      ].join('\n');
      output.push({ path: exclusionName, bytes: utf8(exclusionReport) });
    }
    return { files: output, excluded: excluded, slug: slugName, mode: mode, backendExcludedCount: backendExcludedCount, frontendExcludedCount: frontendExcludedCount };
  }
  function showMessage(message, kind) {
    try {
      if (typeof window.showToast === 'function') window.showToast(clean(message, 420), kind || 'info');
      else if (typeof window.toast === 'function') window.toast(clean(message, 420), kind || 'info');
    } catch (_) {}
  }
  function exportProject(options) {
    var mode = options && options.mode || 'complete';
    var backendOnly = mode === 'backend-only';
    var websiteOnly = mode === 'website-only';
    var studio = getStudio();
    var graph = studio && getGraph(studio);
    if (!graph || !Object.keys(graph.files || {}).length) {
      showMessage('No saved website files were found. Build or open a website first.', 'warning');
      return;
    }
    try {
      var project = getProject(studio);
      var data = readExportFiles(graph, project, { mode: mode });
      if (!data.files.length) throw new Error('No safe text files were available to export.');
      var blob = buildZip(data.files);
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = data.slug + (backendOnly ? '-backend-only-' : websiteOnly ? '-website-only-' : '-source-') + new Date().toISOString().slice(0, 10) + '.zip';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      if (backendOnly) {
        var backendMessage = 'Backend-only ZIP downloaded with ' + data.files.length + ' files. Frontend source files were excluded by design.';
        if (data.excluded.length) backendMessage += ' ' + data.excluded.length + ' backend/config file(s) were excluded for safety or size; review README_OVYX_BACKEND_EXPORT.md and the export notice.';
        showMessage(backendMessage, data.excluded.length ? 'warning' : 'success');
      } else if (websiteOnly) {
        var websiteMessage = 'Website-only ZIP downloaded with ' + data.files.length + ' files. Backend/server source was excluded by design.';
        if (data.excluded.length) websiteMessage += ' ' + data.excluded.length + ' website file(s) were excluded for safety or size; review README_OVYX_WEBSITE_EXPORT.md and the export notice.';
        showMessage(websiteMessage, data.excluded.length ? 'warning' : 'success');
      } else if (data.excluded.length) {
        showMessage('Project ZIP downloaded with ' + data.files.length + ' files. ' + data.excluded.length + ' file(s) were excluded for safety or size; review README_OVYX_EXPORT.md and the export notice.', 'warning');
      } else {
        showMessage('Project ZIP downloaded with ' + data.files.length + ' files. Backend/API files are included when saved in this project.', 'success');
      }
    } catch (error) {
      showMessage((backendOnly ? 'Could not export backend-only ZIP: ' : websiteOnly ? 'Could not export website-only ZIP: ' : 'Could not export project ZIP: ') + clean(error && error.message || 'unknown export error', 300), 'error');
    }
  }
  function ensureCodeControlsStyles() {
    if (document.getElementById('ovyx-code-export-controls-styles')) return;
    var style = document.createElement('style');
    style.id = 'ovyx-code-export-controls-styles';
    style.textContent = [
      '.ovyx-code-download-group{position:relative;display:inline-flex;align-items:stretch;gap:0;vertical-align:middle;flex-shrink:0}',
      '.ovyx-code-download-group>[data-ovyx-project-export]{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border-top-right-radius:0!important;border-bottom-right-radius:0!important;border-top-left-radius:7px!important;border-bottom-left-radius:7px!important}',
      '.ovyx-code-download-menu-trigger{display:inline-flex;align-items:center;justify-content:center;min-width:31px;padding:0 9px!important;margin-left:-1px;border:1px solid rgba(255,255,255,.12)!important;border-top-left-radius:0!important;border-bottom-left-radius:0!important;border-top-right-radius:7px!important;border-bottom-right-radius:7px!important;background:#15191e!important;color:#d5dbe2!important;cursor:pointer;font:800 8px Inter,sans-serif!important}',
      '.ovyx-code-download-menu-trigger:hover{border-color:rgba(245,158,11,.4)!important;color:#fbbf24!important}',
      '.ovyx-code-download-menu-trigger:focus-visible,.ovyx-code-download-menu-item:focus-visible,.ovyx-code-verify-trigger:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}',
      '.ovyx-code-download-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:12000;width:310px;max-width:calc(100vw - 24px);max-height:min(65vh,440px);overflow:auto;padding:11px;background:#0b0d10;color:#f8fafc;border:1px solid rgba(255,255,255,.12);border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.52)}',
      '.ovyx-code-download-menu[hidden]{display:none!important}',
      '.ovyx-code-download-menu-heading{display:block;margin:3px 8px 8px;color:#8f9aa7;font:800 8px/1.4 JetBrains Mono,monospace;letter-spacing:.09em;text-transform:uppercase}',
      '.ovyx-code-download-menu-item{display:flex;width:100%;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 10px;text-align:left;border:1px solid transparent;border-radius:8px;background:transparent;color:#f8fafc;cursor:pointer;font:inherit}',
      '.ovyx-code-download-menu-item:hover{background:rgba(255,255,255,.045);border-color:rgba(245,158,11,.22)}',
      '.ovyx-code-download-menu-item strong{font:800 10px/1.4 Inter,sans-serif}',
      '.ovyx-code-download-menu-item span{font:500 10px/1.5 Inter,sans-serif;color:#9aa4b1;white-space:normal}',
      '.ovyx-code-download-menu-note{display:block;margin:8px 8px 2px;color:#818b98;font:500 9px/1.5 Inter,sans-serif}',
      '.ovyx-code-verify-trigger{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;padding:7px 9px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:7px;background:#111519!important;color:#dbe2ea!important;font:800 8px Inter,sans-serif!important;cursor:pointer;flex-shrink:0}',
      '.ovyx-code-verify-trigger:hover{border-color:rgba(245,158,11,.35)!important;color:#f9d58a!important}',
      '.ovyx-code-verify-trigger:disabled{opacity:.65;cursor:progress}',
      '.ovyx-code-verify-status{font:800 7px JetBrains Mono,monospace;color:#87919d}',
      '.ovyx-code-verify-trigger[data-quality-status="pass"] .ovyx-code-verify-status{color:#6ee7b7}',
      '.ovyx-code-verify-trigger[data-quality-status="warn"] .ovyx-code-verify-status{color:#fbbf24}',
      '.ovyx-code-verify-trigger[data-quality-status="fail"] .ovyx-code-verify-status{color:#fca5a5}',
      '.ovyx-code-verify-trigger[data-quality-status="running"] .ovyx-code-verify-status{color:#93c5fd}',
      '@media(max-width:520px){.ovyx-code-verify-status{display:none!important}.ovyx-code-download-menu{width:min(310px,calc(100vw - 24px))}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }
  function reportCounts(report) {
    var checks = report && Array.isArray(report.checks) ? report.checks : [];
    return checks.reduce(function (result, check) {
      if (check && check.status === 'fail') result.fail += 1;
      else if (check && check.status === 'warn') result.warn += 1;
      else if (check && check.status === 'pass') result.pass += 1;
      else result.info += 1;
      return result;
    }, { pass: 0, warn: 0, fail: 0, info: 0 });
  }
  function setVerificationState(button, report) {
    if (!button) return;
    var label = button.querySelector('[data-ovyx-code-verify-label]');
    var state = button.querySelector('[data-ovyx-code-verify-status]');
    var counts = report && report.counts || reportCounts(report);
    var status = String(report && report.status || '').toLowerCase();
    if (status !== 'fail' && status !== 'warn' && status !== 'pass') status = counts.fail ? 'fail' : counts.warn ? 'warn' : 'pass';
    if (label) label.textContent = 'Verify build';
    if (state) state.textContent = status === 'fail' ? 'BLOCKERS' : status === 'warn' ? 'WARNINGS' : 'PASS';
    button.setAttribute('data-quality-status', status);
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
    var statusText = status === 'fail' ? 'Blockers found' : status === 'warn' ? 'Passed with warnings' : 'Passed within tested scope';
    button.title = statusText + ': ' + counts.pass + ' passed, ' + counts.warn + ' warnings, ' + counts.fail + ' failed. Click to run the checks again. This does not certify live integrations or production deployment.';
  }
  function setVerificationRunning(button) {
    if (!button) return;
    var state = button.querySelector('[data-ovyx-code-verify-status]');
    button.disabled = true;
    button.setAttribute('data-quality-status', 'running');
    button.setAttribute('aria-busy', 'true');
    if (state) state.textContent = 'CHECKING';
    button.title = 'Running source, responsive, accessibility and safe-interaction checks…';
  }
  function openQualityPanel() {
    var qualityApi = window.OVYXWebStudioQuality;
    if (qualityApi && typeof qualityApi.open === 'function') {
      try { return qualityApi.open() !== false; } catch (_) {}
    }
    var qualityRoot = document.getElementById('ovyx-ws-quality-root');
    if (!qualityRoot) return false;
    var overlay = qualityRoot.querySelector('[data-quality-overlay]');
    var trigger = document.querySelector('#view-webstudio [data-ovyx-quality-trigger]');
    if (trigger && !trigger.hidden) trigger.click();
    else if (overlay) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
    }
    return true;
  }
  function runProjectQuality(button) {
    if (!button || button.disabled) return;
    var qualityApi = window.OVYXWebStudioQuality;
    if (!qualityApi || typeof qualityApi.run !== 'function') {
      showMessage('The quality inspector is not ready yet. Reopen the Code area and try again.', 'warning');
      return;
    }
    var qualityRoot = document.getElementById('ovyx-ws-quality-root');
    var qualityRunButton = qualityRoot && qualityRoot.querySelector('[data-quality-run]');
    if (qualityRunButton && qualityRunButton.disabled) return;
    setVerificationRunning(button);
    openQualityPanel();
    if (qualityRunButton) qualityRunButton.disabled = true;
    Promise.resolve().then(function () { return qualityApi.run(); })
      .then(function (report) {
        if (report) setVerificationState(button, report);
        var counts = report && report.counts || reportCounts(report);
        var status = String(report && report.status || (counts.fail ? 'fail' : counts.warn ? 'warn' : 'pass')).toLowerCase();
        var detail = 'Quality review finished: ' + counts.pass + ' passed, ' + counts.warn + ' warnings, ' + counts.fail + ' failed. Live integrations and production hosting need separate verification.';
        showMessage(detail, status === 'fail' ? 'error' : status === 'warn' ? 'warning' : 'success');
      })
      .catch(function (error) {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        button.setAttribute('data-quality-status', 'fail');
        var state = button.querySelector('[data-ovyx-code-verify-status]');
        if (state) state.textContent = 'ERROR';
        button.title = 'Quality inspection did not complete. Review the quality panel and retry.';
        showMessage('Quality inspection could not complete: ' + clean(error && error.message || 'unknown inspection error', 240), 'error');
      })
      .finally(function () { if (qualityRunButton) qualityRunButton.disabled = false; });
  }
  function addMenuOption(menu, toggle, attr, titleText, descriptionText, handler) {
    var option = document.createElement('button');
    option.type = 'button';
    option.className = 'ovyx-code-download-menu-item';
    option.setAttribute('role', 'menuitem');
    option.setAttribute(attr, '1');
    var title = document.createElement('strong');
    title.textContent = titleText;
    option.appendChild(title);
    var description = document.createElement('span');
    description.textContent = descriptionText;
    option.appendChild(description);
    option.addEventListener('click', function (event) {
      event.preventDefault();
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      handler();
    });
    menu.appendChild(option);
    return option;
  }
  function mountVerificationButton(parent, beforeNode) {
    if (!parent || parent.querySelector('[data-ovyx-code-verify]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ovyx-code-verify-trigger';
    button.setAttribute('data-ovyx-code-verify', '1');
    button.setAttribute('aria-label', 'Verify this project build');
    button.setAttribute('data-quality-status', 'idle');
    var icon = document.createElement('i');
    icon.className = 'fa-solid fa-shield-halved';
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    var label = document.createElement('span');
    label.setAttribute('data-ovyx-code-verify-label', '1');
    label.textContent = 'Verify build';
    button.appendChild(label);
    var state = document.createElement('small');
    state.className = 'ovyx-code-verify-status';
    state.setAttribute('data-ovyx-code-verify-status', '1');
    state.textContent = 'NOT CHECKED';
    button.appendChild(state);
    button.title = 'Run source, responsive, accessibility and safe-interaction checks. Live integrations and production deployment are reported separately.';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      runProjectQuality(button);
    });
    parent.insertBefore(button, beforeNode || null);
    try {
      var currentProject = window.KernelState && window.KernelState.activeProject || {};
      var report = window.OVYXWebStudioQuality && window.OVYXWebStudioQuality.getReport && window.OVYXWebStudioQuality.getReport();
      if (report && report.finishedAt && (!report.projectId || !currentProject.id || String(report.projectId) === String(currentProject.id))) setVerificationState(button, report);
    } catch (_) {}
  }
  function mountCodeControls() {
    var download = document.getElementById('ovyx-code-download');
    if (!download || !download.parentNode) return;
    var existingGroup = download.closest('[data-ovyx-project-export-group]');
    if (existingGroup) {
      if (!existingGroup.querySelector('[data-ovyx-code-verify]')) mountVerificationButton(existingGroup.parentNode, existingGroup);
      return;
    }
    ensureCodeControlsStyles();
    var parent = download.parentNode;
    var group = document.createElement('div');
    group.className = 'ovyx-code-download-group';
    group.setAttribute('data-ovyx-project-export-group', '1');
    group.setAttribute('data-ovyx-code-download-group', '1');
    parent.insertBefore(group, download);
    group.appendChild(download);
    download.setAttribute(BUTTON_ATTR, '1');
    download.classList.add('ovyx-code-download-trigger');
    download.setAttribute('aria-label', 'Download the complete website project, including frontend and backend, as a ZIP');
    download.title = 'Download the complete website project: frontend and backend together';
    download.textContent = 'Download code';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ovyx-code-download-menu-trigger';
    toggle.setAttribute('data-ovyx-project-export-menu-trigger', '1');
    toggle.setAttribute('aria-label', 'Advanced download options');
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.title = 'Advanced export options';
    var chevron = document.createElement('i');
    chevron.className = 'fa-solid fa-chevron-down';
    chevron.setAttribute('aria-hidden', 'true');
    toggle.appendChild(chevron);

    var menu = document.createElement('div');
    menu.className = 'ovyx-code-download-menu';
    menu.setAttribute('data-ovyx-project-export-menu', '1');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Advanced download options');
    menu.hidden = true;
    var heading = document.createElement('strong');
    heading.className = 'ovyx-code-download-menu-heading';
    heading.textContent = 'Advanced download options';
    menu.appendChild(heading);
    var websiteOption = addMenuOption(menu, toggle, 'data-ovyx-project-export-website-only', 'Website only (.zip)', 'Frontend pages, browser scripts and styles. Backend/server implementation files are left out.', function () { exportProject({ mode: 'website-only' }); });
    addMenuOption(menu, toggle, 'data-ovyx-project-export-backend-only', 'Backend only (.zip)', 'Advanced: API/server code, schemas, migrations and setup files. Frontend pages and styles are left out.', function () { exportProject({ mode: 'backend-only' }); });
    var note = document.createElement('span');
    note.className = 'ovyx-code-download-menu-note';
    note.textContent = 'Use Download code for one complete ZIP with the website and backend together.';
    menu.appendChild(note);

    toggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
      if (!menu.hidden) websiteOption.focus();
    });
    group.appendChild(toggle);
    group.appendChild(menu);
    mountVerificationButton(parent, group);
  }
  function installCodeEventHandlers() {
    if (window.__OVYX_WS_CODE_EXPORT_EVENTS_V2__) return;
    window.__OVYX_WS_CODE_EXPORT_EVENTS_V2__ = true;
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest && event.target.closest('#ovyx-code-download');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      exportProject();
    }, true);
    document.addEventListener('click', function (event) {
      document.querySelectorAll('[data-ovyx-project-export-group] [data-ovyx-project-export-menu]').forEach(function (menu) {
        var group = menu.closest('[data-ovyx-project-export-group]');
        var toggle = group && group.querySelector('[data-ovyx-project-export-menu-trigger]');
        if (group && !group.contains(event.target)) {
          menu.hidden = true;
          if (toggle) toggle.setAttribute('aria-expanded', 'false');
        }
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('[data-ovyx-project-export-group] [data-ovyx-project-export-menu]').forEach(function (menu) {
        if (menu.hidden) return;
        menu.hidden = true;
        var group = menu.closest('[data-ovyx-project-export-group]');
        var toggle = group && group.querySelector('[data-ovyx-project-export-menu-trigger]');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
        }
      });
    });
    window.addEventListener('ovyx:webstudio-quality-report', function (event) {
      var report = event && event.detail;
      var currentProject = window.KernelState && window.KernelState.activeProject || {};
      if (!report || (report.projectId && currentProject.id && String(report.projectId) !== String(currentProject.id))) return;
      document.querySelectorAll('[data-ovyx-code-verify]').forEach(function (button) { setVerificationState(button, report); });
    });
    window.addEventListener('ovyx:webstudio-build-stage', function (event) {
      var detail = event && event.detail || {};
      var status = detail.stage === 'build-verified' ? 'pass' : detail.stage === 'build-failed' ? 'fail' : '';
      if (!status) return;
      document.querySelectorAll('[data-ovyx-code-verify]').forEach(function (button) {
        button.setAttribute('data-quality-status', status);
        var state = button.querySelector('[data-ovyx-code-verify-status]');
        if (state) state.textContent = status === 'pass' ? 'PASS' : 'BLOCKERS';
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        button.title = String(detail.message || (status === 'pass' ? 'The automatic quality gate passed.' : 'The automatic quality gate rejected the build.')) + ' Live integrations and deployment still require separate verification.';
      });
    });
  }
  function boot() {
    installCodeEventHandlers();
    mountCodeControls();
    if (!window.__OVYX_WS_PROJECT_EXPORT_OBSERVER_V2__ && document.body && typeof MutationObserver === 'function') {
      window.__OVYX_WS_PROJECT_EXPORT_OBSERVER_V2__ = new MutationObserver(function () {
        var button = document.getElementById('ovyx-code-download');
        if (button && !button.closest('[data-ovyx-project-export-group]')) mountCodeControls();
      });
      window.__OVYX_WS_PROJECT_EXPORT_OBSERVER_V2__.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', boot);
  window.addEventListener('firebase-auth-state-ready', boot);
  window.addEventListener('ovyx:webstudio-initial-site-built', function () { window.setTimeout(boot, 0); });
  window.OVYXWebStudioProjectExport = { export: exportProject, version: '2.0.0', modes: ['complete', 'website-only', 'backend-only'] };
})();