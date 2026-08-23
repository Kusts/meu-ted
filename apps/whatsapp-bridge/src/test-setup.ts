// Polyfill for undici in environments where node:worker_threads lacks markAsUncloneable
import * as workerThreads from 'node:worker_threads';

if (workerThreads && typeof (workerThreads as any).markAsUncloneable !== 'function') {
  (workerThreads as any).markAsUncloneable = () => {};
}
