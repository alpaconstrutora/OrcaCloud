# A instalação era desenhável e não era selecionável

## Pedido original

> os componetes eletrica e hidraulica, parece que nao consigo seleciona-los e
> nao consigo move-los. verifique

## ⚠️ O diagnóstico, e por que ele importa mais que a correção

O relato diz "não consigo selecionar **e** não consigo mover", e são duas frases
para um defeito só: **não mover era consequência de não selecionar**.

Tudo o que vem depois da seleção já estava pronto e provado:

| peça | situação antes desta correção |
|---|---|
| `TranslateEntities` com `trechoIds`/`terminalIds`/`quadroIds` | ✅ existia |
| `DeleteTrecho` / `DeleteTerminal` / `DeleteQuadro` no `Delete` | ✅ existia |
| `PainelTrechoSelecionado`, painel de propriedades | ✅ existia |
| desenho no canvas, com cor por disciplina | ✅ existia |
| **a rede na cadeia de acerto do clique** | ❌ **nunca esteve lá** |

A cadeia testava abertura, limite, estrutura, escada, parede, água, medição e
corte. Nenhuma das famílias de rede. O laço de seleção também não as varria, e o
Ctrl+A não as incluía.

**A lição**: uma família nova precisa de DUAS ligações — a que a **desenha** e a
que a **alcança**. A primeira é visível no instante em que se escreve; a segunda
só falha quando alguém tenta usar. Publiquei quatro famílias que só se podia
desenhar.

## O que foi feito

1. `quadroSob`, `terminalSob` e `trechoSob` em `utils/blueprintRede.ts` — funções
   **puras**, e não dentro do canvas, porque no canvas só seriam testáveis
   renderizando um contexto 2D que o jsdom não tem.
2. A cadeia do clique passou a testá-las. **Ordem**: quadro e terminal logo depois
   da abertura (símbolos pequenos, de tamanho fixo na tela — ninguém acerta um
   por acidente); trecho **antes da parede**, porque o caso normal de um
   eletroduto é correr DENTRO de uma parede e, depois dela, o cano embutido
   nunca seria pego.
3. O laço e o Ctrl+A passaram a incluir as três famílias.
4. **A prévia do arraste**: `trechosDoNivel`/`terminaisDoNivel`/`quadrosDoNivel`
   agora aplicam o delta do arraste, como `estruturasDoNivel` já fazia. Sem isso,
   arrastar não mexeria nada na tela e o cano pularia ao soltar — o gesto
   pareceria travado até o instante em que já acabou. Os ids selecionados passaram
   a sair dos `...Reais` para não criar ciclo.

## ⚠️ Dois detalhes que quebrariam a correção ingênua

**O alcance é em PIXELS.** Terminal e quadro são símbolos de tamanho fixo na
tela — uma caixa real de 40 cm sumiria na planta. Alcance fixo em milímetros
pegaria metros de área com o zoom afastado e menos que o próprio símbolo com o
zoom perto: em nenhum dos dois o clique casaria com o que se vê.

**A PRUMADA.** As duas pontas no mesmo ponto em planta. Uma distância a segmento
sem tratar o degenerado devolve `NaN`, e `NaN <= alcance` é falso: o trecho mais
comum de uma instalação seria o único inclicável, sem erro na tela.

## ⚠️ E um portão meu que aprovou a ausência

Ao medir os portões no código defeituoso, injetei três defeitos. Dois foram
pegos; o terceiro — remover quadro e terminal da cadeia — **passou**. Causa:
`indexOf` devolve `-1` para o que não existe, e `-1 < posição da parede` é
verdadeiro. O portão afirmava a ordem sem afirmar a presença. Corrigido, e o
motivo ficou escrito na função auxiliar.

## Verificação

1. `npx vitest run __tests__/blueprintRedeAcerto.test.ts __tests__/blueprintCanvasAlcancaRede.test.ts`
   — 16 casos, com os portões medidos no código defeituoso.
2. `bash scripts/check-ui-standard.sh components/blueprint/BlueprintCanvas.tsx`.
3. Suíte cheia e `npm run build`.
4. ⏳ **Falta o que só quem usa vê**: clicar num cano, num ponto e num quadro e
   arrastá-los.
