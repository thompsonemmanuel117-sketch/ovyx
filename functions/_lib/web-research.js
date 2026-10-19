const MAX_QUERIES = 3;
const MAX_SEARCH_RESULTS = 18;
const MAX_OPEN_SOURCES = 5;
const MAX_PAGE_BYTES = 55_000;
const MAX_PAGE_TEXT = 7_500;
const REQUEST_TIMEOUT_MS = 5_000;

function cleanText(value, max = 1200) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, function (_, code) {
      const n = Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, code) {
      const n = parseInt(code, 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    });
}

function stripTags(value) {
  return decodeEntities(String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template|nav|footer|header|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/main|\/blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function stripResearchHtml(value) {
  return cleanText(stripTags(value), MAX_PAGE_TEXT);
}

function publicHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.test') || host.endsWith('.invalid') ||
      host.endsWith('.example') || host.includes(':')) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const octets = host.split('.').map(Number);
    if (octets.some(n => n < 0 || n > 255)) return false;
    const a = octets[0], b = octets[1], c = octets[2];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 255) return false;
  }
  return true;
}

export function isSafePublicUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['https:', 'http:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (!publicHostname(url.hostname)) return false;
    if (url.port && !['80', '443'].includes(url.port)) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizePublicUrl(value, base) {
  try {
    const url = new URL(decodeEntities(String(value || '')), base || 'https://example.com/');
    if (/(?:^|\.)duckduckgo\.com$/i.test(url.hostname) && url.pathname === '/l/' && url.searchParams.has('uddg')) {
      return normalizePublicUrl(url.searchParams.get('uddg'));
    }
    if (!isSafePublicUrl(url.href)) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function faviconFor(value) {
  const domain = hostOf(value);
  return domain ? 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=48' : '';
}

export function buildWebResearchQueries(prompt) {
  let base = String(prompt || '').trim();
  base = base
    .replace(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+|i\s+(?:want|need)\s+you\s+to\s+)?/i, '')
    .replace(/^(?:search|research|look\s+up|browse)\s+(?:(?:the\s+)?(?:internet|web|online)\s+(?:(?:deeply|thoroughly|carefully)\s+)?(?:for|about)\s+)?/i, '')
    .replace(/\b(?:on\s+the\s+internet|on\s+the\s+web|online)\b/gi, ' ')
    .replace(/\b(?:deeply|thoroughly|carefully)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .slice(0, 220);
  if (!base) return [];
  const queries = [base, base + ' official documentation', base + ' examples implementation best practices'];
  return queries.map(q => cleanText(q, 260)).filter((q, i, all) => q && all.indexOf(q) === i).slice(0, MAX_QUERIES);
}

function attr(attributes, name) {
  const pattern = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const match = String(attributes || '').match(pattern);
  return decodeEntities(match ? (match[1] ?? match[2] ?? match[3] ?? '') : '');
}

function normalizeSearchResult(item, query, engine) {
  if (!item || typeof item !== 'object') return null;
  const rawUrl = item.url || item.link || item.href || '';
  const url = normalizePublicUrl(rawUrl);
  if (!url) return null;
  const title = cleanText(stripTags(item.title || item.name || ''), 240) || hostOf(url);
  const snippet = cleanText(stripTags(item.content || item.snippet || item.description || item.body || item.text || ''), 900);
  return {
    title,
    url,
    domain: hostOf(url),
    snippet,
    query: cleanText(query, 260),
    engine: cleanText(engine, 40),
    favicon: faviconFor(url),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : null
  };
}

function unwrapDuckDuckGoUrl(raw, base) {
  const href = normalizePublicUrl(raw, base);
  return href;
}

export function parseSearchResultsHtml(html, engine = 'DuckDuckGo', query = '') {
  const source = String(html || '');
  const results = [];
  const isBing = /bing/i.test(engine);
  if (isBing) {
    const blocks = source.match(/<li\b[^>]*class=["'][^"']*b_algo[^"']*["'][^>]*>[\s\S]*?<\/li>/gi) || [];
    for (const block of blocks) {
      const match = block.match(/<h2\b[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>/i);
      if (!match) continue;
      const url = unwrapDuckDuckGoUrl(attr(match[1], 'href'), 'https://www.bing.com/');
      if (!url) continue;
      const snippetMatch = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
      const item = normalizeSearchResult({ url, title: match[2], snippet: snippetMatch ? snippetMatch[1] : '' }, query, engine);
      if (item) results.push(item);
      if (results.length >= 10) break;
    }
    return results;
  }

  const anchors = source.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const anchor of anchors) {
    const opening = (anchor.match(/^<a\b([^>]*)>/i) || [])[1] || '';
    const classes = attr(opening, 'class');
    if (!/(?:result__a|result-link|result-link-title)/i.test(classes)) continue;
    const url = unwrapDuckDuckGoUrl(attr(opening, 'href'), 'https://html.duckduckgo.com/');
    if (!url) continue;
    const title = anchor.replace(/^<a\b[^>]*>/i, '').replace(/<\/a>$/i, '');
    const item = normalizeSearchResult({ url, title }, query, engine);
    if (item) results.push(item);
    if (results.length >= 10) break;
  }

  const snippets = [];
  const snippetPattern = /<(?:a|div|span)[^>]*class=["'][^"']*(?:result__snippet|result-snippet|result-snippet-link)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi;
  let snippetMatch;
  while ((snippetMatch = snippetPattern.exec(source)) && snippets.length < results.length) {
    snippets.push(cleanText(stripTags(snippetMatch[1]), 900));
  }
  return results.map((item, index) => ({ ...item, snippet: snippets[index] || item.snippet }));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error('Search provider request failed.');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchTavily(env, query) {
  const payload = await requestJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
      topic: 'general'
    })
  });
  return (Array.isArray(payload.results) ? payload.results : [])
    .map(item => normalizeSearchResult(item, query, 'Tavily')).filter(Boolean);
}

async function searchBrave(env, query) {
  const url = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=8&text_decorations=false';
  const payload = await requestJson(url, {
    headers: { accept: 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY }
  });
  return (Array.isArray(payload.web && payload.web.results) ? payload.web.results : [])
    .map(item => normalizeSearchResult(item, query, 'Brave Search')).filter(Boolean);
}

async function searchSerper(env, query) {
  const payload = await requestJson('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': env.SERPER_API_KEY },
    body: JSON.stringify({ q: query, num: 8 })
  });
  return (Array.isArray(payload.organic) ? payload.organic : [])
    .map(item => normalizeSearchResult(item, query, 'Serper')).filter(Boolean);
}

async function searchHtmlFallback(query) {
  const requests = [
    { name: 'DuckDuckGo', url: 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), base: 'https://html.duckduckgo.com/' },
    { name: 'DuckDuckGo Lite', url: 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query), base: 'https://lite.duckduckgo.com/' },
    { name: 'Bing', url: 'https://www.bing.com/search?q=' + encodeURIComponent(query), base: 'https://www.bing.com/' }
  ];
  async function getResults(item) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(item.url, {
          signal: controller.signal,
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'Mozilla/5.0 (compatible; OVYXWebStudioResearch/1.0; +https://ovyx.app)',
            'accept-language': 'en-US,en;q=0.8'
          }
        });
        if (!response.ok) return { name: item.name, results: [] };
        const html = await response.text();
        return { name: item.name, results: parseSearchResultsHtml(html, item.name, query) };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return { name: item.name, results: [] };
    }
  }
  const primary = await getResults(requests[0]);
  if (primary.results.length) return primary.results;
  const fallbacks = await Promise.all(requests.slice(1).map(getResults));
  const found = fallbacks.find(item => item.results.length);
  return found ? found.results : [];
}

