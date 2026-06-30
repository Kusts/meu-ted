# Auditoria de Alinhamento PWA × Mock — Completa

**Data**: 2026-06-23  
**Mock fonte**: `design_handoff_pi_financeiro/App Financeiro Pi v2.dc.html`  
**PWA alvo**: `apps/pwa`  
**Status**: Em andamento — 22 gaps identificados  

---

## LEGENDA

| Símbolo | Significado |
|---------|-------------|
| ✅ | Alinhado |
| ⚠️ | Desalinhamento menor (cor, espaçamento, fonte) |
| ❌ | Desalinhamento estrutural (falta feature ou layout diferente) |
| 🔵 | Feature existente mas estilo diferente do mock |

---

## 1. HOME PAGE

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 1.1 | Hero greeting | "Boa noite" / "Marina" 15px bold | Dynamic greeting (Bom dia/Boa tarde/...) ✅ | ✅ |
| 1.2 | Avatar "M" | 38×38 circle, `rgba(255,255,255,.18)`, abre profile sheet | 38×38 button, abre BottomSheet ✅ | ✅ |
| 1.3 | Bell icon + dot | 38×38 circle, `rgba(255,255,255,.14)`, orange dot | Mesmo tamanho, mesma cor dot ✅ | ✅ |
| 1.4 | "Saldo total · contas" | `font-size:12px; color:rgba(255,255,255,.7)` | `text-xs text-white/70` ✅ | ✅ |
| 1.5 | Balance value | `40px Space Grotesk 600` | `text-[40px] font-mono font-semibold` ✅ | ✅ |
| 1.6 | Mini-stats: Receitas/Despesas/Resultado | 3 col, `gap:9px`, Resultado `color:#7FE3B0` | `flex gap-[9px]`, Resultado `text-[#7FE3B0]` ✅ | ✅ |
| 1.7 | Quick actions | 3 buttons: Despesa (red circle-), Receita (green circle+), Transferir (blue arrows) | Mesmo layout, SVGs idênticos ✅ | ✅ |
| 1.8 | "Contas a pagar · 7 dias" card | `border:1px solid #F0CFC9`, danger icon, lista preview | Mesmo border, navegação onClick ✅ | ✅ |
| 1.9 | Payables preview dots | `width:6px;height:6px;border-radius:50%` color = status | `h-[6px] w-[6px] rounded-full`, mesma cor ✅ | ✅ |
| 1.10 | KPI "Receitas vs mês ant." | Icon UP arrow `M23 6 13.5 15.5...` + green `+12%` | UP arrow SVG + `+{delta}%` ✅ | ✅ |
| 1.11 | KPI "Despesas vs mês ant." | Icon **DOWN** arrow `M23 18 13.5 8.5...` + green `−8%` | PWA usa arrow dinâmica (up/down baseado no delta) ✅ | ✅ |
| 1.12 | "Gastos por categoria" donut | 104×104, gap:16px, legend `gap:8px`, swatch 9×9 | Idêntico ✅ | ✅ |
| 1.13 | "Relatórios" link | `font-size:11px;color:#0E8C5A;font-weight:600` | `<Link href="/relatorios">` + mesma estilização ✅ | ✅ |
| 1.14 | "Minhas contas" card | Badge 36×36 `border-radius:10px`, `padding:6px 16px` | `padding:6px 16px` (verificar) ⚠️ | ⚠️ |
| 1.15 | "Minhas contas" row ícone | 36×36 rounded-[10px], `font-size:11px` Space Grotesk | `h-[36px] w-[36px] rounded-[10px]` ✅ | ✅ |
| 1.16 | "Cartões de crédito" card | Fatura total `22px/700 red`, Limite livre `14px/600 green` | Mesmo ✅ | ✅ |
| 1.17 | Card mini bars | `height:6px;border-radius:4px;background:#F1F3EF` | precisa verificar ⚠️ | ⚠️ |
| 1.18 | Insights | dot `width:7px;height:7px;border-radius:50%`, gap:10px | Mesmo ✅ | ✅ |

