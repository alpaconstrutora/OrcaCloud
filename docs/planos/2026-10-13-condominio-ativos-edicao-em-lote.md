# Condomínio › Ativos do edifício: edição em lote

## Pedido original

Sessão `b1a5373a`, 13/10/2026:

> Ativos do edifício: implementar edicao em lote

## Decisões

- Padrão do guia §10 (barra fixa no rodapé, azul; modal dedicado) + §10.1 (Shift+clique) + REGRA #4
  (painel lateral). Modelo de painel: `TaskBulkEditSheet.tsx`.
- Campos do lote: Sistema predial, Localização, Marca, Modelo, Instalação, Garantia do fornecedor até,
  Observações. Cada um nasce em "Não alterar"; texto e datas têm "Definir" / "Limpar".
- **Fora do lote:** nome e nº de série — identidade de cada aparelho; o mesmo valor em vários é engano.
- Excluir em lote não foi pedido e não entrou.

## Itens

### 1. Service — `buildingAssetService.updateMany(ids, patch)` ✅
Um UPDATE com `.in('id', ids)`. Devolve só as linhas gravadas: se a RLS barrar parte, o UPDATE não dá
erro, só devolve menos — a tela compara e avisa quais ficaram de fora (ficam selecionados).
**Pronto quando:** tsc passa e o lote grava os 2 equipamentos de teste. → ok.

### 2. Painel — `components/condominio/AtivosEdicaoEmLoteSheet.tsx` ✅
Resumo do lote (código · nome), campos com malha §30, "Aplicar em N equipamentos" desabilitado sem
alteração (com `title`), `dirty` no Sheet. Seletor de modo e campo empilhados (lado a lado, em meia
coluna, a data aparecia cortada — visto no print).
**Pronto quando:** abre vazio a cada vez; aplica e fecha; erro aparece dentro do painel. → ok.

### 3. Tabela — `components/condominio/AtivosTab.tsx` ✅
Coluna de checkbox (40px, estrutural no colgroup; larguras padrão reduzidas em 40px para "Ações"
seguir visível), cabeçalho marca/desmarca **os visíveis** (a busca recorta o lote; indeterminado
quando parcial), Shift+clique por intervalo, linha marcada em azul claro, barra de lote, seleção
limpa ao recarregar/aplicar e ao excluir o item. Atualização só das linhas gravadas (§22).
**Pronto quando:** verificado no app. → 13/10: 2 equipamentos de teste, Shift+clique marcou os 2,
Definir localização+marca gravou nos 2, "marcar visíveis" + Limpar localização apagou só a
localização, nenhum equipamento fora da seleção alterado, `<col>` = `<th>`, sem scroll horizontal.
Testes apagados do banco (0 restantes).
