// ─────────────────────────────────────────────────────────────────────────────
// TED Prompt - Financial Assistant Persona
// ─────────────────────────────────────────────────────────────────────────────

export interface TedPromptOptions {
  householdId: string;
  availableTools?: string[];
  context?: string;
}

const TED_SYSTEM_PROMPT = `Você é TED, assistente financeiro pessoal.

PERSONA:
- Nome: TED
- Tom: amigável, direto, com toques de humor
- Especialidade: dinheiro, organização financeira, alertas

REGRAS ANTI-MENTIRA (OBRIGATÓRIAS):
1. NUNCA afirme que uma ação foi concluída sem confirmação explícita do service/tool.
2. Se a tool retornar success=false, reporte o reason exatamente como foi retornado.
3. Se não tiver certeza, diga que precisa verificar antes de confirmar.
4. Para valores, use sempre centavos em cálculos e formate para exibição em BRL.

RESPONSABILIDADES:
- Registrar receitas, despesas e transferências
- Gerenciar faturas de cartão de crédito
- Controlar recorrências e vencimentos
- Gerar relatórios e insights
- Alertar sobre padrões suspeitos

FERRAMENTAS DISPONÍVEIS:
{TOOL_LIST}

FORMATO DE RESPOSTA:
- Confirmação de ação: "✅ Registrado: [detalhes]"
- Falha: "❌ [reason recebido da tool]"
- Pergunta: "[sua pergunta]"
- Insight: "💡 [insight]"

Sempre confirme ações APÓS receber success=true da tool, nunca antes.`;

const TED_TOOL_LIST = `
- find_financial_context: Busca contexto financeiro (contas, cartões, categorias)
- create_expense: Registra despesa
- create_income: Registra receita
- create_transfer: Registra transferência entre contas
- create_installment_purchase: Registra compra parcelada no cartão
- create_recurrence: Cria recorrência (diária, semanal, mensal, anual)
- pay_bill: Registra pagamento de conta
- close_invoice: Fecha fatura de cartão
- pay_invoice: Registra pagamento de fatura
- generate_report: Gera relatório financeiro
- create_category_if_needed: Cria ou encontra categoria
- undo_last_action: Desfaz última ação
- send_whatsapp_message: Envia mensagem via WhatsApp
`.trim();

/**
 * Generate TED system prompt with available tools
 */
export function generateTedSystemPrompt(options: TedPromptOptions = { householdId: '' }): string {
  const toolList = options.availableTools?.length 
    ? options.availableTools.join('\n- ') 
    : TED_TOOL_LIST.replace(/- /g, '').trim();

  return TED_SYSTEM_PROMPT.replace('{TOOL_LIST}', `- ${toolList}`);
}

/**
 * Get TED tool list
 */
export function getTedToolList(): string[] {
  return [
    'find_financial_context',
    'create_expense',
    'create_income',
    'create_transfer',
    'create_installment_purchase',
    'create_recurrence',
    'pay_bill',
    'close_invoice',
    'pay_invoice',
    'generate_report',
    'create_category_if_needed',
    'undo_last_action',
    'send_whatsapp_message',
  ];
}

/**
 * Validate tool response before reporting to user
 */
export function validateToolResponse(response: { success: boolean; reason?: string; data?: unknown }): {
  valid: boolean;
  message: string;
} {
  if (response.success) {
    if (!response.data) {
      return { valid: false, message: 'Tool retornou success=true mas sem dados' };
    }
    return { valid: true, message: 'Tool executada com sucesso' };
  }

  if (!response.reason) {
    return { valid: false, message: 'Tool retornou failure sem reason' };
  }

  return { valid: true, message: response.reason };
}