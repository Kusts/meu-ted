# Handoff: Pi Financeiro — Redesign Completo do PWA

> **Atenção ao desenvolvedor:** os arquivos nesta pasta são **protótipos de design em HTML** — referências visuais e de comportamento criadas para validar o produto, **não** código de produção para ser copiado. A tarefa é **recriar esses designs no codebase React existente** (`pi-finance-web/`) utilizando seus padrões, hooks e bibliotecas já estabelecidos. O arquivo `.dc.html` é a fonte-verdade visual.

---

## Visão Geral

Redesign completo do PWA Pi Financeiro — app de finanças pessoais controlado via WhatsApp + agente IA (Pi). O novo design mantém a identidade verde/confiança, usa tipografia moderna e prioriza clareza de dados financeiros em tela mobile (390px).

**Fidelidade:** Alta fidelidade (hifi). O desenvolvedor deve recriar o UI pixel a pixel usando o design system documentado abaixo.

---

## Design System

### Cores

```css
/* Primárias */
--color-primary:        #0E8C5A;   /* Verde principal — CTAs, destaques */
--color-primary-dark:   #0A3A28;   /* Verde escuro — gradientes, fundo hero */
--color-primary-mid:    #0F6B45;   /* Verde médio — gradientes */
--color-primary-light:  #2FA56F;   /* Verde claro — barras, badges */
--color-primary-tint:   #E7F3EC;   /* Verde suave — fundos de badge/chip */

/* Semânticas */
--color-danger:         #C8483B;   /* Vermelho — despesas, alertas críticos */
--color-danger-tint:    #F7E9E7;
--color-warning:        #B8791F;   /* Âmbar — atenção, parcela atual */
--color-warning-tint:   #FBF1E3;
--color-info:           #3E6FB0;   /* Azul — informação */
--color-info-tint:      #E8EFF7;

/* Neutros */
--color-bg:             #F7F8F5;   /* Fundo geral */
--color-surface:        #FFFFFF;   /* Cards, sheets */
--color-border:         #ECEEEA;   /* Bordas de cards */
--color-border-strong:  #E0E3DE;   /* Separadores, inputs */
--color-text-primary:   #16201A;   /* Texto principal */
--color-text-secondary: #5C665E;   /* Texto secundário */
--color-text-muted:     #98A29A;   /* Labels, placeholders */
--color-fill-light:     #F4F5F2;   /* Fundos de input, chips */
--color-fill-medium:    #F1F3EF;   /* Barras de progresso fundo */
```

### Tipografia

```css
/* Fontes — importar do Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');

--font-ui:      'Plus Jakarta Sans', sans-serif;  /* Todo o UI, labels, botões */
--font-mono:    'Space Grotesk', monospace;        /* Valores monetários, números */

/* Escala */
--text-xs:   10px / 700 (labels uppercase, badges)
--text-sm:   11px / 600 (legendas, datas, muted)
--text-base: 13px / 400–600 (corpo, listas)
--text-md:   14px / 600–700 (subtítulos, nomes)
--text-lg:   15–16px / 700–800 (títulos de página)
--text-xl:   22–24px / 800 (headings principais)
--text-hero: 28–32px / 700 (valores monetários hero)

/* Valores monetários sempre usam font-mono com peso 600–700 */
```

### Espaçamento & Layout

```css
--page-padding:   20px;         /* Padding horizontal das páginas */
--page-pt:        14px;         /* Padding top das páginas */
--page-pb:        24px;         /* Padding bottom (acima da tab bar) */
--tab-bar-height: 72px;         /* Altura da bottom navigation */
--status-bar-h:   44px;         /* Altura da status bar */
--card-radius:    16–18px;      /* Border-radius dos cards */
--sheet-radius:   26px 26px 0 0; /* Border-radius dos bottom sheets */
--btn-radius:     100px;        /* Botões pill (maioria) */
--input-radius:   13px;         /* Inputs */
--chip-radius:    100px;        /* Chips / filtros */
```

### Sombras

```css
--shadow-card:   0 1px 3px rgba(0,0,0,.06);
--shadow-sheet:  0 -4px 24px rgba(10,30,20,.12);
--shadow-fab:    0 4px 18px rgba(14,140,90,.35);
```

