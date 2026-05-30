// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - Process Lifecycle Manager
// Spawns and manages `pi --mode rpc` child process
// ─────────────────────────────────────────────────────────────────────────────

import { spawn, type ChildProcess } from 'child_process';

export interface ProcessRunnerOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ManagedProcess {
  process: ChildProcess;
  pid: number;
  stopped: boolean;
}

/**
 * Start Pi RPC process
 * 
 * In tests, this uses a mock via spawn mock.
 * In production, it spawns a real child process.
 */
export function startPiRpcProcess(options: ProcessRunnerOptions = {}): ManagedProcess {
  const command = options.command || 'pi';
  const args = options.args || ['--mode', 'rpc'];
  
  const proc = spawn(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  });

  return {
    process: proc,
    pid: proc.pid ?? 0,
    stopped: false,
  };
}

/**
 * Stop process gracefully
 * 
 * Writes EOF to stdin and sends SIGTERM for clean shutdown.
 */
export function stopProcess(managed: ManagedProcess): void {
  if (managed.stopped) return;

  try {
    // Signal EOF on stdin for clean shutdown
    managed.process.stdin?.end();
    
    // Send termination signal
    managed.process.kill('SIGTERM');
  } catch {
    // Process may already be dead, force kill
    try {
      managed.process.kill('SIGKILL');
    } catch {
      // Ignore if already dead
    }
  }

  managed.stopped = true;
}

/**
 * Wait for process to exit
 */
export function waitForExit(
  managed: ManagedProcess,
  timeoutMs = 5000
): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Process did not exit within timeout'));
    }, timeoutMs);

    managed.process.on('exit', (code) => {
      clearTimeout(timeout);
      resolve(code ?? 0);
    });

    managed.process.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Check if process is still running
 */
export function isProcessRunning(managed: ManagedProcess): boolean {
  return !managed.stopped && managed.process.exitCode === null;
}