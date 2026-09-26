/**
 * M4 canonical converter CLI (tsx, same shape as the sibling job scripts).
 *
 *   pnpm convert:canonical          # full pipeline (backup gate required)
 *   pnpm convert:canonical:dry      # plan only, read-only, no backup gate
 *
 * Flags: --dry-run, --backup-id=<id> (feeds BACKUP_ID without mutating the
 * caller's environment), --help/-h. JSON report on stdout.
 *
 * Gates: a real run requires the backup gate (BACKUP_CONFIRMED=true +
 * BACKUP_ID) and, outside production, the test-database guard. Exit 0 on
 * completed/noop (and on a GO dry-run), 1 when the conversion fails or the
 * dry-run plan is NO-GO, 2 on usage/environment errors.
 */

import { createPool } from '../../db/pool.js';
import { requireTestDatabase } from '../../db/db-guard.js';
import { isBackupGateSatisfied } from '../migration-job-policy.js';
import { runCanonicalConversion } from './convert.js';

export type ConvertCliArgs = {
  dryRun: boolean;
  backupId?: string | undefined;
};

export const parseConvertArgs = (argv: string[]): ConvertCliArgs | { help: true } => {
  const args: ConvertCliArgs = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--backup-id=')) {
      const value = arg.slice('--backup-id='.length).trim();
      if (!value) throw new Error('empty --backup-id');
      args.backupId = value;
    } else if (arg === '--backup-id') {
      const value = argv[i + 1]?.trim();
      if (!value) throw new Error('missing value for --backup-id');
      args.backupId = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
};

export const printConvertHelp = (): string =>
  [
    'canonical-convert — legacy to canonical conversion pipeline (M4)',
    '',
    'Usage: canonical-convert [--dry-run] [--backup-id=<id>]',
    '',
    'Runs plan -> archive-and-bootstrap -> auth restore -> import -> identity',
    '-> balances, then records state=completed with a counts summary.',
    '--dry-run executes ONLY the plan (read-only, no backup gate).',
    'A real run requires BACKUP_CONFIRMED=true and BACKUP_ID (or --backup-id).',
    'Exit 0 on completed/noop (or GO dry-run), 1 on conversion failure or',
    'NO-GO dry-run, 2 on usage/environment errors.',
  ].join('\n');

export const main = async (
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<number> => {
  let args: ConvertCliArgs;
  try {
    const parsed = parseConvertArgs(argv);
    if ('help' in parsed) {
      process.stdout.write(`${printConvertHelp()}\n`);
      return 0;
    }
    args = parsed;
  } catch (error) {
    process.stderr.write(`error: ${(error as Error).message}\n${printConvertHelp()}\n`);
    return 2;
  }
  const connectionString = env.DATABASE_URL?.trim() || env.DATABASE_URL_TEST?.trim();
  if (!connectionString) {
    process.stderr.write('error: DATABASE_URL (or DATABASE_URL_TEST) is not set; nothing to do.\n');
    return 2;
  }
  const effectiveEnv: Record<string, string | undefined> = { ...env };
  if (args.backupId !== undefined) effectiveEnv.BACKUP_ID = args.backupId;
  if (!args.dryRun && !isBackupGateSatisfied(effectiveEnv)) {
    process.stderr.write('error: backup gate not satisfied: BACKUP_CONFIRMED=true and BACKUP_ID (or --backup-id) are required.\n');
    return 2;
  }
  const pool = createPool({ connectionString, max: 4 });
  try {
    if (effectiveEnv.NODE_ENV !== 'production') {
      try {
        await requireTestDatabase(pool, 'canonical-convert');
      } catch (error) {
        process.stderr.write(`error: ${(error as Error).message}\n`);
        return 2;
      }
    }
    try {
      const report = await runCanonicalConversion(pool, { dryRun: args.dryRun, env: effectiveEnv });
      // FINDING-2: balances travel as bigint (exact past 2^53-1);
      // serialize them as decimal strings so the report stays valid JSON.
      process.stdout.write(
        `${JSON.stringify(report, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
      );
      if (args.dryRun && !report.plan.ready) return 1;
      return 0;
    } catch (error) {
      process.stderr.write(`canonical conversion failed: ${(error as Error).message}\n`);
      return 1;
    }
  } finally {
    await pool.end();
  }
};

const invokedAsCli =
  process.argv[1] !== undefined && /canonical-convert\.(ts|js)$/.test(process.argv[1]);

if (invokedAsCli) {
  void main(process.argv.slice(2), process.env as Record<string, string | undefined>).then((code) => {
    process.exitCode = code;
  });
}
