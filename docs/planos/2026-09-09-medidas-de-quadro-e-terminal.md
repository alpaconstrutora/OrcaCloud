# Quadro e ponto passam a ter medidas de verdade

## Pedido original

> Testes com o sistema eletrico.
> 1. o quadro de distribuicao aparece com dimensoes muito reduzidas. Implemente
> opcao de definir dimensoes e dimensionar a caixa tanto em planta como em 3d
> nestas dimensoes. o mesmo serve para os demais componentes

## O que estava acontecendo

O quadro era desenhado como um quadrado de **9 pixels** e o ponto como um círculo
de **4** — tamanho fixo na tela, escolhido quando eles eram símbolo de prancha.
Num zoom de trabalho, onde uma parede de 150 mm tem uma dezena de pixels, o
símbolo fica **menor que a espessura da parede ao lado**: parece respingo de
tinta, não peça.

E o quadro **não era desenhado no 3D** — nem como marca de lugar. Quem desenhava
um e abria a vista via a instalação inteira menos a peça de onde ela sai, sem
nada na tela dizendo que faltava algo.

## O que foi feito

`Quadro` e `Terminal` ganharam `larguraMm`, `alturaMm` e `profundidadeMm`, todas
opcionais. Elas valem em quatro lugares: **planta** (pegada largura × profundidade),
**3D** (caixa nas três), **IFC** (o sólido emitido) e **área de clique**.

Campos nos painéis, com um botão de voltar ao padrão.

## As decisões

### ⚠️ O padrão é o que o IFC já emitia, e isso não é acaso

400 × 300 × 200 no quadro, 100 mm cúbicos no terminal — exatamente os números que
estavam embutidos no `emitirQuadro`/`emitirTerminal`. Um padrão "melhor" teria
mudado o arquivo de **todo desenho já publicado** sem que ninguém pedisse.

### ⚠️ Os três campos somem do canônico quando não declarados

É o jeito clássico de um campo novo quebrar tudo: entrar no payload de quem nunca
o declarou. O hash mudaria e o acervo inteiro apareceria como alterado. Provado
antes do bump: com a versão ainda em `0.19.0` e as medidas já inteiras no lugar,
as goldens passaram e as contagens de ambientes seguiram idênticas.

### ⚠️ A COTA é o CENTRO da peça, não a base — e isso quase virou um bug

Escrevi `caixaDaPeca` tratando a cota como base ("QDC a 1.600" costuma dizer onde
a caixa *começa*). O `emitirQuadro` já tratava como **centro** — nasce em
`cota − altura/2` e extruda a altura inteira —, e o `pontoDoTerminal3D` também.
Duas convenções para a mesma peça fariam o 3D e o arquivo entregue discordarem em
meia altura, que é plausível demais para alguém notar olhando.

Venceu a que já estava publicada. A hora de rever isso é com quem especifica
quadro, não no meio de uma correção de desenho.

### ⚠️ A área de clique acompanha a pegada

O defeito que esta correção quase criou. Com a caixa em escala e o acerto ainda
por um raio fixo de poucos pixels, clicar na **borda** de um quadro de 600 mm não
faria nada — "não consigo selecionar", de volta pela outra ponta, um dia depois de
fechá-lo.

### O que ficou de fora, declarado

- **Rotação**: o quadro não tem ângulo. Numa parede inclinada ele aparece
  alinhado aos eixos. Inventar um ângulo que ninguém informou seria pior.
- **A bitola do trecho em planta**: um eletroduto de 25 mm desenhado em escala é
  mais fino que um fio de cabelo na tela. Ele já usa a bitola real no 3D e no
  quantitativo; em planta continua traço de convenção.
- **Piso de 5 px** no desenho em planta: é espessura de traço, não medida — a
  mesma declaração do raio mínimo do cilindro no 3D. Sem ele, afastar o zoom faria
  a peça sumir, e "sumiu" é pior que "está pequeno".

## Verificação

1. `npx vitest run __tests__/blueprintRedeMedidas.test.ts` — 17 casos.
2. Goldens passando em `0.19.0` **antes** do bump; depois `0.20.0` e recaptura.
3. `bash scripts/check-ui-standard.sh` nos três `.tsx`.
4. Suíte cheia e `npm run build`.
5. ⏳ **Falta o que só quem usa vê**: definir 600 × 400 num quadro e conferir que a
   caixa cresce em planta e no 3D.