### Animações

```css
/* Sheet enter */
@keyframes sheetUp {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
/* Page enter */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Duração padrão: 0.25–0.28s, easing: cubic-bezier(.2,.8,.2,1) */
```

---

## Estrutura de Navegação

### Bottom Navigation (5 itens)

```
[Resumo] [Registros] [＋ FAB] [A pagar] [Mais]
```

- **FAB central** (verde, 52px, sombra especial) — abre sheet de novo lançamento
- **"Mais"** abre um bottom sheet com grid de atalhos para as demais páginas

### Mapeamento de Rotas

| Tela mock | Arquivo React existente | Ação |
|---|---|---|
| Resumo (Dashboard) | `src/features/home/HomePage.tsx` | Redesign completo |
| Registros | `src/features/records/RecordsPage.tsx` | Redesign + CRUD + filtros |
| Cartões | `src/features/cards/CardsPage.tsx` | Redesign + fatura detail |
| A pagar | `src/features/payables/PayablesPage.tsx` | Redesign + marcar pago |
| Patrimônio | `src/features/wallet/WalletPage.tsx` | Redesign (só patrimônio) |
| Contas | `src/features/wallet/WalletPage.tsx` ou nova rota | Separar em página própria |
| Orçamentos | `src/features/budgets/BudgetsPage.tsx` | Redesign + aba receitas |
| Metas & Dívidas | `src/features/goals/GoalsPage.tsx` | Redesign + dívidas c/ parcelas |
| Relatórios | `src/features/reports/ReportsPage.tsx` | Redesign visual |
| Categorias | NOVA rota | `src/features/categories/CategoriesPage.tsx` |
| Assinaturas | NOVA rota | `src/features/subscriptions/SubscriptionsPage.tsx` |
| Perfil | NOVA rota ou modal | `src/features/profile/ProfilePage.tsx` |

---

## Componentes Globais

### BottomNav (`src/components/BottomNav.tsx`)

```
Layout: position fixed, bottom 0, width 100%, height 72px
Background: #fff, border-top: 1px solid #ECEEEA
Safe-area: padding-bottom: env(safe-area-inset-bottom)
5 itens: flex justify-around, align-items center

Ícone ativo: cor #0E8C5A, label visível abaixo
Ícone inativo: cor #98A29A, sem label

FAB central:
  width: 52px, height: 52px, border-radius: 50%
  background: linear-gradient(145deg, #0E8C5A, #0A3A28)
  box-shadow: 0 4px 18px rgba(14,140,90,.35)
  ícone: + branco, 22px
  position: relative, top: -10px (sobe levemente)
```

### Status Bar (topo)

```
height: 44px, padding: 0 20px
Exibe: hora (esquerda), sinal+wifi+bateria (direita) — estático no mock
background: transparente (herda da página)
```

### Bottom Sheet (padrão para todos os formulários)

```
position: fixed, inset: 0, z-index: 20
Overlay: rgba(10,30,20,.45)
Container:
  position: absolute, left: 0, right: 0, bottom: 0
  background: #fff
  border-radius: 26px 26px 0 0
  padding: 22px 20px 32px
  max-height: 88vh, overflow-y: auto
  animation: sheetUp 0.28s cubic-bezier(.2,.8,.2,1)

Drag handle: 
  width: 36px, height: 4px, border-radius: 2px
  background: #E0E3DE, margin: 0 auto 18px

Header do sheet:
  display: flex, align-items: center, gap: 12px
  Título: 16px/800
  Botão fechar: X branco em círculo #F4F5F2
```

### Inputs (padrão)

```
border: 1px solid #ECEEEA
border-radius: 13px
padding: 13px 14px
font-size: 14px / font-family: Plus Jakarta Sans
background: transparent
outline: none
Focus: border-color: #0E8C5A

Label acima:
  font-size: 11px / 700 / #98A29A
  text-transform: uppercase, letter-spacing: .05em
  margin-bottom: 6px
```

### Botão Primário