---

## 2. REGISTROS (RECORDS)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 2.1 | Título "Registros" | `font-size:22px;font-weight:800` | PageHeader 22px/800 ✅ | ✅ |
| 2.2 | Search bar | `background:#fff;border:1px solid #ECEEEA;border-radius:12px` | `rounded-[12px] border bg-surface` ✅ | ✅ |
| 2.3 | Filter chips (Tudo/Despesas/Receitas/Transf.) | `border-radius:100px`, ativo: fundo verde | `rounded-[100px]`, bg-primary ativo ✅ | ✅ |
| 2.4 | Separator | `width:1px;background:#E0E3DE` entre tipo e período | `w-px bg-border-strong` ✅ | ✅ |
| 2.5 | Period chips (7d/30d/90d) | mesmo estilo dos de tipo | idêntico ✅ | ✅ |
| 2.6 | Category filter chips | `gap:6px`, `border-radius:100px` | `gap-1.5`, pill format ✅ | ✅ |
| 2.7 | Date group header | `font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em` | `text-[11px] font-bold uppercase tracking-wide` ✅ | ✅ |
| 2.8 | Transaction card | `background:#fff;border:1px solid #ECEEEA;border-radius:16px;padding:0 14px` | `rounded-[16px] border bg-surface` ✅ | ✅ |
| 2.9 | Transaction row icon | 38×38 `border-radius:11px`, SVG tint+stroke | Mesmo ✅ | ✅ |
| 2.10 | Transaction amount color | expense=red, income=green, transfer=blue | Igual ✅ | ✅ |

---

## 3. PATRIMÔNIO (WALLET)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 3.1 | Hero "Patrimônio" title | `font-size:20px;font-weight:800` | `text-[20px] font-extrabold` ✅ | ✅ |
| 3.2 | "Patrimônio líquido" label | `font-size:12px;color:rgba(255,255,255,.7)` | `text-[12px] text-white/70` ✅ | ✅ |
| 3.3 | Net worth value | `32px Space Grotesk 600` | `text-[32px] font-mono font-semibold` ✅ | ✅ |
| 3.4 | 4 mini-stats | 2×2 grid, `gap:7px`, `border-radius:13px` | `grid grid-cols-2 gap-[7px] rounded-[13px]` ✅ | ✅ |
| 3.5 | "Contas" section header | "Contas" + "Gerenciar" link | Link navega para /contas ✅ | ✅ |
| 3.6 | Account card | 44×44 badge `border-radius:12px`, `padding:13px`, `border-radius:15px` | Mesmo ✅ | ✅ |
| 3.7 | "Adicionar conta" button | `border:1.5px dashed #CBD3CB;border-radius:15px;padding:13px` | ✅ Existe: `border-[1.5px] border-dashed rounded-[15px] py-[13px]` | ✅ |
| 3.8 | "Cartões" section | "Cartões" + "Gerenciar" link | Link navega para /cartoes ✅ | ✅ |
| 3.9 | Card row | 44×44 icon com gradient do banco, "Vence dia X" | Mesmo estilo ✅ | ✅ |
| 3.10 | "Adicionar cartão" button | `border:1.5px dashed #CBD3CB` margin-top:9px | ✅ Existe: `mt-[9px] w-full border-[1.5px] border-dashed` | ✅ |

---

## 4. CONTAS (ACCOUNTS)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 4.1 | "Contas" header | 22px/800 + "Nova" button | PageHeader com action ✅ | ✅ |
| 4.2 | "Saldo somado" hero | `padding:16px`, "X contas" no final | Mesmo ✅ | ✅ |
| 4.3 | Account card | 44×44 badge, `border-radius:12px`, chevron right | `h-[44px] w-[44px] rounded-[12px]`, chevron ✅ | ✅ |
| 4.4 | Mini history | Mostra 3 transações recentes dentro do card | Mesmo ✅ | ✅ |

