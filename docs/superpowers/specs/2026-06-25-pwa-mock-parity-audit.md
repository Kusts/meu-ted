# PWA Mock Parity Audit Spec

**Data:** 2026-06-25
**Escopo:** `design_handoff_pi_financeiro/App Financeiro Pi v2.dc.html` vs `apps/pwa/`
**Objetivo:** mapear inconsistências reais entre mock final e PWA atual, sem corrigir ainda.

## Fontes de verdade

| Prioridade | Fonte | Uso |
|---|---|---|
| 1 | `design_handoff_pi_financeiro/App Financeiro Pi v2.dc.html` | verdade visual e comportamental final |
| 2 | `design_handoff_pi_financeiro/README.md` | apoio estrutural quando HTML não detalha algo |
| 3 | `apps/pwa/src/app/**` | rotas reais |
| 4 | `apps/pwa/src/features/**` | comportamento real |
| 5 | `apps/pwa/src/components/**` | shell, nav, sheets, header |

## Método

1. Inventário do mock `.dc.html`.
2. Inventário das rotas e componentes reais do PWA.
3. Classificação dos achados em 3 buckets:
   - **Confirmado no código**
   - **Conflito mock/README**
   - **QA visual/manual pendente**

## Requisitos de paridade

- REQ-1: When usuário abre o PWA, the system shall expor as telas previstas no mock final.
- REQ-2: When usuário toca qualquer CTA visível no mock final, the system shall executar navegação, sheet ou ação equivalente real.
- REQ-3: When mock final define ícone, label, ordem ou affordance, the system shall reproduzir isso com fidelidade.
- REQ-4: When mock final define CRUD, the system shall oferecer fluxo clicável coerente, não placeholder.
- REQ-5: If README conflitar com `.dc.html`, then the team shall tratar `.dc.html` como fonte final.

## Inventário de rotas reais

Fonte: `apps/pwa/.next/app-path-routes-manifest.json`

| Rota | Existe |
|---|---|
| `/` | sim |
| `/registros` | sim |
| `/a-pagar` | sim |
| `/patrimonio` | sim |
| `/contas` | sim |
| `/cartoes` | sim |
| `/assinaturas` | sim |
| `/orcamentos` | sim |
| `/metas` | sim |
| `/categorias` | sim |
| `/relatorios` | sim |
| `/perfil` | sim |

## Matriz REQ x achados

| REQ | Achados ligados |
|---|---|
| REQ-1 | A1, B1, B2, B3, B4 |
| REQ-2 | A3, A5, A6, A7, A8, A9 |
| REQ-3 | A2, V1, V2, V3, V4, V5, V6, V7, V8 |
| REQ-4 | A3, A4, A5, A6, A7, A10 |
| REQ-5 | B1, B2, B3, B4 |

## Bucket A. Achados confirmados no código

### A1. Bottom nav ativa errada fora de 3 rotas

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-1, REQ-3 | alta | mock mantém nav completa em todas as telas, `App Financeiro Pi v2.dc.html:744-749` | `apps/pwa/src/components/AppShell.tsx:61-66` só reconhece `/`, `/registros`, `/a-pagar`; resto vira `home` |

**Impacto:** usuário em `/cartoes`, `/contas`, `/metas`, `/relatorios`, etc. vê destaque errado na navegação.

### A2. Labels da bottom nav divergentes

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | média | mock mostra label sempre visível e com `font-weight:600`, `App Financeiro Pi v2.dc.html:745-749` | `apps/pwa/src/components/BottomNav.tsx:121-124,169-172` só renderiza label se item estiver ativo e usa `font-bold` |

### A3. Sheet de nova transação tem CTA inline não implementados

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-2, REQ-4 | alta | mock exige criação inline `Nova`, `Nova subcat.`, `Nova conta`, `Novo cartão`, `App Financeiro Pi v2.dc.html:821-880` | `apps/pwa/src/components/NewTransactionSheet.tsx:325-334` categoria TODO; `408-417` conta TODO; `458-461` botão cartão sem fluxo real |

### A4. Parcelamento não entrega comportamento equivalente ao mock

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-4 | alta | mock prevê parcelas com presets + número livre, `App Financeiro Pi v2.dc.html:908-920` | `apps/pwa/src/components/NewTransactionSheet.tsx:190-192` só anexa `installmentsTotal`; `apps/pwa/src/components/AppShell.tsx:107-116` salva uma transação simples |

