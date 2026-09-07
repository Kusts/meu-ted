import type { Skill } from './types.js';

export const categoriasSkill: Skill = {
  name: 'categorias',
  title: 'Categorias (macros e subcategorias)',
  when: 'organizar, criar ou entender categorias e subcategorias de lançamentos',
  keywords: [
    'categoria', 'categorias', 'subcategoria', 'macro', 'classificar', 'organizar',
    'alimentação', 'moradia', 'transporte', 'lazer', 'saúde', 'saude',
  ],
  tools: ['list_categories', 'create_category', 'update_category', 'deactivate_category'],
  steps: [
    'Leia a árvore atual com list_categories (macros com subcategorias aninhadas).',
    'Explique usando nomes ("Alimentação > Mercado"), nunca IDs.',
    'Nova subcategoria: crie vinculada à macro certa (parentId); nova macro só quando nenhuma existente servir.',
    'Renomear reorganiza o histórico junto — avise isso antes de confirmar.',
    'Desativar ou excluir categoria com lançamentos exige destino ou confirmação explícita.',
  ],
  pitfalls: [
    'Não crie categorias duplicadas com nomes parecidos — reuse a existente.',
    'Subcategoria sempre pertence a uma macro; nunca crie sub solta.',
  ],
};
