/**
 * Country-aware OVYX defaults.
 *
 * This is presentation and capability discovery only. A country, locale or
 * currency inferred from a request must never determine the amount charged:
 * payment amounts remain server-authoritative in the payment pricing matrix.
 */
const COUNTRY_DEFAULTS = Object.freeze({
  NG: { currency: 'NGN', locale: 'en-NG', name: 'Nigeria' },
  US: { currency: 'USD', locale: 'en-US', name: 'United States' },
  GB: { currency: 'GBP', locale: 'en-GB', name: 'United Kingdom' },
  IE: { currency: 'EUR', locale: 'en-IE', name: 'Ireland' },
  DE: { currency: 'EUR', locale: 'de-DE', name: 'Germany' },
  FR: { currency: 'EUR', locale: 'fr-FR', name: 'France' },
  ES: { currency: 'EUR', locale: 'es-ES', name: 'Spain' },
  IT: { currency: 'EUR', locale: 'it-IT', name: 'Italy' },
  NL: { currency: 'EUR', locale: 'nl-NL', name: 'Netherlands' },
  BE: { currency: 'EUR', locale: 'nl-BE', name: 'Belgium' },
  PT: { currency: 'EUR', locale: 'pt-PT', name: 'Portugal' },
  AT: { currency: 'EUR', locale: 'de-AT', name: 'Austria' },
  FI: { currency: 'EUR', locale: 'fi-FI', name: 'Finland' },
  GR: { currency: 'EUR', locale: 'el-GR', name: 'Greece' },
  CA: { currency: 'CAD', locale: 'en-CA', name: 'Canada' },
  AU: { currency: 'AUD', locale: 'en-AU', name: 'Australia' },
  NZ: { currency: 'NZD', locale: 'en-NZ', name: 'New Zealand' },
  IN: { currency: 'INR', locale: 'en-IN', name: 'India' },
  ZA: { currency: 'ZAR', locale: 'en-ZA', name: 'South Africa' },
  KE: { currency: 'KES', locale: 'en-KE', name: 'Kenya' },
  GH: { currency: 'GHS', locale: 'en-GH', name: 'Ghana' },
  UG: { currency: 'UGX', locale: 'en-UG', name: 'Uganda' },
  TZ: { currency: 'TZS', locale: 'sw-TZ', name: 'Tanzania' },
  RW: { currency: 'RWF', locale: 'rw-RW', name: 'Rwanda' },
  EG: { currency: 'EGP', locale: 'ar-EG', name: 'Egypt' },
  AE: { currency: 'AED', locale: 'ar-AE', name: 'United Arab Emirates' },
  SA: { currency: 'SAR', locale: 'ar-SA', name: 'Saudi Arabia' },
  JP: { currency: 'JPY', locale: 'ja-JP', name: 'Japan' },
  CN: { currency: 'CNY', locale: 'zh-CN', name: 'China' },
  HK: { currency: 'HKD', locale: 'zh-HK', name: 'Hong Kong' },
  SG: { currency: 'SGD', locale: 'en-SG', name: 'Singapore' },
  MY: { currency: 'MYR', locale: 'ms-MY', name: 'Malaysia' },
  ID: { currency: 'IDR', locale: 'id-ID', name: 'Indonesia' },
  PH: { currency: 'PHP', locale: 'en-PH', name: 'Philippines' },
  TH: { currency: 'THB', locale: 'th-TH', name: 'Thailand' },
  VN: { currency: 'VND', locale: 'vi-VN', name: 'Vietnam' },
  KR: { currency: 'KRW', locale: 'ko-KR', name: 'South Korea' },
  BR: { currency: 'BRL', locale: 'pt-BR', name: 'Brazil' },
  MX: { currency: 'MXN', locale: 'es-MX', name: 'Mexico' },
  AR: { currency: 'ARS', locale: 'es-AR', name: 'Argentina' },
  CL: { currency: 'CLP', locale: 'es-CL', name: 'Chile' },
  CO: { currency: 'COP', locale: 'es-CO', name: 'Colombia' },
  CH: { currency: 'CHF', locale: 'de-CH', name: 'Switzerland' },
  NO: { currency: 'NOK', locale: 'nb-NO', name: 'Norway' },
  SE: { currency: 'SEK', locale: 'sv-SE', name: 'Sweden' },
  DK: { currency: 'DKK', locale: 'da-DK', name: 'Denmark' },
  PL: { currency: 'PLN', locale: 'pl-PL', name: 'Poland' },
  TR: { currency: 'TRY', locale: 'tr-TR', name: 'Türkiye' },
  PK: { currency: 'PKR', locale: 'ur-PK', name: 'Pakistan' },
  BD: { currency: 'BDT', locale: 'bn-BD', name: 'Bangladesh' },
  IL: { currency: 'ILS', locale: 'he-IL', name: 'Israel' },
});

