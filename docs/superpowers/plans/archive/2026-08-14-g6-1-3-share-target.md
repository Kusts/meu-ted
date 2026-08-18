# G6.1.3 Share Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer compartilhamento de texto e shortcut “Novo gasto” abrirem a PWA no formulário de despesa, com a descrição compartilhada preenchida para revisão.

**Architecture:** O manifesto declarará um Share Target GET e um shortcut apontando para `/capture`. A rota client-side consumirá os parâmetros uma vez, disparará o evento global existente `pwa:open-tx` com `kind` e descrição inicial, e normalizará a URL. O `AppShell` encaminhará a descrição para `NewTransactionSheet`, sem modificar o fluxo de persistência.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Vitest, Testing Library, Web App Manifest.

**Agent Orchestration:** Single-Agent Looped.

---

### Task 1: Testes do manifesto

**Files:**

- Modify: `apps/pwa/src/app/manifest.ts`
- Test: `apps/pwa/src/app/__tests__/manifest.test.tsx`

- [ ] Escrever teste que chama `manifest()` e exige `share_target.action === "/capture"`, `method === "GET"`, `enctype === "application/x-www-form-urlencoded"`, params `title/text/url`, e shortcut “Novo gasto” com URL `/capture?kind=expense`.
- [ ] Executar o teste isolado e confirmar falha porque os campos ainda não existem.
- [ ] Adicionar `share_target` e `shortcuts` ao retorno de `manifest()` sem alterar ícones ou cores existentes.
- [ ] Executar o teste isolado e confirmar passagem.

### Task 2: Bridge da rota de captura

**Files:**

- Create: `apps/pwa/src/app/capture/page.tsx`
- Test: `apps/pwa/src/app/capture/page.test.tsx`

- [ ] Escrever testes para os casos `text`, fallback para `title`, fallback para `url`, `kind=expense` e ausência de parâmetros.
- [ ] Executar os testes isolados e confirmar falha por rota/componente inexistente.
- [ ] Implementar componente client-side que leia `useSearchParams`, renderize `AppShell` uma vez, componha a descrição, dispare `window.dispatchEvent(new CustomEvent("pwa:open-tx", { detail: { kind: "expense", description } }))` uma única vez e execute `window.history.replaceState(null, "", "/")`.
- [ ] Renderizar fallback mínimo durante a transição sem desmontar o `AppShell` nem duplicá-lo.
- [ ] Executar os testes isolados e confirmar passagem.

### Task 3: Prefill no shell e formulário

**Files:**

- Modify: `apps/pwa/src/components/AppShell.tsx`
- Modify: `apps/pwa/src/components/NewTransactionSheet.tsx`
- Test: `apps/pwa/src/components/__tests__/AppShell.share-target.test.tsx`
- Test: `apps/pwa/src/components/__tests__/NewTransactionSheet.prefill.test.tsx`

- [ ] Escrever teste que dispara `pwa:open-tx` com `{ kind: "expense", description: "Mercado" }` e verifica abertura da despesa com o campo Descrição preenchido.
- [ ] Executar os testes isolados e confirmar falha pelo payload atual sem descrição.
- [ ] Ampliar o payload tipado do listener para aceitar `description?: string`, armazenar o prefill no estado do `AppShell` e passá-lo ao formulário.
- [ ] Adicionar `initialDescription?: string` às props do `NewTransactionSheet` e inicializar o estado da descrição com esse valor.
- [ ] Garantir que eventos sem descrição preservem o formulário vazio e que a chave existente continue resetando o formulário quando o tipo muda.
- [ ] Executar os testes isolados e confirmar passagem.

### Task 4: Verificação final

**Files:**

- Verify: `apps/pwa/src/app/manifest.ts`
- Verify: `apps/pwa/src/app/capture/page.tsx`
- Verify: `apps/pwa/src/components/AppShell.tsx`
- Verify: `apps/pwa/src/components/NewTransactionSheet.tsx`

- [ ] Executar testes unitários PWA relevantes, incluindo manifesto, captura, AppShell e formulário.
- [ ] Executar typecheck da PWA e format/lint configurados pelo workspace.
- [ ] Executar teste E2E ou smoke disponível para confirmar que `/capture?kind=expense&text=...` abre o formulário.
- [ ] Revisar diff e confirmar que nenhum fluxo de gravação ou API foi alterado.
