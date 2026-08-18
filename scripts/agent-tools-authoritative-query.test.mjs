import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';

const contract = JSON.parse(await readFile('apps/api/openapi/agent-tools.openapi.json', 'utf8'));
const get = (name) => {
  for (const item of Object.values(contract.paths)) for (const operation of Object.values(item)) {
    for (const tool of [operation['x-pi-tool'], ...(operation['x-pi-tools'] ?? [])]) {
      if ((tool?.name ?? operation.operationId) === name) {
        const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
        const bodyParameters = Object.entries(bodySchema?.properties ?? {}).map(([parameterName, schema]) => ({
          name: parameterName,
          in: 'body',
          required: bodySchema.required?.includes(parameterName) ?? false,
          schema,
        }));
        return [...(operation.parameters ?? []), ...bodyParameters, ...(tool?.parameters ?? [])]
          .filter((parameter, index, all) => all.findIndex((candidate) => candidate.name === parameter.name) === index);
      }
    }
  }
  throw new Error(name);
};
const names = (name) => get(name).filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name).filter((name) => name !== 'householdId');

it('matches authoritative audit query fields and constraints', () => {
  assert.deepEqual(names('audit_logs'), ['limit', 'entityType', 'entityId', 'operation', 'eventType', 'actorType']);
  const params = get('audit_logs');
  assert.deepEqual(params.find((p) => p.name === 'limit').schema, { type: 'integer', minimum: 1, maximum: 100, default: 20 });
  assert.deepEqual(params.find((p) => p.name === 'actorType').schema.enum, ['device', 'user']);
  assert.equal(params.find((p) => p.name === 'entityType').schema.minLength, 1);
});

it('matches authoritative account/category query enums and create inputs', () => {
  assert.deepEqual(get('list_accounts').find((p) => p.name === 'kind').schema.enum, ['bank', 'cash', 'credit_card']);
  assert.deepEqual(get('list_categories').find((p) => p.name === 'kind').schema.enum, ['expense', 'income']);
  assert.equal(get('create_account').some((parameter) => parameter.name === 'force'), false);
  assert.equal(get('create_category').some((parameter) => parameter.name === 'force'), false);
});

it('matches authoritative transaction filter query coverage and bounds', () => {
  assert.deepEqual(names('list_recent_transactions'), ['limit', 'offset', 'accountId', 'startDate', 'endDate', 'categoryId', 'kind', 'minAmountCents', 'maxAmountCents', 'query']);
  const params = get('list_recent_transactions');
  assert.deepEqual(params.find((p) => p.name === 'kind').schema.enum, ['expense', 'income', 'transfer']);
  assert.equal(params.find((p) => p.name === 'limit').schema.default, 50);
  assert.equal(params.find((p) => p.name === 'offset').schema.maximum, 100000);
});

it('matches authoritative card statement filters and update optionality', () => {
  assert.deepEqual(names('list_statements'), ['accountId', 'status', 'limit']);
  assert.deepEqual(get('list_statements').find((p) => p.name === 'status').schema.enum, ['open', 'closed', 'paid', 'partial', 'overdue', 'cancelled']);
  assert.equal(get('list_statements').find((p) => p.name === 'limit').schema.maximum, 50);
  const updateName = get('update_account').find((p) => p.name === 'name');
  assert.equal(updateName.required, false);
});

it('matches authoritative endpoint coverage for account balance and payable queries', () => {
  const balance = get('get_balance');
  assert.equal(balance.find((parameter) => parameter.name === 'accountId').in, 'path');
  assert.deepEqual(names('list_accounts_payable'), ['status', 'type', 'dueWithinDays']);
  assert.deepEqual(get('list_accounts_payable').find((parameter) => parameter.name === 'status').schema.enum, ['pending', 'paid', 'overdue', 'cancelled']);
  assert.equal(get('list_accounts_payable').find((parameter) => parameter.name === 'dueWithinDays').schema.maximum, 365);
  assert.deepEqual(names('list_goals'), []);
  assert.deepEqual(names('list_budgets'), []);
  assert.deepEqual(names('list_notifications'), []);
  assert.deepEqual(names('list_payable_templates'), []);
  assert.deepEqual(names('check_payable_reminders'), []);
  assert.equal(get('mark_account_paid').find((parameter) => parameter.name === 'payableId').in, 'path');
  assert.equal(get('mark_account_paid').find((parameter) => parameter.name === 'prepayMonths').schema.maximum, 24);
});

it('preserves authoritative transaction and insight constraints', () => {
  const operation = Object.values(contract.paths).flatMap((item) => Object.values(item)).find((candidate) => candidate.operationId === 'create_expense');
  const expense = operation.requestBody.content['application/json'].schema.properties;
  assert.equal(expense.amountCents.minimum, 1);
  assert.deepEqual(expense.description, { type: 'string', minLength: 1, maxLength: 240 });
  assert.equal(get('spending_insights').find((parameter) => parameter.name === 'yearMonth').schema.pattern, String.raw`^\d{4}-\d{2}$`);
});
