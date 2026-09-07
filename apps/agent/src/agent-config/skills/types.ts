/** Situational skill shape (Part A, item 15). */

export type Skill = {
  /** Stable kebab-case id, also used as the tool→skill map key target. */
  name: string;
  /** Short display title. */
  title: string;
  /** One line for the compact catalog: when this skill applies. */
  when: string;
  /** Lowercase fragments matched against the last user message. */
  keywords: string[];
  /** Generated tool names (plus `web_search`/`web_fetch`) this skill uses. */
  tools: string[];
  /** Ordered procedure the model must follow. */
  steps: string[];
  /** Common mistakes to avoid. */
  pitfalls: string[];
};

export const renderSkillBody = (skill: Skill): string =>
  [
    `# ${skill.title}`,
    `Quando: ${skill.when}`,
    `Passos:\n${skill.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`,
    `Armadilhas:\n${skill.pitfalls.map((pitfall) => `- ${pitfall}`).join('\n')}`,
  ].join('\n');
