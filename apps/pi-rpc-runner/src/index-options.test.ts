import { describe, expect, test, vi, beforeEach } from 'vitest';
import { PiRpcRunner } from './index.js';
import { startPiRpcProcess } from './process-runner.js';

vi.mock('./process-runner.js', () => ({
  startPiRpcProcess: vi.fn(() => ({
    process: {
      on: vi.fn(),
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn(), removeAllListeners: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn(),
      exitCode: null,
    },
    pid: 123,
    stopped: false,
  })),
  stopProcess: vi.fn(),
}));

describe('PiRpcRunner options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('start uses configured pi command and args', () => {
    const runner = new PiRpcRunner({
      piCommand: 'C:/tools/pi.cmd',
      piArgs: ['--mode', 'rpc'],
      cwd: 'D:/repo',
    });

    runner.start();

    expect(startPiRpcProcess).toHaveBeenCalledWith({
      command: 'C:/tools/pi.cmd',
      args: ['--mode', 'rpc'],
      cwd: 'D:/repo',
    });
  });
});
