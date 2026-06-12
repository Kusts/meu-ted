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
  grouping_enabled: boolean;
  grouping_max_items: number;
  grouping_window_minutes: number;
}

export interface NotificationMessage {
  type: NotificationType;
  title: string;
  message: string;
  payload: any;
  severity: "info" | "warning" | "alert" | "urgent";
}

const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

const payableDueRowsSql = `
  SELECT id, description, amount_cents, due_date::text as due, 'account_payable' as source
  FROM accounts_payable
  WHERE household_id = $1
    AND deleted_at IS NULL
`;

const installmentDueRowsSql = `
  SELECT t.id,
         p.description || ' (' || t.installment_number || '/' || t.installments_total || ')' as description,
         t.amount_cents,
         t.date::text as due,
         'installment' as source
  FROM transactions t
  JOIN installment_plans p ON p.id = t.installment_plan_id
  WHERE t.household_id = $1
    AND t.installment_plan_id IS NOT NULL
    AND t.installment_status = 'scheduled'
    AND p.type = 'out_of_card'
    AND t.deleted_at IS NULL
`;

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
    `(${payableDueRowsSql}
       AND status = 'overdue'
       AND due_date <= (CURRENT_DATE - $2 * INTERVAL '1 day'))
     UNION ALL
     (${installmentDueRowsSql}
       AND t.date < CURRENT_DATE
       AND t.date <= (CURRENT_DATE - $2 * INTERVAL '1 day'))
     ORDER BY due ASC
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
        source: r.source,
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
    `(${payableDueRowsSql}
       AND status = 'pending'
       AND due_date = CURRENT_DATE)
     UNION ALL
     (${installmentDueRowsSql}
       AND t.date = CURRENT_DATE)
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
        source: r.source,
      })),
      totalCents,
    },
  };
}

/**
 * Get accounts due in N days (excluding today — that's due_today_reminder).
 */
