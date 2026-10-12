/**
 * Authenticated tools for inspecting, diagnosing and carefully editing a user's
 * own OVYX website project. This route is separate from Web Studio generation.
 *
 * Writes only target an existing text source file in the owned project, require
 * an explicit confirmation flag and a fresh Firestore updateTime, and snapshot
 * the original file before changing it.
 */
import { authenticateRequest } from '../../_lib/firebase.js';
import {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  listFirestoreSubcollectionDocuments,
  setFirestoreDocumentAtPath,
} from '../../_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from '../../_lib/http.js';

const MAX_BODY_BYTES = 190_000;
const MAX_PATCH_BYTES = 80_000;
const MAX_PROJECT_FILE_BYTES = 900_000;
const MAX_BACKUP_SOURCE_BYTES = 300_000;
const MAX_MODEL_EDITABLE_SOURCE_BYTES = 4_000;
const MAX_PROJECT_DOCUMENT_BYTES = 850_000;
const SAFE_TEXT_EXTENSION = /\.(?:html?|css|mjs|cjs|js|jsx|ts|tsx|json|md|mdx|svg|xml|txt|vue|svelte|astro|yml|yaml|toml|php|py|sql|graphql|gql|webmanifest)$/i;
const SENSITIVE_PATH = /(?:^|\/)(?:\.env(?:\.[^/]*)?|secrets?|credentials?|id_rsa|id_ed25519|service-account[^/]*|private[-_]?key[^/]*)$/i;
const FILE_BUCKETS = [
  ['ovyxGraph', 'files'],
  ['files'],
  ['sourceFiles'],
  ['repository', 'files'],
  ['repo', 'files'],
  ['code', 'files'],
];

function clean(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(message, status = 400, code = 'WORKSPACE_TOOL_FAILED') {
  throw Object.assign(new Error(message), { status, code });
}

function userIdentity(user) {
  const uid = clean(user?.uid || user?.sub, 180);
  const email = clean(user?.email, 320).toLowerCase();
  if (!uid || !email) fail('A signed-in account with a verified email is required.', 401, 'EMAIL_REQUIRED');
  return { uid, email };
}

function projectId(value) {
  const id = clean(value, 120);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) {
    fail('Project ID is invalid.', 400, 'INVALID_PROJECT_ID');
  }
  return id;
}

function safePath(value) {
  const path = clean(value, 240).replace(/^\/+/, '');
  if (
    !path ||
    path.includes('\\') ||
    path.split('/').some(part => !part || part === '.' || part === '..') ||
    SENSITIVE_PATH.test(path) ||
    !SAFE_TEXT_EXTENSION.test(path)
  ) {
    fail('That path is not an editable website source file.', 400, 'UNSAFE_FILE_PATH');
  }
  return path;
}

function projectDocPath(email, id) {
  return ['users', email, 'projects', id];
}

function contentOf(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  for (const key of ['content', 'text', 'source', 'code', 'html']) {
    if (typeof value[key] === 'string') return value[key];
  }
  return '';
}

function contentField(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'content';
  return ['content', 'text', 'source', 'code', 'html'].find(key => typeof value[key] === 'string') || 'content';
}

