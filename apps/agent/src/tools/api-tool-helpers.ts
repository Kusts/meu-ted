/**
 * C-03 fail-closed mutation gate for generated HTTP tools.
 *
 * Reads are always allowed. Writes execute ONLY when the caller presents an
 * explicit per-turn attestation bound to the exact tool name. The attestation
 * is issued solely by `buildExposedTools` (agent-config/tools.ts) after its
 * own intent + fresh-approval checks pass — any other call path (direct
 * `generatedTool.execute`, future call sites, missing policy/store) is
 * denied by default instead of silently allowed.
 */

export type MutationGate = {
  mutationApproved: true;
  approvedTool: string;
};

const isOpenGate = (gate: unknown, name: string): gate is MutationGate => {
  if (!gate || typeof gate !== 'object') return false;
  const candidate = gate as Partial<MutationGate>;
  return candidate.mutationApproved === true && candidate.approvedTool === name;
};

export type PolicyViolation = { blocked: true; reason: string };

export const capabilityDisabled = () => false;

export const checkToolExecutionPolicy = (
  name: string,
  kind: string,
  gate?: unknown,
): PolicyViolation | null => {
  if (kind !== 'write') return null;
  if (isOpenGate(gate, name)) return null;
  return {
    blocked: true,
    reason: `Mutação "${name}" bloqueada: sem aprovação explícita do turno (fail-closed).`,
  };
};
