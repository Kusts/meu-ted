/**
 * Cognitive layer entry point (Part A, item 15).
 *
 * Part B hooks: `CognitiveHooks` reserves every extension point the
 * memory/compaction/learning part will need. Part A only threads
 * `memoryContext` into the prompt — nothing here reads or writes memory.
 */

export { INSTRUCTIONS_VERSION, TED_IDENTITY, TED_GOLDEN_RULE, TED_MUTATION_POLICY, TED_BOUNDARIES, buildSystemPrompt, TED_SYSTEM_PROMPT_LEGACY } from './instructions.js';
export type { SystemPromptInput } from './instructions.js';
export { ALL_SKILLS, skillByName, skillCatalogLines } from './skills/index.js';
export type { Skill } from './skills/index.js';
export { fitSkills, renderInjectedSkills, SKILL_BUDGET_CHARS } from './select-skill.js';
export type { SkillFit } from './select-skill.js';
export { PLAYBOOK_BODY, PLAYBOOK_SUMMARY_TOOLS } from './playbook.js';
export {
  TOOL_DESCRIPTIONS,
  CORE_READ_TOOLS,
  MAX_EXPOSED_TOOLS,
  toolSkillMap,
  toolSkillLines,
  selectToolsFor,
  isExplicitConfirmation,
  hasMutationIntent,
  buildApprovalRequest,
  buildExposedTools,
} from './tools.js';
export type { ToolExecutionContext, ExposedTool } from './tools.js';
export {
  WEB_UNAVAILABLE_MESSAGE,
  WEB_FETCH_TIMEOUT_MS,
  WEB_FETCH_MAX_CHARS,
  WebFetchBlockedError,
  createWebSearchProvider,
  isBlockedFetchHost,
  assertFetchableUrl,
  webFetchUrl,
} from './web.js';
export type { WebSearchProvider, WebSearchResult, WebSearchResultItem, WebEnv, WebFetchResult } from './web.js';

import { buildSystemPrompt, INSTRUCTIONS_VERSION } from './instructions.js';
import { skillCatalogLines } from './skills/index.js';
import { fitSkills, renderInjectedSkills } from './select-skill.js';
import { PLAYBOOK_BODY } from './playbook.js';
import { selectToolsFor, toolSkillLines } from './tools.js';
import { createWebSearchProvider } from './web.js';
import type { WebEnv } from './web.js';

/**
 * Part B extension points. `memoryContext` is the only live slot in
 * Part A (injected verbatim when present); the rest document where
 * Part B will plug session compaction and learning without touching
 * the prompt assembly contract.
 */
export type CognitiveHooks = {
  /** Persistent-memory summary for this workspace (Part B supplies). */
  memoryContext?: string | null;
  /** Reserved: compact the running transcript into memory (Part B). */
  compactSession?: (transcript: string) => Promise<string>;
  /** Reserved: record durable learning from a turn (Part B). */
  learnFromTurn?: (turn: { input: string; output: string }) => Promise<void>;
};

export type AssembledCognition = {
  system: string;
  selectedSkill: string | null;
  injectedAllSkills: boolean;
  toolNames: string[];
  webAvailable: boolean;
  instructionsVersion: string;
};

export const assembleCognition = (
  lastUserMessage: string,
  opts?: { webEnv?: WebEnv; hooks?: CognitiveHooks; skillBudgetChars?: number },
): AssembledCognition => {
  const fit = fitSkills(lastUserMessage, opts?.skillBudgetChars);
  const webAvailable = createWebSearchProvider(opts?.webEnv ?? {}).available;
  const toolNames = selectToolsFor(fit.injected.map((skill) => skill.name));
  const system = buildSystemPrompt({
    skillCatalog: skillCatalogLines(),
    activeSkillBody: renderInjectedSkills(fit),
    playbookBody: PLAYBOOK_BODY,
    toolCatalog: toolSkillLines(),
    webStatusLine: webAvailable
      ? 'disponível via web_search/web_fetch para dados externos atuais.'
      : 'indisponível (sem chave configurada) — responda com os dados do workspace.',
    ...(opts?.hooks?.memoryContext ? { memoryContext: opts.hooks.memoryContext } : {}),
  });
  return {
    system,
    selectedSkill: fit.selected?.name ?? null,
    injectedAllSkills: fit.injectedAll,
    toolNames,
    webAvailable,
    instructionsVersion: INSTRUCTIONS_VERSION,
  };
};
