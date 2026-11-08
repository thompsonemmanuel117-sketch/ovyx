import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'ovyx-pages-functions-build-'));
const project = path.join(root, 'project');
await mkdir(path.join(project, 'functions', 'api'), { recursive: true });
await mkdir(path.join(project, 'public'), { recursive: true });
await writeFile(path.join(project, 'wrangler.jsonc'), JSON.stringify({
  name: 'ovyx-preview-build-fixture',
  compatibility_date: '2026-11-01',
  compatibility_flags: ['nodejs_compat'],
  pages_build_output_dir: './public',
}, null, 2));
await writeFile(path.join(project, 'public', 'index.html'), '<!doctype html><html><body>OVYX Preview build fixture</body></html>');
await writeFile(path.join(project, 'functions', 'api', 'health.js'), `export async function onRequestGet() {
  return Response.json({ ok: true, service: 'ovyx-fixture' });
}`);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Isolated Wrangler Pages Functions build exceeded 180 seconds. Review the streamed Wrangler output above.'));
    }, 180_000);
    child.stdout.on('data', chunk => { const value = chunk.toString(); stdout += value; process.stdout.write(value); });
    child.stderr.on('data', chunk => { const value = chunk.toString(); stderr += value; process.stderr.write(value); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error('Pages Functions build failed (' + code + '): ' + (stderr || stdout).slice(-5000)));
    });
  });
}

try {
  await run('docker', [
    'run', '--rm', '--network', 'none', '--read-only',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=1g,mode=1777',
    '--volume', project + ':/workspace/project:rw',
    '--workdir', '/workspace/project',
    '--env', 'HOME=/tmp/home',
    '--env', 'XDG_CONFIG_HOME=/tmp/config',
    '--env', 'CI=true',
    '--env', 'WRANGLER_SEND_METRICS=false',
    '--env', 'NO_UPDATE_NOTIFIER=1',
    'ovyx-backend-runtime-worker',
    '/opt/ovyx-runtime/node_modules/.bin/wrangler',
    'pages', 'functions', 'build', './functions',
    '--project-directory', '/workspace/project',
    '--build-output-directory', '/workspace/project/public',
    '--outfile', '/workspace/project/public/_worker.bundle',
    '--output-routes-path', '/workspace/project/public/_routes.json',
    '--compatibility-date', '2026-11-01',
    '--compatibility-flag', 'nodejs_compat',
  ]);
  const bundlePath = path.join(project, 'public', '_worker.bundle');
  const routesPath = path.join(project, 'public', '_routes.json');
  const bundleInfo = await stat(bundlePath);
  const bundle = await readFile(bundlePath, 'utf8');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  assert.ok(bundleInfo.size > 0 && bundleInfo.size < 20_000_000, 'The isolated build must produce a bounded Worker bundle.');
  assert.ok(bundle.includes('ovyx-fixture') || bundle.includes('/api/health'), 'The compiled Worker bundle must include the generated API handler.');
  assert.ok(Array.isArray(routes.include) && Array.isArray(routes.exclude), 'Wrangler must emit a valid Pages routes manifest.');
  console.log('OVYX Pages Functions isolated no-egress build test passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