async function searchOne(env, query) {
  const providers = [];
  if (env && env.TAVILY_API_KEY) providers.push(() => searchTavily(env, query));
  if (env && env.BRAVE_SEARCH_API_KEY) providers.push(() => searchBrave(env, query));
  if (env && env.SERPER_API_KEY) providers.push(() => searchSerper(env, query));
  for (const provider of providers) {
    try {
      const results = await provider();
      if (results.length) return results;
    } catch {}
  }
  return searchHtmlFallback(query);
}

async function readBoundedResponse(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return (await response.text()).slice(0, maxBytes);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const item = await reader.read();
      if (item.done) break;
      const chunk = item.value;
      const take = Math.min(chunk.length, maxBytes - total);
      chunks.push(chunk.slice(0, take));
      total += take;
      if (take < chunk.length) break;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(all);
}

async function readPublicPage(rawUrl) {
  let current = normalizePublicUrl(rawUrl);
  if (!current) throw new Error('The source URL is not a safe public web address.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      if (!isSafePublicUrl(current)) throw new Error('A source redirected to a blocked address.');
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.8',
          'user-agent': 'Mozilla/5.0 (compatible; OVYXWebStudioResearch/1.0; +https://ovyx.app)',
          'accept-language': 'en-US,en;q=0.8'
        }
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new Error('Source redirects could not be safely followed.');
        current = normalizePublicUrl(location, current);
        if (!current) throw new Error('A source redirected to a blocked address.');
        continue;
      }
      break;
    }
    if (!response || !response.ok) throw new Error('The source page could not be opened.');
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!/(?:text\/html|application\/xhtml\+xml|text\/plain|application\/json)/.test(type)) {
      throw new Error('The source is not a readable text page.');
    }
    const body = await readBoundedResponse(response, MAX_PAGE_BYTES);
    const isHtml = /html|xhtml/.test(type);
    const titleMatch = isHtml ? body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) : null;
    const descMatch = isHtml ? body.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i) : null;
    const description = descMatch ? attr(descMatch[0], 'content') : '';
    const bodyText = isHtml ? stripTags(body) : cleanText(body, MAX_PAGE_TEXT);
    return {
      title: titleMatch ? cleanText(stripTags(titleMatch[1]), 240) : '',
      description: cleanText(stripTags(description), 900),
      content: cleanText(bodyText, MAX_PAGE_TEXT),
      finalUrl: current,
      truncated: body.length >= MAX_PAGE_BYTES
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function conductWebResearch(env, prompt, send = function () {}) {
  const queries = buildWebResearchQueries(prompt);
  if (!queries.length) {
    throw Object.assign(new Error('Please describe what you want to research online.'), { code: 'WEB_RESEARCH_QUERY_REQUIRED' });
  }

  const collected = [];
  const seenUrls = new Set();
  const engines = new Set();

  const searchBatches = await Promise.all(queries.slice(0, MAX_QUERIES).map(async (query, index) => {
    send('progress', {
      phase: 'search',
      status: 'running',
      title: 'Searching the web',
      detail: 'Running search ' + (index + 1) + ' of ' + queries.length + ': ' + query,
      current: index + 1,
      total: queries.length
    });
    const results = await searchOne(env || {}, query);
    send('progress', {
      phase: 'search',
      status: 'running',
      title: 'Collecting search results',
      detail: 'Search ' + (index + 1) + ' returned ' + results.length + ' public result(s).',
      current: index + 1,
      total: queries.length
    });
    return { query, results };
  }));

  for (const batch of searchBatches) {
    for (const result of batch.results) {
      if (!result || !result.url || seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      engines.add(result.engine);
      collected.push(result);
      if (collected.length >= MAX_SEARCH_RESULTS) break;
    }
    if (collected.length >= MAX_SEARCH_RESULTS) break;
  }

  if (!collected.length) {
    throw Object.assign(
      new Error('Live web search did not return usable public results. No online sources have been verified; try again or configure a supported search provider.'),
      { code: 'WEB_RESEARCH_NO_RESULTS', status: 502 }
    );
  }

  const candidates = collected.slice(0, MAX_OPEN_SOURCES);
  const sources = await Promise.all(candidates.map(async (item, index) => {
    send('progress', {
      phase: 'read',
      status: 'running',
      title: 'Reading a source page',
      detail: 'Opening source ' + (index + 1) + ' of ' + candidates.length + ': ' + item.title,
      current: index + 1,
      total: candidates.length,
      source: { title: item.title, url: item.url, domain: item.domain, favicon: item.favicon }
    });

    let page = null;
    try {
      page = await readPublicPage(item.url);
    } catch {}

    const source = {
      title: cleanText(page && page.title || item.title, 240),
      url: page && page.finalUrl || item.url,
      domain: hostOf(page && page.finalUrl || item.url),
      favicon: faviconFor(page && page.finalUrl || item.url),
      query: item.query,
      snippet: cleanText(item.snippet || page && page.description || '', 900),
      description: cleanText(page && page.description || '', 900),
      content: cleanText(page && page.content || item.snippet || '', MAX_PAGE_TEXT),
      readStatus: page && page.content ? 'page_read' : 'snippet_only',
      truncated: !!(page && page.truncated),
      engine: item.engine
    };
    send('source', {
      source: {
        title: source.title,
        url: source.url,
        domain: source.domain,
        favicon: source.favicon,
        readStatus: source.readStatus,
        index: index + 1,
        total: candidates.length
      }
    });
    return source;
  }));

  const research = {
    status: 'complete',
    query: cleanText(prompt, 260),
    queries,
    engines: Array.from(engines).slice(0, 4),
    searchedAt: new Date().toISOString(),
    resultCount: collected.length,
    sourcesRead: sources.filter(source => source.readStatus === 'page_read').length,
    sources: sources.slice(0, MAX_OPEN_SOURCES),
    results: collected.slice(0, 10).map(item => ({
      title: item.title,
      url: item.url,
      domain: item.domain,
      snippet: item.snippet,
      query: item.query,
      engine: item.engine,
      favicon: item.favicon
    }))
  };

  send('progress', {
    phase: 'compare',
    status: 'running',
    title: 'Comparing findings',
    detail: 'Collected ' + research.resultCount + ' results and opened ' + research.sourcesRead + ' of ' + sources.length + ' source pages. Web Studio is ready to use this evidence.'
  });
  return research;
}
