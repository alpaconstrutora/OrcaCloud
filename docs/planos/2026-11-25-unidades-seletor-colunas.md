# Torres & Unidades › Unidades: seletor de colunas

## Pedido original (25/11/2026)

> adicione seletor de colunas,

Contexto: depois do ajuste automático de largura (#759), a tabela segue rolando na horizontal em 1600 px, porque as
14 colunas somam mais que a tela. Esconder colunas é o caminho.

## Itens

1. `components/empreendimento/UnitEditor.tsx` ganha o seletor:
   - `useTableColumns(COLUNAS_DA_TABELA, 'empreendimentoUnidadesColunas')`, só para a visibilidade (a ordenação continua
     a da tela) + `ColumnConfigButton`;
   - o seletor fica num bloco `h-9` junto do ajustar largura (guia §5.1, "configurar as colunas");
   - Unidade e Ações ficam sempre visíveis.
2. **Cada parte da tabela segue as colunas visíveis:**
   - cabeçalho, linha de edição, linha de leitura e `<colgroup>`;
   - a largura da tabela soma só as visíveis.
3. **Cabeçalho do grupo e total:**
   - o rótulo ocupa as colunas até a 1ª área visível;
   - Priv. e Comum ficam na coluna delas;
   - o resto, mais o espaçador (e Ações, no total), vai numa célula só.
   - *Pronto quando:* com Vagas e Área privativa escondidas, toda linha ocupa exatamente os `<th>` do cabeçalho
     (`__tests__/components/UnitEditorAgrupar.test.tsx`). ✅

## Estado
- [x] Itens 1–3, guia §6.12 atualizado
- [x] Navegador (Garden › Torre A): seletor com 13 opções (sem Unidade); escondendo Elevação, Banheiros, Suítes, Vista e Orientação a tabela foi de 1710 px (com rolagem) para 1190 px sem rolagem, 24 linhas sem desalinhar; a escolha volta depois de recarregar. O ajustar largura, com essas 9 colunas, chega a ~1208 px (o conteúdo sem quebra) — 18 px de rolagem; medido também sem agrupamento, não é o cabeçalho do grupo
- [ ] Publicação
