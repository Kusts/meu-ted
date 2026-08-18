# ADR-003: Resolução de Identidade e Workspace Server-Side

**Status:** accepted  
**Date:** 2026-08-18  
**Decision:** D03  

## Contexto

Anteriormente, o `whatsapp-bridge` passava parâmetros soltos de `householdId` ou confiava em headers de entrada não assinados. Isso criava risco de spoofing entre múltiplos lares e acoplava o canal de mensageria à estrutura do banco de dados.

## Decisão

1. O endpoint `POST /auth/bridge-context` é a única autoridade para mapear `phone` -> `user` -> `workspace_id`.
2. Emite tokens delegados JWT (`aud=pi-finance-api`, `iss=pi-agent`) assinados com HMAC-SHA256 e TTL de 300 segundos.
3. Acesso multi-workspace ambíguo é rejeitado com status `409 Conflict` a menos que o `workspaceId` preferencial seja fornecido.

## Impacto e Rollback

- **Segurança:** Isolamento estrito entre households.
- **Rollback:** Se necessário, tokens podem ser revogados pelo secret de deleção.
