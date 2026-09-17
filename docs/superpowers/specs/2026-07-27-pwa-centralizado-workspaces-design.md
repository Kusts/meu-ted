# PWA Centralizado — Agente Cloudflare, Multi-Login e Workspaces

**Data:** 2026-07-27
**Status:** draft for review
**Escopo:** `apps/pwa/`, `apps/api/`, `apps/whatsapp-bridge/` (remoção), `.pi/` (remoção), novo `apps/agent/`
**Objetivo:** centralizar o produto no PWA — chat com agente rodando no Cloudflare Agents SDK, autenticação multi-usuário por convite, e workspaces individuais e compartilhados — desligando o WhatsApp e o runtime `pi --mode rpc`.

> **Esta spec é guarda-chuva.** Cobre 5 fases. Cada fase recebe seu próprio plano de implementação
> (`writing-plans`) e vai a produção funcionando antes da próxima. Não implementar a partir
> deste documento diretamente.

---

## 0. Pré-condições de arquitetura

> Fixa fatos do código atual que o resto da spec assume. Sem isso, várias decisões (§4, §6.2, §7)
> parecem arbitrárias.

### 0.1 O domínio financeiro está duplicado

Existem **duas implementações** da mesma regra de negócio, ambas contra o mesmo Postgres
(`pi_financeiro`, schema legacy):

| Implementação | Localização | Consumidor |
|---|---|---|
| Tools do Agent Pi | `.pi/extensions/financial-tools/tools/` (~55 arquivos, `pg` direto) | `apps/whatsapp-bridge` via `pi --mode rpc` |
| API HTTP | `apps/api/src/` (`routes/`, `writes/`, `read-models/`) | `apps/pwa` |

O README declara que "o domínio financeiro foi movido para o Agent Pi". **Isso não é verdade
hoje** — `apps/api/src/routes/` expõe 36 endpoints cobrindo contas, categorias, transações,
cartões, faturas, parcelamentos, a pagar, orçamentos, metas, assinaturas e notificações.

### 0.2 O PWA nunca fala com o Agent Pi

`apps/pwa/src/lib/api/client.ts` aponta exclusivamente para `PRODUCTION_API_BASE_URL =
"https://api.synkroo.com.br"` (= `apps/api`). O único consumidor do Agent Pi é o
`whatsapp-bridge`.

**Consequência:** "remover o WhatsApp" e "substituir o Agent Pi" são **uma decisão, não duas**.
Desligar o WhatsApp deixa bridge e Pi RPC órfãos simultaneamente.

### 0.3 Não existe autenticação de usuário

`apps/api/src/auth/device-token.ts` resolve um header `x-device-token` para
`{ deviceId, householdId }`. Não há conceito de usuário autenticado. A tabela `users` existe em
`docs/migrations/001_initial_schema.sql` (allowlist de telefone, chave `phone`), mas o auth
não a usa.

### 0.4 `households` já é o primitivo de workspace

Toda tabela de domínio referencia `household_id`. O trabalho de modelagem é pequeno; o trabalho
de **autorização** é grande (§4.3).

### 0.5 O schema em produção é o legacy

`DB_SCHEMA=legacy` ativa adapters dedicados: `apps/api/src/cards/legacy-postgres.ts`,
`goals/legacy-postgres.ts`, `payables/legacy-postgres.ts`,
`read-models/legacy-postgres-store.ts`. `docs/migrations/001_initial_schema.sql` descreve o
schema alvo, **não** o que roda hoje. Migrations desta spec devem ser escritas contra o legacy.

### 0.6 O PWA é offline-first para leitura e bloqueia escrita offline

`apps/pwa/src/lib/state/` já tem `sync-engine.ts`, `snapshot-db.ts` (IndexedDB),
`snapshot-store.ts`, `state-reducer.ts` e `commands.ts`.

`commands.ts` documenta invariante explícita: *"quando `online === false`, um command lança
`OfflineWriteError` imediatamente — zero requisição de rede e zero mutação otimista de estado."*

Isso é **decisão deliberada, não lacuna**. Ver §8.3.

### 0.7 Infraestrutura atual

- **`apps/api` roda na VPS Hostinger**, exposta em `api.synkroo.com.br` via cloudflared.
- Postgres e Evolution API — mesma VPS (`<VPS_IP>`). Postgres **sem porta pública**;
  a partir da máquina de desenvolvimento só via túnel SSH (`docker/pi-stack/ssh-tunnel-postgres.bat`).
