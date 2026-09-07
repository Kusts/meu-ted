import type { Skill } from './types.js';
import { registrosSkill } from './registros.js';
import { saldoExtratoSkill } from './saldo-extrato.js';
import { categoriasSkill } from './categorias.js';
import { orcamentosMetasSkill } from './orcamentos-metas.js';
import { relatoriosSkill } from './relatorios.js';
import { contasCartoesSkill } from './contas-cartoes.js';
import { compromissosSkill } from './compromissos.js';
import { workspaceSkill } from './workspace.js';
import { webSearchSkill } from './web-search.js';
import { memoriaSkill } from './memoria.js';

export type { Skill };
export { renderSkillBody } from './types.js';

export {
  registrosSkill,
  saldoExtratoSkill,
  categoriasSkill,
  orcamentosMetasSkill,
  relatoriosSkill,
  contasCartoesSkill,
  compromissosSkill,
  workspaceSkill,
  webSearchSkill,
  memoriaSkill,
};

export const ALL_SKILLS: readonly Skill[] = [
  registrosSkill,
  saldoExtratoSkill,
  categoriasSkill,
  orcamentosMetasSkill,
  relatoriosSkill,
  contasCartoesSkill,
  compromissosSkill,
  workspaceSkill,
  webSearchSkill,
  memoriaSkill,
];

export const skillByName = (name: string): Skill | undefined =>
  ALL_SKILLS.find((skill) => skill.name === name);

/** One-line catalog entries (`- name: when`) for the system prompt. */
export const skillCatalogLines = (): string[] => ALL_SKILLS.map((skill) => `${skill.name}: ${skill.when}`);
