# Meu Ted — Visão de Produto

**Last verified:** 2026-08-26  
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)  

## 1. Propósito e Visão

O **Meu Ted** é uma plataforma de gestão financeira pessoal e familiar projetada para fornecer controle financeiro completo e confiável, unificando uma experiência PWA moderna, responsiva e instalável com um assistente conversacional inteligente (TED).

## 2. Personas e Acesso

- **Membro do Workspace:** Registra receitas e despesas, consulta extrato em tempo real, gerencia contas a pagar, acompanha faturas e limites de cartão de crédito.
- **Administrador de Workspace:** Gerencia contas, cartões, categorias, metas, emite convites para novos membros via email com credenciais gerenciadas e define políticas operacionais.
- **Assistente TED (AI):** Co-piloto financeiro conversacional integrado ao ecossistema, operando via Cloudflare Agents SDK para responder dúvidas, projetar despesas e executar operações financeiras com segurança.

## 3. Autenticação e Segurança do Usuário

- **Autenticação por Email e Senha:** Sessões autenticadas gerenciadas via Better-Auth, eliminando o antigo modelo de registro aberto de dispositivo.
- **Onboarding Controlado por Convite:** Novos usuários e acessos a workspaces são provisionados através de convites administrativos com senhas seguras.
- **Controle de Sessão e Dispositivos:** Emissão de credenciais de dispositivo estritamente subordinadas à sessão autenticada do usuário.

## 4. Principais Recursos e Módulos

1. **Gestão de Contas & Saldos:** Controle de contas correntes, investimentos, dinheiro e cartões com valores representados em centavos inteiros (BRL).
2. **Cartões de Crédito, Faturas & Cancelamento:** Gerenciamento de faturas abertas e fechadas, parcelamentos, compras pontuais e suporte a cancelamento de lançamentos.
3. **Contas a Pagar & Notificações Push:** Controle de liquidação, agendamento de vencimentos e lembretes proativos via Web Push Notification.
4. **Metas & Orçamentos por Categoria:** Definição de limites orçamentários por categoria e acompanhamento de metas financeiras familiares.
5. **Auditoria & Registro Imutável:** Rastreabilidade estrita de cada mutação financeira por ator, workspace e chave de idempotência com capacidade de reversão.
6. **TED Chat Global (Agents SDK):** Widget flutuante global por workspace (fullscreen em iPhone, painel em desktop) sobre `FinanceChatAgent extends AIChatAgent`, com configuração LLM global (OpenCode Zen/Go, OpenAI API + candidato Codex subscription `experimental_blocked`) administrada exclusivamente por `ADMIN_EMAILS`.

