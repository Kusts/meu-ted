/**
 * Central Postgres SQLSTATE → route-error translation (V4.1 Phase 8,
 * task 8.10, SPEC §15.7).
 *
 * Raw `pg` errors must never surface as 500s with SQL internals on
 * mutation paths. `mapPgError` returns the SAME `{ statusCode, code,
 * message }` shape the route `handleError` helpers already send for
 * `DomainError`, so wiring is a one-line fallback before the rethrow.
 * Returns `null` for non-pg errors (DomainError / statusCode errors and
 * unknown failures keep their existing handling).
 */

import { domainErrors } from '../writes/errors.js';

export type RouteErrorShape = {
  statusCode: number;
  code: string;
  message: string;
};

const shapeOf = (statusCode: number, code: string, message: string): RouteErrorShape => ({
  statusCode,
  code,
  message,
});

export const mapPgError = (err: unknown): RouteErrorShape | null => {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== 'string') return null;
  switch (code) {
    case '23505': {
      const e = domainErrors.conflict('Registro já existe (conflito de unicidade).');
      return shapeOf(e.statusCode, e.code, e.message);
    }
    case '23503': {
      const e = domainErrors.notFound('Referência');
      return shapeOf(e.statusCode, e.code, e.message);
    }
    case '23514': {
      const e = domainErrors.invalid('campo', 'violação de regra de integridade');
      return shapeOf(e.statusCode, e.code, e.message);
    }
    case '22007':
    case '22P02': {
      const e = domainErrors.invalid('campo', 'formato inválido');
      return shapeOf(e.statusCode, e.code, e.message);
    }
    case '40001': {
      const e = domainErrors.conflict(
        'Conflito de concorrência (serialização); tente novamente.',
      );
      return shapeOf(e.statusCode, e.code, e.message);
    }
    case '40P01': {
      const e = domainErrors.conflict('Deadlock detectado (concorrência); tente novamente.');
      return shapeOf(e.statusCode, e.code, e.message);
    }
    case '57014':
      // Statement timeout / operator cancel: 503 with no SQL internals.
      return shapeOf(503, 'server.timeout', 'Operação excedeu o tempo limite; tente novamente.');
    default:
      return null;
  }
};
