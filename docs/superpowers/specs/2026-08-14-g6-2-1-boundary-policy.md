# G6.2.1 Boundary Policy

## Production boundary

The active Pi financial tools boundary must contain only generated HTTP adapters and thin compatibility facades. It must not import `pg`, read `DATABASE_URL`, embed SQL, instantiate database pools, or invoke shadow readers.

## Explicitly allowed exceptions

The following are not production adapters and may retain database access only when they are not imported by `index.ts` or any generated adapter:

- `tests/**` and files whose names are test fixtures: integration/contract fixtures may use direct database access only for setup/assertion.
- `scripts/**`: one-off migration/bootstrap utilities may use database access; they are never runtime imports.
- `shadow/**`: read-only shadow readers may use database access only in G6.2.2 and must remain unreachable from the response/write path.

`generated/**` is not an exception: generated adapters must remain HTTP-only. A reference to `shadow` in generated code is a boundary violation unless it is test metadata and does not import or invoke a shadow reader.

## Enforcement

A boundary test must:

1. enumerate production-active modules transitively reachable from `.pi/extensions/financial-tools/index.ts`;
2. reject direct or transitive imports of `pg` and database readers;
3. reject `DATABASE_URL`, SQL verbs and pool construction in those modules;
4. reject imports from `shadow/**` in the response/write path;
5. report test, script and shadow exceptions separately instead of silently excluding them.

A passing scan with a broad directory exclusion is insufficient. Every exception must be path-classified and referenced by the test output.
