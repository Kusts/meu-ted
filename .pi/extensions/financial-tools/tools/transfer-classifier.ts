/**
 * transfer-classifier â€” Determines if a transaction is:
 * 1. Internal transfer (between own accounts) â†’ create_transfer
 * 2. Outgoing to third party â†’ create_expense
 * 3. Incoming from third party â†’ create_income
 */

import type { TransferMethod } from "./transfer-parser.js";

export type TransferType = "internal" | "outgoing_third" | "incoming_third" | "ambiguous";

export interface AccountInfo {
  id: string;
  name: string;
  /** Lowercase name with accents removed for matching */
  name_normalized: string;
}

export interface ClassifyResult {
  type: TransferType;
  method: TransferMethod;
  recipientName: string | null;
  fromAccount: AccountInfo | null;
  toAccount: AccountInfo | null;
  /** When type is ambiguous, a clarifying question to ask the user */
  clarifyingQuestion: string | null;
}

const OWN_ACCOUNT_KEYWORDS = [
  "carteira", "nubank", "itaÃº", "itau", "bradesco", "santander", "caixa",
  "banco do brasil", "inter", "picpay", "mercado pago", "conta corrente",
  "poupanÃ§a", "poupanca", "investimento",
];

const INCOMING_KEYWORDS = [
  "recebi", "recebeu", "caiu", "chegou", "entrou", "veio", "depÃ³sito", "deposito",
  "transferÃªncia recebida", "pix recebido", "pix de", "ted de",
];

const OUTGOING_KEYWORDS = [
  "paguei", "mandei", "enviei", "gastei", "transferi pra", "transferi para", "transferi pro",
  "pix pra", "pix para", "pix pro", "ted pra", "ted para", "ted pro",
  "doc pra", "doc para", "fiz um pix", "fiz uma transferÃªncia", "fiz transferencia",
];

const INTERNAL_KEYWORDS = [
  "movi", "movei", "transferi da", "transferi de", "transferi do", "transfira do",
  "mova do", "mova da", "entre contas",
];

/**
 * Normalize a string for matching: lowercase, remove accents, remove punctuation.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
    // Note: do NOT remove stopwords here, we need them for pattern matching
}

/**
 * Find an account mentioned in the message by name.
 * Returns the account info if found, else null.
 */
export function findAccountInMessage(
  message: string,
  accounts: AccountInfo[]
): AccountInfo | null {
  const norm = normalizeText(message);
  for (const acc of accounts) {
    if (norm.includes(acc.name_normalized)) {
      return acc;
    }
  }
  return null;
}

/**
 * Find all accounts mentioned in the message.
 */
export function findAllAccountsInMessage(
  message: string,
  accounts: AccountInfo[]
): AccountInfo[] {
  const norm = normalizeText(message);
  return accounts.filter((acc) => norm.includes(acc.name_normalized));
}

/**
 * Classify a transfer message.
 *
 * @param message - The user's message (raw text)
 * @param accounts - List of household accounts
 * @param description - Optional structured description (when the agent has already parsed it)
 * @returns Classification result
 */
export function classifyTransfer(
  message: string,
  accounts: AccountInfo[],
  description?: string
): ClassifyResult {
  const text = (description ?? message).trim();
  const norm = normalizeText(text);
  const lower = text.toLowerCase();

  // Detect method (use the parser's logic, but inline here to avoid circular dep)
  let method: TransferMethod = "PIX";
  if (/\bted\b/i.test(text)) method = "TED";
  else if (/\bdoc\b/i.test(text)) method = "DOC";
  else if (/\b(transferencia|transferÃªncia)\b/i.test(lower)) method = "TRANSFER";
  else if (/\b(dinheiro|especie|em m[Ã£a]o)\b/i.test(lower)) method = "CASH";

  // Extract recipient name (simple version, can be refined)
  const recipientName = extractSimpleRecipient(text);

  // Check for INTERNAL transfer markers
  const isInternal = INTERNAL_KEYWORDS.some((k) => norm.includes(normalizeText(k)));
  const isIncoming = INCOMING_KEYWORDS.some((k) => norm.includes(normalizeText(k)));
  const isOutgoing = OUTGOING_KEYWORDS.some((k) => norm.includes(normalizeText(k)));

  // Find accounts mentioned
  const mentionedAccounts = findAllAccountsInMessage(text, accounts);

  // DECISION LOGIC
  // 1. If explicit "movi" or "entre contas" or 2+ accounts mentioned with "de"/"pra"
  if (isInternal || mentionedAccounts.length >= 2) {
    // Determine from/to based on order in the message
    // "do X pra Y" or "do X pro Y" â†’ from=X, to=Y
    let fromAcc: AccountInfo | null = null;
    let toAcc: AccountInfo | null = null;
    const fromToMatch = text.match(/(?:de|da|do)\s+(\w+).*?(?:pra|pro|para|â†’|->)\s+(\w+)/i);
    if (fromToMatch) {
      const fromName = normalizeText(fromToMatch[1]);
      const toName = normalizeText(fromToMatch[2]);
      fromAcc = accounts.find((a) => a.name_normalized === fromName) ?? null;
      toAcc = accounts.find((a) => a.name_normalized === toName) ?? null;
    }
    // Fallback to mentionedAccounts order (avoid picking the same account for from and to)
    if (!fromAcc) fromAcc = mentionedAccounts[0] ?? null;
    if (!toAcc) {
      // Pick a different account than from
      const candidate = mentionedAccounts[1] ?? mentionedAccounts.find((a) => a.id !== fromAcc?.id) ?? null;
      toAcc = candidate;
    }

    return {
      type: "internal",
      method: method === "PIX" && mentionedAccounts.length >= 2 ? "TRANSFER" : method,
      recipientName: null,
      fromAccount: fromAcc,
      toAccount: toAcc,
      clarifyingQuestion: !fromAcc || !toAcc
        ? "TransferÃªncia entre quais contas? (ex: do Nubank para Carteira)"
        : null,
    };
  }

  // 2. If "recebi" or incoming keywords + 1 account
  if (isIncoming && !isOutgoing) {
    return {
      type: "incoming_third",
      method,
      recipientName,
      fromAccount: null,
      toAccount: mentionedAccounts[0] ?? null,
      clarifyingQuestion: mentionedAccounts.length === 0
        ? "Qual conta recebeu? (Nubank, ItaÃº, etc.)"
        : null,
    };
  }

  // 3. If "paguei", "mandei", or outgoing keywords + 1 account
  if (isOutgoing || (!isIncoming && (recipientName || method !== "PIX" || /\b(pra|para)\s+\w+/i.test(text)))) {
    return {
      type: "outgoing_third",
      method,
      recipientName,
      fromAccount: mentionedAccounts[0] ?? null,
      toAccount: null,
      clarifyingQuestion: mentionedAccounts.length === 0
        ? "De qual conta saiu? (Nubank, ItaÃº, etc.)"
        : null,
    };
  }

  // 4. Ambiguous: ask user
  return {
    type: "ambiguous",
    method,
    recipientName,
    fromAccount: mentionedAccounts[0] ?? null,
    toAccount: null,
    clarifyingQuestion: "Ã‰ uma transferÃªncia entre contas prÃ³prias (mover dinheiro) ou para/de terceiro (pagar/receber)?",
  };
}