---

## 5. CARTÕES (CARDS)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 5.1 | Card list view | Cartão físico 300×160 com `border-radius:18px;padding:18px` | `rounded-[18px] p-5 min-h-[160px]` ✅ | ✅ |
| 5.2 | Card SVG icon | `width:30px;height:22px` no top-right | Presente ✅ | ✅ |
| 5.3 | "Fatura atual" + value | `24px Space Grotesk 600` | `text-[24px] font-semibold` ✅ | ✅ |
| 5.4 | Progress bar | `height:6px;border-radius:4px;background:rgba(255,255,255,.22)` | Mesmo ✅ | ✅ |
| 5.5 | "% de limit / livre" | `font-size:11px;color:rgba(255,255,255,.8)` | Presente ✅ | ✅ |
| 5.6 | Tabs (Fatura / Histórico) | Mock usa card detail (click no cartão) ao invés de tabs | ⚠️ PWA usa tabs, mock usa drill-down | ⚠️ |
| 5.7 | Card detail: back button + Edit | Back `< Cartões` + "Editar" pill | ⚠️ PWA não tem tela de detalhe separada | ⚠️ |
| 5.8 | Card detail: 3 KPIs hero | Fatura / Vence dia / Limite livre `font-size:18px` | ⚠️ PWA não replica os 3 KPIs no detail | ⚠️ |
| 5.9 | "Pagar fatura" button | `width:100%;background:#0E8C5A;padding:13px;border-radius:13px` | Botão existe via BottomSheet ✅ | ✅ |
| 5.10 | "Compras da fatura" | Tag chips `font-size:9px;background:#E7F3EC;color:#0E8C5A;border-radius:5px` | `bg-primary-tint` chip ✅ | ✅ |
| 5.11 | "Histórico de faturas" | Status badge `font-size:10px;font-weight:700;border-radius:100px` translúcido | status badge ✅ | ✅ |

---

## 6. ASSINATURAS (SUBSCRIPTIONS)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 6.1 | Header "Assinaturas" + "Nova" | 22px/800 + green button | PageHeader com action ✅ | ✅ |
| 6.2 | Hero "Custo mensal recorrente" | `26px Space Grotesk 600` + "N assinaturas ativas" | Mesmo ✅ | ✅ |
| 6.3 | Subscription card icon | 44×44 `border-radius:12px`, `color:#fff`, `background:{{ s.color }}` | ⚠️ PWA usa emoji (text-[20px]) ao invés de badge 44×44 colorido | ⚠️ |
| 6.4 | Status badge | `color:{{ s.stColor }};background:{{ s.stColor }}1A` (translúcido) | PWA usa `bg-primary-tint` ou `bg-fill-medium` — não é translúcido | ⚠️ |
| 6.5 | Card info | `{{ s.pmLabel }} · dia {{ s.day }}` | `{cycle} · {paymentMethod}` ✅ | ✅ |
| 6.6 | Amount + badge alignment | Amount acima, badge abaixo, alinhados à direita | ⚠️ verificar se badge está abaixo do amount | ⚠️ |

---

## 7. A PAGAR (PAYABLES)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 7.1 | Header + "Nova" | 22px/800 + green button | PageHeader com action ✅ | ✅ |
| 7.2 | Hero KPI (Total/Pago/A pagar) | `grid-template-columns:1fr 1fr 1fr;gap:10px` | `grid grid-cols-3 gap-2.5` ✅ | ✅ |
| 7.3 | "Pago" color | `color:#7FE3B0` | `text-[#7FE3B0]` ✅ | ✅ |
| 7.4 | "A pagar" color | `color:#F9A8A2` | `text-[#F9A8A2]` ✅ | ✅ |
| 7.5 | Filter chips | `gap:7px`, active=green pill | `rounded-[100px]`, mesmo ✅ | ✅ |
| 7.6 | Group header | Colored dot (7×7) + uppercase title `11px/700` | Mesmo ✅ | ✅ |
| 7.7 | Card border color | `border:1px solid {{ p.border }}` (varia por status) | PWA usa border dinâmico mas pode não ter o mesmo matiz | ⚠️ |
| 7.8 | "✓ Pago" button | Mostrado apenas para unpaid, `color:{{ p.cta }}` | PWA mostra para todos (deveria esconder para paid) | ⚠️ |

