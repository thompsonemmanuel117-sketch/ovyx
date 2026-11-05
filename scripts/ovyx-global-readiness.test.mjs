import assert from 'node:assert/strict';
import { resolveGlobalReadiness } from '../functions/_lib/global-readiness.js';
import { onRequestGet } from '../functions/api/global/readiness.js';

function request(country, language = 'en-US,en;q=0.9', timezone = 'Etc/UTC') {
  const value = new Request('https://ovyx.test/api/global/readiness', {
    headers: { 'Accept-Language': language },
  });
  Object.defineProperty(value, 'cf', { value: { country, timezone } });
  return value;
}

{
  const result = resolveGlobalReadiness({
    request: request('NG', 'en-NG,en;q=0.8', 'Africa/Lagos'),
    env: { OPAY_CASHIER_PUBLIC_KEY: 'public', OPAY_CASHIER_SECRET_KEY: 'private' },
  });
  assert.equal(result.detected, true);
  assert.deepEqual(result.country, { code: 'NG', name: 'Nigeria', currency: 'NGN', currencyKnown: true });
  assert.equal(result.locale, 'en-NG');
  assert.equal(result.timezone, 'Africa/Lagos');
  assert.equal(result.checkout.currency, 'NGN');
  assert.equal(result.checkout.provider, 'opay');
  assert.equal(result.checkout.state, 'ready');
  assert.equal(result.ai.provider, 'cloudflare-workers-ai-only');
}

{
  const result = resolveGlobalReadiness({
    request: request('GB', 'fr-GB,fr;q=0.9,en;q=0.8', 'Europe/London'),
    env: { PAYSTACK_SECRET_KEY: 'server-secret' },
  });
  assert.equal(result.country.currency, 'GBP');
  assert.equal(result.locale, 'fr-GB');
  assert.equal(result.checkout.currency, 'USD');
  assert.equal(result.checkout.provider, 'paystack');
  assert.equal(result.checkout.state, 'ready');
  assert.equal(result.checkout.localCurrencyCheckout, false);
  assert.match(result.checkout.note, /currently uses USD/);
}

{
  const result = resolveGlobalReadiness({
    request: request('JP', 'ja-JP,ja;q=0.9'),
    env: { STRIPE_SECRET_KEY: 'configured-but-not-live-checkout' },
  });
  assert.equal(result.country.currency, 'JPY');
  assert.equal(result.locale, 'ja-JP');
  assert.equal(result.checkout.currency, 'USD');
  assert.equal(result.checkout.state, 'configuration_required');
  assert.equal(result.integrationReadiness.stripeAdapter, 'registered_adapter_checkout_not_yet_enabled');
}

{
  const result = resolveGlobalReadiness({
    request: request('ZZ', 'not_a_locale;q=1,en;q=0.5'),
    env: {},
  });
  assert.equal(result.detected, false);
  assert.equal(result.country, null);
  assert.equal(result.locale, 'en');
  assert.equal(result.timezone, 'Etc/UTC');
}

{
  const response = await onRequestGet({
    request: request('US', 'en-US'),
    env: { PAYSTACK_SECRET_KEY: 'NEVER_RETURN_THIS_SECRET' },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const body = await response.json();
  assert.equal(body.country.code, 'US');
  assert.equal(body.checkout.currency, 'USD');
  assert.equal(JSON.stringify(body).includes('NEVER_RETURN_THIS_SECRET'), false);
}

console.log('OVYX global readiness tests passed: country defaults, language negotiation, checkout capability boundaries and secret non-disclosure.');
