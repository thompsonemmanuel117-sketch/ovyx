import { COUNTRY_DEFAULTS } from './global-readiness.js';

const PROFILES = [
  { code: 'NG', country: 'Nigeria', re: /\\b(?:nigeria|nigerian|lagos|abuja|port harcourt|naira|ngn)\\b|₦/i, locale: 'en-NG', currency: 'NGN', timeZone: 'Africa/Lagos', language: 'en' },
  { code: 'US', country: 'United States', re: /\\b(?:united states|u\\.s\\.a?\\.?|american|usa|new york|california)\\b/i, locale: 'en-US', currency: 'USD', timeZone: 'America/New_York', language: 'en' },
  { code: 'GB', country: 'United Kingdom', re: /\\b(?:united kingdom|britain|british|england|london|uk)\\b/i, locale: 'en-GB', currency: 'GBP', timeZone: 'Europe/London', language: 'en' },
  { code: 'CA', country: 'Canada', re: /\\b(?:canada|canadian|toronto|vancouver)\\b/i, locale: 'en-CA', currency: 'CAD', timeZone: 'America/Toronto', language: 'en' },
  { code: 'AU', country: 'Australia', re: /\\b(?:australia|australian|sydney|melbourne)\\b/i, locale: 'en-AU', currency: 'AUD', timeZone: 'Australia/Sydney', language: 'en' },
  { code: 'GH', country: 'Ghana', re: /\\b(?:ghana|ghanaian|accra|cedi|ghs)\\b/i, locale: 'en-GH', currency: 'GHS', timeZone: 'Africa/Accra', language: 'en' },
  { code: 'KE', country: 'Kenya', re: /\\b(?:kenya|kenyan|nairobi|kes)\\b/i, locale: 'en-KE', currency: 'KES', timeZone: 'Africa/Nairobi', language: 'en' },
  { code: 'ZA', country: 'South Africa', re: /\\b(?:south africa|south african|johannesburg|cape town|zar)\\b/i, locale: 'en-ZA', currency: 'ZAR', timeZone: 'Africa/Johannesburg', language: 'en' },
  { code: 'IN', country: 'India', re: /\\b(?:india|indian|mumbai|delhi|rupee|inr)\\b|₹/i, locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata', language: 'en' },
  { code: 'JP', country: 'Japan', re: /\\b(?:japan|japanese|tokyo|yen|jpy)\\b|¥/i, locale: 'ja-JP', currency: 'JPY', timeZone: 'Asia/Tokyo', language: 'ja' },
  { code: 'FR', country: 'France', re: /\\b(?:france|french|paris)\\b|€/i, locale: 'fr-FR', currency: 'EUR', timeZone: 'Europe/Paris', language: 'fr' },
  { code: 'DE', country: 'Germany', re: /\\b(?:germany|german|berlin)\\b/i, locale: 'de-DE', currency: 'EUR', timeZone: 'Europe/Berlin', language: 'de' },
  { code: 'ES', country: 'Spain', re: /\\b(?:spain|spanish|madrid|barcelona)\\b/i, locale: 'es-ES', currency: 'EUR', timeZone: 'Europe/Madrid', language: 'es' },
  { code: 'AE', country: 'United Arab Emirates', re: /\\b(?:united arab emirates|uae|dubai|abu dhabi|aed)\\b/i, locale: 'en-AE', currency: 'AED', timeZone: 'Asia/Dubai', language: 'en' },
  { code: 'BR', country: 'Brazil', re: /\\b(?:brazil|brazilian|são paulo|sao paulo|brl)\\b/i, locale: 'pt-BR', currency: 'BRL', timeZone: 'America/Sao_Paulo', language: 'pt' },
];
const clean = (value, max = 100) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function localeValue(value) {
  const valueClean = clean(value, 35);
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(valueClean)) return '';
  try { new Intl.DateTimeFormat(valueClean); return valueClean; } catch { return ''; }
}

