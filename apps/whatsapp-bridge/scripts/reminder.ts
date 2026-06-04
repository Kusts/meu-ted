// ─────────────────────────────────────────────────────────────────────────────
// Weekly reminder script
// Reads household finances and sends a summary via WhatsApp.
// Run manually:  pnpm reminder
// Or via Task Scheduler:  pnpm reminder
// ─────────────────────────────────────────────────────────────────────────────

import { loadEnv } from '../src/env.js';
import { EvolutionClient } from '../src/evolution-client.js';
import { RealDataProvider } from './data-provider.js';
import { formatWeeklySummary } from './formatter.js';

/**
 * Build the week label string from showDays.
 * e.g. showDays=7 → "semana 27/05 a 03/06"
 */
function buildWeekLabel(showDays: number): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - showDays);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  return `semana ${start.toLocaleDateString('pt-BR', opts)} a ${now.toLocaleDateString('pt-BR', opts)}`;
}

async function main(): Promise<void> {
  // Load .env from cwd upward
  loadEnv(process.cwd());

  const targetChatId = process.env.REMINDER_TARGET_CHAT_ID;
  if (!targetChatId) {
    console.error('[reminder] ERRO: REMINDER_TARGET_CHAT_ID não definido');
    process.exit(1);
  }

  const householdId = process.env.REMINDER_HOUSEHOLD_ID ?? 'default';
  const showDays = Math.max(1, parseInt(process.env.REMINDER_SHOW_DAYS ?? '7', 10));

  console.log(`[reminder] Coletando dados — household=${householdId}, dias=${showDays}`);

  const provider = new RealDataProvider();
  const data = await provider.getWeeklyData(householdId, showDays);

  const weekLabel = buildWeekLabel(showDays);
  const message = formatWeeklySummary(data, weekLabel);

  console.log(`[reminder] Mensagem montada:\n${message}\n---`);

  // Send via Evolution
  const client = new EvolutionClient({
    baseUrl: process.env.EVOLUTION_GO_API_URL ?? 'http://localhost:4000',
    instanceToken: process.env.EVOLUTION_GO_INSTANCE_TOKEN ?? '',
  });

  await client.sendText({ number: targetChatId, text: message });

  console.log(`[reminder] Enviado com sucesso para ${targetChatId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[reminder] ERRO:', err instanceof Error ? err.message : err);
  process.exit(1);
});
