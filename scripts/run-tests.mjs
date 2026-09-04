#!/usr/bin/env node
// SENTINEL test runner
// Usage: npm test
// Runs all test scripts and reports results

import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const tests = [
  { name: 'CelesTrak parser', cmd: 'npx tsx scripts/test-parser.ts' },
  { name: 'SGP4 + conjunction + risk engine', cmd: 'npx tsx scripts/test-engine.ts' },
  { name: 'STK integration (mocked)', cmd: 'npx tsx scripts/test-stk.ts' },
];

console.log('\n\x1b[1mSENTINEL UNIT TESTS\x1b[0m\n');

let allPass = true;
for (const { name, cmd } of tests) {
  process.stdout.write(`  ${name}... `);
  try {
    const output = execSync(cmd, { cwd: __dirname, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    const passed = (output.match(/✓/g) || []).length;
    console.log(`\x1b[32m✓ ${passed} assertions passed\x1b[0m`);
  } catch (e) {
    console.log(`\x1b[31m✗ FAILED\x1b[0m`);
    if (e.stdout) console.log(e.stdout.slice(0, 500));
    allPass = false;
  }
}

console.log(`\n  RESULT: ${allPass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}\n`);
process.exit(allPass ? 0 : 1);
