# Meus Fornecedores — colunas salvas no usuário, posição que se mantém, filtro E/OU

## Pedido original

Sessão de 09/11/2026 (VS Code):

> minha organizacao > meus fornecedores:
> 1. botão Colunas visíveis: implemente salvar escolha do usuário.
> 2. A posicão das colunas não estão mantendo. verifique
> 3. Filtro avançado deve ter logica E e OU para quando o usuário coloca mais de um filtro

## Diagnóstico (reproduzido em produção, Chrome, 09/11/2026)

- A escolha de colunas e a ordem arrastada **já ficavam no localStorage** (`supplierListColumns`)
  e sobreviviam a recarregar a página — no MESMO navegador. Outro navegador/computador,
  ou "limpar dados do site", voltava ao padrão: a escolha não era do usuário, era do navegador.
- Arrastar coluna para a DIREITA soltava a coluna **depois** da coluna-alvo, mas a linha azul
  de "solte aqui" fica à **esquerda** dela. A coluna não ia para onde a tela mostrava
  (`moveColumn` em `components/ui/TableUtils.tsx`: tira e reinsere no índice do alvo).
- Filtro avançado: `applyFilterRules` só fazia `rules.every(...)` (E).

## Itens

### 1. Colunas visíveis salvas no usuário (banco)
- **Muda:** `user_table_column_preferences` ganha `column_order` e `known_columns`
  (migration `aplicar_20271109800000_…`). Hook `usePreferenciaDeColunasDoUsuario` lê a
  preferência ao abrir a tela e grava (com atraso curto) a cada mudança de colunas
  visíveis, ordem ou ordenação. `SupplierList` usa o hook. O modal diz que a escolha fica
  salva no usuário.
- **Pronto quando:** em produção, mudar uma coluna, apagar `supplierListColumns` do
  localStorage e recarregar → a escolha volta (veio do banco); linha conferida no banco.
- [ ] feito

### 2. Posição das colunas
- **Muda:** `SortableHeader` sabe de que lado do cabeçalho o mouse está (metade esquerda =
  antes, direita = depois), desenha a linha azul daquele lado e passa o lado para
  `moveColumn`, que solta exatamente ali. A ordem entra na gravação do item 1.
- **Pronto quando:** teste de `moveColumn` com lado 'antes'/'depois' nos dois sentidos;
  em produção, arrastar para a direita solta onde a linha azul mostrou.
- [ ] feito

### 3. Filtro avançado E / OU
- **Muda:** cada regra a partir da 2ª tem conector `e`/`ou` (um só para o conjunto, padrão
  ClickUp: trocar em uma linha troca todas). `applyFilterRules` avalia com precedência
  (E antes de OU) e ignora regra ainda sem valor. Vale para as 18 telas que usam o painel,
  sem mudar as chamadas. Filtro salvo guarda o conector junto (está dentro das regras).
- **Pronto quando:** testes de `applyFilterRules` (E, OU, regra incompleta) e do painel
  (trocar para OU mostra a união); em produção, dois filtros com OU em Meus Fornecedores.
- [ ] feito
