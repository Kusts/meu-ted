# PWA Backend Source-of-Truth Spec

**Data:** 2026-06-26
**Status:** draft for review
**Escopo:** `apps/pwa/` consumindo `pi-finance-api`
**Objetivo:** garantir que o PWA trate o backend como fonte da verdade para dados financeiros, sem fallback silencioso para mocks, permitindo apenas snapshot/cache local explícito em modo leitura quando a API configurada estiver indisponível.

---

## 0. Pré-condições de arquitetura

> Esta seção fixa fatos do código atual que o restante da spec assume. Sem ela, várias regras (§6.4, §6.5, §7.1) parecem contradizer a implementação.

`apps/pwa/src/components/RootProviders.tsx` monta a árvore como
`AuthGate → AppStateProvider → SheetProvider`. Consequências:

1. **`AppStateProvider` só monta após `AuthGate` chegar ao estado `unlocked`.** Antes disso, `AuthGate` renderiza telas de registro/PIN, não o app financeiro.
2. **Quando o provider monta com API configurada, já existe um token presente e validado.** `AuthGate` (`apps/pwa/src/features/auth/AuthGate.tsx`) registra o dispositivo (`POST /auth/devices/register`), persiste o token em `pi-finance:token` (mesma chave lida por `client.getAuthToken()`) e valida contra `GET /auth/devices/me` no boot. Um `401` nesse boot já dispara `resetLocalSession()` + volta para registro.
3. **`AuthGate` cobre o `401` de boot, não o `401` de runtime.** Falhas `401` que ocorram depois — dentro do `load()` do provider ou em writes — hoje caem no `catch` genérico e viram apenas `error: string`. Esse é o gap real de §6.4, não o boot.
4. **O PIN é local; o token é remoto.** "Desbloqueio" = PIN (`pin-store`, hash local). Um `401` de runtime significa token revogado no servidor → exige re-registro, não apenas re-PIN.

Implicação para o split `isApiConfigured()` (apenas base URL) vs. `apiUsable()` (base URL **e** token): no caminho real, quando o provider monta com API configurada, o token está presente. O cenário "configurado mas sem token" (§6.5) é, na prática, inalcançável para a UI financeira, porque `AuthGate` bloqueia antes. A spec deve tratá-lo como invariante garantida por `AuthGate`, não como ramo a implementar no provider.

---

## 1. Contexto

O PWA foi evoluído inicialmente com suporte a mock local e depois ganhou integração com `pi-finance-api`. Hoje a integração existe, mas ainda há pontos onde a UI pode mostrar dados que não vieram do backend real:

- `apps/pwa/src/lib/state/app-state-context.tsx` inicializa estado com `mock-data`.
- Quando a API falha, o provider mantém os mocks visíveis e apenas expõe `error`.
- `apps/pwa/src/features/cards/CardsPage.tsx` ainda contém fallback sintético para histórico de faturas (linhas ~603-622).
- **`debts` vaza mock sempre, mesmo 100% online.** Em `app-state-context.tsx`, `debts` é declarado com `useState(mockDebts)` **sem setter** e `load()` nunca o atualiza (não há endpoint de dívidas). `GoalsPage.tsx` renderiza `debts` direto do contexto. Esta é a violação mais clara e incondicional da política atual.
- **`load()` é tudo-ou-nada via `Promise.all`.** Seis fetches (accounts, categories, transactions, payables, budgets, goals) não têm `.catch`; apenas subscriptions e cards têm. Logo, um único `5xx` (ex.: goals) rejeita o `Promise.all` inteiro → nenhum `setX` roda → **todos os mocks permanecem visíveis** e só `error` é setado. A falha não é monolítica como a UI sugere; é por endpoint.
- O requisito de produto mudou: a maior parte dos registros será criada pelo agente via WhatsApp e persistida direto no banco. Logo, o PWA precisa refletir o backend, não uma verdade local paralela.

Esse desvio é perigoso porque o usuário pode abrir o PWA e interpretar como real um saldo, fatura, categoria, conta a pagar ou histórico que, na prática, não veio do banco.

---

## 2. Decisão de política

