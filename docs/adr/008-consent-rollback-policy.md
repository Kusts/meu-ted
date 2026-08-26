# ADR-008: Política de Consentimento e Proteção de Rollback

**Status:** accepted  
**Date:** 2026-08-18  
**Decision:** D08  

## Contexto

Operações destrutivas em produção, como exclusão de contêineres, rotação de chaves e remoção física de código, exigem segurança contra perda acidental de dados ou interrupção de serviço.

## Decisão

1. Operações externas irreversíveis exigem consentimento explícito prévio e documento de change-set com rollback detalhado.
2. Toda ação de cutover deve ser precedida por uma tag anotada no Git (`pre-g6-legacy-retirement`) e backup de banco de dados validado via checksum SHA256.
3. Se qualquer invariante falhar durante a janela de corte ou de soak (48h), o rollback é executado imediatamente.

## Impacto e Rollback

- **Segurança Operacional:** Zero risco de perda irreversível de dados durante janelas de manutenção e migração.
