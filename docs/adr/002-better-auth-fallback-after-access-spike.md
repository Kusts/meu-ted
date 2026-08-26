# ADR-002: Better Auth como fallback após falha do gate Cloudflare Access

**Status:** accepted
**Date:** 2026-08-02
**Decision:** D07

## Contexto

O gate de autenticação da spec exige que Cloudflare Access prove, em browser e PWA instalada:

1. login e logout;
2. validação de JWT (`iss`, `aud`, assinatura, expiração e JWKS rotativo);
3. preservação da identidade browser → Worker → API;
4. WebSocket do Agent autenticado antes do Durable Object;
5. revogação e troca de usuário sem estado residual;
6. ausência de service token substituindo identidade humana.

O spike G4.1.1 está documentado em `docs/superpowers/goal-runs/20260802161604-po087l.md`. O login/logout do Access foi exercitado no browser e na PWA instalada, mas o gate falhou porque a topologia do produto ainda usa `X-Device-Token`, não possui ponte JWT/membership no API, nem superfície Agent WebSocket autenticada. Os critérios 5 e 6 também não foram provados para a integração Access.

## Decisão

Selecionamos **Better Auth self-hosted na API (`apps/api`)** como provedor de identidade da Fase 4. Cloudflare Access não é o provedor de identidade do produto nesta fase.

A implementação deve manter:

- invite-only, sem signup público;
- sessão/cookie seguro com validação server-side;
- proteção CSRF para mutações browser;
- logout e revogação server-side;
- identidade humana resolvida no pre-handler antes de autorização de membership;
- nenhum service token privilegiado atravessando a fronteira de identidade humana;
- compatibilidade com o `household_id` físico existente e migração aditiva.

A matriz de segurança equivalente será validada nos goals G4.1.3–G4.1.5 antes de produção: cookie/sessão, CSRF, logout, revogação, email, usuário existente, convite, normalização e race de aceite.

## Alternativas consideradas

### Manter Cloudflare Access

**Rejeitada para esta fase.** O Access forneceu uma sessão humana no edge, mas não provou a cadeia completa até API, membership e Agent WebSocket. Reabrir a escolha exige evidência nova de uma ponte Worker/API/Agent implementada.

### Auth artesanal com JWT próprio

**Rejeitada.** Aumenta a superfície criptográfica e de sessão, contrariando D06 e o requisito de não criar auth própria artesanal.

### Better Auth self-hosted

**Aceita.** Mantém o controle de sessão, revogação, convite e autorização na API, onde ficam os dados financeiros e a autoridade de domínio. Permite validar a matriz de segurança sem depender de uma integração Access incompleta.

## Impacto

- **Segurança:** reduz a dependência de identidade implícita no edge; exige implementação correta de cookie, CSRF, revogação e convite antes de liberar produção.
- **Dados:** não renomeia nem remove `household_id`; `users`, `memberships` e `invites` entram por migrations aditivas.
- **Produto:** o PWA deixará de registrar device token como identidade primária e passará a usar sessão Better Auth na fronteira central.
- **Prazo:** adiciona a matriz de testes G4.1.3–G4.1.5 antes do Gate G4.
- **Operação:** Access pode continuar protegendo superfícies administrativas/infraestrutura, mas não deve ser tratado como identidade do produto sem novo gate aprovado.

## Rollback

Antes da produção, o rollback é remover a feature flag/configuração Better Auth e restaurar o estado anterior somente em ambiente de desenvolvimento/teste. Não reativar device-token como bootstrap público nem migrar produção de volta automaticamente. Após produção, rollback exige preservar sessões/revogações e executar plano de migração reversa aprovado; nenhuma credencial deve ser copiada entre provedores.

## Atualizações canônicas

- Spec: `docs/superpowers/specs/2026-07-28-project-recovery-product-architecture.md`, D07 e seção 7.1.
- Roadmap: `docs/superpowers/plans/2026-07-28-project-recovery-roadmap.html`, checklist 4.1.
- Evidência: `docs/superpowers/goal-runs/20260802161604-po087l.md`.
