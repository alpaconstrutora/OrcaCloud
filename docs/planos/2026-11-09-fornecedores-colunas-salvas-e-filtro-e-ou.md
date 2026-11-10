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

## Andamento

- 09/11/2026: código, testes e PR #279 (rascunho). Aplicar a migration no banco remoto
  foi barrado pelo auto mode ([Production Deploy]) — aguarda o usuário aplicar ou autorizar.
  Os três itens só são marcados como feitos após a conferência em produção.
- 09/11/2026: usuário autorizou ("pode aplicar"); migration aplicada e conferida no
  information_schema. PR #279 mesclado (561a5fd), CI do main verde, produção servindo.
  Conferido em produção (orcacloud.vercel.app, usuário desenvolvedor@):
  - abrir a tela criou a linha em user_table_column_preferences com o que o navegador tinha;
  - arrastar mudou column_order no banco; apagar `supplierListColumns` do localStorage e
    recarregar trouxe a ordem de volta, do banco;
  - para a direita soltando na metade ESQUERDA de Apelido → caiu antes de Apelido; metade
    direita de Tipo → depois de Tipo; para a esquerda na metade esquerda de Código → antes;
  - "Fornecedor é Decore Vidros OU Apelido contém Decor" → Decore Vidros + Decorlumen.
  Ordem de colunas e filtros do usuário restaurados ao fim.
  (O arrasto do Claude in Chrome não emite dragover no ponto final em arrasto longo — sem
  drop; o arrasto curto real e os eventos disparados com clientX provaram o código no ar.)
- 09/11/2026, achado na conferência: com 1 linha na tabela o painel do Filtro avançado
  ficava CORTADO pelo card da toolbar (overflow-hidden, §5.2) — a 2ª regra, a do E/OU,
  sumia. Item 4 abaixo.

## Itens

### 1. Colunas visíveis salvas no usuário (banco)
- **Muda:** `user_table_column_preferences` ganha `column_order` e `known_columns`
  (migration `aplicar_20271109800000_…`). Hook `usePreferenciaDeColunasDoUsuario` lê a
  preferência ao abrir a tela e grava (com atraso curto) a cada mudança de colunas
  visíveis, ordem ou ordenação. `SupplierList` usa o hook. O modal diz que a escolha fica
  salva no usuário.
- **Pronto quando:** em produção, mudar uma coluna, apagar `supplierListColumns` do
  localStorage e recarregar → a escolha volta (veio do banco); linha conferida no banco.
- [x] feito (conferido em produção, 09/11/2026)

### 2. Posição das colunas
- **Muda:** `SortableHeader` sabe de que lado do cabeçalho o mouse está (metade esquerda =
  antes, direita = depois), desenha a linha azul daquele lado e passa o lado para
  `moveColumn`, que solta exatamente ali. A ordem entra na gravação do item 1.
- **Pronto quando:** teste de `moveColumn` com lado 'antes'/'depois' nos dois sentidos;
  em produção, arrastar para a direita solta onde a linha azul mostrou.
- [x] feito (conferido em produção, 09/11/2026)

### 3. Filtro avançado E / OU
- **Muda:** cada regra a partir da 2ª tem conector `e`/`ou` (um só para o conjunto, padrão
  ClickUp: trocar em uma linha troca todas). `applyFilterRules` avalia com precedência
  (E antes de OU) e ignora regra ainda sem valor. Vale para as 18 telas que usam o painel,
  sem mudar as chamadas. Filtro salvo guarda o conector junto (está dentro das regras).
- **Pronto quando:** testes de `applyFilterRules` (E, OU, regra incompleta) e do painel
  (trocar para OU mostra a união); em produção, dois filtros com OU em Meus Fornecedores.
- [x] feito (conferido em produção, 09/11/2026)

### 4. Painel do Filtro avançado não pode ser cortado pelo card
- **Muda:** o painel abre por portal em `document.body` (`position: fixed`, ancorado à
  direita do botão), como a lista de valores e o FilterPopover (§5.4). Clique dentro dele
  não conta como "clique fora".
- **Pronto quando:** teste com o painel dentro de um contêiner `overflow: hidden` de 40 px
  (painel fora dele, 2ª regra visível); em produção, com 1 linha na tabela, as duas regras
  aparecem inteiras.
- [x] feito (PR #285, 4cb75f7; conferido em produção 09/11/2026: filtro com 1 linha na tabela, painel inteiro com "Onde", o seletor OU e as duas regras; filtros do usuário restaurados)
