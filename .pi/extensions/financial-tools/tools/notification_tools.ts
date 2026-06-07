/**
 * notification_tools — Tools para gestão de notificações
 *
 * 6 tools:
 * - configure_notification: cria/atualiza configuração
 * - list_notifications: lista configurações
 * - delete_notification: remove configuração
 * - process_notifications: processa pendentes (deve ser chamado por cron)
 * - get_notification_log: histórico de notificações enviadas
 * - test_notification: testa notificação (envia imediatamente)
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  buildNotification,
  markNotificationSent,
  logNotification,
  processPendingNotifications,
  shouldSendNotification,
  type NotificationType,
  type NotificationMessage,
} from "./notifications.js";

const HOUSEHOLD_DEFAULT = process.env.HOUSEHOLD_ID || "550e8400-e29b-41d4-a716-446655440000";
const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

/**
 * configure_notification
 */
export const configureNotification: ToolDefinition = {
  name: "configure_notification",
  description: "Cria ou atualiza configuração de notificação para um chat.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    chatId: Type.String(),
    notificationType: Type.Union([
      Type.Literal("overdue_reminder"),
      Type.Literal("due_today_reminder"),
      Type.Literal("upcoming_reminder"),
      Type.Literal("daily_summary"),
      Type.Literal("weekly_summary"),
      Type.Literal("card_closing_soon"),
      Type.Literal("limit_alert"),
    ]),
    enabled: Type.Optional(Type.Boolean()),
    scheduleHour: Type.Optional(Type.Integer({ minimum: 0, maximum: 23 })),
    scheduleMinute: Type.Optional(Type.Integer({ minimum: 0, maximum: 59 })),
    daysOfWeek: Type.Optional(Type.Array(Type.Integer({ minimum: 0, maximum: 6 }))),
    thresholdDays: Type.Optional(Type.Integer({ minimum: 0, maximum: 90 })),
    thresholdPercent: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      // UPSERT
      const result = await pool.query<{ rows: any[] }>(
        `INSERT INTO notification_settings
         (household_id, chat_id, notification_type, enabled,
          schedule_hour, schedule_minute, days_of_week, threshold_days, threshold_percent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (household_id, chat_id, notification_type)
         DO UPDATE SET
           enabled = COALESCE(EXCLUDED.enabled, notification_settings.enabled),
           schedule_hour = COALESCE(EXCLUDED.schedule_hour, notification_settings.schedule_hour),
           schedule_minute = COALESCE(EXCLUDED.schedule_minute, notification_settings.schedule_minute),
           days_of_week = COALESCE(EXCLUDED.days_of_week, notification_settings.days_of_week),
           threshold_days = COALESCE(EXCLUDED.threshold_days, notification_settings.threshold_days),
           threshold_percent = COALESCE(EXCLUDED.threshold_percent, notification_settings.threshold_percent),
           updated_at = NOW()
         RETURNING *`,
        [
          householdId, params.chatId, params.notificationType,
          params.enabled ?? true,
          params.scheduleHour ?? null,
          params.scheduleMinute ?? 0,
          params.daysOfWeek ?? null,
          params.thresholdDays ?? null,
          params.thresholdPercent ?? null,
        ]
      );

      const s = result.rows[0];
      const lines: string[] = [];
      lines.push(`✅ Notificação "${params.notificationType}" configurada`);
      if (s.schedule_hour !== null) {
        lines.push(`   ⏰ Horário: ${String(s.schedule_hour).padStart(2, "0")}:${String(s.schedule_minute).padStart(2, "0")}`);
      }
      if (s.days_of_week && s.days_of_week.length > 0) {
        const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        lines.push(`   📅 Dias: ${s.days_of_week.map((d: number) => dayNames[d]).join(", ")}`);
      }
      if (s.threshold_days !== null) {
        lines.push(`   ⏳ Threshold: ${s.threshold_days} dia(s)`);
      }
      if (s.threshold_percent !== null) {
        lines.push(`   📊 Threshold: ${s.threshold_percent}%`);
      }

      return {
        success: true,
        settingId: s.id,
        chatId: s.chat_id,
        notificationType: s.notification_type,
        enabled: s.enabled,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * list_notifications
 */
export const listNotifications: ToolDefinition = {
  name: "list_notifications",
  description: "Lista configurações de notificação ativas.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    chatId: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const filters: string[] = ["household_id = $1"];
      const values: any[] = [householdId];

      if (params.chatId) {
        values.push(params.chatId);
        filters.push(`chat_id = $${values.length}`);
      }

      const result = await pool.query<{ rows: any[] }>(
        `SELECT * FROM notification_settings
         WHERE ${filters.join(" AND ")}
         ORDER BY chat_id, notification_type`,
        values
      );

      const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const lines: string[] = [];
      lines.push(`📋 ${result.rows.length} configuração(ões):\n`);

      for (const s of result.rows) {
        const status = s.enabled ? "✅" : "⏸️";
        lines.push(`${status} ${s.notification_type} (chat: ${s.chat_id.slice(0, 8)}...)`);
        if (s.schedule_hour !== null) {
          lines.push(`   ⏰ ${String(s.schedule_hour).padStart(2, "0")}:${String(s.schedule_minute).padStart(2, "0")}`);
        }
        if (s.days_of_week && s.days_of_week.length > 0) {
          lines.push(`   📅 ${s.days_of_week.map((d: number) => dayNames[d]).join(", ")}`);
        }
        if (s.threshold_days !== null) {
          lines.push(`   ⏳ ${s.threshold_days} dia(s)`);
        }
        if (s.threshold_percent !== null) {
          lines.push(`   📊 ${s.threshold_percent}%`);
        }
        if (s.last_sent_at) {
          lines.push(`   Última: ${new Date(s.last_sent_at).toLocaleString()}`);
        }
        lines.push("");
      }

      return {
        success: true,
        total: result.rows.length,
        settings: result.rows,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * delete_notification
 */
export const deleteNotification: ToolDefinition = {
  name: "delete_notification",
  description: "Remove configuração de notificação.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    settingId: Type.Optional(Type.String()),
    chatId: Type.Optional(Type.String()),
    notificationType: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      if (!params.settingId && (!params.chatId || !params.notificationType)) {
        return { success: false, error: "missing_id_or_combo" };
      }

      let result: any;
      if (params.settingId) {
        result = await pool.query(
          `DELETE FROM notification_settings WHERE id = $1 AND household_id = $2 RETURNING id`,
          [params.settingId, householdId]
        );
      } else {
        result = await pool.query(
          `DELETE FROM notification_settings
           WHERE household_id = $1 AND chat_id = $2 AND notification_type = $3
           RETURNING id`,
          [householdId, params.chatId, params.notificationType]
        );
      }

      if (result.rows.length === 0) {
        return { success: false, error: "not_found" };
      }
      return {
        success: true,
        deletedId: result.rows[0].id,
        message: `✅ Configuração removida`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * process_notifications
 *
 * Processa todas as notificações pendentes. Deve ser chamado por:
 * - Cron job (a cada minuto)
 * - Trigger após operações
 * - Manual (teste)
 *
 * Por enquanto, retorna o que SERIA enviado (não envia).
 * A integração com WhatsApp fica na camada externa (TED).
 */
export const processNotifications: ToolDefinition = {
  name: "process_notifications",
  description: "Processa notificações pendentes. Retorna lista que deve ser enviada (envio fica na camada externa).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    dryRun: Type.Optional(Type.Boolean()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const now = new Date();

      // Filtra por household
      const settings = await pool.query<{ rows: any[] }>(
        `SELECT * FROM notification_settings
         WHERE enabled = true AND household_id = $1`,
        [householdId]
      );

      const toSend: Array<{ setting: any; notification: NotificationMessage }> = [];
      const skipped: Array<{ setting: any; reason: string }> = [];

      for (const setting of settings.rows) {
        // Checar horário e idempotência
        const check = shouldSendNotification(setting, now);
        if (!check.shouldSend) {
          skipped.push({ setting, reason: check.reason });
          continue;
        }

        // Construir notificação
        const notification = await buildNotification(pool, setting);
        if (!notification) continue;  // nada a notificar

        toSend.push({ setting, notification });
      }

      // Marca como enviado e loga (a menos que dryRun)
      if (!params.dryRun) {
        for (const item of toSend) {
          await markNotificationSent(pool, item.setting.id);
          await logNotification(pool, item.setting, item.notification, "auto");
        }
      }

      return {
        success: true,
        dryRun: params.dryRun || false,
        count: toSend.length,
        skippedCount: skipped.length,
        skippedReasons: skipped.map((s) => ({
          type: s.setting.notification_type,
          reason: s.reason,
        })),
        notifications: toSend.map((item) => ({
          chatId: item.setting.chat_id,
          type: item.notification.type,
          title: item.notification.title,
          message: item.notification.message,
          severity: item.notification.severity,
          payload: item.notification.payload,
        })),
        message: toSend.length === 0
          ? "Nenhuma notificação pendente no momento"
          : `🔔 ${toSend.length} notificação(ões) pronta(s) para envio`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * get_notification_log
 */
export const getNotificationLog: ToolDefinition = {
  name: "get_notification_log",
  description: "Retorna histórico de notificações enviadas.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    notificationType: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const filters: string[] = ["household_id = $1"];
      const values: any[] = [householdId];

      if (params.notificationType) {
        values.push(params.notificationType);
        filters.push(`notification_type = $${values.length}`);
      }

      const result = await pool.query<{ rows: any[] }>(
        `SELECT id, chat_id, notification_type, title, message, sent_at, source
         FROM notification_log
         WHERE ${filters.join(" AND ")}
         ORDER BY sent_at DESC
         LIMIT $${values.length + 1}`,
        [...values, params.limit || 20]
      );

      const lines: string[] = [];
      lines.push(`📜 ${result.rows.length} notificação(ões) no histórico:\n`);

      for (const n of result.rows) {
        lines.push(`🔔 ${n.notification_type} — ${new Date(n.sent_at).toLocaleString()}`);
        lines.push(`   ${n.message.replace(/\n/g, "\n   ")}`);
        lines.push("");
      }

      return {
        success: true,
        total: result.rows.length,
        log: result.rows,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * test_notification
 *
 * Constrói e retorna uma notificação sem marcá-la como enviada.
 * Útil para preview/teste.
 */
export const testNotification: ToolDefinition = {
  name: "test_notification",
  description: "Gera preview de uma notificação sem enviá-la (teste).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    notificationType: Type.Union([
      Type.Literal("overdue_reminder"),
      Type.Literal("due_today_reminder"),
      Type.Literal("upcoming_reminder"),
      Type.Literal("daily_summary"),
      Type.Literal("weekly_summary"),
    ]),
    thresholdDays: Type.Optional(Type.Integer({ minimum: 0, maximum: 90 })),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const fakeSetting = {
        id: "test",
        household_id: householdId,
        chat_id: "test",
        notification_type: params.notificationType as NotificationType,
        enabled: true,
        schedule_hour: null,
        schedule_minute: 0,
        days_of_week: null,
        threshold_days: params.thresholdDays ?? null,
        threshold_percent: null,
        last_sent_at: null,
      };

      const notification = await buildNotification(pool, fakeSetting);

      return {
        success: true,
        hasContent: !!notification,
        notification: notification || null,
        message: notification
          ? `🔮 Preview: ${notification.message}`
          : "📭 Nenhum conteúdo para notificar",
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
