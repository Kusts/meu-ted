import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://pi_financeiro:pi_financeiro_dev_secret@localhost:5432/pi_financeiro',
  },
} satisfies Config;