/**
 * Simple recipient extraction (subset of the full parser).
 */
export function extractSimpleRecipient(text: string): string | null {
  // Try "PIX/TED/DOC/Transfer [Name] - motivo" first
  const m = text.match(/^(?:PIX|TED|DOC|TRANSFER(?:ÊNCIA|ENCIA)?|DINHEIRO|CAIXA)\s+([A-Za-z\u00C0-\u00FF][^-]+?)(?:\s*[-–—]\s*.*)?$/i);
  if (m && m[1]) {
    let name = m[1].trim();
    name = name.replace(/^(para|pra|à|a)\s+/i, "");
    name = name.replace(/\s+(para|pra)\s+\w+\s*$/i, "");
    // Filter stopwords
    const STOPWORDS_RECIPIENT = [
      "aluguel", "conta", "compra", "pagamento", "salário", "salario",
      "nubank", "itau", "itaú", "carteira", "bradesco", "santander", "caixa", "banco",
    ];
    if ([...name].length >= 2 && !STOPWORDS_RECIPIENT.includes(name.toLowerCase())) {
      return name;
    }
  }
  // Try "pro X", "pra X", "para X", "de X", "da X" (common prefix words)
  const m2 = text.match(/(?:pro|pra|para|à|a|de|da|do)\s+([A-Z\u00C0-\u00DF][A-Za-z\u00C0-\u00FF\s]+?)(?:\s+de\s+|\s+no\s+|\s*[-–—,]|\s+\d|$)/i);
  if (m2 && m2[1]) {
    let name = m2[1].trim();
    // Filter out generic words and own-account keywords
    const STOPWORDS_RECIPIENT = [
      "aluguel", "conta", "compra", "pagamento", "salário", "salario",
      "pix", "ted", "doc", "nubank", "itau", "itaú", "carteira", "bradesco", "santander", "caixa", "banco", "inter", "picpay", "mercado pago",
    ];
    const lowerName = name.toLowerCase();
    if ([...name].length >= 2 && !STOPWORDS_RECIPIENT.includes(lowerName)) {
      return name;
    }
  }
  return null;
}

/**
 * Get a human-readable summary of the classification.
 */
export function formatClassification(c: ClassifyResult): string {
  const { type, method, fromAccount, toAccount, recipientName } = c;
  const fmt = (acc: AccountInfo | null) => acc?.name ?? "?";

  if (type === "internal") {
    return `TransferÃªncia interna (${method}): ${fmt(fromAccount)} â†’ ${fmt(toAccount)}`;
  }
  if (type === "outgoing_third") {
    return `Envio para terceiro (${method}): de ${fmt(fromAccount)} para ${recipientName ?? "?"}`;
  }
  if (type === "incoming_third") {
    return `Recebimento de terceiro (${method}): ${recipientName ?? "?"} â†’ ${fmt(toAccount)}`;
  }
  return `AmbÃ­guo: preciso de mais contexto`;
}

/**
 * Determine which category to use for outgoing/incoming third-party transfers.
 */
export function getCategoryNameForTransfer(type: TransferType, method: TransferMethod): string {
  if (type === "internal") {
    return ""; // No category for internal transfers
  }
  if (type === "incoming_third") {
    return method === "PIX" ? "TransferÃªncia > PIX Recebido" : `TransferÃªncia > ${method} Recebido`;
  }
  if (type === "outgoing_third") {
    return `TransferÃªncia > ${method}`;
  }
  return "Outros";
}
