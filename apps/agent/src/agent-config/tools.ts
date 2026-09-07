/**
 * Tool wiring (Part A, item 15): generated HTTP tools + web tools exposed
 * to the model via AI SDK `tool()` definitions.
 *
 * - Curated subset per turn (`selectToolsFor`): core reads always in,
 *   skill-relevant tools added, hard cap to protect context.
 * - Every exposed tool carries its skill in the prompt catalog
 *   (`toolSkillLines`), so the model knows which skill governs each call.
 * - Mutations execute through the existing safety utils (previously dead
 *   code): `validateActorIntentForMutation` blocks planted calls on
 *   read-only turns, and `requiresApproval` tools need an explicit user
 *   confirmation in the last message before executing.
 * - Capability classes don't change: only the 52 generated tools plus the
 *   two worker-local web tools are exposed (capabilities:check untouched).
 */

import { jsonSchema, tool } from 'ai';
import { generatedHttpTools } from '../generated/http-tools.js';
import { setGlobalApiContext } from '../tools/api-client.js';
import { requiresApproval, validateActorIntentForMutation } from '../safety/tool-approvals.js';
import { ALL_SKILLS } from './skills/index.js';
import {
  WEB_UNAVAILABLE_MESSAGE,
  createWebSearchProvider,
  webFetchUrl,
  type WebEnv,
} from './web.js';

export type ToolExecutionContext = {
  delegatedToken?: string;
  apiOrigin?: string;
  workspaceId: string;
  actorId: string;
  intentionId: string;
  lastUserMessage: string;
  webEnv?: WebEnv;
  fetchImpl?: typeof fetch;
};

export type ExposedTool = {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
};

/** Short human descriptions for the prompt catalog (curated subset). */
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  get_balance: 'saldo total e por conta',
  list_accounts: 'listar contas do workspace',
  create_account: 'criar conta (confirmar dados antes)',
  update_account: 'renomear conta',
  deactivate_account: 'desativar conta (approval, sem lançamentos)',
  list_recent_transactions: 'extrato recente com filtros',
  get_month_summary: 'resumo do mês (receitas, despesas, saldo)',
  spending_insights: 'agregados de gastos por categoria/período',
  budget_trends: 'evolução de orçamentos mês a mês',
  list_categories: 'árvore de categorias (macros e subs)',
  create_category: 'criar macro ou subcategoria',
  update_category: 'renomear/ajustar categoria',
  deactivate_category: 'desativar categoria sem lançamentos',
  create_expense: 'lançar despesa em conta',
  create_income: 'lançar receita em conta',
  update_transaction: 'editar lançamento',
  delete_transaction: 'excluir lançamento',
  create_transfer: 'transferência entre contas',
  detect_duplicate: 'checagem de lançamento duplicado',
  undo_last_action: 'desfazer a última ação do workspace',
  create_card_purchase: 'compra no cartão (à vista ou 1ª parcela)',
  create_card_installments: 'compra parcelada no cartão',
  list_statements: 'faturas dos cartões',
  get_statement_details: 'detalhe de uma fatura',
  pay_statement: 'pagar fatura (approval)',
  create_credit_card_account: 'cadastrar cartão (approval implícito: confirmar dados)',
  list_budgets: 'listar orçamentos',
  check_budgets: 'uso vs teto dos orçamentos',
  create_budget: 'criar orçamento',
  list_goals: 'listar metas e progresso',
  create_goal: 'criar meta',
  contribute_to_goal: 'registrar aporte na meta',
  cancel_goal: 'cancelar meta',
  list_accounts_payable: 'contas a pagar e vencimentos',
  create_account_payable: 'criar conta a pagar',
  mark_account_paid: 'dar baixa (approval)',
  cancel_account_payable: 'cancelar conta a pagar (approval)',
  create_payable_template: 'criar recorrência modelo',
  auto_create_from_templates: 'gerar contas a partir dos modelos',
  refresh_payable_status: 'recalcular status de vencimentos',
  list_payable_templates: 'listar modelos de recorrência',
  check_payable_reminders: 'lembretes de vencimento',
  get_pending_operation: 'ver aprovação pendente do turno',
  confirm_pending_operation: 'confirmar aprovação pendente',
  cancel_pending_operation: 'recusar aprovação pendente',
  list_notifications: 'ver notificações',
  audit_logs: 'trilha de auditoria (leitura)',
  remember_fact: 'guardar fato durável (com pedido)',
  recall: 'buscar na memória do workspace',
  list_past_sessions: 'listar sessões anteriores encerradas',
  get_session_summary: 'ler resumo de sessão anterior',
  web_search: 'busca na web (dados externos atuais)',
  web_fetch: 'ler o conteúdo de uma página',
};

