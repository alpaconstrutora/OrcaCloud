# Concepção: os nomes das unidades legíveis (29/10/2026)

## Pedido original

> "no estilo conecepcao a cor da identificacao das unidades esta clara e nao aparece."

O pedido veio com um print da Concepção, com os nomes das unidades ligados no Exibir.

## Causa

- Na Concepção, a câmera fica longe, com uma lente de 10° na diagonal isométrica.
- A etiqueta da unidade tinha **0,55 m no mundo**, com texto azul claro sobre branco translúcido.
- De longe, ficava com poucos pixels e quase transparente.

## Mudança (`Blueprint3DViewer`)

- O `RotuloDeRede` ganha `fracaoDaTela`: a altura vira uma fração da **tela**, sem `sizeAttenuation`, e a escala
  acompanha a lente a cada quadro, como a `EtiquetaDeChamada`. Nesse modo, o fundo é branco opaco.
- Na Concepção, a unidade usa 2,4% da altura da tela, texto `#0f172a` em negrito.
- Os outros estilos continuam como antes.

## Verificação

- tsc; check-ui-standard; `blueprintConcepcao` e `blueprintRotulosDaMassa`.
- **Visual:** página de teste temporária com a geometria da Planta 26/10/2026, sem banco, fotografada no Playwright.
  - Na Concepção, os 32 nomes (101 a 408) aparecem legíveis, em todos os andares.
  - O Sombreado ficou igual ao de antes.
