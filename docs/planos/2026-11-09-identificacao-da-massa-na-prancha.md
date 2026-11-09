# Identificação da massa na prancha exportada (PDF/PNG/DXF) (09/11/2026)

## Pedido original

> "A prancha exportada (PDF/DXF) ainda leva só os blocos e seus nomes, sem unidades e pavimentos. Implementar
> unidades e pavimentos também"

## Mudança

A conta saiu do canvas da tela e foi para a projeção, então a tela, a prancha e o DXF desenham a mesma coisa.

1. **Puro (`utils/blueprintMassaNaVista.ts`):**
   - `comMassa(…, pisos)`: com os pavimentos das torres, a projeção leva `unidadesDaMassa` (`unidadesNaVista`). Cada
     bloco leva `rotulosDosPisos`, com o nome e a elevação do cadastro.
   - `textosDaUnidade`: devolve "101 · Frente" ou "101". Quem desenha usa o primeiro que couber.
   - `rotulosDosPavimentos`: "nome +elevação" ao lado do bloco.
     - Fica por fora no começo e no fim do conjunto; o bloco do meio leva por dentro.
     - Sem cadastro, "Nº pav" e a cota do desenho.
   - `PisosDaMassa` e `ExibirNaMassa` são os tipos que a tela, a prancha e o DXF compartilham.
2. **Tela (`ElevationCanvas`):** passa a usar a projeção e os mesmos textos e rótulos.
3. **Prancha PDF/PNG (`desenharElevacao`):**
   - Recebe `pisosDaMassa` e `exibirNaMassa` em `OpcoesExportacao`.
   - Unidades: divisa tracejada e número, com a Posição quando cabe.
   - Pavimentos: ao lado do bloco.
   - O nome do bloco obedece ao Exibir.
   - A largura do texto vem do desenhista; quem não sabe medir usa a estimativa.
4. **DXF (`entidadesDeElevacao`):**
   - Na camada `ELEVACAO-MASSA`: o nome do bloco (300 mm), as divisas e o número das unidades e os pavimentos
     (200 mm).
   - Respeita o Exibir.
5. **Exportação:**
   - `projecaoDaPrancha` e o conjunto de pranchas passam os pavimentos.
   - O `PainelVersoes` recebe do editor os pavimentos e os liga/desliga de Vista › Exibir.

## Verificação

- **Testes:**
  - `blueprintMassaNaVista`: +4.
    - A projeção leva as unidades e os nomes.
    - Os pavimentos ficam por fora nos dois lados, com "1º pav" na torre sem cadastro.
    - A prancha escreve "101 · Frente" e "Pavimento 1 +3,00", e cada liga/desliga tira o seu.
    - O DXF escreve as unidades e os pavimentos e desliga com o Exibir.
  - Suítes de vista, exportação, DXF, prancha e versões: 546/546.
  - `BlueprintEditor.test.tsx` sozinho: 284/284.
- **Mecânicas:** tsc; check-ui-standard.
- **Visual:** página de teste temporária, sem banco, com a geometria do Garden. A prancha PNG do corte, gerada pelo
  `exportarPranchasPng` real e capturada no Playwright, sai com os nomes, as unidades com posição, as divisas e os
  pavimentos dos dois lados, sem erro.
