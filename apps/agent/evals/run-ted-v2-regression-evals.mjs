import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));
const source = resolve(directory, 'ted-v2-regression-matrix.json');
const scenarios = JSON.parse(await readFile(source, 'utf8'));
const categories = new Set(['route', 'tool', 'arguments', 'confirmation', 'grounding', 'execution']);
const decisions = new Set(['allow', 'deny', 'ask_confirmation', 'ask_clarification', 'grounding_required', 'retry']);

const fail = (message) => { throw new Error(`TED V2 eval matrix: ${message}`); };
if (!Array.isArray(scenarios) || scenarios.length < 50) fail('requires at least 50 scenarios');
if (new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length) fail('scenario ids must be unique');
for (const scenario of scenarios) {
  if (!/^TEDV2-\d{3}$/.test(scenario.id)) fail(`invalid id ${scenario.id}`);
  if (!categories.has(scenario.category)) fail(`invalid category for ${scenario.id}`);
  if (!decisions.has(scenario.expected?.decision)) fail(`invalid decision for ${scenario.id}`);
  if (!['none', 'at_most_one_mutation'].includes(scenario.expected?.sideEffects)) fail(`invalid side effect bound for ${scenario.id}`);
  if (scenario.expected?.llm !== 'not_required') fail(`LLM is prohibited in deterministic eval ${scenario.id}`);
  if (!scenario.invariant || scenario.invariant.trim().length < 11) fail(`missing invariant for ${scenario.id}`);
}
console.log(`TED V2 deterministic evals passed: ${scenarios.length} scenarios across ${categories.size} categories.`);
