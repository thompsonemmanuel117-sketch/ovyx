import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SUITE_PATH = path.join(REPO_ROOT, 'scripts', 'ovyx-webstudio-evaluation-cases.json');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.wrangler', '.vercel']);
const TEXT_EXT = /\.(?:html?|css|m?js|jsx|tsx?|json|svg|txt|md|xml|webmanifest|astro)$/i;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function clean(value, limit = 300) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/\.html?$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function stripTags(value) {
  return String(value || '')
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag, name) {
  const match = String(tag || '').match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))', 'i'));
  return match ? String(match[1] ?? match[2] ?? match[3] ?? '').trim() : '';
}

function isExternal(reference) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(String(reference || '').trim());
}

function normalizeLocalPath(fromFile, reference) {
  let target = String(reference || '').trim().split(/[?#]/, 1)[0];
  if (!target || /^javascript:/i.test(target)) return '';
  try { target = decodeURIComponent(target); } catch {}
  const joined = target.startsWith('/')
    ? target.replace(/^\/+/, '')
    : path.posix.join(path.posix.dirname(fromFile), target);
  const normalized = path.posix.normalize(joined).replace(/^\/+/, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../')) return '';
  return normalized;
}

function fileLookup(filePaths) {
  const map = new Map();
  for (const file of filePaths) {
    const normalized = String(file).replace(/\\/g, '/').replace(/^\/+/, '');
    map.set(normalized.toLowerCase(), normalized);
  }
  return map;
}

function findLocalFile(fromFile, reference, pathsByLower) {
  const target = normalizeLocalPath(fromFile, reference);
  if (!target) return '';
  const candidates = [target];
  if (!path.posix.extname(target)) {
    candidates.push(target + '.html', path.posix.join(target, 'index.html'));
  }
  for (const candidate of candidates) {
    const found = pathsByLower.get(candidate.toLowerCase());
    if (found) return found;
  }
  return '';
}

function normalizeRoutePath(value) {
  let route = String(value || '/').trim().split(/[?#]/, 1)[0];
  if (!route) route = '/';
  try { route = decodeURIComponent(route); } catch {}
  if (!route.startsWith('/')) route = '/' + route;
  route = route.replace(/\/{2,}/g, '/');
  if (/\/index\.html?$/i.test(route)) route = route.replace(/index\.html?$/i, '');
  if (!route.endsWith('/') && !/\.[a-z0-9]{1,12}$/i.test(route)) route += '/';
  return route.toLowerCase();
}

function inferredRoute(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const base = path.posix.basename(normalized).replace(/\.html?$/i, '');
  const directory = path.posix.dirname(normalized);
  if (/^(?:home|homepage|index)$/i.test(base)) {
    if (directory === '.' || /(?:^|\/)(?:pages|routes|app)$/i.test(directory)) return '/';
    return normalizeRoutePath('/' + directory.split('/').pop() + '/');
  }
  return normalizeRoutePath('/' + (slug(base) || 'page') + '/');
}

function extractIds(html) {
  const ids = new Set();
  for (const match of String(html || '').matchAll(/\bid\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+))/gi)) {
    const id = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

function decodeFragment(value) {
  try { return decodeURIComponent(String(value || '')); } catch { return String(value || ''); }
}
function addFinding(findings, severity, code, message, file = '') {
  findings.push({
    severity: ['blocker', 'warning', 'info'].includes(severity) ? severity : 'info',
    code: clean(code, 80),
    message: clean(message, 500),
    file: clean(file, 240),
  });
}

function metaTags(html) {
  return Array.from(String(html || '').matchAll(/<meta\b[^>]*>/gi), match => match[0]);
}

function metaExists(html, key, value) {
  return metaTags(html).some(tag => attr(tag, key).toLowerCase() === value.toLowerCase());
}

function hasLabelFor(html, id) {
  if (!id) return false;
  for (const match of String(html || '').matchAll(/<label\b[^>]*>[\s\S]*?<\/label\s*>/gi)) {
    const tag = match[0];
    if (attr(tag, 'for') === id) return true;
    for (const input of tag.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)) {
      if (attr(input[0], 'id') === id) return true;
    }
  }
  return false;
}

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{20,}/i,
];

const PLACEHOLDER_COPY = /\b(?:lorem ipsum|coming soon|insert (?:your|company|text)|replace (?:me|this|with)|todo|fixme|placeholder text|your (?:company|business|brand) name|example\.com)\b/i;

function buildDesignEvidence(categoryId, allSource, htmlEntries, cssEntries) {
  const css = cssEntries.map(([, content]) => String(content || '')).join('\n');
  const html = htmlEntries.map(([, content]) => String(content || '')).join('\n');
  const source = String(allSource || '') + '\n' + css + '\n' + html;
  const customProperties = new Set(Array.from(css.matchAll(/(--[a-z0-9_-]+)\s*:/gi), match => match[1].toLowerCase()));
  const fontFamilies = new Set();
  for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    for (const family of match[1].split(',').map(value => value.trim().replace(/^["']|["']$/g, '').toLowerCase()).filter(Boolean)) {
      fontFamilies.add(family);
    }
  }
  const layoutPatterns = [
    /display\s*:\s*grid/i, /display\s*:\s*flex/i, /grid-template-(?:columns|areas|rows)\s*:/i,
    /aspect-ratio\s*:/i, /object-position\s*:/i, /container-type\s*:/i, /clip-path\s*:/i,
    /mask-image\s*:/i, /mix-blend-mode\s*:/i, /scroll-snap-type\s*:/i, /writing-mode\s*:/i,
  ];
  const layoutTechniques = layoutPatterns.filter(pattern => pattern.test(css)).length;
  const mediaQueries = (css.match(/@media\b/gi) || []).length;
  const fluidTypography = (css.match(/font-size\s*:\s*[^;}]*\bclamp\s*\(/gi) || []).length;
  const responsiveImageSignals = (html.match(/<picture\b|<source\b[^>]*\bsrcset\s*=|<img\b[^>]*\bsrcset\s*=/gi) || []).length;
  const reducedMotion = /prefers-reduced-motion\s*:\s*reduce/i.test(css);
  const categoryPatterns = {
    'luxury-real-estate': /\b(?:property|properties|listing|real estate|viewing|agent|bedrooms?)\b/i,
    'fashion-brand': /\b(?:collection|lookbook|size guide|variant|fit guide|editorial)\b/i,
    'saas-platform': /\b(?:pricing|product|features|dashboard|workflow|integrations)\b/i,
    restaurant: /\b(?:menu|reservation|dining|opening hours|table booking)\b/i,
    'ecommerce-store': /\b(?:add.{0,24}cart|product|category|checkout|shopping cart|basket)\b/i,
    'booking-platform': /\b(?:availability|time slot|booking|reservation|select a date|guest details)\b/i,
    agency: /\b(?:case studies|case study|selected work|our work|services|creative studio)\b/i,
    portfolio: /\b(?:projects|selected work|case studies|experience|project archive)\b/i,
    'data-dashboard': /\b(?:dashboard|metric|filters?|data table|date range|chart|reporting)\b/i,
  };
  const signals = {
    designSystemTokens: { status: customProperties.size >= 4 ? 'present' : customProperties.size ? 'partial' : 'not-found', count: customProperties.size },
    typographySystem: { status: fontFamilies.size >= 2 ? 'present' : fontFamilies.size ? 'partial' : 'not-found', distinctFamilies: fontFamilies.size },
    fluidTypography: { status: fluidTypography > 0 ? 'present' : 'not-found', declarations: fluidTypography },
    layoutComposition: { status: layoutTechniques >= 3 ? 'present' : layoutTechniques ? 'partial' : 'not-found', distinctTechniques: layoutTechniques },
    responsiveArtDirection: { status: responsiveImageSignals > 0 ? 'present' : 'not-found', pictureOrResponsiveImageSignals: responsiveImageSignals },
    responsiveBreakpoints: { status: mediaQueries >= 2 ? 'present' : mediaQueries ? 'partial' : 'not-found', mediaQueries },
    reducedMotionSupport: { status: reducedMotion ? 'present' : 'not-found' },
    categorySpecificDirection: { status: (categoryPatterns[categoryId] || /$a/).test(source) ? 'source-evidence-present' : 'not-found' },
  };
  return {
    signals,
    observedSignalCount: Object.values(signals).filter(item => item.status === 'present' || item.status === 'source-evidence-present').length,
    signalCountAvailable: Object.keys(signals).length,
    visualOriginalityVerified: false,
    notes: [
      'These are source-level design signals, not a score for beauty, originality, brand fit, conversion or business outcomes.',
      'Stylesheet signals can exist in a page that renders poorly; inspect screenshots at real viewport sizes before judging visual quality.',
    ],
  };
}

function buildJourneyEvidence(requirements, allSource, htmlEntries, cssEntries, scriptEntries) {
  const html = htmlEntries.map(([, content]) => String(content || '')).join('\n');
  const css = cssEntries.map(([, content]) => String(content || '')).join('\n');
  const scripts = scriptEntries.map(([, content]) => String(content || '')).join('\n');
  const source = String(allSource || '') + '\n' + html + '\n' + css + '\n' + scripts;
  const hasForm = /<form\b/i.test(html);
  const hasFields = /<(?:input|select|textarea)\b/i.test(html);
  const hasNativeValidation = /\brequired\b|checkValidity\s*\(|reportValidity\s*\(|setCustomValidity\s*\(|aria-invalid\s*=/i.test(source);
  const hasErrorState = /\b(?:error-message|form-error|aria-invalid|role\s*=\s*["']alert|something went wrong|try again)\b/i.test(source);
  const hasAsyncState = /\b(?:loading|isLoading|pending|aria-busy|skeleton|empty state|no results|no data|failed to load)\b/i.test(source);
  const hasSearch = /type\s*=\s*["']?search\b|\brole\s*=\s*["']search\b/i.test(html) || /\bsearch\b/i.test(html + scripts);
  const hasFilter = /\b(?:filter|sort)\b/i.test(html + scripts) && (/<select\b|type\s*=\s*["']?(?:checkbox|search|radio)|addEventListener\s*\(/i.test(html + scripts));
  const hasDateOrGuest = /type\s*=\s*["']?(?:date|time|datetime-local)|\b(?:date range|time slot|availability calendar|choose a time|select a date|guest details|number of guests)\b/i.test(html + scripts);
  const hasCartActions = /\b(?:add to cart|add to basket|view cart|cart count|cart-count|shopping cart)\b/i.test(html + scripts);
  const hasEvents = /addEventListener\s*\(\s*["'](?:click|change|input|submit|keydown|keyup)["']|\.onclick\s*=|onchange\s*=/i.test(scripts + '\n' + html);
  const hasResponsive = /name\s*=\s*["']viewport/i.test(html) && /@media\b/i.test(css);
  const hasTable = /<table\b/i.test(html);
  const hasHorizontalTableScroll = hasTable && /overflow-x\s*:\s*(?:auto|scroll)|overflow\s*:\s*(?:auto|scroll)/i.test(css);
  const hasDetailEvidence = htmlEntries.length > 1 && /(?:product|property|project|case-study|details?)/i.test(html + '\n' + htmlEntries.map(([path]) => path).join('\n'));
  const hasNav = /<nav\b/i.test(html) && /<a\b[^>]*href\s*=/i.test(html);
  const hasPricingRoute = /href\s*=\s*["'][^"']*pricing[^"']*["']/i.test(html) || htmlEntries.some(([path]) => /pricing/i.test(path));
  const hasServiceRoute = /href\s*=\s*["'][^"']*services?[^"']*["']/i.test(html) || htmlEntries.some(([path]) => /services?/i.test(path));
  const hasReviewStep = /\b(?:review your|review booking|review order|step\s*[1-9]|aria-current\s*=\s*["']step|step-indicator)\b/i.test(html + scripts);
  const hasKeyboardEvidence = /:focus(?:-visible)?\b/i.test(css) || /tabindex\s*=|aria-keyshortcuts/i.test(html + scripts);
  const hasMobileNav = /<nav\b/i.test(html) && /(?:aria-expanded|menu-toggle|mobile-menu|nav-toggle|hamburger)/i.test(html + scripts);
  const hasVisibleAction = /<(?:button|a)\b[^>]*>[\s\S]*?(?:contact|enquire|inquire|book|reserve|start|continue|request|send|view|explore|sign in|subscribe)[\s\S]*?<\/(?:button|a)\s*>/i.test(html);
  const hasCollectionLinks = /(?:collection|lookbook|product)/i.test(html) && /<a\b[^>]*href\s*=/i.test(html);
  const definitions = [
    { re: /\b(?:multi-page navigation|marketing navigation|route navigation|navigation|navigate|nav links?)\b/i, test: () => hasNav, signals: ['semantic nav and href links'] },
    { re: /\b(?:pricing routes?)\b/i, test: () => hasPricingRoute, signals: ['pricing route/file or internal link'] },
    { re: /\b(?:filters?|filtering|sorting|sort(?:ing)?)\b/i, test: () => hasFilter, signals: ['filter/sort evidence plus control or event signal'] },
    { re: /\bsearch\b/i, test: () => hasSearch, signals: ['search input/role or search source reference'] },
    { re: /\b(?:viewing request form|reservation form|contact validation|contact flow|contact form|enquir(?:y|ies)|inquir(?:y|ies)|request form|form)\b/i, test: () => hasForm && hasFields, signals: ['form and at least one field'] },
    { re: /\b(?:validation feedback|validation)\b/i, test: () => hasNativeValidation || hasErrorState, signals: ['native/custom validation or error feedback marker'] },
    { re: /\b(?:empty state|loading\/empty\/error states?|error and empty states?|dashboard empty state)\b/i, test: () => hasAsyncState && (hasErrorState || /empty state|no results|no data/i.test(html + scripts)), signals: ['loading/empty marker with an error or explicit empty marker'] },
    { re: /\b(?:mobile|responsive|tablet)\b/i, test: () => hasResponsive, signals: ['viewport metadata and CSS media query'] },
    { re: /\b(?:cart|quantity|add to cart|cart state|checkout)\b/i, test: () => hasCartActions && (hasEvents || /<button\b/i.test(html)), signals: ['cart action and button/event source'] },
    { re: /\b(?:size selection|size selector|variant)\b/i, test: () => /(?:size|variant)/i.test(html + scripts) && /<select\b|type\s*=\s*["']?radio|addEventListener\s*\(/i.test(html + scripts), signals: ['size/variant source plus selection control/event'] },
    { re: /\b(?:date|guest controls|availability|booking flow|date\/guest controls)\b/i, test: () => hasDateOrGuest, signals: ['date/time input or availability/guest-control source'] },
    { re: /\b(?:product detail|property detail|project detail|case-study navigation|detail links?|project detail)\b/i, test: () => hasDetailEvidence || /(?:product|property|project|case-study|details?)/i.test(html + scripts) && /<a\b[^>]*href\s*=/i.test(html), signals: ['detail route/copy and links'] },
    { re: /\b(?:project index|project archive)\b/i, test: () => /(?:project|work|portfolio)/i.test(html + '\n' + htmlEntries.map(([path]) => path).join('\n')) && /<a\b[^>]*href\s*=/i.test(html), signals: ['project/work source and links'] },
    { re: /\b(?:table overflow|data table)\b/i, test: () => hasHorizontalTableScroll, signals: ['HTML table plus overflow handling in CSS'] },
    { re: /\b(?:review step)\b/i, test: () => hasReviewStep, signals: ['review-step or step-indicator source signal'] },
    { re: /\b(?:cta behavior|cta flow|cta)\b/i, test: () => hasVisibleAction && hasEvents, signals: ['action label and event handler source'] },
    { re: /\b(?:service page)\b/i, test: () => hasServiceRoute, signals: ['service route/file or internal link'] },
    { re: /\b(?:keyboard use|keyboard-accessible|keyboard navigation)\b/i, test: () => hasKeyboardEvidence, signals: ['focus CSS or keyboard semantics'] },
    { re: /\b(?:collection navigation)\b/i, test: () => hasCollectionLinks, signals: ['collection/product text plus internal links'] },
    { re: /\b(?:mobile navigation)\b/i, test: () => hasMobileNav, signals: ['navigation plus mobile menu disclosure signal'] },
    { re: /\b(?:responsive editorial layout|mobile property-card layout|tablet dashboard layout|mobile layout)\b/i, test: () => hasResponsive, signals: ['viewport declaration and responsive media CSS'] },
  ];
  return (Array.isArray(requirements) ? requirements : []).map(requirement => {
    const matched = definitions.find(item => item.re.test(String(requirement || '')));
    const present = matched ? matched.test() : false;
    return {
      requirement: clean(requirement, 160),
      status: present ? 'source-evidence-present-behavior-unverified' : 'no-matching-static-evidence',
      matchedSignals: present ? matched.signals : [],
      browserBehaviorVerified: false,
      integrationVerified: false,
    };
  });
}

export function evaluateSiteFiles(rawFiles, category, options = {}) {
  const files = {};
  if (rawFiles && typeof rawFiles === 'object' && !Array.isArray(rawFiles)) {
    for (const [rawPath, rawValue] of Object.entries(rawFiles)) {
      const filePath = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const content = typeof rawValue === 'string' ? rawValue : rawValue && typeof rawValue.content === 'string' ? rawValue.content : '';
      if (filePath && content && !filePath.split('/').some(part => SKIP_DIRS.has(part))) files[filePath] = content;
    }
  }
  const filePaths = Array.from(new Set([
    ...Object.keys(files),
    ...(Array.isArray(options.filePaths) ? options.filePaths : []),
  ].map(item => String(item || '').replace(/\\/g, '/').replace(/^\/+/, '')).filter(Boolean)));
  const pathsByLower = fileLookup(filePaths);
  const findings = [];
  const htmlEntries = Object.entries(files).filter(([filePath]) => /\.html?$/i.test(filePath));
  const cssEntries = Object.entries(files).filter(([filePath]) => /\.css$/i.test(filePath));
  const scriptEntries = Object.entries(files).filter(([filePath]) => /\.(?:m?js|jsx|tsx?)$/i.test(filePath));
  const htmlPaths = htmlEntries.map(([filePath]) => filePath);
  const htmlByPath = new Map(htmlEntries);
  const idsByHtmlPath = new Map(htmlEntries.map(([filePath, html]) => [filePath, extractIds(html)]));
  const routes = new Map(htmlPaths.map(filePath => [inferredRoute(filePath), filePath]));
  const categoryId = clean(category && category.id || 'unknown', 100);
  const categoryName = clean(category && category.category || categoryId, 140);

  for (const filePath of options.secretFiles || []) {
    addFinding(findings, 'blocker', 'SECRET_FILE_PRESENT', 'A secret-like file is present in the artifact. Its contents were not read or echoed.', filePath);
  }
  if (!htmlEntries.length) {
    addFinding(findings, 'blocker', 'HTML_ENTRY_MISSING', 'No HTML page was found in this exported website artifact.');
  }

  const duplicateIds = [];
  let linkCount = 0;
  let internalLinkCount = 0;
  let controlCount = 0;
  let imageCount = 0;
  let fragmentLinkCount = 0;
  let srcsetCandidateCount = 0;
  let sectionCount = 0;
  let wordCount = 0;

  for (const [filePath, html] of htmlEntries) {
    if (!/<!doctype\s+html/i.test(html.slice(0, 400))) {
      addFinding(findings, 'blocker', 'DOCTYPE_MISSING', 'The page is missing an HTML5 doctype.', filePath);
    }
    if (!/<title\b[^>]*>[\s\S]*?\S[\s\S]*?<\/title\s*>/i.test(html)) {
      addFinding(findings, 'blocker', 'TITLE_MISSING', 'The page is missing a non-empty document title.', filePath);
    }
    if (!/<html\b[^>]*\blang\s*=\s*(?:"[^"]+"|\x27[^\x27]+\x27|[^\s>]+)/i.test(html)) {
      addFinding(findings, 'blocker', 'LANG_MISSING', 'The root HTML element is missing its language declaration.', filePath);
    }
    if (!/<meta\b[^>]*\bname\s*=\s*(?:"viewport"|\x27viewport\x27)[^>]*\bcontent\s*=\s*(?:"[^"]*width\s*=\s*device-width[^"]*"|\x27[^\x27]*width\s*=\s*device-width[^\x27]*\x27)/i.test(html)
      && !/<meta\b[^>]*\bcontent\s*=\s*(?:"[^"]*width\s*=\s*device-width[^"]*"|\x27[^\x27]*width\s*=\s*device-width[^\x27]*\x27)[^>]*\bname\s*=\s*(?:"viewport"|\x27viewport\x27)/i.test(html)) {
      addFinding(findings, 'blocker', 'VIEWPORT_MISSING', 'The page is missing a responsive viewport declaration.', filePath);
    }
    if (!/<main\b/i.test(html) && !/\brole\s*=\s*(?:"main"|\x27main\x27)/i.test(html)) {
      addFinding(findings, 'blocker', 'MAIN_LANDMARK_MISSING', 'The page has no main content landmark.', filePath);
    }
    if (!/<h1\b[^>]*>[\s\S]*?\S[\s\S]*?<\/h1\s*>/i.test(html)) {
      addFinding(findings, 'blocker', 'H1_MISSING', 'The page is missing a non-empty primary heading.', filePath);
    }
    if (!metaExists(html, 'name', 'description')) {
      addFinding(findings, 'warning', 'META_DESCRIPTION_MISSING', 'The page has no meta description for search and sharing previews.', filePath);
    }
    if (inferredRoute(filePath) === '/' && !metaExists(html, 'property', 'og:title')) {
      addFinding(findings, 'warning', 'OPEN_GRAPH_TITLE_MISSING', 'The homepage has no Open Graph title metadata.', filePath);
    }

    const visibleText = stripTags(html);
    wordCount += visibleText ? visibleText.split(/\s+/).length : 0;
    sectionCount += (html.match(/<(?:section|article|aside)\b/gi) || []).length;
    if (PLACEHOLDER_COPY.test(visibleText)) {
      addFinding(findings, 'blocker', 'PLACEHOLDER_COPY', 'Visible page copy contains a common placeholder or unfinished-content phrase.', filePath);
    }

    const idCounts = new Map();
    for (const match of html.matchAll(/\bid\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+))/gi)) {
      const id = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
    for (const [id, count] of idCounts) {
      if (count > 1) duplicateIds.push(filePath + ': #' + clean(id, 80) + ' appears ' + count + ' times');
    }

    const ids = new Set(idCounts.keys());
    for (const match of html.matchAll(/<label\b[^>]*>/gi)) {
      const targetId = attr(match[0], 'for');
      if (targetId && !ids.has(targetId)) {
        addFinding(findings, 'blocker', 'LABEL_TARGET_MISSING', 'A label references a form-control id that is not present in this HTML document.', filePath);
      }
    }
    for (const match of html.matchAll(/<[a-z][a-z0-9-]*\b[^>]*>/gi)) {
      const tag = match[0];
      for (const attributeName of ['aria-labelledby', 'aria-describedby']) {
        const references = attr(tag, attributeName).split(/\s+/).filter(Boolean);
        for (const targetId of references) {
          if (!ids.has(targetId)) {
            addFinding(findings, 'blocker', 'ARIA_REFERENCE_TARGET_MISSING', 'An ' + attributeName + ' reference points to an id that is not present in this HTML document.', filePath);
          }
        }
      }
    }

    for (const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
      const tag = match[0];
      const isImage = /^<img\b/i.test(tag);
      if (isImage) {
        imageCount += 1;
        if (!/\balt\s*=\s*/i.test(tag)) {
          addFinding(findings, 'blocker', 'IMAGE_ALT_MISSING', 'An image is missing its alt attribute.', filePath);
        }
        const src = attr(tag, 'src');
        if (src && !isExternal(src) && !findLocalFile(filePath, src, pathsByLower)) {
          addFinding(findings, 'warning', 'IMAGE_RESOURCE_UNRESOLVED', 'A local image path could not be found in the exported files.', filePath);
        }
      }
      const srcset = attr(tag, 'srcset');
      // Data URLs contain commas, which also separate srcset candidates. Skip
      // them conservatively so valid inline images do not create false positives.
      if (srcset && !/\bdata:/i.test(srcset)) {
        for (const candidate of srcset.split(',')) {
          const reference = candidate.trim().split(/\s+/)[0];
          if (!reference) continue;
          srcsetCandidateCount += 1;
          if (!isExternal(reference) && !findLocalFile(filePath, reference, pathsByLower)) {
            addFinding(findings, 'warning', 'IMAGE_SRCSET_UNRESOLVED', 'A local responsive-image srcset candidate could not be found in the exported files.', filePath);
          }
        }
      }
    }

    for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
      linkCount += 1;
      const tag = '<a ' + match[1] + '>';
      const href = attr(tag, 'href');
      const name = stripTags(match[2]) || (/<img\b[^>]*\balt\s*=/i.test(match[2]) ? attr(match[2].match(/<img\b[^>]*>/i)?.[0], 'alt') : '');
      if (!href) {
        addFinding(findings, 'blocker', 'LINK_HREF_MISSING', 'A link has no href destination.', filePath);
        continue;
      }
      if (href === '#') {
        addFinding(findings, 'blocker', 'PLACEHOLDER_LINK', 'A placeholder href="#" link was found.', filePath);
        continue;
      }
      if (!name) addFinding(findings, 'blocker', 'LINK_NAME_MISSING', 'A link has no readable text or image alternative.', filePath);
      if (attr(tag, 'target') === '_blank' && !/\bnoopener\b/i.test(attr(tag, 'rel'))) {
        addFinding(findings, 'warning', 'NEW_TAB_LINK_REL', 'A target="_blank" link should include rel="noopener".', filePath);
      }
      if (/^javascript:/i.test(href)) {
        addFinding(findings, 'blocker', 'JAVASCRIPT_HREF', 'A link uses a javascript: URL instead of a safe action.', filePath);
        continue;
      }
      const currentIds = idsByHtmlPath.get(filePath) || new Set();
      if (href.startsWith('#')) {
        fragmentLinkCount += 1;
        const fragment = decodeFragment(href.slice(1).split(/[?]/, 1)[0]);
        if (fragment && !currentIds.has(fragment)) {
          addFinding(findings, 'blocker', 'ORPHAN_FRAGMENT', 'A same-page anchor points to an id that is not present in this HTML file.', filePath);
        }
        continue;
      }
      if (isExternal(href)) continue;
      internalLinkCount += 1;
      const routeBase = inferredRoute(filePath);
      let parsedHref = null;
      try { parsedHref = new URL(href, 'https://ovyx-evaluation.invalid' + routeBase); } catch {}
      const routePath = parsedHref ? normalizeRoutePath(parsedHref.pathname) : '';
      const directFile = findLocalFile(filePath, href, pathsByLower);
      const routeTarget = routes.get(routePath) || '';
      const destinationFile = directFile || routeTarget;
      if (parsedHref && parsedHref.hash && destinationFile && /\.html?$/i.test(destinationFile)) {
        fragmentLinkCount += 1;
        const fragment = decodeFragment(parsedHref.hash.slice(1));
        const targetIds = idsByHtmlPath.get(destinationFile) || extractIds(htmlByPath.get(destinationFile) || '');
        if (fragment && !targetIds.has(fragment)) {
          addFinding(findings, 'blocker', 'BROKEN_ROUTE_FRAGMENT', 'A local page/file link targets an id that is not present in the destination HTML file.', filePath);
        }
      }
      if (directFile || routeTarget) continue;
      const cleanHref = href.split(/[?#]/, 1)[0];
      addFinding(findings, exactHtml ? 'blocker' : 'warning',
        exactHtml ? 'HTML_ROUTE_UNRESOLVED' : 'ROUTE_UNVERIFIED',
        exactHtml
          ? 'A local HTML link does not resolve to an exported file or known page route.'
          : 'An internal route could not be mapped to an exported page; a client-side router may still handle it, so verify in a browser.',
        filePath);
    }

    for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi)) {
      controlCount += 1;
      const tag = '<button ' + match[1] + '>';
      const label = attr(tag, 'aria-label') || attr(tag, 'title') || stripTags(match[2]) ||
        (/<img\b[^>]*\balt\s*=/i.test(match[2]) ? attr(match[2].match(/<img\b[^>]*>/i)?.[0], 'alt') : '');
      if (!label) addFinding(findings, 'blocker', 'BUTTON_NAME_MISSING', 'A button has no accessible name.', filePath);
    }

    for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
      const tag = match[0];
      const type = attr(tag, 'type').toLowerCase();
      if (match[1].toLowerCase() === 'input' && ['hidden', 'button', 'submit', 'reset', 'image'].includes(type)) continue;
      controlCount += 1;
      const id = attr(tag, 'id');
      const labelledBy = attr(tag, 'aria-labelledby').split(/\s+/).filter(Boolean);
      const hasValidLabelledBy = labelledBy.length > 0 && labelledBy.every(targetId => ids.has(targetId));
      const named = attr(tag, 'aria-label') || hasValidLabelledBy || (id && hasLabelFor(html, id));
      if (!named) addFinding(findings, 'blocker', 'FORM_CONTROL_LABEL_MISSING', 'A form control has no detectable associated label or valid accessible-name reference.', filePath);
    }
  }

  if (duplicateIds.length) addFinding(findings, 'blocker', 'DUPLICATE_IDS', duplicateIds.slice(0, 30).join('; '));

  for (const [filePath, content] of Object.entries(files)) {
    if (SECRET_PATTERNS.some(pattern => pattern.test(content))) {
      addFinding(findings, 'blocker', 'CLIENT_SECRET_PATTERN', 'A credential-like value or private-key marker was detected. The value is deliberately not displayed.', filePath);
    }
  }

  for (const [filePath, content] of cssEntries) {
    for (const match of content.matchAll(/url\(\s*(?:"([^"]+)"|\x27([^\x27]+)\x27|([^) \t\r\n]+))\s*\)/gi)) {
      const reference = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (reference && !isExternal(reference) && !findLocalFile(filePath, reference, pathsByLower)) {
        addFinding(findings, 'warning', 'CSS_RESOURCE_UNRESOLVED', 'A local CSS url() resource could not be found in the exported files.', filePath);
      }
    }
    if (/\b(?:animation|transition)\s*:/i.test(content) && !/prefers-reduced-motion\s*:\s*reduce/i.test(content)) {
      addFinding(findings, 'warning', 'REDUCED_MOTION_MISSING', 'CSS uses animation or transitions without a prefers-reduced-motion override.', filePath);
    }
  }

  for (const [filePath, html] of htmlEntries) {
    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = match[0];
      if (!/\bstylesheet\b/i.test(attr(tag, 'rel'))) continue;
      const href = attr(tag, 'href');
      if (href && !isExternal(href) && !findLocalFile(filePath, href, pathsByLower)) {
        addFinding(findings, 'blocker', 'STYLESHEET_UNRESOLVED', 'A referenced local stylesheet is missing from the exported files.', filePath);
      }
    }
    for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
      const src = attr(match[0], 'src');
      if (src && !isExternal(src) && !findLocalFile(filePath, src, pathsByLower)) {
        addFinding(findings, 'blocker', 'SCRIPT_UNRESOLVED', 'A referenced local script is missing from the exported files.', filePath);
      }
    }
  }

  const allSource = Object.values(files).join('\n');
  const formCount = (Object.values(files).join('\n').match(/<form\b/gi) || []).length;
  if (formCount && !/(?:addEventListener\s*\(\s*['"]submit['"]|onsubmit\s*=)/i.test(allSource)
    && !/<form\b[^>]*\baction\s*=/i.test(allSource)) {
    addFinding(findings, 'warning', 'FORM_DELIVERY_UNDECLARED', 'Forms were found but no destination or detectable submit handler was declared; successful delivery is not verified.');
  }

  const blockers = findings.filter(item => item.severity === 'blocker').length;
  const warnings = findings.filter(item => item.severity === 'warning').length;
  const infos = findings.filter(item => item.severity === 'info').length;
  const score = Math.max(0, Math.min(100, 100 - blockers * 12 - warnings * 4));
  const status = blockers ? 'needs-attention' : warnings ? 'pass-with-warnings' : 'pass';
  const exercise = Array.isArray(category && category.mustExercise) ? category.mustExercise : [];
  const integrations = Array.isArray(category && category.integrationTruth) ? category.integrationTruth : [];

  return {
    caseId: categoryId,
    category: categoryName,
    status,
    technicalReadinessScore: score,
    counts: {
      files: filePaths.length,
      textFiles: Object.keys(files).length,
      htmlPages: htmlEntries.length,
      cssFiles: cssEntries.length,
      scriptFiles: scriptEntries.length,
      links: linkCount,
      internalLinks: internalLinkCount,
      controls: controlCount,
      forms: formCount,
      images: imageCount,
      fragmentLinks: fragmentLinkCount,
      srcsetCandidates: srcsetCandidateCount,
      semanticSections: sectionCount,
      approximateWords: wordCount,
      blockers,
      warnings,
      info: infos,
    },
    findings,
    designEvidence: buildDesignEvidence(categoryId, allSource, htmlEntries, cssEntries),
    functionalAcceptance: buildJourneyEvidence(exercise, allSource, htmlEntries, cssEntries, scriptEntries),
    integrationTruth: integrations.map(integration => ({ integration, status: 'unverified-unless-checked-against-the-real-service' })),
    limitations: [
      'The score measures static technical artifact readiness, not premium visual design or business value.',
      'Static checks do not prove browser interaction behavior, keyboard usability, visual contrast, performance, SEO rankings, or all routing behavior.',
      'Real authentication, persistence, email delivery, payments, bookings, APIs, and deployments remain unverified until tested against the actual service.',
    ],
  };
}

async function readProjectFolder(folder) {
  const files = {};
  const filePaths = [];
  const secretFiles = [];
  const intakeWarnings = [];
  let totalBytes = 0;
  async function walk(directory, prefix = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const relative = prefix ? prefix + '/' + entry.name : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) await walk(absolute, relative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (/^\.env(?:\.|$)/i.test(entry.name) || /(?:secret|credentials?|private-key)\.(?:json|txt|pem|key)$/i.test(entry.name)) {
        secretFiles.push(relative);
        filePaths.push(relative);
        continue;
      }
      if (relative === 'run-metadata.json') continue;
      filePaths.push(relative);
      if (!TEXT_EXT.test(relative)) continue;
      if (filePaths.length > MAX_FILES) {
        intakeWarnings.push('The artifact exceeded the ' + MAX_FILES + ' file limit; additional files were not scanned.');
        return;
      }
      const stat = await fs.stat(absolute);
      if (stat.size > MAX_FILE_BYTES) {
        intakeWarnings.push(relative + ' was skipped because it exceeds the per-file size limit.');
        continue;
      }
      totalBytes += stat.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        intakeWarnings.push('The artifact exceeded the total ' + MAX_TOTAL_BYTES + ' byte scan limit.');
        return;
      }
      files[relative] = await fs.readFile(absolute, 'utf8');
    }
  }
  await walk(folder);
  let metadata = {};
  try {
    const value = JSON.parse(await fs.readFile(path.join(folder, 'run-metadata.json'), 'utf8'));
    metadata = {
      provider: clean(value.provider, 80),
      model: clean(value.model, 100),
      generatedAt: clean(value.generatedAt, 80),
      generationDurationMs: Number.isFinite(Number(value.generationDurationMs)) ? Number(value.generationDurationMs) : null,
      promptHash: clean(value.promptHash, 100),
    };
  } catch {}
  return { files, filePaths, secretFiles, intakeWarnings, metadata };
}

export async function evaluateEvaluationRoot(root, suite) {
  const absoluteRoot = path.resolve(root);
  const results = [];
  for (const category of suite.siteCategories || []) {
    const folder = path.resolve(absoluteRoot, String(category.id || ''));
    const relative = path.relative(absoluteRoot, folder);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      results.push({ caseId: category.id, category: category.category, status: 'not-evaluated', reason: 'The category artifact folder was not found.' });
      continue;
    }
    try {
      if (!(await fs.stat(folder)).isDirectory()) throw new Error('Not a directory');
    } catch {
      results.push({ caseId: category.id, category: category.category, status: 'not-evaluated', reason: 'No exported website was supplied in ' + String(category.id) + '/.' });
      continue;
    }
    try {
      const loaded = await readProjectFolder(folder);
      const result = evaluateSiteFiles(loaded.files, category, { filePaths: loaded.filePaths, secretFiles: loaded.secretFiles });
      result.metadata = loaded.metadata;
      result.intakeWarnings = loaded.intakeWarnings;
      results.push(result);
    } catch (error) {
      results.push({ caseId: category.id, category: category.category, status: 'needs-attention', reason: clean(error && error.message || error, 300) });
    }
  }
  const evaluated = results.filter(item => item.status !== 'not-evaluated');
  const notEvaluated = results.filter(item => item.status === 'not-evaluated');
  const scores = evaluated.map(item => item.technicalReadinessScore).filter(Number.isFinite);
  return {
    schemaVersion: 1,
    suiteVersion: suite.version,
    generatedAt: new Date().toISOString(),
    artifactRoot: path.basename(absoluteRoot),
    summary: {
      requiredCategories: (suite.siteCategories || []).length,
      evaluatedCategories: evaluated.length,
      notEvaluatedCategories: notEvaluated.length,
      categoriesNeedingAttention: evaluated.filter(item => item.status === 'needs-attention').length,
      categoriesWithWarnings: evaluated.filter(item => item.status === 'pass-with-warnings').length,
      technicalReadinessAverage: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      allCategoriesSupplied: notEvaluated.length === 0,
    },
    cases: results,
    note: 'A missing artifact is not a pass. This runner audits supplied files; it does not call an AI provider or certify visual design, browser behavior, live integrations, or deployment.',
  };
}

function parseArgs(argv) {
  const out = { root: '', output: '', strict: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') out.root = argv[++i] || '';
    else if (arg === '--out') out.output = argv[++i] || '';
    else if (arg === '--strict') out.strict = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.root) {
    console.log('Usage: node scripts/ovyx-webstudio-evaluation-runner.mjs --root <artifact-root> [--out <report.json>] [--strict]');
    console.log('Expected folders: <artifact-root>/<category-id>/ with exported HTML/CSS/JS files. Missing categories are reported as not-evaluated.');
    if (!args.help) process.exitCode = 2;
    return;
  }
  const suite = JSON.parse(await fs.readFile(SUITE_PATH, 'utf8'));
  const report = await evaluateEvaluationRoot(args.root, suite);
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (args.output) {
    const outputPath = path.resolve(args.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serialized, 'utf8');
    console.log('Evaluation report written to ' + outputPath);
    console.log(JSON.stringify(report.summary, null, 2));
  } else {
    process.stdout.write(serialized);
  }
  if (args.strict && (!report.summary.allCategoriesSupplied || report.summary.categoriesNeedingAttention > 0)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch(error => {
    console.error('Web Studio evaluation failed: ' + clean(error && error.message || error, 400));
    process.exitCode = 1;
  });
}