- `apps/pwa` — Next.js 16, builda para Cloudflare Workers via `@opennextjs/cloudflare` + wrangler.
- Lembrete semanal — `pnpm reminder` disparado por `schtasks` **na máquina de desenvolvimento**
  (ver README). Máquina desligada na segunda de manhã = ninguém recebe nada. É o único
  componente ainda preso ao PC.

> **Não confundir config local com produção.** `apps/api/ecosystem.config.cjs` referencia um
> cloudflared em `C:\Users\walis\...` e comenta *"starts on login"*. Isso é setup local legado/de
> experimento, **não** a topologia de produção — o `AGENTS.md` da raiz declara exatamente isso, e
> a verificação confirma: `pm2 jlist` na máquina de desenvolvimento retorna `[]` enquanto
> `https://api.synkroo.com.br/health` responde `200`.
>
> Para topologia, acesso e deploy da VPS, consultar `../vps-hostinger/`.

---

## 1. Contexto e motivação

O produto nasceu como bot de WhatsApp com um CLI (`pi --mode rpc`) fazendo o trabalho de agente,
e ganhou um PWA depois. Hoje a arquitetura tem pontos de fragilidade documentados no próprio repo:

- `apps/whatsapp-bridge/src/pi-bridge-timeout.test.ts` existe com o comentário *"regressão:
  timeout só arma no envio real"* — teste de regressão para bug de timeout em subprocess JSONL.
- `.env.pi` define `WATCHDOG_INTERVAL_MS`, `WATCHDOG_MAX_RECONNECT_ATTEMPTS`,
  `WATCHDOG_BACKOFF_MS` — existe watchdog porque a Evolution API cai sozinha. Somado ao risco
  não-mitigável de ban do WhatsApp.
- O lembrete semanal depende de uma máquina de desenvolvimento ligada (§0.7).
- Domínio duplicado (§0.1) — toda regra nova precisa ser escrita duas vezes.

A ambição do produto também mudou: multi-usuário, com espaços individuais e compartilhados.

### 1.1 Duas motivações distintas, empacotadas como uma

**Isto precisa estar explícito para a spec não ser mal-interpretada durante a execução.**

| Fase | Esforço | Ganho de confiabilidade | Ganho de produto |
|---|---|---|---|
| 0. Preparo | baixo | **alto** (cron do lembrete) | nenhum |
| 1. Auth/usuários | alto | nenhum | pré-requisito |
| 2. Workspaces | **o maior** | nenhum | alto |
| 3. Chat no PWA | médio | médio | alto |
| 4. Desligar WhatsApp | médio | **alto** | médio |

Fases 1 e 2 consomem a maior parte do esforço e **não cortam nenhum ponto de falha**. Servem
multi-usuário — feature de produto legítima, mas não correção de arquitetura. Quem executar a
fase 2 deve saber que está em trabalho longo sem entrega visível, ou vai interpretar a demora
como fracasso.

---

## 2. Decisões travadas

| # | Decisão | Alternativas descartadas |
|---|---|---|
| D1 | **Cadastro só por convite.** Sem signup público. | Signup aberto (puxa verificação de e-mail, reset self-service, rate limiting anti-abuso); OAuth social como modelo primário |
| D2 | **Web Push no PWA** substitui o WhatsApp como canal de push. | Só in-app; e-mail transacional; manter bridge como transporte de saída |
| D3 | **Agente chama a API HTTP de `apps/api`.** Uma única implementação da regra de negócio. | Portar as ~55 tools do `.pi`; agente falando `pg` direto |
| D4 | **Paridade tripla.** Toda capacidade do Agent Pi vira endpoint + tool do agente + tela no PWA. | Capacidades exclusivas do agente sem equivalente na UI |
| D5 | **Transição fatiada, auth primeiro.** Cada fase em produção antes da próxima. | Chat primeiro (gera retrabalho de escopo em cada tool); branch longa |
| D6 | **Histórico de chat compartilhado por workspace.** 1 Durable Object por workspace. | 1 DO por (usuário, workspace); adiar decisão |

---

## 3. Arquitetura alvo

### 3.1 O que morre

- `apps/whatsapp-bridge/` — app inteiro
- Evolution API + watchdog + `.env.pi`
- Runtime `pi --mode rpc`
- `.pi/extensions/financial-tools/` — após a triagem de §3.4
- `pnpm reminder` + Task Scheduler do Windows
- Autenticação por `x-device-token`

### 3.2 O que permanece

