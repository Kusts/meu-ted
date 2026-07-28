# Estado do projeto e próximos passos

**Data:** 2026-07-28
**Branch:** `fase-0-preparo` (17 commits à frente de `main`, working tree limpo)
**Propósito:** documento único e estável. Substitui as recomendações soltas dadas ao longo da sessão.

---

## 0. Por que este documento existe

Durante a sessão eu dei recomendações antes de terminar de investigar. Cada fato novo remontou
o plano, e o efeito prático foi instabilidade — impossível planejar em cima.

Duas reversões concretas, para registro:

| # | O que eu afirmei | O que era | Impacto |
|---|---|---|---|
| 1 | "`apps/api` roda no PC do desenvolvedor; risco crítico; task bloqueante" | Roda na VPS. Li `ecosystem.config.cjs` (config local legado) e generalizei — o `AGENTS.md` da raiz avisa explicitamente contra isso | Spec e plano tiveram item, critério de aceitação e risco removidos |
| 2 | "Prioridade: atacar flakiness" → "não, validar CI antes" | Mudança legítima (descobri que o CI nunca rodou E2E), mas tardia | Reordenou a Fase 0 no meio da execução |

**Regra que passo a seguir:** investigar até o fim, depois recomendar uma vez. Onde restar
incerteza, ela fica marcada como pergunta aberta em vez de virar recomendação.

Este documento separa três coisas que eu vinha misturando: **fato verificado**, **feito**, e
**decisão pendente**.

---

## 1. Fatos verificados

Cada item abaixo foi confirmado por execução, não por leitura.

### 1.1 Arquitetura

| Fato | Evidência |
|---|---|
| Domínio financeiro está **duplicado** | `.pi/extensions/financial-tools/tools/` (~55 arquivos, `pg` direto) e `apps/api/src/` (36 endpoints HTTP) atacam o mesmo Postgres |
| O PWA **nunca** fala com o Agent Pi | `apps/pwa/src/lib/api/client.ts` aponta só para `api.synkroo.com.br`. Único consumidor do Pi é o `whatsapp-bridge` |
| Não existe autenticação de usuário | `apps/api/src/auth/device-token.ts` resolve `x-device-token` → um `householdId`. A tabela `users` existe mas o auth não a usa |
| Schema em produção é o **legacy** | Adapters `legacy-postgres.ts` em cards/goals/payables/read-models, ativados por `DB_SCHEMA=legacy` |
| `apps/api` roda na **VPS**, não no PC | `pm2 jlist` local retorna `[]` enquanto `api.synkroo.com.br/health` responde `200` |
| O PWA bloqueia escrita offline **por decisão** | `commands.ts`: "quando `online === false`, lança `OfflineWriteError` — zero requisição, zero mutação otimista" |

### 1.2 Infraestrutura de testes — três defeitos encontrados

**(a) A suíte E2E nunca executou em CI.**
O job `e2e` morre com exit 9 no matrix gate: `node --experimental-strip-types` não existe no
Node 20, versão que o workflow instala (a flag chegou no Node 22.6). O `run-ci.sh` jamais era
alcançado. Todos os "40/40 green" registrados em commits anteriores eram locais.

**(b) Sem `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`, a suíte inteira falha.**
`client.ts:baseUrl()` retorna `undefined` fora do host de produção, o PWA sobe em modo mock, a
tela de registro nunca renderiza e os 121 testes falham por timeout. Nem o `run-ci.sh` nem o
workflow setavam a variável.

**(c) O rebuild precisa ser limpo.**
Build incremental sobre um `.next` gerado sem a variável mantém chunks em modo mock.
Sintoma de diagnóstico: o fixture API não recebe requisição nenhuma. Exige `rm -rf .next`.

### 1.3 Qualidade atual

