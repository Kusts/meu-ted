// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - Queue
// Serialized job queue with timeout and retry logic
// ─────────────────────────────────────────────────────────────────────────────

export interface Job<T = unknown> {
  id: string;
  type: string;
  data: T;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface JobResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  retryable: boolean;
  job: Job<T>;
}

export interface QueueOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * RPC Queue - serialized job processor
 * 
 * Jobs are processed one at a time. Each job has a timeout.
 * Timeout errors are retryable, other errors are not.
 */
export class RpcQueue {
  private queue: Job[] = [];
  private processing = false;
  private currentJob: Job | null = null;
  private options: Required<QueueOptions>;

  constructor(options: QueueOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 30000,
      maxRetries: options.maxRetries ?? 3,
    };
  }

  /**
   * Add a job to the queue
   */
  enqueue<T>(type: string, data: T): Job<T> {
    const job: Job<T> = {
      id: crypto.randomUUID(),
      type,
      data,
      createdAt: new Date().toISOString(),
    };
    this.queue.push(job);
    return job;
  }

  /**
   * Get next job without removing it
   */
  peek(): Job | null {
    return this.queue[0] || null;
  }

  /**
   * Get queue depth
   */
  depth(): number {
    return this.queue.length;
  }

  /**
   * Process next job with timeout
   */
  async processNext<TResult>(
    handler: (job: Job) => Promise<TResult>
  ): Promise<JobResult<TResult> | null> {
    if (this.queue.length === 0) {
      return null;
    }

    // Prevent concurrent processing
    if (this.processing) {
      return null;
    }

    this.processing = true;
    const job = this.queue.shift()!;
    this.currentJob = job;

    try {
      const result = await this.executeWithTimeout(handler, job);
      
      this.processing = false;
      this.currentJob = null;
      
      return {
        success: true,
        result,
        retryable: false,
        job: job as Job<TResult>,
      };
    } catch (err) {
      this.processing = false;
      this.currentJob = null;

      const error = err instanceof Error ? err.message : 'Unknown error';
      const retryable = error.includes('timeout') || error.includes('TIMEOUT');

      return {
        success: false,
        error,
        retryable,
        job: job as Job<TResult>,
      };
    }
  }

  private async executeWithTimeout<TResult>(
    handler: (job: Job) => Promise<TResult>,
    job: Job
  ): Promise<TResult> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + this.options.timeoutMs;

      const timeoutId = setTimeout(() => {
        reject(new Error('Job timeout exceeded'));
      }, this.options.timeoutMs);

      // Set a maximum execution time
      job.startedAt = new Date().toISOString();

      handler(job)
        .then(result => {
          clearTimeout(timeoutId);
          job.completedAt = new Date().toISOString();
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timeoutId);
          job.completedAt = new Date().toISOString();
          reject(err);
        });

      // Also enforce a wall-clock deadline
      const now = Date.now();
      if (now >= deadline) {
        clearTimeout(timeoutId);
        reject(new Error('Job timeout exceeded'));
      }
    });
  }

  /**
   * Check if queue is processing
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Get current job
   */
  getCurrentJob(): Job | null {
    return this.currentJob;
  }

  /**
   * Clear all pending jobs (drain queue)
   */
  drain(): Job[] {
    const jobs = [...this.queue];
    this.queue = [];
    return jobs;
  }

  /**
   * Cancel a specific job by ID
   */
  cancel(jobId: string): boolean {
    const index = this.queue.findIndex(j => j.id === jobId);
    if (index === -1) return false;
    
    this.queue.splice(index, 1);
    return true;
  }
}