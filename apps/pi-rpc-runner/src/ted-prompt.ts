// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - TED Prompt Builder
// Constructs prompts with persona, context, and anti-lie rules
// ─────────────────────────────────────────────────────────────────────────────

export interface TedPromptOptions {
  userMessage: string;
  householdId: string;
  source?: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  senderPhone?: string;
  groupId?: string;
  idempotencyKey?: string;
  accounts?: Array<{
    id: string;
    name: string;
    type: string;
    balanceCents: number;
  }>;
  recentTransactions?: Array<{
    date: string;
    description: string;
    amountCents: number;
  }>;
  pendingRecurrences?: number;
}

interface AccountContext {
  id: string;
  name: string;
  type: string;
  balanceCents: number;
}

/**
 * Build TED prompt with persona, context, and rules
 */
export function buildTedPrompt(options: TedPromptOptions): string {
  const {
    userMessage,
    householdId: _householdId,
    source = 'dashboard',
    senderPhone,
    groupId,
    idempotencyKey,
    accounts = [],
    recentTransactions = [],
    pendingRecurrences,
  } = options;

  // Build persona section
  const personaSection = buildPersona();

  // Build context section
  const contextSection = buildContext({
    source,
    senderPhone,
    groupId,
    accounts,
    recentTransactions,
    pendingRecurrences,
  });

  // Build rules section
  const rulesSection = buildRules();

  // Build user message
  const messageSection = buildMessage(userMessage, idempotencyKey, source);

  // Combine all sections
  return [
    personaSection,
    contextSection,
    rulesSection,
    messageSection,
  ].filter(Boolean).join('\n\n');
}

function buildPersona(): string {
  return `Você é TED, o agente financeiro da família.

Sua personalidade:
- Nome: TED (The Economic Dashboard - mas pode chamar só de TED)
- Tom: amigável, engraçado, inteligente, prestativo
- Especialidade: dinheiro, organização financeira, alertas, conselhos práticos
- Autonomia: insights, avisos, padrões, orientações - mas só confirma ações após a tool responder success
- Segurança: NUNCA diz que fez algo sem confirmação da tool/service
- Humor: piadas leves no momento certo, nunca sarcasmo

Você está no Brasil, timezone America/Sao_Paulo, moeda BRL, centavos inteiros.`;
}

function buildContext(ctx: {
  source: string;
  senderPhone?: string;
  groupId?: string;
  accounts: AccountContext[];
  recentTransactions: Array<{ date: string; description: string; amountCents: number }>;
  pendingRecurrences?: number;
}): string {
  const lines: string[] = [];

  // Source context
  if (ctx.source === 'whatsapp') {
    lines.push('Contexto: mensagem via WhatsApp');
    if (ctx.senderPhone) {
      lines.push(`Telefone: ${ctx.senderPhone}`);
    }
    if (ctx.groupId) {
      lines.push(`Grupo: ${ctx.groupId}`);
    }
  } else if (ctx.source === 'cron') {
    lines.push('Contexto: execução automática via cron');
    lines.push('Objetivo: manutenção de recorrências e faturas');
  } else if (ctx.source === 'dashboard') {
    lines.push('Contexto: usuário via dashboard admin');
  }

  // Accounts context
  if (ctx.accounts.length > 0) {
    lines.push('\nContas disponíveis:');
    for (const account of ctx.accounts) {
      const balance = (account.balanceCents / 100).toFixed(2);
      const type = account.type === 'credit_card' ? 'Cartão' : 'Conta';
      lines.push(`- ${account.name} (${type}): R$ ${balance}`);
    }
  }

  // Recent transactions
  if (ctx.recentTransactions.length > 0) {
    lines.push('\nTransações recentes:');
    for (const tx of ctx.recentTransactions.slice(0, 5)) {
      const amount = (tx.amountCents / 100).toFixed(2);
      const sign = tx.amountCents >= 0 ? '+' : '';
      lines.push(`- ${tx.date}: ${tx.description} R$ ${sign}${amount}`);
    }
  }

  // Pending recurrences
  if (ctx.pendingRecurrences !== undefined && ctx.pendingRecurrences > 0) {
    lines.push(`\nPendências: ${ctx.pendingRecurrences} recorrência(s) para processar`);
  }

  return lines.join('\n');
}

function buildRules(): string {
  return `Regras CRÍTICAS:

1. ANTI-MENTIRA: Você NUNCA deve dizer que fez algo, criou algo, transferiu algo, etc.
   SEMPRE espere a confirmação da tool/service com { success: true }.
   Se a tool falhar, diga que houve um problema e sugira retry.

2. IDEMPOTÊNCIA: Se receber idempotencyKey, use para evitar duplicidades.
   Se a key já foi processada, retorne o resultado anterior.

3. VALIDAÇÃO: Sempre valide todos os campos antes de chamar tools.
   Amount deve ser positivo, dates devem ser válidas.

4. DUPLICIDADE: Se detectar possível duplicata (mesmo valor, descrição similar, janela curta),
   peça confirmação antes de criar.

5. VALOR ALTO: Se valor > R$500, peça confirmação antes de processar.

6. CONVERSÃO: Sempre use centavos inteiros (amountCents) para valores.
   Exemplo: R$87,40 = 8740 cents.

7. CATEGORIAS: Antes de criar categoria, verifique se já existe similar.
   Use normalizedName para comparação.

8. CONVERSAS NORMAIS: Se a mensagem não for uma ação financeira,
   responda de forma amigável mas não registre nada.`;
}

function buildMessage(
  userMessage: string,
  idempotencyKey?: string,
  source: TedPromptOptions['source'] = 'dashboard'
): string {
  let message = `Mensagem do usuário:\n"${userMessage}"`;

  if (idempotencyKey) {
    message += `\n\nIdempotencyKey: ${idempotencyKey}`;
  }

  if (source === 'whatsapp') {
    message += '\n\nO que você deve fazer? responda em texto natural para WhatsApp, curto e claro. Não responda em JSON, Markdown com bloco de código, ou formato técnico. Se precisar executar ação financeira, explique o que precisa confirmar ou o resultado em linguagem humana.';
  } else {
    message += '\n\nO que você deve fazer? Responda em JSON com ação e parâmetros, ou responda amigavelmente se não for ação financeira.';
  }

  return message;
}

/**
 * Format currency for display (BRL with thousand separators)
 */
export function formatCurrency(cents: number): string {
  const value = Math.abs(cents);
  const str = value.toString();
  const dec = str.slice(-2).padStart(2, '0');
  const int = str.slice(0, -2);
  
  // Add thousand separators (reverse, insert '.', reverse back)
  const formatted = int.split('').reverse().map((c, i) => 
    i > 0 && i % 3 === 0 ? c + '.' : c
  ).reverse().join('');
  
  const sign = cents < 0 ? '-' : '';
  return `${sign}${formatted || '0'},${dec}`;
}

/**
 * Parse currency input to cents
 */
export function parseCurrency(input: string): number | null {
  // Remove R$, spaces, and convert comma to dot
  const cleaned = input
    .replace(/R\$\s?/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const value = parseFloat(cleaned);
  if (isNaN(value)) return null;

  return Math.round(value * 100);
}