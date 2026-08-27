export type ApiRequestOptions = {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string | number | undefined>;
  idempotencyKey?: string;
  delegatedToken?: string;
  apiOrigin?: string;
};

let globalDelegatedToken: string | undefined;
let globalApiOrigin = 'https://api.synkroo.com.br';

export const setGlobalApiContext = (context: { delegatedToken?: string; apiOrigin?: string }): void => {
  if (context.delegatedToken !== undefined) globalDelegatedToken = context.delegatedToken;
  if (context.apiOrigin !== undefined) globalApiOrigin = context.apiOrigin;
};

export const getGlobalApiContext = () => ({
  delegatedToken: globalDelegatedToken,
  apiOrigin: globalApiOrigin,
});

export const requestPiApiJson = async <T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: ApiRequestOptions = {},
): Promise<T> => {
  const origin = opts.apiOrigin ?? globalApiOrigin;
  const url = new URL(path, origin);

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const token = opts.delegatedToken ?? globalDelegatedToken;
  const headers: Record<string, string> = {
    accept: 'application/json',
  };

  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  if (opts.idempotencyKey) {
    headers['idempotency-key'] = opts.idempotencyKey;
  }

  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (v !== undefined) {
        headers[k.toLowerCase()] = String(v);
      }
    }
  }

  let body: string | undefined;
  if (opts.body !== undefined && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), {
    method: method.toUpperCase(),
    headers,
    body,
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof errorBody.message === 'string' ? errorBody.message : `HTTP ${res.status}`;
    const err = new Error(message);
    (err as { statusCode?: number; code?: string }).statusCode = res.status;
    (err as { statusCode?: number; code?: string }).code = typeof errorBody.code === 'string' ? errorBody.code : 'api.request_failed';
    throw err;
  }

  return (await res.json()) as T;
};
