import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = path.join(root, 'services', 'rendezvous');
const isWindows = process.platform === 'win32';
const command = isWindows ? 'npx.cmd' : 'npx';
const worker = spawn(command, ['--yes', 'wrangler@4.132.0', 'dev', '--port', '8787'], {
  cwd: service,
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: isWindows,
  windowsHide: true,
});
let logTail = '';
for (const stream of [worker.stdout, worker.stderr]) stream.on('data', chunk => { logTail = (logTail + chunk.toString()).slice(-12000); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForWorker() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`Wrangler exited before the test service was ready.\n${logTail}`);
    try {
      const response = await fetch('http://127.0.0.1:8787/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await sleep(350);
  }
  throw new Error(`Timed out waiting for the local NOVA service.\n${logTail}`);
}

function stopWorker() {
  if (worker.exitCode !== null) return;
  if (isWindows && worker.pid) spawnSync('taskkill', ['/PID', String(worker.pid), '/T', '/F'], { stdio: 'ignore' });
  else worker.kill('SIGTERM');
}

try {
  await waitForWorker();
  const tests = spawn(process.execPath, ['--test', 'test/account.test.mjs', 'test/relay.test.mjs'], {
    cwd: service,
    env: { ...process.env, NOVA_TEST_RELAY: 'http://127.0.0.1:8787' },
    stdio: 'inherit',
  });
  const code = await new Promise((resolve, reject) => { tests.on('error', reject); tests.on('exit', value => resolve(value ?? 1)); });
  if (code !== 0) process.exitCode = code;
} finally {
  stopWorker();
}