function currencyValue(value) {
  const code = clean(value, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return '';
  try { new Intl.NumberFormat('en', { style: 'currency', currency: code }).format(1); return code; } catch { return ''; }
}

function countryCodeValue(value) {
  const code = clean(value, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== 'ZZ' && code !== 'XX' ? code : '';
}

function countryNameForCode(code) {
  if (!code) return '';
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return name && name !== code ? name : '';
  } catch {
    return '';
  }
}

export function buildMarketContext(prompt = '', context = {}) {
  const brief = String(prompt || '').slice(0, 80000);
  const supplied = context && typeof context === 'object' ? context : {};
  const market = supplied.market && typeof supplied.market === 'object' ? supplied.market : {};
  const countryHint = clean(market.country || supplied.country, 100);
  const countryCodeHint = countryCodeValue(market.countryCode || supplied.countryCode);
  const combined = [
    brief, countryHint, supplied.region, supplied.locale, supplied.currency,
    supplied.language, supplied.timeZone, supplied.timezone,
    market.region, market.locale, market.currency, market.language, market.timeZone, market.timezone,
  ].map(v => typeof v === 'string' ? v : '').join(' ');

  const profileByName = countryHint
    ? PROFILES.find(item => countryHint.toLowerCase().includes(item.country.toLowerCase()) || item.re.test(countryHint))
    : null;
  const profileByCode = countryCodeHint ? PROFILES.find(item => item.code === countryCodeHint) : null;
  const profileFromBrief = !countryHint && !countryCodeHint
    ? PROFILES.find(item => item.re.test(combined))
    : null;
  const profile = profileByName || profileByCode || profileFromBrief;
  const resolvedCountryCode = countryCodeHint || profile?.code || '';
  const countryDefaults = resolvedCountryCode ? COUNTRY_DEFAULTS[resolvedCountryCode] || null : null;
  const country = countryHint || profile?.country || countryNameForCode(resolvedCountryCode);
  const suppliedLocale = localeValue(market.locale || supplied.locale);
  const suppliedCurrency = currencyValue(market.currency || supplied.currency);
  const locale = suppliedLocale || profile?.locale || countryDefaults?.locale ||
    (resolvedCountryCode ? localeValue('en-' + resolvedCountryCode) : '');
  const currency = suppliedCurrency || profile?.currency || countryDefaults?.currency || '';
  const suppliedTimeZone = clean(market.timeZone || market.timezone || supplied.timeZone || supplied.timezone, 80);
  const timeZone = suppliedTimeZone || profile?.timeZone || '';
  const languageMatch = /\\b(?:in|language(?: should be)?|written in)\\s+(French|Spanish|German|Japanese|Portuguese|Arabic|Hindi|English)\\b/i.exec(brief);
  const languageFromBrief = languageMatch
    ? ({ french:'fr', spanish:'es', german:'de', japanese:'ja', portuguese:'pt', arabic:'ar', hindi:'hi', english:'en' })[languageMatch[1].toLowerCase()]
    : '';
  const language = clean(market.language || supplied.language, 30) || languageFromBrief || locale.split('-')[0] || profile?.language || '';
  const explicit = Boolean(countryHint || countryCodeHint || suppliedLocale || suppliedCurrency || suppliedTimeZone || languageFromBrief || clean(market.language || supplied.language, 30));
  const currencyWasExplicit = Boolean(suppliedCurrency);
  const rules = [
    'Never infer the audience market from the server location; use the brief or supplied project settings.',
    'Treat an explicit ISO 3166-1 country code as a country identity signal, not proof of its tax, legal, payment or shipping rules.',
    'Format currency, dates and numbers with the selected locale and currency; keep stored timestamps machine-readable.',
    'If the country is known but its currency is not in verified defaults, ask the owner to confirm the ISO 4217 currency before displaying prices or enabling checkout.',
    'Require an explicit IANA timezone for time-critical scheduling when the country spans multiple timezones or the correct local timezone is unknown.',
    'Verify regional payment, shipping, contact, tax and privacy requirements against supplied facts and configured services; never invent compliance claims.',
    'If audiences span markets or the market is unclear, expose a market choice or ask rather than silently hard-coding one.',
  ];
  if (country === 'Nigeria' || profile?.country === 'Nigeria') {
    rules.push('For an explicitly Nigerian/Lagos audience, use NGN (₦) and locally relevant details only when supported; WhatsApp is a contact link, not proof of automated delivery or lead persistence.');
  }
  const assumptions = [];
  if (profileFromBrief) assumptions.push('Place-derived locale/currency is a default; confirm it for cross-border audiences.');
  if (country && !currency) assumptions.push('Country identified, but no verified default currency is available; confirm currency before showing prices or activating checkout.');
  if (country && !timeZone) assumptions.push('Timezone is not determined from country alone; confirm the business or audience timezone for scheduling.');
  return {
    country: country || null,
    countryCode: resolvedCountryCode || null,
    locale: locale || null,
    currency: currency || null,
    currencySource: currency ? (currencyWasExplicit ? 'explicit-project-setting' : 'verified-country-default') : 'not-resolved',
    currencyNeedsConfirmation: Boolean(country && !currency),
    language: language || null,
    timeZone: timeZone || null,
    marketSpecified: Boolean(country || locale || currency || language || timeZone),
    source: explicit ? 'explicit-user-brief-or-project-context' : profileFromBrief ? 'place-or-currency-mentioned-in-brief' : 'not-specified',
    assumptions,
    implementationRules: rules,
  };
}

export function formatMarketCurrency(amount, marketContext = {}) {
  const locale = localeValue(marketContext.locale);
  const currency = currencyValue(marketContext.currency);
  const value = Number(amount);
  if (!locale || !currency || !Number.isFinite(value)) return null;
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value); } catch { return null; }
}
