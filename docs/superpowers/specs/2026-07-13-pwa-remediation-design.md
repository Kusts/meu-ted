# PWA remediation design

Data: 2026-07-13  
Alvo: `apps/pwa` | Worker: `pi-finance-pwa.walissonead.workers.dev`

## Contexto

| Ambiente | Evidência | Estado |
|---|---|---|
| Checkout WIP | lint: 24 erros/11 warnings; test: 413 pass/47 fail em uma suíte; Next/OpenNext build verde | Não publicar |
| Worker publicado | `/sw.js` 404; headers CSP/HSTS/nosniff/referrer/permissions ausentes; assets hashados `max-age=0` | Remediação necessária |
| API | CORS permite origin canônico e rejeita origin hostil; IDOR/rate-limit não testados | Pendente autorização |

WIP local não prova regressão do Worker já publicado. Este documento não usa `../pi-finance-web`, depreciado.

## Objetivos

- Offline completo obrigatório, com leitura confiável e mutação bloqueada.
- Sessão local, snapshots e update seguros.
- CI bloqueia regressão antes de deploy.
- Estado financeiro separável/testável sem mudar contrato público.
- Worker com cache, headers, observabilidade e orçamento mensuráveis.

## Non-goals

- Sem redesign visual ou feature financeira.
- PIN continua removido intencionalmente; README/modelo de ameaça refletem decisão.
- Service worker nunca cacheia `api.synkroo.com.br` nem respostas autenticadas.
- Sem teste IDOR, rate-limit, brute force ou corrida sem credencial de teste e autorização explícita.
- Nenhum dado servidor é migrado, alterado ou removido.

## Arquitetura alvo

```text
AppStateProvider (fachada pública atual)
├─ sync-engine.ts       bootstrap, retry, status de domínio
├─ snapshot-store.ts    IndexedDB v2, migração, owner fingerprint, read-only
├─ commands.ts          comandos financeiros, guard offline, idempotência
├─ state-reducer.ts     transições puras do estado
├─ session.ts           logout, expiração, limpeza integral
└─ UnsavedChangesContext
   └─ update coordinator → service worker

Service worker
├─ precache: shell offline estático + assets
├─ fallback navigation: shell lê pathname e renderiza feature client + IndexedDB
├─ nunca: api.synkroo.com.br, RSC, resposta autenticada
├─ cache: buildId + schemaVersion
└─ kill switch: unregister + limpar caches
```

| Boundary | Regra |
|---|---|
| `AppStateProvider` | Mantém API pública até Fase 4 terminar |
| `sync-engine` | Não conhece JSX, storage ou Worker API |
| `snapshot-store` | Dados versionados; owner = SHA-256(token), nunca token bruto |
| `commands` | Requer online e token; usa idempotência onde API suporta |
| SW | Precacheia shell/_next estático; não lê token ou IndexedDB; nunca cacheia API, RSC query ou cross-origin |
| Middleware | Gera nonce CSP por HTML; assets hashados sem nonce |
| Auth | Token continua em localStorage pelo contrato API cross-origin; CSP, expiração e revogação mitigam. HttpOnly/BFF está fora de escopo. |

## Requisitos

| ID | Tipo EARS | Requisito | Aceite |
|---|---|---|---|
| R-01 | Event-driven | Quando usuário faz logout ou token expira, sistema deve remover token, snapshot IndexedDB, perfil e estado em memória, preservando somente app-shell estático. | Storage sensível vazio |
| R-02 | Ubiquitous | Sistema não deve aceitar `NEXT_PUBLIC_*TOKEN`, `*SECRET` ou chave privada no bundle cliente. | CI falha ao detectar |
| R-03 | Event-driven | Quando snapshot v1 existe e owner é validado, sistema deve migrá-lo transacionalmente para IndexedDB v2 ligado ao SHA-256 do token. | Sem token bruto em v2 |
| R-04 | Unwanted | Se snapshot estiver corrompido, incompatível ou owner não conferir, sistema deve apagá-lo e exigir rede para novo sync. | Sem dado antigo exibido |
| R-05 | State-driven | Enquanto rede indisponível e snapshot válido existir, sistema deve permitir apenas leitura marcada como desatualizada. | Comandos indisponíveis |
| R-06 | State-driven | Enquanto offline, sistema deve bloquear mutações antes de alterar estado local ou enviar request. | Zero request/mudança otimista |
| R-07 | Ubiquitous | Service worker deve ignorar host `api.synkroo.com.br` e qualquer request com credencial/autorização. | Nenhuma entrada API em Cache Storage |
| R-08 | Event-driven | Quando build novo estiver waiting e não houver formulário sujo, sistema deve oferecer atualização e ativar somente após confirmação. | Reload controlado |
| R-09 | State-driven | Enquanto formulário estiver sujo, sistema deve manter build novo waiting e explicar atualização pendente. | Nenhuma perda de draft |
| R-10 | Event-driven | Quando kill switch estiver ativo no próximo acesso online, sistema deve desregistrar SW e limpar caches nomeados. | App usa rede normal |
| R-11 | Ubiquitous | Worker deve responder HTML com CSP nonce, HSTS, nosniff, referrer, permissions e anti-frame. | Contract HTTP verde |
| R-12 | Ubiquitous | Worker deve servir assets hashados com `Cache-Control: public, max-age=31536000, immutable`. | Header verde |
| R-13 | Event-driven | Quando PR afetar PWA, CI deve executar gates introduzidos até a fase corrente; ao fim da Fase 5 deve executar lint, unit, mutation, build Cloudflare, E2E, Lighthouse e audit antes de merge. | Merge bloqueado vermelho |
| R-14 | Ubiquitous | README deve declarar app instalável/offline, PIN removido e limites da proteção local. | Docs sincronizados |
| R-15 | Ubiquitous | API deve emitir ACAO somente para origin canônico e nunca para origin hostil. | Contract CORS verde |

