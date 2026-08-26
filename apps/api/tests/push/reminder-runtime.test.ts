import { describe, expect, it, vi } from "vitest";
import { createPostgresReminderScheduler } from "../../src/push/reminder-runtime.js";

describe("Postgres reminder runtime", () => {
  it("persists execution state through the payable store", async () => {
    const updateNotificationExecution = vi.fn().mockResolvedValue(undefined);
    const scheduler = createPostgresReminderScheduler({
      pool: {
        connect: async () => ({
          query: async (sql: string) => ({
            rows: [{ locked: sql.includes("try_advisory") }],
          }),
          release: () => undefined,
        }),
        query: async () => ({ rowCount: 1, rows: [{ id: "delivery-1" }] }),
      } as never,
      payableStore: {
        listAllNotifications: async () => [
          {
            id: "config-1",
            householdId: "household-1",
            chatId: "chat",
            notificationType: "due_today_reminder",
            enabled: true,
            scheduleHour: 9,
            scheduleMinute: 0,
            scheduleWindowMinutes: 240,
            daysOfWeek: [4],
            timezone: "UTC",
          },
        ],
        listPayables: async () => [
          {
            id: "p",
            householdId: "household-1",
            accountId: "a",
            description: "Conta",
            amountCents: 100,
            dueDate: "2026-08-13",
            type: "one_time",
            status: "pending",
          },
        ],
        updateNotificationExecution,
      },
      delivery: {
        sendToWorkspace: vi.fn().mockResolvedValue({ sent: 1, removed: 0 }),
      },
    });

    await scheduler.run(new Date("2026-08-13T12:00:00.000Z"));
    expect(updateNotificationExecution).toHaveBeenCalledWith(
      "config-1",
      expect.objectContaining({
        status: "sent",
        sent: 1,
        executedAt: expect.any(String),
      }),
    );
    expect(updateNotificationExecution).toHaveBeenCalledWith(
      "config-1",
      expect.objectContaining({
        status: "sent",
        sent: 1,
        executedAt: expect.any(String),
      }),
    );
  });
  it("emits scheduler events through the runtime result hook", async () => {
    const onResult = vi.fn();
    const scheduler = createPostgresReminderScheduler({
      pool: {
        connect: async () => ({
          query: async () => ({ rows: [{ locked: true }] }),
          release: () => undefined,
        }),
        query: async () => ({ rowCount: 1, rows: [] }),
      } as never,
      payableStore: {
        listAllNotifications: async () => [],
        listPayables: async () => [],
        updateNotificationExecution: vi.fn().mockResolvedValue(undefined),
      },
      delivery: { sendToWorkspace: vi.fn() },
      onResult,
    });
    const result = await scheduler.run(new Date("2026-08-13T12:00:00.000Z"));
    expect(onResult).toHaveBeenCalledWith(result);
  });
});
