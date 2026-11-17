import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const premium = fs.readFileSync('assets/ovyx-app-studio-premium-polish.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');

test('App Studio builds a distinct responsive workbench from existing live feature nodes', () => {
  for (const marker of [
    'function composeWorkbench(root)',
    'ovyx-as-workbench__grid',
    'data-ovyx-as-slot="analyze"',
    'data-ovyx-as-slot="build"',
    'data-ovyx-as-slot="verify"',
    'data-ovyx-as-slot="release"',
    "place('ovyx-app-studio-url-analyzer-panel', 'analyze')",
    "place('ovyx-app-studio-link-builder', 'build')",
    "place('ovyx-app-studio-project-brain', 'verify')",
    "place('ovyx-app-studio-release', 'release')",
    'advanced.appendChild(node)',
    'node.parentNode !== body',
    'addWorkbenchLayoutStyles();',
    '@media(max-width:720px)'
  ]) assert.ok(premium.includes(marker), 'missing workbench contract: ' + marker);
  assert.match(premium, /The panels are\s*\n\s*\/\/ moved as live DOM nodes/);
});

test('App Studio runtime cache token points at the new composition', () => {
  assert.match(middleware, /ovyx-app-studio-premium-polish\.js\?v=20261117-1/);
});