### Política escolhida

**Quando a API estiver configurada mas indisponível, o PWA deve mostrar o último snapshot/cache local em modo somente leitura.**

### Interpretação correta dessa política

Isso **não** significa voltar para `mock-data`.

Significa:
- o PWA pode exibir **somente dados previamente sincronizados do backend**;
- esse snapshot local deve ser tratado como **cache explícito**, não como verdade atual;
- a UI deve sinalizar que está em **modo offline / desatualizado / somente leitura**;
- nenhuma escrita deve parecer concluída se o backend não confirmou.

### Consequência principal

Com API configurada:
- **`mock-data` deixa de ser permitido como fonte visual de dados financeiros**;
- o único fallback aceitável passa a ser **snapshot real previamente obtido do backend**.

---

## 3. Objetivos

### Objetivos funcionais

1. Quando a API estiver configurada e saudável, o PWA deve carregar e exibir dados do backend.
2. Quando a API estiver configurada e falhar, o PWA deve mostrar:
   - último snapshot sincronizado do backend, se existir;
   - indicador explícito de modo somente leitura / dados possivelmente desatualizados.
3. Quando não houver snapshot disponível e a API falhar, o PWA deve mostrar estado vazio + erro explícito.
4. O PWA deve refletir dados registrados fora dele, inclusive escritos pelo agente via WhatsApp direto no backend, após reload ou nova sincronização.
   - **Gap atual:** `load()` roda uma única vez (`loadedRef.current` trava re-execução) e não há pull-to-refresh nem refetch em foco/visibilidade. Logo "nova sincronização" não tem mecanismo hoje além de reload completo da página. Definir, em escopo, ao menos um gatilho de refetch (reload já cobre o mínimo; pull-to-refresh ou refetch em `visibilitychange` é desejável) — ou declarar explicitamente que reload é o único gatilho desta fase.
5. O PWA não deve inventar histórico, saldos, faturas, listas ou agregados financeiros sintéticos quando a API estiver configurada.

### Objetivos de consistência

6. Com API configurada, toda informação financeira visível deve ser:
   - retornada diretamente por endpoint real; ou
   - derivada determinística e localmente a partir de dados reais retornados pela API.
7. Nenhuma tela deve usar `mock-data` ou fallback sintético como substituto silencioso para falha de rede/back.

---

## 4. Não objetivos

1. Não redesenhar a UI do PWA.
2. Não implementar offline-first completo com fila de sync.
3. Não criar edição colaborativa em tempo real.
4. Não reestruturar endpoints backend sem necessidade comprovada.
5. Não corrigir todos os placeholders de produto “Em breve” que não impactam a verdade dos dados financeiros.

---

## 5. Fontes de verdade permitidas

## 5.1 Com API configurada

Fontes permitidas:
1. resposta atual da API;
2. snapshot/cache local originado de resposta anterior da API;
3. derivação local sobre dados 1 ou 2.

Fontes proibidas:
1. `apps/pwa/src/lib/state/mock-data.ts`;
2. arrays sintéticos hardcoded para preencher vazio “bonito”;
3. histórico fabricado a partir de aproximação local;
4. placeholders financeiros que se parecem com dados reais.

## 5.2 Sem API configurada

Se a API **não** estiver configurada, o modo demo/mock pode continuar existindo como experiência de desenvolvimento/local. Esse modo deve ser tratado como **modo explícito sem backend**, não como comportamento misturado ao modo integrado.

---

## 6. Regras operacionais por cenário

### 6.1 API não configurada

Condição:
- base URL ausente.

Comportamento:
- PWA pode rodar em modo mock/demo.
- UI deve poder sinalizar que está sem backend, se necessário.
- Esse modo é aceitável apenas como ambiente local/dev/demo.

### 6.2 API configurada + token disponível + fetch bem-sucedido

Comportamento:
- carregar dados do backend;
- atualizar estado em memória;
- persistir snapshot/cache local por domínio relevante;
- renderizar normalmente;
- permitir writes online.

### 6.3 API configurada + token disponível + falha de rede/timeout/5xx

