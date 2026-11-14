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

// Only count explicit script paths in executable command text. Workflow path
// filters, comments, job names, and documentation are not proof of execution.
function stripShellComments(source) {
  return source.split('\n')
    .filter(line => !/^\s*#/.test(line))
    .map(line => line.replace(/\s+#.*$/, ''))
    .join('\n');
}

function extractWorkflowRunCommands(source) {
  const lines = source.split('\n');
  const commands = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*(.*)$/);
    if (!match) continue;
    const parentIndent = match[1].length;
    if (match[2].trim() && !/^[|>][+-]?$/.test(match[2].trim())) commands.push(match[2]);
    else {
      for (index += 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim() && !/^\s*#/.test(line) && line.match(/^\s*/)[0].length <= parentIndent) {
          index -= 1;
          break;
        }
        commands.push(line);
      }
    }
  }
  return stripShellComments(commands.join('\n'));
}

function extractTestPaths(source) {
  const paths = new Set();
  const executable = stripShellComments(source);
  const pattern = /scripts\/[A-Za-z0-9_./-]+\.test\.mjs/g;
  for (const match of executable.matchAll(pattern)) {
    paths.add(match[0].replace(/^\.\//, ''));
  }

  // Shared browser workflows pass explicit test filenames to run_shard(),
  // which executes each one as node "scripts/$script". Read only the
  // contiguous filename arguments after that executable helper call.
  const lines = executable.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*run_shard\s/.test(lines[index])) continue;
    for (let next = index + 1; next < lines.length; next += 1) {
      const argument = lines[next].trim();
      const match = argument.match(/^([A-Za-z0-9_.-]+\.test\.mjs)(?:\s*\\)?\s*&?$/);
      if (!match) break;
      paths.add('scripts/' + match[1]);
    }
  }
  return paths;
}

const testFiles = (await walk(scriptsRoot))
  .filter(file => /\.test\.mjs$/i.test(file))
  .map(file => path.relative(root, file).split(path.sep).join('/'))
  .sort();
const workflowFiles = (await walk(workflowsRoot))
  .filter(file => /\.ya?ml$/i.test(file));
const packageCommands = Object.values(packageJson.scripts || {}).join('\n');
const workflowCommands = (await Promise.all(workflowFiles.map(async file =>
  extractWorkflowRunCommands(await readFile(file, 'utf8'))
))).join('\n');
const executedPaths = extractTestPaths(packageCommands + '\n' + workflowCommands);
const unregistered = testFiles.filter(file => !executedPaths.has(file));

// Guard the audit itself against the two false-positive patterns that caused
// the previous implementation to overstate coverage.
const fixtureWorkflow = [
  'on:',
  '  pull_request:',
  '    paths:',
  '      - scripts/path-filter-only.test.mjs',
  'jobs:',
  '  test:',
  '    steps:',
  '      - name: Run test',
  '        run: node scripts/actually-run.test.mjs # scripts/inline-comment.test.mjs',
  '      - name: Comment only',
  '        run: |',
  '          # node scripts/comment-only.test.mjs',
  '      - name: Browser shard',
  '        run: |',
  '          run_shard "browser" /tmp/browser.log \\',
  '            actually-run.browser.test.mjs \\',
  '            second-run.browser.test.mjs &'
].join('\n');
assert.deepEqual(
  [...extractTestPaths(extractWorkflowRunCommands(fixtureWorkflow))],
  ['scripts/actually-run.test.mjs', 'scripts/actually-run.browser.test.mjs', 'scripts/second-run.browser.test.mjs'],
  'Only executable workflow run commands count; comments and path filters must not count.',
);

console.log(`OVYX automated test discovery: ${testFiles.length} test files, ${workflowFiles.length} workflows, ${executedPaths.size} explicit executable test references.`);
if (unregistered.length) {
  console.error('These test files have no explicit npm-script or workflow run-command reference:');
  for (const file of unregistered) console.error(` - ${file}`);
}
assert.equal(unregistered.length, 0,
  'Every *.test.mjs file must have an explicit executable reference in an npm script or workflow run command.');
console.log('OVYX quality discovery passed: no test file is silently left out of the discovered execution wiring.');
