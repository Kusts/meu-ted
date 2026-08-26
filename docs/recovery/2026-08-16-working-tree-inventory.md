# Working Tree Inventory — 2026-08-16

## Safety boundary

- Inventory count: 262
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
| .pi/extensions/financial-tools/tools/create_recurring_purchase.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/goals_budgets.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/extensions/financial-tools/tools/notification_tools.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| AGENTS.md | documentation | P0 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| README.md | documentation | P0 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| apps/api/src/cards/in-memory.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/cards/legacy-postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/cards/postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/cards/store.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/migrate.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/cards.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/index.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/routes/profile.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/writes/errors.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/writes/postgres.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/cards.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/routes/profile.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| docs/ARCHITECTURE-CURRENT.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/ARCHITECTURE-TARGET.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/ESTADO-E-PROXIMOS-PASSOS.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/PRODUCT.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/ROADMAP.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/architecture/runtime-facts.json | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/goals/2026-08-16-project-pending-closure-master.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/recovery/2026-08-16-working-tree-inventory.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/reports/2026-08-16-final-validation.json | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/reports/2026-08-16-final-validation.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| package.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| pnpm-lock.yaml | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .opencode/opencode-loop/ses_fd1fbf61affequjPCZoxUE3uji.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .opencode/opencode-loop/ses_fe6322249ffeUjdEcAnbEpH9ph.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .opencode/opencode-loop/ses_fe9986f41ffe6R63UAbQNPEV2J.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .opencode/opencode-loop/ses_fe99c8bc4ffeBxHej0tFINmGoF.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .opencode/opencode-loop/ses_fe9e0d144ffeGNo3Jh6UopQuNB.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .opencode/opencode-loop/ses_fe9e33bf0fferwspfEcAS6WN23.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
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
| .pi/extensions/financial-tools/tool-schema.test.ts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/loops/632842db/state.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/loops/c076c771/state.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/loops/c91f86ac/state.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/loops/d4cce457/state.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
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
| .pi/subagents/schedules/gate-t36h/events.jsonl | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/schedules/gate-t36h/history.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/schedules/gate-t36h/runs/deedbde5.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/schedules/gate-t36h/schedule.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/schedules/gate-t48h-legado/events.jsonl | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/schedules/gate-t48h-legado/history.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/schedules/gate-t48h-legado/runs/9acb8476.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .pi/subagents/schedules/gate-t48h-legado/schedule.json | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| .tmp-goals-resume.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .tmp-latest-audit.txt | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .tmp-sharp-linux/img-sharp-libvips-linux-x64-1.3.2.tgz | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .tmp-sharp-linux/img-sharp-linux-x64-0.35.3.tgz | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .tmp-t4-dispatch-prompt.md | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| .vps-inspect.sh | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/scripts/dbg-refresh.mts | tooling | P1 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| apps/api/src/read-models/sql/V032__legacy_card_purchases_household_id.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/src/read-models/sql/V033__card_purchase_cancellation.sql | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/cards/card-purchase-cancellation-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/cards/legacy-card-purchases-migration.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/api/tests/integration/legacy-card-purchases-v032-upgrade.test.ts | project-wip | P1 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/.tmp-inspect-browser-cookies.mjs | secret-sensitive | P0 | preserve-redacted | Preserve the path for ownership tracking; never read or record its contents. |
| apps/pwa/e2e/start-standalone.mjs | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/api/client-socket-invalidation.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/auth/workspace-context.test.tsx | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| apps/pwa/src/lib/reset-session.test.ts | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| biome.json | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| dispatch-push.mjs | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| docs/recovery/2026-08-23-working-tree-inventory.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/rehearsal-output.txt | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
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
| docs/superpowers/plans/2026-08-22-card-purchase-cancellation.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| docs/superpowers/specs/2026-08-22-card-purchase-cancellation-design.md | documentation | P4 | preserve | Documentation is preserved and assigned to the appropriate pending-closure phase. |
| pwa-index.html | project-wip | P0 | preserve | Tracked project WIP is preserved exactly as found pending its owning delivery. |
| scripts/access-spike/installed-pwa-harness.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/anonymized-dump.sql | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/backup-db.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/backup-restore-contract.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/bridge-tsconfig.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-api-route-inventory-regression.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-api-route-inventory.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-snapshot-policy.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-snapshot-policy.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/check-tool-capability-inventory.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/dispatch-push.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/goal-loop-red-baseline.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/goal-loop-red-baseline.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/rehearse-migration.bat | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/rehearse-migration.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/restore-db.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/runtime-pins.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/verify-goal-loop-policy.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| scripts/verify-goal-loop-policy.test.mjs | tooling | P0 | preserve | Tooling is preserved while the stabilization and validation commands are reconciled. |
| tmp/task-list-full.txt | temporary | P0 | review | Temporary or backup material is retained pending explicit ownership and rollback review. |