### A5. Fluxo de pagamento de fatura existe visualmente, mas não persiste

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-2, REQ-4 | alta | mock pede sheet de pagamento parcial/total real, `App Financeiro Pi v2.dc.html:956-975` | `apps/pwa/src/features/cards/CardsPage.tsx:229-233` `handlePay()` apenas fecha o sheet |

### A6. Fluxo “Novo cartão” existe visualmente, mas não persiste

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-2, REQ-4 | alta | mock mostra CTA de criação de cartão, `App Financeiro Pi v2.dc.html:241,286` ; README reforça CRUD em Cartões | `apps/pwa/src/features/cards/CardsPage.tsx:105-107` `handleSave()` apenas fecha o sheet |

### A7. Histórico de faturas do mock não existe como detail clicável real

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-2, REQ-4 | alta | mock tem lista clicável e detail sheet de fatura, `App Financeiro Pi v2.dc.html:980-999` | `apps/pwa/src/features/cards/CardsPage.tsx:576-599` renderiza linhas sintéticas, não clicáveis, sem detail |

### A8. Perfil: notificações não faz nada

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-2 | alta | mock abre fluxo de notificações via `openNotif`, `App Financeiro Pi v2.dc.html:1014-1017,1084+` | `apps/pwa/src/features/profile/ProfilePage.tsx:226-230` comenta explicitamente `notif is non-interactive for now` |

### A9. Perfil: botão sair não executa ação

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-2 | média | mock trata `Sair da conta` como CTA explícito, `App Financeiro Pi v2.dc.html:1019` | `apps/pwa/src/features/profile/ProfilePage.tsx:293-298` botão sem handler |

### A10. Perfil: itens de segurança são só visuais

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-4 | média | mock mostra subfluxo de segurança, `App Financeiro Pi v2.dc.html:1042-1055` | `apps/pwa/src/features/profile/ProfilePage.tsx:145-175` botões sem `onClick` |

### A11. Testes atuais não cobrem paridade funcional

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-2, REQ-4 | alta | mock depende de muitos fluxos clicáveis | `apps/pwa/src/app/__tests__/smoke.test.tsx` cobre render/manifest smoke, não CTA críticos |

## Bucket B. Conflitos entre README e `.dc.html`

Esses pontos **não devem ser tratados como bug do PWA ainda**. Primeiro decidir qual documento prevalece. Hoje, prevalece `.dc.html`.

| Tema | README | `.dc.html` | Status |
|---|---|---|---|
| Hero da home | README fala em mini-stats `Reservas/Metas`, `Faturas abertas`, `Dívidas` | `.dc.html` final mostra `Receitas`, `Despesas`, `Resultado`, `App Financeiro Pi v2.dc.html:61-67` | conflito documental |
| KPIs da home | README separa row `Receitas/Despesas/Resultado` | `.dc.html` já usa segunda row para `vs mês anterior`, `App Financeiro Pi v2.dc.html:84-87` | conflito documental |
| Relatórios período | README fala `Este mês / 3 meses / 6 meses / Este ano` | `.dc.html` final usa `Mês / Anterior / Trim. / Ano`, `App Financeiro Pi v2.dc.html:583-589` | conflito documental |
| Perfil | README admite nova rota ou modal | `.dc.html` final usa fluxo fortemente baseado em sheets, `App Financeiro Pi v2.dc.html:1004-1078` | conflito documental |

## Bucket C. QA visual/manual ainda pendente

Esses itens precisam revisão com execução visual ou leitura mais fina, mas ainda não são achados fechados de bug funcional.

| Item | Observação |
|---|---|
| spacing, tipografia, sombras | base parece próxima em várias telas, mas precisa checklist visual pixel-level |
| ícones do menu “Mais” | alguns parecem próximos, mas precisam comparação 1:1 com mock |
| cards de `Patrimônio`, `Orçamentos`, `Assinaturas`, `Categorias` | estrutura existe; precisa confronto fino de microcopy, alinhamento e affordance |
| `Registros` | filtros e lista existem; falta verificar equivalência de gesto CRUD e affordance de edição/exclusão |
| `Metas & Dívidas` | tela existe; precisa validar cada CTA e estado de parcelas com inspeção mais profunda |

## Auditoria resumida por área

| Área | Status | Nota |
|---|---|---|
| Rotas | forte | quase todas as telas do mock existem no app |
| Navegação | fraca | active state e labels divergentes |
| Nova transação | média/fraca | visual boa, inline CRUD incompleto, parcelamento incompleto |
| Cartões | fraca | create/pay/history ainda muito visuais |
| Perfil | média/fraca | chat ok, notificações e sair incompletos |
| Home | boa visualmente | sem bug confirmado estrutural contra `.dc.html` nas seções principais |
| Payables/Budgets/Wallet/Accounts/Subscriptions/Categories/Reports | média | presença boa; precisa QA fina e alguns fluxos reais |

