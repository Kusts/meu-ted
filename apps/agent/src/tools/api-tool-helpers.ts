/**
 * C-03 fail-closed mutation gate for generated HTTP tools.
 *
 * Reads are allowed. Writes are denied at this boundary until the V2
 * MutationExecutor integration supplies an opaque, API-issued attestation.
 * Model output, legacy approval objects, and every other call path are
 * intentionally unable to open this gate.
 */

export type PolicyViolation = { blocked: true; reason: string };

export const capabilityDisabled = () => false;

export const checkToolExecutionPolicy = (
  name: string,
  kind: string,
  _attestation?: unknown,
): PolicyViolation | null => {
  if (kind !== 'write') return null;
  return {
    blocked: true,
    reason: `Mutação "${name}" bloqueada: MutationExecutor V2 indisponível (fail-closed).`,
  };
};
