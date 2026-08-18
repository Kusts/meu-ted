import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';

const contract = JSON.parse(await readFile('apps/api/openapi/agent-tools.openapi.json', 'utf8'));
const source = async (file) => readFile(file, 'utf8');
const operation = (name) => {
  for (const pathItem of Object.values(contract.paths)) {
    for (const candidate of Object.values(pathItem)) {
      for (const tool of [candidate['x-pi-tool'], ...(candidate['x-pi-tools'] ?? [])]) {
        if ((tool?.name ?? candidate.operationId) === name) {
          if (tool?.parameters) return tool;
          const bodySchema = candidate.requestBody?.content?.['application/json']?.schema;
          const parameters = [...(candidate.parameters ?? []), ...Object.entries(bodySchema?.properties ?? {}).map(([parameterName, schema]) => ({ name: parameterName, in: 'body', required: bodySchema.required?.includes(parameterName) ?? false, schema }))];
          return { ...candidate, name, parameters };
        }
      }
    }
  }
  throw new Error(`missing contract ${name}`);
};

function schemaFields(text, schemaName) {
  const section = text.match(new RegExp(`${schemaName}\\s*=\\s*z\\.object\\(\\{([\\s\\S]*?)\\}\\)`))?.[1];
  assert.ok(section, `missing authoritative schema ${schemaName}`);
  return [...section.matchAll(/^\s*(\w+)\s*:\s*([^,\n]+)/gm)].map((match) => ({ name: match[1], required: !match[2].includes('.optional()') }));
}

for (const [name, schemaName, file] of [
  ['create_account', 'createAccountInputSchema', 'apps/api/src/writes/types.ts'],
  ['create_category', 'createCategoryInputSchema', 'apps/api/src/writes/types.ts'],
  ['create_expense', 'createExpenseInputSchema', 'apps/api/src/writes/types.ts'],
  ['create_income', 'createIncomeInputSchema', 'apps/api/src/writes/types.ts'],
  ['create_transfer', 'createTransferInputSchema', 'apps/api/src/writes/types.ts'],
  ['create_goal', 'createGoalSchema', 'apps/api/src/routes/goals.ts'],
  ['contribute_to_goal', 'contributeSchema', 'apps/api/src/routes/goals.ts'],
  ['create_card_purchase', 'cardPurchaseSchema', 'apps/api/src/routes/cards.ts'],
  ['create_card_installments', 'cardInstallmentsSchema', 'apps/api/src/routes/cards.ts'],
  ['create_payable_template', 'payableTemplateSchema', 'apps/api/src/routes/payables.ts'],
  ['configure_notification', 'notificationSchema', 'apps/api/src/routes/payables.ts'],
]) {
  it(`${name} matches the authoritative API schema ${schemaName}`, async () => {
    const fields = schemaFields(await source(file), schemaName);
    const body = operation(name).parameters.filter((parameter) => parameter.in === 'body');
    assert.deepEqual(body.map((parameter) => parameter.name), fields.map((field) => field.name));
    assert.deepEqual(body.map((parameter) => parameter.required), fields.map((field) => field.required));
  });
}

it('preserves array schemas from the notification API contract', () => {
  const days = operation('configure_notification').parameters.find((parameter) => parameter.name === 'daysOfWeek');
  assert.equal(days?.schema.type, 'array');
  assert.equal(days?.schema.items.type, 'integer');
});

it('checks method, path, placement and requiredness for every generated operation', async () => {
  const generated = await readFile('.pi/extensions/financial-tools/generated/http-tools.ts', 'utf8');
  const operations = Object.entries(contract.paths).flatMap(([routePath, pathItem]) => Object.entries(pathItem).flatMap(([method, candidate]) => [
    ...(candidate['x-pi-tool'] ? [{ ...candidate, tool: candidate['x-pi-tool'], method, routePath }] : []),
    ...(candidate['x-pi-tools'] ?? []).map((tool) => ({ ...candidate, tool, method, routePath })),
  ]));
  assert.equal(operations.length, 44);
  for (const candidate of operations) {
    const name = candidate.tool.name ?? candidate.operationId;
    const block = generated.match(new RegExp(`\\n    "name": "${name}"([\\s\\S]*?)(?=\\n    "name": |\\n\\] as const)`))?.[0] ?? '';
    assert.match(block, new RegExp(`"method": "${candidate.tool.method ?? candidate.method.toUpperCase()}"`));
    assert.match(block, new RegExp(`"path": "${(candidate.tool.path ?? candidate.routePath).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"`));
    const properties = generated.match(new RegExp(`  "${name}": Type\\.Object\\(\\{([\\s\\S]*?)(?=\\n  "[a-z_]+": Type\\.Object|\\n  \\} as const)`))?.[0] ?? '';
    for (const parameter of candidate.tool.parameters ?? candidate.parameters ?? []) {
      assert.match(block, new RegExp(`"name": "${parameter.name}"`), `${name}.${parameter.name}`);
      assert.match(properties, new RegExp(`"${parameter.name}":`), `${name}.${parameter.name} generated schema`);
      if (parameter.required) assert.doesNotMatch(properties, new RegExp(`"${parameter.name}": Type\\.Optional`), `${name}.${parameter.name} required`);
    }
  }
  assert.match(generated, /const headers = Object\.fromEntries/);
});
