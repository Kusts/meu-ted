/**
 * notifications — Motor de notificações proativas
 *
 * Tipos de notificação:
 * - overdue_reminder: conta vencida
 * - due_today_reminder: vence hoje
 * - upcoming_reminder: vence em N dias
 * - daily_summary: resumo diário
 * - weekly_summary: resumo semanal (segunda-feira)
 * - card_closing_soon: fatura de cartão fechando
 * - limit_alert: limite do cartão
 *
 * Cada tipo tem:
 * - enabled: on/off
 * - schedule_hour/minute: hora do dia
 * - days_of_week: [1..7] (1=domingo)
 * - threshold_*: parâmetros específicos
 * - last_sent_at: controle de idempotência
 *
 * Função principal: processNotifications()
 * - Verifica hora atual
 * - Para cada configuração enabled, verifica se deve enviar
 * - Idempotente: não envia se já enviou hoje (ou nesta hora)
 */

import type { Pool } from "pg";

export type NotificationType =
  | "overdue_reminder"
  | "due_today_reminder"
  | "upcoming_reminder"
  | "daily_summary"
  | "weekly_summary"
  | "card_closing_soon"
  | "limit_alert";

export interface NotificationSetting {
  id: string;
  household_id: string;
  chat_id: string;
  notification_type: NotificationType;
  enabled: boolean;
  schedule_hour: number | null;
  schedule_minute: number;
  days_of_week: number[] | null;
  threshold_days: number | null;
  threshold_percent: number | null;
  last_sent_at: string | null;
}

export interface NotificationMessage {
  type: NotificationType;
  title: string;
  message: string;
  payload: any;
  severity: "info" | "warning" | "alert" | "urgent";
}

const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

/**
 * Check if current time matches notification schedule.
 * - For daily/weekly: matches hour:minute
 * - For weekly_summary: matches day-of-week
 * - For event-based (overdue, due_today): no schedule check
 */
