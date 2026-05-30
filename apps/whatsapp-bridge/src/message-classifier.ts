// ─────────────────────────────────────────────────────────────────────────────
// Message Classifier - Classifies WhatsApp messages for TED
// ─────────────────────────────────────────────────────────────────────────────

export type MessageClassification =
  | { type: 'command'; intent: string; params: Record<string, string> }
  | { type: 'financial_detected'; raw: string }
  | { type: 'ignored' }
  | { type: 'clarification_needed'; missingInfo: string[] };

interface ClassifyOptions {
  allowCommands?: string[];
  financialKeywords?: string[];
}

const DEFAULT_COMMANDS = ['gastei', 'recebi', 'transferi', 'paguei', 'relatório', '/'];

const DEFAULT_FINANCIAL_KEYWORDS = [
  'fatura', 'conta', 'cartão', 'saldo', 'valor', 'reais', 'gastei',
  'recebi', 'transferi', 'paguei', 'balanço', 'despesa', 'receita',
];

export function classifyMessage(
  text: string,
  options: ClassifyOptions = {}
): MessageClassification {
  const commands = options.allowCommands ?? DEFAULT_COMMANDS;
  const financialKeywords = options.financialKeywords ?? DEFAULT_FINANCIAL_KEYWORDS;
  
  const normalizedText = text.trim().toLowerCase();

  // Check for explicit command
  for (const cmd of commands) {
    if (cmd.startsWith('/')) {
      if (normalizedText.startsWith(cmd) || normalizedText.startsWith(cmd.split(' ')[0])) {
        return parseCommand(text, cmd);
      }
    } else if (normalizedText.includes(cmd)) {
      return parseFinancialCommand(text, cmd);
    }
  }

  // Check for financial keywords without explicit command
  for (const keyword of financialKeywords) {
    if (normalizedText.includes(keyword)) {
      // Check if it looks like it needs clarification (no account/card specified for expenses)
      const missingInfo = checkMissingInfo(normalizedText);
      if (missingInfo.length > 0) {
        return { type: 'clarification_needed', missingInfo };
      }
      return { type: 'financial_detected', raw: text };
    }
  }

  // Normal conversation - ignore
  return { type: 'ignored' };
}

function parseCommand(text: string, command: string): MessageClassification {
  const cmdName = command.replace('/', '').split(' ')[0];
  
  return {
    type: 'command',
    intent: cmdName,
    params: extractParams(text, cmdName),
  };
}

function parseFinancialCommand(text: string, intent: string): MessageClassification {
  const params: Record<string, string> = {};
  
  // Extract amount if present
  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:reais?|R\$)?/i);
  if (amountMatch) {
    params.amount = amountMatch[1].replace(',', '.');
  }

  // Check for account/card specification
  const accountKeywords = ['conta', 'cartão', 'dinheiro', 'crédito', 'débito'];
  for (const kw of accountKeywords) {
    if (text.toLowerCase().includes(kw)) {
      params.accountType = kw;
      break;
    }
  }

  // Check if missing critical info
  const missingInfo: string[] = [];
  if (intent === 'gastei' || intent === 'paguei') {
    if (!params.accountType && !text.toLowerCase().includes('no')) {
      missingInfo.push('accountId or cardId');
    }
  }

  if (missingInfo.length > 0) {
    return { type: 'clarification_needed', missingInfo };
  }

  return { type: 'command', intent, params };
}

function checkMissingInfo(text: string): string[] {
  const missing: string[] = [];
  
  // Check for expense-like language without account info
  const expenseIndicators = ['gastei', 'paguei', 'despesa'];
  for (const indicator of expenseIndicators) {
    if (text.includes(indicator) && !text.includes('no ') && !text.includes('na ')) {
      missing.push('accountId or cardId');
      break;
    }
  }

  return missing;
}

function extractParams(text: string, _command: string): Record<string, string> {
  const params: Record<string, string> = {};
  const remaining = text.replace(/^\/\w+\s*/, '').trim();

  if (remaining) {
    params.text = remaining;
  }

  // Extract common patterns
  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:reais?|R\$)?/i);
  if (amountMatch) {
    params.amount = amountMatch[1].replace(',', '.');
  }

  return params;
}

/**
 * Generate clarification prompt for missing info
 */
export function generateClarificationPrompt(missingInfo: string[]): string {
  if (missingInfo.includes('accountId or cardId')) {
    return 'Qual conta ou cartão? Informe: dinheiro, conta corrente, ou cartão (e qual).';
  }
  if (missingInfo.includes('amountCents')) {
    return 'Qual o valor? Informe o valor em reais.';
  }
  return `Informações faltando: ${missingInfo.join(', ')}. Pode detalhar?`;
}