function sensitivePath(path) {
  return SENSITIVE_PATH.test(String(path || '').replace(/^\/+/, '')) ||
    /(?:^|\/)\.env(?:\.[^/]*)?$/i.test(String(path || ''));
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]{12,}=*/gi, '$1 [REDACTED]')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|private[_-]?key|secret)\b\s*([:=])\s*(['"]?)[^\s'",;}]+/gi, '$1$2[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');
}

function textPreview(value, max = 1600) {
  return redactSecrets(value).slice(0, max);
}

function own(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

function getCollection(project, chain) {
  let value = project;
  for (const key of chain) value = value?.[key];
  return value;
}

function locateFile(project, path) {
  for (const chain of FILE_BUCKETS) {
    const collection = getCollection(project, chain);
    if (!collection) continue;
    if (Array.isArray(collection)) {
      const index = collection.findIndex(item =>
        clean(item?.path || item?.file || item?.name, 240).replace(/^\/+/, '') === path
      );
      if (index < 0) continue;
      const item = collection[index];
      const key = typeof item === 'string' ? null : contentField(item);
      const current = typeof item === 'string' ? item : String(item?.[key] ?? '');
      return {
        path,
        bucket: chain.join('.'),
        current,
        rawValue: item,
        update(next) {
          if (typeof item === 'string') {
            collection[index] = next;
          } else {
            item[key] = next;
            if (own(item, 'updatedAt')) item.updatedAt = typeof item.updatedAt === 'number' ? Date.now() : new Date().toISOString();
          }
        },
      };
    }
    if (typeof collection === 'object' && own(collection, path)) {
      const value = collection[path];
      const key = typeof value === 'string' ? null : contentField(value);
      const current = typeof value === 'string' ? value : String(value?.[key] ?? '');
      return {
        path,
        bucket: chain.join('.'),
        current,
        rawValue: value,
        update(next) {
          if (typeof value === 'string') collection[path] = next;
          else {
            value[key] = next;
            if (own(value, 'updatedAt')) value.updatedAt = typeof value.updatedAt === 'number' ? Date.now() : new Date().toISOString();
            else value.updatedAt = Date.now();
          }
        },
      };
    }
  }
  return null;
}

function allProjectFiles(project) {
  const result = [];
  const seen = new Set();
  for (const chain of FILE_BUCKETS) {
    const collection = getCollection(project, chain);
    if (!collection) continue;
    const entries = Array.isArray(collection)
      ? collection.map(item => [
          clean(item?.path || item?.file || item?.name, 240).replace(/^\/+/, ''),
          item,
        ])
      : (typeof collection === 'object' ? Object.entries(collection) : []);
    for (const [rawPath, value] of entries) {
      const path = clean(rawPath, 240).replace(/^\/+/, '');
      if (!path || seen.has(path) || sensitivePath(path)) continue;
      const content = contentOf(value);
      if (!content || content.length > MAX_PROJECT_FILE_BYTES || !SAFE_TEXT_EXTENSION.test(path)) continue;
      seen.add(path);
      result.push({ path, size: content.length, content });
    }
    if (result.length >= 120) break;
  }
  return result.slice(0, 120);
}

export function validateOvyxSourcePath(value) {
  return safePath(value);
}

function pageSummary(page, index, maxPreview = 900) {
  const name = clean(page?.name || page?.slug || page?.title || `Page ${index + 1}`, 180);
  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const components = Array.isArray(page?.components) ? page.components : [];
  const directContent = [
    page?.html, page?.renderedHtml, page?.source, page?.code,
    page?.content, page?.description,
  ].find(value => typeof value === 'string' && value.trim()) || '';
  let sectionContent = '';
  try {
    sectionContent = sections.slice(0, 12).map(section => [
      section?.type, section?.name, section?.title, section?.heading,
      section?.content, section?.text,
    ].filter(value => typeof value === 'string').join(' ')).join('\n');
  } catch {}
  return {
    id: clean(page?.id, 120) || null,
    name,
    slug: clean(page?.slug, 180),
    title: clean(page?.title, 240),
    sectionsCount: sections.length,
    componentsCount: components.length,
    content: textPreview(directContent || sectionContent, maxPreview),
  };
}

function projectSummary(id, project, updateTime = null, includeContents = true) {
  // Keep the authenticated source files early in the serialized context, before
  // page summaries, so the native model is less likely to receive truncated code.
  const pages = (Array.isArray(project?.pages) ? project.pages : [])
    .slice(0, 12)
    .map((page, index) => pageSummary(page, index, 350));
  const files = allProjectFiles(project);
  const visibleFiles = files.slice(0, includeContents ? 8 : 40).map(file => {
    const complete = file.content.length <= MAX_MODEL_EDITABLE_SOURCE_BYTES;
    return {
      path: file.path,
      size: file.size,
      ...(includeContents ? {
        content: textPreview(file.content, complete ? MAX_MODEL_EDITABLE_SOURCE_BYTES : 1200),
        contentComplete: complete,
      } : {}),
    };
  });
  return {
    id,
    name: clean(project?.name || 'Untitled project', 180),
    description: clean(project?.description, 1200),
    status: clean(project?.status || 'draft', 80),
    updatedAt: project?.updatedAt || null,
    revision: updateTime || null,
    pageCount: Array.isArray(project?.pages) ? project.pages.length : 0,
    fileCount: files.length,
    files: visibleFiles,
    pages,
  };
}

export function diagnoseProject(project, id) {
  const issues = [];
  const pages = Array.isArray(project?.pages) ? project.pages : [];
  const files = allProjectFiles(project);
  if (!pages.length && !files.length) {
    issues.push({ severity: 'warning', code: 'EMPTY_PROJECT', message: 'No pages or readable source files were found in the saved project.' });
  }
  if (pages.length && !files.length) {
    issues.push({ severity: 'info', code: 'NO_SOURCE_GRAPH', message: 'The project has page-builder data, but no saved text source files were found in the project source graph. File-level patches are unavailable for this project snapshot.' });
  }
  const slugs = new Map();
  pages.forEach((page, index) => {
    const label = clean(page?.name || page?.slug || `Page ${index + 1}`, 160);
    const slug = clean(page?.slug, 160).toLowerCase();
    if (!label.trim()) issues.push({ severity: 'warning', code: 'PAGE_NAME_MISSING', path: `page:${index + 1}`, message: 'A page has no display name.' });
    if (slug) {
      if (slugs.has(slug)) issues.push({ severity: 'warning', code: 'DUPLICATE_PAGE_SLUG', path: `page:${slug}`, message: `The page slug "${slug}" is shared by more than one page.` });
      else slugs.set(slug, index);
    }
    if (!Array.isArray(page?.sections) && !Array.isArray(page?.components) && !contentOf(page?.html || page?.content)) {
      issues.push({ severity: 'info', code: 'PAGE_CONTENT_NOT_VISIBLE', path: `page:${slug || index + 1}`, message: 'No readable section/component/source content was found in this page record.' });
    }
  });
  for (const file of files) {
    if (/package\.json$/i.test(file.path)) {
      try { JSON.parse(file.content); }
      catch { issues.push({ severity: 'error', code: 'INVALID_PACKAGE_JSON', path: file.path, message: 'package.json is not valid JSON.' }); }
    }
    if (/\.html?$/i.test(file.path)) {
      if (!/<html\b/i.test(file.content)) issues.push({ severity: 'warning', code: 'HTML_ROOT_MISSING', path: file.path, message: 'This HTML file does not contain an <html> root element in the saved source.' });
      if (/<html\b/i.test(file.content) && !/<\/html\s*>/i.test(file.content)) issues.push({ severity: 'warning', code: 'HTML_CLOSE_MISSING', path: file.path, message: 'This HTML file appears to be missing its closing </html> tag.' });
      const ids = [...file.content.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
      const repeated = ids.find((value, i) => ids.indexOf(value) !== i);
      if (repeated) issues.push({ severity: 'warning', code: 'DUPLICATE_HTML_ID', path: file.path, message: `Duplicate HTML id "${repeated}" appears in this file; that may affect selectors or accessibility.` });
    }
    if (!file.content.trim()) issues.push({ severity: 'warning', code: 'EMPTY_SOURCE_FILE', path: file.path, message: 'A saved source file is empty.' });
  }
  return {
    projectId: id,
    projectName: clean(project?.name || 'Untitled project', 180),
    checkedPages: pages.length,
    checkedFiles: files.length,
    issueCount: issues.length,
    issues: issues.slice(0, 30),
    note: 'Static checks only: findings identify likely issues from saved project data; they do not claim that the site was run in a browser or that runtime tests passed.',
  };
}

function lineDiff(before, after) {
  const a = String(before || '').split('\n');
  const b = String(after || '').split('\n');
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const oldMid = a.slice(prefix, a.length - suffix);
  const newMid = b.slice(prefix, b.length - suffix);
  return {
    linesAdded: newMid.length,
    linesRemoved: oldMid.length,
    preview: [
      ...oldMid.slice(0, 10).map(line => '- ' + line),
      ...newMid.slice(0, 10).map(line => '+ ' + line),
    ].join('\n').slice(0, 2400) || '(No visible line difference.)',
  };
}

async function listOwnedProjects(env, uid, email) {
  const rows = await listFirestoreSubcollectionDocuments(env, 'users', email, 'projects', 100);
  return rows
    .filter(row => clean(row?.data?.ownerUid, 180) === uid && clean(row?.data?.ownerEmail, 320).toLowerCase() === email)
    .map(row => ({
      id: row.id,
      name: clean(row.data?.name || 'Untitled project', 180),
      description: clean(row.data?.description, 500),
      status: clean(row.data?.status || 'draft', 80),
      updatedAt: row.data?.updatedAt || null,
      pageCount: Array.isArray(row.data?.pages) ? row.data.pages.length : 0,
      fileCount: allProjectFiles(row.data).length,
    }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 60);
}

async function loadOwnedProject(env, uid, email, rawId) {
  const id = projectId(rawId);
  const path = projectDocPath(email, id);
  const document = await getFirestoreDocumentAtPath(env, path);
  const project = document ? await getFirestoreDataAtPath(env, path) : null;
  if (
    !document ||
    !project ||
    clean(project.ownerUid, 180) !== uid ||
    clean(project.ownerEmail, 320).toLowerCase() !== email
  ) {
    fail('That project was not found in your account. Refresh workspace context and try again.', 404, 'PROJECT_NOT_FOUND');
  }
  return { id, path, document, project };
}

async function handleTool(env, identity, body) {
  const operation = clean(body?.operation || body?.op, 50).toLowerCase();
  if (!['snapshot', 'list_projects', 'inspect', 'diagnose', 'search', 'prepare_patch', 'apply_patch'].includes(operation)) {
    fail('Unknown workspace-tool operation.', 400, 'UNKNOWN_WORKSPACE_TOOL');
  }
  const { uid, email } = identity;

  if (operation === 'list_projects') {
    const projects = await listOwnedProjects(env, uid, email);
    return { operation, projects, count: projects.length };
  }

  if (operation === 'snapshot' && !body.projectId) {
    const projects = await listOwnedProjects(env, uid, email);
    return { operation, projects, activeProject: null, source: 'firestore-owned-project-inventory' };
  }

  if (operation === 'snapshot' && body.projectId) {
    try {
      const found = await loadOwnedProject(env, uid, email, body.projectId);
      return {
        operation,
        projects: await listOwnedProjects(env, uid, email),
        activeProject: projectSummary(found.id, found.project, found.document.updateTime, true),
        source: 'firestore-owned-project-document',
      };
    } catch (error) {
      if (error?.code !== 'PROJECT_NOT_FOUND') throw error;
      return {
        operation,
        projects: await listOwnedProjects(env, uid, email),
        activeProject: null,
        missingProjectId: clean(body.projectId, 120),
        source: 'firestore-project-not-found',
        message: 'The current browser project is not available in the saved server project store. Local workspace context can still be used, but server-side file writes are disabled until this project syncs.',
      };
    }
  }

  if (operation === 'search') {
    const found = await loadOwnedProject(env, uid, email, body.projectId);
    const query = clean(body.query, 160).toLowerCase();
    if (query.length < 2) fail('Enter at least two characters to search project files.', 400, 'SEARCH_QUERY_REQUIRED');
    const matches = [];
    for (const file of allProjectFiles(found.project)) {
      const lower = file.content.toLowerCase();
      let from = 0;
      let count = 0;
      while ((from = lower.indexOf(query, from)) >= 0 && count < 40) {
        const start = Math.max(0, from - 100);
        const end = Math.min(file.content.length, from + query.length + 180);
        matches.push({ path: file.path, position: from, snippet: textPreview(file.content.slice(start, end), 420) });
        count++;
        from += query.length;
        if (matches.length >= 16) break;
      }
      if (matches.length >= 16) break;
    }
    return { operation, projectId: found.id, query, count: matches.length, matches, revision: found.document.updateTime || null };
  }

  const found = await loadOwnedProject(env, uid, email, body.projectId);
  if (operation === 'inspect') {
    return {
      operation,
      project: projectSummary(found.id, found.project, found.document.updateTime, true),
      diagnostics: diagnoseProject(found.project, found.id),
      source: 'firestore-owned-project-document',
    };
  }
  if (operation === 'diagnose') {
    return {
      operation,
      project: {
        id: found.id,
        name: clean(found.project?.name || 'Untitled project', 180),
        status: clean(found.project?.status || 'draft', 80),
        revision: found.document.updateTime || null,
        pageCount: Array.isArray(found.project?.pages) ? found.project.pages.length : 0,
        fileCount: allProjectFiles(found.project).length,
      },
      diagnostics: diagnoseProject(found.project, found.id),
      source: 'firestore-owned-project-document',
    };
  }

  const filePath = safePath(body.filePath || body.path);
  const slot = locateFile(found.project, filePath);
  if (!slot) fail('That exact source path does not exist in the saved project. OVYX will not create a guessed file path.', 404, 'SOURCE_FILE_NOT_FOUND');

  const nextContent = String(body.content ?? '');
  if (slot.current.length > MAX_MODEL_EDITABLE_SOURCE_BYTES) {
    fail('OVYX did not receive the complete source for this file, so it will not replace it automatically. Use Web Studio to edit the full file safely.', 413, 'SOURCE_NOT_FULLY_IN_CONTEXT');
  }
  if (slot.current.length > MAX_BACKUP_SOURCE_BYTES) fail('This source file is too large for a safe automatic backup. No change was made.', 413, 'SOURCE_TOO_LARGE_FOR_BACKUP');
  if (nextContent.length > MAX_PATCH_BYTES) fail('The proposed file is too large for a safe single-file assistant edit.', 413, 'PATCH_TOO_LARGE');
  if (!nextContent.trim()) fail('The proposed file content cannot be empty.', 400, 'EMPTY_PATCH');

  const diff = lineDiff(slot.current, nextContent);
  if (operation === 'prepare_patch') {
    return {
      operation,
      projectId: found.id,
      projectName: clean(found.project?.name || 'Untitled project', 180),
      filePath,
      bucket: slot.bucket,
      revision: found.document.updateTime || null,
      changed: slot.current !== nextContent,
      originalLength: slot.current.length,
      proposedLength: nextContent.length,
      ...diff,
      approvalRequired: true,
      note: 'This is a preview only. No project file was changed.',
    };
  }

  if (body.confirm !== true) fail('Explicit user approval is required before changing a project file.', 403, 'PATCH_APPROVAL_REQUIRED');
  if (!body.expectedUpdateTime || String(body.expectedUpdateTime) !== String(found.document.updateTime || '')) {
    fail('This project changed since the edit preview was prepared. Refresh and prepare the edit again.', 409, 'PROJECT_REVISION_CHANGED');
  }
  if (slot.current === nextContent) {
    return {
      operation,
      projectId: found.id,
      filePath,
      changed: false,
      verified: true,
      revision: found.document.updateTime || null,
      message: 'The saved file already matches the proposed content; no write was needed.',
    };
  }

  const revisionId = 'ai_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
  const backupValue = {
    projectId: found.id,
    filePath,
    bucket: slot.bucket,
    originalContent: slot.current,
    createdAt: new Date().toISOString(),
    beforeUpdateTime: found.document.updateTime || null,
    reason: clean(body.reason, 600) || 'OVYX AI approved source edit',
    ownerUid: uid,
    ownerEmail: email,
  };
  slot.update(nextContent);
  found.project.updatedAt = typeof found.project.updatedAt === 'number' ? Date.now() : new Date().toISOString();

  const encodedProjectSize = new TextEncoder().encode(JSON.stringify(found.project)).byteLength;
  if (encodedProjectSize > MAX_PROJECT_DOCUMENT_BYTES) {
    fail('The saved project is too large for a safe source update. No file was changed; use Web Studio to edit this project.', 413, 'PROJECT_TOO_LARGE_FOR_SAFE_PATCH');
  }

  // Persist the rollback copy only after the replacement is known to fit.
  await setFirestoreDocumentAtPath(env, [...found.path, 'revisions', revisionId], backupValue, { merge: false });
  await setFirestoreDocumentAtPath(env, found.path, found.project, {
    merge: false,
    expectedUpdateTime: found.document.updateTime,
  });

  const verified = await loadOwnedProject(env, uid, email, found.id);
  const written = locateFile(verified.project, filePath);
  const matches = !!written && written.current === nextContent;
  if (!matches) fail('The write was accepted, but read-back verification did not match. The previous file is backed up.', 502, 'PATCH_VERIFY_FAILED');

  return {
    operation,
    projectId: found.id,
    projectName: clean(verified.project?.name || 'Untitled project', 180),
    filePath,
    changed: true,
    verified: true,
    revisionId,
    previousRevision: found.document.updateTime || null,
    revision: verified.document.updateTime || null,
    diagnostics: diagnoseProject(verified.project, verified.id),
    project: projectSummary(verified.id, verified.project, verified.document.updateTime, false),
    message: 'The saved project source was updated and read back successfully. This verifies storage, not live browser behavior.',
  };
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const identity = userIdentity(user);
    const body = await readJson(context.request, MAX_BODY_BYTES);
    const result = await handleTool(context.env, identity, body);
    return jsonResponse({ ok: true, ...result, requestId: id }, 200, { 'X-OVYX-Request-ID': id });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message || 'Workspace tool request failed.',
      code: error?.code || 'WORKSPACE_TOOL_FAILED',
      requestId: id,
    }, error?.status || 500, { 'X-OVYX-Request-ID': id });
  }
}
