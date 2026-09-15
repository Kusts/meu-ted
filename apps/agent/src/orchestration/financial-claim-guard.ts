/**
 * Fail-closed financial-claim guard (INV-06 remediation).
 *
 * HEURISTIC (documented, deliberately conservative): an `unsupported`-plan
 * turn makes a financial claim when its text contains either
 *
 *  1. a currency-amount pattern — `R$` with digits, `US$`/`$` with digits,
 *     or a spelled-out magnitude (`mil`, `milhão/milhões`, `bilhão`,
 *     `reais`), or
 *  2. a finance noun (saldo, dinheiro, conta, fatura, gasto, receita,
 *     orçamento, despesa, extrato, lançamento, transação, cartão, boleto,
 *     pagamento, investimento, dívida, empréstimo, pix, transferência,
 *     disponível/disponivel…) co-occurring with a claim cue — a possessive
 *     (`meu/minha/meus/minhas`), an assertion verb (`tenho`, `tem`, `possui`,
 *     `afirme`, `diga que`, `fale que`…), or an instruction-override cue
 *     (`ignore`, `instruç…`).
 *
 * Matching is accent- and case-insensitive (folded). The gate is
 * intentionally narrow: ordinary small talk ("bom dia", "quem é você?",
 * "conte uma piada") carries neither signal and still reaches the LLM.
 * Mutation/proposal turns are NEVER intercepted — callers must apply this
 * only on the unsupported/read-less path, after the draft-continuation
 * branch has had its chance to own the turn.
 */
const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const AMOUNT_RE =
  /(r\$\s?[\d.,])|((us)?\$\s?[\d.,])|(\d[\d.,]*\s?(reais|milhao|milhoes|bilhao|bilhoes|mil\b))/;

const FINANCE_NOUN_RE =
  /\b(saldo|dinheiro|conta|contas|fatura|faturas|gasto|gastos|receita|receitas|orcamento|orcamentos|despesa|despesas|extrato|lancamento|transacao|cartao|cartoes|boleto|pagamento|investimento|divida|emprestimo|pix|transferencia|disponivel)\b/;

const CLAIM_CUE_RE =
  /\b(meu|minha|meus|minhas|tenho|tem|tens|possui|possuo|afirme|afirma|diga|fale|fala|ignore|instru)/;

export const makesUnverifiedFinancialClaim = (text: string): boolean => {
  const normalized = fold(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (AMOUNT_RE.test(normalized)) return true;
  return FINANCE_NOUN_RE.test(normalized) && CLAIM_CUE_RE.test(normalized);
};
