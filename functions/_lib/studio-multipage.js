import { normalizeSiteMap, createSiteBuildBatches, mergeStagedChanges, buildSiteBatchContext } from './multi-page.js';
import { validateChanges } from './validator.js';
function cap(env, key, fallback) { const n = Number(env && env[key]); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function singlePage(prompt) { return /\b(?:one[-\s]?page|single[-\s]?page|landing[-\s]?page\s+only|homepage\s+only)\b/i.test(String(prompt || '')); }
function manyPages(prompt) { return /\b(?:multi[-\s]?page|multiple\s+pages?|several\s+pages?|many\s+pages?|more\s+than\s+one\s+page|\d+\s+pages?|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty)\b/i.test(String(prompt || '').toLowerCase()); }
function parseJSON(text) {
  const raw = String(text || '').trim().replace(/^\x60{3}(?:json)?/i, '').replace(/\x60{3}$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch {} }
  return null;
}
function slug(value) { return String(value || '').trim().replace(/\.html?$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Page'; }
function cleanFiles(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [rawPath, rawFile] of Object.entries(value)) {
    const path = String(rawPath || '').trim().replace(/^\/+/, '');
    if (!path || path.length > 400 || path.includes('..') || path.includes('\\') ||
      /^(?:node_modules|dist|build|coverage|\.git|\.env)(?:\/|$)/i.test(path)) continue;
    let content = typeof rawFile === 'string' ? rawFile : null;
    if (content === null && rawFile && typeof rawFile === 'object') content = rawFile.content || rawFile.text || rawFile.source || rawFile.code;
    if (typeof content === 'string' && /\.(?:html?|css|js|mjs|jsx|tsx|ts|json|svg|txt|md|astro)$/i.test(path)) out[path] = content.slice(0, 120000);
  }
  return out;
}
function outputFiles(value) {
  const files = value && (value.files || value.fileEdits || (value.patch && value.patch.files));
  const out = {};
  if (Array.isArray(files)) {
    files.forEach(item => {
      const path = String((item && (item.path || item.file)) || '').trim().replace(/^\/+/, '');
      const content = item && (item.content || item.text || item.source || item.code);
      if (path && typeof content === 'string') out[path] = content;
    });
  } else if (files && typeof files === 'object') {
    Object.entries(files).forEach(([path, item]) => {
      const content = typeof item === 'string' ? item : item && (item.content || item.text || item.source || item.code);
      if (path && typeof content === 'string') out[String(path).replace(/^\/+/, '')] = content;
    });
  }
  if (!Object.keys(out).length && value && typeof value.html === 'string') out['src/pages/Home.html'] = value.html;
  if (!Object.keys(out).length && value && typeof value.code === 'string') out['src/pages/Home.html'] = value.code;
  return out;
}
function makeSiteMap(raw, limit) {
  if (!raw || !Array.isArray(raw.pages)) return { siteMap: null, overflow: 0 };
  const overflow = Math.max(0, raw.pages.length - limit), pages = [], seen = new Set();
  for (const entry of raw.pages.slice(0, limit)) {
    const title = String((entry && (entry.title || entry.name)) || '').trim().slice(0, 100);
    if (!title) continue;
    const path = 'src/pages/' + slug(title) + '.html';
    if (seen.has(path.toLowerCase())) continue;
    seen.add(path.toLowerCase());
    pages.push({ title, path, url: /^home(?:page)?$/i.test(title) ? '/' : '/' + slug(title).toLowerCase() + '/', goal: String((entry && (entry.goal || entry.purpose)) || '').slice(0, 300) });
  }
  if (!pages.some(page => /^home(?:page)?$/i.test(page.title))) pages.unshift({ title: 'Home', path: 'src/pages/Home.html', url: '/', goal: 'Main website landing page.' });
  else {
    const home = pages.findIndex(page => /^home(?:page)?$/i.test(page.title));
    if (home > 0) pages.unshift(pages.splice(home, 1)[0]);
    pages[0].url = '/';
  }
  const sharedFiles = [
    { path: 'src/styles.css', purpose: 'Shared responsive styles and reusable components.' },
    { path: 'src/main.js', purpose: 'Shared navigation and interactive behavior.' },
  ];
  const result = normalizeSiteMap({ architecture: raw.architecture || 'Web Studio multi-page site', pages, sharedFiles, foundationPaths: [pages[0].path, 'src/styles.css', 'src/main.js'] }, limit);
  if (!result.siteMap) return { siteMap: null, overflow };
  result.siteMap.pages = pages;
  result.siteMap.sharedFiles = sharedFiles;
  result.siteMap.foundationPaths = [pages[0].path, 'src/styles.css', 'src/main.js'];
  return { siteMap: result.siteMap, overflow: Math.max(overflow, result.overflow) };
}