```
background: #0E8C5A
color: #fff
border: none
border-radius: 14px
padding: 15px
font-family: Plus Jakarta Sans / 700 / 15px
width: 100% (em sheets/forms)
cursor: pointer
```

### Botão Secundário (outline)

```
background: #fff
border: 1px solid #ECEEEA
color: #16201A
border-radius: 13px
padding: 13px
font-family: Plus Jakarta Sans / 600 / 14px
```

### Chips de filtro

```
Ativo:   background: #0E8C5A, color: #fff, border: none
Inativo: background: #F4F5F2, color: #5C665E, border: 1px solid #E0E3DE
border-radius: 100px, padding: 7px 13px, font-size: 12px/700
```

### Cards de lista (padrão)

```
background: #fff
border: 1px solid #ECEEEA
border-radius: 16px
padding: 16px
```

---

## Telas

---

### 1. Resumo (HomePage)

**Arquivo:** `src/features/home/HomePage.tsx`

**Layout:**
```
[Status bar 44px]
[Header: avatar foto + saudação "Bom dia, Marina" + sino notificações]
[Hero card verde gradient — saldo total]
[Row de KPIs: Receitas / Despesas / Resultado]  
[Card contas: lista mini de saldos]
[Card cartões: fatura total + uso do limite]
[Card contas a pagar: total/pago/a pagar]
[Card insights: lista calculada dos dados reais]
```

**Hero Card:**
```
background: linear-gradient(165deg, #0F6B45, #0A3A28)
border-radius: 20px
padding: 22px 20px
color: #fff

Linha 1: "Saldo total" — 12px / rgba(255,255,255,.7)
Linha 2: valor — Space Grotesk, 34px/600
Linha 3: row de 3 mini-stats (Reservas/Metas, Faturas abertas, Dívidas)
  cada um: background rgba(255,255,255,.12), border-radius 13px, padding 10px 12px
```

**KPI row (Receitas/Despesas/Resultado):**
```
display: grid, grid-template-columns: 1fr 1fr 1fr, gap: 10px
Cada card: background #fff, border 1px solid #ECEEEA, border-radius 14px, padding 12px
Label: 11px / #98A29A
Valor: Space Grotesk, 16px/700
Receitas: cor #0E8C5A
Despesas: cor #C8483B
Resultado: cor dinâmica (verde se positivo, vermelho se negativo)
```

**Insights (calculados do banco):**
```
background: #fff, border: 1px solid #ECEEEA, border-radius: 14px, padding: 14px
Cada insight: ícone colorido (14px) + texto (13px)
Severidades: good=#0E8C5A / warn=#B8791F / bad=#C8483B / info=#3E6FB0
```

**Lógica dos insights (calcular no front):**
- Taxa de poupança = (receitas - despesas) / receitas × 100
- Top categoria de gasto
- Orçamentos próximos do limite (>90%)
- Próxima conta a vencer

---

### 2. Registros (RecordsPage)

**Arquivo:** `src/features/records/RecordsPage.tsx`

**Layout:**
```
[Header: "Registros" + botão filtro]
[Campo de busca]
[Row chips: Tudo | Despesas | Receitas | Transf. | --- | 7d | 30d | 90d]
[Row chips: categorias (horizontal scroll)]
[Lista de transações agrupadas por data]
```

**Card de transação:**
```
display: flex, gap: 12px, padding: 12px 0
border-bottom: 1px solid #F1F3EF

Ícone: 40x40px, border-radius 12px, fundo tintado da categoria
Conteúdo: descrição (14px/600) + categoria·conta (11px/#98A29A)
Valor: Space Grotesk, 15px/700
  despesa: cor #C8483B, prefixo "−"
  receita: cor #0E8C5A, prefixo "+"
  transferência: cor #3E6FB0

CRUD: long-press ou swipe abre menu editar/excluir
```

**Sheet de nova transação:** (ver seção dedicada abaixo)

---

### 3. Sheet de Nova Transação

**Arquivo:** `src/components/NewTransactionSheet.tsx`

3 abas no topo: **Despesa | Receita | Transferência**