Comportamento:
- tentar ler snapshot/cache local do backend;
- se houver snapshot, renderizar snapshot em **modo somente leitura**;
- exibir banner/estado explícito indicando:
  - dados possivelmente desatualizados;
  - backend indisponível;
  - writes bloqueadas ou sujeitas a erro.
- se não houver snapshot, renderizar vazio + erro explícito.

#### Falha parcial de fetch — política: degradação por domínio

O `load()` atual usa `Promise.all` tudo-ou-nada (ver §1). **Decisão fechada: degradação por domínio.** Substituir o `Promise.all` por resolução independente por domínio (`Promise.allSettled` ou fetch por-domínio com `.catch` individual), aplicando o seguinte:

- domínio que retornou `2xx` ⇒ aplica o dado real ao estado;
- domínio que falhou (`5xx`/timeout/network) ⇒ usa o snapshot **daquele domínio** se existir; senão, empty honesto;
- nenhum domínio que falhou pode permanecer exibindo `mock-data` (invariante);
- a UI sinaliza **por seção** quando o dado está desatualizado/indisponível, em vez de um único banner global de erro;
- `dataSource`/`syncedAt` (§7.3) passam a ser potencialmente **por domínio**, não só globais — um domínio pode estar `live` enquanto outro está `snapshot`.

Racional: um endpoint não-crítico instável (ex.: subscriptions) não deve zerar a Home nem derrubar domínios saudáveis. Isso alinha com "backend como verdade por domínio".

Trade-off aceito: a tela pode combinar dados de instantes de sincronização diferentes entre domínios. Mitigação: a sinalização por seção (`syncedAt` por domínio) torna isso explícito ao usuário, e nenhum domínio mistura fontes internamente.

### 6.4 API configurada + `401` / token inválido (em runtime, pós-unlock)

> O `401` de **boot** já é tratado por `AuthGate` (§0.3): valida `GET /auth/devices/me` e, em `401`, faz `resetLocalSession()` + volta para registro. Esta seção trata do `401` de **runtime** — dentro do `load()` do provider ou em writes — que hoje cai no `catch` genérico e vira só `error: string`.

Comportamento:
- considerar a sessão não autenticada/expirada;
- não usar mock;
- snapshot pode ser exibido apenas se a política de segurança permitir dados anteriores sem sessão ativa.

### Decisão para este projeto

Para este projeto, **snapshot local não deve ser exibido após `401`**.

Racional:
- `401` implica problema de autenticação/dispositivo, não simples indisponibilidade;
- manter dados financeiros visíveis sem sessão válida aumenta risco de exposição indevida.

Logo, em `401` de runtime:
- limpar estado autenticado em memória;
- limpar snapshot protegido associado ao token/dispositivo atual;
- reconduzir o usuário ao fluxo do `AuthGate` (re-registro do dispositivo — não apenas re-PIN, pois `401` = token revogado no servidor);
- exibir mensagem de sessão expirada/inválida.

Implementação esperada: o provider precisa distinguir `ApiError.status === 401` dos demais erros e disparar `resetLocalSession()` + forçar o `AuthGate` de volta a `register` (hoje `AuthGate` só faz isso no boot; falta um canal para o data layer sinalizar `401` de runtime ao gate).

### 6.5 API configurada + token ausente

> Ver §0: sob `AuthGate`, o `AppStateProvider` só monta após `unlocked`, quando o token já existe e foi validado. Portanto, "configurado + sem token" é **invariante impedida por `AuthGate`**, não um ramo a implementar no provider.

Comportamento esperado (garantido por `AuthGate`, não pelo provider):
- não inicializar `mock-data` na UI financeira;
- seguir fluxo de autenticação do app;
- não exibir dados financeiros até obter sessão válida.

Se um teste ou refactor expuser o provider sem `AuthGate` por cima, o comportamento defensivo é o mesmo de §7.1 para `isApiConfigured() === true`: coleções vazias + loading, nunca mock.

---

## 7. Modelo de estado desejado

## 7.1 Bootstrap do provider

Arquivo-alvo principal:
- `apps/pwa/src/lib/state/app-state-context.tsx`