## Fases

| Fase | Escopo | Dependência | Gate |
|---|---|---|---|
| 0 | Baseline WIP, causa-raiz 47 timeouts, lint, CI inicial | nenhuma | lint 0; tests 100% verdes |
| 1 | Sessão, logout, snapshot cleanup, token público, CSP/headers | 0 | R-01/R-02/R-11 contract verdes |
| 2 | Seams sync/snapshot/comandos; IndexedDB v2 + migração | 1 | R-03..R-06 unit/mutation verdes |
| 3 | SW, precache, update coordinator, offline E2E, kill switch | 2 | R-07..R-10 E2E verdes |
| 4 | Decomposição integral de `AppStateProvider` | 2 | contrato público + coverage ratchet |
| 5 | Cache, bundle, Vite, RUM/OpenNext observability | 3/4 | CWV, audit, budgets verdes |

### Fase 0 — baseline e CI

- Reproduzir e isolar uma causa raiz dos 47 timeouts em `app-state-context.test.tsx`.
- Corrigir sem esconder assertion, timeout ou regra ESLint.
- Criar workflow CI versionado: install congelado, lint, unit, coverage, build Cloudflare, audit.
- Nenhum deploy automático nesta fase.

### Fase 1 — sessão e borda HTTP

- Centralizar `resetLocalSession()` para limpeza integral e idempotente.
- Remover suporte a token público; validar configuração de deploy sem ele.
- Implementar middleware CSP com nonce por resposta HTML.
- Configurar headers Cloudflare/Worker e contract tests para `GET /`, manifest, asset e CORS.
- CSP usa nonce para scripts; `connect-src` self + API; `style-src 'unsafe-inline'` é exceção temporária por estilos inline existentes, com remoção rastreada.
- Atualizar README para remoção intencional do PIN.

### Fase 2 — dados offline e seams

- Extrair `sync-engine`, `snapshot-store`, `commands` e reducer puro, preservando `AppStateProvider` como fachada.
- Migrar v1 localStorage → IndexedDB v2 somente após validar owner; concluir transação antes de apagar v1.
- Snapshot contém dados financeiros e timestamps, nunca token; owner fingerprint SHA-256 do token.
- Falha/corrupção/owner divergente descarta v2 e exige sync online.
- Offline é read-only. Comandos retornam erro explicável antes de estado otimista.
- Gate: provar em Next App Router navegação offline para cada rota antes de avançar ao SW.

### Fase 3 — PWA offline

- Adotar Serwist ou Workbox: precache shell offline estático e `_next/static` hashado; navegação same-origin é network-first com fallback offline.
- Fallback offline lê `location.pathname`, renderiza feature client correspondente e usa somente IndexedDB snapshot. Online continua App Router; RSC/API permanecem sem cache.
- Rotas offline obrigatórias: `/`, `/registros`, `/a-pagar`, `/patrimonio`, `/contas`, `/cartoes`, `/assinaturas`, `/orcamentos`, `/metas`, `/categorias`, `/relatorios`, `/perfil`.
- Nunca cachear `api.synkroo.com.br`, cross-origin, request com credencial/auth header, `/pwa-control` ou RSC query-bearing.
- Precache total ≤2 MB comprimido; definir orçamento de rotas antes de incluir novas.
- Todo formulário mutante registra dirty state em `UnsavedChangesContext`; coordinator controla SW waiting/activate.
- Banner: atualização disponível, atualizar agora, atualizar depois; nunca recarregar silenciosamente.
- Kill switch: `/pwa-control` network-only, `Cache-Control: no-store`, valor de env Cloudflare; page boot desregistra SW e remove somente caches `pi-finance-*`.

### Fase 4 — contexto

