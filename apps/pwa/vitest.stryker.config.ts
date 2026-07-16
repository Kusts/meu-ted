import { defineConfig } from "vitest/config";
import path from "path";

// Focused config used by Stryker — only the test files that exercise the
// module under mutation (src/lib/state/snapshot-db.ts). Keeps per-mutant
// runtime fast while still validating every mutant.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
    // Sequential files (reliable in this workspace; avoids the forks/file-parallel
    // worker hang). Used only by Stryker per-mutant runs.
    fileParallelism: false,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/lib/state/commands.test.ts",
      "src/lib/state/profile-adapter.test.ts",
      "src/lib/state/subscriptions-adapter.test.ts",
      "src/lib/state/snapshot-db.test.ts",
      "src/lib/state/sync-engine.test.ts",
      "src/lib/state/__tests__/snapshot-store.test.ts",
      "src/lib/state/__tests__/integration-v2.test.ts",
      "src/lib/state/__tests__/app-state-context.test.tsx",
      "src/lib/session.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
