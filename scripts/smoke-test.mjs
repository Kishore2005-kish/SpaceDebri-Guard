#!/usr/bin/env node
// SENTINEL smoke test
// Usage: npm run smoke
// Verifies the application starts and basic endpoints respond

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchUrl(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

console.log('\n\x1b[1mSENTINEL SMOKE TEST\x1b[0m\n');

// Start server if not running
let serverProcess = null;
let started = false;

const existingCheck = await fetchUrl('http://localhost:3000/api/status', 2000);
if (existingCheck.status === 0) {
  console.log('  Starting dev server...');
  serverProcess = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: __dirname, stdio: 'pipe', detached: true,
  });
  // Wait for server
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const check = await fetchUrl('http://localhost:3000/', 2000);
    if (check.ok) { started = true; break; }
  }
  if (!started) {
    console.log('  \x1b[31m✗\x1b[0m Server failed to start');
    process.exit(1);
  }
} else {
  started = true;
}

const tests = [];
function test(name, passed, detail = '') {
  const icon = passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon} ${name}${detail ? ': ' + detail : ''}`);
  tests.push({ name, passed });
}

// Test endpoints
const home = await fetchUrl('http://localhost:3000/', 5000);
test('Home page', home.ok, `HTTP ${home.status}`);

const status = await fetchUrl('http://localhost:3000/api/status', 5000);
test('Status API', status.ok && status.json?.status, `status=${status.json?.status ?? 'failed'}`);

const dashboard = await fetchUrl('http://localhost:3000/api/dashboard', 10000);
test('Dashboard API', dashboard.ok, `${dashboard.json?.totalObjects ?? 0} objects`);

const conjunctions = await fetchUrl('http://localhost:3000/api/conjunctions', 5000);
test('Conjunctions API', conjunctions.ok, `${conjunctions.json?.conjunctions?.length ?? 0} events`);

const stkStatus = await fetchUrl('http://localhost:3000/api/simulation/stk/status', 5000);
test('STK status API', stkStatus.ok, `available=${stkStatus.json?.available}`);

const history = await fetchUrl('http://localhost:3000/api/analysis/history', 5000);
test('History API', history.ok, `${history.json?.runs?.length ?? 0} runs`);

const presets = await fetchUrl('http://localhost:3000/api/analysis', 5000);
test('Analysis presets API', presets.ok, `${presets.json?.presets?.length ?? 0} presets`);

// Summary
const passed = tests.filter(t => t.passed).length;
const failed = tests.length - passed;
console.log(`\n  \x1b[1m${passed}/${tests.length} passed\x1b[0m${failed ? `, \x1b[31m${failed} failed\x1b[0m` : ''}\n`);

// Cleanup
if (serverProcess) {
  try { process.kill(-serverProcess.pid); } catch {}
}

process.exit(failed > 0 ? 1 : 0);
