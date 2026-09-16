declare module 'better-auth' {
  export type BetterAuthOptions = {
    database?: unknown;
    [key: string]: unknown;
  };

  export function betterAuth(options: BetterAuthOptions): any;
}

declare module 'kysely' {
  export class Kysely<_Database = unknown> {
    constructor(options: unknown);
    destroy(): Promise<void>;
  }

  export class PostgresDialect {
    constructor(options: { pool: unknown });
  }
}
