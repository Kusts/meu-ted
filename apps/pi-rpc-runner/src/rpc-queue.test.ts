// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - Queue tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi } from 'vitest';
import { RpcQueue } from './rpc-queue.js';

describe('Pi RPC Runner - Queue', () => {
  test('enqueue adds job to queue', () => {
    const queue = new RpcQueue();
    
    const job = queue.enqueue('test', { data: 'test' });
    
    expect(job).toHaveProperty('id');
    expect(job.type).toBe('test');
    expect(queue.depth()).toBe(1);
  });

  test('peek returns next job without removing', () => {
    const queue = new RpcQueue();
    
    queue.enqueue('A', { data: 1 });
    queue.enqueue('B', { data: 2 });
    
    const peeked = queue.peek();
    
    expect(peeked?.type).toBe('A');
    expect(queue.depth()).toBe(2); // Still has both jobs
  });

  test('drain returns all pending jobs and clears queue', () => {
    const queue = new RpcQueue();
    
    queue.enqueue('A', { data: 1 });
    queue.enqueue('B', { data: 2 });
    queue.enqueue('C', { data: 3 });
    
    const drained = queue.drain();
    
    expect(drained).toHaveLength(3);
    expect(queue.depth()).toBe(0);
  });

  test('cancel removes specific job by id', () => {
    const queue = new RpcQueue();
    
    const job = queue.enqueue('remove-me', { data: 'test' });
    queue.enqueue('keep-me', { data: 'test' });
    
    const cancelled = queue.cancel(job.id);
    
    expect(cancelled).toBe(true);
    expect(queue.depth()).toBe(1);
  });

  test('cancel returns false for non-existent job', () => {
    const queue = new RpcQueue();
    
    queue.enqueue('test', { data: 'test' });
    
    const cancelled = queue.cancel('non-existent-id');
    
    expect(cancelled).toBe(false);
  });

  test('empty queue returns null on processNext', async () => {
    const queue = new RpcQueue();
    
    const handler = vi.fn();
    const result = await queue.processNext(handler);
    
    expect(result).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  test('job completes successfully', async () => {
    const queue = new RpcQueue({ timeoutMs: 5000 });
    
    queue.enqueue('success', { value: 42 });
    
    const handler = vi.fn().mockResolvedValue({ success: true });
    
    const result = await queue.processNext(handler);
    
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('job');
  });

  test('non-timeout errors are not retryable', async () => {
    const queue = new RpcQueue({ timeoutMs: 5000 });

    queue.enqueue('fail', { data: {} });
    
    const handler = vi.fn().mockRejectedValue(new Error('Invalid input'));
    
    const result = await queue.processNext(handler);
    
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error', 'Invalid input');
    expect(result).toHaveProperty('retryable', false);
  });

  test('isProcessing reflects queue state', () => {
    const queue = new RpcQueue();
    
    expect(queue.isProcessing()).toBe(false);
    
    queue.enqueue('test', { data: 'test' });
    
    // isProcessing only changes during processNext
    expect(queue.isProcessing()).toBe(false);
  });

  test('getCurrentJob returns null when idle', () => {
    const queue = new RpcQueue();
    
    expect(queue.getCurrentJob()).toBeNull();
  });
});