- **`apps/api`** — Node + Fastify + `pg` na VPS. **Continua sendo a única fonte de regra de
  negócio.** Não migra para Workers (§8.1).
- **`apps/pwa`** — Next.js 16 em Cloudflare Workers.
- **Postgres `pi_financeiro`** — schema legacy, com os adapters existentes.

### 3.3 O que nasce

**`apps/agent`** — Worker com Cloudflare Agents SDK.

- `AIChatAgent` com streaming e persistência de mensagens
- **Uma instância de Durable Object por workspace**: `/agents/finance-chat/{workspaceId}` (D6)
- Tools do agente = **clientes HTTP dos endpoints de `apps/api`**. Sem `pg` no Worker.
- Cliente React no PWA via `useAgentChat`

Recursos do SDK que substituem infraestrutura própria:

| Necessidade | Recurso nativo | Substitui |
|---|---|---|
| Confirmar operação de valor alto | `needsApproval` / human-in-the-loop | a **UI de confirmação** do bridge (ver ressalva abaixo) |
| Lembrete semanal | `schedule("0 9 * * 1", ...)` | `schtasks` na máquina do dev |
| Push | Push notifications + VAPID | Evolution API |
| Chat streaming | `AIChatAgent` + `useAgentChat` | bridge + Pi RPC |

> **Ressalva — `needsApproval` não substitui `pending_operations`.**
> `needsApproval` vive no estado do Durable Object e cobre a aprovação **dentro de um turno de
> chat**. `pending_operations` é estado persistido no Postgres, visível fora do chat.
>
> Se o agente usasse apenas `needsApproval`, uma operação pendente seria invisível para o PWA —
> violando D4. Portanto:
>
> - `pending_operations` **permanece** como conceito de API + banco (§3.4)
> - `needsApproval` é a **camada de apresentação** dessa aprovação dentro do chat, e chama os
>   endpoints de confirm/cancel
> - O PWA tem tela própria listando operações pendentes, independente do chat

### 3.4 Triagem das ~55 tools do `.pi`

| Destino | Tools | Ação |
|---|---|---|
| **Já coberto** pelos 36 endpoints | `create_expense`, `create_income`, `create_transfer`, `list_*`, `get_balance`, `pay_statement`, `create_card_installments`, `payable_templates`, `goals_budgets`, … (~40) | Deletar após validar paridade |
| **Morre** — o LLM faz nativo | `categorizer`, `transfer-parser`, `transfer-classifier` | Deletar |
| **Endpoint + tool + tela novos** (D4) | `pending_operations`, `undo_last_action`, `duplicate-detector`, `payment_score`, `installment_score`, `monthly_projection`, `price-alerts`, `audit_logs` | Portar na Fase 0 (§6.1) |

A última linha é o custo real da paridade tripla: **8 features × (endpoint + tool + tela)**.

`duplicate-detector.ts` merece destaque — contém estratégia de detecção já pensada e documentada
(idempotency key exata → similaridade semântica por household + kind + descrição + valor + conta
+ janela de 1 dia). É conhecimento de domínio real, não boilerplate. Portar, não reescrever.

### 3.5 Modelo de segurança do agente

**O agente chama `apps/api` carregando o token do usuário final, nunca um service token
privilegiado.**

Razão: com credencial privilegiada, um prompt injection bem-sucedido vira acesso cross-workspace.
Com o token do usuário, o agente não consegue nada que o usuário já não pudesse, e a autorização
continua num lugar só (§4.3).

Isso é requisito, não preferência. Qualquer solução de auth que impeça esse repasse é
incompatível com esta spec (§6.2).

---

## 4. Modelo de dados e autorização

### 4.1 Tabelas novas

```sql
users        (id, email, name, active, created_at)
workspaces   (id, name, kind, created_at)              -- kind: 'personal' | 'shared'
memberships  (user_id, workspace_id, role, invited_by, accepted_at)
invites      (token_hash, workspace_id, email, role, expires_at, consumed_at)
sessions     (token_hash, user_id, expires_at, revoked_at)   -- CONDICIONAL, ver abaixo
```

> **`sessions` é condicional ao spike 0.4.** Se o Cloudflare Access for aprovado (§7.1), a sessão
> é gerenciada por ele e esta tabela **não existe** — `users` passa a ser resolvida a partir da
> identidade Access. `users`, `workspaces`, `memberships` e `invites` existem nos dois cenários.

`email` substitui `phone` como chave de identidade (o telefone só fazia sentido no mundo WhatsApp).

