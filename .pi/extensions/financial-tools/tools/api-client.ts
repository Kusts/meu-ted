export class PiApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PiApiError";
    this.status = status;
    this.code = code;
  }
}

type JsonObject = Record<string, unknown>;

type ApiConfig = {
  baseUrl: string;
  deviceToken: string;
};

const getConfig = (): ApiConfig => {
  const baseUrl = process.env.PI_FINANCE_API_BASE_URL?.trim() ?? process.env.FINANCE_API_BASE_URL?.trim();
  const deviceToken = process.env.PI_FINANCE_API_DEVICE_TOKEN?.trim() ?? process.env.FINANCE_API_DEVICE_TOKEN?.trim();
  if (!baseUrl) throw new Error("PI_FINANCE_API_BASE_URL is required for API capabilities");
  if (!deviceToken) throw new Error("PI_FINANCE_API_DEVICE_TOKEN is required for API capabilities");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), deviceToken };
};

const readJson = async (response: Response): Promise<JsonObject> => {
  const body: unknown = await response.json().catch(() => ({}));
  return body && typeof body === "object" ? body as JsonObject : {};
};

export const requestPiApiJson = async <T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { query?: Record<string, string | number | undefined>; body?: unknown; idempotencyKey?: string; headers?: Record<string, string | number | undefined> } = {},
): Promise<T> => {
  const config = getConfig();
  const url = new URL(`${config.baseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const contextToken = process.env.PI_CONTEXT_TOKEN?.trim();
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-device-token": config.deviceToken,
    ...(contextToken ? { "x-pi-context-token": contextToken } : {}),
    ...Object.fromEntries(Object.entries(options.headers ?? {}).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])),
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.idempotencyKey !== undefined) headers["idempotency-key"] = options.idempotencyKey;

  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await readJson(response);
  if (!response.ok) {
    const code = typeof body.code === "string" ? body.code : "api.request_failed";
    const message = typeof body.message === "string" ? body.message : `API request failed with status ${response.status}`;
    throw new PiApiError(response.status, code, message);
  }
  return body as T;
};

export const getPiApiJson = async <T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<T> => requestPiApiJson<T>("GET", path, { query });
