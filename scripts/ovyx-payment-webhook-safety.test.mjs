import assert from 'node:assert/strict';
import fs from 'node:fs';

const opay = fs.readFileSync(new URL('../functions/api/payments/opay-webhook.js', import.meta.url), 'utf8');
const paystack = fs.readFileSync(new URL('../functions/api/payments/paystack-webhook.js', import.meta.url), 'utf8');

assert.match(opay, /timingSafeEqual\(supplied,expected\)/, 'OPay HMAC signatures must be compared in constant time.');
assert.match(opay, /!\/\^\[a-f0-9\]\{128\}\$\/\.test\(actual\)/, 'OPay signatures must be validated as fixed-length SHA3-512 hex.');
const opayFulfilled = opay.indexOf("if(record.fulfillmentStatus==='fulfilled')");
const opayClaim = opay.indexOf('const claim=await setFirestoreDocumentIfCurrent');
assert.ok(opayFulfilled >= 0 && opayClaim > opayFulfilled, 'Already-fulfilled OPay orders must return before changing the order back to processing.');
assert.match(opay, /fulfillmentStatus==='processing'.*alreadyProcessing/s, 'A recent OPay processing claim must prevent concurrent duplicate fulfillment.');
assert.match(opay, /5\*60\*1000/, 'A stale OPay processing claim must be recoverable after its bounded lease.');

assert.match(paystack, /timingSafeEqual\(actualBytes,expectedBytes\)/, 'Paystack HMAC signatures must be compared in constant time.');
const paystackFulfilled = paystack.indexOf("if(record.fulfillmentStatus==='fulfilled')");
const paystackClaim = paystack.indexOf('const claim=await claimIdempotencyKey');
assert.ok(paystackFulfilled >= 0 && paystackClaim > paystackFulfilled, 'Already-fulfilled Paystack orders must return before claiming a new event key.');
assert.doesNotMatch(paystack, /createHash\('sha256'\)\.update\(signature\)/, 'Webhook signature verification must not use ordinary string digest equality.');

console.log('OVYX payment webhook safety checks passed: constant-time signatures, fulfilled-state preservation, duplicate processing guard and stale-claim recovery.');
