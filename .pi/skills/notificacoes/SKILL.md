---
name: notificacoes
description: Sistema de notificações proativas por WhatsApp. Configura lembretes de contas a pagar (vencidas, hoje, próximas), resumos diário/semanal, com horário e dia da semana personalizáveis. Idempotente.
version: 1
created: 2026-08-01
updated: 2026-08-01
---

# Skill: Notificações Proativas

## When to Use

Use esta skill SEMPRE que o usuário quiser:
- "me lembra das contas todo dia às 8h"
- "quero um resumo semanal"
- "avisa quando uma conta vencer"
- "me manda um aviso 3 dias antes do vencimento"

## Conceitos

### Tipos de Notificação

| Tipo | Quando | Conteúdo |
|------|--------|----------|
| `overdue_reminder` | Diariamente | Lista contas vencidas |
| `due_today_reminder` | Diariamente | Contas que vencem HOJE |
| `upcoming_reminder` | Diariamente | Contas nos próximos N dias |
| `daily_summary` | Diariamente | Saldo + receitas/despesas do dia + próximas |
| `weekly_summary` | Semanal (1×) | Resumo da semana + contas a pagar |
| `card_closing_soon` | Diariamente | Faturas prestes a fechar |
| `limit_alert` | Evento | Limite do cartão |

### Configuração por Chat

Cada configuração é por `chat_id` (conversa do WhatsApp):
- `enabled`: on/off
- `schedule_hour`/`schedule_minute`: hora do dia (0-23)
- `days_of_week`: `[1,2,3,4,5]` = seg-sex (0=dom, 6=sáb)
- `threshold_days`: para `upcoming_reminder`
- `threshold_percent`: para `limit_alert`

### Idempotência

- `last_sent_at`: timestamp do último envio
- Não envia novamente no mesmo dia (para resumos)
- Horário exato: tolera 5 min após

### Agrupamento (default ON)

Por padrão, múltiplas notificações do mesmo chat são agrupadas em **1 mensagem**:
- 5 vencidas + 1 vence hoje + 1 próxima = 1 mensagem com 3 seções
- Ordenado por severidade (urgent > alert > warning > info)
- Respeita `grouping_max_items` (default 5)
- Mostra "X suprimidos" se exceder

**Configuração por notificação**:
- `grouping_enabled`: on/off
- `grouping_max_items`: tipos máximos (1-20)
- `grouping_window_minutes`: janela de agrupamento (5-1440)

**Exemplo de mensagem agrupada**:
```
📨 Você tem 3 lembrete(s):

🚨 1 vencida(s) — R$ 300.00
   • Test Vencida 1: R$ 100.00
   • Test Vencida 2: R$ 100.00
   • Test Vencida 3: R$ 100.00

🔥 1 vence(m) hoje — R$ 200.00
   • Test Hoje 1: R$ 100.00
   • Test Hoje 2: R$ 100.00

📅 1 próxima(s) — R$ 100.00
   • Test 5d: R$ 100.00 (5d)

(limitado a 3 tipos, 1 suprimidos)
```

## Fluxo de Decisão

```
Usuário pede lembrete/notificação
       ↓
+--------------------------+
| Quando quer ser avisado? |
+--------------------------+
       ↓
+--------------------------+
| O que quer ser avisado?  |---vencidas---> overdue_reminder
+--------------------------+
       |                    ---vence hoje--> due_today_reminder
       |                    ---3 dias antes-> upcoming_reminder
       |                    ---todo dia---> daily_summary
       |                    ---semana-----> weekly_summary
       ↓
configure_notification(type, schedule)
```

## Procedure

### 1. Configurar notificação

```typescript
// Lembrete de vencidas todo dia às 9h
await configure_notification({
  chatId: "5511999999999",
  notificationType: "overdue_reminder",
  scheduleHour: 9,
  groupingMaxItems: 3,  // agrupa até 3 tipos
});

// Resumo diário às 8h
await configure_notification({
  chatId: "5511999999999",
  notificationType: "daily_summary",
  scheduleHour: 8,
});

// Lembrete 3 dias antes do vencimento, às 10h
await configure_notification({
  chatId: "5511999999999",
  notificationType: "upcoming_reminder",
  scheduleHour: 10,
  thresholdDays: 3,
});

// Resumo semanal segunda às 7h
await configure_notification({
  chatId: "5511999999999",
  notificationType: "weekly_summary",
  scheduleHour: 7,
  daysOfWeek: [1],
});
```

### 2. Listar / Editar / Remover

```typescript
// Listar todas
await list_notifications({});

// Remover
await delete_notification({ chatId, notificationType: "daily_summary" });
```

### 3. Processar pendentes (Cron)

```typescript
// A cada minuto (ou a cada 5 min)
await process_notifications({});
```

Retorna lista de notificações prontas. O envio real fica na camada WhatsApp.

