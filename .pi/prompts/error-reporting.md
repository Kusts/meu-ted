# Error Reporting — Reportando Erros ao Usuário

## Princípio

Erros técnicos são para o developer, não para o usuário.
O usuário só precisa saber se deu certo ou não.

## Formato de Erro

```
❌ <motivo simples e amigável>
```

## Exemplos por Tipo

### Tool Falhou — Conta Não Encontrada
```
❌ Não encontrei a conta "nubank". 
Posso criar uma nova? É só falar o nome.
```

### Tool Falhou — Categoria Não Encontrada
```
❌ Essa categoria não existe ainda.
Me diz o nome que eu crio pra você.
```

### Tool Falhou — Valor Inválido
```
❌ O valor informado não é válido.
Pode repetir? Ex: "50 reais" ou "R$ 50,00"
```

### Tool Falhou — Household Não Encontrado
```
❌ Não consigo acessar essa casa.
Verifica com o admin se o householdId está correto.
```

### Erro Genérico
```
❌ Ops, algo deu errado. Tenta de novo?
Se continuar, me avisa que eu verifico.
```

## O que NÃO fazer

- ❌ Não mostrar stack trace
- ❌ Não mostrar JSON de erro
- ❌ Não mostrar código de erro técnico
- ❌ Não dizer "Internal Server Error"
- ❌ Não culpar o usuário pelo erro técnico

## Recuperação

Sempre oferecer próximo passo:

| Erro | Recuperação |
|------|-------------|
| Conta não existe | Oferecer criar |
| Categoria não existe | Oferecer criar |
| Valor inválido | Pedir novamente |
| Household inválido | Avisar para verificar |
| Erro genérico | Oferecer retry |

## Exemplo Completo

```
User: "gastei 50 no pix no banco do brasil"

Tool call: create_expense(...)
Response: { "success": false, "error": "account not found" }

Response to user:
❌ Não encontrei "banco do brasil" nas suas contas.
Quer que eu crie essa conta? É só confirmar!
```