| Item | Estado |
|---|---|
| Job `quality` do CI | Falhava em 4 erros `prefer-const` — **corrigido** nesta branch |
| ESLint local | **Quebrado**: `eslint-plugin-react@7.37.5` incompatível com `eslint@10.8.0` instalado. Roda no Linux do CI |
| Typecheck | 5 erros pré-existentes em `src/features/records/__tests__/` (confirmado com stash: 5 antes, 5 depois das minhas mudanças) |
| Flakiness E2E | ~1–3%. Oito testes distintos observados: `ACC-06`, `CAT-01`, `CAT-02`, `CARD-05`, `GOAL-02`, `PAY-04`, `SUB-05`, `UI-03`. Nenhum falha de forma determinística |

> **Ressalva importante sobre a flakiness:** foi medida **só em Windows local**. Como o CI nunca
> rodou a suíte, não existe amostra de ambiente limpo. O número pode ser artefato desta máquina.

---

## 2. O que está feito

### 2.1 Item 0.1 do plano — completo

Objetivo: trocar autenticação na Fase 1 deve tocar **um** arquivo, não 18.

- 18 de 18 specs migrados para `apps/pwa/e2e/support/harness.ts`
- Fronteira única: `harness.authenticate()`
- Gate de invariante que **proíbe clicar** no botão Registrar fora da fronteira
  (mencionar é permitido — `PROF-06` assere que ele reaparece após logout)
- Verificado que o gate detecta: violação injetada em `budgets.spec` foi apontada, depois revertida
- Cada spec teve baseline duplo antes e verificação dupla depois

Saldo nos specs: ~1.100 linhas removidas, ~250 adicionadas.

### 2.2 Capacidades que o harness ganhou

Nenhuma foi projetada antes; cada uma veio de um spec que não cabia no que existia.

| Adição | Spec que forçou |
|---|---|
| `prepareSpec` / `applyCspRewrite` | `records`, `navigation` — deep-link antes de autenticar |
| `baselineAllows` | `navigation` — guard estrito em 25 testes |
| `JournalEntry.body` | `profile` — asserção sobre payload do PATCH |
| `resetFixture(seed)` | `auth` — reseta para estado não-populado |
| `authenticate(timeout)` | `pwa-runtime` — ativação de service worker precisa de 20s |

### 2.3 Correções de CI (fora do plano original)

- `run-ci.sh` exporta `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`
- Matrix gate usa `tsx --test` em vez do type-stripping do Node — workflow e `run-ci.sh`
- 4 erros `prefer-const` corrigidos

### 2.4 Cinco afrouxamentos silenciosos interceptados

Quatro de agente, um meu. **Os três primeiros passariam nos testes.**

| Onde | O que sumiria | Autor |
|---|---|---|
| `records` REC-02/03/04 | ordem navegar→autenticar achatada | `pi` |
| `payables`, `categories` | barreira de sincronização no `init` | `pi` |
| `home` | `addInitScript` movido para depois do `goto` | `opencode` |
| `navigation` | 25 testes herdando guard mais permissivo | eu |

Lição operacional: **teste verde não prova teste íntegro.** Revisar diff de asserção removida
passou a ser padrão em todo spec delegado, não exceção.

---

## 3. O que NÃO está feito

| Item | Estado |
|---|---|
| 0.2 — lembrete via PM2 | `ecosystem.reminder.cjs` **não foi criado**. Só planejado |
| 0.3 — portar 8 features do `.pi` | Não iniciado. Precisa de plano próprio |
| 0.4 — spike Cloudflare Access | Não iniciado. **Define o formato da Fase 1** |
| Push / PR da branch | Não feito. 17 commits parados |
| Validação em CI | Impossível até o push |

---

## 4. Plano

### Passo 1 — Validar o CI *(bloqueado em você: autorizar push)*

Push da `fase-0-preparo`. É a única forma de saber se as correções de 1.2 fazem o job `e2e`
executar de verdade.

**Por que primeiro:** tudo abaixo depende de saber se a suíte roda em ambiente limpo. E a
flakiness de 1.3 foi medida só no meu Windows — diagnosticá-la agora seria diagnosticar a
amostra errada.

Resultado esperado: `e2e` passa do matrix gate e roda os 121 testes. Verde ou vermelho, ambos
são informação útil.

### Passo 2 — Decidir sobre a flakiness *(depende do passo 1)*

Dois cenários:

