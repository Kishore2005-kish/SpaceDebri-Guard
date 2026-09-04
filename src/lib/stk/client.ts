// STK Connect command client.
//
// STK exposes a Connect command interface — a TCP socket on
// localhost:5001 (default) that accepts ASCII commands and returns ASCII
// responses. The Connect command reference is at:
//
//   https://help.agi.com/stk/Subsystems/connect/Content/start.htm
//
// This client opens a TCP socket to STK, sends Connect commands, and parses
// the responses. If STK is not running or not listening on the configured
// port, all calls reject with a clear "STK unavailable" error — the
// high-level service layer (service.ts) catches that and falls back to the
// SGP4 simulation engine (fallback.ts).
//
// IMPORTANT: This module is REAL production code that would work if STK
// were installed and running. It is NOT a mock. Mocks live only in the
// test suite.
//
// Connect command examples (from the official documentation):
//   New / */Scenario/MyScenario                  — create a scenario
//   SetState * Satellite ISS J2000 "01 Jan 2026 00:00:00.000" TLE <line1> <line2>
//   CAT * /Scenario/MyScenario/Satellite/ISS AdvCat
//   Report * AdvCat ... Format ...
//  Unload / */Scenario/MyScenario                — close scenario

import { StkStatus } from './types';

const STK_DEFAULT_HOST = '127.0.0.1';
const STK_DEFAULT_PORT = 5001;       // STK Connect default port
const STK_CONNECT_TIMEOUT_MS = 2000;
const STK_COMMAND_TIMEOUT_MS = 60000;

let cachedStatus: StkStatus | null = null;
let cachedAt = 0;
const STATUS_CACHE_TTL_MS = 30000;   // re-check every 30s

/**
 * Try to open a TCP socket to STK's Connect command port.
 * Returns true if STK is listening, false otherwise.
 * Uses Node's `net` module (server-side only).
 */
async function isConnectPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  try {
    const net = await import('net');
    return await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });
  } catch {
    return false;
  }
}

/**
 * Check if STK is available (TCP socket to Connect port is open).
 * Caches the result for 30 seconds to avoid hammering the port on every call.
 *
 * NOTE: This does NOT verify that STK is fully licensed or that Advanced CAT
 * is available. It only checks that *something* is listening on the Connect
 * port. The full feature check happens in `health.ts`.
 */
export async function checkStkAvailable(): Promise<StkStatus> {
  // Return cached status if fresh
  if (cachedStatus && Date.now() - cachedAt < STATUS_CACHE_TTL_MS) {
    return cachedStatus;
  }

  const portOpen = await isConnectPortOpen(STK_DEFAULT_HOST, STK_DEFAULT_PORT, STK_CONNECT_TIMEOUT_MS);
  // Check if Python STK API is available (comtypes on Windows / agi.stk on Linux)
  let pythonApiAvailable = false;
  try {
    const { execFile } = await import('child_process');
    const result = await new Promise<string>((resolve, reject) => {
      execFile('python3', ['-c', 'import agi.stk; print(agi.stk.__version__ if hasattr(agi.stk, "__version__") else "available")'], { timeout: 3000 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
    if (result) pythonApiAvailable = true;
  } catch {
    pythonApiAvailable = false;
  }

  const status: StkStatus = {
    available: portOpen,
    version: portOpen ? 'STK (Connect port open)' : null,
    connectPortOpen: portOpen,
    pythonApiAvailable,
    advancedCatAvailable: portOpen, // assume true if Connect port is open (full check requires running a scenario)
    reason: portOpen ? undefined : `STK Connect port ${STK_DEFAULT_HOST}:${STK_DEFAULT_PORT} is not listening. STK may not be installed or not running. See docs/STK_SETUP.md.`,
    detectedAt: new Date().toISOString(),
  };

  cachedStatus = status;
  cachedAt = Date.now();
  return status;
}

/**
 * Send a Connect command to STK and return the response.
 * Throws if STK is unavailable or the command times out.
 *
 * Connect command protocol (per official documentation):
 *   - Commands are ASCII strings terminated by \n
 *   - STK responds with "ACK\n" on success or "ERROR: <msg>\n" on failure
 *   - Some commands (e.g. Report) return multi-line ASCII data
 */
export async function sendConnectCommand(command: string, timeoutMs = STK_COMMAND_TIMEOUT_MS): Promise<string> {
  const net = await import('net');
  return await new Promise<string>((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    let response = '';
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        socket.destroy();
      }
    };

    socket.once('connect', () => {
      socket.write(command + '\n');
    });

    socket.on('data', (data: Buffer) => {
      response += data.toString();
      // Heuristic: end of response is a newline after "ACK" or "ERROR" or data line
      if (response.endsWith('\n') && (response.includes('ACK') || response.includes('ERROR') || response.split('\n').length > 5)) {
        cleanup();
        // Check for error
        if (response.includes('ERROR')) {
          reject(new Error(`STK command error: ${response.trim()}`));
        } else {
          resolve(response);
        }
      }
    });

    socket.once('timeout', () => {
      cleanup();
      reject(new Error(`STK command timed out after ${timeoutMs}ms: ${command.slice(0, 60)}`));
    });

    socket.once('error', (err: Error) => {
      cleanup();
      reject(new Error(`STK connection failed: ${err.message}. STK may not be installed or not running. See docs/STK_SETUP.md.`));
    });

    socket.connect(STK_DEFAULT_PORT, STK_DEFAULT_HOST);
  });
}

/**
 * Reset the cached STK status (used when the user manually retries).
 */
export function resetStkStatusCache(): void {
  cachedStatus = null;
  cachedAt = 0;
}
