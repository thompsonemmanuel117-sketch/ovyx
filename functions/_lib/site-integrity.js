/**
 * Conservative source-level integrity checks for generated multi-page websites.
 *
 * This warning-oriented static audit does not fetch external resources or
 * pretend to prove live API, payment, booking or form delivery behavior.
 * The browser quality inspector remains responsible for runtime checks.
 */

function cleanPath(value) {
  let path = String(value || '').replace(/\\/g, '/').trim();
  try { path = decodeURIComponent(path); } catch {}
  const parts = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function stripSuffix(reference) {
  return String(reference || '').trim().split(/[?#]/, 1)[0].trim();
}

function externalReference(reference) {
  const value = String(reference || '').trim();
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const match = String(tag || '').match(new RegExp('\\b' + escaped + '\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))', 'i'));
  return match ? String(match[1] ?? match[2] ?? match[3] ?? '').trim() : '';
}

function normalizeRoute(value) {
  let route = stripSuffix(value || '/');
  if (!route) route = '/';
  if (!route.startsWith('/')) route = '/' + route;
  route = route.replace(/\/{2,}/g, '/');
  if (/\/index\.html?$/i.test(route)) route = route.replace(/index\.html?$/i, '');
  if (!route.endsWith('/') && !/\.[a-z0-9]{1,12}$/i.test(route)) route += '/';
  return route.toLowerCase();
}

function resolveLocalFile(fromFile, reference) {
  let ref = stripSuffix(reference);
  if (!ref || externalReference(ref) || ref.startsWith('#')) return '';
  if (ref.startsWith('/')) ref = ref.slice(1);
  else {
    const base = String(fromFile || '').replace(/\\/g, '/').split('/');
    base.pop();
    ref = base.concat(ref.split('/')).join('/');
  }
  return cleanPath(ref);
}

function fileIndex(files) {
  const byLower = new Map();
  for (const [rawPath, content] of Object.entries(files || {})) {
    const path = cleanPath(rawPath);
    if (path && typeof content === 'string') byLower.set(path.toLowerCase(), { path, content });
  }
  return byLower;
}

function routeIndex(siteMap, fileByPath) {
  const routes = new Map();
  for (const page of Array.isArray(siteMap && siteMap.pages) ? siteMap.pages : []) {
    if (!page || !page.path) continue;
    const file = fileByPath.get(cleanPath(page.path).toLowerCase());
    if (!file) continue;
    routes.set(normalizeRoute(page.url || '/'), file);
  }
  return routes;
}

function idSet(html) {
  const ids = new Set();
  for (const match of String(html || '').matchAll(/\bid\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+))/gi)) {
    const id = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

function duplicateIdCounts(html) {
  const counts = new Map();
  for (const match of String(html || '').matchAll(/\bid\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+))/gi)) {
    const id = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
}

function controlHasLabel(html, tag, ids) {
  if (attribute(tag, 'aria-label')) return true;
  const labelledBy = attribute(tag, 'aria-labelledby').split(/\s+/).filter(Boolean);
  if (labelledBy.length && labelledBy.every(id => ids.has(id))) return true;

  const id = attribute(tag, 'id');
  if (id) {
    for (const match of String(html || '').matchAll(/<label\b[^>]*>/gi)) {
      if (attribute(match[0], 'for') === id) return true;
    }
  }
  for (const match of String(html || '').matchAll(/<label\b[^>]*>[\s\S]*?<\/label\s*>/gi)) {
    if (match[0].toLowerCase().includes(String(tag || '').toLowerCase())) return true;
  }
  return false;
}

function addIssue(issues, seen, code, file, reference, message) {
  const safeReference = String(reference || '').split(/[?#]/, 1)[0].slice(0, 180);
  const key = [code, file, safeReference].join('|').toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  issues.push({ code, file: String(file || '').slice(0, 240), reference: safeReference, message });
}

function referenceIsExternalOrInline(reference) {
  const value = String(reference || '').trim();
  return !value || externalReference(value) || /^(?:data|blob):/i.test(value) || value.startsWith('#');
}

export function auditWebsiteIntegrity(rawFiles, siteMap = {}) {
  const files = {};
  if (rawFiles && typeof rawFiles === 'object' && !Array.isArray(rawFiles)) {
    for (const [path, rawContent] of Object.entries(rawFiles)) {
      const content = typeof rawContent === 'string' ? rawContent : rawContent && typeof rawContent.content === 'string' ? rawContent.content : '';
      const normalized = cleanPath(path);
      if (normalized && content) files[normalized] = content;
    }
  }

  const fileByPath = fileIndex(files);
  const routes = routeIndex(siteMap, fileByPath);

  const htmlEntries = Object.entries(files).filter(([path]) => /\.html?$/i.test(path));
  const cssEntries = Object.entries(files).filter(([path]) => /\.css$/i.test(path));
  const issues = [];
  const seen = new Set();
  let checkedReferences = 0;

  function checkAsset(fromPath, reference, code, kind) {
    const value = String(reference || '').trim();
    if (referenceIsExternalOrInline(value)) return;
    checkedReferences += 1;
    const candidate = resolveLocalFile(fromPath, value);
    if (candidate && fileByPath.has(candidate.toLowerCase())) return;
    addIssue(issues, seen, code, fromPath, value,
      'A local ' + kind + ' reference does not resolve to a file included in the generated project.');
  }

  function checkSrcset(fromPath, value) {
    const srcset = String(value || '').trim();
    // Data URLs contain commas, which are also srcset separators. Skip the
    // whole attribute rather than splitting a valid inline image into false
    // missing-file reports. External and inline-only srcsets remain outside
    // this source-level local-file check.
    if (!srcset || /\bdata:/i.test(srcset)) return;
    for (const candidate of srcset.split(',')) {
      const reference = candidate.trim().split(/\s+/)[0];
      if (reference) checkAsset(fromPath, reference, 'LOCAL_SRCSET_ASSET_MISSING', 'responsive image srcset asset');
    }
  }

  for (const [filePath, html] of htmlEntries) {
    const ids = idSet(html);
    for (const [id, count] of duplicateIdCounts(html)) {
      addIssue(issues, seen, 'DUPLICATE_HTML_ID', filePath, id,
        'The HTML document declares the same id multiple times (' + count + ' occurrences); ids must be unique for reliable anchors and accessibility relationships.');
    }

    for (const tagMatch of html.matchAll(/<label\b[^>]*>/gi)) {
      const targetId = attribute(tagMatch[0], 'for');
      if (targetId && !ids.has(targetId)) {
        addIssue(issues, seen, 'LABEL_TARGET_MISSING', filePath, targetId,
          'A label references a control id that is not declared in the same HTML document.');
      }
    }
    for (const tagMatch of html.matchAll(/<[a-z][a-z0-9-]*\b[^>]*>/gi)) {
      const tag = tagMatch[0];
      for (const attrName of ['aria-labelledby', 'aria-describedby']) {
        const refs = attribute(tag, attrName).split(/\s+/).filter(Boolean);
        for (const targetId of refs) {
          if (!ids.has(targetId)) {
            addIssue(issues, seen, 'ARIA_REFERENCE_TARGET_MISSING', filePath, targetId,
              'An ' + attrName + ' attribute references an id that is not declared in the same HTML document.');
          }
        }
      }
    }
    for (const controlMatch of html.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)) {
      const tag = controlMatch[0];
      const type = attribute(tag, 'type').toLowerCase();
      if (/^<input\b/i.test(tag) && ['hidden', 'button', 'submit', 'reset', 'image'].includes(type)) continue;
      if (!controlHasLabel(html, tag, ids)) {
        addIssue(issues, seen, 'FORM_CONTROL_LABEL_MISSING', filePath, attribute(tag, 'name') || attribute(tag, 'id'),
          'A form control has no detectable label, aria-label, or valid aria-labelledby target in the source HTML.');
      }
    }
    const routeForFile = (Array.isArray(siteMap && siteMap.pages) ? siteMap.pages : [])
      .find(page => page && cleanPath(page.path).toLowerCase() === filePath.toLowerCase());
    const currentRoute = normalizeRoute(routeForFile && routeForFile.url || '/');

    for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
      const tag = match[0];
      const href = attribute(tag, 'href');
      if (!href) {
        addIssue(issues, seen, 'LINK_DESTINATION_MISSING', filePath, '', 'An anchor has no href destination.');
        continue;
      }
      if (/^javascript:/i.test(href)) {
        addIssue(issues, seen, 'UNSAFE_JAVASCRIPT_LINK', filePath, href, 'A javascript: URL is used as a link destination.');
        continue;
      }
      if (href === '#') {
        addIssue(issues, seen, 'PLACEHOLDER_LINK', filePath, href, 'A placeholder href="#" link was found; use a real destination or a button for an action.');
        continue;
      }
      if (externalReference(href) || /^(?:mailto|tel|sms):/i.test(href)) continue;
      checkedReferences += 1;

      if (href.startsWith('#')) {
        const fragment = href.slice(1).split(/[?]/, 1)[0];
        if (fragment && !ids.has(fragment)) {
          addIssue(issues, seen, 'ORPHAN_FRAGMENT', filePath, href, 'A same-page anchor points to an id that is not present in this HTML file.');
        }
        continue;
      }

      let parsedHref = null;
      try { parsedHref = new URL(href, 'https://ovyx-integrity.invalid' + currentRoute); } catch {}
      const routePath = parsedHref ? normalizeRoute(parsedHref.pathname) : '';
      const rawPath = stripSuffix(href);
      const extension = /\.[a-z0-9]{1,12}$/i.test(rawPath);
      const directFile = resolveLocalFile(filePath, href);
      const directTarget = directFile ? fileByPath.get(directFile.toLowerCase()) : null;
      const existingLocalFile = !!directTarget;
      const routeTarget = routes.get(routePath);
      const fragmentTarget = routeTarget || directTarget;

      // Catch links that resolve to a real page/file but jump to an id that
      // does not exist there. The current-page-only fragment check above cannot
      // catch href="/about/#team" when the "team" section is missing on About.
      if (parsedHref && parsedHref.hash && fragmentTarget && /\.html?$/i.test(fragmentTarget.path)) {
        let fragment = parsedHref.hash.slice(1);
        try { fragment = decodeURIComponent(fragment); } catch {}
        if (fragment && !idSet(fragmentTarget.content).has(fragment)) {
          addIssue(issues, seen, 'BROKEN_ROUTE_FRAGMENT', filePath, href,
            'A local page/file link targets an id that is not present in the destination HTML file.');
        }
      }

      if (existingLocalFile || routeTarget) continue;

      if (rawPath.startsWith('/api/')) continue;
      if (extension) {
        addIssue(issues, seen, 'LOCAL_LINK_RESOURCE_MISSING', filePath, href, 'A local file link does not resolve to an included project file or known page route.');
      } else {
        addIssue(issues, seen, 'INTERNAL_ROUTE_UNMAPPED', filePath, href, 'An internal link does not match a page in the approved website route manifest.');
      }
    }

    for (const match of html.matchAll(/<(?:img|script|source|audio|video|track)\b[^>]*>/gi)) {
      const tag = match[0];
      const kind = tag.slice(1).match(/^[a-z]+/i)?.[0]?.toLowerCase() || 'asset';
      const src = attribute(tag, 'src');
      if (src) checkAsset(filePath, src, 'LOCAL_' + kind.toUpperCase() + '_MISSING', kind);
      const srcset = attribute(tag, 'srcset');
      if (srcset) checkSrcset(filePath, srcset);
      if (kind === 'img' && !/\balt\s*=/i.test(tag)) {
        addIssue(issues, seen, 'IMAGE_ALT_MISSING', filePath, attribute(tag, 'src'),
          'An image is missing its alt attribute; use meaningful alternative text or alt="" for a decorative image.');
      }
      if (kind === 'video') {
        const poster = attribute(tag, 'poster');
        if (poster) checkAsset(filePath, poster, 'LOCAL_VIDEO_POSTER_MISSING', 'video poster');
      }
    }

    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = match[0];
      const rel = attribute(tag, 'rel').toLowerCase().split(/\s+/);
      if (!rel.includes('stylesheet') && !rel.includes('icon') && !rel.includes('manifest') && !rel.includes('preload')) continue;
      const href = attribute(tag, 'href');
      if (href) checkAsset(filePath, href, 'LOCAL_LINKED_ASSET_MISSING', 'linked asset');
    }
  }

  for (const [filePath, css] of cssEntries) {
    for (const match of css.matchAll(/url\(\s*(?:"([^"]+)"|\x27([^\x27]+)\x27|([^) \t\r\n]+))\s*\)/gi)) {
      const reference = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
      checkAsset(filePath, reference, 'LOCAL_CSS_ASSET_MISSING', 'CSS asset');
    }
  }

  const limited = issues.slice(0, 100);
  const counts = limited.reduce((out, issue) => {
    out[issue.code] = (out[issue.code] || 0) + 1;
    return out;
  }, {});
  return {
    checkedHtmlFiles: htmlEntries.length,
    checkedReferences,
    findings: limited,
    totalFindings: issues.length,
    counts,
    summary: issues.length
      ? issues.length + ' source-level website integrity or accessibility issue(s) need review.'
      : 'No unresolved internal routes, broken same-page or cross-page fragments, placeholder links, missing local asset and responsive-image references, duplicate IDs, images without alt attributes, or obvious source-level form/ARIA label references were found.',
    externalResourcesVerified: false,
    runtimeBehaviorVerified: false,
  };
}