/** Full tool→skill map, derived from skill definitions. */
export const toolSkillMap = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const skill of ALL_SKILLS) {
    for (const toolName of skill.tools) {
      if (!map[toolName]) map[toolName] = skill.name;
    }
  }
  return map;
};

export const toolSkillLines = (): string[] => {
  const map = toolSkillMap();
  return Object.keys(TOOL_DESCRIPTIONS)
    .sort()
    .map((name) => `${name} (${map[name] ?? 'geral'}): ${TOOL_DESCRIPTIONS[name]}`);
};

/** Reads always available to the model. */
export const CORE_READ_TOOLS: readonly string[] = [
  'get_balance',
  'list_accounts',
  'list_recent_transactions',
  'get_month_summary',
  'list_categories',
  'spending_insights',
  'recall',
];

/** Hard cap of exposed tools per turn (context protection). */
export const MAX_EXPOSED_TOOLS = 20;

const generatedByName = (): Map<string, (typeof generatedHttpTools)[number]> => {
  const map = new Map<string, (typeof generatedHttpTools)[number]>();
  for (const toolDef of generatedHttpTools) map.set(toolDef.name, toolDef);
  return map;
};

/**
 * Curated subset for a turn: core reads + tools of the matched skills,
 * capped at MAX_EXPOSED_TOOLS (reads win ties). Order is stable.
 */
export const selectToolsFor = (skillNames: string[]): string[] => {
  const wanted = new Set<string>(CORE_READ_TOOLS);
  for (const skillName of skillNames) {
    const skill = ALL_SKILLS.find((s) => s.name === skillName);
    if (skill) for (const toolName of skill.tools) wanted.add(toolName);
  }
  const ordered = [
    ...CORE_READ_TOOLS.filter((name) => wanted.has(name)),
    ...[...wanted].filter((name) => !CORE_READ_TOOLS.includes(name)).sort(),
  ];
  return ordered.slice(0, MAX_EXPOSED_TOOLS);
};

const CONFIRMATION_RE = /(confirmo|confirmado|pode (fazer|executar|pagar|criar|confirmar)|pode sim|sim, pode|autorizo|autorizado|vai em frente|pode ir|fechado|ok, pode|confirmar)/i;

export const isExplicitConfirmation = (message: string): boolean => CONFIRMATION_RE.test(message ?? '');

/**
 * Backstop against executing mutations the user didn't ask for (the model
 * is also instructed to explain + confirm first). Approval tools additionally
 * need an explicit confirmation (see isExplicitConfirmation).
 */
const MUTATION_INTENT_RE =
  /(cria|criar|lanc|registr|adiciona|edit|corrig|atualiza|exclui|apaga|cancela|paga|pague|marca|baixa|confirm|autoriz|transf|muda|mude|altera|desativ|contribu|orça)/i;

export const hasMutationIntent = (message: string): boolean => MUTATION_INTENT_RE.test(message ?? '');

export const buildApprovalRequest = (toolName: string): Record<string, unknown> => ({
  needsApproval: true,
  tool: toolName,
  message:
    'Esta ação precisa da sua confirmação. Resuma em 1 frase o que será feito ' +
    '(ação, valor e destino) e peça um "pode fazer" explícito antes de chamar a tool de novo.',
});

