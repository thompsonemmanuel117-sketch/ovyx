import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const project = process.cwd();
const output = await mkdtemp(path.join(os.tmpdir(), 'ovyx-full-pages-build-'));
const bundlePath = path.join(output, '_worker.bundle');
const routesPath = path.join(output, '_routes.json');
const assetsPath = path.join(output, 'assets');
const healthRouteOverlay = path.join(output, 'health-route-overlay');
await mkdir(assetsPath, { recursive: true });
await mkdir(path.join(healthRouteOverlay, 'api', '__ovyx'), { recursive: true });
const provisionSource = await readFile(path.join(project, 'functions/api/backend/provision.js'), 'utf8');
const healthRouteMatch = provisionSource.match(/const PAGES_D1_HEALTHCHECK_SOURCE = `([\\s\\S]*?)`;\\nconst SECRET_CONTENT_PATTERNS/);
if (!healthRouteMatch) throw new Error('The internal Pages D1 persistence route source is missing.');
await writeFile(path.join(healthRouteOverlay, 'api', '__ovyx', 'healthcheck.js'), healthRouteMatch[1], 'utf8');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error('Full OVYX Pages Functions build failed (' + code + '): ' + (stderr || stdout).slice(-7000))));
  });
}

try {
  await run('docker', [
    'run', '--rm', '--network', 'none', '--read-only',
    '--user', String(process.getuid()) + ':' + String(process.getgid()),
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=1g,mode=1777',
    '--volume', project + ':/workspace/project:rw',
    '--volume', output + ':/workspace/output:rw',
    '--volume', healthRouteOverlay + ':/workspace/project/functions/api/__ovyx:ro',
    '--workdir', '/workspace/project',
    '--env', 'HOME=/tmp',
    '--env', 'XDG_CONFIG_HOME=/tmp/config',
    '--env', 'CI=true',
    '--env', 'WRANGLER_SEND_METRICS=false',
    '--entrypoint', '/opt/ovyx-runtime/node_modules/.bin/wrangler',
    'ovyx-backend-runtime-worker',
    'pages', 'functions', 'build', './functions',
    '--project-directory', '/workspace/project',
    '--build-output-directory', '/workspace/output/assets',
    '--outfile', '/workspace/output/_worker.bundle',
    '--output-routes-path', '/workspace/output/_routes.json',
    '--compatibility-date', '2026-11-01',
    '--compatibility-flag', 'nodejs_compat',
  ]);
  const bundleInfo = await stat(bundlePath);
  const bundle = await readFile(bundlePath, 'utf8');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  assert.ok(bundleInfo.size > 0 && bundleInfo.size < 25_000_000, 'The full OVYX Pages Functions Worker bundle must be bounded.');
  assert.ok(bundle.includes('/api/') || bundle.includes('onRequest'), 'The full Worker bundle must contain OVYX API handlers.');
  assert.ok(bundle.includes('_ovyx_health_probes'), 'The full Worker bundle must contain the internal D1 persistence proof route.');
  assert.ok(Array.isArray(routes.include) && Array.isArray(routes.exclude), 'The full Worker routes manifest must be valid.');
  console.log('OVYX complete Pages Functions source compiled successfully in a no-egress container.');
} finally {
  await rm(output, { recursive: true, force: true });
}