## Varredura de paridade visual

### Inconsistências visuais confirmadas

#### V1. Sistema de ícones trocado por emoji no fluxo de transação

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | alta | mock usa ícones vetoriais nas categorias do sheet, `App Financeiro Pi v2.dc.html:828-833` | `apps/pwa/src/components/NewTransactionSheet.tsx:8-37` usa emoji como fonte principal de iconografia |

#### V2. Sistema de ícones trocado por emoji em Categorias

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | alta | mock mantém linguagem vetorial/tintada em categorias, `App Financeiro Pi v2.dc.html:513-569` | `apps/pwa/src/features/categories/CategoriesPage.tsx:10-23,150-168` usa presets e render por emoji |

#### V3. Serviços de assinatura usam emoji/placeholders em vez de identidade visual do mock

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | alta | README do handoff pede logos de serviços em Assinaturas; `.dc.html` final mostra cards do módulo como entidades com identidade visual própria | `apps/pwa/src/features/subscriptions/SubscriptionsPage.tsx:45-50` usa `🎬 🎵 📦 ✨ ▶️ 🤖` |

#### V4. Logos de contas foram reduzidos a monograma de 2 letras

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | média | mock usa badges/logos bancários consistentes nas listas, `App Financeiro Pi v2.dc.html:101-109` | `apps/pwa/src/features/home/HomePage.tsx:565-568`, `apps/pwa/src/features/accounts/AccountsPage.tsx:251-254`, `apps/pwa/src/features/wallet/WalletPage.tsx:172-175` usam `slice(0, 2).toUpperCase()` |

#### V5. Identidade de cartão no sheet e listas internas foi reduzida a iniciais/glyph genérico

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | média | mock usa face de cartão mais rica e bancos/bandeiras, `App Financeiro Pi v2.dc.html:241-245,257-272,964-966` | `apps/pwa/src/features/cards/CardsPage.tsx:239-245` usa bloco com iniciais; `530-543` simplifica detalhe |

#### V6. Tela de assinaturas lista cards com monograma, não logo do serviço

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | média | README do handoff pede “Logo do serviço” no card de assinatura; `.dc.html` final não detalha logo nominal, mas mantém identidade visual do módulo | `apps/pwa/src/features/subscriptions/SubscriptionsPage.tsx:304-307` usa 2 letras do nome |

#### V7. Ícone de “Contas” no menu Mais está semanticamente fraco

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | baixa | mock mostra grid de atalhos com identidade própria, `App Financeiro Pi v2.dc.html:758-761` | `apps/pwa/src/components/AppShell.tsx:159` usa ícone de casa/home para `Contas` |

#### V8. Peso tipográfico da bottom nav não bate com o mock

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | baixa | mock usa `font-weight:600`, `App Financeiro Pi v2.dc.html:745-749` | `apps/pwa/src/components/BottomNav.tsx:123,171` usa `font-bold` |

### Identidades visuais placeholder

| Item | Evidência | Leitura |
|---|---|---|
| contas bancárias | `HomePage.tsx:565-568`, `AccountsPage.tsx:251-254`, `WalletPage.tsx:172-175` | placeholder por iniciais, não branding real |
| cartões | `CardsPage.tsx:239-245` | placeholder por iniciais na área de pagamento |
| assinaturas | `SubscriptionsPage.tsx:45-50,304-307` | emoji no picker, monograma na lista |
| categorias | `NewTransactionSheet.tsx:8-37`, `CategoriesPage.tsx:150-168` | sistema inteiro baseado em emoji |

### Desvio de design tokens e linguagem visual

| Finding | Severidade | Evidência |
|---|---|---|
| Tokens globais existem e estão bons, mas muitos componentes ainda hardcodam cores, gradientes e tamanhos locais em vez de centralizar no sistema. | média | `apps/pwa/src/app/globals.css`; exemplos em `HomePage.tsx:326,789,922`, `CardsPage.tsx:53-75`, `WalletPage.tsx:91`, `SubscriptionsPage.tsx:260` |
| Há repetição de tamanhos arbitrários `rounded-[...]`, `text-[...]`, `px-[...]` em várias telas, o que aumenta chance de drift fino contra mock. | média | sweep em `NewTransactionSheet.tsx`, `CategoriesPage.tsx`, `SubscriptionsPage.tsx`, `CardsPage.tsx`, `AccountsPage.tsx`, `WalletPage.tsx`, `HomePage.tsx` |
| Alguns elementos usam heurística de cor por dado/placeholder e não mapeamento de marca/tipo do mock. | baixa | `apps/pwa/src/features/subscriptions/SubscriptionsPage.tsx:23-32`, `apps/pwa/src/features/cards/CardsPage.tsx:52-75` |

