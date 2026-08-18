# PI Financeiro — Visão de Produto

**Last verified:** 2026-08-18  
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)  

## 1. Propósito e Visão

O **PI Financeiro** é uma plataforma de gestão financeira pessoal e familiar projetada para fornecer controle financeiro sem atrito, através de uma experiência unificada entre PWA e assistente de IA conversacional (TED).

## 2. Personas e Casos de Uso

- **Membro Familiar:** Registra despesas diárias, consulta extrato, acompanha limites de cartão e gerencia contas a pagar.
- **Administrador / Proprietário de Workspace:** Gerencia contas bancárias, cartões, categorias orçamentárias, limites, convites de membros e políticas de aprovação de operações de alto valor.
- **Assistente TED (AI):** Atua como co-piloto financeiro em tempo real, interpretando mensagens em linguagem natural, validando limites e automatizando projeções orçamentárias.

## 3. Principais Recursos

1. **Gestão de Contas & Saldos:** Controle de contas corrente, poupança, dinheiro e cartões de crédito com cálculo em centavos inteiros (BRL).
2. **Contas a Pagar & Lembretes:** Rastreamento de vencimentos, status de liquidação e projeções de fluxo de caixa mensal.
3. **Cartões de Crédito & Parcelamentos:** Acompanhamento de faturas abertas/fechadas, controle de parcelas e antecipações.
4. **Metas & Orçamentos:** Planejamento por categorias e acompanhamento de progresso de metas de economia.
5. **Auditoria & Histórico:** Registro imutável de todas as ações financeiras para rastreabilidade e reversão segura (`undo`).
