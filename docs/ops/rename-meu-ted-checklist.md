# Checklist de rename: PI Financeiro → Meu Ted

**Data:** 2026-09-07 (atualizado pós-release do dia)
**Status:** marca, repo GitHub e deploys concluídos; pendentes só pasta local
e name do Worker (decisão do dono).

> Regra de segurança: nada aqui autoriza renomear o Worker `pi-finance-agent`
> na Cloudflare sem o plano de migração de DOs abaixo — renomear o worker
> **recria** o worker e **perde** os Durable Objects (histórico e memória do TED).

## 1. Já renomeado (sem risco)

| Item | Evidência |
|---|---|
| Pacotes pnpm | `pnpm-workspace.yaml` + `package.json` dos apps (`meu-ted-api`, `pwa`, `pi-finance-agent` permanece — ver §2.3) |
| Marca, ícones e manifest | `apps/pwa/src/app/manifest.ts`, `layout.tsx`, `/logo.svg`, telas (incl. convite: `ConvitePage.test.tsx` espera logo "Meu Ted" e ausência de "Pi Financeiro") |
| Strings user-facing | PWA em pt-BR ("Meu Ted", "Tudo em dia") |
| Documentação viva | `README.md`, `docs/PRODUCT.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE-CURRENT.md`, `docs/ARCHITECTURE-TARGET.md`, `docs/design/design-plan.md`, `docs/erros-e-solucoes/README.md`, `docs/ops/vps-access.md` |
| Repositório GitHub | `Kusts/meu-ted` (renomeado em 2026-09-07; redirect do nome antigo ativo; `remote origin` local atualizado — verificado via `git remote -v`) |
| Registros preservados de propósito | `docs/audits/**`, `docs/adr/**`, `docs/archive/**`, `docs/design/audit-front-current.md` (histórico imutável) |

## 1.1 Deploys executados em 2026-09-07 (marca Meu Ted em produção)

| Alvo | Evidência |
|---|---|
| PWA Cloudflare | `pnpm --filter pwa run deploy` executado (nota: `pnpm --filter pwa deploy` colide com o `pnpm deploy` nativo — usar `run deploy`) |
| Agent Worker `pi-finance-agent` | versão `78c57fb9` via `wrangler deploy`; **DOs preservados** — histórico e memória do TED intactos (name do worker inalterado, ver §2.3) |
| API VPS release `9a7e988` | mecanismo backup→sync→build→tag→`compose up`; `legacyMigrations [44,45,46,47]`; 7 WARNs `baseline_drift` esperados; rollback disponível nas imagens `backup-before-b898d6a-*` e `app-bak-*` |
| Registro do release | `docs/agent/2026-09-07-meu-ted-ondas-finais-release.md` |

## 2. Pendente de decisão do dono

### 2.1 Pasta local `D:/projetos/pi-financeiro` → `meu-ted` (BLOQUEADA nesta sessão)

- **Estado:** pendente — bloqueada por terminais/Orca abertos nesta sessão
  (worktree bindings por path ativos; renomear agora quebraria a sessão).
- **Risco:** baixo–médio. Quebra caminhos absolutos em docs/scripts, atalhos do
  Orca (worktree bindings por path), listas de recentes da IDE e qualquer
  `.env`/hook com path hardcoded.
- **Passos seguros:**
  1. Fechar runtimes (Orca, `wrangler dev`, watchers) e commitar/stashar tudo.
  2. Renomear a pasta pelo SO (não `git mv` entre volumes).
  3. Reabrir o workspace no Orca pelo novo path; reconectar automações.
  4. `pnpm install` (store é content-addressed; recria links) + `pnpm test` smoke.
  5. Grep por `pi-financeiro` em `docs/`, `scripts/`, `.env*` e atualizar paths.

### 2.2 Repositório GitHub — CONCLUÍDO em 2026-09-07

Renomeado para `Kusts/meu-ted` (redirect ativo; remote local atualizado).
Restam as conferências de higiene pós-rename:

- [ ] Conferir integrações conectadas (Cloudflare Pages, CI badges, Orca cards
  com link de repo) e trocar onde não houver redirect.
- [ ] Não recriar outro repo com o nome antigo (mantê-lo reservado ao redirect).

### 2.3 Worker Cloudflare `pi-finance-agent` (NÃO renomear sem migração)

- **Estado:** pendente de decisão do dono — deploy `78c57fb9` de 2026-09-07
  manteve o name; **DOs preservados** (histórico/memória do TED intactos).

- **Risco:** ALTO — perda de dados. O nome do worker ancora o namespace dos
  Durable Objects (`FINANCE_CHAT_AGENT`, `AGENT`): renomear recria o worker
  com namespaces vazios — some o histórico de chat e a memória do TED
  (fatos, preferências, sessões) sem volta.
- **Passos seguros (somente se o dono aceitar a janela):**
  1. Congelar escrita (anunciar manutenção; PWA em modo leitura se possível).
  2. Exportar o estado: rodar migração assistida via endpoints (`exportFullWorkspaceHistory` legado + tabelas SQLite do DO) para backup versionado.
  3. Subir o worker com o nome novo em paralelo (novo `wrangler.jsonc` name).
  4. Reimportar (`importLegacyHistory`) e validar contagens por workspace.
  5. Trocar `NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL`, `AGENT_CONFIG_TOKEN` e
     monitores para o novo worker; manter o antigo em standby 7 dias.
  6. Só então desativar o worker antigo.
- **Recomendação:** manter `pi-finance-agent` (identificador técnico invisível
  ao usuário; o PWA já exibe "Meu Ted").

### 2.4 Identidade da API na VPS (`pi-stack`, `~/infra/pi-finance-api`, `api.synkroo.com.br`)

- **Estado:** release `3cf4cba` (V049 legacy-safe) deployado em 2026-09-08 com a identidade atual (anterior `9a7e988` de 2026-09-07);
  o rename segue pendente de decisão do dono (janela + transição de hostname).

- **Risco:** médio–alto. Renomear serviço/diretório exige restart com janela;
  trocar o hostname público quebra PWA instalada, DNS, certificados e
  bookmarks — é mudança client-facing, não só cosmética.
- **Passos seguros:**
  1. Serviço/diretório interno primeiro (fora de pico): parar, renomear,
     subir, validar `/health`, rollback = voltar o nome.
  2. Hostname público só com transição: novo DNS + certificado, dual-serve,
     migrar PWA, monitorar, e só então aposentar o antigo (redirect 301).
  3. Atualizar `../vps-hostinger/` (acesso, deploy, restart) e este checklist.

## 3. O que NUNCA muda silenciosamente

Nomes de pacote pnpm já migrados, `wrangler.jsonc` name, domínios, variáveis
de ambiente (`OPENAI_API_KEY`, `AGENT_*`), imports e chaves de localStorage
(`meu-ted:*` já são da marca nova). Qualquer rename técnico passa por este
checklist + testes verdes antes.