### Regra nova

Se `isApiConfigured() === true`:
- o provider **não** deve inicializar com `mock-data`;
- deve inicializar com coleções vazias + estado de carregamento apropriado;
- deve tentar hidratar do cache/snapshot local antes ou junto do fetch, conforme a implementação escolhida;
- depois deve tentar sincronizar com a API.

Se `isApiConfigured() === false`:
- o provider pode continuar inicializando em modo mock.

### Reconciliação `isApiConfigured()` × `apiUsable()`

Hoje o provider inicializa com mock (`useState(mockAccounts)`, etc.) e o efeito de fetch é gated por `apiUsable()` (`isApiConfigured() && token`). O bootstrap acima é keyed por `isApiConfigured()` (só base URL). Para não criar estado "configurado, sem token, preso em loading":

- a chave do bootstrap é **`isApiConfigured()`** (presença de base URL);
- a presença de token é garantida por `AuthGate` antes do provider montar (§0), então no caminho real `apiUsable()` ≡ `isApiConfigured()` neste ponto;
- o provider **não** deve depender de `apiUsable()` para decidir entre mock e vazio no init — deve usar `isApiConfigured()`. `apiUsable()` permanece útil apenas para gatear writes que exigem token.

## 7.2 Snapshot/cache local

O snapshot local deve:
- ser composto por dados reais previamente sincronizados do backend;
- ser versionável por domínio ou por payload agregado;
- incluir metadados mínimos:
  - `syncedAt`
  - `source = backend`
  - versão/schema do cache
  - identidade do dispositivo/token/household, quando aplicável

O snapshot não deve:
- armazenar mock;
- misturar dados de households/dispositivos diferentes;
- ser silenciosamente promovido a “verdade atual”.

## 7.3 Modo somente leitura

O `AppState` atual **não tem flag de modo** — só `loading`/`error`/`writeError`. É preciso introduzir estado explícito de origem dos dados. Como a política de falha é **por domínio** (§6.3, Opção B), o estado de origem é **por domínio**, com um agregado derivado para conveniência:

```ts
type DomainSource = "live" | "snapshot" | "unavailable" | "mock";
// "unavailable" = fetch falhou E não havia snapshot → dados vazios, backend fora.

interface DomainSync {
  source: DomainSource;
  syncedAt: string | null;   // ISO; null quando live/unavailable/mock
}

// por domínio (accounts, transactions, payables, ...)
sync: Record<DomainKey, DomainSync>;

// agregado derivado: read-only se QUALQUER domínio essencial estiver
// em "snapshot" OU "unavailable" (STALE_SOURCES)
readOnly: boolean;
```

Um domínio em `source === "snapshot"` está desatualizado (cache); em `"unavailable"` está vazio por backend fora. Em ambos os casos `readOnly` liga ⇒ writes bloqueadas. Sem isso, um backend totalmente fora **sem** snapshot prévio marcaria os domínios como `live` vazios e deixaria writes liberadas — exatamente o furo que `"unavailable"` fecha. As telas e mutators leem esse estado em vez de inferir o modo a partir de `error`/`apiUsable()`, e sinalizam **por seção** (§6.3) usando o `syncedAt` do domínio correspondente.

Quando o app estiver servindo snapshot por indisponibilidade do backend:
- writes devem ser bloqueadas; ou
- o usuário deve receber erro explícito antes de qualquer confirmação visual enganosa.

Para este projeto, a regra preferida é:
- **modo somente leitura real** quando em cache fallback.

Ou seja:
- desabilitar CTAs de persistência; ou
- impedir submissão efetiva com mensagem clara.

> Nota de implementação: hoje os mutators fazem optimistic update **antes** de checar `apiUsable()` e só revertem no `catch`. Em modo snapshot isso produziria um "flash" de sucesso seguido de rollback. Em read-only os mutators devem checar `dataSource === "snapshot"` e recusar **antes** de qualquer alteração otimista de estado.

Não haverá fila offline nesta fase.

---

## 8. Política de writes

### Online

