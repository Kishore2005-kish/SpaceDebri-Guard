#!/usr/bin/env node
// SENTINEL QA runner
// Usage: npm run qa
// Runs: lint, typecheck, unit tests, build

import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const results = {};
function run(name, cmd) {
  console.log(`\n--- ${name} ---`);
  try {
    execSync(cmd, { cwd: __dirname, stdio: 'inherit', timeout: 120000 });
    results[name] = 'PASS';
  } catch (e) {
    results[name] = e.timedOut ? 'TIMEOUT' : 'FAIL';
    console.error(`  ${name} FAILED`);
  }
}

console.log('\n\x1b[1mSENTINEL QA\x1b[0m\n');

run('Lint', 'npx eslint src/');
run('Typecheck', 'npx tsc --noEmit');
run('Unit tests', 'node scripts/run-tests.mjs');
run('Build', 'npx next build');

console.log('\n\x1b[1mSENTINEL QA RESULTS\x1b[0m');
for (const [name, status] of Object.entries(results)) {
  const icon = status === 'PASS' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon} ${name}: ${status}`);
}

const allPass = Object.values(results).every(s => s === 'PASS');
console.log(`\n  RESULT: ${allPass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}\n');
process.exit(allPass ? 0 : 1);