export async function buildUpcomingNotification(
  pool: Pool,
  householdId: string,
  thresholdDays: number
): Promise<NotificationMessage | null> {
  const result = await pool.query<{ rows: any[] }>(
    `SELECT *, (due::date - CURRENT_DATE)::int as days_until
     FROM (
       (${payableDueRowsSql}
          AND status = 'pending'
          AND due_date BETWEEN (CURRENT_DATE + INTERVAL '1 day') AND (CURRENT_DATE + $2 * INTERVAL '1 day'))
       UNION ALL
       (${installmentDueRowsSql}
          AND t.date BETWEEN (CURRENT_DATE + INTERVAL '1 day') AND (CURRENT_DATE + $2 * INTERVAL '1 day'))
     ) due_items
     ORDER BY due ASC
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
        source: r.source,
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
     FROM (
       (${payableDueRowsSql}
          AND status IN ('pending', 'overdue')
          AND due_date <= CURRENT_DATE + INTERVAL '7 days')
       UNION ALL
       (${installmentDueRowsSql}
          AND t.date <= CURRENT_DATE + INTERVAL '7 days')
     ) due_items`,
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
     FROM (
       (${payableDueRowsSql}
          AND status IN ('pending', 'overdue')
          AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
       UNION ALL
       (${installmentDueRowsSql}
          AND t.date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
     ) due_items`,
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

/**
 * Group multiple notifications from the same chat into a single message.
 *
 * Agrupa por chat_id + janela de tempo.
 * Ex: 3 contas vencidas + 1 resumo + 1 vencem hoje = 1 mensagem
 *
 * Output format:
 *   📨 [3] [13:45] Você tem 3 notificações:
 *   🚨 2 vencida(s) — R$ 250,00
 *   🔥 1 vence hoje — R$ 100,00
 *
 * Lógica de agrupamento:
 * - Agrupa por chat_id
 * - Mantém a ordem de severidade (urgent > warning > info)
 * - Respeita grouping_max_items
 * - Mantém contexto (cada item mostra: emoji, contagem, total)
 */
export interface GroupedNotification {
  chatId: string;
  items: Array<{
    type: NotificationType;
    severity: "info" | "warning" | "alert" | "urgent";
    count: number;
    totalLabel: string;
    details: string;
  }>;
  totalCount: number;
  totalCents: number;
  message: string;
  hasUrgent: boolean;
}

const SEVERITY_RANK: Record<"info" | "warning" | "alert" | "urgent", number> = {
  urgent: 0,
  alert: 1,
  warning: 2,
  info: 3,
};

export function groupNotifications(
  items: Array<{ setting: NotificationSetting; notification: NotificationMessage }>
): GroupedNotification[] {
  // Agrupa por chat_id
  const byChat = new Map<string, Array<{ setting: NotificationSetting; notification: NotificationMessage }>>();
  for (const item of items) {
    const cid = item.setting.chat_id;
    if (!byChat.has(cid)) byChat.set(cid, []);
    byChat.get(cid)!.push(item);
  }

  const result: GroupedNotification[] = [];
  for (const [chatId, chatItems] of byChat) {
    // Respeita grouping_max_items do setting (pega o primeiro)
    const maxItems = chatItems[0]?.setting.grouping_max_items ?? 5;
    const truncate = chatItems.length > maxItems;

    // Agrupa por tipo (caso tenha múltiplos do mesmo tipo)
    const byType = new Map<NotificationType, { count: number; cents: number; first: NotificationMessage }>();
    for (const item of chatItems) {
      const key = item.notification.type;
      if (!byType.has(key)) {
        byType.set(key, { count: 0, cents: 0, first: item.notification });
      }
      const group = byType.get(key)!;
      group.count += 1;
      // Extrai totalCents do payload
      const cents = (item.notification.payload as any)?.totalCents;
      if (typeof cents === "number") group.cents += cents;
    }

    // Constrói items ordenados por severidade
    const groupedItems = Array.from(byType.entries()).map(([type, group]) => {
      const first = group.first;
      let totalLabel = "";
      let details = "";

      if (type === "overdue_reminder") {
        const accs = (first.payload as any)?.accounts || [];
        totalLabel = `R$ ${(group.cents / 100).toFixed(2)}`;
        details = accs.slice(0, 3).map((a: any) =>
          `   • ${a.description}: ${fmt(a.amountCents)}`
        ).join("\n");
        if (accs.length > 3) {
          details += `\n   ... +${accs.length - 3} mais`;
        }
      } else if (type === "due_today_reminder") {
        totalLabel = `R$ ${(group.cents / 100).toFixed(2)}`;
        const accs = (first.payload as any)?.accounts || [];
        details = accs.slice(0, 3).map((a: any) =>
          `   • ${a.description}: ${fmt(a.amountCents)}`
        ).join("\n");
      } else if (type === "upcoming_reminder") {
        totalLabel = `R$ ${(group.cents / 100).toFixed(2)}`;
        const accs = (first.payload as any)?.accounts || [];
        details = accs.slice(0, 3).map((a: any) =>
          `   • ${a.description}: ${fmt(a.amountCents)} (${a.daysUntil}d)`
        ).join("\n");
      } else {
        // daily_summary, weekly_summary, etc
        details = (first.message || "").split("\n").slice(1, 4).map((l: string) => `   ${l.trim()}`).join("\n");
        const match = (first.message || "").match(/R\$\s+([\d.,]+)/);
        if (match) totalLabel = `R$ ${match[1]}`;
      }

      return {
        type,
        severity: first.severity,
        count: group.count,
        totalLabel,
        details,
      };
    });

    // Ordena por severidade (urgent primeiro) e trunca por max_items
    groupedItems.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    const truncateByMax = groupedItems.length > maxItems;
    if (truncateByMax) {
      groupedItems.length = maxItems;
    }

    const totalCents = groupedItems.reduce((s, i) => {
      const match = i.totalLabel.match(/[\d,]+/);
      if (!match) return s;
      return s + Math.round(parseFloat(match[0].replace(/\./g, "").replace(",", ".")) * 100);
    }, 0);

    const hasUrgent = groupedItems.some((i) => i.severity === "urgent" || i.severity === "alert");

    // Monta a mensagem
    const lines: string[] = [];
    lines.push(`📨 Você tem ${groupedItems.length} lembrete(s):`);
    lines.push("");

    for (const item of groupedItems) {
      const icon = item.severity === "urgent" ? "🚨"
        : item.severity === "alert" ? "🔴"
        : item.severity === "warning" ? "🔥"
        : "📅";
      const typeLabel: Record<NotificationType, string> = {
        overdue_reminder: "vencida(s)",
        due_today_reminder: "vence(m) hoje",
        upcoming_reminder: "próxima(s)",
        daily_summary: "resumo diário",
        weekly_summary: "resumo semanal",
        card_closing_soon: "fatura fechando",
        limit_alert: "limite",
      };
      lines.push(`${icon} ${item.count} ${typeLabel[item.type] || item.type} — ${item.totalLabel}`);
      if (item.details) {
        lines.push(item.details);
      }
      lines.push("");
    }

    if (truncate) {
      lines.push(`(limitado a ${maxItems} tipos, ${chatItems.length - maxItems} suprimidos)`);
    }

    result.push({
      chatId,
      items: groupedItems,
      totalCount: groupedItems.reduce((s, i) => s + i.count, 0),
      totalCents,
      message: lines.join("\n").trim(),
      hasUrgent,
    });
  }

  return result;
}
