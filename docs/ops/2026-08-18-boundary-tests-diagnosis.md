# Diagnóstico dos Boundary Tests Vermelhos da PWA (2026-08-18)

**Contexto:** durante a restauração da integridade do repo (loop 632842db), o working
tree tinha 6 arquivos de teste untracked da PWA que falham. Eles representam o único
bloco "não-verde" restante após o backfill por camada.

## Classificação: TDD-RED DE SPEC (não regressão)

Todos os 6 são **specs de invariantes de arquitetura/privacidade ainda não implementados**,
não bugs introduzidos. Evidência:

| Teste | Invariante exigido | Módulo-alvo no HEAD |
|---|---|---|
| `lib/api/response-boundary.test.ts` | `responseSchema` + `responseSchema.parse()` em endpoints/client.ts; `pwaControlSchema.parse` em sw | **Ausente** (`responseSchema` = 0 ocorrências) |
| `lib/api/client-socket-invalidation.test.ts` | fechar sockets e invalidar reconnect tokens no 401 | módulo untracked |
| `lib/auth/workspace-context.test.tsx` | WorkspaceProvider seleciona 1º workspace autorizado | `workspace-context.tsx` **untracked** |
| `features/__tests__/persisted-ui-boundary.test.tsx` | não renderizar agregados fabricados sem summary do servidor | invariante G5.2.9 não implementado |
| `features/__tests__/dashboard-aggregate-boundary.test.ts` | agregados monetários server-owned | invariante G5.2.9 não implementado |
| `lib/reset-session.test.ts` | `clearSensitiveSession({clearV1Snapshot, clearProfile})` | `reset-session.ts` **untracked** |

## Decisão

- Manter os 6 testes como **untracked WIP** (contrato de trabalho futuro); **não** alterá-los
  artificialmente para "passar" (enfraqueceria a spec de privacy G5.2.9).
- Implementá-los quando o trabalho do plano exigir: validação de resposta com zod
  (`responseSchema`), `resetLocalSession`, `WorkspaceProvider`, invalidação de sessão/reconnect.
- Eles correspondem às metas **G5.2.9 (privacy/boundary)** e reforços do **G6.1.4**.
- HEAD verde não é afetado: os testes nunca foram commitados.

## Arquivos untracked originários (nunca versionados)

- `apps/pwa/src/lib/reset-session.ts` + `.test.ts`
- `apps/pwa/src/lib/auth/workspace-context.tsx` + `.test.tsx`
- `apps/pwa/src/lib/api/response-boundary.test.ts` (spec sobre endpoints/client/sw)
- `apps/pwa/src/lib/api/client-socket-invalidation.test.ts`
- `apps/pwa/src/features/__tests__/persisted-ui-boundary.test.tsx`
- `apps/pwa/src/features/__tests__/dashboard-aggregate-boundary.test.ts`