**Roles:** `owner` e `member` apenas. `viewer` fica adiado até existir caso de uso real (YAGNI).

**Tokens nunca em claro:** `invites.token_hash` e `sessions.token_hash` guardam hash, não o valor.
Note que `device_tokens.token` hoje guarda o token em claro
(`apps/api/src/auth/device-token.ts`) — essa tabela morre na Fase 1, não replicar o padrão.

### 4.2 `household_id` **não** é renomeado no banco

`workspaces` é o nome lógico em API, tipos e UI. A coluna física continua `household_id` em todas
as tabelas de domínio.

Razão: renomear atinge ~10 tabelas, todos os adapters `legacy-postgres.ts` e as tools do `.pi`.
Ganho funcional para o usuário: **nenhum**. Risco: alto. Não fazer.

Migração de dados: o household atual vira o workspace pessoal do owner
(`kind = 'personal'`), com uma `membership` de role `owner`.

### 4.3 Autorização — o custo real da Fase 2

Hoje toda rota deriva um único `householdId` do `x-device-token`. Multi-workspace transforma o
escopo em `(usuário, workspace ativo)`, e **toda leitura e toda escrita** passa a exigir
verificação de membership.

**Workspace ativo via header `x-workspace-id`**, não via path.
Path (`/w/:workspaceId/accounts`) seria mais explícito, mas reescreve a forma dos 36 endpoints e
dos 40 specs E2E. Header é menos invasivo com a mesma garantia, desde que §4.4 seja respeitado.

### 4.4 A autorização mora num lugar só

> **Requisito de segurança — não negociável.**
>
> Um `preHandler` do Fastify resolve `(userId, workspaceId, role)` **uma vez por requisição** e
> rejeita não-membro **antes** de qualquer handler executar. Todo handler recebe o escopo já
> resolvido e **nunca** deriva `workspaceId` a partir do header por conta própria.

Sem esse gargalo único existem 36 oportunidades independentes de IDOR: trocar `x-workspace-id`
no DevTools e ler as finanças de outra família. É o ponto onde este projeto mais facilmente vira
vazamento de dados.

**Reforço estrutural:** a camada de store (`apps/api/src/writes/store.ts`,
`apps/api/src/read-models/`) recebe o escopo como parâmetro obrigatório, de modo que o
compilador impeça uma query sem escopo.

### 4.5 Gate automático de authz

Um teste que **enumera as rotas registradas no Fastify** e afirma `403` para não-membro em cada
uma. Rota nova sem autorização quebra o build.

Isso espelha o matrix gate de cobertura E2E que já existe e já foi shipado no repo
(`.github/`, commits `54b88a4`, `270d980`). Testes que seguem o padrão da casa são mantidos;
os que fogem apodrecem.

---

## 5. Regressões aceitas e mitigações

### 5.1 Perda da captura zero-fricção

O WhatsApp permite "gastei 50 no mercado" digitado num app já aberto o dia inteiro. O PWA exige
abrir o PWA. É a regressão de produto mais séria desta spec, e é literalmente o motivo de bots
financeiros no WhatsApp existirem.

**Mitigações (Fase 4):**
- **Web Share Target** no manifest (Android) — compartilhar texto/print de comprovante para o
  PWA vira transação
- **Manifest shortcuts** — "Novo gasto" direto do ícone
- **Atalhos do iOS** chamando a API — recupera parte do fluxo, inclusive por voz

Nenhuma substitui integralmente o fluxo original. Aceito conscientemente.

### 5.2 Web Push no iOS exige instalação

Web Push no iOS só funciona com o PWA instalado na home screen via Safari. A Fase 4 precisa de
um fluxo de onboarding que instrua e verifique a instalação, senão o canal de push simplesmente
não existe para usuários de iPhone.

### 5.3 Centralizar concentra risco

`apps/api` já é SPOF e já demonstrou cair (502 do cloudflared tunnel).

Hoje, API caída derruba o WhatsApp mas o PWA mantém leitura via snapshot IndexedDB. Depois da
Fase 3, API caída derruba o PWA **e** o chat, porque o agente também depende dela.

Esta spec **não conserta isso** e a piora marginalmente. A leitura offline (§0.6) é a única
mitigação. Aceito.

Vale notar que D1 (convite) eleva a consequência: indisponibilidade deixa de afetar só o dono e
passa a afetar todos os membros convidados de todos os workspaces. Isso é argumento para
monitorar disponibilidade da VPS antes da Fase 3, não para mudar a arquitetura.