export function shouldSendNotification(
  setting: NotificationSetting,
  now: Date
): { shouldSend: boolean; reason: string } {
  if (!setting.enabled) {
    return { shouldSend: false, reason: "disabled" };
  }

  // Idempotência: já enviou hoje?
  if (setting.last_sent_at) {
    const last = new Date(setting.last_sent_at);
    if (isSameDay(last, now)) {
      return { shouldSend: false, reason: "already_sent_today" };
    }
  }

  // Verificar horário
  if (setting.schedule_hour !== null) {
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    if (currentHour !== setting.schedule_hour) {
      return { shouldSend: false, reason: "wrong_hour" };
    }
    // Tolerância de 5 minutos após o horário
    const minutesDiff = (currentHour * 60 + currentMinute) - (setting.schedule_hour * 60 + setting.schedule_minute);
    if (minutesDiff < 0 || minutesDiff > 5) {
      return { shouldSend: false, reason: "wrong_time_window" };
    }
  }

  // Verificar dia da semana (se especificado)
  if (setting.days_of_week && setting.days_of_week.length > 0) {
    const dow = now.getDay();  // 0=domingo, 1=segunda, ...
    if (!setting.days_of_week.includes(dow)) {
      return { shouldSend: false, reason: "wrong_day_of_week" };
    }
  }

  return { shouldSend: true, reason: "ok" };
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

/**
 * Get overdue accounts and format notification.
 */
export async function buildOverdueNotification(
  pool: Pool,
  householdId: string,
  thresholdDays: number = 0  // 0 = qualquer vencida
): Promise<NotificationMessage | null> {
  const result = await pool.query<{ rows: any[] }>(
    `SELECT id, description, amount_cents, due_date::text as due
     FROM accounts_payable
     WHERE household_id = $1
       AND status = 'overdue'
       AND deleted_at IS NULL
       AND due_date <= (CURRENT_DATE - $2 * INTERVAL '1 day')
     ORDER BY due_date ASC
     LIMIT 10`,
    [householdId, thresholdDays]
  );
  if (result.rows.length === 0) return null;

  const totalCents = result.rows.reduce((s, r) => s + parseInt(r.amount_cents, 10), 0);
  const message = `🚨 ${result.rows.length} CONTA(S) VENCIDA(S) — total ${fmt(totalCents)}`;
  return {
    type: "overdue_reminder",
    title: "Contas vencidas",
    message,
    severity: "urgent",
    payload: {
      accounts: result.rows.map((r) => ({
        id: r.id,
        description: r.description,
        amountCents: parseInt(r.amount_cents, 10),
        dueDate: r.due,
      })),
      totalCents,
    },
  };
}

/**
 * Get accounts due today.
 */
export async function buildDueTodayNotification(
  pool: Pool,
  householdId: string
): Promise<NotificationMessage | null> {
  const result = await pool.query<{ rows: any[] }>(
    `SELECT id, description, amount_cents
     FROM accounts_payable
     WHERE household_id = $1
       AND status = 'pending'
       AND due_date = CURRENT_DATE
       AND deleted_at IS NULL
     ORDER BY amount_cents DESC
     LIMIT 10`,
    [householdId]
  );
  if (result.rows.length === 0) return null;

  const totalCents = result.rows.reduce((s, r) => s + parseInt(r.amount_cents, 10), 0);
  return {
    type: "due_today_reminder",
    title: "Vencem hoje",
    message: `🔥 ${result.rows.length} conta(s) vence(m) HOJE — total ${fmt(totalCents)}`,
    severity: "warning",
    payload: {
      accounts: result.rows.map((r) => ({
        id: r.id,
        description: r.description,
        amountCents: parseInt(r.amount_cents, 10),
      })),
      totalCents,
    },
  };
}

/**
 * Get accounts due in N days.
 */
export async function buildUpcomingNotification(
  pool: Pool,
  householdId: string,
  thresholdDays: number
): Promise<NotificationMessage | null> {
  const result = await pool.query<{ rows: any[] }>(
    `SELECT id, description, amount_cents, due_date::text as due,
            (due_date - CURRENT_DATE)::int as days_until
     FROM accounts_payable
     WHERE household_id = $1
       AND status = 'pending'
       AND due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + $2 * INTERVAL '1 day')
       AND deleted_at IS NULL
     ORDER BY due_date ASC
     LIMIT 10`,
    [householdId, thresholdDays]
  );
  if (result.rows.length === 0) return null;

  const totalCents = result.rows.reduce((s, r) => s + parseInt(r.amount_cents, 10), 0);
  return {
    type: "upcoming_reminder",
    title: `Vencem nos próximos ${thresholdDays} dias`,
    message: `📅 ${result.rows.length} conta(s) nos próximos ${thresholdDays} dia(s) — total ${fmt(totalCents)}`,
    severity: "info",
    payload: {
      accounts: result.rows.map((r) => ({
        id: r.id,
        description: r.description,
        amountCents: parseInt(r.amount_cents, 10),
        dueDate: r.due,
        daysUntil: r.days_until,
      })),
      totalCents,
    },
  };
}

/**
 * Build daily summary.
 */
export async function buildDailySummary(
  pool: Pool,
  householdId: string
): Promise<NotificationMessage> {
  // Get totals for today
  const todayStats = await pool.query<{ rows: Array<{ income: string; expense: string }> }>(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) as expense
     FROM transactions
     WHERE household_id = $1
       AND deleted_at IS NULL
       AND date = CURRENT_DATE`,
    [householdId]
  );
  const incomeCents = parseInt(todayStats.rows[0]?.income || "0", 10);
  const expenseCents = parseInt(todayStats.rows[0]?.expense || "0", 10);

  // Get accounts to pay soon
  const upcoming = await pool.query<{ rows: Array<{ count: string; total: string }> }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total
     FROM accounts_payable
     WHERE household_id = $1
       AND status IN ('pending', 'overdue')
       AND due_date <= CURRENT_DATE + INTERVAL '7 days'
       AND deleted_at IS NULL`,
    [householdId]
  );
  const upcomingCount = parseInt(upcoming.rows[0]?.count || "0", 10);
  const upcomingTotal = parseInt(upcoming.rows[0]?.total || "0", 10);

  // Get account balance
  const balance = await pool.query<{ rows: Array<{ total: string }> }>(
    `SELECT COALESCE(SUM(initial_balance_cents), 0) +
       COALESCE((SELECT SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE -amount_cents END)
                 FROM transactions WHERE household_id = $1 AND deleted_at IS NULL), 0) as total
     FROM accounts WHERE household_id = $1 AND active = true AND deleted_at IS NULL`,
    [householdId]
  );
  const balanceCents = parseInt(balance.rows[0]?.total || "0", 10);

  return {
    type: "daily_summary",
    title: "Resumo diário",
    message: `📊 Bom dia! Saldo: ${fmt(balanceCents)}\n` +
             `💰 Receitas hoje: ${fmt(incomeCents)}\n` +
             `💸 Despesas hoje: ${fmt(expenseCents)}\n` +
             `📅 ${upcomingCount} conta(s) a pagar nos próximos 7 dias: ${fmt(upcomingTotal)}`,
    severity: "info",
    payload: {
      balanceCents,
      todayIncomeCents: incomeCents,
      todayExpenseCents: expenseCents,
      upcomingCount,
      upcomingTotalCents: upcomingTotal,
    },
  };
}

