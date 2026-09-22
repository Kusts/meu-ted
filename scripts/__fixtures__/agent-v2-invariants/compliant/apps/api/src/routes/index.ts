// Compliant fixture: the API delegated-capability VERIFIER.
// It fail-closed CHECKS the write scope and never mints it. The open
// literal on the `mutationCapability` definition line is allowlisted by
// isApiVerifierDefinition; the prose mention of financial.write in this
// comment is masked, not matched.
export function checkScope(claims: { capabilities: string[] }, isRead: boolean): string | null {
  const mutationCapability = 'financial.write';
  const requiredCapability = isRead ? 'financial.read' : mutationCapability;
  if (!claims.capabilities.includes(requiredCapability)) return 'auth.delegation_scope_forbidden';
  return null;
}
