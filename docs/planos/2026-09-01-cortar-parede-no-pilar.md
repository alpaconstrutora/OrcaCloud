# Planta Inteligente — cortar a parede no pilar, com o concreto fechando o anel

## Pedido original

> acho que voce nao esta entendendo o que estou te pedindo

Sessão: `173a7f9b-72cd-49d6-972f-e29192178ac2` · 2026-09-01

Continuação de [`2026-09-01-sobreposicao-entre-componentes.md`](2026-09-01-sobreposicao-entre-componentes.md),
onde a sobreposição virou desconto **no número** e vão **no desenho 3D** — e o
usuário respondeu que não era isso.

### O que ele quer, perguntado e respondido

1. *"Quando você diz que a parede e o pilar continuam se sobrepondo, o que você
   espera ver acontecer?"* → **"A parede tem de ser cortada de verdade"**: o
   modelo muda, a parede se parte em dois trechos e termina na face do pilar; na
   planta, no 3D e no quantitativo passam a existir duas paredes, e nenhuma
   passa por dentro do concreto.
2. Medido e apresentado o preço — partir a parede abre o anel e **zera o
   ambiente** (sala de 4 × 3 m: 12,00 m² → 0,00 m², 1 ambiente → 0). Perguntado
   como seguir → **"Cortar de verdade, e o pilar fecha o anel"**.

## O problema, medido

O ambiente nasce dos **eixos** das paredes formando anel fechado
(`buildArrangement` → `segmentosDoNivel`, que hoje só enxerga parede e divisa).
Um vão de 20 cm no meio de uma parede deixa dois vértices de grau 1, o anel não
fecha e some tudo que deriva dele: área de piso, rodapé, revestimento.

A estrutura ficou fora do arranjo planar por decisão explícita (kernel 0.9.0),
justamente para que acrescentar um pilar não reescrevesse o acabamento. O que
este plano faz é abrir uma exceção **estreita e nomeada**: a peça não vira
parede, ela empresta uma ponte ao grafo onde substituiu um pedaço de parede.

## Decisões de projeto

| Pergunta | Decisão |
|---|---|
| Como a ponte fecha o anel? | **Estrela pelo CENTRO da peça.** Toda ponta de parede que cai dentro da pegada da peça ganha um segmento até o centro dela. |
| Por que o centro, e não ligar as pontas duas a duas? | Com 2 pontas colineares (pilar no meio da parede) o resultado é idêntico ao eixo original — **área e perímetro não mudam**. Num canto, os dois segmentos reproduzem a quina. Com 3+ pontas, a estrela fecha todos os anéis sem inventar um triângulo espúrio, que o "duas a duas" criaria. |
| A peça vira parede? | **Não.** A ponte entra só no grafo de ambientes. Ela não tem espessura, não gera alvenaria, não aparece em `paredes[]` do quantitativo. |
| Ponta que encosta num pilar sem corte | Ganha ponte também — e é ganho: planta em que alguém desenhou a parede morrendo no pilar passa a fechar sozinha. |
| Abertura no trecho cortado | O comando **RECUSA** o corte quando uma abertura ficaria partida. Sumir com uma porta em silêncio é pior que não cortar. |
| Pilar cobre a parede inteira | A parede é **removida**, com as aberturas dela. |

## ⚠️ Consequência que o usuário precisa saber

**O corte é uma foto de um instante.** Mover o pilar depois NÃO devolve o pedaço
removido da parede: fica um vão sem concreto e — como a ponte é derivada da
geometria atual — o anel abre e o ambiente some. Não é silencioso (o ambiente
desaparece da lista na hora), mas é destrutivo. Mitigação prevista na Fase 4.

## Plano

### Fase 1 — a ponte no arranjo planar ✅ · `utils/blueprintKernel/arrangement.ts`

`pontesEstruturais(model, level)` → segmentos ponta-de-parede → centro da peça,
somados em `segmentosDoNivel`.

**Pronto quando:** (a) a sala de 4 × 3 com a parede partida por um pilar volta a
**1 ambiente com 12,00 m²**; (b) os 722 testes de blueprint que já existiam
continuam passando — nenhuma planta sem pilar pode mudar de ambiente.

### Fase 2 — o comando de corte ✅ · `commands.ts`

`CutWallAtStructural { wallId, structuralId }`: parte em dois, encurta, ou
remove. Aberturas migram para o trecho certo; recusa se alguma ficaria partida.

**Pronto quando:** casos de meio, de ponta, de cobertura total e de recusa por
abertura partida, todos com teste.

### Fase 3 — o aviso passa a oferecer o corte ✅ · `ModalSobreposicao.tsx`

"Descontar da alvenaria" vira **"Cortar a parede"**. O desconto no quantitativo
deixa de ser necessário nesse caminho: a parede cortada já é mais curta, e o
volume sai por construção. "Descontar do concreto" segue como está — pilar não
se corta.

### Fase 4 — o pilar que anda depois do corte

Alerta no painel quando existir vão de parede sem peça dentro dele (a marca do
corte órfão), com ação de refazer a parede.

### Fase 5 — conferência ✅

Passeio no harness 3D e na planta baixa, com print antes/depois, e a sala real
do estudo do usuário.

## Estado

**Fases 1, 2, 3 e 5 concluídas. Fase 4 EM ABERTO.**

- **Fase 1** — `pontesEstruturais` em `segmentosDoNivel`. Só peça de PONTO que
  atravessa o piso empresta ponte (viga passa por cima, fundação por baixo) —
  mesmo recorte de `ocupaPiso`. 7 casos em
  `__tests__/blueprintPonteEstrutural.test.ts`, e a suíte inteira (2139 na
  época) passou sem mexer em nenhuma planta existente: nenhuma delas tem ponta
  de parede dentro de um pilar.
- **Fase 2** — `CutWallAtStructural`, no idioma do `SplitWall` que já existia
  (ids, `ancestry`, reabrigo de abertura). Meio → duas paredes; ponta → encurta
  **preservando o id**; cobertura total → remove. Recusa antes de qualquer
  mutação se uma abertura ficaria partida.
- **Fase 3** — "Descontar da alvenaria" virou **"Cortar a parede"**, e a recusa
  do kernel chega ao usuário numa faixa âmbar. Sem esse recado, escolher cortar
  e nada acontecer pareceria botão quebrado.
- **Fase 5** — harness `?cena=pilar&cede=1`: o cabeçalho vai de **"Paredes: 1"**
  para **"Paredes: 2"** e as duas metades terminam na face do pilar. Prints em
  `saida-pilar-corte-antes.png` / `-depois.png`.

### O teste que resume o pedido

`corte · a sala inteira, do jeito que o usuário desenha` — corta a parede de uma
sala fechada e afirma três coisas ao mesmo tempo: viraram **5 paredes**, o
ambiente **continua existindo**, e a área é **exatamente a mesma** de antes.

### Fase 4 — o que ainda falta

O pilar que ANDA depois do corte deixa um vão de parede sem concreto dentro: a
ponte some junto e o ambiente abre. Não é silencioso (o ambiente desaparece da
lista na hora), mas é destrutivo e ainda não tem alerta nem ação de refazer a
parede.
