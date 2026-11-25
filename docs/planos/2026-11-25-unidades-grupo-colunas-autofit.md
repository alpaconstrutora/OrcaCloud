# Torres & Unidades › Unidades: todas as colunas no Agrupar + ajuste automático de largura

## Pedido original (25/11/2026)

> Na nova aba unidades :
> 1. esta faltando muitas colunas no filtro grupo
> 2. implementar botao de ajusrte automaticao de largura de colunas

## Itens

1. **Agrupar com todas as colunas** — `utils/unidadesGrupos.ts`.
   - Entram Elevação, Área privativa, Área comum, Banheiros, Suítes e Vagas, além das 7 que já existiam.
   - Fica de fora só **Unidade**: há uma por linha, então um grupo por unidade não agrupa nada.
   - As opções seguem a ordem das colunas.
   - Ordem dos grupos:
     - os campos numéricos saem em ordem numérica, com rótulo no singular ou plural ("1 vaga", "2 vagas");
     - as áreas aparecem como na célula ("127,5 m²");
     - a Elevação ordena pelos milímetros, com o texto da coluna ("+2,70 m (calc.)").
   - *Pronto quando:* `__tests__/unidadesGrupos.test.ts` passa. ✅
2. **Ajuste automático de largura** — `components/empreendimento/UnitEditor.tsx`.
   - A tabela adota `useResizableColumns` (guia §6.1):
     - `<colgroup>` com uma `<col data-col-key>` por coluna de dado;
     - alça de redimensionar em todos os cabeçalhos;
     - espaçador antes de Ações;
     - `width` igual à soma das colunas e `minWidth: 100%`.
   - As larguras ficam no navegador (`empreendimentoUnidadesColWidths`).
   - O botão `MoveHorizontal`, "Ajustar largura das colunas ao conteúdo", fica na barra do Agrupar e chama
     `cols.autoFit()` só quando clicado (§6.1.2).
   - *Pronto quando:* `__tests__/components/UnitEditorAgrupar.test.tsx` passa e o `check-ui-standard.sh` fica limpo. ✅

## Estado
- [x] Itens 1–2, guia §6.12 atualizado
- [x] Navegador (Garden › Torre A): 13 opções no Agrupar; Vagas → "1 vaga, 2 vagas, Sem vagas informadas", Priv. → "81 m², 127 m²", Elevação → 6 grupos de −6,30 a +8,70 m; ajustar largura mudou as colunas (Unidade 140→182, Elevação 120→87, Ações 190→170), "Estacionamento 2" deixou de quebrar linha
- [ ] Publicação