**Campos Despesa / Receita:**
```
1. Tipo de lançamento (tab selector)
2. Valor — input hero grande (Space Grotesk 36px) com R$ prefix
3. Data — input que abre mini-calendário inline
4. Descrição — input texto
5. Categoria — picker com chips + botão "+ Nova categoria"
6. Subcategoria — picker (aparece se categoria selecionada tiver subs)
7. Conta ou Cartão — duas linhas separadas:
   - "Conta" com chips das contas bancárias
   - "Cartão" com chips dos cartões de crédito
   (nunca misturar contas e cartões na mesma linha)
8. Parcelamento (apenas despesa):
   - Presets: 1x, 2x, 3x, 6x, 12x
   - Campo livre: "__ vezes"
9. Botão "Salvar lançamento"
```

**Campos Transferência:**
```
1. Valor
2. Data
3. Conta de ORIGEM (picker — apenas contas bancárias)
4. Conta de DESTINO (picker — apenas contas bancárias)
5. Descrição (opcional)
6. Botão "Confirmar transferência"
```

**Criação inline de categorias/contas/cartões:**
```
Ao clicar "+ Nova categoria":
  → abre input inline (sem fechar o sheet)
  → digita nome + escolhe ícone/cor
  → confirma → nova opção aparece selecionada automaticamente

Mesmo padrão para "+ Nova conta" e "+ Novo cartão"
```

---

### 4. Cartões (CardsPage)

**Arquivo:** `src/features/cards/CardsPage.tsx`

**Layout:**
```
[Header: "Cartões" + botão "+ Novo cartão"]
[Card horizontal scroll — visual de cartão físico 300x160px]
[Tabs: Fatura atual | Histórico de faturas]

Fatura atual:
  - Valor total da fatura em vermelho
  - Barra de uso do limite (verde → âmbar → vermelho por %)
  - Lista de compras da fatura (descrição + data + valor)
  - Botão "Pagar fatura"

Sheet pagar fatura:
  - Valor da fatura + data de vencimento
  - Input "Valor a pagar (parcial)" — se vazio = total
  - Botão confirmar

Histórico de faturas:
  - Lista de faturas anteriores clicáveis
  - Ao clicar → abre sheet com lançamentos da fatura + status (paga/aberta)

CRUD de cartão (sheet):
  - Nome, bandeira, banco, limite, dia fechamento, dia vencimento, cor
```

**Card visual do cartão:**
```
width: 300px, height: 160px (scroll horizontal se múltiplos)
border-radius: 18px
background: gradient definido pelo banco (ver mapeamento de bancos abaixo)
padding: 20px
Linha 1: logo banco (ícone) + nome
Linha 2 (centro): número mascarado •••• •••• •••• 1234
Linha 3 (rodapé): titular + bandeira
```

---

### 5. A Pagar (PayablesPage)

**Arquivo:** `src/features/payables/PayablesPage.tsx`

**Layout:**
```
[Header: "A pagar" + botão "+ Novo"]
[Card resumo: 3 KPIs — Total | Pago | A pagar]
[Filtros: Todos | Em aberto | Vencidas | Pagas]
[Grupos: "Vencidas", "Próximas (7 dias)", "Pagas"]
```

**Card de conta a pagar:**
```
display: flex, gap: 12px, padding: 14px, border-radius: 14px
background: #F4F5F2

Ícone: 44x44px
Conteúdo: nome (14px/700) + vencimento (12px/#98A29A)
Valor: Space Grotesk, 16px/700
Badge status: Vencida (vermelho) | Em aberto (âmbar) | Paga (verde)
Botão "Pago": aparece apenas em itens não pagos
  → marcar pago gera despesa automaticamente
```

---

### 6. Patrimônio (WalletPage — parte patrimonial)

**Layout:**
```
[Header: "Patrimônio"]
[Card hero: Patrimônio líquido (Ativos − Passivos)]
[Breakdown: Ativos vs Passivos]
[Seção Contas: lista de contas bancárias com saldo]
[Seção Cartões: lista com fatura e limite]
[Botão "+ Adicionar conta" e "+ Adicionar cartão"]
```

