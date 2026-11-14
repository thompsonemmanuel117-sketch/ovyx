import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('assets/ovyx-assistant-workspace.js', 'utf8');
const closeRule = source.match(/\.ovyx-ai-assistant-close\{([^}]*)\}/);

assert.ok(closeRule, 'Assistant close-button styles must exist.');
assert.match(
  closeRule[1],
  /position:static!important;inset:auto!important;top:auto!important;right:auto!important/,
  'The legacy absolute top-right rule must be neutralized so close and menu actions never overlap.'
);
assert.match(
  closeRule[1],
  /min-width:38px!important/,
  'The desktop close button must keep a stable, independent hit area.'
);
assert.match(
  source,
  /\.ovyx-native-more,#kernel-brain-bot-panel\.ovyx-native-workspace \.ovyx-ai-assistant-close\{width:36px!important;min-width:36px!important;height:36px!important;flex-basis:36px!important\}/,
  'The mobile header actions must use equal, non-overlapping hit-area sizes.'
);

console.log('OVYX assistant header layout regression tests passed.');