- Mover implementação do contexto para módulos da arquitetura alvo.
- Cada extração preserva contrato e testes de caracterização.
- Proibido refactor visual/conceitual durante extração.

### Fase 5 — operação

- Atualizar Vite para versão corrigida; separar advisories PWA de siblings.
- Cache imutável para assets hashados; HTML permanece privado/dinâmico.
- RUM/Web Vitals sem ID, token, valores financeiros ou query string.
- Dashboard: bootstrap, sync, migration, SW install/update/failure, cache cleanup.

## Migração e rollback

```text
v1 localStorage
  └─ validar token e owner
     └─ transação IndexedDB v2
        ├─ gravar snapshot + fingerprint + schema
        ├─ validar leitura v2
        └─ apagar v1 e token bruto do snapshot
```

| Cenário | Ação |
|---|---|
| Migração falha | Mantém v1 intacto; retry na próxima sessão online |
| V2 inválido | Apaga somente v2; exige novo sync |
| Rollback código | Descarta snapshot local incompatível; servidor permanece origem verdade |
| Cache antigo | Cache nomeado `buildId-schema`; activate remove apenas versões obsoletas |
| Emergência SW | Flag desregistra SW, limpa caches, carrega rede no próximo acesso online |

## Testes

| Fase | Unit RED-first | Contract | Render snapshot | Playwright E2E | Mutation/Coverage |
|---|---|---|---|---|---|
| 0 | bootstrap, 401, read-only | — | não | smoke rotas | lint/unit/build/audit; ≥80% modificado |
| 1 | cleanup, config token | headers/CSP/CORS | não | logout/expiração | sessão ≥70% mutation |
| 2 | migração, corrupção, commands | API mock schema | stale/offline banner | prova App Router offline | snapshot/sync/commands ≥70% mutation |
| 3 | cache matcher, coordinator | SW cache policy | update/offline | instalação, todas rotas offline, reload, mutação bloqueada, update com/sem draft, kill switch | ≥80% modificado |
| 4 | reducer, adapters | contrato fachada | quando saída complexa | fluxos críticos | contexto ≥70% mutation |
| 5 | cache headers/metrics scrubber | HTTP/RUM schema | não | Lighthouse CI | budgets ratchet |

E2E obrigatório: primeira instalação, carga direta e reload offline de cada rota listada, leitura snapshot, mutação bloqueada, update sem draft, update com draft, kill switch.

## Gates mensuráveis

| Área | Gate |
|---|---|
| Lint | 0 erros, 0 warnings |
| Testes | 100% verdes |
| Cobertura | Código novo/modificado ≥80% |
| Mutation | sessão, snapshot, sync, commands ≥70% |
| Build | Next + OpenNext Cloudflare verdes |
| PWA | `/sw.js` 200; API/RSC/cross-origin ausentes de Cache Storage; precache ≤2 MB comprimido |
| Performance | Lighthouse mobile: Performance ≥90, A11y ≥95, CLS ≤0,1, LCP ≤2,5s, TBT ≤200ms |
| Bundle | Sem regressão >5%; rota inicial ≤200 KB gzip |
| HTTP | asset hashado `immutable`; HTML privado; headers R-11 |
| Segurança ativa | IDOR/autorização/rate-limit somente após autorização explícita |

## Riscos e trade-offs

| Decisão | Ganho | Custo/mitigação |
|---|---|---|
| CSP nonce | Reduz XSS | HTML dinâmico; testar App Router/inline RSC |
| IndexedDB | Escala e dados estruturados | Migração; transação + rollback local |
| Offline read-only | Sem conflito financeiro | Usuário não registra sem rede; banner claro |
| Precache rotas | Navegação offline | Instalação maior; budget ≤200 KB gzip inicial |
| SW waiting | Não perde formulário | Update pode atrasar; mostrar estado/ação |
| Context seams | Testabilidade | Mais arquivos; manter fachada estável |

## Observabilidade

| Evento | Campos permitidos | Proibidos |
|---|---|---|
| Bootstrap/sync | resultado, duração, domínio, classe erro | token, ID, saldo, query |
| Snapshot/migração | schema, resultado, duração | conteúdo, fingerprint, token |
| SW | install, activate, update, cache cleanup, kill switch | URLs com query, dados API |
| Web Vitals | métrica, valor, rota normalizada, buildId | usuário, household, valores financeiros |

Worker/OpenNext logs ficam habilitados. Alertar somente taxas agregadas de erro, não payloads.

## Critérios de saída

- Todas fases/gates relevantes verdes.
- Worker publicado passa headers, cache, SW e E2E offline.
- Lighthouse/CWV medidos em produção.
- Testes ativos de API documentados ou explicitamente adiados por falta de autorização.
- WIP pré-existente não é misturado ao escopo desta remediação.
