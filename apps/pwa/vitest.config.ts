import { defineConfig } from "vitest/config";
import path from "path";

// Coverage scope = EVERY production TS/TSX file changed in cb57847e..HEAD plus
// uncommitted production changes (the Phase 5 / hardening remediation set), NOT a
// narrow 5-file selection. Each listed file is measured individually and must meet
// >=80% statements/branches/functions/lines. `all: true` guarantees every listed
// file appears in the report (an untested changed file shows 0%, surfacing the gap
// instead of hiding it). Functions threshold is enforced (not dropped).
const CHANGED_PRODUCTION = [
  "src/app/pwa-control/route.ts",
  "src/app/api/observability/rum/route.ts",
  "src/components/NewTransactionSheet.tsx",
  "src/components/RootProviders.tsx",
  "src/components/StatusBar.tsx",
  "src/features/accounts/AccountsPage.tsx",
  "src/features/auth/AuthGate.tsx",
  "src/features/budgets/BudgetsPage.tsx",
  "src/features/cards/CardsPage.tsx",
  "src/features/categories/CategoriesPage.tsx",
  "src/features/goals/GoalsPage.tsx",
  "src/features/payables/PayablesPage.tsx",
  "src/features/profile/NotificationsSheet.tsx",
  "src/features/profile/ProfilePage.tsx",
  "src/features/records/RecordsPage.tsx",
  "src/features/records/components/TransactionEditSheet.tsx",
  "src/features/subscriptions/SubscriptionsPage.tsx",
  "src/lib/api/client.ts",
  "src/lib/api/endpoints.ts",
  "src/lib/observability/web-vitals.ts",
  "src/lib/reset-session.ts",
  "src/lib/session.ts",
  "src/lib/state/app-state-context.tsx",
  "src/lib/state/commands.ts",
  "src/lib/state/profile-adapter.ts",
  "src/lib/state/snapshot-db.ts",
  "src/lib/state/snapshot-store.ts",
  "src/lib/state/state-reducer.ts",
  "src/lib/state/subscriptions-adapter.ts",
  "src/lib/state/sync-engine.ts",
  "src/lib/sw-coordinator.tsx",
  "src/lib/unsaved-changes.tsx",
  "src/middleware.ts",
  "src/proxy-utils.ts",
  "src/sw-matcher.ts",
  "src/sw.ts",
];

// Next's `next build` type-check resolves `vitest/config` to the workspace-root
// vitest (3.2.6), whose `CoverageOptions` lacks the v4 `all`/`perFile` fields. Cast
// to a local interface so Next's tsc accepts the config without weakening runtime
// coverage enforcement (all:true + per-file >=80% thresholds still apply under vitest 4).
interface CoverageConfig {
  provider: "v8";
  reporter: string[];
  all: boolean;
  include: string[];
  exclude: string[];
  perFile: boolean;
  thresholds: {
    perFile: boolean;
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
}

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // threads pool is reliable in this workspace (forks pool hangs under
    // file-parallelism on this environment). The default worker count
    // (all CPUs) triggers "Failed to start threads worker" timeouts on this
    // environment; capping maxWorkers keeps `pnpm test` runnable and stable
    // (P0.5 benchmark A/B: config A = maxWorkers 2, fileParallelism true).
    pool: "threads",
    maxWorkers: 2,
    fileParallelism: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "e2e/**/*.test.{ts,tsx}"],
    exclude: ["e2e/support/matrix.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      all: true,
      include: CHANGED_PRODUCTION,
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/__tests__/**",
        "**/*.config.*",
        "src/test/**",
        "src/env.d.ts",
      ],
      thresholds: {
        perFile: true,
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    } as CoverageConfig,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
