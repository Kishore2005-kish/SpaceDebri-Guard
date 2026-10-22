#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const base = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:3001';
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tests = [];
function record(name, workflow, expected, actual, status, error = null) { tests.push({ name, workflow, expected, actual, status, ...(error ? { error } : {}) }); }
function browserDom(url) {
  return execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--user-data-dir=/tmp/space-debri-chrome-smoke', '--dump-dom', url], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
}
if (!existsSync(chrome)) {
  record('browser-available', 'environment', 'Chrome is installed', 'Chrome executable not found', 'BLOCKED');
} else {
  for (const item of [
    ['dashboard', '/', 'Dashboard loads'],
    ['catalog', '/satellites', 'Satellite catalog loads'],
  ]) {
    try { const dom = browserDom(base + item[1]); record(item[0], item[0], item[2], `HTML returned (${dom.length} bytes)`, dom.length > 500 ? 'PASS' : 'FAIL'); }
    catch (error) { record(item[0], item[0], item[2], 'Browser navigation failed', 'FAIL', String(error)); }
  }
  for (const [name, path, expected] of [['status-api','/api/status','Status API returns JSON'],['satellites-api','/api/satellites','Satellite API returns JSON'],['conjunctions-api','/api/conjunctions','Conjunction API returns JSON']]) {
    try { const dom = browserDom(base + path); record(name, 'API-backed workflow', expected, dom.includes('{') ? 'JSON response returned' : 'Non-JSON response', dom.includes('{') ? 'PASS' : 'FAIL'); }
    catch (error) { record(name, 'API-backed workflow', expected, 'Request failed', 'FAIL', String(error)); }
  }
}
console.log(JSON.stringify({ base, generated_at: new Date().toISOString(), tests }, null, 2));
process.exit(tests.some(t => t.status === 'FAIL') ? 1 : 0);
