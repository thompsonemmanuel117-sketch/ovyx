import assert from 'node:assert/strict';
import { resolveGlobalCompatibility } from '../functions/_lib/global-compatibility.js';
function request(country) { const value = new Request('https://ovyx.test/api/global/compatibility'); Object.defineProperty(value, 'cf', { value: { country, timezone: 'Etc/UTC' } }); return value; }
const nigeria = resolveGlobalCompatibility({ request: request('NG'), env: {} });
assert.equal(nigeria.market.code, 'NG');
assert.equal(nigeria.market.displayCurrency, 'NGN');
assert.equal(nigeria.overall, 'partial_coverage');
assert.equal(nigeria.checks.find(item => item.id === 'checkout').status, 'not_enabled');
const gb = resolveGlobalCompatibility({ request: request('GB'), env: {} });
assert.equal(gb.market.displayCurrency, 'GBP');
assert.equal(gb.checks.find(item => item.id === 'checkout').currency, 'USD');
assert.equal(gb.checks.find(item => item.id === 'checkout').localCurrency, false);
const iceland = resolveGlobalCompatibility({ request: request('IS'), env: {} });
assert.equal(iceland.market.displayCurrency, null);
assert.equal(iceland.checks.find(item => item.id === 'display_currency').status, 'confirmation_required');
const unknown = resolveGlobalCompatibility({ request: request('ZZ'), env: {} });
assert.equal(unknown.market, null);
assert.equal(unknown.overall, 'market_selection_required');
console.log('OVYX worldwide compatibility tests passed.');
