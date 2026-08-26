# G6.1.3 — Share Target e captura rápida na PWA

## Objetivo

Permitir que o compartilhamento de texto para a PWA e o atalho “Novo gasto” abram o formulário de nova despesa. Quando houver texto compartilhado, ele preenche a descrição para revisão antes do salvamento.

## Escopo

- Atualizar o manifesto da PWA com `share_target` via GET.
- Adicionar o shortcut “Novo gasto” apontando para a captura rápida.
- Criar a rota client-side `/capture` para consumir os parâmetros.
- Reutilizar o evento `pwa:open-tx` e o `AppShell` existente.
- Propagar a descrição inicial até `NewTransactionSheet`.
- Normalizar a URL após o consumo para evitar reprocessamento no refresh.

## Contrato de entrada

- `kind=expense` seleciona a aba de despesa.
- `title`, `text` e `url` são aceitos pelo `share_target`.
- A descrição inicial é formada pelo texto compartilhado; se não houver texto, usa `title`; se ambos faltarem, usa uma descrição vazia.
- A URL compartilhada pode ser preservada como parte do texto somente quando não houver texto nem título; não haverá scraping nem chamada externa.

## Fluxo

1. O sistema operacional abre `/capture` com parâmetros de compartilhamento ou shortcut.
2. A rota renderiza o `AppShell` uma vez e o bridge client-side lê os parâmetros.
3. A rota dispara `pwa:open-tx` com `kind: "expense"` e a descrição inicial.
4. O `AppShell` abre `NewTransactionSheet` em modo despesa.
5. O bridge usa `window.history.replaceState(null, "", "/")` para normalizar a URL sem desmontar o shell nem perder o formulário.
6. O salvamento continua usando o fluxo existente de `handleSave`.

## iOS

O Web Share Target não tem suporte equivalente no iOS. O contrato iOS desta entrega é o shortcut/URL `/capture?kind=expense`, que pode ser usado por um atalho do sistema e abre a PWA no mesmo formulário.

## Fora de escopo

- Interceptação POST no Service Worker.
- Criação automática da transação sem confirmação.
- Parsing semântico de valores ou categorias.
- Integração com API específica do iOS Shortcuts.

## Verificação

- Teste unitário do retorno do manifesto.
- Teste da rota com `title`, `text`, `url` e sem parâmetros.
- Teste de que o evento abre despesa e preserva o prefill.
- Teste de normalização da URL.
- Typecheck, format/lint e testes existentes da PWA.
