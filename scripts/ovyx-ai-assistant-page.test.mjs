import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const pageRuntime = fs.readFileSync('assets/ovyx-ai-assistant-page.js', 'utf8');
const pageStyles = fs.readFileSync('assets/css/ovyx-ai-assistant-page.css', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const nativeAssistant = fs.readFileSync('assets/ovyx-assistant-workspace.js', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

new vm.Script(pageRuntime, { filename: 'ovyx-ai-assistant-page.js' });

assert.match(middleware, /ovyx-ai-assistant-page\.js\?v=20261120-1/,
  'The dedicated Assistant page runtime must be loaded by the Pages middleware.');
assert.match(middleware, /ovyx-ai-assistant-page\\.css\\?v=20261121-1/,
  'The dedicated Assistant page styles must be loaded by the Pages middleware.');
assert.match(nativeAssistant, /'ai-assistant'/, 'The native Assistant action router must allow navigation to the dedicated Assistant page.');
assert.match(pageRuntime, /view-ai-assistant/,
  'The Assistant must have its own routed view, separate from Workspace repair tools.');
assert.match(pageRuntime, /if \(!assistant\) return true/, 'The route must install before the legacy Assistant lazily creates its panel.');
assert.match(pageRuntime, /originalOpen\.apply\(bot, args\);[\s\S]*?mountPage\(\)/, 'The first native open must move the lazily-created panel into the full-page route.');
assert.match(pageRuntime, /appendChild\(assistant\)/,
  'The page must reuse and reparent the existing Assistant panel instead of cloning a second chat.');
assert.match(pageRuntime, /bot\.open = function/,
  'The existing public Assistant open action must navigate into its dedicated page.');
assert.match(pageRuntime, /bot\.close = function/,
  'Closing the Assistant must return to the route the user came from.');
assert.match(pageRuntime, /router\.go = function/,
  'Direct route navigation must open the existing Assistant and route changes must close it safely.');
assert.match(pageRuntime, /originalClose\.apply\(bot, \[\]\)/,
  'Navigating away from the Assistant must close the existing panel without redirecting.');
assert.match(pageRuntime, /mobile-current-view/,
  'The mobile current-view label must identify the Assistant page.');
assert.match(pageStyles, /#view-ai-assistant #kernel-brain-bot-panel/,
  'The panel must fill the routed page instead of retaining its floating-drawer geometry.');
assert.match(pageStyles, /width: 100% !important/);
assert.match(pageStyles, /height: 100% !important/);
assert.match(pageStyles, /prefers-reduced-motion/);
assert.match(pageStyles, /safe-area-inset-bottom/);
assert.match(pageStyles, /focus-visible/);
assert.match(pageRuntime, /ovyx-ai-assistant-page-active/,
  'The routed Assistant must participate in shell and viewport layout state.');
assert.match(pageRuntime, /__ovyxNativeOpen/,
  'The page wrapper must wait for the established native Assistant lifecycle before wrapping it.');
assert.match(packageJson.scripts.test, /ovyx-ai-assistant-page\.test\.mjs/,
  'The new Assistant page contract must run in the main test suite.');

console.log('OVYX dedicated AI Assistant page contract tests passed.');
