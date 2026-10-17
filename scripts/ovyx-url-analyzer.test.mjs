import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeAnalyzerUrl, isPublicIpAddress, analyzePublicWebsite } from '../functions/_lib/url-analyzer.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const withQuery = normalizeAnalyzerUrl('https://example.com/about?token=private-value#top');
assert.equal(new URL(withQuery.url).search, '?token=private-value');
assert.equal(withQuery.displayUrl, 'https://example.com/about');
assert.equal(withQuery.hadQueryOrFragment, true);
assert.equal(normalizeAnalyzerUrl('example.com').url, 'https://example.com/');
assert.equal(isPublicIpAddress('93.184.216.34'), true);
for (const address of ['127.0.0.1','10.1.2.3','172.18.0.2','192.168.1.2','169.254.169.254','100.64.0.1','192.0.2.10','198.51.100.2','203.0.113.5','224.0.0.1','::1','::','fc00::1','fe80::1','2001:db8::1']) {
  assert.equal(isPublicIpAddress(address), false, address + ' must be rejected.');
}
for (const url of ['javascript:alert(1)','file:///etc/passwd','ftp://example.com','http://localhost','http://127.0.0.1','http://10.0.0.8','http://169.254.169.254/latest/meta-data','https://user:pass@example.com','https://example.com:8443','http://[::1]/','http://site.local','https://metadata.google.internal/']) {
  assert.throws(() => normalizeAnalyzerUrl(url), undefined, url + ' must be rejected.');
}
assert.throws(() => normalizeAnalyzerUrl(''), /URL/i);

const fetched = [];
const html = '<!doctype html><html><head><title>Example Public Site</title><meta name="description" content="Public site for analyzer tests"><meta name="theme-color" content="#D81B60"><link rel="stylesheet" href="/assets/site.css"><link rel="icon" href="/favicon.svg"><meta property="og:site_name" content="Example Public Site"></head><body><header><img class="site-logo" alt="Example logo" src="/assets/logo.png"></header><main><h1>Welcome to Example</h1><h2>Products</h2><a href="/about">About our team</a><a href="/services">Services</a><a href="/private">Private area</a><a href="https://other.example/about">Other site</a><img src="/assets/hero.webp" alt="Office"></main></body></html>';
const about = '<!doctype html><html><head><title>About | Example Public Site</title><meta name="description" content="Our story"></head><body><h1>About us</h1><a href="/">Home</a></body></html>';
const services = '<!doctype html><html><head><title>Services | Example Public Site</title></head><body><h1>Our services</h1></body></html>';
const css = ':root{--brand-primary:#D81B60;--brand-secondary:#302060;--brand-accent:#00A6A6;--brand-background:#FFF9FC;--brand-text:#17121A;background-image:url("/assets/bg.webp")}';
const mockFetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  fetched.push({ url: url.href, method: options.method || 'GET' });
  if (url.hostname === 'cloudflare-dns.com') {
    const type = url.searchParams.get('type');
    if (type === 'A') return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }), { headers: { 'content-type': 'application/dns-json' } });
    return new Response(JSON.stringify({ Status: 3 }), { headers: { 'content-type': 'application/dns-json' } });
  }
  if (url.hostname !== 'example.com') throw new Error('Unexpected external fetch: ' + url.hostname);
  if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /private\n', { headers: { 'content-type': 'text/plain' } });
  if (url.pathname === '/sitemap.xml') return new Response('<?xml version="1.0"?><urlset><url><loc>https://example.com/services</loc></url></urlset>', { headers: { 'content-type': 'application/xml' } });
  if (url.pathname === '/') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (url.pathname === '/about') return new Response(about, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (url.pathname === '/services') return new Response(services, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (url.pathname === '/private') return new Response('<h1>Private must not be fetched</h1>', { headers: { 'content-type': 'text/html' } });
  if (url.pathname === '/assets/site.css') return new Response(css, { headers: { 'content-type': 'text/css' } });
  if (['/favicon.svg','/assets/logo.png','/assets/hero.webp','/assets/bg.webp'].includes(url.pathname)) return new Response('', { headers: { 'content-type': 'image/svg+xml' } });
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
};
const result = await analyzePublicWebsite('https://example.com/?utm_source=secret', { fetchImpl: mockFetch });
const report = result.report;
assert.equal(report.source.hostname, 'example.com');
assert.equal(report.source.inputUrl, 'https://example.com/');
assert.ok(!JSON.stringify(report).includes('secret'), 'Tracking values must not leak into the report.');
assert.equal(report.summary.pagesInspected, 3, 'Home, About and Services should be inspected.');
assert.ok(report.summary.pagesDiscovered >= 4, 'Internal and sitemap pages should be inventoried.');
assert.ok(report.summary.internalLinksDiscovered >= 3, 'Same-origin links should be found.');
assert.ok(report.summary.assetsDiscovered >= 4, 'Image, CSS and favicon URLs should be discovered.');
assert.ok(report.siteMap.pages.some(page => page.path === '/about' && page.status === 'inspected'));
assert.ok(report.siteMap.pages.some(page => page.path === '/services' && page.status === 'inspected'));
assert.ok(report.siteMap.pages.some(page => page.path === '/private' && page.status === 'robots-blocked'));
assert.ok(!fetched.some(item => new URL(item.url).pathname === '/private' && new URL(item.url).hostname === 'example.com'), 'Disallowed paths must not be fetched.');
assert.ok(!fetched.some(item => new URL(item.url).hostname === 'other.example'), 'Off-origin links must not be followed.');
assert.equal(report.branding.name, 'Example Public Site');
assert.equal(report.branding.colors.primary, '#D81B60');
assert.equal(report.branding.colors.secondary, '#302060');
assert.equal(report.branding.logo.url, 'https://example.com/assets/logo.png');
assert.equal(report.branding.faviconUrl, 'https://example.com/favicon.svg');
assert.ok(report.capabilities.can.length >= 4);
assert.ok(report.capabilities.cannot.some(item => /JavaScript/i.test(item)));
assert.ok(report.limitations.some(item => /binary files|asset binaries/i.test(item)));
assert.ok(report.limitations.some(item => /DNS rebinding/i.test(item)), 'The report must state the DNS-check versus connection-pinning limitation honestly.');
assert.ok(report.limits.maxPagesInspected <= 6);

assert.equal(report.summary.sitemapUsed, true, 'A usable sitemap should be reported even when its URL duplicates an internal link.');

const manyLinkFetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'cloudflare-dns.com') {
    const type = url.searchParams.get('type');
    return new Response(JSON.stringify(type === 'A'
      ? { Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }
      : { Status: 3 }), { headers: { 'content-type': 'application/dns-json' } });
  }
  if (url.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } });
  if (url.pathname === '/sitemap.xml') return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
  if (url.pathname === '/') {
    const links = Array.from({ length: 24 }, (_, i) => '<a href="/asset-' + i + '">asset ' + i + '</a>').join('');
    return new Response('<!doctype html><html><head><title>Many links</title></head><body>' + links + '</body></html>', { headers: { 'content-type': 'text/html' } });
  }
  return new Response('not an HTML page', { headers: { 'content-type': 'text/plain' } });
};
const manyLinksReport = (await analyzePublicWebsite('https://example.com', { fetchImpl: manyLinkFetch })).report;
assert.equal(manyLinksReport.summary.pagesInspected, 1, 'Non-HTML responses must not be reported as inspected HTML.');
assert.equal(manyLinksReport.summary.pageLimitReached, true, 'The crawl page-attempt budget must be disclosed even if child requests return non-HTML.');
assert.equal(manyLinksReport.limits.maxPageFetchAttempts, 6);