/**
 * Build weekly summary (Mondays).
 */
export async function buildWeeklySummary(
  pool: Pool,
  householdId: string
): Promise<NotificationMessage> {
  // Get totals for this week
  const weekStats = await pool.query<{ rows: Array<{ income: string; expense: string }> }>(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) as expense
     FROM transactions
     WHERE household_id = $1
       AND deleted_at IS NULL
       AND date >= date_trunc('week', CURRENT_DATE)
       AND date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'`,
    [householdId]
  );
  const incomeCents = parseInt(weekStats.rows[0]?.income || "0", 10);
  const expenseCents = parseInt(weekStats.rows[0]?.expense || "0", 10);

  // Get accounts to pay this week
  const upcoming = await pool.query<{ rows: Array<{ count: string; total: string }> }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total
     FROM accounts_payable
     WHERE household_id = $1
       AND status IN ('pending', 'overdue')
       AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
       AND deleted_at IS NULL`,
    [householdId]
  );
  const upcomingCount = parseInt(upcoming.rows[0]?.count || "0", 10);
  const upcomingTotal = parseInt(upcoming.rows[0]?.total || "0", 10);

  return {
    type: "weekly_summary",
    title: "Resumo semanal",
    message: `📅 **Semana ${getWeekOfYear()}:**\n` +
             `💰 Receitas: ${fmt(incomeCents)}\n` +
             `💸 Despesas: ${fmt(expenseCents)}\n` +
             `📊 Saldo: ${fmt(incomeCents - expenseCents)}\n` +
             `📌 ${upcomingCount} conta(s) a pagar: ${fmt(upcomingTotal)}`,
    severity: "info",
    payload: {
      weekIncomeCents: incomeCents,
      weekExpenseCents: expenseCents,
      weekBalanceCents: incomeCents - expenseCents,
      upcomingCount,
      upcomingTotalCents: upcomingTotal,
    },
  };
}

function getWeekOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

/**
 * Build notification based on type and settings.
 */
export async function buildNotification(
  pool: Pool,
  setting: NotificationSetting
): Promise<NotificationMessage | null> {
  switch (setting.notification_type) {
    case "overdue_reminder":
      return buildOverdueNotification(pool, setting.household_id, setting.threshold_days || 0);
    case "due_today_reminder":
      return buildDueTodayNotification(pool, setting.household_id);
    case "upcoming_reminder":
      return buildUpcomingNotification(
        pool, setting.household_id, setting.threshold_days || 3
      );
    case "daily_summary":
      return buildDailySummary(pool, setting.household_id);
    case "weekly_summary":
      return buildWeeklySummary(pool, setting.household_id);
    case "card_closing_soon":
      return null;  // TODO: integration with credit-card
    case "limit_alert":
      return null;  // TODO: integration with check_card_limits
  }
}

/**
 * Mark notification as sent (update last_sent_at).
 */
export async function markNotificationSent(
  pool: Pool,
  settingId: string
): Promise<void> {
  await pool.query(
    `UPDATE notification_settings
     SET last_sent_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [settingId]
  );
}

/**
 * Log sent notification.
 */
export async function logNotification(
  pool: Pool,
  setting: NotificationSetting,
  message: NotificationMessage,
  source: string = "auto"
): Promise<string> {
  const result = await pool.query<{ rows: Array<{ id: string }> }>(
    `INSERT INTO notification_log
     (household_id, chat_id, notification_type, title, message, payload, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      setting.household_id, setting.chat_id, setting.notification_type,
      message.title, message.message, JSON.stringify(message.payload), source,
    ]
  );
  return result.rows[0].id;
}

/**
 * Process all notifications due to be sent right now.
 * Returns the list of notifications to be sent (without actually sending).
 *
 * Should be called by a cron job or trigger.
 */
export async function processPendingNotifications(
  pool: Pool,
  now: Date = new Date()
): Promise<Array<{ setting: NotificationSetting; notification: NotificationMessage }>> {
  const settings = await pool.query<{ rows: NotificationSetting[] }>(
    `SELECT * FROM notification_settings WHERE enabled = true`
  );

  const toSend: Array<{ setting: NotificationSetting; notification: NotificationMessage }> = [];

  for (const setting of settings.rows) {
    const check = shouldSendNotification(setting, now);
    if (!check.shouldSend) continue;

    const notification = await buildNotification(pool, setting);
    if (!notification) continue;  // nada a notificar

    toSend.push({ setting, notification });
  }

  return toSend;
}
