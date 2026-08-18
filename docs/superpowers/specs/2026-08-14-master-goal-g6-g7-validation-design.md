# Goal Mestre G6–G7–VAL — Design

> **Status:** aprovado pelo usuário em 2026-08-14
> **Escopo:** consolidar os goals pendentes em um único goal lógico, preservando a ordem original e usando gates internos verificáveis.
> **Autonomia:** execução autônoma até produção; deploy, secrets reais, remoção irreversível em produção e demais ações externas exigem gate explícito.

## 1. Goal mestre

```text
[G6–G7–VAL] Concluir a migração de runtime, o desligamento seguro do legado, a documentação arquitetural e a validação operacional do projeto.

Concluído somente quando:
1. todas as capabilities registradas do Pi passarem por API HTTP autenticada, com workspace resolvido server-side, idempotência preservada e zero SQL direto nos adapters/facades de produção;
2. shadow Agent, bridge e feature flags tiverem paridade, ownership único por estágio e rollback testado;
3. writes legados estiverem congelados antes da remoção de runtime;
4. o legado tiver sido removido/arquivado e secrets residuais tratados sem comprometer rollback;
5. o Gate G6 permanecer 48h sem dependência crítica do WhatsApp, sem alertas e com rollback exercitado;
6. README, AGENTS, PRODUCT, ARCHITECTURE-CURRENT, ARCHITECTURE-TARGET, ROADMAP, ADRs, planos e lint documental refletirem a arquitetura real;
7. VAL.1–VAL.10 passarem com comandos, exit codes e outputs reproduzíveis registrados.
```

O goal é único para controle de execução, mas não é uma fila paralela: as fases abaixo são sequenciais e uma fase bloqueada impede a próxima.

## 2. Escopo consolidado e ordem

Os goals já concluídos (G6.1.3 e G6.1.4) não serão reabertos; G6.1.2 permanece **bloqueado** (prova de integração PostgreSQL pendente — ver `docs/superpowers/goal-runs/G6.1.2.md`). O goal mestre absorve os itens pendentes listados no documento de retomada:

### Fase A — Pré-flight de bloqueios

Produzir a matriz de capabilities, dependências, ambientes, rollback e aceite humano antes de alterar a arquitetura. Nenhuma implementação ampla começa enquanto bloqueios críticos conhecidos não tiverem resolução definida.

### Fase B — G6.2.1: Estágio A, Pi continua dono da resposta

- Inventariar as 72 tools registradas.
- Garantir operação API autenticada 1:1 para cada tool.
- Completar OpenAPI, route inventory, handlers e adapters HTTP gerados.
- Substituir o registro manual por `generatedHttpTools`.
- Manter facades de compatibilidade sem `pg`, `DATABASE_URL`, SQL ou shadow reads.
- Provar workspace derivado da autenticação, idempotência e isolamento.

### Fase C — G6.2.2–G6.2.4: shadow, bridge e ownership

- Executar shadow read-only sem responder nem produzir side effects.
- Integrar o bridge WhatsApp → Agent somente com identidade `phone → user → workspace` resolvida no servidor.
- Garantir exatamente um runtime respondendo/executando por estágio.
- Usar feature flag como mecanismo de rollout e rollback.

### Fase D — G6.2.5–G6.2.7: congelamento, aceite e soak

- Bloquear writes do Pi e preservar fallback read-only.
- Obter aceite de paridade por capability.
- Executar soak com período definido, observabilidade e rollback exercitado.

### Fase E — G6.2.8–G6.2.9: remoção e secrets

- Preparar e validar remoção/arquivamento de webhook, Evolution, bridge e `.pi/`.
- Rotacionar secrets reais somente no gate externo correspondente.
- Verificar referências residuais em código e configuração ativos.

### Fase F — G6.GATE

Manter o WhatsApp desligado por 48h, sem alertas críticos, com dados íntegros e rollback documentado/testado.

### Fase G — G7.1–G7.5: documentação

- Reescrever README e AGENTS conforme a arquitetura real.
- Criar `PRODUCT.md`, `ARCHITECTURE-CURRENT.md`, `ARCHITECTURE-TARGET.md` e `ROADMAP.md`.
- Extrair ADRs ativas e arquivar specs/planos superados.
- Manter somente planos ativos e com status correto.
- Adicionar lint de links internos e fatos contáveis.

