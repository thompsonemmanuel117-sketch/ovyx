import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/ovyx-sentinel-scheduler-deploy.yml', 'utf8');
assert.match(workflow, /randomBytes\(48\)\.toString\('base64url'\)/, 'The shared secret must be generated from cryptographically secure randomness.');
assert.match(workflow, /pages secret put OVYX_SENTINEL_CRON_SECRET/, 'The production Pages endpoint must receive the generated secret.');
assert.match(workflow, /--secrets-file \"\$RUNNER_TEMP\/ovyx-sentinel-secrets\.json\"/, 'The Worker must receive the same generated secret through a temporary secret file.');
assert.match(workflow, /crons = \[\"\*\/30 \* \* \* \*\"\]/, 'Sentinel should keep its expected 30-minute schedule.');
assert.match(workflow, /for attempt in 1 2 3 4 5 6 7 8/, 'The production endpoint must tolerate bounded secret-propagation delay.');
assert.match(workflow, /if \[\[ \"\$SCAN_STATUS\" != \"401\" \]\]; then/, 'Retry only authentication rejections and report other failures promptly.');
assert.match(workflow, /SAFE_SCAN_CODE/, 'A failed scan should report only the safe error code for diagnosis.');
assert.match(workflow, /::add-mask::\$SENTINEL_SECRET/, 'The generated secret must be masked by the job logger.');
assert.doesNotMatch(workflow, /echo\s+\"\$SENTINEL_SECRET\"/, 'The raw shared secret must never be printed.');
assert.match(workflow, /Confirmed authenticated Sentinel scan/, 'A run is only successful after a scheduled scan response is verified.');
console.log('Sentinel scheduler deployment contract passed: secret synchronization, 30-minute cron, bounded auth retry, safe error reporting, and successful scan confirmation.');
