import assert from 'node:assert/strict';
import { buildMarketContext, formatMarketCurrency } from '../functions/_lib/market-context.js';
import { buildVisualAssetPlan } from '../functions/_lib/visual-asset-plan.js';
import { buildExperienceBrief } from '../functions/_lib/experience.js';

const lagos = buildMarketContext('Build a premium Lagos AI realtor website with property listings and WhatsApp enquiries.');
assert.equal(lagos.country, 'Nigeria');
assert.equal(lagos.locale, 'en-NG');
assert.equal(lagos.currency, 'NGN');
assert.equal(lagos.timeZone, 'Africa/Lagos');
assert.ok(lagos.implementationRules.some(rule => /WhatsApp is a contact link/i.test(rule)));
assert.equal(formatMarketCurrency(33500, lagos), 'NGN 33,500.00');

const us = buildMarketContext('Build a property site for buyers in the United States.');
assert.equal(us.country, 'United States');
assert.equal(us.locale, 'en-US');
assert.equal(us.currency, 'USD');
assert.equal(formatMarketCurrency(33500, us), '$33,500.00');

const override = buildMarketContext('Build a Lagos-focused website.', { country: 'Nigeria', locale: 'fr-FR', currency: 'EUR', timeZone: 'Europe/Paris', language: 'fr' });
assert.equal(override.locale, 'fr-FR');
assert.equal(override.currency, 'EUR');
assert.equal(override.timeZone, 'Europe/Paris');

const unspecified = buildMarketContext('Build a website for a new business.');
assert.equal(unspecified.country, null);
assert.equal(unspecified.locale, null);
assert.equal(unspecified.currency, null);
assert.equal(formatMarketCurrency(100, unspecified), null);

const plan = buildVisualAssetPlan('Build a cinematic animated property marketplace with photo galleries.', { assets: [{ name: 'brand.svg' }] }, 'realEstate');
assert.equal(plan.imageHeavy, true);
assert.equal(plan.motionRequested, true);
assert.deepEqual(plan.suppliedAssets, ['brand.svg']);
assert.ok(plan.requiredAssetKinds.some(item => /architectural photography/i.test(item)));
assert.ok(plan.motionPlan.some(item => /prefers-reduced-motion/i.test(item)));
assert.ok(plan.responsiveTargets.some(item => item.width === 390));
assert.ok(plan.responsiveTargets.some(item => item.width === 1440));

const brief = buildExperienceBrief('Build a premium Lagos real-estate marketplace with animated property cards.');
assert.equal(brief.marketContext.country, 'Nigeria');
assert.equal(brief.marketContext.currency, 'NGN');
assert.equal(brief.visualAssetPlan.imageHeavy, true);
assert.equal(brief.visualAssetPlan.motionRequested, true);
console.log('OVYX market context and visual asset planning tests passed.');
