import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../assets/ovyx-webstudio-project-export.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');

assert.match(runtime, /data-ovyx-project-export/);
assert.match(runtime, /Download code/);
assert.match(runtime, /buildZip\(files\)/);
assert.match(runtime, /0x04034B50/);
assert.match(runtime, /0x02014B50/);
assert.match(runtime, /0x06054B50/);
assert.match(runtime, /FULL_STACK_SETUP\.md/);
assert.match(runtime, /README_OVYX_EXPORT\.md/);
assert.match(runtime, /OVYX_EXPORT_MANIFEST\.json/);
assert.match(runtime, /OVYX_EXPORT_EXCLUSIONS\.md/);
assert.match(runtime, /Backend\/API routes/);
assert.match(runtime, /GitHub repository/);
assert.match(runtime, /does not publish the website/);
assert.match(runtime, /\.env/);
assert.match(runtime, /credentials\.json/);
assert.match(runtime, /containsLikelySecret/);
assert.match(runtime, /possible embedded credential/);
assert.match(runtime, /source and backend files as a ZIP/);
assert.match(runtime, /MAX_TOTAL_BYTES/);
assert.match(runtime, /window\.OVYXWebStudioProjectExport =/);
assert.match(middleware, /\/assets\/ovyx-webstudio-project-export\.js\?v=20261021-1/);
assert.match(headers, /\/assets\/ovyx-webstudio-project-export\.js\n  Cache-Control: no-store, no-cache, must-revalidate/);
assert.doesNotThrow(() => new Function(runtime), 'Project ZIP exporter must parse as valid JavaScript.');

console.log('OVYX Web Studio project ZIP export, backend handoff, path guards, and credential exclusion contracts passed.');
