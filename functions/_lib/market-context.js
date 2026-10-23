const PROFILES = [
  { country: 'Nigeria', re: /\b(?:nigeria|nigerian|lagos|abuja|port harcourt|naira|ngn)\b|₦/i, locale: 'en-NG', currency: 'NGN', timeZone: 'Africa/Lagos', language: 'en' },
  { country: 'United States', re: /\b(?:united states|u\.s\.a?\.?|american|usa|new york|california)\b/i, locale: 'en-US', currency: 'USD', timeZone: 'America/New_York', language: 'en' },
  { country: 'United Kingdom', re: /\b(?:united kingdom|britain|british|england|london|uk)\b/i, locale: 'en-GB', currency: 'GBP', timeZone: 'Europe/London', language: 'en' },
  { country: 'Canada', re: /\b(?:canada|canadian|toronto|vancouver)\b/i, locale: 'en-CA', currency: 'CAD', timeZone: 'America/Toronto', language: 'en' },
  { country: 'Australia', re: /\b(?:australia|australian|sydney|melbourne)\b/i, locale: 'en-AU', currency: 'AUD', timeZone: 'Australia/Sydney', language: 'en' },
  { country: 'Ghana', re: /\b(?:ghana|ghanaian|accra|cedi|ghs)\b/i, locale: 'en-GH', currency: 'GHS', timeZone: 'Africa/Accra', language: 'en' },
  { country: 'Kenya', re: /\b(?:kenya|kenyan|nairobi|kes)\b/i, locale: 'en-KE', currency: 'KES', timeZone: 'Africa/Nairobi', language: 'en' },
  { country: 'South Africa', re: /\b(?:south africa|south african|johannesburg|cape town|zar)\b/i, locale: 'en-ZA', currency: 'ZAR', timeZone: 'Africa/Johannesburg', language: 'en' },
  { country: 'India', re: /\b(?:india|indian|mumbai|delhi|rupee|inr)\b|₹/i, locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata', language: 'en' },
  { country: 'Japan', re: /\b(?:japan|japanese|tokyo|yen|jpy)\b|¥/i, locale: 'ja-JP', currency: 'JPY', timeZone: 'Asia/Tokyo', language: 'ja' },
  { country: 'France', re: /\b(?:france|french|paris)\b|€/i, locale: 'fr-FR', currency: 'EUR', timeZone: 'Europe/Paris', language: 'fr' },
  { country: 'Germany', re: /\b(?:germany|german|berlin)\b/i, locale: 'de-DE', currency: 'EUR', timeZone: 'Europe/Berlin', language: 'de' },
  { country: 'Spain', re: /\b(?:spain|spanish|madrid|barcelona)\b/i, locale: 'es-ES', currency: 'EUR', timeZone: 'Europe/Madrid', language: 'es' },
  { country: 'United Arab Emirates', re: /\b(?:united arab emirates|uae|dubai|abu dhabi|aed)\b/i, locale: 'en-AE', currency: 'AED', timeZone: 'Asia/Dubai', language: 'en' },
  { country: 'Brazil', re: /\b(?:brazil|brazilian|são paulo|sao paulo|brl)\b/i, locale: 'pt-BR', currency: 'BRL', timeZone: 'America/Sao_Paulo', language: 'pt' },
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

export function buildMarketContext(prompt = '', context = {}) {
  const brief = String(prompt || '').slice(0, 80000);
  const supplied = context && typeof context === 'object' ? context : {};
  const market = supplied.market && typeof supplied.market === 'object' ? supplied.market : {};
  const combined = [brief, supplied.country, supplied.region, supplied.locale, supplied.currency, supplied.language, supplied.timeZone, supplied.timezone, market.country, market.region, market.locale, market.currency, market.language, market.timeZone, market.timezone].map(v => typeof v === 'string' ? v : '').join(' ');
  const countryHint = clean(market.country || supplied.country || supplied.region, 100);
  const profile = PROFILES.find(item => countryHint ? countryHint.toLowerCase().includes(item.country.toLowerCase()) || item.re.test(countryHint) : item.re.test(combined));
  const locale = localeValue(market.locale || supplied.locale) || profile?.locale || '';
  const currency = currencyValue(market.currency || supplied.currency) || profile?.currency || '';
  const timeZone = clean(market.timeZone || market.timezone || supplied.timeZone || supplied.timezone, 80) || profile?.timeZone || '';
  const languageMatch = /\b(?:in|language(?: should be)?|written in)\s+(French|Spanish|German|Japanese|Portuguese|Arabic|Hindi|English)\b/i.exec(brief);
  const languageFromBrief = languageMatch ? ({ french:'fr', spanish:'es', german:'de', japanese:'ja', portuguese:'pt', arabic:'ar', hindi:'hi', english:'en' })[languageMatch[1].toLowerCase()] : '';
  const country = countryHint || profile?.country || '';
  const language = clean(market.language || supplied.language, 30) || languageFromBrief || locale.split('-')[0] || profile?.language || '';
  const explicit = Boolean(countryHint || localeValue(market.locale || supplied.locale) || currencyValue(market.currency || supplied.currency) || timeZone || languageFromBrief || clean(market.language || supplied.language, 30));
  const rules = [
    'Never infer the audience market from the server location; use the brief or supplied project settings.',
    'Format currency, dates and numbers with the selected locale and currency; keep stored timestamps machine-readable.',
    'Verify regional payment, shipping, contact, tax and privacy requirements against supplied facts and configured services; never invent compliance claims.',
    'If audiences span markets or the market is unclear, expose a market choice or ask rather than silently hard-coding one.',
  ];
  if (country === 'Nigeria' || profile?.country === 'Nigeria') rules.push('For an explicitly Nigerian/Lagos audience, use NGN (₦) and locally relevant details only when supported; WhatsApp is a contact link, not proof of automated delivery or lead persistence.');
  return {
    country: country || null, locale: locale || null, currency: currency || null, language: language || null, timeZone: timeZone || null,
    marketSpecified: Boolean(country || locale || currency || language || timeZone),
    source: explicit ? 'explicit-user-brief-or-context' : profile ? 'place-or-currency-mentioned-in-brief' : 'not-specified',
    assumptions: profile && !countryHint && !localeValue(market.locale || supplied.locale) && !currencyValue(market.currency || supplied.currency) ? ['Place-derived locale/currency is a default; confirm it for cross-border audiences.'] : [],
    implementationRules: rules,
  };
}
export function formatMarketCurrency(amount, marketContext = {}) {
  const locale = localeValue(marketContext.locale), currency = currencyValue(marketContext.currency), value = Number(amount);
  if (!locale || !currency || !Number.isFinite(value)) return null;
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value); } catch { return null; }
}
