# Giro da peça e bitola do trecho em planta

## Pedido original

> implentar rotacao e bitola do trecho em planta

São as duas lacunas que eu havia **declarado** ao entregar as medidas, algumas
horas antes, em `2026-09-09-medidas-de-quadro-e-terminal.md`:

> - **Rotação**: o quadro não tem ângulo. Numa parede inclinada ele aparece
>   alinhado aos eixos.
> - **A bitola do trecho em planta**: um eletroduto de 25 mm desenhado em escala
>   é mais fino que um fio de cabelo na tela.

## A bitola

O trecho passou a ser desenhado com `lineWidth = bitolaMm × escala`, com **piso
de traço** (2,5 px selecionado, 1,5 px normal). Acima do piso o que se vê é a
largura real do tubo — que é o que faz um coletor de 100 mm parecer um coletor e
não mais um eletroduto. Abaixo dele é espessura de traço, não medida: a mesma
declaração do raio mínimo do cilindro no 3D.

A **prumada** vira um círculo de raio igual a meia bitola — a seção do tubo vista
de cima, que é o que ela é.

## O giro

`rotacaoGraus` em `Quadro` e `Terminal`, valendo em **planta**, **3D**, **IFC** e
**área de clique**.

### ⚠️ Grau inteiro, normalizado para 0–359

O kernel inteiro é de inteiros — milímetro cheio — porque o payload precisa ser
reproduzível byte a byte, e ponto flutuante em campo hasheado é a porta de
entrada para dois desenhos idênticos com hashes diferentes. Meio grau numa caixa
de 40 cm move o canto dela 1,7 mm; não é o que decide se o quadro cabe.

E a normalização não é zelo: `0` e `360` descrevem o mesmo desenho, `-90` e `270`
também. Guardados como vieram, dariam hashes diferentes — e um campo de ângulo é
justamente onde alguém digita `-90`.

### ⚠️ O sinal no 3D é invertido, e é onde um erro passaria calado

No viewer, o Y da planta vira o **Z** do mundo, e girar em torno de Y leva
`(1,0,0)` para `(cos a, 0, −sen a)`. Para o lado da largura apontar para onde a
planta o manda — `(cos θ, sen θ)` —, é preciso `a = −θ`.

`Blueprint3DViewer` está sob `@ts-nocheck` e uma peça virada para o lado errado é
plausível demais para alguém notar, ainda mais numa caixa quase quadrada. Por
isso `rotacaoY3D` vive no módulo puro, e o teste afirma o eixo do 3D **contra a
mesma direção que a planta usa**: se as duas divergirem, o teste quebra.

### ⚠️ Os cantos são calculados no MODELO, não em pixels

Cada canto passa pelo mesmo `paraTela` do resto da planta. Girar em pixels
concordaria com a parede ao lado por acaso, e deixaria de concordar no dia em que
a convenção do Y mudasse — que já mudou uma vez aqui.

### O ponto redondo × retangular

Círculo é o símbolo de ponto e continua sendo o padrão. Mas quem declara largura
e profundidade **diferentes** declarou uma peça retangular: desenhá-la redonda
esconderia a medida que a pessoa acabou de informar, e esconderia o giro junto —
um círculo girado é o mesmo círculo. Então o ponto vira retângulo girado quando
as duas medidas divergem, e o painel avisa que o giro não aparece em planta
enquanto ele for redondo.

### O IFC não ganha direção quando o giro é zero

Emitir `IFCDIRECTION((1.,0.,0.))` seria correto pela norma e mudaria o arquivo de
**todo desenho já publicado**, porque todos têm giro zero. `$` é o padrão, e é o
que este arquivo sempre emitiu. As componentes são arredondadas a 9 casas antes
de formatar: sem isso, um quadro a 90° sairia com `0.000000` — um número que diz
"quase zero" onde a norma permite dizer zero.

## Verificação

1. `npx vitest run __tests__/blueprintRedeRotacao.test.ts` — 15 casos, com os
   portões **medidos no código defeituoso**: sinal do giro invertido e acerto
   ignorando a rotação, os dois pegos.
2. Goldens passando em `0.20.0` **antes** do bump; depois `0.21.0` e recaptura.
3. `bash scripts/check-ui-standard.sh` nos `.tsx`.
4. Suíte cheia e `npm run build`.
5. ⏳ **Falta o que só quem usa vê**: girar um quadro a 45° e conferir planta e 3D.
