# Arrastar a peça no 3D como no 2D (livre, com a trava de 90°)

## Pedido original

Sessão `cb72b486-263a-49c9-83cc-fd291232608c`, 13/10/2026, ao conferir o 3D sem espelho (print do
quarto com a cama selecionada e a alça de setas):

> 1. Arrastar uma peça pela alça no 3D: ela deve ir para o lado em que você arrasta: Veja print.
> gostaria que funcionasse como é feito no 2D. selecionar um peca e arrastar para onde quisese sem
> ter que clicar nas setas de direcao. outro ponto é que so é possivel no 3d mover ortogonalmente.
> No 2d é possivel desloigar a trava 90 graus e mover livremente.

## Como o 2D faz (a regra a copiar — `BlueprintCanvas.tsx`, aperto do ponteiro)

- Apertar SEM Shift/Ctrl sobre um item JÁ selecionado pega o conjunto inteiro e arrasta.
- A PEÇA (componente/móvel, ponto/terminal, quadro) arrasta já no primeiro aperto: seleciona e anda.
- Durante o arraste, a trava ortogonal (`ortogonal`, botão "Trava 90°", F8) zera o eixo menor; o
  Shift INVERTE a trava naquele instante (`ortoAtivo`).
- Ao soltar: um `TranslateEntities` (`comandoDeMover`), um Ctrl+Z; clique sem andar = só seleção.

## Decisão

- No 3D o arraste corre num PLANO HORIZONTAL na altura do ponto agarrado (a peça desliza no piso
  dela, não sobe nem desce). O raio do ponteiro corta esse plano: `pontoNoPlanoHorizontal` (puro);
  perto do horizonte o corte vai a quilômetros — além de um alcance, ignora o movimento.
- O deslocamento (mundo → desenho → mm do modelo, passo de 10 mm, trava/Shift) é
  `deslocamentoDoArrasteNoPiso` (puro, em `utils/blueprint3dSelecao.ts`).
- Só a peça da FRENTE decide: apertar uma parede que está diante da peça selecionada não arrasta a
  peça escondida. Apertar a alça (setas) continua sendo a alça.
- A órbita é desligada no aperto e religada ao soltar; Esc cancela.
- A trava vem do mesmo estado do 2D (`ortogonal` do editor) — uma trava só, o botão vale nos dois.
- A alça fica: a seta verde é o único jeito de subir/descer, e as setas dão o movimento de eixo exato.

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/blueprint3dSelecao.ts` | `pontoNoPlanoHorizontal`, `deslocamentoDoArrasteNoPiso` | Testes: raio corta o plano; paralelo/para cima/além do alcance = null; arrastar ao norte do mundo (−Z) = +y no modelo; trava zera o eixo menor; sem trava anda nos dois |
| 2 | `components/blueprint/Blueprint3DViewer.tsx` | Aperto na peça inicia o arraste; `ArrastarNoPiso` segue o ponteiro; prévia translúcida; dica | Harness: arrastar a peça na diagonal com a trava desligada move nos dois eixos; com a trava, só num |
| 3 | `Blueprint3DTab.tsx`, `BlueprintEditor.tsx` | `ortogonal` chega ao 3D | typecheck |

## Estado

- [x] 1 — 5 testes novos em `__tests__/blueprint3dSelecao.test.ts`; mutação: sem a trava → 1 falha; sem a troca de sinal norte–sul → 2 falhas.
- [x] 2 — harness `docs/spikes/blueprint-3d/?editar=1&peca=movel` (móvel no piso, câmera orbitada para cima): arraste diagonal com `orto=0` → 2000,2000 → 2640,3940 (os dois eixos); com `orto=1` → 2000,3940 (só um). A prévia translúcida segue o cursor, a câmera não gira no gesto e a alça some. A seta vermelha da alça continua: 2000 → 3650 só em x.
- [x] 3 — typecheck 0 erros.
- [x] Suíte 8816 = 8782 + 34 pendentes + 0 falhas; `vite build` ok; ui-standard, xss e origem-do-deploy limpos.
- [ ] Publicação, Vercel, CI
- Não provado no harness: parede DIANTE da peça selecionada (o aperto deve orbitar, não arrastar a escondida) e o primeiro aperto numa peça não selecionada (seleciona e arrasta).
