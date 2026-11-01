import assert from 'node:assert/strict';
import { buildWebsiteFileGraph, analyzeWebsiteFileImpact } from '../functions/_lib/website-file-graph.js';

const graph = buildWebsiteFileGraph({
  'index.html': '<a href="/about">About</a><form action="/api/contact"></form><link rel="stylesheet" href="./styles/site.css"><script type="module" src="./src/main.js"></script>',
  'styles/site.css': '@import "./tokens.css"; .hero { background: url("../assets/hero.webp"); }',
  'styles/tokens.css': ':root { --space: 1rem; }',
  'src/main.js': "import { mount } from './app.js'; import './theme.css';",
  'src/app.js': "import { render } from './render.js'; export { render };",
  'src/render.js': 'export function render() {}',
  'src/theme.css': 'body { color: black; }',
  'assets/hero.webp': 'binary-placeholder-not-interpreted',
  'external.js': "import React from 'react'; import './missing-local.js';",
  '../escape.js': 'must be ignored',
});
assert.equal(graph.status, 'analyzed');
assert.ok(graph.nodes.every(node => !Object.prototype.hasOwnProperty.call(node, 'content')));
assert.ok(graph.edges.some(edge => edge.from === 'index.html' && edge.to === 'styles/site.css'));
assert.ok(graph.edges.some(edge => edge.from === 'src/main.js' && edge.to === 'src/app.js'));
assert.ok(graph.edges.some(edge => edge.from === 'styles/site.css' && edge.to === 'assets/hero.webp'));
assert.ok(graph.missingReferences.some(item => item.specifier === './missing-local.js'));
assert.ok(!graph.missingReferences.some(item => item.from === 'index.html' && /about|api\\/contact/.test(item.specifier)));
assert.ok(!graph.nodes.some(node => node.path.includes('escape')));
const impact = analyzeWebsiteFileImpact(graph, ['src/render.js']);
assert.deepEqual(impact.impactedPaths, ['src/app.js', 'src/main.js', 'index.html']);
assert.equal(impact.totalAffected, 4);
assert.equal(analyzeWebsiteFileImpact(graph, ['not-in-project.js']).unknownChangedPaths[0], 'not-in-project.js');
const empty = buildWebsiteFileGraph(null);
assert.equal(empty.status, 'no-project-files');
const bounded = buildWebsiteFileGraph({ 'a.js': 'x'.repeat(20_000), 'b.js': 'y'.repeat(20_000) }, { maxTotalSourceChars: 20_000 });
assert.equal(bounded.limits.truncated, true);
const oversized = buildWebsiteFileGraph({ 'huge.js': 'z'.repeat(240_001) });
assert.equal(oversized.status, 'bounded-partial');
assert.equal(oversized.limits.truncated, true);
console.log('OVYX website file graph tests passed.');

const edgeBounded = buildWebsiteFileGraph({
  'src/a.js': "import './b.js'; import './c.js';",
  'src/b.js': 'export const b = true;',
  'src/c.js': 'export const c = true;',
}, { maxEdges: 1 });
assert.equal(edgeBounded.edges.length, 1);
assert.equal(edgeBounded.limits.edgesTruncated, true);
assert.equal(edgeBounded.status, 'bounded-partial');
const missingBounded = buildWebsiteFileGraph({
  'src/a.js': "import './missing-a.js'; import './missing-b.js';",
}, { maxMissingReferences: 1 });
assert.equal(missingBounded.missingReferences.length, 1);
assert.equal(missingBounded.limits.missingReferencesTruncated, true);
