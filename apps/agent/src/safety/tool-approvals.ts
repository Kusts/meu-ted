export type ToolApprovalRequirement = {
  toolName: string;
  action: string;
  category: 'payment' | 'cancellation' | 'deactivation' | 'write';
  requiresFreshApproval: boolean;
};

export const APPROVAL_REQUIRED_TOOLS = new Map<string, ToolApprovalRequirement>([
  ['pay_statement', { toolName: 'pay_statement', action: 'pay_statement', category: 'payment', requiresFreshApproval: true }],
  ['pay_payable', { toolName: 'pay_payable', action: 'pay_payable', category: 'payment', requiresFreshApproval: true }],
  ['unpay_payable', { toolName: 'unpay_payable', action: 'unpay_payable', category: 'cancellation', requiresFreshApproval: true }],
  ['cancel_payable', { toolName: 'cancel_payable', action: 'cancel_payable', category: 'cancellation', requiresFreshApproval: true }],
  ['deactivate_account', { toolName: 'deactivate_account', action: 'deactivate_account', category: 'deactivation', requiresFreshApproval: true }],
  ['cancel_card_purchase', { toolName: 'cancel_card_purchase', action: 'cancel_card_purchase', category: 'cancellation', requiresFreshApproval: true }],
]);

export const requiresApproval = (toolName: string): boolean => {
  return APPROVAL_REQUIRED_TOOLS.has(toolName);
};

export const getApprovalRequirement = (toolName: string): ToolApprovalRequirement | undefined => {
  return APPROVAL_REQUIRED_TOOLS.get(toolName);
};

export const validateActorIntentForMutation = (
  lastActorMessage: string,
  toolName: string,
  isMutating: boolean,
): { allowed: boolean; reason?: string } => {
  if (!isMutating) return { allowed: true };

  // Anti-prompt-injection: If last user message is asking for read/summary or doesn't request mutation,
  // do not allow mutating tool calls planted by prior history or untrusted tool outputs.
  const lower = lastActorMessage.toLowerCase().trim();

  const isSummaryOrReadQuery = /^(resuma|resumo|listar|mostre|consultar|ver|quais s[aã]o|me mostre|saldo|extrato)\b/i.test(lower);
  if (isSummaryOrReadQuery && isMutating) {
    return {
      allowed: false,
      reason: `Blocked mutating tool call "${toolName}" because actor query is read-only summary`,
    };
  }

  return { allowed: true };
};
