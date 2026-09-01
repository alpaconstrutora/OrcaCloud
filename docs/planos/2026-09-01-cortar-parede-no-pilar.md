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

**Fases 1, 2, 3, 5 e 6 concluídas. Fase 4 EM ABERTO.**

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

## Terceiro relato — e o furo que ele revelou (01/09/2026)

> continue sobrepondo.. veja a nitida sobreposicao da parede e do pilar. voce
> esta entendendo isso? ja estamos nisso muitas vezes

Lido o `draft_payload` do estudo (branch `99d7a8be`) em vez de deduzir:

| Fato medido | Leitura |
|---|---|
| **33 paredes**, o mesmo número de sempre | Nenhum corte aconteceu |
| Pilar 15 × 40 em (26947, −37954) atravessa as paredes **#18 e #31** | A detecção funciona |
| As duas paredes com `cedeSobreposicao: true` | Ele usou a versão anterior, a do desconto |

**A causa: o corte só era oferecido no aviso da CRIAÇÃO.** As peças do usuário já
existiam. Não havia ação nenhuma na tela que cortasse uma peça já desenhada — ele
podia clicar o dia inteiro sem nada acontecer. Foi omissão minha, e é o que
explica o relato ter voltado três vezes.

### Fase 6 — o corte para peça JÁ EXISTENTE ✅

Botão **"Cortar a parede"** no painel da peça selecionada, com o número de
paredes atravessadas. Corta todas num lote (um Ctrl+Z desfaz), com a mesma
recusa por abertura partida.

⚠️ Só aparece em peça de **PONTO que cruza o piso** — é ela que empresta a ponte
ao arranjo planar. Oferecer o botão numa viga seria oferecer a destruição do
cômodo com outro nome: a parede abriria sem nada para fechar o anel.

**Teste com a geometria REAL do usuário** (`corte · o canto do estudo real`):
antes, 2 disputas; depois do corte, **0**. As três rodadas anteriores foram
verificadas só em geometria sintética, e ela não reproduzia o que ele via.

### Fase 4 — o que ainda falta

O pilar que ANDA depois do corte deixa um vão de parede sem concreto dentro: a
ponte some junto e o ambiente abre. Não é silencioso (o ambiente desaparece da
lista na hora), mas é destrutivo e ainda não tem alerta nem ação de refazer a
parede.


---

## Quarto relato — o corte destrutivo se prova errado (01/09/2026)

> veja essa imagem (...) ela mostra que o recorte acontece no momento que o pilar
> é inserido na planta, mas muitas das vezes o pilar precisa de um reajuste de
> posicao com ajuda no snap etc, e o recorte acaba fincando no local errado.
> e como o recorte e destrutivo fica um vão onde nao deveria e e ainda com
> sobreposicao  analise

### A análise, com os números do estudo

| Parede | Antes | Agora | O que houve |
|---|---|---|---|
| **#18** | ia até x = 26945 | termina em **26770** | Cortada mais de uma vez; a face do pilar está em 26870, então sobrou **100 mm de vão sem nada** |
| **#31** | — | termina em (26945, −37955) | É o **centro exato do pilar**: o snap levou a ponta até lá DEPOIS do corte, e ela voltou a atravessar o concreto |

As duas falhas são o mesmo defeito de projeto: **"esta parede é interrompida por
este pilar" é uma relação viva, e o corte a gravava como coordenada morta.** O
pilar anda — com o snap, que é feature nossa — e a coordenada passa a falar de um
lugar onde ele não está mais: sobra buraco onde ele saiu e sobra sobreposição
onde ele chegou.

### Decisão do usuário

Apresentados os três caminhos → **"Corte DERIVADO, recalculado sempre"**.

### Fase 7 — o corte deixa de ser destrutivo ✅

- O aviso da criação e o botão do painel passam a gravar `cedeSobreposicao` em
  vez de rodar `CutWallAtStructural`. A interrupção é recalculada a cada leitura,
  então **mover o pilar leva o vão junto** e o defeito acima fica impossível.
- `CutWallAtStructural` continua no kernel, sem chamador na UI: é o que os
  estudos já cortados carregam no histórico.
- **`pontasEncurtadasPorEstrutura`** acha o estrago que a versão destrutiva
  deixou — ponta de parede que parou antes da peça — e o painel oferece
  **"Emendar até a peça"**. A ponta volta para a projeção do centro sobre o eixo,
  que é exatamente de onde o corte a tirou (e o único ponto que cai dentro da
  pegada, fazendo a ponte fechar o anel).

**Testado com os números reais do estudo:** ponta em 26770 → detecta `faltaMm:
175` e emenda para (26945, −38080); antes da emenda o sistema não via disputa
nenhuma (estado enganoso: parece resolvido e é só um buraco), depois volta a ver.

### O que ficou de fora

- **Planta baixa** não subtrai o corpo da parede sob o concreto. Na prática o
  desenho já sai certo — a peça é desenhada POR CIMA da alvenaria —, e só
  apareceria diferença com pilar mais fino que a parede.
- A **Fase 4** (alerta de corte órfão) foi substituída por algo melhor: com o
  corte derivado, o órfão não nasce mais. O que restou é a emenda para os
  desenhos que já têm o estrago.