- **CI verde** → flakiness era artefato local. Nada a fazer; segue para o passo 3.
- **CI vermelho** → temos a amostra certa. Aí sim diagnosticar, com os 8 testes de 1.3 como
  ponto de partida. Hipótese inicial: timing de polling do journal, não autenticação — a
  maioria é do formato "cria algo → assere entrada no journal".

O que me faria mudar de hipótese: se falharem testes que autenticam e agem rápido em seguida, a
suspeita vira o `waitForLoadState("networkidle")` que meu `authenticate()` não faz.

### Passo 3 — Spike do Cloudflare Access *(bloqueado em você: dashboard)*

Timebox 1 dia. **Define o formato da Fase 1** — se aprovado, a tabela `sessions` nem existe e a
Fase 1 encolhe bastante.

Critério: o Worker do agente consegue repassar a identidade Access do usuário final para
`apps/api`, de modo que a API valide **o usuário**, não um service token? Se não, o Access dá
login mas quebra a propriedade de autorização-num-lugar-só, e é descartado.

Fallbacks, em ordem: `better-auth` self-hosted → Clerk/WorkOS free tier → auth próprio.

### Passo 4 — Lembrete semanal na VPS *(bloqueado em você: SSH)*

Criar `ecosystem.reminder.cjs` e deployar. Independente de tudo acima. Tira o job da máquina de
desenvolvimento.

### Passo 5 — Portar as 8 features do `.pi`

`pending_operations`, `undo_last_action`, `duplicate-detector`, `payment_score`,
`installment_score`, `monthly_projection`, `price-alerts`, `audit_logs`.

Fazer **com o Pi ainda rodando**, para comparar comportamento. `duplicate-detector.ts` em
particular tem estratégia de detecção já pensada e documentada — portar, não reescrever.

Merece plano próprio: são 8 features × (endpoint + tool + tela), pela paridade tripla decidida.

---

## 5. Bloqueios em você

| # | O que | Destrava |
|---|---|---|
| 1 | Autorizar push da branch | Passo 1, e por consequência 2 |
| 2 | Dashboard Cloudflare (Access) | Passo 3, e o formato da Fase 1 |
| 3 | SSH na VPS `187.77.249.47` | Passo 4 |

**Nota sobre `gh`:** existe uma variável `GH_TOKEN` inválida no ambiente que tem precedência
sobre a credencial do keyring. `gh auth login` não resolve; é preciso remover `GH_TOKEN` ou
substituí-la. Contornei com `env -u GH_TOKEN`.

---

## 6. Decisões travadas da spec maior

Não reabrir sem motivo novo. Detalhe em
`docs/superpowers/specs/2026-07-27-pwa-centralizado-workspaces-design.md`.

| # | Decisão |
|---|---|
| D1 | Cadastro só por convite |
| D2 | Web Push no PWA substitui o WhatsApp |
| D3 | Agente chama a API HTTP de `apps/api` — uma só implementação da regra |
| D4 | Paridade tripla: endpoint + tool + tela |
| D5 | Transição fatiada, auth primeiro |
| D6 | Histórico de chat compartilhado por workspace |

**Fora de escopo, com razão registrada:** mover `apps/api` para Workers (§8.1), role `viewer`
(§8.2), outbox de escrita offline (§8.3 — bloqueado pelo TTL de 24h em `idempotency.ts`).

---

## 7. O que ainda pode mudar este documento

Honestidade sobre incerteza restante, para não repetir o padrão do §0:

1. **Resultado do CI no passo 1.** Se o job `e2e` continuar falhando por outro motivo, o passo 2
   muda de forma. É o item de maior incerteza aqui.
2. **Resultado do spike 0.4.** Reprovado, a Fase 1 ganha tabela `sessions` e fluxo de reset —
   escopo materialmente maior.
3. **O que aparecer ao portar as 8 features.** Não li o código das 8 em profundidade; estimei
   pelo nome e pelo cabeçalho. `duplicate-detector` eu li.

Nada além disso está em aberto da minha parte. Os fatos do §1 foram verificados por execução e
não devem mudar.