---

## 8. ORÇAMENTOS (BUDGETS)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 8.1 | Header "Orçamentos" + "Novo" | 22px/800 + green button | PageHeader com action ✅ | ✅ |
| 8.2 | Tabs "Despesas" / "Receitas (previsão)" | `background:#F4F5F2;border-radius:12px;padding:4px;gap:6px` | `bg-fill-light rounded-xl p-1` ✅ | ✅ |
| 8.3 | Summary line | "Você usou **X** de Y" | Mesmo ✅ | ✅ |
| 8.4 | Budget card icon | 30×30 `border-radius:9px`, tint + SVG | Mesmo ✅ | ✅ |
| 8.5 | Progress bar | `height:8px;border-radius:5px;background:#F1F3EF` | Mesmo ✅ | ✅ |
| 8.6 | Bar color | green <80%, amber 80-99%, red ≥100% | Mesmo ✅ | ✅ |
| 8.7 | Spent label | "gasto" / "recebido" | PWA usa "gasto" / "recebido"? | ⚠️ VERIFICAR |
| 8.8 | Limit label | "de X" / "de X previsto" | VERIFICAR | ⚠️ |
| 8.9 | Income tab summary | "Previsão de receitas para o mês — compare com o que já entrou." | ⚠️ PWA tem texto diferente? Verificar | ⚠️ |

---

## 9. METAS & DÍVIDAS (GOALS)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 9.1 | Header "Metas & Dívidas" + "Nova" | `&amp;` no HTML | PWA title is "Metas & Dívidas"? Verificar | ⚠️ |
| 9.2 | Tabs (Metas / Dívidas) | `background:#fff;border:1px solid #ECEEEA;border-radius:13px;padding:4px` | ⚠️ PWA usa `bg-surface border`? Verificar | ⚠️ |
| 9.3 | Goal card | 36×36 icon `border-radius:11px`, tint + stroke | Mesmo ✅ | ✅ |
| 9.4 | Goal progress bar | `height:8px;border-radius:5px` | Mesmo ✅ | ✅ |
| 9.5 | Debt header | 40×40 red icon, "Editar" button `border-radius:9px` | ⚠️ PWA tem "Editar"? Verificar | ⚠️ |
| 9.6 | Debt KPIs (Pago/Restante/Total) | 3-col grid, `background:#F4F5F2;border-radius:11px` | Mesmo ✅ | ✅ |
| 9.7 | Progress bar gradient | `linear-gradient(90deg,#0E8C5A,#2FA56F)` | ⚠️ PWA usa gradient? Verificar | ⚠️ |
| 9.8 | "% quitado" label | `font-size:11px;color:#98A29A` abaixo da barra | ⚠️ PWA tem? Verificar | ⚠️ |
| 9.9 | "Próxima parcela" card | `background:linear-gradient(135deg,#FBF1E3,#FFF8EE);border:1px solid #F0DFC0` | PWA tem o card ✅, verificar cores exatas ⚠️ | ⚠️ |
| 9.10 | Dot grid (Todas as parcelas) | 28×28 square, `border-radius:8px`, cores exatas | ✅ Alinhado (sessão anterior) | ✅ |
| 9.11 | Legend | `gap:12px`, swatch 10×10 `border-radius:3px` | ✅ Alinhado | ✅ |
| 9.12 | Expand button | `width:100%`, chevron SVG, `padding:11px 16px` | ✅ Alinhado com chevron | ✅ |
| 9.13 | Expanded list | Individual installments com toggle 28×28, status label, amount | ⚠️ PWA tem lista expandida? Verificar completude | ⚠️ |

