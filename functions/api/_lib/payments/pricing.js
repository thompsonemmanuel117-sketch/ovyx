'use strict';

/**
 * OVYX — SERVER AUTHORITATIVE PRICING ENGINE
 *
 * File:
 *   functions/api/_lib/payments/pricing.js
 *
 * IMPORTANT:
 *   This file does NOT permanently hard-code OVYX prices.
 *
 *   The authoritative pricing matrix lives in:
 *
 *     /system/config
 *
 *   Firestore
 *
 *   The OVYX Root Admin Command Center writes:
 *
 *     config.pricing
 *
 *   Example:
 *
 *     {
 *       pricing: {
 *         pro: {
 *           ngn: 33500,
 *           usd: 20
 *         },
 *         max: {
 *           ngn: 209375,
 *           usd: 120
 *         }
 *       }
 *     }
 *
 *   The payment server reads that configuration whenever
 *   it needs authoritative pricing.
 *
 * SECURITY MODEL:
 *
 *   Browser price             = DISPLAY ONLY
 *   localStorage price        = UNTRUSTED
 *   Firebase client price     = UNTRUSTED
 *   request.amount            = UNTRUSTED
 *   request.currency          = UNTRUSTED
 *
 *   Firestore /system/config
 *                             = AUTHORITATIVE
 *
 *   Therefore a malicious user cannot reduce the amount by
 *   modifying the browser request.
 */

const {
  firestoreGet
} = require('../firestore.js');

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CONFIG_COLLECTION =
  'system';

const CONFIG_DOCUMENT =
  'config';

const SUPPORTED_TIERS =
  Object.freeze([
    'pro',
    'max'
  ]);

const SUPPORTED_CURRENCIES =
  Object.freeze([
    'NGN',
    'USD'
  ]);

/*
 * These are NOT authoritative prices.
 *
 * They exist only so a newly created OVYX installation can
 * still have a known initial configuration before the owner
 * has saved the first pricing matrix.
 *
 * Once /system/config.pricing exists, its values take
 * precedence.
 *
 * Existing OVYX baseline:
 *
 *   Pro = NGN 33,500 / USD 20
 *   Max = NGN 209,375 / USD 120
 */
const INITIAL_PRICING =
  Object.freeze({
    pro: Object.freeze({
      ngn: 33500,
      usd: 20
    }),

    max: Object.freeze({
      ngn: 209375,
      usd: 120
    })
  });

/* -------------------------------------------------------------------------- */
/* Basic normalization                                                        */
/* -------------------------------------------------------------------------- */

function normalizeTier(value) {
  const tier =
    String(value || '')
      .trim()
      .toLowerCase();

  if (
    !SUPPORTED_TIERS.includes(
      tier
    )
  ) {
    throw new Error(
      'Unsupported OVYX subscription plan.'
    );
  }

  return tier;
}

function normalizeCurrency(value) {
  const currency =
    String(value || '')
      .trim()
      .toUpperCase();

  if (
    !SUPPORTED_CURRENCIES.includes(
      currency
    )
  ) {
    throw new Error(
      'Unsupported OVYX payment currency.'
    );
  }

  return currency;
}

/* -------------------------------------------------------------------------- */
/* Amount validation                                                          */
/* -------------------------------------------------------------------------- */

function normalizeAmount(value) {
  if (
    typeof value ===
    'string' &&
    value.trim() === ''
  ) {
    return null;
  }

  const amount =
    Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  /*
   * Money values are kept at two decimal
   * places.
   */
  return Number(
    amount.toFixed(2)
  );
}

/* -------------------------------------------------------------------------- */
/* Pricing matrix                                                             */
/* -------------------------------------------------------------------------- */

function createInitialPricing() {
  return {
    pro: {
      ngn:
        INITIAL_PRICING
          .pro
          .ngn,

      usd:
        INITIAL_PRICING
          .pro
          .usd
    },

    max: {
      ngn:
        INITIAL_PRICING
          .max
          .ngn,

      usd:
        INITIAL_PRICING
          .max
          .usd
    }
  };
}

/**
 * Sanitizes the pricing object retrieved from Firestore.
 *
 * Invalid individual values do not silently replace a
 * valid value from the server configuration.
 *
 * The fallback is used only for a missing/invalid field.
 */
function sanitizePricing(
  candidate
) {
  const pricing =
    createInitialPricing();

  if (
    !candidate ||
    typeof candidate !==
      'object' ||
    Array.isArray(candidate)
  ) {
    return pricing;
  }

  for (
    const tier of SUPPORTED_TIERS
  ) {
    const configuredTier =
      candidate[tier];

    if (
      !configuredTier ||
      typeof configuredTier !==
        'object' ||
      Array.isArray(
        configuredTier
      )
    ) {
      continue;
    }

    const configuredNGN =
      normalizeAmount(
        configuredTier.ngn
      );

    const configuredUSD =
      normalizeAmount(
        configuredTier.usd
      );

    if (
      configuredNGN !== null
    ) {
      pricing[tier].ngn =
        configuredNGN;
    }

    if (
      configuredUSD !== null
    ) {
      pricing[tier].usd =
        configuredUSD;
    }
  }

  return pricing;
}

/* -------------------------------------------------------------------------- */
/* Server configuration                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Loads the authoritative OVYX system configuration.
 *
 * This function intentionally reads only from the server-side
 * Firebase service-account path through firestore.js.
 *
 * The browser cannot influence this read.
 */
