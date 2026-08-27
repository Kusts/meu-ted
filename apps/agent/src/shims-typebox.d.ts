declare module "@sinclair/typebox" {
  export const Type: {
    String(opts?: unknown): unknown;
    Integer(opts?: unknown): unknown;
    Number(opts?: unknown): unknown;
    Boolean(opts?: unknown): unknown;
    Array(item: unknown): unknown;
    Object(props: unknown): unknown;
    Optional(schema: unknown): unknown;
    Union(schemas: unknown[]): unknown;
    Literal(value: unknown): unknown;
  };
}
