const MAX_PAGES = 6;
const MAX_DISCOVERED = 70;
const MAX_ASSETS = 80;
const MAX_HTML_BYTES = 360_000;
const MAX_CSS_BYTES = 120_000;
const MAX_ROBOTS_BYTES = 24_000;
const MAX_SITEMAP_BYTES = 120_000;
const MAX_CSS_FILES = 2;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 2500;
const DNS_TIMEOUT_MS = 1600;
const DNS_URL = 'https://cloudflare-dns.com/dns-query';
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.test', '.invalid', '.example'];

function fail(code, message, status = 400) {
  throw Object.assign(new Error(message), { code, status });
}
function decodeEntities(value) {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity) => {
    const e = entity.toLowerCase();
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e === 'nbsp') return ' ';
    try {
      const point = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    } catch { return whole; }
  });
}
function plainText(value, max = 200) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max);
}
function hostOf(url) {
  return String(url.hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}
function isIpv4(value) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(value || ''));
}
function publicIpv4(value) {
  if (!isIpv4(value)) return false;
  const p = value.split('.').map(Number);
  if (p.some(n => n < 0 || n > 255)) return false;
  const [a, b, c, d] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a === 255 && b === 255 && c === 255 && d === 255) return false;
  return true;
}
function publicIpv6(value) {
  const h = String(value || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes(':') || h.includes('%')) return false;
  if (h === '::' || h === '::1' || h.startsWith('::') || h.startsWith('ff') || h.startsWith('::ffff:')) return false;
  if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('2001:db8:')) return false;
  return /^[23]/.test(h); // conservative: global-unicast 2000::/3 only
}
export function isPublicIpAddress(value) {
  const v = String(value || '').trim().replace(/^\[|\]$/g, '');
  if (isIpv4(v)) return publicIpv4(v);
  if (v.includes(':')) return publicIpv6(v);
  return false;
}
function blockedHost(host) {
  const value = String(host || '').toLowerCase().replace(/\.$/, '');
  return value === 'localhost' || LOCAL_SUFFIXES.some(s => value.endsWith(s)) ||
    value === 'metadata.google' || value === 'metadata.google.internal' || value.endsWith('.metadata.google');
}
function validateUrl(url, keepQuery = false) {
  if (!(url instanceof URL) || !['http:', 'https:'].includes(url.protocol)) fail('URL_SCHEME_NOT_ALLOWED', 'Enter a public website address using a standard web link.');
  if (url.username || url.password) fail('URL_CREDENTIALS_NOT_ALLOWED', 'Remove usernames or passwords from the website address before continuing.');
  if (url.port && !['80', '443'].includes(url.port)) fail('URL_PORT_NOT_ALLOWED', 'This website address uses an unsupported connection setting.');
  if ((url.protocol === 'https:' && url.port === '80') || (url.protocol === 'http:' && url.port === '443')) fail('URL_PORT_NOT_ALLOWED', 'This website address uses an unsupported connection setting.');
  const host = hostOf(url);
  if (!host || host.length > 253 || host.includes('..') || blockedHost(host)) fail('PRIVATE_HOST_NOT_ALLOWED', 'Local or private network addresses cannot be reviewed.');
  if (host.includes(':') || isIpv4(host)) {
    if (!isPublicIpAddress(host)) fail('PRIVATE_IP_NOT_ALLOWED', 'Private or reserved network addresses cannot be reviewed.');
  } else if (!host.includes('.') || !/^[a-z0-9.-]+$/.test(host)) {
    fail('INVALID_HOST', 'Enter a public website address.');
  }
  if (!keepQuery) url.search = '';
  url.hash = '';
  return url;
}
function displayedUrl(raw) {
  const url = new URL(raw);
  url.search = '';
  url.hash = '';
  return url.href;
}
export function normalizeAnalyzerUrl(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 2048) fail('URL_REQUIRED', 'Enter a website address under 2,048 characters.');
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw); }
  catch { fail('INVALID_URL', 'Enter a valid website address, such as https://example.com.'); }
  const hadQueryOrFragment = Boolean(url.search || url.hash);
  validateUrl(url, true);
  return { url: url.href, displayUrl: displayedUrl(url.href), hostname: hostOf(url), hadQueryOrFragment };
}
async function signalFor(ms) {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}
async function boundedText(response, maxBytes) {
  const reader = response?.body?.getReader?.();
  if (!reader) {
    const raw = await response.text().catch(() => '');
    const bytes = new TextEncoder().encode(raw);
    return { text: new TextDecoder().decode(bytes.slice(0, maxBytes)), truncated: bytes.length > maxBytes };
  }
  const chunks = [];
  let count = 0;
  let truncated = false;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      const bytes = item.value instanceof Uint8Array ? item.value : new Uint8Array(item.value);
      const left = Math.max(0, maxBytes - count);
      if (bytes.length > left) {
        if (left) chunks.push(bytes.slice(0, left));
        count += left;
        truncated = true;
        try { await reader.cancel(); } catch {}
        break;
      }
      chunks.push(bytes);
      count += bytes.length;
      if (count >= maxBytes) {
        truncated = true;
        try { await reader.cancel(); } catch {}
        break;
      }
    }
  } finally { try { reader.releaseLock(); } catch {} }
  const merged = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(merged), truncated };
}
async function verifyPublicHost(host, fetchImpl) {
  const name = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIpv4(name) || name.includes(':')) {
    if (!isPublicIpAddress(name)) fail('PRIVATE_IP_NOT_ALLOWED', 'The destination is a private or reserved IP address.');
    return;
  }
  if (blockedHost(name)) fail('PRIVATE_HOST_NOT_ALLOWED', 'Local or private network addresses cannot be reviewed.');
  const addresses = [];
  await Promise.all(['A', 'AAAA'].map(async type => {
    let response;
    try {
      response = await fetchImpl(DNS_URL + '?name=' + encodeURIComponent(name) + '&type=' + type, {
        redirect: 'error', headers: { Accept: 'application/dns-json' }, signal: await signalFor(DNS_TIMEOUT_MS),
      });
    } catch { fail('DNS_LOOKUP_FAILED', 'OVYX could not verify the public DNS for this website. Try again later.', 502); }
    if (!response.ok) fail('DNS_LOOKUP_FAILED', 'OVYX could not verify the public DNS for this website. Try again later.', 502);
    const body = await boundedText(response, 12_000);
    let data;
    try { data = JSON.parse(body.text); } catch { fail('DNS_LOOKUP_FAILED', 'The public DNS resolver returned an unreadable response.', 502); }
    if (![0, 3].includes(Number(data.Status))) fail('DNS_LOOKUP_FAILED', 'The public DNS resolver could not verify this hostname.', 502);
    for (const record of Array.isArray(data.Answer) ? data.Answer : []) {
      if ((type === 'A' && Number(record.type) === 1) || (type === 'AAAA' && Number(record.type) === 28)) {
        if (record.data) addresses.push(String(record.data).trim());
      }
    }
  }));
  if (!addresses.length) fail('DNS_NO_PUBLIC_ADDRESS', 'This hostname did not resolve to a public IPv4 or IPv6 address.');
  if (addresses.some(address => !isPublicIpAddress(address))) {
    fail('PRIVATE_IP_NOT_ALLOWED', 'The hostname has a private, link-local or reserved DNS address. OVYX refused to fetch it.');
  }
}
async function fetchPublic(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const validatedHosts = options.validatedHosts || new Set();
  const limit = options.maxBytes || MAX_HTML_BYTES;
  const expectedOrigin = options.expectedOrigin || '';
  const accept = options.accept || 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5';
  let url;
  try { url = new URL(rawUrl); } catch { fail('INVALID_URL', 'The requested website URL is invalid.'); }
  validateUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    validateUrl(url);
    const host = hostOf(url);
    if (!validatedHosts.has(host)) {
      await verifyPublicHost(host, fetchImpl);
      validatedHosts.add(host);
    }
    let response;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'manual', credentials: 'omit',
        headers: { Accept: accept }, signal: await signalFor(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') fail('UPSTREAM_TIMEOUT', 'The public website took too long to respond.', 504);
      if (error?.status && error?.code) throw error;
      fail('UPSTREAM_FETCH_FAILED', 'OVYX could not fetch this public page. The site may be offline or blocking automated requests.', 502);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || hop === MAX_REDIRECTS) fail('TOO_MANY_REDIRECTS', 'The site exceeded the four-redirect safety limit.', 502);
      let next;
      try { next = new URL(location, url); } catch { fail('INVALID_REDIRECT', 'The site returned an invalid redirect destination.', 502); }
      validateUrl(next);
      if (url.protocol === 'https:' && next.protocol !== 'https:') fail('HTTPS_DOWNGRADE_BLOCKED', 'OVYX stopped an HTTPS-to-HTTP redirect.', 502);
      if (expectedOrigin && next.origin !== expectedOrigin) fail('CROSS_ORIGIN_REDIRECT_BLOCKED', 'OVYX stopped a cross-origin redirect while inspecting a linked resource.', 502);
      if (typeof options.beforeRedirect === 'function') await options.beforeRedirect(next, url);
      url = next;
      continue;
    }
    if (response.status === 0 || response.type === 'opaqueredirect') fail('REDIRECT_UNAVAILABLE', 'OVYX could not safely inspect this redirect. Try the destination URL directly.', 502);
    const body = await boundedText(response, limit);
    return {
      response, url: url.href, text: body.text, truncated: body.truncated,
      contentType: String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(),
    };
  }
  fail('TOO_MANY_REDIRECTS', 'The site exceeded the redirect safety limit.', 502);
}
function attrs(tag) {
  const result = {};
  const pattern = /([^\s"'<>\/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;
  let match;
  while ((match = pattern.exec(String(tag || '')))) {
    const key = String(match[1] || '').toLowerCase();
    if (['img', 'a', 'link', 'meta', 'script', 'source', 'video', 'audio', 'track', 'style'].includes(key)) continue;
    if (!(key in result)) result[key] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}
function tags(html, tag) {
  return String(html || '').match(new RegExp('<' + tag + '\\b[^>]*>', 'gi')) || [];
}
function textFromHtml(value) {
  return decodeEntities(String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}
function normalizeColor(value) {
  const raw = String(value || '').trim();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const c = hex[1].toUpperCase();
    return '#' + (c.length === 3 ? c.split('').map(x => x + x).join('') : c);
  }
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i);
  if (rgb) {
    const values = rgb.slice(1, 4).map(Number);
    if (values.every(x => x >= 0 && x <= 255)) return '#' + values.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return '';
}
function cssColors(css) {
  const found = {};
  const pattern = /(--[a-z0-9_-]+)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^;{}]+\))/gi;
  let match;
  while ((match = pattern.exec(String(css || '')))) {
    const key = match[1].toLowerCase();
    const color = normalizeColor(match[2]);
    if (!color) continue;
    let field = '';
    if (/primary|brand/.test(key) && !/background|surface|secondary|accent|muted/.test(key)) field = 'primary';
    else if (/secondary/.test(key)) field = 'secondary';
    else if (/accent|highlight/.test(key)) field = 'accent';
    else if (/background|canvas/.test(key)) field = 'background';
    else if (/surface|card/.test(key)) field = 'surface';
    else if (/(?:^|[-_])text(?:$|[-_])|foreground/.test(key)) field = 'text';
    else if (/muted|subtle/.test(key)) field = 'muted';
    if (field && !found[field]) found[field] = color;
  }
  return found;
}
function safeReference(raw, base) {
  const token = decodeEntities(String(raw || '').trim());
  if (!token || /^(?:#|javascript:|data:|blob:|mailto:|tel:|sms:|about:)/i.test(token)) return null;
  let url;
  try { url = new URL(token, base); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const queryRemoved = Boolean(url.search);
  url.search = '';
  url.hash = '';
  try { validateUrl(url); } catch { return null; }
  return { url: url.href, queryRemoved };
}
function category(path) {
  const p = String(path || '/').toLowerCase();
  if (p === '/' || p === '/index.html') return 'Home';
  if (/\/(about|our-story|company|team)(\/|$)/.test(p)) return 'About';
  if (/\/(contact|support|help|faq)(\/|$)/.test(p)) return 'Contact & Support';
  if (/\/(product|products|service|services|solution|solutions|pricing|plans)(\/|$)/.test(p)) return 'Products & Services';
  if (/\/(blog|news|articles|resources|insights)(\/|$)/.test(p)) return 'Blog & Resources';
  if (/\/(login|signin|sign-in|account|checkout|cart)(\/|$)/.test(p)) return 'Account & Checkout';
  return 'Other';
}
function cleanPageUrl(raw) {
  const url = new URL(raw);
  url.search = '';
  url.hash = '';
  return url.href;
}
function parseRobots(text) {
  const groups = [];
  let group = null;
  let hasRule = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const index = line.indexOf(':');
    if (!line || index < 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (key === 'user-agent') {
      if (!group || hasRule) { group = { agents: [], rules: [] }; groups.push(group); hasRule = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && (key === 'allow' || key === 'disallow') && value) {
      group.rules.push({ type: key, path: value }); hasRule = true;
    }
  }
  const specific = groups.filter(g => g.agents.includes('ovyx-url-analyzer'));
  const wildcard = groups.filter(g => g.agents.includes('*'));
  return (specific.length ? specific : wildcard).flatMap(g => g.rules);
}
function robotsAllows(url, rules) {
  const path = url.pathname || '/';
  let best = { length: -1, allow: true };
  for (const rule of rules || []) {
    const raw = String(rule.path || '');
    if (!raw) continue;
    const anchored = raw.endsWith('$');
    const source = anchored ? raw.slice(0, -1) : raw;
    let pattern = '';
    for (const ch of source) {
      if (ch === '*') pattern += '.*';
      else if ('\\.+?^$[](){}|'.includes(ch)) pattern += '\\' + ch;
      else pattern += ch;
    }
    let matched = false;
    try { matched = new RegExp('^' + pattern + (anchored ? '$' : ''), 'i').test(path); } catch {}
    if (!matched) continue;
    const length = source.replace(/\*/g, '').length;
    if (length > best.length || (length === best.length && rule.type === 'allow')) best = { length, allow: rule.type === 'allow' };
  }
  return best.allow;
}
function parseHtml(html, pageUrl, rootOrigin) {
  const content = String(html || '');
  const meta = {};
  for (const tag of tags(content, 'meta')) {
    const a = attrs(tag);
    const key = String(a.name || a.property || a.itemprop || '').toLowerCase();
    const value = plainText(a.content, 350);
    if (key && value && !meta[key]) meta[key] = value;
  }
  const assetList = [];
  const links = [];
  const logoCandidates = [];
  const icons = [];
  const stylesheets = [];
  const addAsset = (raw, type, extra = {}) => {
    const ref = safeReference(raw, pageUrl);
    if (!ref) return null;
    const item = { url: ref.url, type, sourcePage: cleanPageUrl(pageUrl), sameOrigin: new URL(ref.url).origin === rootOrigin };
    if (extra.alt) item.alt = plainText(extra.alt, 160);
    if (extra.label) item.label = plainText(extra.label, 100);
    if (ref.queryRemoved) item.queryRemoved = true;
    if (!assetList.some(x => x.url === item.url && x.type === item.type) && assetList.length < MAX_ASSETS) assetList.push(item);
    return item;
  };
  const linkTags = tags(content, 'link');
  for (const tag of linkTags) {
    const a = attrs(tag);
    const rel = String(a.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('stylesheet')) {
      const item = addAsset(a.href, 'stylesheet');
      if (item && item.sameOrigin && stylesheets.length < MAX_CSS_FILES && !stylesheets.includes(item.url)) stylesheets.push(item.url);
    } else if (rel.includes('icon') || rel.includes('shortcut')) {
      const item = addAsset(a.href, 'icon', { label: a.sizes || 'favicon' });
      if (item) icons.push(item.url);
    } else if (rel.includes('apple-touch-icon')) {
      const item = addAsset(a.href, 'icon', { label: 'Apple touch icon' });
      if (item) icons.push(item.url);
    } else if (rel.includes('manifest')) addAsset(a.href, 'manifest');
    else if (rel.includes('preload') || rel.includes('prefetch')) addAsset(a.href, 'preload');
  }
  for (const tag of tags(content, 'script')) {
    const a = attrs(tag);
    if (a.src) addAsset(a.src, 'script', { label: a.type || 'JavaScript' });
  }
  for (const tag of tags(content, 'img')) {
    const a = attrs(tag);
    const src = a.src || a['data-src'] || a['data-lazy-src'] || '';
    const item = addAsset(src, 'image', { alt: a.alt, label: a.class || a.id || '' });
    const hint = [a.alt, a.class, a.id, a.title, src].join(' ').toLowerCase();
    if (item && /(?:logo|wordmark|brand[-_ ]?mark|site[-_ ]?identity)/i.test(hint)) {
      logoCandidates.push({ url: item.url, source: 'image element metadata', confidence: 'high', alt: plainText(a.alt, 160) });
    }
    if (a.srcset) {
      const first = a.srcset.split(',')[0].trim().split(/\s+/)[0];
      if (first) addAsset(first, 'image', { alt: a.alt, label: 'srcset candidate' });
    }
  }
  for (const tagName of ['source', 'video', 'audio', 'track']) {
    for (const tag of tags(content, tagName)) {
      const a = attrs(tag);
      if (a.src) addAsset(a.src, tagName === 'source' ? 'media-source' : tagName);
    }
  }
  for (const tag of tags(content, 'a')) {
    const a = attrs(tag);
    if (!a.href || /\bnofollow\b/i.test(a.rel || '')) continue;
    const ref = safeReference(a.href, pageUrl);
    if (!ref || new URL(ref.url).origin !== rootOrigin) continue;
    const parsed = new URL(ref.url);
    if (/\.(?:css|js|mjs|json|xml|png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|mp[34]|webm|woff2?|ttf|otf)$/i.test(parsed.pathname)) continue;
    const item = { url: ref.url, text: plainText(textFromHtml(tag.replace(/<a\b[^>]*>/i, '').replace(/<\/a\s*>/i, '')), 140), sourcePage: cleanPageUrl(pageUrl), category: category(parsed.pathname) };
    if (!links.some(x => x.url === item.url) && links.length < 80) links.push(item);
  }
  const styleContent = (content.match(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi) || []).map(tag => tag.replace(/<\/?style\b[^>]*>/gi, '')).join('\n');
  const cssAssets = [];
  for (const match of styleContent.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    const item = addAsset(match[2], 'css-resource');
    if (item && !cssAssets.some(x => x.url === item.url)) cssAssets.push(item);
  }
  const heading1 = [...content.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map(m => textFromHtml(m[1])).filter(Boolean).slice(0, 4);
  const headings = [...content.matchAll(/<h[2-3]\b[^>]*>([\s\S]*?)<\/h[2-3]\s*>/gi)].map(m => textFromHtml(m[1])).filter(Boolean).slice(0, 6);
  const titleMatch = content.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = titleMatch ? textFromHtml(titleMatch[1]).slice(0, 160) : '';
  const canonicalTag = linkTags.find(tag => /\brel\s*=\s*(['"])[^'"]*\bcanonical\b[^'"]*\1/i.test(tag));
  const canonicalRaw = canonicalTag ? attrs(canonicalTag).href : '';
  const canonical = canonicalRaw ? safeReference(canonicalRaw, pageUrl)?.url || '' : '';
  const styleColors = cssColors(styleContent);
  return {
    title, meta,
    description: meta.description || meta['og:description'] || meta['twitter:description'] || '',
    siteName: meta['og:site_name'] || meta['application-name'] || '',
    themeColor: normalizeColor(meta['theme-color'] || ''),
    heading1, headings, canonical, links, assets: assetList, logos: logoCandidates,
    icons, stylesheets, colors: styleColors,
  };
}
function htmlResponse(resource) {
  return resource.contentType.includes('text/html') || resource.contentType.includes('application/xhtml+xml') || /^\s*(?:<!doctype\s+html|<html\b)/i.test(resource.text || '');
}
function cssResponse(resource) {
  return resource.contentType.includes('text/css') || /^\s*(?:@charset|@import|\/\*|:root|html\b|body\b|\.[a-z_-])/i.test(resource.text || '');
}
function treeFromPages(pages) {
  const map = new Map(pages.map(page => [page.url, { ...page, children: [] }]));
  const roots = [];
  for (const page of pages) {
    const node = map.get(page.url);
    const parent = page.parentUrl && map.get(page.parentUrl);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
function assetCounts(assets) {
  const result = {};
  for (const item of assets) result[item.type] = (result[item.type] || 0) + 1;
  return result;
}
function collectBrand(rootSignals, signals, rootUrl) {
  const colors = {};
  const evidence = [];
  for (const current of signals) {
    if (!current) continue;
    if (current.themeColor && !colors.primary) {
      colors.primary = current.themeColor;
      evidence.push({ field: 'primary', source: 'meta theme-color', value: current.themeColor });
    }
    for (const key of ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted']) {
      if (current.colors?.[key] && !colors[key]) {
        colors[key] = current.colors[key];
        evidence.push({ field: key, source: 'CSS custom property', value: current.colors[key] });
      }
    }
  }
  const logo = signals.flatMap(item => item?.logos || [])[0] || null;
  const faviconUrl = signals.flatMap(item => item?.icons || [])[0] || '';
  const name = plainText(rootSignals?.siteName || rootSignals?.title || new URL(rootUrl).hostname, 120);
  const evidenceCount = Object.keys(colors).length + (logo ? 1 : 0) + (faviconUrl ? 1 : 0);
  return { name, colors, logo, faviconUrl, confidence: evidenceCount >= 4 ? 'high' : (evidenceCount ? 'medium' : 'low'), evidence: evidence.slice(0, 14) };
}
function summarizePage(page) {
  return {
    url: page.url, path: page.path, title: page.title || '', category: page.category,
    depth: page.depth, parentUrl: page.parentUrl || null, discoveredFrom: page.discoveredFrom,
    status: page.status, httpStatus: page.httpStatus, contentType: page.contentType,
    headings: page.headings || [], description: page.description || '', warning: page.warning || '',
  };
}
function reportFromPages(inputUrl, rootUrl, pages, data = {}) {
  const pageList = pages.slice(0, MAX_DISCOVERED).map(summarizePage);
  const brand = collectBrand(data.rootSignals || null, data.signals || [], rootUrl);
  const assets = data.assets || [];
  const warnings = [...new Set(data.warnings || [])].slice(0, 18);
  const limitations = [...new Set(data.limitations || [])];
  return {
    ok: true,
    report: {
      schemaVersion: 1,
      source: { inputUrl, canonicalUrl: rootUrl, hostname: new URL(rootUrl).hostname, analyzedAt: new Date().toISOString(), fetchPolicy: 'public HTTP(S), public-DNS checks, bounded redirects, pages and response sizes' },
      summary: {
        pagesDiscovered: pageList.length,
        pagesInspected: data.inspectedCount || 0,
        pagesBlocked: pageList.filter(p => ['robots-blocked', 'http-error', 'fetch-error'].includes(p.status)).length,
        internalLinksDiscovered: data.linkCount || 0,
        assetsDiscovered: assets.length,
        assetsByType: assetCounts(assets),
        sitemapUsed: Boolean(data.sitemapUsed),
        pageLimitReached: Boolean(data.pageLimitReached),
      },
      siteMap: { rootUrl, tree: treeFromPages(pageList), pages: pageList },
      pages: pageList.filter(p => p.status === 'inspected' || p.status === 'http-error').slice(0, MAX_PAGES),
      branding: brand,
      assets: { total: assets.length, byType: assetCounts(assets), items: assets },
      robots: { checked: Boolean(data.robots?.checked), disallowedPaths: [...new Set((data.robots?.rules || []).filter(r => r.type === 'disallow').map(r => r.path))].slice(0, 20), note: data.robots?.note || '' },
      capabilities: {
        can: [
          'Inspect publicly reachable HTML without signing in to the source website.',
          'Discover same-origin links and group likely Home, About, Contact, Products, Services, Blog and account pages.',
          'Extract titles, descriptions, headings, canonical URLs, theme-color metadata, CSS custom-property colors, logo hints and favicon/manifest references.',
          'List image, stylesheet, script, font, icon, manifest and media URLs; inspect up to two same-origin stylesheets for colors and CSS resources.',
          'Produce a bounded site map, branding evidence, asset inventory and a report of blocked or uninspected pages.',
        ],
        cannot: [
          'Sign in, bypass paywalls, ignore robots.txt disallow rules or inspect private pages.',
          'Run the original website as an application or reproduce content that appears only after interaction.',
          'Copy images and other files automatically, map every page on a large website or reconstruct all application routes.',
          'Confirm live payments, form submissions, sign-in, data storage or other account-connected actions.',
        ],
      },
      limitations,
      warnings,
      limits: { maxPagesInspected: MAX_PAGES, maxPageFetchAttempts: MAX_PAGES, maxDiscoveredPages: MAX_DISCOVERED, maxAssetsReported: MAX_ASSETS, maxCssFilesInspected: MAX_CSS_FILES, maxHtmlBytesPerPage: MAX_HTML_BYTES, maxCssBytesPerFile: MAX_CSS_BYTES, maxRedirects: MAX_REDIRECTS },
    },
  };
}
export async function analyzePublicWebsite(input, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const normalized = normalizeAnalyzerUrl(input);
  const inputUrl = normalized.displayUrl;
  const requestUrl = normalized.url;
  const originalUrl = new URL(requestUrl);
  const validatedHosts = new Set();
  const warnings = [];
  const limitations = [];
  const discovered = new Map();
  const inspected = new Map();
  const signals = [];
  const assets = [];
  const assetKeys = new Set();
  const foundLinks = new Set();
  let sitemapUsed = false;
  let pageLimitReached = false;
  let robots = { checked: false, rules: [], note: 'robots.txt could not be checked; inspection remained bounded.' };
  const robotsByOrigin = new Map();
  let rootOrigin = originalUrl.origin;
  await verifyPublicHost(hostOf(originalUrl), fetchImpl);
  validatedHosts.add(hostOf(originalUrl));

  async function checkRedirectPolicy(next, previous) {
    let policy = robotsByOrigin.get(next.origin);
    if (!policy) {
      const destinationHost = hostOf(next);
      if (!validatedHosts.has(destinationHost)) {
        await verifyPublicHost(destinationHost, fetchImpl);
        validatedHosts.add(destinationHost);
      }
      let response;
      try {
        response = await fetchImpl(new URL('/robots.txt', next.origin).href, {
          method: 'GET', redirect: 'manual', credentials: 'omit',
          headers: { Accept: 'text/plain,*/*;q=0.1' },
          signal: await signalFor(DNS_TIMEOUT_MS),
        });
      } catch {
        fail('REDIRECT_ROBOTS_CHECK_FAILED', 'OVYX could not check robots.txt at the redirect destination, so it stopped before fetching that page.', 502);
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        fail('REDIRECT_ROBOTS_CHECK_FAILED', 'The redirect destination robots.txt also redirects. OVYX stopped rather than assume that destination path is allowed.', 502);
      }
      if (!response.ok && response.status !== 401 && response.status !== 403 && response.status !== 404) {
        fail('REDIRECT_ROBOTS_CHECK_FAILED', 'OVYX could not verify the redirect destination robots.txt response, so it stopped before fetching that page.', 502);
      }
      let rules = [];
      let note = '';
      if (response.status === 200 && String(response.headers.get('content-type') || '').toLowerCase().includes('text/plain')) {
        const robotsBody = await boundedText(response, MAX_ROBOTS_BYTES);
        rules = parseRobots(robotsBody.text);
      } else if (response.status === 401 || response.status === 403) {
        note = 'The redirect destination robots.txt returned HTTP ' + response.status + '; its page was not assumed to be blocked, but automated access may be restricted.';
      }
      policy = { checked: true, rules, note };
      robotsByOrigin.set(next.origin, policy);
      if (note) warnings.push(note);
    }
    if (policy.checked && !robotsAllows(next, policy.rules)) {
      fail('ROBOTS_REDIRECT_BLOCKED', 'The requested URL redirects to a path disallowed by robots.txt. OVYX did not fetch the redirect destination.', 403);
    }
  }

  async function fetchResource(url, config = {}) {
    return fetchPublic(url, {
      fetchImpl, validatedHosts, maxBytes: config.maxBytes || MAX_HTML_BYTES,
      accept: config.accept || 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      expectedOrigin: config.expectedOrigin || '',
      beforeRedirect: config.beforeRedirect === false ? undefined : checkRedirectPolicy,
    });
  }
  try {
    const r = await fetchResource(new URL('/robots.txt', originalUrl.origin).href, {
      maxBytes: MAX_ROBOTS_BYTES, accept: 'text/plain,*/*;q=0.1', expectedOrigin: originalUrl.origin, beforeRedirect: false,
    });
    if (r.response.status === 200 && r.contentType.includes('text/plain')) robots = { checked: true, rules: parseRobots(r.text), note: '' };
    else if (r.response.status === 401 || r.response.status === 403) {
      robots = { checked: true, rules: [], note: 'robots.txt returned HTTP ' + r.response.status + '; automated access may be restricted.' };
      warnings.push(robots.note);
    } else robots = { checked: true, rules: [], note: '' };
  } catch (error) {
    robots = { checked: false, rules: [], note: 'robots.txt could not be checked; strict page and byte limits still apply.' };
    warnings.push(String(error?.message || 'Public access rules could not be checked for this website.').slice(0, 160));
  }
  robotsByOrigin.set(originalUrl.origin, robots);
  const inputPath = new URL(inputUrl);
  if (!robotsAllows(inputPath, robots.rules)) {
    limitations.push('Public access rules do not allow this page to be reviewed.');
    const blocked = {
      url: inputUrl, path: inputPath.pathname || '/', title: '', category: category(inputPath.pathname),
      depth: 0, parentUrl: '', discoveredFrom: 'submitted URL', status: 'robots-blocked',
      httpStatus: null, contentType: '', headings: [], description: '', warning: 'Public access rules do not allow this page.',
    };
    return reportFromPages(inputUrl, inputUrl, [blocked], { warnings, limitations, robots });
  }

  const home = await fetchResource(requestUrl);
  const rootUrl = cleanPageUrl(home.url);
  // Count every page navigation attempt, including failed/non-HTML responses, so a sitemap full of bad links cannot amplify work.
  rootOrigin = new URL(rootUrl).origin;
  if (rootOrigin !== originalUrl.origin) {
    const redirectPolicy = robotsByOrigin.get(rootOrigin);
    if (redirectPolicy) {
      robots = redirectPolicy;
    } else {
      try {
        const r = await fetchResource(new URL('/robots.txt', rootOrigin).href, { maxBytes: MAX_ROBOTS_BYTES, accept: 'text/plain,*/*;q=0.1', expectedOrigin: rootOrigin, beforeRedirect: false });
        if (r.response.status === 200 && r.contentType.includes('text/plain')) robots = { checked: true, rules: parseRobots(r.text), note: '' };
        else robots = { checked: true, rules: [], note: '' };
      } catch { warnings.push('Public access rules could not be checked for the final page.'); }
      robotsByOrigin.set(rootOrigin, robots);
    }
  }
  const rootSignals = htmlResponse(home) ? parseHtml(home.text, rootUrl, rootOrigin) : null;
  const rootPage = {
    url: rootUrl, path: new URL(rootUrl).pathname || '/', title: rootSignals?.title || new URL(rootUrl).hostname,
    category: category(new URL(rootUrl).pathname), depth: 0, parentUrl: '', discoveredFrom: 'submitted URL',
    status: home.response.status >= 400 ? 'http-error' : (rootSignals ? 'inspected' : 'not-html'),
    httpStatus: home.response.status, contentType: home.contentType || '',
    headings: [...(rootSignals?.heading1 || []), ...(rootSignals?.headings || [])].slice(0, 8),
    description: rootSignals?.description || '', warning: home.truncated ? 'Only part of this page was reviewed because it was too large.' : '',
  };
  let pageFetchAttempts = 1;
  discovered.set(rootUrl, rootPage);
  inspected.set(rootUrl, { ...rootPage, signals: rootSignals });
  if (rootSignals) signals.push(rootSignals);
  for (const asset of rootSignals?.assets || []) {
    const key = asset.type + '|' + asset.url;
    if (!assetKeys.has(key) && assets.length < MAX_ASSETS) { assetKeys.add(key); assets.push(asset); }
  }
  if (home.truncated) warnings.push('Only part of the homepage was reviewed because it was too large.');

  function addPage(raw, parent, depth, source) {
    const ref = safeReference(raw, rootUrl);
    if (!ref || new URL(ref.url).origin !== rootOrigin) return;
    const url = cleanPageUrl(ref.url);
    if (!discovered.has(url) && discovered.size < MAX_DISCOVERED) {
      const parsed = new URL(url);
      discovered.set(url, {
        url, path: parsed.pathname || '/', title: '', category: category(parsed.pathname), depth,
        parentUrl: parent || rootUrl, discoveredFrom: source || 'internal link',
        status: 'not-inspected', httpStatus: null, contentType: '', headings: [], description: '', warning: '',
      });
    }
    foundLinks.add(url);
  }
  for (const link of rootSignals?.links || []) addPage(link.url, rootUrl, 1, 'link: ' + (link.text || link.category));

  if (robotsAllows(new URL('/sitemap.xml', rootOrigin), robots.rules)) {
    try {
      const sitemap = await fetchResource(new URL('/sitemap.xml', rootOrigin).href, {
        maxBytes: MAX_SITEMAP_BYTES, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1', expectedOrigin: rootOrigin,
      });
      if (sitemap.response.status === 200 && /(?:xml|text\/plain)/.test(sitemap.contentType) && /<(?:urlset|sitemapindex)\b/i.test(sitemap.text)) {
        const locs = [...sitemap.text.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)].map(m => plainText(m[1], 2048)).filter(Boolean).slice(0, MAX_DISCOVERED);
        let count = 0;
        for (const loc of locs) {
          const ref = safeReference(loc, rootUrl);
          if (!ref || new URL(ref.url).origin !== rootOrigin) continue;
          addPage(ref.url, rootUrl, 1, 'sitemap.xml');
          count++;
        }
        sitemapUsed = count > 0;
      }
    } catch (error) { warnings.push('The website sitemap could not be reviewed.); }
  }

  const queue = [...discovered.values()].map(item => ({ url: item.url, depth: item.depth, parent: item.parentUrl }));
  const queued = new Set(queue.map(item => item.url));
  while (queue.length && pageFetchAttempts < MAX_PAGES) {
    const current = queue.shift();
    if (inspected.has(current.url)) continue;
    const parsed = new URL(current.url);
    if (parsed.origin !== rootOrigin) continue;
    if (!robotsAllows(parsed, robots.rules)) {
      const item = discovered.get(current.url);
      if (item) { item.status = 'robots-blocked'; item.warning = 'Public access rules do not allow this page.'; }
      continue;
    }
    let resource;
    pageFetchAttempts++;
    try { resource = await fetchResource(current.url, { expectedOrigin: rootOrigin }); }
    catch (error) {
      const item = discovered.get(current.url);
      if (item) { item.status = 'fetch-error'; item.warning = 'This page could not be reviewed.'; }
      warnings.push('A discovered page could not be reviewed.');
      continue;
    }
    if (new URL(resource.url).origin !== rootOrigin) {
      const item = discovered.get(current.url);
      if (item) { item.status = 'fetch-error'; item.warning = 'The page redirected outside the source origin.'; }
      continue;
    }
    if (!htmlResponse(resource)) {
      const item = discovered.get(current.url);
      if (item) { item.status = 'not-html'; item.httpStatus = resource.response.status; item.contentType = resource.contentType; item.warning = 'The linked resource is not HTML.'; }
      continue;
    }
    const pageSignals = parseHtml(resource.text, current.url, rootOrigin);
    const item = discovered.get(current.url);
    if (item) {
      item.title = pageSignals.title || parsed.pathname || parsed.hostname;
      item.description = pageSignals.description || '';
      item.headings = [...pageSignals.heading1, ...pageSignals.headings].slice(0, 8);
      item.status = resource.response.status >= 400 ? 'http-error' : 'inspected';
      item.httpStatus = resource.response.status;
      item.contentType = resource.contentType;
      item.warning = resource.truncated ? 'Only the beginning of this page was inspected because it exceeded the byte limit.' : '';
    }
    inspected.set(current.url, { ...(item || {}), signals: pageSignals });
    signals.push(pageSignals);
    for (const asset of pageSignals.assets) {
      const key = asset.type + '|' + asset.url;
      if (!assetKeys.has(key) && assets.length < MAX_ASSETS) { assetKeys.add(key); assets.push(asset); }
    }
    for (const link of pageSignals.links) {
      const before = discovered.size;
      addPage(link.url, current.url, current.depth + 1, 'link: ' + (link.text || link.category));
      const url = cleanPageUrl(link.url);
      if (current.depth < 2 && discovered.has(url) && !queued.has(url) && !inspected.has(url) && discovered.size > before) {
        queued.add(url);
        queue.push({ url, depth: current.depth + 1, parent: current.url });
      }
    }
    if (resource.truncated) warnings.push('Only part of a page was reviewed because it was too large.');
  }
  if (queue.length || [...discovered.values()].some(page => page.status === 'not-inspected')) pageLimitReached = pageFetchAttempts >= MAX_PAGES;

  const cssUrls = [];
  for (const page of inspected.values()) {
    for (const url of page.signals?.stylesheets || []) if (new URL(url).origin === rootOrigin && !cssUrls.includes(url)) cssUrls.push(url);
  }
  for (const cssUrl of cssUrls.slice(0, MAX_CSS_FILES)) {
    if (!robotsAllows(new URL(cssUrl), robots.rules)) {
      warnings.push('A linked stylesheet was skipped because robots.txt disallows it.');
      continue;
    }
    try {
      const css = await fetchResource(cssUrl, { maxBytes: MAX_CSS_BYTES, accept: 'text/css,*/*;q=0.1', expectedOrigin: rootOrigin });
      if (css.response.status < 200 || css.response.status >= 400 || !cssResponse(css)) continue;
      signals.push({ colors: cssColors(css.text), themeColor: '', logos: [], icons: [], meta: {} });
      for (const match of css.text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
        const ref = safeReference(match[2], css.url);
        if (!ref) continue;
        const url = ref.url;
        const type = /\.(?:woff2?|ttf|otf)$/i.test(new URL(url).pathname) ? 'font' : 'css-resource';
        const key = type + '|' + url;
        if (!assetKeys.has(key) && assets.length < MAX_ASSETS) {
          assetKeys.add(key);
          assets.push({ url, type, sourcePage: css.url, sameOrigin: new URL(url).origin === rootOrigin, queryRemoved: ref.queryRemoved || undefined });
        }
      }
      if (css.truncated) warnings.push('Only part of a stylesheet was reviewed because it was too large.');
    } catch (error) {
      warnings.push('A page stylesheet could not be reviewed.);
    }
  }
  if (pageLimitReached) limitations.push('The first six eligible pages were reviewed. Other links may be listed without being opened.');
  if (normalized.hadQueryOrFragment) limitations.push('Tracking parameters and URL fragments are omitted to help protect private values. Routes that depend on them may appear by path only.');
  limitations.push('This review uses public pages and up to two stylesheets. It does not run the original website as an application or recreate pages that appear only after interaction.');
  limitations.push('Images and other resources are listed as links but are not copied into your app automatically.');
  limitations.push('Pages that require sign-in or restrict public access are not bypassed. Restricted pages are noted in the report.');
  limitations.push('This review cannot confirm payments, form submissions, sign-in, data storage, checkout or other account-connected features.');
  limitations.push('The website address is checked before inspection. Some network-level address changes cannot be fully prevented by the browser.');
  if (robots.note) warnings.push(robots.note);

  return reportFromPages(inputUrl, rootUrl, [...discovered.values()], {
    inspectedCount: [...inspected.values()].filter(p => p.status === 'inspected').length,
    linkCount: foundLinks.size,
    rootSignals,
    signals,
    assets,
    warnings,
    limitations,
    robots,
    pageLimitReached,
    sitemapUsed,
  });
}