### 5.4 Custo de LLM passa a ser do projeto

Hoje o Pi CLI roda sob assinatura pessoal. `AIChatAgent` consome tokens por mensagem, por
usuário, em todos os workspaces. Com convite fechado e poucos usuários é trivial, mas é linha de
custo nova.

**Mitigação (Fase 3, desde o primeiro commit):** orçamento de tokens por workspace + rate limit.
Considerar roteamento híbrido — Workers AI (incluso) para classificação barata, modelo frontier
só no turno conversacional.

### 5.5 Troca de dependências, não corte

Saem: Pi CLI, Evolution API. Entram: Durable Objects, provedor de LLM, Web Push/VAPID, sistema de
autenticação. A contagem de peças não cai muito — o que melhora é a **qualidade**: DO e Workers
são infra gerenciada; Evolution API é wrapper não-oficial que reconecta sozinho porque cai.

A troca vale a pena. Mas é troca, e a spec não deve ser vendida como simplificação.

---

## 6. Fases

Cada fase = um plano de implementação próprio + deploy em produção antes da próxima.

### Fase 0 — Preparo

Nada muda em produção. Todo item é independente e reduz risco das fases seguintes.

| # | Item | Motivo |
|---|---|---|
| 0.1 | Extrair o setup de auth dos 40 specs E2E para uma fixture única | Hoje o device-token está espalhado. Centralizado, a troca de auth da Fase 1 toca **um** arquivo em vez de 40. De-risking mais barato disponível. |
| 0.2 | Tirar `reminder` do Task Scheduler → cron | Mata o pior ponto de falha do sistema (depende de máquina de dev ligada). ~1 dia, sem depender de nenhuma outra fase. |
| 0.3 | Portar as 8 features de §3.4 para `apps/api` como funções puras com teste, **com o Pi ainda rodando** | Permite comparar comportamento antes/depois. Deletar primeiro e reescrever depois joga fora código que funciona. |
| 0.4 | **Spike:** Cloudflare Access consegue repassar identidade do usuário final para `apps/api`? | Define a forma da Fase 1 (§7). Bloqueante para 1. |

### Fase 1 — Usuários e login por convite

Forma depende do resultado de 0.4 (§6.2).

- Tabelas `users`, `sessions`, `invites`
- Fluxo de convite: owner gera convite por e-mail → destinatário aceita → vira `user` + `membership`
- Remoção de `device_tokens` e do `AuthGate` baseado em PIN/device
- Recalibração dos E2E via fixture de 0.1

### Fase 2 — Workspaces e membership

- Tabelas `workspaces`, `memberships`; migração do household atual (§4.2)
- `preHandler` único de resolução de escopo (§4.4)
- Escopo obrigatório na camada de store (§4.4)
- Header `x-workspace-id` + seletor de workspace no PWA
- Gate automático de authz (§4.5)
- CRUD de workspace: criar, renomear, convidar membro, remover membro, sair

### Fase 3 — Chat no PWA com Agents SDK

- `apps/agent` — Worker com `AIChatAgent`, 1 DO por workspace (D6)
- Tools = clientes HTTP dos endpoints, carregando token do usuário (§3.5)
- `needsApproval` para operações de valor alto
- `useAgentChat` no PWA
- Guardrail de custo de token (§5.4) **desde o primeiro commit**
- Telas das 8 features de §3.4 (paridade tripla, D4)

### Fase 4 — Desligar o WhatsApp

- Remover `apps/whatsapp-bridge/`, `.pi/`, Evolution API, `.env.pi`
- Web Push + VAPID; tabela de subscriptions
- Onboarding de instalação no iOS (§5.2)
- Cron do lembrete migra para `schedule()` no DO
- Share Target + manifest shortcuts + Atalhos iOS (§5.1)
- Limpeza do README (hoje descreve arquitetura que não existe — §0.1)

---

## 7. Autenticação — decisão pendente do spike 0.4

### 7.1 Candidato preferido: Cloudflare Access

Encaixa no perfil: convite fechado, poucos usuários, tudo já em Cloudflare. Elimina armazenamento
de senha, tabela de sessões, fluxo de reset e rate limiting de login — a parte mais chata e mais
perigosa da Fase 1.

**Critério de aceitação do spike:** o Worker rodando `AIChatAgent` consegue repassar a identidade
Access do chamador para `apps/api` de modo que a API valide o **usuário final**, não um service
token.

