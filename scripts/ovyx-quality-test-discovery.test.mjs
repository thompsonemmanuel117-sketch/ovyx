import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = path.join(root, 'scripts');
const workflowsRoot = path.join(root, '.github', 'workflows');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

const testFiles = (await walk(scriptsRoot))
  .filter(file => /\.test\.mjs$/i.test(file))
  .sort();
const workflowFiles = (await walk(workflowsRoot))
  .filter(file => /\.ya?ml$/i.test(file));
const packageCommands = Object.values(packageJson.scripts || {}).join('\n');
const workflowCommands = (await Promise.all(workflowFiles.map(file => readFile(file, 'utf8'))))
  // A path-filter entry only schedules a workflow; it does not execute a test.
  // Remove exact test-file path entries before checking for executable references.
  .map(source => source.replace(/^\s*-\s*['"]scripts\/[^'"]+\.test\.mjs['"]\s*$/gm, ''))
  .join('\n');

const unregistered = testFiles.filter(file => {
  const filename = path.basename(file);
  return !packageCommands.includes(filename) && !workflowCommands.includes(filename);
});

console.log(`OVYX automated test discovery: ${testFiles.length} test files, ${workflowFiles.length} workflows.`);
if (unregistered.length) {
  console.error('These test files are not referenced by npm scripts or executable workflow steps:');
  for (const file of unregistered) console.error(` - ${path.relative(root, file)}`);
}
assert.equal(unregistered.length, 0,
  'Every *.test.mjs file must be executed by an npm script or a GitHub Actions workflow. Path filters alone do not count.');
console.log('OVYX quality discovery passed: no test file is silently left out of automated execution.');