Quando backend estiver disponível:
- writes podem usar otimistic update, desde que exista rollback em erro;
- estado final só é considerado válido após confirmação do backend;
- cache local deve ser atualizado a partir do estado confirmado.

### Offline / backend indisponível

Quando o app estiver usando snapshot fallback:
- writes não devem persistir localmente como se fossem verdade;
- não deve existir “sucesso local” para transação, conta, categoria, pagamento, cartão ou assinatura;
- o usuário deve ser informado que o backend está indisponível.

---

## 9. Auditoria por tela

## 9.1 Home

Arquivo:
- `apps/pwa/src/features/home/HomePage.tsx`

Status esperado após correção:
- totais, insights, próximos vencimentos e resumos devem ser derivados de estado carregado do backend ou snapshot real;
- nenhuma seção pode depender de mock quando API estiver configurada.

## 9.2 Registros

Arquivo:
- `apps/pwa/src/features/records/RecordsPage.tsx`

Status esperado:
- lista, filtros e agrupamentos devem ser derivados apenas de `transactions` reais;
- sem dados fictícios para preencher histórico.

## 9.3 Contas

Arquivo:
- `apps/pwa/src/features/accounts/AccountsPage.tsx`

Status esperado:
- lista e saldo agregado devem refletir `accounts` reais do backend;
- sem cards de conta inventados.

## 9.4 Cartões

Arquivo:
- `apps/pwa/src/features/cards/CardsPage.tsx`

Achado atual:
- histórico de faturas possui fallback sintético.

Status esperado:
- contas/cartões reais via backend;
- statements reais via backend;
- se não houver statements, mostrar empty state honesto;
- remover fallback sintético do histórico.

## 9.5 Assinaturas

Arquivo:
- `apps/pwa/src/features/subscriptions/SubscriptionsPage.tsx`

Status esperado:
- lista deve refletir subscriptions reais;
- identidade visual pode continuar local, desde que os dados financeiros/listagem sejam reais.

## 9.6 Contas a pagar

Arquivo:
- `apps/pwa/src/features/payables/PayablesPage.tsx`

Status esperado:
- vencidas, próximas e pagas devem derivar de `payables` reais;
- agrupamentos locais são aceitáveis se baseados em dados reais.

## 9.7 Categorias

Arquivo:
- `apps/pwa/src/features/categories/CategoriesPage.tsx`

Status esperado:
- lista e subcategorias devem refletir backend;
- presets visuais de ícone/cor são aceitáveis como enriquecimento visual, desde que a entidade exibida exista de fato no backend.

## 9.8 Patrimônio

Arquivo:
- `apps/pwa/src/features/wallet/WalletPage.tsx`

Status esperado:
- patrimônio, contas e cartões devem derivar de `accounts`/`cardStatements` reais;
- não exibir agregados fabricados.

## 9.9 Metas e dívidas

Arquivo:
- `apps/pwa/src/features/goals/GoalsPage.tsx`

Achado atual (crítico):
- `debts` é inicializado com `mockDebts` **sem setter** e nunca é atualizado por `load()` — não há endpoint de dívidas. `GoalsPage.tsx` (aba "Dívidas", linha ~145) renderiza `debts` direto. Resultado: **dívidas mockadas aparecem como reais mesmo com API configurada e online.** É a violação mais incondicional da política (ver §1).

Status esperado:
- metas devem vir do backend;
- enquanto não existir endpoint de dívidas, a aba "Dívidas" **não** deve exibir mock: ou some, ou mostra estado "não implementado" explícito (empty honesto), nunca números fabricados;
- quando o endpoint existir, `debts` deve ganhar setter e ser carregado em `load()` como os demais domínios;
- não usar mock financeiro silencioso.

## 9.10 Orçamentos

Arquivo:
- `apps/pwa/src/features/budgets/BudgetsPage.tsx`

Status esperado:
- lista, progresso e comparações devem ser baseados em budgets reais e dados reais correlatos.

---

## 10. Mudanças funcionais esperadas

1. Separar claramente dois modos, keyed por `isApiConfigured()` (não `apiUsable()` — ver §7.1):
   - **modo mock/dev** sem API configurada;
   - **modo backend** com API configurada.
