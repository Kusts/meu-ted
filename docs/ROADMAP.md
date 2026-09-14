# Meu Ted — Roadmap

**Last verified:** 2026-09-13
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)

| Marco | Status | Evidência/limite |
| --- | --- | --- |
| P0–P5 e paridade financeira | Histórico consolidado | Base anterior documentada em `docs/ESTADO-E-PROXIMOS-PASSOS.md`; não altera o estado de produção nesta entrega. |
| Remoção do Bridge/Pi legado | Concluído | Não é workspace, job CI ou caminho de produção ativo. Referências históricas permanecem não normativas. |
| Consolidação TED Agent V2 | Implementado e validado localmente | Pipeline único, pending operation V2, executor restrito, evidências/evals e invariantes arquiteturais. Aguardando revisão/CI remoto; nenhum deploy foi executado. |
| CI e containers V2 | Preparado | API, Agent, Broker, PWA, segurança e documentação estão em workflows; deploy só é elegível após `CI` bem-sucedido. |
| Rollout operacional V2 | Pendente de operação autorizada | Requer execução de CI remoto, preparação de variáveis/segredos já existentes e rollout controlado; fora desta implementação local. |

## Próximo passo autorizado

Revisar o diff e executar o CI remoto do SHA aprovado. Depois de verde, o
workflow poderá implantar PWA/Agent conforme a configuração existente; a
migration de produção continua sendo procedimento explícito e separado.
