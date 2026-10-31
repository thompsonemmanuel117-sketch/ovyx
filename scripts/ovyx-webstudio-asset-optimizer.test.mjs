import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [optimizer, middleware, packageSource] = await Promise.all([
  readFile(new URL('../assets/ovyx-webstudio-asset-optimizer.js', import.meta.url), 'utf8'),
  readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
]);
const scripts = JSON.parse(packageSource).scripts || {};

assert.match(scripts.test || '', /node scripts\\/ovyx-webstudio-asset-optimizer\\.test\\.mjs/,
  'Asset optimizer tests must be part of npm test.');
assert.match(middleware, /ovyx-webstudio-asset-optimizer\\.js\\?v=20261031-1/);
assert.match(optimizer, /window\\.OVYXAssetStore/);
assert.match(optimizer, /store\\.upload = async function/);
assert.match(optimizer, /originalUpload\\(result\\.file, projectId, options \\|\\| \\{\\}\\)/);
assert.match(optimizer, /createImageBitmap/);
assert.match(optimizer, /MAX_DIMENSION = 2560/);
assert.match(optimizer, /MIN_BYTES = 512 \\* 1024/);
assert.match(optimizer, /type: 'image\\/webp', quality: QUALITY/);
assert.match(optimizer, /new File\\(\\[blob\\], replaceExtension\\(file\\.name\\)/);
assert.match(optimizer, /no-meaningful-size-reduction/);
assert.match(optimizer, /ovyx:asset-optimized/);
assert.match(optimizer, /savedBytes: Math\\.max/);
assert.match(optimizer, /bitmap && bitmap\\.close/);
assert.doesNotMatch(optimizer, /fetch\\('https?:|https:\\/\\//,
  'Asset optimization must be local to the browser and must not send user images to an external service.');
console.log('OVYX asset optimizer tests passed: local WebP conversion, bounded dimensions, upload preservation and safe fallback.');
