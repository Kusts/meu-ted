declare module '@earendil-works/pi-coding-agent' {
  interface RpcClientOptions {
    cwd: string;
    cliPath: string;
    args: string[];
    provider: string;
    model: string;
  }

  interface RpcEvent {
    type?: unknown;
    message?: unknown;
  }

  export class RpcClient {
    constructor(options: RpcClientOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    getStderr(): string;
    promptAndWait(message: string, images?: unknown, timeout?: number): Promise<RpcEvent[]>;
    getLastAssistantText(): Promise<string | null>;
  }
}