const sanitizeSchema = (parameters: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(parameters ?? { type: 'object', properties: {} })) as Record<string, unknown>;

/**
 * Builds AI SDK tools bound to a turn context. Reads execute directly;
 * mutations first pass the safety utils (this is their first enforcement
 * point — previously dead code). Web tools resolve availability from env.
 * Worker-local tools (memory/sessions) arrive via `extraTools`.
 */
export const buildExposedTools = (
  toolNames: string[],
  ctx: ToolExecutionContext,
  extraTools?: Record<string, ReturnType<typeof tool>>,
): Record<string, ReturnType<typeof tool>> => {
  const generated = generatedByName();
  const out: Record<string, ReturnType<typeof tool>> = {};
  const webProvider = createWebSearchProvider(ctx.webEnv ?? {}, ctx.fetchImpl ?? fetch);

  for (const name of toolNames) {
    const extra = extraTools?.[name];
    if (extra) {
      out[name] = extra;
      continue;
    }
    if (name === 'web_search') {
      out[name] = tool({
        description: 'Busca na web por informações externas atuais.',
        inputSchema: jsonSchema({
          type: 'object',
          properties: { query: { type: 'string', minLength: 1, maxLength: 300 } },
          required: ['query'],
        }),
        execute: async (params: Record<string, unknown>) => {
          if (!webProvider.available) return { available: false, message: WEB_UNAVAILABLE_MESSAGE, results: [] };
          try {
            return await webProvider.search(String(params.query ?? ''));
          } catch (err) {
            return { available: false, message: 'A busca web falhou agora — sigo com os dados do workspace.', results: [] };
          }
        },
      });
      continue;
    }
    if (name === 'web_fetch') {
      out[name] = tool({
        description: 'Lê o conteúdo de uma página http/https (bloqueia endereços internos).',
        inputSchema: jsonSchema({
          type: 'object',
          properties: { url: { type: 'string', minLength: 1, maxLength: 2000 } },
          required: ['url'],
        }),
        execute: async (params: Record<string, unknown>) => {
          try {
            return await webFetchUrl(String(params.url ?? ''), { fetchImpl: ctx.fetchImpl });
          } catch (err) {
            return { ok: false, message: (err as Error)?.message ?? 'Não consegui ler esta página.' };
          }
        },
      });
      continue;
    }
    const generatedTool = generated.get(name);
    if (!generatedTool) continue;
    out[name] = tool({
      description: generatedTool.description ?? name,
      inputSchema: jsonSchema(sanitizeSchema(generatedTool.parameters)),
      execute: async (params: Record<string, unknown>) => {
        setGlobalApiContext({ delegatedToken: ctx.delegatedToken, apiOrigin: ctx.apiOrigin });
        const isMutating = !CORE_READ_TOOLS.includes(name) && name !== 'web_search' && name !== 'web_fetch' &&
          !['list_', 'get_', 'check_', 'spending_', 'detect_', 'budget_trends', 'audit_'].some((prefix) => name.startsWith(prefix));
        const intent = validateActorIntentForMutation(ctx.lastUserMessage, name, isMutating);
        if (!intent.allowed) {
          return { blocked: true, reason: 'Chamada bloqueada: a mensagem atual é de consulta — mutação exige pedido explícito.' };
        }
        if (requiresApproval(name) && !isExplicitConfirmation(ctx.lastUserMessage)) {
          return buildApprovalRequest(name);
        }
        if (isMutating && !hasMutationIntent(ctx.lastUserMessage)) {
          return { blocked: true, reason: 'Chamada bloqueada: sem intenção de mutação na mensagem atual.' };
        }
        // C-03: the wrapper is the sole issuer of the per-turn mutation
        // attestation, bound to this exact tool. The generated executor
        // denies writes without it (fail-closed for any other call path).
        return generatedTool.execute(params, undefined, undefined, undefined, {
          mutationApproved: true,
          approvedTool: name,
        });
      },
    });
  }
  return out;
};
