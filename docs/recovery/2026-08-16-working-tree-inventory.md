# Working Tree Inventory — 2026-08-16

## Safety boundary

- Inventory count: 565
- Source: `git status --porcelain=v1 --untracked-files=all`.
- Only paths and safe classification metadata are recorded; file contents, secrets, tokens, cookies, passwords, private keys, and database URLs are excluded.
- Existing WIP is preserved. No path is deleted, moved, overwritten, or added to `.gitignore` by this inventory.

## Classification enum

- class: `project-wip`, `generated-artifact`, `tooling`, `documentation`, `temporary`, `secret-sensitive`
- action: `preserve`, `preserve-redacted`, `review`
- owner: `P0` through `P5`.

## Paths

| path | class | owner | action | rationale |
| --- | --- | --- | --- | --- |
| .pi/extensions/financial-tools/index.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/cancel_pending_operation.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/confirm_pending_operation.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/get_pending_operation.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| apps/api/package.json | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/cards/in-memory.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/cards/legacy-postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/cards/postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/cards/store.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/db/pool.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/payables/in-memory.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/payables/postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/payables/store.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/migrate.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/accounts.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/cards.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/dashboard.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/index.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/payables.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/server/index.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/types/domain.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/writes/errors.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/test-app.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/fixture-api/server.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/playwright.config.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/run-ci.sh | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/package.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/app/manifest.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/components/AppShell.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/components/NewTransactionSheet.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/profile/NotificationsSheet.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/profile/ProfilePage.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/reports/ReportsPage.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/client.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/sw-coordinator.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/sw-runtime.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/sw.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/test/setup.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/pi-client-factory.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/webhook-bridge.test.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/webhook-handler.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/tsconfig.json | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| pnpm-lock.yaml | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .github/workflows/ci.yml | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .github/workflows/production-smoke.yml | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .gitleaks.toml | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/16c7685b_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/16c7685b_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/16c7685b_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/16c7685b_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/25c227f8_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/25c227f8_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/25c227f8_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/25c227f8_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/2d773851_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/2d773851_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/2d773851_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/2d773851_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/47769666_reviewer_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/47769666_reviewer_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/47769666_reviewer_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/47769666_reviewer_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/4cf8cef8_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/4cf8cef8_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/4cf8cef8_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/4cf8cef8_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/56728c6d_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/56728c6d_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/56728c6d_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/56728c6d_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/58c48ec3_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/58c48ec3_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/58c48ec3_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/58c48ec3_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/70ffa40e_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/70ffa40e_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/70ffa40e_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/70ffa40e_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/76fe8f35_reviewer_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/76fe8f35_reviewer_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/76fe8f35_reviewer_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/76fe8f35_reviewer_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/788e4fa8_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/788e4fa8_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/788e4fa8_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/788e4fa8_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/9f799599_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/9f799599_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/9f799599_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/9f799599_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/aa503a1e_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/aa503a1e_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/aa503a1e_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/aa503a1e_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/b4d928ec_scout_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/b4d928ec_scout_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/b4d928ec_scout_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/b4d928ec_scout_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/bae1b91c_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/bae1b91c_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/bae1b91c_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/bae1b91c_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/bb9947a5_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/bb9947a5_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/bb9947a5_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/bb9947a5_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/c3254c20_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/c3254c20_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/c3254c20_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/c3254c20_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/d224b4c9_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/d224b4c9_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/d224b4c9_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/d224b4c9_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/f4c148fb_reviewer_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/f4c148fb_reviewer_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/f4c148fb_reviewer_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/f4c148fb_reviewer_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/f9f0df0b_scout_0_input.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/f9f0df0b_scout_0_meta.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/f9f0df0b_scout_0_output.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/f9f0df0b_scout_0_transcript.jsonl | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/artifacts/outputs/f9f0df0b/context.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/3708e8af-327f-4dd0-9053-5815e15e09c2.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/3cc87745-48cf-4c85-91e0-bb949e78cc4e.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/51e97e11-75dd-4f6f-9005-caf7fe6eeba3.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/540b5d1f-aed3-42db-9801-f31efb70db6a.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/5a7488bb-5a0a-4b10-a70d-76f06976d7db.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/623ec881-01ec-4391-8af2-82b4b1d8364c.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/736d6b85-1662-427d-a8c5-c6d64af91a4f.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/84e0f9a9-0fc6-4518-b8f4-a653145ff8e8.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/910851e2-fef2-4bae-b362-77ed70aa5534.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/a9f9de63-b378-4c86-9f56-9c189e6fa1a3.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/b20fcade-9938-4f2a-a072-ba21b7dc3b08.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/baa87349-7aa7-4ef7-8825-7ddc9cc9cfb0.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/bf7952be-b3b6-4c69-b0aa-a59bd8175833.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/c2e535e5-6246-4414-9e49-cb372d57cf05.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/c2fddd1e-bfd5-4e39-9802-3c00270c360c.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/dad62068-185e-43fd-8eda-b28a24196c97.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/e09611a5-29c9-423a-a245-48e7de863cf8.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi-subagents/missions/eec44c54-b66d-4e73-bfec-062ab6332ed6.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .pi/extensions/financial-tools/api-client-context.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/api-migration.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/generated/http-tools.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/pending-tools.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/pending-write-adapters.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/legacy-readers.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/legacy-readers.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/shadow-config.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/shadow-filters.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/shadow-logger.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/shadow-logger.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/shadow-read.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/shadow-read.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/shadow-runner.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/shadow/shadow-runner.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/api-client.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/api-tool-helpers.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/capability-flags.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/goals_non_api.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/notification_non_api.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/payable_template_automation.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/recurring_status.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/refresh_payable_status.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/453b485d_reviewer_0_input.md | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/453b485d_reviewer_0_meta.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/453b485d_reviewer_0_output.md | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/453b485d_reviewer_0_transcript.jsonl | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/6a7f8a4b_reviewer_0_input.md | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/6a7f8a4b_reviewer_0_meta.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/6a7f8a4b_reviewer_0_output.md | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/6a7f8a4b_reviewer_0_transcript.jsonl | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/a95e6d30_reviewer_0_input.md | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/a95e6d30_reviewer_0_meta.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/a95e6d30_reviewer_0_output.md | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/artifacts/a95e6d30_reviewer_0_transcript.jsonl | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/missions/61163896-1f2f-4ac1-946e-e1b9a7d33f7c.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/missions/a3247ea2-f954-4c8d-a91e-e654ac06c7bd.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/missions/b7f60bfe-f4c1-43e4-b08c-83c41924d5a0.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .tmp-latest-audit.txt | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .tmp-sharp-linux/img-sharp-libvips-linux-x64-1.3.2.tgz | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .tmp-sharp-linux/img-sharp-linux-x64-0.35.3.tgz | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| NUL | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/.dev.vars.example | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/migrations/0001_workspace_agent.sql | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/migrations/0002_stable_intentions.sql | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/migrations/0003_safety_limits.sql | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/migrations/0004_transcript_redaction.sql | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/migrations/0005_privacy_controls.sql | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/package.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/src/delegated-token.ts | secret-sensitive | P0 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/agent/src/index.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/src/schema.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/src/transcript-safety.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/agent-auth.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/agent-chat.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/agent-privacy-sqlite.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/agent-privacy.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/agent-queue.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/agent-safety.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/agent-scaffold.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/delegated-token.test.ts | secret-sensitive | P0 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/agent/tests/transcript-safety.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tests/workspace-routing.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/tsconfig.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/vitest.config.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/worker-configuration.d.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/worker-configuration.generated.d.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/agent/wrangler.jsonc | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/openapi/agent-tools.openapi.json | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/approvals/executor.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/approvals/guard.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/approvals/pending.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/approvals/policy.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/audit/store.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/better-auth-http.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/better-auth.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/context-token-replay-memory.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/src/auth/context-token-replay-postgres.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/src/auth/context-token-replay.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/src/auth/context-token.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/src/auth/delegated-token.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/src/auth/invite-delivery.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/invites-http.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/invites-postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/invites.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/ownership-transfers-http.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/ownership-transfers-postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/reconnect-sockets.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/reconnect-tokens.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/src/auth/request-context.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/workspace-access.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/auth/workspaces-http.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/db/db-guard.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/lib/spending-insights.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/observability/adoption.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/push/delivery.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/push/postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/push/reminder-lock.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/push/reminder-postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/push/reminder-runtime.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/push/reminder-scheduler.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/push/store.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/push/vapid.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V013__operation_records_audit.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V014__operation_lifecycle_columns.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V015__scope_device_tokens.sql | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/src/read-models/sql/V016__canonical_actor_provenance.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V017__better_auth.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V018__invite_email_normalization.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V019__better_auth_casing.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V020__identity_workspaces.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V021__personal_workspace_invariants.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V022__shared_workspace_invariants.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V023__pending_operations.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V024__push_subscriptions.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V025__push_reminder_scheduler.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V026__adoption_metrics.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V027__context_token_replay.sql | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/src/read-models/sql/V028__pending_chat_context.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/adoption.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/audit.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/pending-operations.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/push.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/route-handlers.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/route-inventory.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/scripts/fingerprint-schema.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| apps/api/src/scripts/migrate-job.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| apps/api/src/scripts/migration-job-policy.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| apps/api/src/scripts/reminder-job.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| apps/api/src/server/log-sanitizer.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/server/migration-policy.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/server/production-routes.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/server/rate-limit.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/server/schema-verifier.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/server/startup-guard.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/vendor-shims.d.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/approvals/approval-matrix-routes.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/approvals/executor.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/approvals/legacy-pending-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/approvals/pending-context.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/approvals/pending-postgres.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/approvals/pending.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/approvals/policy.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/auth-context.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/better-auth-composition.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/better-auth-context.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/better-auth-http.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/better-auth-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/better-auth.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/context-token-replay-memory.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/auth/context-token-replay-postgres.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/auth/context-token.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/auth/delegated-token.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/auth/device-register-blocked.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/device-token-postgres-scope.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/auth/device-token-scope.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/auth/idempotency-containment.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/idempotency-key-contract.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/identity-workspace-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/invite-delivery.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/invites-http.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/invites-postgres.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/invites.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/ownership-transfer-route.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/personal-workspace-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/reconnect-socket-logout.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/reconnect-sockets.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/reconnect-token-http.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/auth/reconnect-tokens.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/auth/request-context.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/shared-workspace-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/startup-guard.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/workspace-roles.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/auth/workspaces-http.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/contract/agent-tools-authoritative-all.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/contract/card-store-id-or.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/contract/idempotency-legacy.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/contract/idempotency-routes.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/contract/idor-cross-household.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/contract/unit-of-work.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/contract/workspace-scoped-stores.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/db/db-guard.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/db/destructive-guard-wiring.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/fixtures/dates.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/card-store-idor.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/identity-workspace-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/postgres-adoption.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/postgres-idempotency-containment.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/postgres-invites-race.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/postgres-reminder-dedupe.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/postgres-reminder-lock.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/postgres-unit-of-work.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/observability/adoption.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/push/delivery.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/push/reminder-lock.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/push/reminder-postgres.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/push/reminder-runtime.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/push/reminder-scheduler.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/push/vapid.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/account-details.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/accounts-read.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/adoption.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/audit-logs.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/context-token-boundary.test.ts | secret-sensitive | P1 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/api/tests/routes/month-summary.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/payable-automation.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/payable-status-refresh.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/pending-context-route.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/pending-identity.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/pending-operations.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/pending-write-dual.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/push-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/push.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/recurring-purchases.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/route-authz-inventory.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/workspace-membership-access.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/server/legacy-production-composition.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/server/log-sanitizer.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/server/migration-job-policy.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/server/migration-policy.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/server/rate-limit.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/server/schema-verifier.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/.tmp-inspect-browser-cookies.mjs | secret-sensitive | P0 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/pwa/e2e/fixture-api/client-boundary.integration.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/no-api.config.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/specs/g3-gate.spec.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/specs/no-api.spec.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/specs/push-runtime.spec.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/standalone-server.mjs | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/start-standalone.mjs | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/e2e/support/e2e-owner.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/app/__tests__/manifest.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/app/api/backend/[...path]/route.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/app/api/backend/[...path]/route.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/app/capture/page.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/app/capture/page.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/components/__tests__/AppShell.share-target.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/components/__tests__/CaptureAppShell.integration.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/components/__tests__/NewTransactionSheet.prefill.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/__tests__/dashboard-aggregate-boundary.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/__tests__/persisted-ui-boundary.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/profile/PushNotificationsCard.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/profile/PushNotificationsCard.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/profile/WorkspaceSheet.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/profile/__tests__/AgentTranscript.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/profile/__tests__/WorkspaceSheet.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/reports/AdoptionMetrics.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/features/reports/__tests__/AdoptionMetrics.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/adoption.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/agent-client.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/agent-client.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/client-socket-invalidation.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/fetch-core.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/fetch-core.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/push-client.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/push-client.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/response-boundary.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/schemas.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/workspaces.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/workspaces.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/auth/reconnect-token.test.ts | secret-sensitive | P0 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/pwa/src/lib/auth/reconnect-token.ts | secret-sensitive | P0 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/pwa/src/lib/auth/socket-registry.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/auth/socket-registry.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/auth/workspace-context.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/auth/workspace-context.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/mutation.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/reset-session.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/sw-coordinator.adoption.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/tsconfig.typecheck.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/bridge-containment.test.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/context-token.test.ts | secret-sensitive | P2 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/whatsapp-bridge/src/context-token.ts | secret-sensitive | P2 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/whatsapp-bridge/src/log-sanitizer.test.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/log-sanitizer.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/pi-coding-agent.d.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/pi-context-env.test.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/rate-limiter.test.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/whatsapp-bridge/src/rate-limiter.ts | project-wip | P2 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| biome.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| dispatch-push.mjs | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| docs/adr/001-legacy-schema-baseline.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/adr/002-better-auth-fallback-after-access-spike.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/adr/README.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/architecture/pi-api-migration.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/architecture/schema-fingerprint.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/architecture/tool-capability-inventory.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/architecture/write-mutator-policy.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/goals/2026-08-14-pi-goal-resume.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/migrations/archive/001_initial_schema.sql | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/migrations/archive/002_pending_operations.sql | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/migrations/archive/003_audit_logs.sql | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/ops/g6-1-1-ios-acceptance.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/ops/vps-access.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/recovery/2026-08-16-working-tree-inventory.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/rehearsal-output.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/runbooks/backup-restore.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/runbooks/web-push-vapid.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/schema/fingerprint.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/security/approval-capability-inventory.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/security/device-token-inventory.md | secret-sensitive | P4 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| docs/security/g0-critical-resolution.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/security/g0-postgres-audit-output.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/security/new-device-tokens.json | secret-sensitive | P4 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| docs/superpowers/goal-runs/20260729122916-x66ttj.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260729165320-g3-pwa-corrections.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260730195456-58006g.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260730224513-q4z4yv.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260730230523-vk7641.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260731112116-71jioz.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260731113239-rp22uf.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260731113920-o3iyym.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260731114727-znh5eo.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260731145715-q96k5w-postgres.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260731145715-q96k5w.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260731153935-8l3hry-output.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260731153935-8l3hry.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260801181116-88954o.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260802161604-po087l-installed-pwa.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260802161604-po087l.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260802182309-771u0e.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260802194445-aneaos.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260802221826-vyaww1.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260802224722-c8u820-postgres.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260802224722-c8u820.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803015934-kzhrco-postgres.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803015934-kzhrco.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803021752-4komp8-postgres.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803021752-4komp8.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803120528-qr6kiq-postgres.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803120528-qr6kiq.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803121708-eluv1z.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803122256-zm843d.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803124039-t4883b.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/20260803134136-lhbr4j.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G0-GATE.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G0-T1-red.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G0-T1.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G0-TEMPLATE-PROOF.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G1.1.5.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G1.1.6.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G1.2.2.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G1.2.3.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G1.2.4.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G1.2.5.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G4-GATE.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5-GATE.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.1.1.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.1.2.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.1.3.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.1.4.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.1.5.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.1.6.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.2.1.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.2.2.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.2.3.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.2.4.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.2.6.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.2.7.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.2.8.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G5.2.9.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/G6.1.1.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/TEMPLATE.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/plans/2026-07-28-g1-2-4-security-gates.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/plans/2026-07-28-project-recovery-roadmap.html | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/plans/2026-07-30-g2-2-5-unit-of-work.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/plans/2026-08-04-g5-2-9-privacy-controls.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/plans/2026-08-14-g6-1-3-share-target.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/plans/archive/2026-07-27-fase-0-preparo.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-07-28-project-recovery-product-architecture.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-07-30-g2-2-5-unit-of-work-design.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-02-better-auth-integration-design.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-04-g5-2-9-privacy-design.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-05-g6-1-1-web-push-design.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-14-g6-1-3-share-target-design.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-14-g6-1-4-adoption-metrics-design.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-14-g6-2-1-boundary-policy.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-14-master-goal-g6-g7-validation-design.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-15-context-token-contract.md | secret-sensitive | P4 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| pwa-index.html | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| scripts/access-spike/installed-pwa-harness.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/agent-tools-authoritative-query.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/agent-tools-schema-contract.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/anonymized-dump.sql | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/backup-db.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/backup-restore-contract.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/backup-restore-rehearsal.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/bridge-tsconfig.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-api-route-inventory-regression.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-api-route-inventory.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-decision-governance.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-decision-governance.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-pwa-command-boundary.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-pwa-command-boundary.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-reminder-format.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-snapshot-policy.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-snapshot-policy.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-tool-capability-inventory.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-tool-capability-inventory.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-working-tree-inventory.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-working-tree-inventory.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-write-policy.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-write-policy.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/dispatch-push.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/generate-agent-tools.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/generate-agent-tools.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/goal-loop-red-baseline.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/goal-loop-red-baseline.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/production-smoke-contract.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/rehearse-migration.bat | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/rehearse-migration.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/require-adoption-integration-env.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/require-reminder-integration-env.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/restore-db.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/root-ci-workflow.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/root-scripts.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/run-workspace-gate.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/runtime-pins.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/security-containers.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/security-gates.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/security-secrets.mjs | secret-sensitive | P0 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| scripts/verify-goal-loop-policy.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/verify-goal-loop-policy.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| test-startup.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
