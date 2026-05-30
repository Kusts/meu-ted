/**
 * Testkit - minimal helper for test database setup
 * Note: Full Testcontainers integration requires postgres client in scope
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestConnection = any;

/**
 * Clean all tables between tests
 * Usage in tests:
 *   import { cleanDatabase, type TestConnection } from '@pi-financeiro/testkit';
 */
export async function cleanDatabase(connection: TestConnection): Promise<void> {
  await connection.unsafe(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}

/**
 * Factory helper for creating test data
 */
export interface TestFixture {
  householdId?: string;
  userId?: string;
  accountId?: string;
  categoryId?: string;
}

/**
 * Create minimal test household + user for tests
 */
export async function createTestHousehold(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: any,
  overrides?: Partial<{
    name: string;
    phone: string;
  }>
): Promise<TestFixture> {
  const householdId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  
  await connection.unsafe(`
    INSERT INTO households (id, name, currency, timezone)
    VALUES ($1, $2, 'BRL', 'America/Sao_Paulo')
  `, [householdId, overrides?.name ?? 'Test Household']);
  
  await connection.unsafe(`
    INSERT INTO users (id, household_id, name, phone, role)
    VALUES ($1, $2, $3, $4, 'owner')
  `, [userId, householdId, overrides?.phone ?? '+5511999999999']);
  
  return { householdId, userId };
}