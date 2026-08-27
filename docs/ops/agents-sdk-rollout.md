# Agents SDK Rollout & Deployment Runbook

Este documento estabelece o procedimento operacional de homologação, rollout progressivo e plano de contingência para o assistente financeiro TED construído sobre o Cloudflare Agents SDK.

---

## 1. Fases de Rollout

### Fase 1: Staging e Homologação Inicial
- Deploy da API autoritativa com migrations V034/V035 em ambiente de staging.
- Configuração de runtime em modo `disabled`.
- Execução de testes de integração e validação de tokens anti-replay.
- Teste de probe de provedor com credenciais provisionadas.

### Fase 2: Rollout Canary
- Alteração do modo de rollout para `canary` via painel administrativo ou API:
  - Percentual inicial de tráfego delegado para o novo modelo de IA: 10% a 25%.
- Monitoramento de 24 horas para:
  - Taxa de erro (< 0.1%).
  - Latência de respostas e streaming.
  - Ocorrências de rate limit e esgotamento de orçamento diário.
  - Tentativas de injeção ou violação de autorização.

### Fase 3: Rollout Global (`all`)
- Ativação global (`rolloutMode: "all"` / 100%).
- Habilitação do switcher e do launcher flutuante para todos os clientes PWA.

---

## 2. Procedimento de Rollback de Emergência

Caso ocorra degradação ou incidente operacional:

1. **Rollback Rápido de Configuração (Zero Downtime)**:
   - Alterar o `rolloutMode` para `disabled` no painel administrativo `/perfil`.
   - O assistente bloqueia imediatamente novas intenções conversacionais.

2. **Revogação por Comprometimento de Segurança**:
   - Incrementar `securityEpoch` no banco de dados.
   - Conexões abertas e tokens emitidos sob a época anterior são rejeitados imediatamente.
   - Rotacionar chaves de provedor e segredos HMAC.

3. **Rollback de Código**:
   - Manter as migrations aditivas no PostgreSQL.
   - Reverter o deploy do Worker `apps/agent` e da PWA `apps/pwa` para a versão estável anterior.