### Desvio confirmado de layout e hierarquia

| Viola | Severidade | Evidência mock | Evidência app |
|---|---|---|---|
| REQ-3 | média | bottom nav no mock mantém labels sempre visíveis, `App Financeiro Pi v2.dc.html:744-749` | `BottomNav.tsx:121-124,169-172` oculta labels inativas |
| REQ-3 | baixa/média | menu Mais no mock usa cards com forte identidade de ícone+tint, `App Financeiro Pi v2.dc.html:758-761` | `AppShell.tsx:156-196` está próximo, mas alguns ícones e semântica não batem 1:1 |
| REQ-3 | média | perfil no mock vive como stack de sheets com back affordance uniforme, `App Financeiro Pi v2.dc.html:1004-1078` | `apps/pwa/src/features/profile/ProfilePage.tsx` vira página independente em `/perfil` |

### QA visual ainda pendente de verificação em navegador

Esses pontos exigem captura visual/runtime para fechar 100%:

| Item | Status |
|---|---|
| alinhamento e ritmo vertical entre cards na home | pendente |
| contraste real de cores em estados ativos/inativos | pendente |
| espessura e escala de ícones por tela | pendente |
| densidade do header e respiro entre seções | pendente |
| consistência entre listas `/contas`, `/patrimonio`, `/home` | pendente |
| consistência entre cards de cartões na listagem e no detalhe | pendente |

## Severidade consolidada

### Alta

1. A1. Bottom nav ativa errada.
2. A3. Criação inline no sheet de transação incompleta.
3. A4. Parcelamento sem comportamento equivalente.
4. A5. Pagamento de fatura não persiste.
5. A6. Novo cartão não persiste.
6. A7. Histórico/detail de fatura ausente.
7. A8. Notificações não interativas.
8. A11. Testes sem cobertura de paridade funcional.
9. V1. Ícones por emoji no fluxo de transação.
10. V2. Ícones por emoji em Categorias.
11. V3. Assinaturas com emoji/placeholders em vez de identidade visual do mock.

### Média

1. A2. Labels da bottom nav divergentes.
2. A9. Sair da conta sem ação.
3. A10. Segurança só visual.
4. V4. Contas com monograma em vez de badge/logo coerente.
5. V5. Cartões com identidade simplificada demais em partes do fluxo.
6. V6. Cards de assinatura com monograma, não logo do serviço.
7. Desvio de design tokens e repetição de tamanhos locais.
8. Perfil como página dedicada em vez de stack de sheets do mock final.

### Baixa

1. V7. Ícone de `Contas` no menu Mais semanticamente fraco.
2. V8. Peso tipográfico da bottom nav divergente.
3. Heurísticas de cor ainda simplificadas em alguns módulos.
4. Itens de QA visual fino ainda pendentes de confirmação em navegador.

## Critério de aceite para 100% alinhado

- Bottom nav correta em todas as rotas.
- Labels, peso tipográfico e active state iguais ao mock final.
- Todos os CTA do sheet de transação funcionais.
- Pagamento de fatura total/parcial funcional.
- Novo cartão funcional.
- Histórico/detail de faturas funcional.
- Perfil completo ou escopo explicitamente reduzido.
- Nenhum TODO/placeholder visível em fluxos principais.
- Iconografia sem emoji/monogramas substituindo identidade do mock.
- Testes cobrindo navegação e CTA críticos.

## Resumo executivo

PWA atual **já cobre boa parte do mapa de telas** do mock.

Problema maior não é ausência de páginas. É **paridade comportamental + linguagem visual**:
- navegação ativa errada
- CTA visuais sem efeito real
- sheets que fecham sem persistir
- fluxos críticos de cartão incompletos
- iconografia trocada por emoji, monogramas e placeholders
- cobertura de teste muito rasa

Conclusão: projeto está **próximo estruturalmente**, mas **ainda longe de 100% de fidelidade visual e funcional** ao mock final.

## Próximo passo recomendado

Após revisão desta spec, criar plano em 3 blocos:

1. **Paridade estrutural**: bottom nav, active state, shell.
2. **Paridade funcional**: CTA, sheets, CRUD, persistência.
3. **Paridade visual fina**: ícones, logos, spacing, copy, affordance.