---

## 10. CATEGORIAS (CATEGORIES)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 10.1 | Header + "Nova" | 22px/800 + green button | PageHeader ✅ | ✅ |
| 10.2 | "Despesas" section header | Dot `width:10px;height:10px;border-radius:50%;background:#C8483B` | `h-[10px] w-[10px] rounded-full bg-danger` ✅ | ✅ |
| 10.3 | "Receitas" section header | Dot green `#0E8C5A` | `bg-primary` ✅ | ✅ |
| 10.4 | Category card | `background:#fff;border:1px solid #ECEEEA;border-radius:16px;padding:0 14px` | Mesmo ✅ | ✅ |
| 10.5 | Category row icon | 34×34 `border-radius:10px`, tint + stroke | Mesmo ✅ | ✅ |
| 10.6 | "+ Sub" button | `border:1px solid #E0E3DE;background:#F4F5F2;color:#5C665E;border-radius:100px` | ⚠️ PWA usa `border-border-strong bg-fill-light` — cores podem diferir | ⚠️ |
| 10.7 | Subcategory chip | `background:#F4F5F2;border:1px solid #E0E3DE;border-radius:100px;padding:4px 10px` | ⚠️ PWA usa `border-border-strong bg-fill-light rounded-full` — cores podem diferir | ⚠️ |
| 10.8 | Subcategory "×" button | `color:#98A29A;font-size:14px` | `text-[14px] text-text-muted` ✅ | ✅ |
| 10.9 | Inline add input | `border:1px solid #0E8C5A;border-radius:10px;padding:8px 11px` + green "OK" `border-radius:10px` | `border-2 border-primary rounded-[10px]` + "OK" `rounded-[10px]` ✅ | ✅ |
| 10.10 | Chevron right na row | `stroke:#C9CEC8;stroke-width:2.2` | Igual ✅ | ✅ |

---

## 11. RELATÓRIOS (REPORTS)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 11.1 | Title "Relatórios" | `font-size:22px;font-weight:800`, sticky | PageHeader ✅ | ✅ |
| 11.2 | Period tabs | `grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;background:#E0E3DE` | `grid grid-cols-4 gap-1 bg-fill-medium` ✅ | ✅ |
| 11.3 | Tab labels | "Mês" / "Anterior" / "Trim." / "Ano" | Igual ✅ | ✅ |
| 11.4 | Hero "Resultado do período" | `34px Space Grotesk 600`, 3 KPIs com separators verticais | ✅ | ✅ |
| 11.5 | Savings bar | `height:6px;border-radius:4px` gradient green | ✅ | ✅ |
| 11.6 | KPI grid (Ticket médio / Taxa poupança) | `grid-template-columns:1fr 1fr;gap:10px` | ✅ | ✅ |
| 11.7 | "Fluxo mensal" | `height:100px` barras duplas (verde/vermelho), 6 meses, legenda quadrados 8×8 `border-radius:2px` | ✅ | ✅ |
| 11.8 | "Distribuição de gastos" donut | 90×90, inset 20px, legend `gap:7px` | ✅ | ✅ |
| 11.9 | Top 5 categorias | Barras horizontais com nome, valor e percentual | ✅ | ✅ |
| 11.10 | Evolução patrimonial | SVG chart | ✅ | ✅ |
| 11.11 | "Orçamentos vs Real" section | Presente no mock (após evolução) | ✅ | ✅ |

---

