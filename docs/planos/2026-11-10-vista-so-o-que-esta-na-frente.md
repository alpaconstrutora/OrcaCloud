# Fachadas e corte: só a identificação do que está na frente (10/11/2026)

## Pedido original

> "na vista de frente e fundos a identificacao das unidades estao sobrepostas. mostrar apenas a que esta na frente"

O pedido veio com um print da fachada do Garden. Os números das unidades, os nomes e os pavimentos da torre de trás
saíam por cima dos da torre da frente: "TR08 · Fundos004 · LateralTR07", "Estacionamento-1" sobre "Pavimento-1".

## Causa

A regra "a unidade mais perto cobre a de trás" (`unidadesNaVista`) só valia **dentro de cada bloco**. Um bloco inteiro
na frente de outro, como a Torre A na frente da Torre B na fachada da frente, não escondia a identificação do de trás.
As fatias eram pintadas na ordem certa, mas os textos de trás iam por cima.

## Mudança (`utils/blueprintMassaNaVista.ts`)

- `BlocoNaVista.profundidade`: o quão longe o bloco está de quem olha. O bloco cortado é −∞.
- `escondidoNaVista(massa, b, u, v)`: diz se um bloco mais perto cobre aquele ponto.
- `unidadesNaVista`: em cada pavimento, os trechos cobertos por blocos mais perto saem do pavimento antes da conta
  dentro do bloco. Vale para o bloco cortado e para o em vista.
- `rotulosDosPavimentos`: o rótulo cuja borda está escondida não sai.
- `nomeDoBlocoAVista`: o nome no alto do bloco só sai se ali não houver bloco mais perto. A tela, a prancha e o DXF
  usam essa regra.

## Verificação

- **Testes:**
  - "Só o que está na frente": na fachada da frente do Garden, as unidades da Torre B não saem e só as da frente da
    Torre A saem; o nome e os pavimentos da B também não saem.
  - **Os dois testes falham sem a correção e passam com ela.**
  - Suítes de vista, exportação e DXF: 502/502.
- **Mecânicas:** tsc; check-ui-standard.
- **Visual:** página de teste temporária, sem banco, com as duas torres e as unidades das duas, fotografada no
  Playwright.
  - Frente: só a Torre A, e das garagens da B só o trecho que desce abaixo da da A.
  - Fundos: só a Torre B.
  - Nenhum texto sobreposto e nenhum erro.