### Fase H — VAL.1–VAL.10: validação final

Executar, nesta ordem, instalação frozen, lint, typecheck, testes unit/contract, coverage, integração PostgreSQL descartável, E2E, build, security check e smoke read-only de produção.

## 3. Matriz inicial de bloqueios

| ID  | Bloqueio / risco                                                                                          | Evidência ou hipótese                                              | Pré-condição de resolução                                                                 | Gate  |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----- |
| B1  | 72 tools registradas contra apenas 44 adapters gerados                                                    | Baseline de T6                                                     | Matriz tool → endpoint → OpenAPI → generated adapter completa                             | A/B   |
| B2  | 47 capabilities nas flags contra 44 generated                                                             | Baseline do generator                                              | Generator e contratos sincronizados; teste do generator verde                             | B     |
| B3  | Facades legadas ainda importam `pg`, usam `DATABASE_URL` ou SQL                                           | Baseline de `api-migration`                                        | Facades somente delegam para adapters HTTP; boundary transitive verde                     | B     |
| B4  | Pending operations têm implementação de rota, mas não registro/contrato completo                          | `pending-operations.ts` existe; inventory/index não estão 1:1      | Registrar list/details/approve/reject no servidor, OpenAPI e adapters                     | B     |
| B5  | `undo_last_action` não tem equivalente API                                                                | Tool Pi possui SQL direto; nenhum endpoint identificado            | Criar operação autenticada server-owned com escopo e auditoria                            | B     |
| B6  | Gaps de cards, insights, limites, parcelamentos, recorrências, notificações avançadas, status e sugestões | Diff de T6 identificou 28 nomes sem operação OpenAPI               | Reusar stores existentes quando houver; criar contratos/rotas/testes para cada gap        | B     |
| B7  | Shadow Agent e bridge podem não estar completos ou ter contratos divergentes                              | A confirmar no pré-flight                                          | Inventário de entrypoints, payloads, flags, logs e side effects                           | A/C   |
| B8  | Não existe ainda prova de ownership único entre Pi e Agent                                                | Risco de resposta/side effect duplicado                            | Testes de concorrência e matriz de ownership por flag/estágio                             | C     |
| B9  | Soak de 48h depende de observação externa                                                                 | Contrato G6.GATE                                                   | Definir janela, métricas, alertas, responsável e critério de rollback                     | D/F   |
| B10 | Remoção de bridge, webhook, `.pi/` e rotação de secrets são irreversíveis                                 | Consent gates do documento de goals                                | Backup, commit de rollback, inventário exato e aprovação antes da ação                    | E     |
| B11 | Integração PostgreSQL precisa ser reproduzível                                                            | `DATABASE_URL_TEST` e `DB_TEST_MARKER` já funcionaram localmente   | Documentar banco descartável, migrações, marker e fail-closed sem skips                   | A/H   |
| B12 | Typecheck/lint/build podem conter falhas preexistentes                                                    | Typecheck global da PWA já teve falhas fora dos arquivos alterados | Baseline por workspace e classificação regressão versus preexistente                      | A/H   |
| B13 | E2E exige auth, workspaces, chat e ambiente executável                                                    | Contrato VAL.7                                                     | Provisionar fixtures/credenciais de teste e ambiente definido                             | A/H   |
| B14 | Coverage global de 80% pode não ser atingível com o escopo atual                                          | Critério VAL.5 ainda não medido                                    | Medir baseline; corrigir gaps ou registrar decisão explícita de limiar                    | A/H   |
| B15 | Security check depende de scanners, Docker e secrets disponíveis                                          | Pré-condição operacional                                           | Verificar ferramentas, versões, permissões e política de falsos positivos                 | A/H   |
| B16 | Produção é dividida entre PWA Cloudflare e API Hostinger VPS                                              | Instruções do projeto                                              | Validar topologia em `../vps-hostinger/`; não usar processos locais como fonte de verdade | A/F/H |
| B17 | Aceite de paridade capability por capability é humano                                                     | G6.2.6                                                             | Gerar checklist com evidência funcional e decisão aprovada                                | D     |
| B18 | Documentação pode contradizer código durante a migração                                                   | Goals G7.1–G7.5                                                    | Atualizar docs somente após arquitetura corrente estabilizar; lint final obrigatório      | G/H   |

