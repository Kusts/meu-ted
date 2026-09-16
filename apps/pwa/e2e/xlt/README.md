# XLT — Cross-Layer Invariant Tests (PWA)

Categoria permanente de testes (SPEC V4 §18, INV-10): cada XLT prova um
invariante **atravessando ≥ 2 camadas reais** do sistema. Um teste que
valida uma única camada (constante, função pura, componente isolado) é
unitário — não entra aqui, mesmo que more neste diretório.

## Naming

`xlt-NN-<slug>.spec.ts` — `NN` é o ID da SPEC §18 (`00` = fumaça da
categoria, `01..10` = cenários obrigatórios da tabela).

## Critério de admissão (todos obrigatórios)

1. Atravessa **≥ 2 camadas reais**: config de produção + HTTP emitido;
   browser + headers do build; cookie + proxy + API. Mock de camada
   intermediária desqualifica o teste.
2. Roda pelo Playwright (`e2e/xlt/xlt.config.ts`), sem `webServer` próprio
   — cada spec sobe apenas o que precisa (ex.: `node:http` efêmero) e
   derruba ao fim.
3. Nasce com RED→GREEN local na tarefa do bloco dono; nunca nasce
   vermelho permanente nem atravessa fases vermelho (regra do plano V4).

## O que NÃO é XLT

- Checks estáticos (grep/AST sobre o repo: `ARCH-V4-06a/b`) — são
  *architecture checks* (VAL-V4.9), vivem em `scripts/` + gate de
  validação, não aqui.
- Contrato de valor de constante/função pura — é unit (`src/__tests__/`,
  `src/*.test.ts`).

## Execução

```sh
# categoria inteira (sem subir fixture/harness/standalone)
pnpm --filter pwa exec playwright test --config e2e/xlt/xlt.config.ts
# um XLT específico
pnpm --filter pwa exec playwright test --config e2e/xlt/xlt.config.ts e2e/xlt/xlt-00-headers-contract.spec.ts
```

O `playwright.config.ts` principal (suíte `specs/`) **não** inclui este
diretório (`testMatch: specs/**/*.spec.ts`), então a suíte funcional
nunca executa XLTs por acidente — e vice-versa.

## Mapa SPEC §18 → arquivo

| ID | Arquivo | Dono |
|---|---|---|
| XLT-00 | `xlt-00-headers-contract.spec.ts` | T0.2 (fumaça da categoria) |
| XLT-01 | `xlt-01-ted-microphone.spec.ts` (futuro) | T1.2 |
| XLT-02 | auth cookie-first (futuro) | T2.2/T2.3 |
| XLT-03/04/05 | borda/CSP/localhost (futuro) | T2.7 |
| XLT-06 | pós-descomissionamento (futuro) | T4.3 |
| XLT-08/09 | offline/logout (futuro) | T2.6 (+T3.x onde couber) |

XLT-07 e XLT-10 são da API — ver `apps/api/tests/xlt/README.md`.
Detalhe canônico da categoria: `docs/testing/xlt-category.md`.
