# Plano: Alinhamento Final PWA × Mock

**Objetivo**: Corrigir os ~20 gaps identificados na auditoria para alinhar 100% o PWA com o mock.

## Fase 1 — Transaction Sheet (maior impacto)
1. Custom calendar toggle substituindo `<input type="date">`
2. Seção Subcategoria com chips + inline add
3. Separar Cartão de Conta (badge chips próprios para cartão)

## Fase 2 — Profile sub-sheets
4. Editar perfil (back button + form Nome/E-mail/Telefone + Salvar)
5. Segurança (Alterar PIN, toggle 2FA badge, Sessões ativas)
6. Chat com Pi (card verde + número WhatsApp)

## Fase 3 — Refinamentos visuais
7. Subscriptions: trocar emoji por badge 44×44 colorido
8. Subscriptions: status badge translúcido (color+"1A")
9. Goals: progress bar gradient `linear-gradient(90deg,#0E8C5A,#2FA56F)`
10. Goals: tab style `bg-white border #ECEEEA rounded-[13px]`
11. Goals: "% quitado" label abaixo da barra de progresso
12. Goals: debt "Editar" button `rounded-[9px]`
13. Goals: expand list com toggle 28×28 por parcela
14. Budgets: income tab labels "recebido" / "previsto"
15. Payables: esconder "✓ Pago" para itens paid
16. Cartões: drill-down com back button + 3 KPIs hero
17. Categories: chip/button border colors (#E0E3DE)
18. BottomNav: stroke-width dos ícones (2 vs 2.4)
19. Home: verificar padding "Minhas contas" card
20. Home: card mini bars height:6px border-radius:4px