function cleanCountry(value) {
  const country = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'ZZ' ? country : '';
}

function preferredLanguage(acceptLanguage, fallback) {
  const entries = String(acceptLanguage || '').split(',')
    .map((part, index) => {
      const bits = part.trim().split(';');
      const locale = bits[0];
      const quality = bits[1] && /^q=/.test(bits[1].trim())
        ? Number(bits[1].trim().slice(2)) : 1;
      return { locale, quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(item => item.locale && item.quality > 0 && item.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const item of entries) {
    try {
      const canonical = Intl.getCanonicalLocales(item.locale)[0];
      if (canonical) return canonical;
    } catch {}
  }
  return fallback;
}

function configured(env, key) {
  return typeof env?.[key] === 'string' && env[key].trim().length > 0;
}

export function resolveGlobalReadiness({ request, env = {} } = {}) {
  const cf = request?.cf && typeof request.cf === 'object' ? request.cf : {};
  const countryCode = cleanCountry(cf.country);
  const defaults = COUNTRY_DEFAULTS[countryCode] || null;
  const locale = preferredLanguage(request?.headers?.get?.('Accept-Language'), defaults?.locale || 'en');
  const isNigeria = countryCode === 'NG';
  const opayConfigured = configured(env, 'OPAY_CASHIER_PUBLIC_KEY') &&
    configured(env, 'OPAY_CASHIER_SECRET_KEY');
  const paystackConfigured = configured(env, 'PAYSTACK_SECRET_KEY');

  // The live checkout currently supports only NGN/OPay and USD/Paystack.
  // Local currency is a display preference, not a promise of local checkout.
  const checkout = isNigeria
    ? { currency: 'NGN', provider: 'opay', state: opayConfigured ? 'ready' : 'configuration_required' }
    : { currency: 'USD', provider: 'paystack', state: paystackConfigured ? 'ready' : 'configuration_required' };

  return Object.freeze({
    schemaVersion: 1,
    detected: Boolean(countryCode),
    country: countryCode ? {
      code: countryCode,
      name: defaults?.name || null,
      currency: defaults?.currency || null,
      currencyKnown: Boolean(defaults),
    } : null,
    locale,
    timezone: typeof cf.timezone === 'string' && cf.timezone.length <= 80 ? cf.timezone : null,
    checkout: Object.freeze({
      ...checkout,
      localCurrencyCheckout: isNigeria,
      supportedCurrencies: ['NGN', 'USD'],
      note: isNigeria
        ? 'OVYX checkout supports NGN through OPay when its server credentials are configured.'
        : 'OVYX checkout currently uses USD through Paystack. Local-currency checkout is not yet enabled for this country.',
    }),
    integrationReadiness: Object.freeze({
      opay: opayConfigured ? 'configured' : 'not_configured',
      paystack: paystackConfigured ? 'configured' : 'not_configured',
      stripeAdapter: 'registered_adapter_checkout_not_yet_enabled',
      flutterwaveAdapter: 'registered_adapter_checkout_not_yet_enabled',
    }),
    ai: Object.freeze({ provider: 'cloudflare-workers-ai-only' }),
  });
}

export { COUNTRY_DEFAULTS };
