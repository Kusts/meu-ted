export type SkillDefinition = Readonly<{
  name: string;
  domains: readonly string[];
  tools: readonly string[];
}>;

/** The router-facing catalog is intentionally small; providers cannot expand it. */
export const SKILL_INVENTORY: readonly SkillDefinition[] = Object.freeze([
  { name: 'financial-analysis', domains: ['accounts', 'transactions', 'cards', 'payables', 'budgets', 'goals'], tools: ['get_balance', 'list_accounts', 'list_transactions', 'list_cards', 'list_payables', 'list_budgets', 'list_goals'] },
  { name: 'financial-mutations', domains: ['transactions', 'cards', 'payables'], tools: ['create_transaction', 'update_transaction', 'delete_transaction', 'pay_card'] },
  { name: 'conversation', domains: ['general', 'memory'], tools: [] },
]);

export const findSkillsFor = (domain: string, mutation = false): readonly SkillDefinition[] =>
  SKILL_INVENTORY.filter((skill) => skill.domains.includes(domain) && (mutation ? skill.name === 'financial-mutations' : skill.name !== 'financial-mutations'));

export const toolsForSkills = (skills: readonly string[]): readonly string[] =>
  [...new Set(SKILL_INVENTORY.filter((skill) => skills.includes(skill.name)).flatMap((skill) => skill.tools))];
