# Meu Ted — Roadmap

**Last verified:** 2026-09-14
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)

| Marco | Status | Evidência/limite |
| --- | --- | --- |
| P0–P5 e paridade financeira | Histórico consolidado | Base anterior documentada em `docs/ESTADO-E-PROXIMOS-PASSOS.md`; não altera o estado de produção nesta entrega. |
| Remoção do Bridge/Pi legado | Concluído | Não é workspace, job CI ou caminho de produção ativo. Referências históricas permanecem não normativas. |
| Consolidação TED Agent V2 | Implementado; API em produção | Pipeline único, pending operation V2, executor restrito, evidências/evals e invariantes arquiteturais. API V2 implantada na VPS (imagem `pi-finance-api:main`, migrations V050+V051, `/health`+`/ready` 200) conforme `docs/reports/agent-v2-implementation-report.md`. |
| CI e containers V2 | Preparado; remoto bloqueado | API, Agent, Broker, PWA, segurança e documentação estão em workflows; CI/PWA CI remotos bloqueados por billing/spending limit do GitHub Actions. |
| Rollout operacional V2 | Parcial | API autoritativa em produção com rollback tagado (`pi-finance-api:rollback-pre-v2` + backup DB). PWA/Agent na Cloudflare ainda servem o deploy anterior; re-executar CI + PWA CI do SHA após resolver billing. |
| Hardening TED V3 | Planejado | SPEC [`MEU-TED-SPEC-HARDENING-PONTA-A-PONTA-V3.md`](MEU-TED-SPEC-HARDENING-PONTA-A-PONTA-V3.md) + plano [`superpowers/plans/2026-09-14-meu-ted-v3-hardening.md`](superpowers/plans/2026-09-14-meu-ted-v3-hardening.md); reauditoria confirmou H-01..H-16 na baseline `main@e5f21177`; blocos A (P0) a F (release). |

## Próximo passo autorizado

Executar o plano V3 a partir da Fase 0 (contratos, registry e suíte state-machine
compartilhada), sem deploy durante o desenvolvimento. Em paralelo, o owner precisa
resolver o billing do GitHub Actions para destravar CI/PWA CI remotos, pré-requisito
do gate de release do BLOCO F.

## Hardening TED V3 — decisões registradas (2026-09-14)

SPEC: [`MEU-TED-SPEC-HARDENING-PONTA-A-PONTA-V3.md`](MEU-TED-SPEC-HARDENING-PONTA-A-PONTA-V3.md) ·
Plano: [`superpowers/plans/2026-09-14-meu-ted-v3-hardening.md`](superpowers/plans/2026-09-14-meu-ted-v3-hardening.md)

| ADR | Decisão |
| --- | --- |
| [`ADR-012`](adr/ADR-012-approval-contract-propose-validation-and-effects-registry.md) | Approval Tool Contract como fonte única + validação canônica no propose; Effects Registry separado; semântica de identidade do MutationReceipt (`mutationId` universal, `operationId` só no TED). |
| [`ADR-013`](adr/ADR-013-execution-recovery-lease.md) | Protocolo TX1 (claim) → executor fora da transação → TX2; lease com expiração e reconciliador idempotente; recovery de `confirmed` só por reemissão; migration V052 aditiva. |
| [`ADR-014`](adr/ADR-014-mutation-draft-multi-turno.md) | Invariantes do MutationDraft (sem autoridade financeira), ciclo com estado `proposing`, consumo atômico e handoff recuperável draft → PendingOperation (0 ou 1, INV-09/INV-10). |
