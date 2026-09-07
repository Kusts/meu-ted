import type { Skill } from './types.js';

export const memoriaSkill: Skill = {
  name: 'memoria',
  title: 'Memória (lembrar e retomar)',
  when: 'pedir para lembrar algo, perguntar o que foi dito antes ou retomar sessão passada',
  keywords: [
    'lembrar', 'lembre', 'lembra', 'memorize', 'memória', 'memoria',
    'você lembra', 'voce lembra', 'semana passada', 'mês passado', 'mes passado',
    'outro dia', 'sessão passada', 'sessao passada', 'anteriormente',
    'conversamos', 'da última vez', 'da ultima vez', 'retomar', 'antes',
  ],
  tools: ['remember_fact', 'recall', 'list_past_sessions', 'get_session_summary'],
  steps: [
    'Pedido explícito para lembrar ("lembre que..."): grave com remember_fact e confirme em 1 frase.',
    'Pergunta sobre o passado ("o que eu disse sobre..."): busque com recall antes de responder.',
    'Retomar sessão antiga: liste com list_past_sessions e leia o resumo com get_session_summary.',
    'O bloco MEMÓRIA DO USUÁRIO no seu contexto já traz os itens mais relevantes — cite-os naturalmente.',
  ],
  pitfalls: [
    'Nunca diga que lembra de algo sem ter recall ou memória injetada que prove.',
    'Nunca grave segredos, senhas ou números de cartão — a tool recusa sozinha.',
  ],
};
