const MAX_COLOR_ENTRIES = 24;
const MAX_LAYOUT_RULES = 50;
const MAX_LOGO_CHARS = 820_000;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizedKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hexToRgb(hex) {
  const value = String(hex || '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hslToHex(h, s = 0.68, l = 0.43) {
  const hue = ((h % 360) + 360) % 360 / 360;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const part = hue * 6;
  const x = chroma * (1 - Math.abs(part % 2 - 1));
  let rgb = { r: 0, g: 0, b: 0 };
  if (part < 1) rgb = { r: chroma, g: x, b: 0 };
  else if (part < 2) rgb = { r: x, g: chroma, b: 0 };
  else if (part < 3) rgb = { r: 0, g: chroma, b: x };
  else if (part < 4) rgb = { r: 0, g: x, b: chroma };
  else if (part < 5) rgb = { r: x, g: 0, b: chroma };
  else rgb = { r: chroma, g: 0, b: x };
  const m = lightness - chroma / 2;
  return rgbToHex({ r: (rgb.r + m) * 255, g: (rgb.g + m) * 255, b: (rgb.b + m) * 255 });
}

function stableHue(value) {
  let hash = 2166136261;
  for (const char of String(value || 'App')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channels = [rgb.r, rgb.g, rgb.b].map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function brandContrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function contrastForeground(background) {
  return brandContrastRatio('#111111', background) >= brandContrastRatio('#FFFFFF', background)
    ? '#111111'
    : '#FFFFFF';
}

function mixHex(from, to, amount) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  if (!a || !b) return from;
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

function accessibleColor(color, background, minimum = 4.5) {
  if (!COLOR_RE.test(String(color || '')) || !COLOR_RE.test(String(background || ''))) return color;
  if (brandContrastRatio(color, background) >= minimum) return color;
  const target = brandContrastRatio('#000000', background) >= brandContrastRatio('#FFFFFF', background) ? '#000000' : '#FFFFFF';
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixHex(color, target, step / 20);
    if (brandContrastRatio(candidate, background) >= minimum) return candidate;
  }
  return target;
}

function findColor(colors, aliases) {
  const aliasSet = new Set(aliases.map(normalizedKey));
  for (const [key, value] of Object.entries(colors)) {
    if (aliasSet.has(normalizedKey(key))) return value;
  }
  return '';
}

function normalizeColorMap(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const colors = {};
  for (const [rawKey, rawValue] of Object.entries(source).slice(0, MAX_COLOR_ENTRIES)) {
    const key = text(rawKey, 40).replace(/[^a-zA-Z0-9_-]/g, '');
    const value = text(rawValue, 20).toUpperCase();
    if (key && COLOR_RE.test(value)) colors[key] = value;
  }
  return colors;
}

function normalizeLogo(profile) {
  const candidate = String(profile?.logoDataUrl || profile?.logo || profile?.logoUrl || '').trim();
  if (candidate.length > MAX_LOGO_CHARS || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(candidate)) return '';
  const base64 = candidate.slice('data:image/png;base64,'.length);
  if (Math.floor(base64.length * 0.75) > 600_000) return '';
  return candidate;
}

function xml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function attr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeCssUrl(value) {
  return String(value || '').replace(/["\\\n\r]/g, '');
}

function initialLetters(name) {
  const words = text(name, 80).split(/\s+/).filter(Boolean);
  if (!words.length) return 'A';
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

export function normalizeBrandDNA(profile, options = {}) {
  const source = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  const colors = normalizeColorMap(source.colors || source.palette?.colors || source.theme?.colors || {});
  const layoutRules = (Array.isArray(source.layoutRules) ? source.layoutRules : String(source.layoutRules || '').split(/\r?\n/))
    .slice(0, MAX_LAYOUT_RULES).map(value => text(value, 500)).filter(Boolean);
  const logoDataUrl = normalizeLogo(source);
  const name = text(options.appName || source.appName || source.brandName || source.name || options.projectName || '', 100);
  const seed = name || 'App';
  const hue = stableHue(seed);
  const primary = findColor(colors, ['primary', 'primaryColor', 'brandPrimary', 'brand', 'main', 'brandColor', 'colorPrimary'])
    || hslToHex(hue, 0.70, 0.43);
  const secondary = findColor(colors, ['secondary', 'secondaryColor', 'brandSecondary', 'colorSecondary'])
    || hslToHex(hue + 54, 0.65, 0.39);
  const accent = findColor(colors, ['accent', 'accentColor', 'highlight', 'brandAccent', 'colorAccent'])
    || hslToHex(hue + 142, 0.72, 0.48);
  const background = findColor(colors, ['background', 'backgroundColor', 'pageBackground', 'canvas', 'surfaceBackground']);
  const surface = findColor(colors, ['surface', 'surfaceColor', 'card', 'cardColor', 'panel']);
  const requestedText = findColor(colors, ['text', 'textColor', 'foreground', 'foregroundColor']);
  const requestedMuted = findColor(colors, ['muted', 'mutedText', 'secondaryText', 'subtleText']);
  const contrastBackground = background || '#FFFFFF';
  const textColor = requestedText && brandContrastRatio(requestedText, contrastBackground) >= 4.5
    ? requestedText
    : contrastForeground(contrastBackground);
  const mutedColor = requestedMuted && brandContrastRatio(requestedMuted, contrastBackground) >= 4.5
    ? requestedMuted
    : textColor;
  const palette = {
    primary,
    secondary,
    accent,
    onPrimary: contrastForeground(primary),
    link: accessibleColor(primary, contrastBackground, 4.5),
  };
  if (background) palette.background = background;
  if (surface) palette.surface = surface;
  if (textColor) palette.text = textColor;
  if (mutedColor) palette.muted = mutedColor;
  const active = Boolean(logoDataUrl || Object.keys(colors).length || layoutRules.length || source.brandName || source.appName);
  return {
    version: 1,
    active,
    name,
    logoDataUrl,
    hasLogo: Boolean(logoDataUrl),
    sourceColors: colors,
    palette,
    layoutRules,
    themeColor: primary,
  };
}

export function buildBrandDNAInstructions(dna) {
  const profile = dna && typeof dna === 'object' ? dna : normalizeBrandDNA(null);
  const palette = profile.palette || {};
  const colors = Object.fromEntries(Object.entries(palette).filter(([, value]) => COLOR_RE.test(String(value || ''))));
  const rules = Array.isArray(profile.layoutRules) ? profile.layoutRules.slice(0, MAX_LAYOUT_RULES) : [];
  const identity = profile.active
    ? [
        'A user-supplied App Studio Brand DNA profile is active. Treat it as the authority for this app, not the OVYX studio chrome/theme.',
        'Apply this app identity consistently across every page, modal, navigation item, dashboard, empty state, form, and responsive layout.',
        profile.hasLogo
          ? 'The original full-colour uploaded PNG logo will be injected by the server into generated HTML logo slots. Add an <img data-ovyx-brand-logo alt="[brand name] logo"> in the primary app header on every HTML page; never redraw, recolour, crop, replace, or convert the original logo into a monochrome icon.'
          : 'No uploaded logo is available. Create a distinctive app-specific wordmark/monogram and do not pretend an uploaded logo exists.',
        'Use semantic CSS custom properties for all repeated theme values, including --ovyx-brand-primary, --ovyx-brand-secondary, --ovyx-brand-accent, --ovyx-brand-background, --ovyx-brand-surface, --ovyx-brand-text, --ovyx-brand-muted and --ovyx-on-brand-primary. Reuse them throughout shared and per-page styles instead of hardcoding conflicting colors.',
        'Create a square app/favicon icon that matches the app brand using the supplied palette, with a simple bold silhouette, adequate padding and legible contrast. If a file map is used, include public/brand/app-icon.svg and public/brand/brand-manifest.json.',
        'Keep body copy, labels, helper text, placeholders, badges, focus states and disabled states readable. Keep foreground/background combinations at WCAG AA contrast where feasible; use the correct on-primary foreground for primary controls.',
        'Do not let the global OVYX dark/gold editor theme leak into the generated app. The app has its own design system.',
      ]
    : [
        'No explicit user Brand DNA profile was supplied. Create a distinctive visual identity from this app brief and industry, rather than reusing the OVYX studio dark/gold theme or a generic starter palette.',
        'Design a consistent app-specific palette and a compact logo/monogram. Express the palette as semantic CSS custom properties and reuse them across all screens and breakpoints.',
        'Create a square SVG favicon/app icon with a clear silhouette and high contrast. Include public/brand/app-icon.svg and public/brand/brand-manifest.json when the response format supports a file map.',
        'Keep all screen text, controls, placeholders, states and focus indicators readable and accessible.',
      ];
  return [
    'APP STUDIO — BRAND DNA ENGINE v1 (mandatory output contract)',
    ...identity,
    'Generated app configuration and brand assets must belong to this app/request. Never mutate or reuse a global studio theme object as the app theme.',
    'Preserve the existing App Studio response/output format and requested functionality. Do not claim external integrations or deployment that have not been performed.',
    'Brand color tokens JSON: ' + JSON.stringify(colors),
    'Brand layout rules JSON: ' + JSON.stringify(rules),
    'Application brand label: ' + JSON.stringify(text(profile.name, 100) || 'Infer a suitable name from the app brief'),
  ].join('\n');
}

function cssVariables(dna) {
  const p = dna.palette || {};
  const vars = {
    '--ovyx-brand-primary': p.primary,
    '--ovyx-brand-secondary': p.secondary,
    '--ovyx-brand-accent': p.accent,
    '--ovyx-on-brand-primary': p.onPrimary,
    '--ovyx-brand-link': p.link,
  };
  if (p.background) vars['--ovyx-brand-background'] = p.background;
  if (p.surface) vars['--ovyx-brand-surface'] = p.surface;
  if (p.text) vars['--ovyx-brand-text'] = p.text;
  if (p.muted) vars['--ovyx-brand-muted'] = p.muted;
  return vars;
}

function cssTokenBlock(dna) {
  const variables = Object.entries(cssVariables(dna)).map(([key, value]) => key + ':' + value).join(';');
  const scheme = luminance(dna.palette?.background || '#FFFFFF') < 0.35 ? 'dark' : 'light';
  return [
    '/* OVYX BRAND DNA START */',
    ':root{color-scheme:' + scheme + ';' + variables + '}',
    'html{background-color:var(--ovyx-brand-background,Canvas);}',
    'body{background-color:var(--ovyx-brand-background,Canvas);color:var(--ovyx-brand-text,CanvasText);}',
    'a:not([data-ovyx-brand-ignore]){color:var(--ovyx-brand-link,var(--ovyx-brand-primary));}',
    ':where(button[type="submit"],input[type="submit"],.btn-primary,.button-primary,.primary-button,[data-brand-primary]){background-color:var(--ovyx-brand-primary)!important;color:var(--ovyx-on-brand-primary)!important;border-color:var(--ovyx-brand-primary)!important;}',
    ':where(input,select,textarea){color:var(--ovyx-brand-text,CanvasText);}',
    ':where(input,textarea)::placeholder{color:var(--ovyx-brand-muted,var(--ovyx-brand-text,CanvasText));opacity:1;}',
    ':where(button,.btn,.button,input,select,textarea,[role="button"]):focus-visible{outline:3px solid var(--ovyx-brand-accent,var(--ovyx-brand-primary));outline-offset:3px;}',
    '.ovyx-brand-lockup{display:inline-flex;align-items:center;gap:.65rem;min-width:0;color:inherit;text-decoration:none;font-weight:700;line-height:1.15;}',
    '.ovyx-brand-logo{display:block;width:clamp(2rem,3.2vw,2.75rem);height:clamp(2rem,3.2vw,2.75rem);object-fit:contain;object-position:center;flex:0 0 auto;}',
    '[data-ovyx-brand-logo]{object-fit:contain;object-position:center;}',
    '@media(prefers-reduced-motion:reduce){.ovyx-brand-lockup{scroll-behavior:auto;}}',
    '/* OVYX BRAND DNA END */',
  ].join('\n');
}

function iconSvg(dna, name) {
  const p = dna.palette || {};
  const primary = p.primary || '#334155';
  const secondary = p.secondary || primary;
  const accent = p.accent || secondary;
  const foreground = p.onPrimary || contrastForeground(primary);
  const initials = xml(initialLetters(name || dna.name));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-labelledby="brand-icon-title"><title id="brand-icon-title">' + xml(name || dna.name || 'App') + ' app icon</title><rect width="64" height="64" rx="16" fill="' + primary + '"/><path d="M8 44 32 9 56 44 32 57Z" fill="' + secondary + '" opacity=".88"/><path d="M32 9 56 44 32 39 8 44Z" fill="' + accent + '"/><text x="32" y="39" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="' + (initials.length > 1 ? '20' : '27') + '" font-weight="800" fill="' + foreground + '" stroke="' + primary + '" stroke-width="1.5" paint-order="stroke">' + initials + '</text></svg>';
}

function svgDataUrl(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function readTitle(html) {
  return String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() || '';
}

function replaceAttribute(tag, key, value) {
  const escaped = attr(value);
  const pattern = new RegExp('\\s' + key + '\\s*=\\s*(["\'])(.*?)\\1', 'i');
  if (pattern.test(tag)) return tag.replace(pattern, ' ' + key + '="' + escaped + '"');
  return tag.replace(/\s*\/?\s*>$/, ' ' + key + '="' + escaped + '">');
}

function injectBrandImage(html, logoSource, name) {
  let matched = false;
  const updated = html.replace(/<img\b[^>]*>/gi, tag => {
    const isBrandImage = /\b(?:class|id|alt|title|data-ovyx-brand-logo|data-brand-logo)\s*=\s*(["'])[^"']*(?:logo|brand|wordmark)[^"']*\1/i.test(tag)
      || /\bdata-ovyx-brand-logo\b/i.test(tag);
    if (!isBrandImage) return tag;
    matched = true;
    let result = replaceAttribute(tag, 'src', logoSource);
    if (/\balt\s*=/.test(result)) result = replaceAttribute(result, 'alt', name + ' logo');
    else result = replaceAttribute(result, 'alt', name + ' logo');
    result = replaceAttribute(result, 'data-ovyx-brand-logo', 'true');
    return result;
  });
  return { html: updated, matched };
}

function brandLockup(name, logoSource) {
  return '<a class="ovyx-brand-lockup" data-ovyx-brand-lockup href="/" aria-label="' + attr(name) + ' home"><img class="ovyx-brand-logo" data-ovyx-brand-logo="true" src="' + attr(logoSource) + '" alt="' + attr(name) + ' logo" decoding="async"><span>' + xml(name) + '</span></a>';
}

export function applyBrandDNAToHtml(source, dna, options = {}) {
  const htmlSource = String(source || '');
  if (!htmlSource || !dna?.active) return htmlSource;
  const title = readTitle(htmlSource);
  const name = text(options.appName || dna.name || title || 'App', 100);
  const icon = iconSvg(dna, name);
  const iconUrl = svgDataUrl(icon);
  const logoSource = dna.logoDataUrl || iconUrl;
  // Make retries and subsequent brand edits idempotent: replace, do not
  // accumulate, previously managed tokens and icon metadata.
  let html = htmlSource
    .replace(/<style\b[^>]*\bid=["']ovyx-brand-dna["'][^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<meta\b(?=[^>]*\bname=["']theme-color["'])[^>]*>/gi, '')
    .replace(/<link\b(?=[^>]*\brel=["']icon["'])[^>]*>/gi, '')
    .replace(/<link\b(?=[^>]*\brel=["']apple-touch-icon["'])[^>]*>/gi, '')
    .replace(/<link\b(?=[^>]*\bdata-ovyx-brand-manifest=["']true["'])[^>]*>/gi, '');
  const injected = injectBrandImage(html, logoSource, name);
  html = injected.html;
  const hasHtmlRoot = /<html\b/i.test(html);
  const hasHead = /<head\b/i.test(html);
  const manifestLink = options.includeManifest
    ? '<link rel="manifest" href="/brand/brand-manifest.json" data-ovyx-brand-manifest="true">'
    : '';
  const metaAndStyle = '<meta name="theme-color" content="' + attr(dna.themeColor || dna.palette?.primary || '#334155') + '"><link rel="icon" type="image/svg+xml" href="' + attr(iconUrl) + '"><link rel="apple-touch-icon" href="' + attr(iconUrl) + '">' + manifestLink + '<style id="ovyx-brand-dna">' + cssTokenBlock(dna) + '</style>';
  if (hasHead) {
    html = html.replace(/<\/head\s*>/i, metaAndStyle + '</head>');
  } else if (hasHtmlRoot) {
    html = html.replace(/<html\b[^>]*>/i, match => match + '<head>' + metaAndStyle + '</head>');
  } else {
    html = metaAndStyle + html;
  }

  if (!injected.matched) {
    const lockup = brandLockup(name, logoSource);
    if (/<header\b[^>]*>/i.test(html)) {
      html = html.replace(/<header\b[^>]*>/i, match => match + lockup);
    } else if (/<body\b[^>]*>/i.test(html)) {
      html = html.replace(/<body\b[^>]*>/i, match => match + lockup);
    } else {
      html = lockup + html;
    }
  }
  return html;
}

function applyBrandDNAToCss(source, dna) {
  const content = String(source || '').replace(/\/\* OVYX BRAND DNA START \*\/[\s\S]*?\/\* OVYX BRAND DNA END \*\//g, '').trimEnd();
  return content + (content ? '\n\n' : '') + cssTokenBlock(dna) + '\n';
}

function applyBrandDNAToFiles(files, dna, options = {}) {
  const appName = text(options.appName || dna.name || 'App', 100);
  const icon = iconSvg(dna, appName);
  const manifest = {
    schemaVersion: 1,
    name: appName,
    short_name: appName.slice(0, 12),
    theme_color: dna.themeColor || dna.palette?.primary,
    background_color: dna.palette?.background || '#FFFFFF',
    display: 'standalone',
    icons: [{ src: '/brand/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    logo: { embeddedInHtml: Boolean(dna.logoDataUrl), mediaType: dna.logoDataUrl ? 'image/png' : 'image/svg+xml' },
    colors: dna.palette,
  };
  const manifestContent = JSON.stringify(manifest, null, 2);
  const isBrandAsset = value => /^(?:public\/)?brand\/(?:app-icon\.svg|brand-manifest\.json)$/i.test(String(value || '').replace(/^\/+/, ''));
  const patchContent = (path, content) => {
    if (typeof content !== 'string') return content;
    if (/\.html?$/i.test(path) || /<html\b|<!doctype\s+html/i.test(content)) return applyBrandDNAToHtml(content, dna, { appName, includeManifest: true });
    if (/\.css$/i.test(path)) return applyBrandDNAToCss(content, dna);
    return content;
  };
  const walk = (value, path = '') => {
    if (typeof value === 'string') return patchContent(path, value);
    if (Array.isArray(value)) return value.map(item => {
      if (!item || typeof item !== 'object') return item;
      const itemPath = String(item.path || item.file || item.name || path);
      const copy = { ...item };
      for (const key of ['content', 'text', 'source', 'code']) {
        if (typeof copy[key] === 'string') copy[key] = patchContent(itemPath, copy[key]);
      }
      for (const key of Object.keys(copy)) {
        if (!['content', 'text', 'source', 'code'].includes(key)) copy[key] = walk(copy[key], itemPath);
      }
      return copy;
    });
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.toLowerCase() === 'files' && item && typeof item === 'object') {
        output[key] = patchFileMap(item, walk, appName, icon, manifestContent, isBrandAsset);
      } else {
        output[key] = walk(item, key);
      }
    }
    return output;
  };
  return walk(files);
}

function patchFileMap(files, walk, appName, icon, manifestContent, isBrandAsset) {
  if (Array.isArray(files)) {
    const output = files.map(item => {
      if (!item || typeof item !== 'object') return item;
      const path = String(item.path || item.file || item.name || '');
      const copy = { ...item };
      for (const key of ['content', 'text', 'source', 'code']) {
        if (typeof copy[key] === 'string') {
          copy[key] = /\.html?$/i.test(path) || /<html\b|<!doctype\s+html/i.test(copy[key])
            ? walk(copy[key], path)
            : /\.css$/i.test(path) ? walk(copy[key], path) : copy[key];
        }
      }
      return copy;
    }).filter(item => !item?.path || !isBrandAsset(item.path || item.file || item.name));
    output.push({ path: 'public/brand/app-icon.svg', type: 'image/svg+xml', content: icon });
    output.push({ path: 'public/brand/brand-manifest.json', type: 'application/manifest+json', content: manifestContent });
    return output;
  }
  const output = {};
  for (const [path, file] of Object.entries(files)) {
    if (isBrandAsset(path)) continue;
    if (typeof file === 'string') output[path] = walk(file, path);
    else if (file && typeof file === 'object') {
      const copy = { ...file };
      for (const key of ['content', 'text', 'source', 'code']) {
        if (typeof copy[key] === 'string') {
          copy[key] = /\.html?$/i.test(path) || /<html\b|<!doctype\s+html/i.test(copy[key])
            ? walk(copy[key], path)
            : /\.css$/i.test(path) ? walk(copy[key], path) : copy[key];
        }
      }
      output[path] = copy;
    } else output[path] = file;
  }
  output['public/brand/app-icon.svg'] = { type: 'image/svg+xml', content: icon };
  output['public/brand/brand-manifest.json'] = { type: 'application/manifest+json', content: manifestContent };
  return output;
}

function parseJsonOutput(raw) {
  const source = String(raw || '').trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\x60{3}$/i, '').trim();
  try { return JSON.parse(source); } catch {}
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(source.slice(start, end + 1)); } catch {}
  }
  return null;
}

function looksLikeHtml(value) {
  return /<!doctype\s+html|<(?:html|head|body|header|main|nav|article|section)\b/i.test(String(value || ''));
}

function containsGeneratedArtifacts(value, path = '') {
  if (typeof value === 'string') return (/\.html?$/i.test(path) && looksLikeHtml(value)) || looksLikeHtml(value);
  if (Array.isArray(value)) return value.some(item => containsGeneratedArtifacts(item, path));
  if (!value || typeof value !== 'object') return false;
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase() === 'files' && item && typeof item === 'object' && (Array.isArray(item) ? item.length > 0 : Object.keys(item).length > 0)) return true;
    if (containsGeneratedArtifacts(item, key)) return true;
  }
  return false;
}

export function applyBrandDNAToGeneratedOutput(value, dna, options = {}) {
  if (!dna?.active) return value;
  if (typeof value !== 'string') {
    return containsGeneratedArtifacts(value) ? applyBrandDNAToFiles(value, dna, options) : value;
  }
  const parsed = parseJsonOutput(value);
  if (parsed && typeof parsed === 'object') {
    if (!containsGeneratedArtifacts(parsed)) return value;
    return JSON.stringify(applyBrandDNAToFiles(parsed, dna, options));
  }
  return looksLikeHtml(value) ? applyBrandDNAToHtml(value, dna, options) : value;
}

export function brandDNAClientSummary(dna) {
  return {
    version: 1,
    active: Boolean(dna?.active),
    name: text(dna?.name, 100),
    logoConfigured: Boolean(dna?.hasLogo),
    colors: { ...(dna?.palette || {}) },
    layoutRules: Array.isArray(dna?.layoutRules) ? dna.layoutRules.slice(0, MAX_LAYOUT_RULES) : [],
    assets: ['public/brand/app-icon.svg', 'public/brand/brand-manifest.json'],
  };
}
