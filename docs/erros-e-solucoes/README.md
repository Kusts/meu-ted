# Erros e Soluções — Pi Financeiro

> Índice canônico de incidentes diagnosticados, causas raiz e correções validadas. Cada entrada segue o padrão `YYYY-MM-DD-slug.md` com frontmatter.

## Como usar

- **Sintoma → Causa → Correção → Validação.** Toda entrada documenta o erro observado (logs, payload, header), a causa confirmada por inspeção de código e a correção com referência `arquivo:linha`.
- **Severidade:** `crítica` (bloqueia login/produção) · `alta` · `média` · `baixa`.
- **Status:** `corrigido` · `mitigado` · `em investigação`.

## Índice

| Data | Erro | Severidade | Status |
|------|------|------------|--------|
| 2026-08-26 | [Registro de dispositivo desabilitado no iPhone (ITP / cookie cross-site bloqueado)](./2026-08-26-registro-dispositivo-desabilitado-iphone.md) | crítica | corrigido |

## Convenções

- Mensagens de erro literais indexadas (ex.: `Registro de dispositivos desabilitado.` → `apps/api/src/routes/auth.ts:72`).
- Evidências de produção (`docker logs`, `curl -i`, `BETTER_AUTH_URL`) são citadas, não inferidas.
- Quando a correção envolve `docs/adr/` ou vault, linkar a decisão correspondente.
- Entradas também são espelhadas no vault: `Erros/` e `Projetos/pi-financeiro/Erros/` no Segundo Cérebro.

## Template para nova entrada

```md
---
type: error
id: ERR-YYYY-MM-DD-slug
title: "Título curto"
created: YYYY-MM-DD
severity: alta
status: corrigido
area: auth | pwa | api | infra | dados
sintoma: "mensagem exata"
---

## Sintoma
## Causa Raiz
## Solução Aplicada
## Arquivos Alterados
## Validação
## Lição / Prevenção
```