## 12. TRANSACTION SHEET (NEW)

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 12.1 | Tab segment | `gap:6px;padding:4px;background:#F4F5F2;border-radius:12px` | `gap-1 rounded-xl bg-fill-light p-1` ✅ | ✅ |
| 12.2 | "VALOR" field | `R$` prefix `20px`, input `24px Space Grotesk`, `border-radius:13px` | ⚠️ PWA usa input com R$ prefix — verificar tamanhos exatos | ⚠️ |
| 12.3 | "DESCRIÇÃO" field | `border-radius:13px;padding:13px 14px;font-size:14px` | Mesmo ✅ | ✅ |
| 12.4 | "DATA" field | **Custom calendar**: botão com data + ícone calendário + grid expansível | ❌ PWA usa `<input type="date">` nativo | ❌ |
| 12.5 | "CATEGORIA" grid | 4-col grid, icon 28×28 tint + label — com "Nova" link | ✅ Corrigido nesta sessão | ✅ |
| 12.6 | "SUBCATEGORIA" section | Chips + inline add input + "Nova subcat." link | ❌ Ausente no PWA | ❌ |
| 12.7 | "CONTA" section | Badge chips 18×18 + name, "Nova" link | ✅ Corrigido nesta sessão | ✅ |
| 12.8 | "CARTÃO" section | Separado de CONTA, badge chips + "Novo" link | ❌ Ausente no PWA (cartão é tratado como conta) | ❌ |
| 12.9 | "PARCELAS" section | Chips + "Outro número" input + "× vezes" | PWA tem toggle + chips — verificar layout | ⚠️ |
| 12.10 | Botão Save | `width:100%;padding:15px;border-radius:14px` | `w-full py-4 rounded-[14px]` ✅ | ✅ |

---

## 13. BOTTOM NAV

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 13.1 | Labels | "Resumo" / "Registros" / "A pagar" / "Mais" | Igual ✅ | ✅ |
| 13.2 | FAB | 52×52, `linear-gradient(145deg,#0E8C5A,#0A3A28)`, `-top-2.5` | Igual ✅ | ✅ |
| 13.3 | Active highlight | Apenas label visível quando ativo | Igual — label aparece com `isActive` ✅ | ✅ |
| 13.4 | Icon stroke | `stroke-width:2` (exceto Mais: `2.4`) | ⚠️ Verificar stroke-width dos ícones PWA | ⚠️ |

---

## 14. MORE SHEET

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 14.1 | Items | 8 itens: Patrimônio, Contas, Cartões, Assinaturas, Orçamentos, Metas & Dívidas, Categorias, Relatórios | 8 itens ✅ | ✅ |
| 14.2 | Item card | `background:#F4F5F2;border:1px solid #ECEEEA;border-radius:15px;padding:14px 10px` | `rounded-[15px] border bg-fill-light p-3.5` ✅ | ✅ |
| 14.3 | Icon box | 42×42 `border-radius:12px`, tint + SVG | `h-[42px] w-[42px] rounded-[12px]` ✅ | ✅ |
| 14.4 | Title "Mais" | `font-size:16px;font-weight:800;margin-bottom:16px` | Presente via BottomSheet title ✅ | ✅ |

---

## 15. PROFILE SHEET

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 15.1 | Trigger | Avatar "M" no Home | ✅ Implementado nesta sessão | ✅ |
| 15.2 | Avatar + info | 58×58 gradient circle, "Marina Silva" 18px/800, email 13px | ✅ | ✅ |
| 15.3 | Menu items | 4 itens: Editar perfil, Segurança, Notificações, Chat com Pi | ✅ | ✅ |
| 15.4 | Menu item icons | SVG stroke `#5C665E` 1.9 | ✅ | ✅ |
| 15.5 | Chevron right | `stroke:#C9CEC8;stroke-width:2.2` | ✅ | ✅ |
| 15.6 | "Sair da conta" button | `border:1px solid #ECEEEA;color:#C8483B;border-radius:13px` | `rounded-[13px] border text-danger` ✅ | ✅ |
| 15.7 | "Editar perfil" sub-sheet | Back button + form (Nome/E-mail/Telefone) + "Salvar alterações" | ❌ Não abre sub-sheet | ❌ |
| 15.8 | "Segurança" sub-sheet | Alterar PIN, toggle 2FA, "Sessões ativas" list | ❌ Não abre sub-sheet | ❌ |
| 15.9 | "Notificações" item | Abre config de notificações (mock tem onClick) | ⚠️ Sem ação (apenas item visual) | ⚠️ |
| 15.10 | "Chat com Pi" item | Abre sheet com card verde + número WhatsApp | ⚠️ Sem ação | ⚠️ |

