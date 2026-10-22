#!/usr/bin/env node
// SENTINEL one-command startup script
// Usage: npm run sentinel
// This script:
//   1. checks Node version
//   2. checks npm
//   3. verifies dependencies
//   4. verifies .env
//   5. verifies database
//   6. runs schema setup if needed
//   7. starts Next.js dev server
//   8. prints the URL

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __dirname = join(fileURLToPath(new URL('.', import.meta.url)), '..');
loadEnv({ path: join(__dirname, '.env') });
loadEnv({ path: join(__dirname, '.env.local'), override: true });
const steps = [];

function logStep(name, status, detail = '') {
  const icon = status === 'ok' ? '\x1b[32m✓\x1b[0m' : status === 'fail' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m⚠\x1b[0m';
  console.log(`${icon} ${name}${detail ? ': ' + detail : ''}`);
  steps.push({ name, status, detail });
}

console.log('\n\x1b[1mSENTINEL LOCAL STARTUP\x1b[0m\n');

// 1. Check Node version
const nodeVersion = process.versions.node;
const major = parseInt(nodeVersion.split('.')[0], 10);
if (major >= 20) {
  logStep('Node detected', 'ok', `v${nodeVersion}`);
} else {
  logStep('Node version', 'fail', `v${nodeVersion} (requires >=20)`);
  process.exit(1);
}

// 2. Check npm
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
  logStep('npm detected', 'ok', `v${npmVersion}`);
} catch {
  logStep('npm', 'fail', 'npm not found');
  process.exit(1);
}

// 3. Verify dependencies
if (!existsSync(join(__dirname, 'node_modules', 'next'))) {
  console.log('\n  Installing dependencies...');
  try {
    execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
    logStep('Dependencies installed', 'ok');
  } catch {
    logStep('Dependencies', 'fail', 'npm install failed');
    process.exit(1);
  }
} else {
  logStep('Dependencies verified', 'ok');
}

// 4. Verify database configuration. Startup must never create a local database
// or mutate a remote schema. Apply schema changes through a reviewed migration.
const databaseUrl = process.env.DATABASE_URL ?? '';
if (!databaseUrl) {
  logStep('Database configuration', 'fail', 'DATABASE_URL is required');
  process.exit(1);
}
if (databaseUrl.startsWith('file:')) {
  logStep('Database configuration', 'fail', 'Local SQLite is not allowed for runtime startup');
  process.exit(1);
}
logStep('Database configuration', 'ok', 'PostgreSQL connection configured');

// 6b. Start space weather FastAPI backend
console.log('\n\x1b[1mStarting Space Weather Backend...\x1b[0m\n');
const backendPath = join(__dirname, 'Backend');
const uvicornPath = existsSync(join(backendPath, '.venv', 'bin', 'uvicorn'))
  ? join(backendPath, '.venv', 'bin', 'uvicorn')
  : existsSync(join(backendPath, 'venv', 'bin', 'uvicorn'))
    ? join(backendPath, 'venv', 'bin', 'uvicorn')
    : 'uvicorn';

const backendProcess = spawn(uvicornPath, ['api:app', '--host', '127.0.0.1', '--port', '8000'], {
  cwd: backendPath,
  stdio: 'inherit',
  env: { ...process.env },
});

backendProcess.on('error', (err) => {
  console.error('Failed to start space weather backend:', err.message);
});

// 7. Start Next.js
console.log('\n\x1b[1mStarting SENTINEL...\x1b[0m\n');

const devServer = spawn('npx', ['next', 'dev', '-p', '3000'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env },
});

devServer.on('error', (err) => {
  console.error('Failed to start next dev server:', err.message);
  backendProcess.kill('SIGTERM');
  process.exit(1);
});

// Print URL after a delay
setTimeout(() => {
  console.log('\n\x1b[32m┌─────────────────────────────────────────────┐\x1b[0m');
  console.log('\x1b[32m│  SENTINEL is running at:                    │\x1b[0m');
  console.log('\x1b[32m│  http://localhost:3000                       │\x1b[0m');
  console.log('\x1b[32m│                                              │\x1b[0m');
  console.log('\x1b[32m│  Space Weather API is running at:            │\x1b[0m');
  console.log('\x1b[32m│  http://localhost:8000                       │\x1b[0m');
  console.log('\x1b[32m│                                              │\x1b[0m');
  console.log('\x1b[32m│  Press Ctrl+C to stop.                      │\x1b[0m');
  console.log('\x1b[32m└─────────────────────────────────────────────┘\x1b[0m\n');
}, 5000);

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n\x1b[33mStopping SENTINEL...\x1b[0m');
  devServer.kill('SIGTERM');
  backendProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  devServer.kill('SIGTERM');
  backendProcess.kill('SIGTERM');
  process.exit(0);
});