Se não conseguir, o Access dá login mas quebra a propriedade de autorização-num-lugar-só (§4.4),
e **essa propriedade vale mais que o código economizado**. Nesse caso, descartar.

### 7.2 Fallbacks, em ordem

1. `better-auth` self-hosted, rodando no Node de `apps/api`
2. Clerk / WorkOS free tier
3. Auth próprio — último recurso, e com revisão de segurança dedicada

---

## 8. Fora de escopo

### 8.1 Mover `apps/api` para Workers

O argumento "você já vai tocar nas 36 rotas na Fase 2, toque uma vez só" é tentador e errado:
autorização de workspace é um `preHandler` mais um parâmetro de escopo; migração de runtime é
troca de driver, mudança de modelo de conexão e mudança de deploy. Juntar transforma a fase mais
arriscada em dois riscos não relacionados simultâneos.

Reabre também a questão do Postgres sem porta pública (§0.7) — hoje irrelevante porque o agente
só fala HTTP (D3). **Não verificado** se Hyperdrive alcança Postgres privado via Cloudflare
Tunnel; se este item for retomado algum dia, essa verificação é o custo dominante.

Projeto separado, depois de tudo estabilizado.

### 8.2 Role `viewer`

YAGNI até existir caso de uso (§4.1).

### 8.3 Outbox de escrita offline

Reverter a invariante de §0.6 é tentador ao centralizar tudo no PWA, mas há um bloqueio concreto:
`apps/api/src/writes/idempotency.ts` tem **TTL de 24h** com chave `(householdId, key)`. Um outbox
que reproduz depois de 24h offline não tem proteção de replay — risco de transação duplicada em
dados financeiros.

Adotar exigiria escopar a quedas curtas **ou** mudar o TTL. Nenhum dos dois nesta spec. Leitura
offline já entrega a maior parte do valor.

### 8.4 Multi-idioma, temas, billing

Não mencionados pelo usuário. Fora.

---

## 9. Critérios de aceitação

| # | Critério | Fase |
|---|---|---|
| A1 | `pnpm reminder` roda sem depender de máquina de desenvolvimento | 0 |
| A2 | As 8 features de §3.4 existem em `apps/api` com teste, comportamento comparado ao `.pi` | 0 |
| A3 | Troca de auth toca 1 arquivo de fixture, não 40 specs | 0→1 |
| A4 | Usuário entra por convite; não existe caminho de signup público | 1 |
| A5 | Nenhum token persistido em claro no banco | 1 |
| A6 | Usuário pertence a ≥1 workspace; troca de workspace ativo funciona no PWA | 2 |
| A7 | Gate de authz cobre 100% das rotas registradas; rota nova sem authz quebra o build | 2 |
| A8 | Nenhum handler deriva `workspaceId` do header por conta própria | 2 |
| A9 | Cada tool da coluna "já coberto" e "endpoint novo" de §3.4 tem tool equivalente no agente, verificada por inventário item a item contra `.pi/extensions/financial-tools/tools/` | 3 |
| A10 | Cada tool do agente tem tela equivalente no PWA (D4), verificada pelo mesmo inventário de A9 | 3 |
| A11 | Agente nunca usa credencial mais privilegiada que a do usuário (§3.5) | 3 |
| A12 | Operação de valor alto exige aprovação explícita | 3 |
| A13 | Web Push entrega no Android e no iOS instalado | 4 |
| A14 | `apps/whatsapp-bridge/` e `.pi/` removidos; nenhuma referência residual | 4 |
| A15 | README descreve a arquitetura real | 4 |

---

## 10. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Fase 2 abandonada pela metade (longa, sem entrega visível) | **alta** | alto | Fatiar em sub-entregas deployáveis; §1.1 explícito para quem executar |
| IDOR cross-workspace | média | **crítico** | §4.4 + §4.5 |
| Prompt injection escalando privilégio via agente | média | **crítico** | §3.5 — token do usuário, nunca service token |
| Spike 0.4 falha → auth próprio | média | alto | §7.2 fallbacks ordenados |
| Perda de adoção pela fricção de captura | média | alto | §5.1 mitigações |
| Custo de LLM sem controle | baixa | médio | §5.4 guardrail desde o commit 1 |
| Paridade tripla estoura escopo da Fase 3 | **alta** | médio | 8 features enumeradas em §3.4; se estourar, cortar telas antes de cortar endpoints |
| Regressão de comportamento ao portar as 8 features | média | médio | 0.3 porta com o Pi vivo para comparar |