### 4. Testar sem enviar

```typescript
// Preview
await test_notification({ notificationType: "overdue_reminder" });
```

## Integração com WhatsApp

O `process_notifications` retorna o JSON com `chatId`, `message`, `severity`. A camada externa:

1. Recebe o retorno
2. Para cada item, envia a mensagem para o `chatId`
3. Marca como entregue no banco (opcional)

Exemplo (pseudocódigo):
```typescript
const result = await process_notifications({});
for (const n of result.notifications) {
  await whatsappClient.sendMessage(n.chatId, n.message);
}
```

## Cron Job (recomendado)

A cada minuto:
```bash
* * * * * curl -X POST http://localhost:3000/process-notifications
```

Ou usando node-cron:
```typescript
cron.schedule("* * * * *", async () => {
  await process_notifications({});
});
```

## Exemplos de Mensagens

### overdue_reminder
```
🚨 1 CONTA(S) VENCIDA(S) — total R$ 100.00
```

### due_today_reminder
```
🔥 2 conta(s) vence(m) HOJE — total R$ 250.00
```

### upcoming_reminder
```
📅 3 conta(s) nos próximos 3 dia(s) — total R$ 350.00
```

### daily_summary
```
📊 Bom dia! Saldo: R$ 2.500.00
💰 Receitas hoje: R$ 0.00
💸 Despesas hoje: R$ 95.00
📅 3 conta(s) a pagar nos próximos 7 dias: R$ 300.00
```

### weekly_summary
```
📅 Semana 24:
💰 Receitas: R$ 10.500.00
💸 Despesas: R$ 963.57
📊 Saldo: R$ 9.536.43
📌 2 conta(s) a pagar: R$ 200.00
```

## Pitfalls

- ❌ **NÃO** chamar `process_notifications` mais de 1× por minuto (overhead)
- ❌ **NÃO** confiar em horário do cliente; usar horário do servidor
- ❌ **NÃO** usar `last_sent_at` como envio; é idempotência
- ✅ **SEMPRE** configurar `schedule_hour` para evitar envios constantes
- ✅ **SEMPRE** usar `dryRun: true` para debugar
- ✅ **SEMPRE** configurar `daysOfWeek` para weekly_summary
- ✅ **SEMPRE** respeitar timezone do usuário (futuro)

## Arquivos

| Arquivo | Função |
|---------|--------|
| `tools/notifications.ts` | Helpers (build, shouldSend, log) |
| `tools/notification_tools.ts` | 6 tools expostas |
| `scripts/apply-notifications.ts` | Migração schema |

## Schema

```sql
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY,
  household_id UUID,
  chat_id TEXT,
  notification_type TEXT,  -- enum
  enabled BOOLEAN,
  schedule_hour SMALLINT,  -- 0-23
  schedule_minute SMALLINT,  -- 0-59
  days_of_week SMALLINT[],  -- [0-6]
  threshold_days SMALLINT,
  threshold_percent SMALLINT,
  grouping_enabled BOOLEAN DEFAULT true,
  grouping_max_items SMALLINT DEFAULT 5,
  grouping_window_minutes SMALLINT DEFAULT 30,
  last_sent_at TIMESTAMPTZ,
  UNIQUE (household_id, chat_id, notification_type)
);

CREATE TABLE notification_log (
  id UUID PRIMARY KEY,
  household_id UUID,
  chat_id TEXT,
  notification_type TEXT,
  title TEXT,
  message TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ,
  delivered BOOLEAN,
  read_at TIMESTAMPTZ,
  source TEXT  -- 'auto' | 'manual' | 'triggered'
);
```

## Validação (18/18 testes)

### Sistema base (10/10)
1. shouldSendNotification: lógica de horário, dia da semana, idempotência
2. configure_notification: criar 4 tipos + UPSERT
3. list_notifications: 4 configurações listadas
4. build: overdue/dueToday/upcoming/daily/weekly
5. process (dry run): 3 notificações
6. process (real): 3 enviadas + logadas
7. get_notification_log: histórico
8. test_notification: preview sem enviar
9. Idempotência: 1ª=3, 2ª=0, 3ª=0
10. delete_notification: remover

### Agrupamento (8/8)
1. configure com groupingMaxItems: 5 settings
2. seed 7 contas (3 vencidas + 2 hoje + 1 5d + 1 7d)
3. process (grouped=true): 5 notifications → 2 chats (1 mensagem por chat)
4. process (grouped=false): 5 notifications → 5 individuais
5. groupNotifications lógica: 3 types diferentes, ordenados por severidade
6. Mesmo tipo aparece 2x: agrupa em 1 item com count=2
7. Respeita grouping_max_items=2: 4 notifications → 2 items + "2 suprimidos"
8. Idempotência com agrupamento: 1ª=2 chats, 2ª=0, 3ª=0