2. No modo backend, remover dependência visual de `mock-data` — incluindo `debts`, que hoje não tem setter nem endpoint (§9.9).
3. Persistir snapshot local real do backend.
4. Introduzir estado explícito de origem/fallback no `AppState` (`dataSource` + `syncedAt`, §7.3) e gatear writes por ele.
5. Remover qualquer fallback sintético financeiro em telas críticas (`CardsPage` histórico, `GoalsPage` dívidas).
6. Trocar o `Promise.all` por degradação **por domínio** (§6.3) e tratar `401` de runtime ligando o data layer ao `AuthGate` (§6.4).

---

## 11. Estratégia de testes

## 11.1 Provider

Arquivo principal:
- `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx`

Cobrir:
1. com API configurada + sucesso:
   - provider carrega backend;
   - atualiza snapshot.
2. com API configurada + falha 5xx/network:
   - usa snapshot real, não mock;
   - entra em modo somente leitura.
3. com API configurada + falha sem snapshot:
   - estado vazio + erro explícito.
4. com `401`:
   - não usa snapshot antigo;
   - limpa contexto autenticado;
   - exige reautenticação.
5. com API não configurada:
   - modo mock continua funcionando.

Cobrir também:
6. com API configurada + falha parcial (ex.: goals `5xx`, resto `2xx`):
   - domínios `2xx` aplicados como `live`;
   - domínio que falhou usa snapshot ou empty, nunca mock;
   - `sync[goals].source === "snapshot"` (ou empty) enquanto os demais seguem `live`.

## 11.2 Telas

Cobrir ao menos:
- `CardsPage` não mostra histórico sintético quando statements reais ausentes.
- `GoalsPage` não renderiza `mockDebts` no modo backend (aba dívidas em empty/"não implementado").
- telas não renderizam mock financeiro no modo backend após falha.

## 11.3 Verificação integrada

Validar em ambiente real ou local integrado:
1. gravar dado direto no backend;
2. recarregar PWA;
3. confirmar que dado aparece;
4. confirmar que snapshot acompanha última sincronização válida.

---

## 12. Critérios de aceite

1. Com API configurada, o PWA não mostra `mock-data` como dados financeiros reais.
2. Falha de rede/5xx não ativa fallback silencioso para mock.
3. O único fallback aceitável é snapshot real previamente sincronizado do backend.
4. Em fallback snapshot, a UI sinaliza modo somente leitura.
5. Em `401` de runtime, o app não mostra snapshot financeiro antigo; reconduz ao fluxo do `AuthGate` (re-registro) e exige sessão válida.
6. `CardsPage` não fabrica histórico de faturas.
7. `GoalsPage` não exibe `mockDebts`: aba de dívidas mostra empty/"não implementado" enquanto não houver endpoint, nunca números fabricados.
8. Falha parcial de fetch degrada **por domínio** (§6.3): domínios `2xx` aplicam dado real; domínio que falhou cai em snapshot/empty e nunca exibe `mock-data`; domínios saudáveis seguem `live`.
9. Dados gravados fora do PWA e persistidos no backend aparecem no app após reload/sync.
10. Testes automatizados cobrem a política acima.

---

## 13. Riscos e trade-offs

1. Introduzir snapshot local aumenta complexidade de estado e invalidação.
2. Bloquear writes em fallback pode reduzir conveniência, mas preserva integridade.
3. Algumas telas podem depender de derivação local sobre múltiplos endpoints; isso é aceitável se os insumos forem reais.
4. Pode haver gaps de endpoint para certas seções; nesses casos a UI deve degradar para empty state honesto, não para dado inventado.

---

## 14. Resumo executivo

A correção não é apenas “tirar mock”.

É formalizar dois modos distintos:
- **sem backend**: mock/dev explícito;
- **com backend**: backend como verdade, com cache local apenas como snapshot read-only em indisponibilidade.

No modo backend, qualquer dado financeiro visível deve vir do backend atual ou de snapshot real previamente sincronizado. Nada sintético, nada mock silencioso, nada fabricado para “preencher” a experiência.