const redirectFetch = async input => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'cloudflare-dns.com') {
    const type = url.searchParams.get('type');
    return new Response(JSON.stringify(type === 'A' ? { Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] } : { Status: 3 }), { headers: { 'content-type': 'application/dns-json' } });
  }
  if (url.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } });
  if (url.hostname === 'example.com') return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
  throw new Error('The internal target must never be fetched.');
};
await assert.rejects(analyzePublicWebsite('https://example.com', { fetchImpl: redirectFetch }), error => error.code === 'PRIVATE_IP_NOT_ALLOWED');

const cssFetchLog = [];
const cssRobotsFetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  cssFetchLog.push(url.href);
  if (url.pathname === '/robots.txt' && url.hostname === 'example.com') {
    return new Response('User-agent: *\nDisallow: /assets\nDisallow: /private\n', { headers: { 'content-type': 'text/plain' } });
  }
  return mockFetch(input, options);
};
await analyzePublicWebsite('https://example.com', { fetchImpl: cssRobotsFetch });
assert.ok(!cssFetchLog.some(value => new URL(value).pathname === '/assets/site.css'), 'A stylesheet explicitly disallowed by robots.txt must not be fetched.');

const api = read('functions/api/app-studio/url-analyzer.js');
const middleware = read('functions/api/_middleware.js');
const shell = read('functions/_middleware.js');
const runtime = read('assets/ovyx-app-studio-url-analyzer.js');
const browserTest = read('scripts/ovyx-url-analyzer.browser.test.mjs');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');
const headers = read('_headers');
for (const path of ['functions/_lib/url-analyzer.js','functions/api/app-studio/url-analyzer.js','assets/ovyx-app-studio-url-analyzer.js','scripts/ovyx-url-analyzer.test.mjs','scripts/ovyx-url-analyzer.browser.test.mjs']) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + path, import.meta.url))], { stdio: 'pipe' });
}
assert.ok(api.includes('assertAuthenticated(context.data?.user)'), 'Analyzer endpoint must require a logged-in OVYX user.');
assert.ok(api.includes('enforceSameOrigin(request)'), 'Analyzer endpoint must reject cross-origin requests.');
assert.ok(api.includes("context.data?.entitlements?.capabilities?.appStudio !== true"), 'Analyzer endpoint must require the server-authoritative App Studio entitlement.');
assert.ok(middleware.includes("['/api/app-studio/url-analyzer', ['appStudio']]"), 'API middleware must gate the endpoint behind App Studio entitlement.');
assert.ok(shell.includes('/assets/ovyx-app-studio-url-analyzer.js?v=20261018-1'), 'The real Pages shell must inject the analyzer runtime.');
assert.ok(runtime.includes('__OVYX_URL_ANALYZER_LAST_REPORT__'), 'The structured report must remain available to the next stage in this tab.');
assert.ok(runtime.includes('textContent') && !runtime.includes('innerHTML'), 'Fetched site text must be rendered safely without interpreting remote HTML.');
assert.ok(packageJson.scripts.test.includes('scripts/ovyx-url-analyzer.test.mjs'), 'The deterministic analyzer regression must run in npm test.');
assert.ok(workflow.includes('scripts/ovyx-url-analyzer.browser.test.mjs'), 'The desktop/mobile browser test must be wired into CI.');
assert.ok(headers.includes('/assets/ovyx-app-studio-url-analyzer.js'), 'The analyzer JS asset must use no-store caching.');
console.log('OVYX URL Analyzer tests passed: URL validation, private address/redirect rejection, robots compliance, link/asset/branding extraction, honest limitations, server entitlement gate and CI wiring.');
