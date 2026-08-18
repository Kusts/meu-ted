import type { NotificationConfig, Payable } from "../types/domain.js";
import type { PushDelivery } from "./delivery.js";

export type ReminderRunResult = {
  processed: number;
  sent: number;
  removed: number;
  deduplicated: number;
  lockSkipped: boolean;
  failed: number;
  metrics: {
    runs: number;
    sent: number;
    removed: number;
    deduplicated: number;
    failed: number;
  };
  events: Array<{
    name: string;
    attributes: Record<string, string | number | boolean>;
  }>;
};

export type ReminderExecutionState = {
  status: "sent" | "deduplicated" | "failed";
  sent: number;
  removed: number;
  error?: string;
};

export type ReminderDedupeStore = {
  claim(key: string): Promise<boolean>;
  release?(key: string): Promise<void>;
  recoverStale?(now: string): Promise<number>;
  quarantine?(key: string, error: string): Promise<void>;
  record?(
    key: string,
    state: ReminderExecutionState,
    executedAt: string,
  ): Promise<void>;
};

export type ReminderLock = {
  runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T | undefined>;
};

type Config = NotificationConfig & { timezone?: string };
type SchedulerOptions = {
  now?: () => Date;
  loadConfigs: () => Promise<Config[]>;
  loadPayables: (householdId: string) => Promise<Payable[]>;
  delivery: Pick<PushDelivery, "sendToWorkspace">;
  dedupe: ReminderDedupeStore;
  lock: ReminderLock;
  onExecution?: (
    config: Config,
    state: ReminderExecutionState,
    localDate: string,
  ) => Promise<void>;
};
type Local = { date: string; hour: number; minute: number; day: number };

const STALE_CLAIM_MS = 15 * 60 * 1000;

const localParts = (date: Date, timeZone: string): Local => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      value("weekday"),
    ),
  };
};

const previousDate = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

const scheduleWindow = (local: Local, start: number, windowMinutes: number) => {
  const end = start + Math.max(0, windowMinutes);
  const crossesMidnight = end > 1_440;
  const current = local.hour * 60 + local.minute;
  const inWindow = crossesMidnight
    ? current >= start || current < end - 1_440
    : current >= start && current < end;
  const scheduledDay =
    crossesMidnight && current < start ? (local.day + 6) % 7 : local.day;
  const occurrenceDate =
    crossesMidnight && current < start ? previousDate(local.date) : local.date;
  return { inWindow, scheduledDay, occurrenceDate };
};
const selectItems = (
  config: Config,
  payables: Payable[],
  date: string,
): Payable[] => {
  if (config.notificationType === "overdue_reminder") {
    return payables.filter(
      (item) =>
        item.status === "overdue" ||
        (item.status === "pending" && item.dueDate < date),
    );
  }
  if (config.notificationType === "upcoming_reminder") {
    const start = Date.parse(`${date}T00:00:00Z`);
    const end = start + (config.thresholdDays ?? 1) * 86_400_000;
    return payables.filter((item) => {
      const due = Date.parse(`${item.dueDate}T00:00:00Z`);
      return item.status === "pending" && due > start && due <= end;
    });
  }
  return payables.filter(
    (item) => item.status === "pending" && item.dueDate === date,
  );
};

const payloadFor = (config: Config, items: Payable[]) => {
  if (items.length === 0) return undefined;
  const total = items.reduce((sum, item) => sum + item.amountCents, 0) / 100;
  const body = `${items.length} conta(s) — ${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(total)}`;
  const title =
    (
      {
        overdue_reminder: "Conta a pagar vencida",
        upcoming_reminder: "Contas a pagar próximas",
        due_today_reminder: "Conta a pagar vence hoje",
        daily_summary: "Resumo de contas a pagar",
        weekly_summary: "Resumo semanal de contas a pagar",
      } as Partial<Record<Config["notificationType"], string>>
    )[config.notificationType] ?? "Contas a pagar";
  return { title, body, url: "/a-pagar" as const };
};

