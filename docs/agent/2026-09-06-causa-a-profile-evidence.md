# CAUSA-A — evidência e correção de dado (2026-09-06 ~15:14 UTC)

Diagnóstico (read-only): device tokens das sessões de hoje do admin resolvem para o
household `d36cb649-4462-486d-940a-47128ad329f2`, que não tinha linha em `profiles`
→ `GET /profile` retornava `{profile:null}` → PWA escondia o item admin.

## Estado antes (SELECT, sem segredos)

- `profiles`: 1 row total — só `550e8400-...` (name `Usuário`, email vazio).
- `SELECT count(*) FROM profiles WHERE household_id='d36cb649-...'` → **0**.
- `device_tokens`: `550e8400` 340 tokens; `d36cb649` 5 tokens (latest `2026-09-06 15:05:25Z`,
  mesmo segundo da sessão admin mais recente); `ff4249d8` 1 token (2026-09-03).
- `households`: `d36cb649` existe (`personal`, `active`); `profiles` sem FK (só PK + checks).

Desvio documentado do plano: não existe "perfil mais recente em outro household" para
copiar (só há 1 row, de email vazio). Nova row semeada dos defaults da única row existente
(name `Usuário`, avatar `#0E8C5A`, greeting `auto`) + email do admin (dado do próprio
report, necessário à identidade do perfil).

## Mutação (única, autorizada)

```sql
INSERT INTO profiles (household_id, name, avatar_color, greeting_style, email, phone)
VALUES ('d36cb649-4462-486d-940a-47128ad329f2', 'Usuário', '#0E8C5A', 'auto',
        '<owner-email>', '');
-- INSERT 0 1, updated_at 2026-09-06 15:14:01Z
```

Nenhuma outra linha tocada (sem UPDATE/DELETE em dados existentes).

## Validação

- `SELECT` pós-INSERT mostra a row; `GET /profile` sem auth segue 401 (rota íntegra).
- Prova final do item visível: usuário no reload do PWA.

## Rollback (se necessário)

> AVISO: nunca use `DELETE ... WHERE household_id = '...'` isolado — apagaria
> edições posteriores do usuário nesse household. O rollback abaixo só apaga a row
> se ela ainda estiver exatamente como criada (guarda em todas as colunas,
> incluindo `updated_at`, que qualquer PATCH/upsert posterior altera).

Row criada (identidade exata — PK `household_id`, sem coluna `id` separada):

- `household_id` = `d36cb649-4462-486d-940a-47128ad329f2`
- `name` = `Usuário`, `email` = `<owner-email>`, `phone` = `` (vazio),
  `avatar_color` = `#0E8C5A`, `greeting_style` = `auto`,
  `updated_at` = `2026-09-06 15:14:01.096208+00`

```sql
DELETE FROM profiles
 WHERE household_id = 'd36cb649-4462-486d-940a-47128ad329f2'
   AND name = 'Usuário'
   AND email = '<owner-email>'
   AND phone = ''
   AND avatar_color = '#0E8C5A'
   AND greeting_style = 'auto'
   AND updated_at = '2026-09-06 15:14:01.096208+00';
-- Esperado: DELETE 1 (row intacta) ou DELETE 0 (row foi editada depois —
-- nesse caso NÃO force: revise manualmente em vez de apagar).
```

Pré-INSERT havia 0 rows para esse household (evidência acima).
Backup adicional: `backups/pre-d0f6908-20260906T135211Z.sql` (dump pré-deploy de hoje).
