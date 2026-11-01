import assert from 'node:assert/strict';
import { buildDesignSystemContract } from '../functions/_lib/design-system-contract.js';
import { buildExperienceBrief } from '../functions/_lib/experience.js';

const contract = buildDesignSystemContract(
  'Create a multi-page premium booking website with a contact form, appointment calendar, and subtle animation.',
  { siteOrigin: 'https://example.com', brandProfile: { name: 'Example', colors: { primary: '#123456' } }, assets: ['brand-mark.svg'] }
);

assert.equal(contract.version, 1);
assert.equal(contract.authority.suppliedBrandProfile, true);
assert.equal(contract.authority.suppliedDesignTokens, false);
assert.equal(contract.authority.suppliedAssetCount, 1);
assert.equal(contract.seoSystem.canonicalOriginKnown, true);
assert.equal(contract.seoSystem.multiPageIntent, true);
assert.equal(contract.motionSystem.requested, true);
assert.ok(contract.componentSystem.requirements.some(item => /component-to-page usage/i.test(item)));
assert.ok(contract.componentSystem.requirements.some(item => /variants/i.test(item)));
assert.ok(contract.interactionSystem.requiredStates.includes('focus-visible'));
assert.ok(contract.interactionSystem.rules.some(item => /Booking flows must distinguish availability/i.test(item)));
assert.ok(contract.interactionSystem.rules.some(item => /Forms must have associated labels/i.test(item)));
assert.ok(contract.responsiveSystem.viewports.some(item => item.width === 320));
assert.ok(contract.responsiveSystem.viewports.some(item => item.width === 1440));
assert.ok(contract.imageSystem.rules.some(item => /srcset and sizes/i.test(item)));
assert.ok(contract.imageSystem.rules.some(item => /alt text/i.test(item)));
assert.ok(contract.accessibilitySystem.rules.some(item => /4.5:1/i.test(item)));
assert.ok(contract.accessibilitySystem.rules.some(item => /prefers-reduced-motion/i.test(item)));
assert.ok(contract.seoSystem.rules.some(item => /canonical URL only when/i.test(item)));
assert.ok(contract.seoSystem.rules.some(item => /structured data only/i.test(item)));

const experience = buildExperienceBrief('Build a dashboard for a small team.');
assert.equal(experience.designSystemContract.version, 1);
assert.equal(experience.designSystemContract.seoSystem.canonicalOriginKnown, false);
assert.equal(experience.designSystemContract.seoSystem.multiPageIntent, false);
assert.ok(experience.qualityGates.includes('semantic and accessible markup'));

const minimal = buildDesignSystemContract('Build a simple one-page portfolio.');
assert.equal(minimal.motionSystem.requested, false);
assert.equal(minimal.seoSystem.canonicalOriginKnown, false);
assert.ok(!minimal.interactionSystem.rules.some(item => /Commerce flows must show/i.test(item)));
assert.ok(!minimal.interactionSystem.rules.some(item => /Booking flows must distinguish/i.test(item)));

console.log('OVYX design system contract tests passed: adaptive visual tokens, reusable components, interaction states, responsive behavior, imagery, SEO and WCAG 2.2 AA guidance.');