## Pré-flight atual — 2026-08-14

O pré-flight confirmou os seguintes estados antes de qualquer implementação ampla:

| Bloqueio | Estado                      | Evidência atual                                                                                                               | Próximo passo obrigatório                                                             |
| -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| B1–B2    | **BLOQUEADO**               | 72 registradas; 28 sem OpenAPI; 47 flags contra 44 generated                                                                  | Completar contratos e regenerar adapters                                              |
| B3       | **BLOQUEADO**               | Boundary scan: 66 arquivos com refs a `pg`, 52 com SQL e 52 com `DATABASE_URL`                                                | Classificar scripts/testes/shadow e remover imports dos boundaries ativos             |
| B4–B6    | **BLOQUEADO**               | Pending parcial; `undo_last_action` sem API; gaps de cards, parcelamentos, notificações e status                              | Mapear stores e implementar contratos autenticados 1:1                                |
| B7–B8    | **BLOQUEADO**               | Shadow/bridge/ownership ainda não inventariados                                                                               | Localizar entrypoints, flags, payloads e side effects                                 |
| B9–B10   | **BLOQUEADO — externo**     | Soak/remoção/secrets dependem de operação controlada                                                                          | Definir janela, backup, rollback e gate de aprovação                                  |
| B11      | **RESOLVIDO — local**       | `synkroo-db` na porta 55432; banco `pi_finance_adoption_test`; V001–V026 aplicadas; integração real 1/1                       | Reusar o comando com `DATABASE_URL_TEST` e `DB_TEST_MARKER`; não imprimir credentials |
| B12      | **BLOQUEADO — baseline**    | Typecheck global já possui falhas preexistentes conhecidas                                                                    | Rodar baseline por workspace e separar regressões                                     |
| B13      | **RESOLVIDO — localização** | Comandos canônicos estão nos manifests de `apps/api`, `apps/pwa`, `apps/agent` e `apps/whatsapp-bridge`; root não tem aliases | Usar scripts por workspace ou criar aliases somente se necessário                     |
| B14      | **BLOQUEADO — medição**     | Coverage de 80% ainda não medida                                                                                              | Rodar baseline e decidir gaps antes do gate final                                     |
| B15      | **BLOQUEADO — ferramenta**  | Root e manifests não possuem `security:check`                                                                                 | Localizar pipeline/scanners canônicos ou criar comando verificável                    |
| B16      | **RESOLVIDO — localização** | `D:/projetos/vps-hostinger` existe; `.env` e `HERMES-MIGRATION.md` disponíveis; PWA aponta API Cloudflare                     | Validar conteúdo de deploy sem imprimir secrets e separar produção de PM2 local       |
| B17      | **BLOQUEADO — aceite**      | Paridade humana ainda não coletada                                                                                            | Gerar checklist capability por capability                                             |
| B18      | **ABERTO**                  | Docs serão atualizados após estabilização                                                                                     | Executar G7 somente depois dos gates técnicos                                         |

**Resultado:** o Gate A ainda não está satisfeito. A próxima execução deve resolver os bloqueios de contrato/API e ambiente antes de alterar facades ou remover qualquer runtime.

## Classificação revisada do Gate A — 2026-08-15

O pré-flight não deve implementar o goal mestre antecipadamente. A classificação correta é:

