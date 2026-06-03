// ─────────────────────────────────────────────────────────────────────────────
// PiBridge timeout regression tests
// Bug: sendImmediate was not used on the actual write path, so timeout fired
// before queued requests had a chance to run. This suite pins the fix:
//   - PendingRequest.timeout is OPTIONAL
//   - timeout is created ONLY inside sendImmediate (real write path)
//   - queued requests do NOT arm a timer until they're sent
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));
vi.mock('child_process', () => ({ spawn: mockSpawn }));

import { PiBridge } from './pi-bridge.js';

interface FakeProc {
  stdin: { write: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
}

function makeFakeProc(): FakeProc {
  const proc: any = new EventEmitter();
  proc.stdin = { write: vi.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.exitCode = null;
  return proc as FakeProc;
}

describe('PiBridge timeout — does not fire on enqueued requests', () => {
  let bridge: PiBridge;
  let proc: FakeProc;

  beforeEach(async () => {
    mockSpawn.mockReset();
    proc = makeFakeProc();
    mockSpawn.mockReturnValue(proc as any);
    bridge = new PiBridge({ householdId: 'h1', timeoutMs: 50 });
    await bridge.start();
  });

  it('first send is sent immediately and arms a timer (timeout fires when no response)', async () => {
    const sendPromise = bridge.send('msg1', 'chat-1');
    // stdin write happened
    expect(proc.stdin.write).toHaveBeenCalledTimes(1);
    const writeArg = (proc.stdin.write.mock.calls[0]![0] as string);
    expect(writeArg).toContain('"id":');
    expect(writeArg).toContain('"type":"prompt"');
    // pending has a timeout now
    const pending = (bridge as any).activeRequests.get(
      JSON.parse(writeArg).id
    );
    expect(pending).toBeDefined();
    expect(pending.timeout).toBeDefined();
    // no response → timeout rejects
    await expect(sendPromise).rejects.toThrow(/timed out after 50ms/);
  });

  it('second enqueued request has NO timeout until it is actually written', async () => {
    const p1 = bridge.send('msg1', 'chat-1');
    const p2 = bridge.send('msg2', 'chat-1'); // queued
    // Only p1 was written
    expect(proc.stdin.write).toHaveBeenCalledTimes(1);

    // p2's PendingRequest in chatQueues has NO timeout armed
    const queued = (bridge as any).chatQueues.get('chat-1')![1];
    expect(queued).toBeDefined();
    expect(queued.timeout).toBeUndefined();

    // p1 times out → p2 should now be dequeued and a NEW timer armed
    await expect(p1).rejects.toThrow(/timed out/);
    expect(proc.stdin.write).toHaveBeenCalledTimes(2);
    const writeArg2 = (proc.stdin.write.mock.calls[1]![0] as string);
    const id2 = JSON.parse(writeArg2).id;
    const pending2 = (bridge as any).activeRequests.get(id2);
    expect(pending2.timeout).toBeDefined();
    // let p2 settle by rejecting via timeout too
    await expect(p2).rejects.toThrow(/timed out/);
  });

  it('successful response clears the timer before it can fire', async () => {
    const p1 = bridge.send('msg1', 'chat-1');
    const id1 = JSON.parse((proc.stdin.write.mock.calls[0]![0] as string)).id;

    // Response after 5ms — well under the 50ms timeout
    await new Promise((r) => setTimeout(r, 5));
    proc.stdout.emit(
      'data',
      JSON.stringify({ type: 'response', id: id1, success: true }) + '\n',
    );
    proc.stdout.emit(
      'data',
      JSON.stringify({
        type: 'turn_end',
        id: id1,
        message: { content: [{ text: 'done' }] },
      }) + '\n',
    );

    await expect(p1).resolves.toBe('done');
    // activeRequests cleared
    expect((bridge as any).activeRequests.has(id1)).toBe(false);
  });

  it('default timeout is 120000ms when not configured', () => {
    const b = new PiBridge({ householdId: 'h' });
    expect((b as any).options.timeoutMs).toBe(120000);
  });
});
