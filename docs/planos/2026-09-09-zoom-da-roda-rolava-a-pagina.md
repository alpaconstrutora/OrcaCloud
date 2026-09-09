# A roda dava zoom e rolava a página junto

## Pedido original

> vou iniciar os testes:
> bug ao usar o scrol do mouse para zoom in e zoom out, o zoom esta funcionando
> porem a tela tambem se movimenta para cima e para abaixo

⚠️ **Primeiro defeito achado por uso real** desde que o módulo BIM começou, em
07/09. Ele estava em pé desde sempre, atravessou 3.268 casos de teste e nenhum
deles o viu — porque nenhum deles é uma pessoa com um mouse.

## A causa

Os dois tratadores de roda do módulo — `BlueprintCanvas.aoRolar` e
`useCanvasVista.aoRolar` — calculavam a escala e **nunca chamavam
`preventDefault`**. O evento seguia para o ancestral rolável e fazia o que a roda
faz numa página: rolar. Zoom e rolagem ao mesmo tempo.

## ⚠️ Por que a correção óbvia não serve

Acrescentar `e.preventDefault()` dentro do `onWheel` **não funciona**. Desde o
React 17, `wheel`, `touchstart` e `touchmove` são registrados no contêiner raiz
como **passivos**; um listener passivo declara ao navegador que não vai cancelar
nada, e o `preventDefault` é ignorado — com um aviso no console e mais nada.

A saída é um listener **nativo**, no próprio elemento, com `passive: false`
explícito. Virou `hooks/useRodaNaoPassiva.ts`, usado pelos dois canvases.

## ⚠️ Uma suposição minha que a medição derrubou

Escrevi no hook que o jsdom **não** honra `passive`, e que por isso só a asserção
sobre a opção pegaria o caso. Ao medir o portão no defeito — injetando
`passive: true` —, o caso comportamental **também** falhou: o jsdom honra
`passive`. A justificativa foi corrigida no código em vez de ficar como
explicação falsa ao lado de um teste certo.

Os dois casos ficaram. O comportamental é o que importa para quem usa; o que
afirma `passive: false` diz por quê, e é o que sobrevive se o jsdom mudar de
ideia — a asserção que depende do ambiente é justamente a que não pode ficar
sozinha.

## O portão que importa mais que a correção

A correção é **invisível no ponto de uso**: quem escrever o próximo canvas vai
escrever `onWheel={aoRolar}`, porque é o que a documentação do React mostra e o
que o editor completa — e vai reintroduzir o bug. `__tests__/canvasSemOnWheel.test.ts`
varre `components/blueprint/*.tsx` e reprova o atributo com o motivo na mensagem,
e afirma antes que a varredura achou os arquivos (portão que não lê nada aprova
tudo). `useCanvasVista` também deixou de tipar `React.WheelEvent`: tipado assim,
ele **convidava** ao `onWheel`, e o convite era o defeito.

## Fora de escopo, conferido

`components/MeasureAIModule.tsx` usa Konva, cujo `onWheel` é o sistema de eventos
do próprio Konva (`e.evt.preventDefault()` sobre o evento nativo) — mecanismo
diferente, não afetado. `Blueprint3DViewer` usa `OrbitControls`, que registra o
próprio listener não passivo.

## Verificação

1. `npx vitest run __tests__/rodaNaoPassiva.test.tsx __tests__/canvasSemOnWheel.test.ts`
   — 9 casos, com os portões **medidos no código defeituoso** antes de aceitos
   (4 falharam: os dois canvases e as duas propriedades do hook).
2. `bash scripts/check-ui-standard.sh` nos dois `.tsx`.
3. Suíte cheia e `npm run build`.
4. ⏳ **Falta o que só quem usa vê**: rolar a roda sobre a planta no navegador e
   confirmar que a página não se move mais.