**KPIs patrimônio:**
```
Patrimônio líquido = saldo contas + total metas − faturas abertas − dívidas restantes
Ativos = saldo contas + total metas
Passivos = faturas abertas + dívidas restantes
```

---

### 7. Contas (AccountsPage — nova)

**Arquivo:** `src/features/accounts/AccountsPage.tsx` (criar)

**Layout:**
```
[Header: "Contas" + botão "+ Nova"]
[Card por conta bancária]:
  - Logo banco + nome + tipo (corrente/poupança/investimento)
  - Saldo em destaque
  - Mini histórico últimas 3 transações
  - Botão editar (ícone lápis)
```

**CRUD conta:**
```
Campos: nome, banco (picker com logos), tipo, saldo inicial, cor
```

---

### 8. Orçamentos (BudgetsPage)

**Arquivo:** `src/features/budgets/BudgetsPage.tsx`

**Layout:**
```
[Header: "Orçamentos" + botão "+ Novo"]
[Tabs: Despesas | Receitas (previsão)]

Despesas:
  - Resumo: "Você usou R$ X de R$ Y"
  - Card por categoria: ícone + nome + barra de progresso + % + R$ gasto / limite

Receitas (previsão):
  - Mesma estrutura mas compara "recebido" vs "previsto"
  - Verde se atingiu, âmbar se não atingiu ainda
```

**Barra de progresso:**
```
< 80%: verde (#0E8C5A)
80–99%: âmbar (#B8791F)
≥ 100%: vermelho (#C8483B)
altura: 8px, border-radius: 5px
```

---

### 9. Metas & Dívidas (GoalsPage)

**Arquivo:** `src/features/goals/GoalsPage.tsx`

**Tabs: Metas | Dívidas**

**Metas:**
```
Card por meta:
  - Nome + prazo + ícone
  - Valor atual / valor alvo
  - Barra de progresso (verde)
  - Botão "Contribuir"
  - % concluído
```

**Dívidas (novo):**
```
Card por dívida:
  - Header: ícone vermelho + nome + taxa + "X/Y parcelas pagas"
  - KPIs grid 3 colunas: Pago | Restante | Total
  - Barra de progresso verde
  - Card "Próxima parcela" (âmbar): mês + valor + botão "Pagar"
  - Grid de bolinhas (dot grid):
    • Verde com ✓ = pago
    • Âmbar/borda = parcela atual  
    • Cinza com número = pendente
    • Cada bolinha clicável p/ marcar/desmarcar
  - Legenda: Pago | Atual | Pendente
  - "Ver todas as N parcelas" → expand lista completa
    (cada linha: badge status + mês + valor + toggle)
```

---

### 10. Assinaturas (SubscriptionsPage — nova)

**Arquivo:** `src/features/subscriptions/SubscriptionsPage.tsx` (criar)

**Layout:**
```
[Header: "Assinaturas" + botão "+ Nova"]
[Card resumo: total mensal]
[Tabs: Ativas | Canceladas]
[Lista de assinaturas]
```

**Card de assinatura:**
```
Logo do serviço (ícone SVG customizado) + nome + ciclo (mensal/anual)
Valor + dia de cobrança
Badge de forma de pagamento: Cartão X / Conta Y / Boleto
Badge de status: Ativa (verde) | Vencida (vermelho) | Cancelada (cinza)
```

**CRUD assinatura:**
```
Campos: nome, serviço (picker com logos), valor, ciclo, dia cobrança,
        forma de pagamento (conta ou cartão), status
```

---

### 11. Relatórios (ReportsPage)

**Arquivo:** `src/features/reports/ReportsPage.tsx`

**Layout:**
```
[Header: "Relatórios"]
[Selector de período: Este mês | 3 meses | 6 meses | Este ano]
[KPI cards: Receitas | Despesas | Saldo | Taxa de poupança]
[Donut chart: distribuição de gastos por categoria]
[Gráfico de barras: fluxo mensal (6 meses)]
[Top 5 categorias: barra horizontal]
[Linha: evolução patrimonial]
```