async function loadSystemConfig(
  env
) {
  return (
    await firestoreGet(
      env,
      [
        CONFIG_COLLECTION,
        CONFIG_DOCUMENT
      ]
    )
  ) || {};
}

/**
 * Loads the pricing matrix from:
 *
 *   /system/config
 *
 *   config.pricing
 */
async function loadPricing(
  env
) {
  const config =
    await loadSystemConfig(
      env
    );

  return sanitizePricing(
    config.pricing
  );
}

/**
 * Returns the complete authoritative pricing matrix.
 */
async function getPricingMatrix(
  env
) {
  return loadPricing(env);
}

/* -------------------------------------------------------------------------- */
/* Price lookup                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Gets the server-authoritative price for a specific
 * OVYX tier and currency.
 *
 * Example:
 *
 *   await getServerPrice(
 *     env,
 *     'pro',
 *     'NGN'
 *   );
 *
 * Returns:
 *
 *   {
 *     tier: 'pro',
 *     currency: 'NGN',
 *     amount: 33500,
 *     minorUnitAmount: 3350000
 *   }
 */
async function getServerPrice(
  env,
  tier,
  currency = 'NGN'
) {
  const normalizedTier =
    normalizeTier(tier);

  const normalizedCurrency =
    normalizeCurrency(
      currency
    );

  const pricing =
    await loadPricing(env);

  const currencyKey =
    normalizedCurrency.toLowerCase();

  const amount =
    pricing[
      normalizedTier
    ][currencyKey];

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      `No valid ${normalizedCurrency} price is configured for the ${normalizedTier.toUpperCase()} plan.`
    );
  }

  return {
    tier:
      normalizedTier,

    currency:
      normalizedCurrency,

    amount:
      Number(
        amount.toFixed(2)
      ),

    /*
     * OPay/card integrations commonly need
     * the minor-unit representation for money
     * comparisons.
     *
     * NGN 33,500.00
     * becomes
     * 3,350,000 kobo.
     */
    minorUnitAmount:
      Math.round(
        amount * 100
      )
  };
}

/* -------------------------------------------------------------------------- */
/* Payment amount validation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Verifies a provider-reported amount against
 * the current server-authoritative amount.
 *
 * IMPORTANT:
 *
 * This should be used when processing the provider
 * result/webhook.
 *
 * We do NOT trust the amount supplied by the
 * browser.
 */
function assertServerAmount(
  expectedAmount,
  receivedAmount
) {
  const expected =
    normalizeAmount(
      expectedAmount
    );

  const received =
    normalizeAmount(
      receivedAmount
    );

  if (
    expected === null
  ) {
    throw new Error(
      'The server-authoritative payment amount is invalid.'
    );
  }

  if (
    received === null
  ) {
    throw new Error(
      'The payment provider returned an invalid amount.'
    );
  }

  /*
   * Compare normalized two-decimal money values.
   */
  if (
    expected !== received
  ) {
    throw new Error(
      `Payment amount mismatch. Expected ${expected.toFixed(
        2
      )}, received ${received.toFixed(2)}.`
    );
  }

  return true;
}

/**
 * Verifies provider currency against the
 * server-authoritative currency.
 */
function assertCurrency(
  expectedCurrency,
  receivedCurrency
) {
  const expected =
    normalizeCurrency(
      expectedCurrency
    );

  const received =
    normalizeCurrency(
      receivedCurrency
    );

  if (
    expected !== received
  ) {
    throw new Error(
      `Payment currency mismatch. Expected ${expected}, received ${received}.`
    );
  }

  return true;
}

/**
 * Convenience helper:
 *
 * Loads the server price and validates the provider
 * amount/currency in one operation.
 */
async function verifyProviderAmount(
  env,
  {
    tier,
    currency,
    receivedAmount,
    receivedCurrency
  }
) {
  const expected =
    await getServerPrice(
      env,
      tier,
      currency
    );

  assertServerAmount(
    expected.amount,
    receivedAmount
  );

  assertCurrency(
    expected.currency,
    receivedCurrency
  );

  return expected;
}

/* -------------------------------------------------------------------------- */
/* Pricing configuration metadata                                             */
/* -------------------------------------------------------------------------- */

/**
 * Returns the configured pricing together with
 * its source.
 *
 * This is useful for diagnostics and admin systems.
 */
async function getPricingConfiguration(
  env
) {
  const config =
    await loadSystemConfig(
      env
    );

  const hasConfiguredPricing =
    !!(
      config &&
      config.pricing &&
      typeof config.pricing ===
        'object'
    );

  return {
    pricing:
      sanitizePricing(
        config.pricing
      ),

    source:
      hasConfiguredPricing
        ? 'firestore:/system/config'
        : 'initial-configuration',

    configurableBy:
      'ROOT_SUPERUSER',

    clientAuthoritative:
      false
  };
}

/* -------------------------------------------------------------------------- */
/* Safe export                                                                */
/* -------------------------------------------------------------------------- */

module.exports = {
  SUPPORTED_TIERS,
  SUPPORTED_CURRENCIES,

  normalizeTier,
  normalizeCurrency,
  normalizeAmount,

  sanitizePricing,

  loadSystemConfig,
  loadPricing,
  getPricingMatrix,

  getServerPrice,

  assertServerAmount,
  assertCurrency,
  verifyProviderAmount,

  getPricingConfiguration
};
