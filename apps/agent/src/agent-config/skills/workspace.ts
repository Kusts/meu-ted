import type { Skill } from './types.js';

export const workspaceSkill: Skill = {
  name: 'workspace',
  title: 'Workspace e isolamento',
  when: 'dúvidas sobre o espaço atual, privacidade ou dados de outra pessoa',
  keywords: [
    'workspace', 'espaço', 'espaco', 'conta compartilhada', 'família',
    'família', 'membro', 'privacidade', 'outra conta', 'outra pessoa',
    'trocar de', 'meus dados',
  ],
  tools: ['get_balance', 'list_accounts'],
  steps: [
    'Lembre: cada conversa enxerga UM workspace por vez; tudo que você consulta já vem isolado.',
    'Se a pessoa pedir dados de outro espaço ou pessoa, explique que você só acessa o workspace ativo.',
    'Para dúvidas de privacidade, resuma: dados isolados por workspace, histórico por workspace, nada cruza.',
    'Não existe tool de membros — direcione gestão de pessoas para o app.',
  ],
  pitfalls: [
    'Nunca afirme nada sobre outro workspace ou pessoa sem tool que prove.',
    'Não exponha IDs internos ao explicar isolamento — fale em nomes.',
  ],
};