**Implementação dos gráficos:**
- Recomendado: **Recharts** ou **Chart.js** (já podem estar no projeto)
- Alternativa sem lib: CSS conic-gradient para donut, div com height% para barras
- Cores do donut: usar as cores das categorias definidas no sistema

**KPIs:**
```
Taxa de poupança = (receitas − despesas) / receitas × 100
Renderizar em verde se ≥ 20%, âmbar se ≥ 5%, vermelho se < 5%
```

---

### 12. Categorias (CategoriesPage — nova)

**Arquivo:** `src/features/categories/CategoriesPage.tsx` (criar)

**Layout:**
```
[Header: "Categorias" + botão "+ Nova"]
[Seção "Despesas"]
[Seção "Receitas"]
```

**Card de categoria:**
```
Row: ícone (tintado) + nome + botão "+ Sub" + botão editar

Subcategorias (expandidas abaixo do nome):
  - chips inline: "nome × " — o × remove a sub
  - botão "+ Sub" abre input inline (sem modal)
  - Input: digita nome + OK → cria e aparece como chip

Inline create:
  input com border #0E8C5A + botão "OK" verde
```

---

### 13. Perfil & Configurações

**Sub-telas (bottom sheets empilhados):**

**Editar Perfil:**
```
Campos: nome, e-mail, telefone
Botão "Salvar alterações"
```

**Segurança:**
```
Lista: Alterar senha | 2FA (status badge) | Sessões ativas
```

**Chat com Pi:**
```
Card verde escuro: nome do agente + descrição
Número vinculado
Botão "Abrir no WhatsApp" (verde #25D366)
```

---

## Mapeamento de Bancos e Ícones

### Bancos (logo + cor de gradiente do cartão)
```
nubank:    roxo   #820AD1 → #4A0080
itau:      laranja #EC7000 → #C45A00
bradesco:  vermelho #CC092F → #A0001F
santander: vermelho #EC0000 → #B80000
bb:        azul/amarelo #003882 → #002060
caixa:     azul #005CA9 → #003D73
inter:     laranja #FF7A00 → #D46400
c6bank:    preto #1A1A1A → #000000
xp:        preto #1A1A1A → #111
sicredi:   verde #009A3E → #006B2B
btg:       dourado #C9A84C → #9A7A2F
neon:      ciano #00C1D4 → #009BAB
picpay:    verde #21C25E → #148040
other:     cinza  #4A5568 → #2D3748
```

### Serviços de Assinatura (logos)
```
netflix, spotify, amazon, disney, youtube, apple, microsoft,
google, adobe, dropbox, icloud, canva, chatgpt, figma, github
```

### Ícones de Categoria (Lucide React)
```
food → UtensilsCrossed
transport → Car
home → Home
health → Heart
education → GraduationCap
leisure → Gamepad2
clothing → ShoppingBag
travel → Plane
market → ShoppingCart
technology → Laptop
pets → PawPrint
gift → Gift
money → DollarSign
trending → TrendingDown
film → Film
tag → Tag
```

---

## Features Novas (não existem no codebase atual)

### Assinaturas
```
Tabela: subscriptions
  id, name, service, amount, cycle (monthly/annual/weekly),
  day, payment_method (card/account/boleto/manual),
  payment_method_id, status (active/cancelled/overdue)
```

### Dívidas com Parcelas
```
Tabela: debts
  id, name, total, paid, rate (% a.m.), installments, current_installment

Tabela: debt_installments
  id, debt_id, index, due_date, amount, paid, paid_at
```

### Subcategorias
```
Tabela: subcategories (ou campo JSON subs[] em categories)
  id, category_id, name
```

### Pagamento parcial de fatura
```
PATCH /cards/:id/pay { amount: number }
Se amount < fatura_total → registra como pagamento parcial
Gera despesa na conta de débito escolhida
```

---

## Estado Global Necessário

