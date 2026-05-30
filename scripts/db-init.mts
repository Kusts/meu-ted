// Database initialization script
// Run with: pnpm db:init

import { createClient } from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://pi_financeiro:pi_financeiro_dev_secret@localhost:5432/pi_financeiro';

async function initDatabase() {
  // First connect to default postgres db to create our database
  const adminClient = createClient({
    connectionString: DATABASE_URL.replace(/\/pi_financeiro$/, '/postgres'),
    max: 1,
  });

  await adminClient.connect();

  try {
    await adminClient.unsafe('CREATE DATABASE pi_financeiro');
    console.log('✅ Database pi_financeiro created');
  } catch (error: any) {
    if (error?.code === '42P04') {
      console.log('ℹ️  Database pi_financeiro already exists');
    } else {
      throw error;
    }
  }

  await adminClient.end();

  // Now connect to our database and run migrations
  const client = createClient({ connectionString: DATABASE_URL, max: 1 });
  await client.connect();

  // Create schema
  await client.unsafe(`
    CREATE SCHEMA IF NOT EXISTS pi_financeiro;
    SET search_path TO pi_financeiro;
  `);

  console.log('✅ Schema initialized');

  await client.end();
  console.log('✅ Database initialization complete');
}

initDatabase().catch((error) => {
  console.error('❌ Database initialization failed:', error);
  process.exit(1);
});