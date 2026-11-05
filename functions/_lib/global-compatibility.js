import { resolveGlobalReadiness } from './global-readiness.js';

const STATUS = Object.freeze({
  verified: 'verified',
  available: 'available',
  notEnabled: 'not_enabled',
  confirmationRequired: 'confirmation_required',
});

function safeCurrency(value) {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;
}

/**
 * Produces an honest, country-scoped compatibility report.
 *
 * This is a capability report, not a legal/compliance certification or a
 * payment-provider eligibility check. Only existing, verified OVYX defaults
 * and live server configuration are represented as available.
 */
export function resolveGlobalCompatibility({ request, env = {} } = {}) {
  const readiness = resolveGlobalReadiness({ request, env });
  const country = readiness.country;
  const countryKnown = Boolean(country?.code);
  const currency = safeCurrency(country?.currency);
  const checkout = readiness.checkout || {};
  const checkoutReady = checkout.state === 'ready';
  const checkoutCurrency = safeCurrency(checkout.currency);
  const localCurrencyCheckout = Boolean(checkoutReady && currency && checkoutCurrency === currency);

  const checks = [
    {
      id: 'country_identity',
      status: countryKnown ? STATUS.verified : STATUS.confirmationRequired,
      detail: countryKnown
        ? 'Country identity was detected from the request country signal.'
        : 'Country could not be detected. Ask the project owner to select the primary market.',
    },
    {
      id: 'display_currency',
      status: currency ? STATUS.verified : STATUS.confirmationRequired,
      currency,
      detail: currency
        ? 'A verified OVYX country-to-currency default is available for display.'
        : 'No verified currency default is available. Confirm the ISO 4217 currency before displaying prices.',
    },
    {
      id: 'checkout',
      status: checkoutReady ? STATUS.available : STATUS.notEnabled,
      provider: checkout.provider || null,
      currency: checkoutCurrency,
      localCurrency: localCurrencyCheckout,
      detail: checkoutReady
        ? (localCurrencyCheckout
          ? 'The configured checkout provider matches the detected market currency.'
          : 'Checkout is configured, but it does not currently settle in the detected market currency.')
        : 'Checkout is not ready. Configure an already-supported provider and verify its merchant eligibility.',
    },
    {
      id: 'tax',
      status: STATUS.confirmationRequired,
      detail: 'Tax rates, registration thresholds and collection obligations require market-specific business facts and verification.',
    },
    {
      id: 'shipping',
      status: STATUS.confirmationRequired,
      detail: 'Shipping carriers, service areas, delivery prices and customs rules must be configured for the project.',
    },
    {
      id: 'privacy_and_legal',
      status: STATUS.confirmationRequired,
      detail: 'Privacy, consumer-protection and legal requirements must be reviewed for the actual business and audience.',
    },
    {
      id: 'localization',
      status: countryKnown && readiness.locale ? STATUS.available : STATUS.confirmationRequired,
      locale: readiness.locale || null,
      timezone: readiness.timezone || null,
      detail: countryKnown && readiness.locale
        ? 'Locale-aware formatting is available; translated content still needs review.'
        : 'Choose a market and preferred language before applying localized defaults.',
    },
    {
      id: 'ai_runtime',
      status: STATUS.available,
      provider: 'cloudflare-workers-ai-only',
      detail: 'OVYX AI inference remains routed through Cloudflare Workers AI.',
    },
  ];

  const counts = checks.reduce((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1;
    return result;
  }, {});

  return Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: 'market-capability-report-not-compliance-certification',
    market: country ? {
      code: country.code,
      name: country.name,
      displayCurrency: currency,
      currencyVerified: Boolean(currency),
      locale: readiness.locale || null,
      timezone: readiness.timezone || null,
    } : null,
    overall: !countryKnown
      ? 'market_selection_required'
      : counts.confirmation_required > 0 || counts.not_enabled > 0
        ? 'partial_coverage'
        : 'verified_capabilities_only',
    summary: {
      total: checks.length,
      verified: counts.verified || 0,
      available: counts.available || 0,
      notEnabled: counts.not_enabled || 0,
      confirmationRequired: counts.confirmation_required || 0,
    },
    checks,
    boundaries: [
      'Country detection does not prove a business is legally registered or eligible to sell there.',
      'A configured payment key does not prove merchant approval, settlement availability or successful live payments.',
      'Never calculate tax, promise delivery, or claim legal compliance from this report alone.',
      'Never expose environment secrets or use visitor country to change server-authoritative payment amounts.',
    ],
  });
}
