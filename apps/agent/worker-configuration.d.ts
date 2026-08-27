interface Env {
  AGENT: DurableObjectNamespace;
  FINANCE_CHAT_AGENT: DurableObjectNamespace;
  AGENT_DELEGATION_SECRET: string;
  AGENT_DAILY_TOKEN_BUDGET?: string;
  AGENT_RATE_LIMIT_MAX_REQUESTS?: string;
  AGENT_CONNECTION_TOKEN_SECRET: string;
  AGENT_AUTH_SERVICE_TOKEN: string;
  AGENT_CONFIG_TOKEN: string;
  AGENT_RUNTIME_ADMIN_TOKEN: string;
  OPENCODE_ZEN_API_KEY?: string;
  OPENCODE_GO_API_KEY?: string;
  OPENAI_API_KEY?: string;
  CODEX_BROKER_ORIGIN?: string;
  CODEX_BROKER_ACCESS_CLIENT_ID?: string;
  CODEX_BROKER_ACCESS_CLIENT_SECRET?: string;
  CODEX_BROKER_REQUEST_SIGNING_KEY?: string;
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
