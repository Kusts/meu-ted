import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryReminderDedupeStore,
  createReminderScheduler,
} from "../../src/push/reminder-scheduler.js";
import type { NotificationConfig, Payable } from "../../src/types/domain.js";

const config = (
  overrides: Partial<NotificationConfig> = {},
): NotificationConfig => ({
  id: "config-1",
  householdId: "household-1",
  chatId: "legacy-chat",
  notificationType: "due_today_reminder",
  enabled: true,
  scheduleHour: 9,
  scheduleMinute: 0,
  daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
  thresholdDays: 1,
  timezone: "America/Sao_Paulo",
  ...overrides,
});

const payable = (overrides: Partial<Payable> = {}): Payable => ({
  id: "payable-1",
  householdId: "household-1",
  accountId: "account-1",
  description: "Conta de luz",
  amountCents: 12000,
  dueDate: "2026-08-13",
  type: "one_time",
  status: "pending",
  ...overrides,
});

describe("server-side Web Push reminder scheduler", () => {
  it("uses the configured timezone when selecting the scheduled local day", async () => {
    const sendToWorkspace = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: { sendToWorkspace },
      dedupe: createInMemoryReminderDedupeStore(),
      lock: { runExclusive: async (_key, fn) => fn() },
    });

    const result = await scheduler.run();

    expect(result).toMatchObject({
      sent: 1,
      deduplicated: 0,
      lockSkipped: false,
    });
    expect(sendToWorkspace).toHaveBeenCalledWith(
      "household-1",
      expect.objectContaining({
        title: "Conta a pagar vence hoje",
        url: "/a-pagar",
      }),
      "household-1:config-1:2026-08-13:due_today_reminder",
    );
  });
  it("does not send when the configured local time is before schedule", async () => {
    const sendToWorkspace = vi.fn();
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-13T11:59:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: { sendToWorkspace },
      dedupe: createInMemoryReminderDedupeStore(),
      lock: { runExclusive: async (_key, fn) => fn() },
    });
    await expect(scheduler.run()).resolves.toMatchObject({
      processed: 0,
      sent: 0,
    });
    expect(sendToWorkspace).not.toHaveBeenCalled();
  });

  it("deduplicates the same config and local date across repeated runs", async () => {
    const sendToWorkspace = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    const options = {
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: { sendToWorkspace },
      dedupe: createInMemoryReminderDedupeStore(),
      lock: {
        runExclusive: async (_key: string, fn: () => Promise<unknown>) => fn(),
      },
    };
    const scheduler = createReminderScheduler(options);

    await scheduler.run();
    const second = await scheduler.run();

    expect(sendToWorkspace).toHaveBeenCalledTimes(1);
    expect(second.deduplicated).toBe(1);
  });

  it("reports a lock skip without sending", async () => {
    const sendToWorkspace = vi.fn();
    const scheduler = createReminderScheduler({
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: { sendToWorkspace },
      dedupe: createInMemoryReminderDedupeStore(),
      lock: { runExclusive: async () => undefined },
    });

    await expect(scheduler.run()).resolves.toMatchObject({
      lockSkipped: true,
      sent: 0,
      events: [expect.objectContaining({ name: "push_reminder_lock_skipped" })],
    });
    expect(sendToWorkspace).not.toHaveBeenCalled();
  });
  it("records delivery counts through execution state", async () => {
    const onExecution = vi.fn();
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: {
        sendToWorkspace: vi.fn().mockResolvedValue({ sent: 2, removed: 1 }),
      },
      dedupe: createInMemoryReminderDedupeStore(),
      lock: { runExclusive: async (_key, fn) => fn() },
      onExecution,
    });
    await scheduler.run();
    expect(onExecution).toHaveBeenCalledWith(
      expect.objectContaining({ notificationType: "due_today_reminder" }),
      expect.objectContaining({ status: "sent", sent: 2, removed: 1 }),
      "2026-08-13T12:00:00.000Z",
    );
  });
  it("records a failed delivery before releasing its retry claim", async () => {
    const dedupe = createInMemoryReminderDedupeStore();
    const record = vi.fn();
    const release = vi.fn(async (key: string) => dedupe.release?.(key));
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: {
        sendToWorkspace: vi.fn().mockRejectedValue(new Error("down")),
      },
      dedupe: { ...dedupe, record, release },
      lock: { runExclusive: async (_key, fn) => fn() },
    });
    await scheduler.run();
    expect(record).toHaveBeenCalledBefore(release);
  });
  it("recovers stale claims before processing reminders", async () => {
    const recoverStale = vi.fn().mockResolvedValue(2);
    const sendToWorkspace = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: { sendToWorkspace },
      dedupe: { claim: vi.fn().mockResolvedValue(true), recoverStale },
      lock: { runExclusive: async (_key, fn) => fn() },
    });
    const result = await scheduler.run();
    expect(recoverStale).toHaveBeenCalledWith("2026-08-13T12:00:00.000Z");
    expect(result.events).toContainEqual(
      expect.objectContaining({
        name: "push_reminder_stale_claims_recovered",
        attributes: { count: 2 },
      }),
    );
  });
  it("reports delivery failures as observable results", async () => {
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: {
        sendToWorkspace: vi.fn().mockRejectedValue(new Error("provider down")),
      },
      dedupe: createInMemoryReminderDedupeStore(),
      lock: { runExclusive: async (_key, fn) => fn() },
    });
    const result = await scheduler.run();
    expect(result.failed).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({ name: "push_reminder_failed" }),
    );
  });
  it("releases a dedupe claim when delivery fails", async () => {
    const dedupe = createInMemoryReminderDedupeStore();
    const sendToWorkspace = vi
      .fn()
      .mockRejectedValue(new Error("provider down"));
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: { sendToWorkspace },
      dedupe,
      lock: { runExclusive: async (_key, fn) => fn() },
    });
    await scheduler.run();
    await scheduler.run();
    expect(sendToWorkspace).toHaveBeenCalledTimes(2);
  });
  it("quarantines a delivery when terminal state persistence fails", async () => {
    const dedupe = createInMemoryReminderDedupeStore();
    const sendToWorkspace = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    const onExecution = vi
      .fn()
      .mockRejectedValue(new Error("database unavailable"));
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: { sendToWorkspace },
      dedupe,
      lock: { runExclusive: async (_key, fn) => fn() },
      onExecution,
    });
    const first = await scheduler.run();
    const second = await scheduler.run();
    expect(first.sent).toBe(1);
    expect(first.events).toContainEqual(
      expect.objectContaining({ name: "push_reminder_execution_state_failed" }),
    );
    expect(second.deduplicated).toBe(1);
    expect(sendToWorkspace).toHaveBeenCalledTimes(1);
  });
  it("runs a window that crosses midnight using the previous scheduled weekday and date", async () => {
    const sendToWorkspace = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    const scheduler = createReminderScheduler({
      now: () => new Date("2026-08-11T03:30:00.000Z"),
      loadConfigs: async () => [
        config({
          scheduleHour: 23,
          scheduleMinute: 0,
          scheduleWindowMinutes: 120,
          daysOfWeek: [1],
        }),
      ],
      loadPayables: async () => [payable({ dueDate: "2026-08-11" })],
      delivery: { sendToWorkspace },
      dedupe: createInMemoryReminderDedupeStore(),
      lock: { runExclusive: async (_key, fn) => fn() },
    });
    await expect(scheduler.run()).resolves.toMatchObject({ sent: 1 });
    expect(sendToWorkspace).toHaveBeenCalledWith(
      "household-1",
      expect.anything(),
      "household-1:config-1:2026-08-10:due_today_reminder",
    );
  });
  it("persists a deduplicated execution state on repeated runs", async () => {
    const onExecution = vi.fn();
    const options = {
      now: () => new Date("2026-08-13T12:00:00.000Z"),
      loadConfigs: async () => [config()],
      loadPayables: async () => [payable()],
      delivery: {
        sendToWorkspace: vi.fn().mockResolvedValue({ sent: 1, removed: 0 }),
      },
      dedupe: createInMemoryReminderDedupeStore(),
      lock: {
        runExclusive: async (_key: string, fn: () => Promise<unknown>) => fn(),
      },
      onExecution,
    };
    const scheduler = createReminderScheduler(options);
    await scheduler.run();
    await scheduler.run();
    expect(onExecution).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "config-1" }),
      expect.objectContaining({ status: "deduplicated", sent: 0, removed: 0 }),
      "2026-08-13T12:00:00.000Z",
    );
  });
});
