/**
 * transfer-parser — Helper para extrair campos estruturados de transferências
 *
 * Detecta automaticamente o método (PIX, TED, DOC, TRANSFER, CASH) e extrai
 * o nome do destinatário a partir da descrição livre.
 */

export type TransferMethod = "PIX" | "TED" | "DOC" | "TRANSFER" | "CASH";

const METHOD_PATTERNS: Array<{ method: TransferMethod; patterns: RegExp[] }> = [
  {
    method: "PIX",
    patterns: [/\bpix\b/i, /\bchave\s*pix\b/i, /\bpix\s*-\s*/i, /\binst(?:ant[eê]neo)?\b/i],
  },
  {
    method: "TED",
    patterns: [/\bted\b/i, /\btransfer[eê]ncia\s*eletrônica\b/i],
  },
  {
    method: "DOC",
    patterns: [/\bdoc\b/i, /\bdocumento\s*de\s*cr[eé]dito\b/i],
  },
  {
    method: "CASH",
    patterns: [/\bdinheiro\b/i, /\bespécie\b/i, /\bcaixa\b/i, /\bem\s*m[ãa]o\b/i],
  },
];

/**
 * Detects the transfer method from a free-form description.
 * Returns the first match found, or null if none detected.
 *
 * Order of priority: PIX > TED > DOC > CASH > TRANSFER
 */
export function detectMethod(description: string): TransferMethod | null {
  for (const { method, patterns } of METHOD_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(description)) {
        return method;
      }
    }
  }
  return null;
}

/**
 * Returns the transfer method. If none detected in the description,
 * returns the provided default (typically "PIX").
 */
export function resolveMethod(
  description: string,
  explicitMethod?: string | null,
  defaultMethod: TransferMethod = "PIX"
): TransferMethod {
  // 1. Explicit parameter takes highest priority
  if (explicitMethod) {
    const upper = explicitMethod.toUpperCase() as TransferMethod;
    if (["PIX", "TED", "DOC", "TRANSFER", "CASH"].includes(upper)) {
      return upper;
    }
  }
  // 2. Auto-detect from description
  const detected = detectMethod(description);
  if (detected) return detected;
  // 3. Default
  return defaultMethod;
}

/**
 * Extracts a recipient name from a free-form description.
 * Tries multiple patterns:
 *   "PIX João Silva - almoço"        → "João Silva"
 *   "TED Aluguel Imobiliária XYZ"    → "Imobiliária XYZ" (after keyword removal)
 *   "DOC Fornecedor ABC Ltda"        → "Fornecedor ABC Ltda"
 *   "Transferência Nubank → Itaú"     → null (between own accounts)
 */
export function extractRecipientName(description: string): string | null {
  const text = description.trim();

  // Common patterns
  const patterns: RegExp[] = [
    // "PIX/TED/DOC/Transfer [Recipient Name] - motivo" (capture before dash)
    /^(?:PIX|TED|DOC|TRANSFER(?:ÊNCIA|ENCIA)?|DINHEIRO|CAIXA)\s+([A-ZÀ-Úa-zà-úÀ-ÿ][^-–—]+)/i,
    // "PIX/TED/DOC X - Recipient" (capture after dash, more specific)
    /^(?:PIX|TED|DOC|TRANSFER(?:ÊNCIA|ENCIA)?|DINHEIRO|CAIXA)\s+[A-ZÀ-Úa-zà-úÀ-ÿ]+\s*[-–—]\s*(.+)$/i,
    // "[Recipient Name] - motivo" (no method keyword)
    /^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-úÀ-ÿ0-9&]+){0,4})\s*[-–—]\s*.+$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Filter out generic words that are likely not recipient names
      const STOPWORDS = ["aluguel", "conta", "compra", "pagamento", "salário", "salario", "nubank", "itau", "itaú", "carteira", "bradesco", "santander", "caixa", "banco", "para", "pra"];
      const words = candidate.toLowerCase().split(/\s+/);
      const hasStopword = STOPWORDS.some((s) => words.includes(s));
      const isInternalPattern = /^(nubank|itau|itaú|bradesco|santander|caixa|banco)\s+(para|pra|->|→)/i.test(candidate);
      if (hasStopword && (words.length <= 3 || isInternalPattern)) {
        continue;
      }
      // Reject very short or generic matches
      if (candidate.length < 3) continue;
      return candidate;
    }
  }
  return null;
}

/**
 * Validates a Brazilian CPF or CNPJ (loose validation - just format).
 */
export function isValidDocument(doc: string): boolean {
  const cleaned = doc.replace(/\D/g, "");
  // CPF: 11 digits, CNPJ: 14 digits
  return cleaned.length === 11 || cleaned.length === 14;
}

/**
 * Formats a document for display (mask).
 */
export function formatDocument(doc: string): string {
  const cleaned = doc.replace(/\D/g, "");
  if (cleaned.length === 11) {
    // CPF: 000.000.000-00
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (cleaned.length === 14) {
    // CNPJ: 00.000.000/0000-00
    return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc;
}

/**
 * Check if a transfer is a "third-party" transfer (between own accounts = false).
 * A third-party transfer is one where the recipient is not one of the household's own accounts.
 * This function is a hint — actual determination requires looking up the recipient account
 * in the household. The tool should call this with the recipient_name and known own accounts.
 */
export function isLikelyThirdParty(description: string, recipientName: string | null): boolean {
  if (!recipientName) return false;
  // Common own-account names that are NOT third parties
  const ownAccountKeywords = [
    "carteira", "conta corrente", "poupança", "poupanca", "investimento",
    "nubank", "itaú", "itau", "bradesco", "santander", "caixa", "banco do brasil",
  ];
  const lower = recipientName.toLowerCase();
  return !ownAccountKeywords.some((k) => lower.includes(k));
}

/**
 * Format a structured transfer summary for display.
 */
export function formatTransferSummary(
  method: TransferMethod,
  amountCents: number,
  recipientName: string | null,
  fromAccountName: string,
  toAccountName: string
): string {
  const amount = `R$ ${(amountCents / 100).toFixed(2)}`;
  if (recipientName) {
    return `${method} ${amount} para ${recipientName} (${fromAccountName} → ${toAccountName})`;
  }
  return `${method} ${amount} (${fromAccountName} → ${toAccountName})`;
}
