import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadCommonJs(path, fetchImpl) {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    fetch: fetchImpl,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Array,
    Math,
    Number,
    String,
    Object,
    JSON,
    Error,
    Promise,
    encodeURIComponent,
  }, { filename: path });
  return module.exports;
}

let opayCalls = 0;
let opayRequest = null;
const opay = loadCommonJs('../functions/api/_lib/payments/opay-cashier.js', async (url, options) => {
  opayCalls += 1;
  opayRequest = { url, options };
  return { ok: true, status: 200, json: async () => ({ code: '00000', data: { cashierUrl: 'https://checkout.example.invalid/session', orderNo: 'order-1' } }) };
});

await assert.rejects(
  () => opay.createCashierPayment({
    OPAY_MERCHANT_ID: 'PENDING',
    OPAY_CASHIER_PUBLIC_KEY: 'PENDING',
    OPAY_CASHIER_SECRET_KEY: 'PENDING',
  }, { reference: 'ref-1', amount: 100, returnUrl: 'https://ovyx.example.invalid/return', callbackUrl: 'https://ovyx.example.invalid/callback', cancelUrl: 'https://ovyx.example.invalid/cancel', email: 'customer@example.invalid', uid: 'uid-1', customerName: 'Customer', productName: 'Plan', description: 'Test' }),
  error => error.code === 'OPAY_NOT_CONFIGURED',
  'OPay placeholder credentials must fail before any provider request.',
);
assert.equal(opayCalls, 0);

const checkout = await opay.createCashierPayment({
  OPAY_MERCHANT_ID: 'merchant-fixture',
  OPAY_PUBLIC_KEY: 'public-fixture',
  OPAY_SECRET_KEY: 'private-fixture',
}, { reference: 'ref-2', amount: 100, returnUrl: 'https://ovyx.example.invalid/return', callbackUrl: 'https://ovyx.example.invalid/callback', cancelUrl: 'https://ovyx.example.invalid/cancel', email: 'customer@example.invalid', uid: 'uid-2', customerName: 'Customer', productName: 'Plan', description: 'Test' });
assert.equal(checkout.cashierUrl, 'https://checkout.example.invalid/session');
assert.equal(opayCalls, 1, 'Legacy OPay aliases must remain usable.');
assert.equal(opayRequest.options.headers.MerchantId, 'merchant-fixture');

let paystackCalls = 0;
const paystack = loadCommonJs('../functions/api/_lib/payments/paystack.js', async () => {
  paystackCalls += 1;
  return { ok: true, status: 200, json: async () => ({ status: true, data: { authorization_url: 'https://checkout.example.invalid/paystack', reference: 'ref-3' } }) };
});
await assert.rejects(
  () => paystack.initializePayment({ PAYSTACK_SECRET_KEY: 'CHANGE_ME' }, { reference: 'ref-3', amount: 2.99, currency: 'USD', email: 'customer@example.invalid', uid: 'uid-3' }),
  error => error.code === 'PAYSTACK_NOT_CONFIGURED',
  'Paystack placeholder credentials must fail before any provider request.',
);
assert.equal(paystackCalls, 0);
await paystack.initializePayment({ PAYSTACK_SECRET_KEY: 'sk_test_valid-fixture' }, { reference: 'ref-4', amount: 2.99, currency: 'USD', email: 'customer@example.invalid', uid: 'uid-4' });
assert.equal(paystackCalls, 1, 'A syntactically valid test-mode key must not be mistaken for a placeholder.');

console.log('OVYX payment configuration tests passed: placeholders fail closed, OPay aliases work, and valid test-mode Paystack keys remain accepted.');
