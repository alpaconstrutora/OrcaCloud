# Onde cada coisa se edita: peça × relatório

## Pedido original

> o qdc esta dentro de um accordion chamado eletrica, porem o ponto eletrico
> esta em outro chamado componentes. deveria tudo ligado a eletrica ficar dentro
> de uma mesmo grupo para nao haver confusao ao usuário.
> talvez podemos deixar componentes apenas para arquitetônico. e so una sugestai.
> dê a sua

## A confusão era real — e a raiz era o contrário do que parecia

Não é o ponto que estava no lugar errado. **O quadro era a única peça do desenho
sem painel de peça selecionada**: clicar no QDC no desenho não mostrava nada, e
as medidas dele só existiam dentro do painel de cargas, porque era o único lugar
em que ele aparecia listado.

Isso foi introduzido por mim algumas horas antes, ao dar medidas às peças: pus os
campos onde o quadro já estava, em vez de dar a ele o painel que faltava.

## ⚠️ Por que NÃO separar por disciplina

A sugestão era deixar Componentes só para o arquitetônico e mover o painel do
ponto para a Elétrica. Discordei, e o motivo é uma regra que vale mais que
"juntar por disciplina":

> **A propriedade de uma peça selecionada tem UM lugar só.**

Dividido por disciplina, para saber onde olhar a pessoa precisa primeiro saber a
disciplina da peça: clicar numa parede mostraria à direita, clicar numa tomada em
outro grupo. Hoje o gesto é único — clico, vejo à direita. E a fronteira só
pioraria: cano de água, viga, esquadria, telhado, cada família nova virando uma
pergunta de "em qual grupo isso mora?".

## A regra que ficou

| | o que é | como se usa |
|---|---|---|
| **Componentes** | as **peças** e as propriedades da selecionada | seleção — clico e edito |
| **Quadro de cargas** | circuitos, disjuntor, seção, potências, pendências | relatório derivado — leio e confiro |

**Peça → Componentes. Somatório e relação → a seção da disciplina.**

## O que mudou

1. **`PainelQuadroSelecionado`** — nome, cota, medidas e giro —, em Componentes,
   ao lado do painel do ponto e do trecho.
2. **O painel de cargas parou de editar geometria e nome.** O quadro virou o
   cabeçalho que agrupa os circuitos, com o "ver" que leva a ele no desenho.
   Dois lugares para o mesmo campo são duas verdades sobre ele.
3. **"Elétrica" virou "Quadro de cargas"** — o nome diz o que a seção é, e
   elimina a expectativa de encontrar peças ali.
4. A frase **"a cota é a altura do centro da caixa"** entrou no painel: sem ela,
   "QDC a 1.600" é lido como onde a caixa começa, e a peça sai meia altura fora
   do lugar sem erro nenhum na tela.

## Verificação

1. `npx vitest run __tests__/components/PainelQuadroSelecionado.test.tsx` —
   6 casos, incluindo o que fixa a regra: a medida do quadro **não** existe mais
   no painel de cargas, e o nome dele continua legível lá como cabeçalho.
2. `bash scripts/check-ui-standard.sh` nos dois `.tsx`.
3. Suíte cheia e `npm run build`.
4. ⏳ **Falta o que só quem usa vê**: clicar no QDC e conferir que o painel abre.
