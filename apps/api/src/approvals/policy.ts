export const DEFAULT_HIGH_VALUE_LIMIT_CENTS = 50_000;

export type ApprovalCandidate = {
  operation: string;
  workspaceId?: string;
  amountCents?: number;
  destructive: boolean;
};

export type ApprovalDecision =
  | { requiresApproval: false }
  | { requiresApproval: true; reason: 'high_value' | 'destructive' };

export type ApprovalPolicy = {
  evaluate(candidate: ApprovalCandidate): ApprovalDecision;
};

export const createApprovalPolicy = (config?: { highValueLimitCents?: number; limitsByWorkspace?: Record<string, number> }): ApprovalPolicy => {
  const highValueLimitCents = config?.highValueLimitCents ?? DEFAULT_HIGH_VALUE_LIMIT_CENTS;
  const limitsByWorkspace = config?.limitsByWorkspace ?? {};
  if (!Number.isSafeInteger(highValueLimitCents) || highValueLimitCents < 1) {
    throw new Error('highValueLimitCents must be a positive safe integer');
  }

  return {
    evaluate(candidate) {
      if (candidate.destructive) return { requiresApproval: true, reason: 'destructive' };
      const limit = candidate.workspaceId ? limitsByWorkspace[candidate.workspaceId] ?? highValueLimitCents : highValueLimitCents;
      if ((candidate.amountCents ?? 0) >= limit) return { requiresApproval: true, reason: 'high_value' };
      return { requiresApproval: false };
    },
  };
};