export const createReminderScheduler = (options: SchedulerOptions) => ({
  async run(at = options.now?.() ?? new Date()): Promise<ReminderRunResult> {
    const empty = (): ReminderRunResult => ({
      processed: 0,
      sent: 0,
      removed: 0,
      deduplicated: 0,
      lockSkipped: false,
      failed: 0,
      metrics: { runs: 0, sent: 0, removed: 0, deduplicated: 0, failed: 0 },
      events: [],
    });
    const result = await options.lock.runExclusive(
      "pi-finance:push-reminders",
      async () => {
        const output = empty();
        output.metrics.runs = 1;
        const recovered = await options.dedupe.recoverStale?.(at.toISOString());
        if (recovered) {
          output.events.push({
            name: "push_reminder_stale_claims_recovered",
            attributes: { count: recovered },
          });
        }
        const recordExecution = async (
          config: Config,
          state: ReminderExecutionState,
          key: string,
        ): Promise<boolean> => {
          const executedAt = at.toISOString();
          let persisted = true;
          try {
            await options.onExecution?.(config, state, executedAt);
          } catch (error) {
            persisted = false;
            output.events.push({
              name: "push_reminder_execution_state_failed",
              attributes: {
                error: error instanceof Error ? error.message : "unknown",
              },
            });
          }
          try {
            await options.dedupe.record?.(key, state, executedAt);
          } catch (error) {
            persisted = false;
            output.events.push({
              name: "push_reminder_delivery_state_failed",
              attributes: {
                error: error instanceof Error ? error.message : "unknown",
              },
            });
          }
          if (!persisted) {
            try {
              await options.dedupe.quarantine?.(
                key,
                "terminal delivery state persistence failed",
              );
            } catch (error) {
              output.events.push({
                name: "push_reminder_quarantine_failed",
                attributes: {
                  error: error instanceof Error ? error.message : "unknown",
                },
              });
            }
          }
          return persisted;
        };
        const configs = await options.loadConfigs();
        for (const config of configs) {
          if (!config.enabled) continue;
          const local = localParts(at, config.timezone ?? "UTC");
          const scheduleStart =
            (config.scheduleHour ?? 9) * 60 + (config.scheduleMinute ?? 0);
          const windowMinutes = config.scheduleWindowMinutes ?? 60;
          const window = scheduleWindow(local, scheduleStart, windowMinutes);
          if (
            !window.inWindow ||
            !(config.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]).includes(
              window.scheduledDay,
            )
          )
            continue;
          const items = selectItems(
            config,
            await options.loadPayables(config.householdId),
            local.date,
          );
          const payload = payloadFor(config, items);
          if (!payload) continue;
          output.processed += 1;
          const key = `${config.householdId}:${config.id}:${window.occurrenceDate}:${config.notificationType}`;
          if (!(await options.dedupe.claim(key))) {
            output.deduplicated += 1;
            output.metrics.deduplicated += 1;
            await recordExecution(
              config,
              {
                status: "deduplicated",
                sent: 0,
                removed: 0,
              },
              key,
            );
            output.events.push({
              name: "push_reminder_deduplicated",
              attributes: { key },
            });
            continue;
          }
          try {
            const sent = await options.delivery.sendToWorkspace(
              config.householdId,
              payload,
              key,
            );
            output.sent += sent.sent;
            output.removed += sent.removed;
            output.metrics.sent += sent.sent;
            output.metrics.removed += sent.removed;
            await recordExecution(
              config,
              {
                status: "sent",
                sent: sent.sent,
                removed: sent.removed,
              },
              key,
            );
            output.events.push({
              name: "push_reminder_sent",
              attributes: { sent: sent.sent, removed: sent.removed },
            });
          } catch (error) {
            const state: ReminderExecutionState = {
              status: "failed",
              sent: 0,
              removed: 0,
              error: error instanceof Error ? error.message : "unknown",
            };
            await recordExecution(config, state, key);
            output.failed += 1;
            output.metrics.failed += 1;
            output.events.push({
              name: "push_reminder_failed",
              attributes: {
                error: error instanceof Error ? error.message : "unknown",
              },
            });
            try {
              await options.dedupe.release?.(key);
            } catch (releaseError) {
              output.events.push({
                name: "push_reminder_release_failed",
                attributes: {
                  error:
                    releaseError instanceof Error
                      ? releaseError.message
                      : "unknown",
                },
              });
            }
          }
        }
        return output;
      },
    );
    if (result) return result;
    return {
      ...empty(),
      lockSkipped: true,
      events: [
        {
          name: "push_reminder_lock_skipped",
          attributes: { key: "pi-finance:push-reminders" },
        },
      ],
    };
  },
});

export const createInMemoryReminderDedupeStore = (): ReminderDedupeStore => {
  const entries = new Map<
    string,
    {
      status: "claimed" | "sent" | "failed" | "quarantined";
      claimedAt: number;
    }
  >();
  return {
    claim: async (key) => {
      const entry = entries.get(key);
      if (entry?.status === "sent" || entry?.status === "quarantined")
        return false;
      if (entry?.status === "claimed") return false;
      entries.set(key, { status: "claimed", claimedAt: Date.now() });
      return true;
    },
    recoverStale: async (now) => {
      const timestamp = Date.parse(now);
      let count = 0;
      for (const [key, entry] of entries) {
        if (
          entry.status === "claimed" &&
          timestamp - entry.claimedAt >= STALE_CLAIM_MS
        ) {
          entries.set(key, { ...entry, status: "quarantined" });
          count += 1;
        }
      }
      return count;
    },
    quarantine: async (key) => {
      const entry = entries.get(key);
      if (entry) entries.set(key, { ...entry, status: "quarantined" });
    },
    record: async (key, state) => {
      const entry = entries.get(key);
      if (!entry) return;
      entries.set(key, {
        ...entry,
        status: state.status === "deduplicated" ? entry.status : state.status,
      });
    },
  };
};
