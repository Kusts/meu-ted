export const RECURRING_PURCHASES_EXECUTOR_ENABLED = false as const;

export type RecurringPurchasesMode = 'template-only';

export const recurringPurchasesCapability = (): {
  enabled: false;
  mode: RecurringPurchasesMode;
  reason: 'no-executor';
} => ({
  enabled: RECURRING_PURCHASES_EXECUTOR_ENABLED,
  mode: 'template-only',
  reason: 'no-executor',
});
