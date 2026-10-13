# O 3D da Planta deixa de ser espelhado

## Pedido original

Sessão `cb72b486-263a-49c9-83cc-fd291232608c`, 12/10/2026. Ao colar o mapa sobre o relevo no 3D
(plano `2026-10-12-camadas-mapa-de-fundo.md`), o nome do rio apareceu escrito ao contrário, e a
análise mostrou que o 3D inteiro é um espelho da planta. A pergunta foi *"Quer que eu faça essa
correção?"*. Resposta:

> Sim

## Diagnóstico

- O 3D põe o desenho em `X = x`, `Z = +y` (paredes com `wall.a.y` direto como z; `shapeDoAnel`
  nega e gira para dar o mesmo; `malhaDaGrade`, extras, `cameraNoMundo3d` idem). No three (mão
  direita, Y para cima), leste = +X e cima = +Y obrigam SUL = +Z (leste × cima = sul). Pôr o
  NORTE em +Z é ver a planta pelo avesso — da câmera a NE olhando SO, a direita apontava SE.
- O SOL já usa a convenção certa (`z = centro − sol.y`, norte em −Z): hoje ele fica do lado
  oposto da geometria e as sombras saem trocadas. Corrigindo o espelho, o sol fica certo sem mexer.

## Decisão — um grupo espelhado, conversão só na fronteira

- Tudo que está no ESPAÇO DO DESENHO (a `Cena` e o meio-tom, as referências IFC — cuja matriz
  já leva ao espaço do desenho —, o contorno da caixa de corte e a alça de mover com a prévia)
  entra num `group scale={[1, 1, -1]}`. O three inverte o `frontFace` de objeto com determinante
  negativo (render e sombra), e o sprite do rótulo usa o módulo da escala (não espelha o texto).
- A alça de mover fica DENTRO do grupo: o arraste dela continua devolvendo deslocamento no espaço
  do desenho, e `deltaDoMundoParaModelo` não muda.
- FORA do grupo, no mundo real: câmera e `Enquadrar`, `OrbitControls`, luzes, grade, `Percorrer`
  e os pontos de vista (F12). Recebem o centro/posições pelo `doDesenhoParaMundo` (z → −z), e o
  chão do percorrer é consultado com `z` de volta para o desenho.
- Os planos da caixa de corte: o three aplica `clippingPlanes` em coordenadas do MUNDO; dentro do
  grupo espelhado, a normal tem o z invertido (`planoNoMundo`).
- As funções puras (`enquadramentoDoModelo`, `caixaInicial`, `planosDaCaixaDeCorte`,
  `cameraNoMundo3d`, `malhaDaGrade`…) continuam no espaço do desenho, com os testes que já têm.

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/blueprint3dEspelho.ts` (novo) | `ESCALA_DO_DESENHO_NO_MUNDO`, `doDesenhoParaMundo`, `planoNoMundo` | `__tests__/blueprint3dEspelho.test.ts`: leste × cima = sul no mundo; norte do desenho em −Z; plano espelhado corta o mesmo ponto |
| 2 | `components/blueprint/Blueprint3DViewer.tsx` | O grupo; centro no mundo para câmera/órbita/luz/grade/percorrer; pontos de vista; planos da caixa | Harness: o texto do mapa sobre o relevo lê certo; prova de orientação (marcador a NE aparece à direita olhando para o norte) |

## Estado

- [x] 1 — 4 testes em `__tests__/blueprint3dEspelho.test.ts` (leste × cima = sul; norte em −Z; plano corta o mesmo ponto).
- [x] 2 — harness `docs/spikes/terreno-grande-3d/`: `?mapa=RELEVO` com o texto do mapa lendo certo; `?mapa=RUAS&curvas=1&envelope=1` com lago (SO) à esquerda e rio (NE) à direita da câmera a SE; caixa de corte ligada recorta e desenha o contorno no lugar.
- [x] Suíte 8811 = 8777 + 34 pendentes + 0 falhas; typecheck 0 erros; `vite build` ok; ui-standard, xss e origem-do-deploy limpos.
- [x] Publicado em `18e1230d` (12/10/2026): domínio carimbado `18e1230`, Vercel success, check-run `ci` success.
- Não provado interativamente: arrastar peça pela alça no 3D, pontos de vista gravados antes da correção (posição salva no espaço do desenho é convertida — devem cair no mesmo lugar) e Percorrer.