- **Backlog do G6.2.1, não bloqueio de readiness:** B1–B6. Os gaps de API, OpenAPI, generated adapters, pending/undo, cards, parcelamentos, notificações e boundary serão resolvidos dentro do goal mestre.
- **Inventário read-only concluído:** B7. Entry points Pi, Agent e bridge foram localizados; flags, payloads e side effects estão registrados nas evidências do T9.
- **Gate futuro ainda não satisfeito:** B8. Ownership único entre runtimes precisa de teste no G6.2.4; não deve ser implementado no pré-flight.
- **Gates operacionais posteriores:** B9–B10 e B17–B18. Soak, remoção, secrets, aceite humano e documentação pertencem às fases posteriores.
- **Pré-condições de ambiente resolvidas:** B11, B13 e B16. PostgreSQL real passou 1/1, scripts canônicos foram localizados por workspace e `D:/projetos/vps-hostinger` foi encontrado.
- **Baseline conhecido:** B12. API, PWA, Agent e bridge têm typecheck verificado; financial-tools tem falhas conhecidas do backlog G6.2.1.
- **Baseline de cobertura conhecido:** B14. `pnpm test:coverage` falha antes de gerar relatório por falhas da suíte; isso é um gap de validação/código conhecido, não um bloqueio desconhecido.
- **Pipeline de segurança localizado:** B15. O workflow CI usa `pnpm security:secrets`, `pnpm security:deps` e `pnpm security:containers`, com scripts correspondentes; alias local root pode ser tratado como melhoria de execução VAL.9.

**Novo significado do Gate A:** não existem pré-condições ambientais ou de topologia desconhecidas para iniciar o goal mestre. O Gate A não exige que B1–B6 já estejam implementados; exigir isso duplicaria o G6.2.1 e impediria seu início por definição circular.

O resultado do Gate A agora deve ser avaliado por esta classificação, mantendo B1–B6 como primeiro backlog executável do goal mestre.

## 4. Política de resolução de bloqueios

Cada bloqueio recebe exatamente um estado:

- **RESOLVIDO:** evidência reproduzível anexada ao task/goal.
- **ACEITO:** risco conhecido, impacto limitado, responsável e rollback definidos; requer decisão humana quando afetar produção.
- **BLOQUEADO:** impede avanço da fase e exige ação técnica, ambiente, credencial ou decisão.
- **NÃO APLICÁVEL:** comprovado por inspeção, sem apagar a evidência.

Não será permitido marcar uma fase como concluída por testes skipped, mocks apresentados como integração real, rotas não registradas, adapters que retornam `501`, ou análise estática sem execução quando o contrato exige runtime.

## 5. Gates de execução

1. **Gate A — pré-flight:** matriz B1–B18 preenchida; todos os bloqueios críticos têm resolução; baseline de comandos salvo.
2. **Gate B — API migration:** 72/72 capabilities 1:1; generated adapters completos; boundary, API migration, generator, typecheck e testes de rota verdes.
3. **Gate C — ownership:** shadow não interfere; um único runtime responde/executa; flags e rollback comprovados.
4. **Gate D — freeze/soak:** writes Pi congelados; aceite por capability; soak e rollback reproduzidos.
5. **Gate E — operação externa:** antes de produção, secrets, deploy ou remoções irreversíveis, solicitar aprovação explícita com inventário e rollback.
6. **Gate F — G6:** 48h sem dependência crítica do WhatsApp, sem alertas e com dados íntegros.
7. **Gate G — documentação:** docs canônicos, ADRs, planos e lint documental sincronizados.
8. **Gate H — validação:** VAL.1–VAL.10 executados sem ocultar falhas ou skips incompatíveis com o contrato.

## 6. Critérios de conclusão do goal mestre

O goal mestre só pode ser encerrado quando:

- todos os gates A–H têm evidência;
- nenhuma capability registrada ficou sem endpoint autenticado e adapter gerado;
- nenhum boundary de produção contém SQL direto, `pg`, `DATABASE_URL` ou shadow reader ativo;
- writes, idempotência, autorização e workspace scoping foram exercitados em testes;
- rollback existe para cada mudança de ownership/removal;
- todos os itens G6, G7 e VAL listados no documento de retomada têm resultado explícito;
- ações externas permaneceram bloqueadas até o gate de aprovação correspondente;
- o transcript registra comandos, exit codes e outputs completos das validações.

## 7. Próximo passo

Criar um novo contrato único no `pi-tasks`, absorvendo T6, com o primeiro passo atômico **“executar o pré-flight B1–B18 e produzir a matriz de bloqueios”**. Nenhum código da migração G6.2.1 deve ser alterado antes desse pré-flight.
