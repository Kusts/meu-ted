interface Env {
  AGENT_DELEGATION_SECRET: string;
  AGENT_DAILY_TOKEN_BUDGET?: string;
  AGENT_RATE_LIMIT_MAX_REQUESTS?: string;
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace<T = unknown> {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface SqlStorage {
  exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T>;
}

interface DurableObjectState {
  storage: {
    sql: SqlStorage;
    setAlarm?: (time: number) => Promise<void>;
  };
}
