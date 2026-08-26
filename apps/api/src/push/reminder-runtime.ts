import type { Pool } from "pg";
import type { PayableStore } from "../payables/store.js";
import type { NotificationConfig } from "../types/domain.js";
import type { PushDelivery } from "./delivery.js";
import { createPostgresReminderLock } from "./reminder-lock.js";
import { createPostgresReminderDedupeStore } from "./reminder-postgres.js";
import { createReminderScheduler } from "./reminder-scheduler.js";

type NotificationStore = Pick<
  PayableStore,
  "listPayables" | "updateNotificationExecution"
> & {
  listAllNotifications: () => Promise<NotificationConfig[]>;
};

export const createPostgresReminderScheduler = (options: {
  pool: Pool;
  payableStore: NotificationStore;
  delivery: PushDelivery;
  onResult?: (
    result: Awaited<
      ReturnType<ReturnType<typeof createReminderScheduler>["run"]>
    >,
  ) => Promise<void> | void;
}) => {
  const scheduler = createReminderScheduler({
    loadConfigs: () => options.payableStore.listAllNotifications(),
    loadPayables: (householdId) =>
      options.payableStore.listPayables(householdId),
    delivery: options.delivery,
    dedupe: createPostgresReminderDedupeStore(options.pool),
    lock: createPostgresReminderLock(options.pool),
    onExecution: async (config, state, executedAt) =>
      options.payableStore.updateNotificationExecution(config.id, {
        ...state,
        executedAt,
      }),
  });
  return {
    async run(...args: Parameters<typeof scheduler.run>) {
      const result = await scheduler.run(...args);
      await options.onResult?.(result);
      return result;
    },
  };
};