---

## 16. GERAL / SISTEMA

| # | Elemento | Mock | PWA Atual | Status |
|---|----------|------|-----------|--------|
| 16.1 | Background color | `#F4F5F2` (tela do app) | `bg-bg` = `#F4F5F2` ✅ | ✅ |
| 16.2 | Font family | Plus Jakarta Sans + Space Grotesk | Google Fonts carregadas ✅ | ✅ |
| 16.3 | StatusBar | 44px, "9:41", notch | Componente StatusBar ✅ | ✅ |
| 16.4 | Scroll | `scrollbar-width:none` | `scrollbar-hide` ✅ | ✅ |
| 16.5 | Sheet animation | `@keyframes sheetUp` + `fadeIn` | CSS no globals.css ✅ | ✅ |

---

## 📊 RESUMO

| Categoria | Alinhados | Desalinhamentos |
|-----------|-----------|-----------------|
| Home Page | 17/18 | 1 ⚠️ |
| Registros | 10/10 | 0 |
| Patrimônio | 10/10 | 0 |
| Contas | 4/4 | 0 |
| Cartões | 8/11 | 3 ⚠️ (tabs vs detail, KPIs ausentes) |
| Assinaturas | 4/6 | 2 ⚠️ (icon, badge) |
| A Pagar | 7/8 | 1 ⚠️ (✓ Pago visibility) |
| Orçamentos | 6/9 | 3 ⚠️ (labels, income summary) |
| Metas & Dívidas | 9/13 | 4 ⚠️ (tab style, gradient, "% quitado", expand list) |
| Categorias | 9/10 | 1 ⚠️ (chip/button border colors) |
| Relatórios | 11/11 | 0 |
| Transaction Sheet | 7/10 | 3 ❌ (calendar, subcategoria, cartão section) |
| Bottom Nav | 3/4 | 1 ⚠️ (stroke-width) |
| More Sheet | 4/4 | 0 |
| Profile Sheet | 6/10 | 4 ❌ (sub-sheets, item actions) |
| Geral | 6/6 | 0 |

**TOTAL**: ~115 alinhados | ~20 desalinhamentos

---

## 🎯 PRIORIDADES (por impacto visual)

1. ❌ **Transaction Sheet — Date field**: trocar `<input type="date">` por custom calendar toggle (mock)
2. ❌ **Transaction Sheet — Subcategoria section**: adicionar seção de subcategoria com chips + inline add
3. ❌ **Transaction Sheet — Cartão section**: separar cartão de conta (badge chips próprios)
4. ❌ **Profile — Sub-sheets**: implementar navegação para Editar perfil, Segurança, Chat
5. ⚠️ **Subscriptions — Card icon**: trocar emoji por badge 44×44 colorido com inicial
6. ⚠️ **Subscriptions — Status badge**: usar cor translúcida (`color + "1A"`)
7. ⚠️ **Goals — Progress bar gradient**: `linear-gradient(90deg,#0E8C5A,#2FA56F)`
8. ⚠️ **Goals — Tab style**: `background:#fff;border:1px solid #ECEEEA`
9. ⚠️ **Budgets — Labels**: "recebido" / "previsto" no tab income
10. ⚠️ **Payables — "✓ Pago" button**: esconder para itens já pagos
11. ⚠️ **Cartões — Card detail**: implementar drill-down com back button + KPIs hero