```typescript
// Adições ao estado existente
interface AppState {
  // já existentes (manter)
  accounts: Account[];
  cards: CreditCard[];
  transactions: Transaction[];
  categories: Category[];
  payables: Payable[];
  budgets: Budget[];
  goals: Goal[];

  // novos
  subcategories: Subcategory[];
  subscriptions: Subscription[];
  debts: Debt[];
  debtInstallments: DebtInstallment[];

  // UI state
  activeSheet: 'newTransaction' | 'payFatura' | 'profile' | null;
  profileSubTab: 'edit' | 'security' | 'chat' | null;
  selectedCardId: string | null;
  faturaDetailId: string | null;
  expandedDebtIds: string[];
}
```

---

## Fluxos de Interação Importantes

### Nova Despesa com Parcelamento
1. Abre sheet → aba Despesa
2. Preenche valor, data, descrição, categoria
3. Seleciona cartão de crédito
4. Define parcelas (preset ou livre)
5. Salvar → cria N transações ligadas ao cartão

### Pagar Fatura (com parcial)
1. Cartão → aba fatura → botão "Pagar fatura"
2. Sheet: mostra valor total + campo "valor parcial"
3. Se deixar campo vazio → paga total
4. Se preencher → paga parcial, saldo devedor fica para próximo mês
5. Pagamento gera despesa na conta bancária

### Marcar Dívida como Paga
1. Card dívida → bolinha da parcela OU botão "Pagar" no card "Próxima parcela"
2. Toggle → marca parcela como paga
3. Gera despesa automática no valor da parcela
4. Atualiza `current_installment` e `paid` no banco

### Transferência
1. Sheet transferência → origem (conta A) → destino (conta B) → valor
2. Salvar → cria 2 transações: saída da conta A + entrada na conta B
3. Tipo: `transfer`, vinculadas por `transfer_pair_id`

---

## Arquivos de Referência

| Arquivo | Conteúdo |
|---|---|
| `App Financeiro Pi v2.dc.html` | Protótipo completo navegável (fonte visual) |

---

## Checklist de Implementação

### Fase 1 — Design System
- [ ] Atualizar `src/index.css` com tokens (cores, fontes, animações)
- [ ] Criar `src/lib/ui/tokens.ts` com constantes TypeScript
- [ ] Importar Plus Jakarta Sans + Space Grotesk

### Fase 2 — Layout Base
- [ ] Redesign `BottomNav.tsx` (5 itens + FAB)
- [ ] Criar `BottomSheet.tsx` componente reutilizável
- [ ] Criar `PageHeader.tsx` (título + botão ação)
- [ ] Criar `StatusBar.tsx` (decorativo)

### Fase 3 — Sheet de Lançamento
- [ ] Redesign `NewTransactionSheet.tsx`
- [ ] Adicionar campo de data com calendar picker
- [ ] Adicionar seletor de categoria + subcategoria
- [ ] Separar seletor de contas vs cartões
- [ ] Adicionar campo de parcelamento
- [ ] Criar inline creation para categoria/conta/cartão

### Fase 4 — Páginas (ordem de prioridade)
- [ ] HomePage — hero card + KPIs + insights calculados
- [ ] RecordsPage — filtros de período + categoria + CRUD inline
- [ ] CardsPage — card visual + fatura detail + histórico + CRUD
- [ ] PayablesPage — 3-KPI header + marcar pago + grupos
- [ ] BudgetsPage — tabs despesa/receita + barras coloridas
- [ ] GoalsPage — redesign metas + NOVA seção dívidas c/ dot-grid parcelas
- [ ] ReportsPage — gráficos (donut + barras + linha)
- [ ] WalletPage → dividir em `PatrimônioPage` + `AccountsPage`

### Fase 5 — Novas Páginas
- [ ] CategoriesPage — CRUD + subcategorias inline
- [ ] SubscriptionsPage — CRUD + logos + forma de pagamento
- [ ] ProfilePage — editar perfil + segurança + chat Pi

### Fase 6 — Backend/API
- [ ] Migração: tabela `subscriptions`
- [ ] Migração: tabela `debts` + `debt_installments`
- [ ] Migração: campo `subs` em `categories`
- [ ] Endpoint: PATCH `/cards/:id/pay` (pagamento parcial)
- [ ] Endpoint: POST `/debts/:id/installments/:n/pay`

---

*Handoff gerado em junho/2026 — design validado em `App Financeiro Pi v2.dc.html`*
