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

---

## Quinto relato — o botão morto (01/09/2026)

> botao cortar paredes nao esta funcionando

Estava lá e não tinha o que fazer. `paredesQueAPecaAtravessa` listava **todas** as
paredes que a peça atravessa, inclusive as que já cediam — e as duas do estudo do
usuário já cediam desde a versão anterior. O clique mandava
`SetCedeSobreposicao(cede: true)` para quem já tinha `true`: comando sem efeito,
tela sem mudança, botão sem resposta.

### Fase 8 — o botão só aparece quando tem trabalho ✅

- a lista virou `{ aCortar, jaInterrompidas }`: só entram em `aCortar` as paredes
  que **ainda não** cedem;
- sem nada a cortar, o painel mostra o ESTADO — "esta peça já interrompe a
  parede que atravessa" —, porque a ausência do botão sozinha pareceria falta de
  recurso, não tarefa concluída;
- **o sumiço do botão passou a ser a prova de que o clique funcionou.**

Dois testes travam isso: peça cuja parede já cede não oferece o botão, e depois
de clicar o botão some dando lugar ao estado.

---

## Sexto relato — e a causa raiz, finalmente (01/09/2026)

> nao funciona. quando eu sobreponho o pilar o aviso "Cortar a parede" some e nao
> interrompe nada! por favor avalie mais profundamente. Estamos errando
> excesssivamente

### A causa

O vão do concreto era um `THREE.Path` em `shape.holes`, junto com porta e janela.
**Furo que encosta na borda do retângulo não é furo, é entalhe** — a triangulação
do `ExtrudeGeometry` não sabe representá-lo e o IGNORA. A parede sai inteira,
atravessando o concreto.

E o pilar quase sempre fica na PONTA da parede, que é exatamente onde o furo
toca a borda. Ou seja: **o recurso não funcionava justamente onde ele é usado.**

### Por que cinco verificações não pegaram

| O que eu conferi | Por que não pegou |
|---|---|
| `draft_payload` do estudo | Estava certo — a marca estava lá |
| `perfilDaParedeComVaos` | Estava certo — devolvia o vão em `furosEstruturais` |
| Prints do harness 3D | A cena sintética tinha o pilar **no meio** da parede, onde o furo é interno e funciona |
| Chunk publicado | Provava que o código subiu, não que ele funciona |

Nenhuma delas olhava a MALHA. E `ExtrudeGeometry` é JavaScript puro: roda em
node, sem WebGL. Não havia desculpa para não ter medido antes.

### Fase 9 — a parede vira os TRECHOS QUE SOBRAM ✅

`geometriaDaParede` deixou de ser "retângulo com furos" e passou a montar um
`Shape` por trecho sobrevivente. Resolve os três casos com a mesma conta: pilar
no meio → dois trechos; na ponta → um trecho mais curto; cobrindo tudo → nenhum.
A abertura continua sendo furo, porque porta e janela são interiores por
natureza.

**`__tests__/blueprint3dCorte.test.ts` mede a malha**, e o caso decisivo compara
os dois jeitos lado a lado: com o furo na borda, `boundingBox.max.x` fica em
**3,52 m** — a parede atravessa o pilar; com o retângulo encurtado, fica em
**3,445 m**, na face do concreto.

---

## Sétimo passo — olhar a planta REAL (01/09/2026)

O usuário deu uma senha para eu entrar no app. Ela não valeu para
`agente-leitura@` nem para `altair.rosa@` — **não entrei**. Mas dava para ver o
desenho sem credencial: baixei o `draft_payload` do estudo e o renderizei no
harness (`modelFromCanonicalPayload`, com a cena recortada a 3 m da peça, senão
o pilar de 15 cm some numa planta de 25 m).

### O que a planta real mostrou — um defeito que EU tinha acabado de introduzir

A **laje do piso** (12 cm de espessura, cota 0) encosta na base de uma parede ao
longo de **2,69 m**. A versão "trechos que sobram" removia o trecho em TODA A
ALTURA, porque usava só `x0/x1` e jogava a informação de altura fora. Ou seja: a
laje ia apagar 2,69 m de parede inteira — um estrago maior do que o problema
original, e ele teria chegado ao usuário no próximo deploy.

### Fase 10 — duas travas ✅

1. **Só peça de PONTO que atravessa o piso interrompe alvenaria** — o mesmo
   recorte de `pontesEstruturais` e `ocupaPiso`, agora aplicado também em
   `perfilDaParedeComVaos`. Laje passa por baixo, viga passa por cima; quem
   interrompe é o pilar. Fisicamente óbvio, e estava faltando.
2. **Só o que atravessa de cima a baixo vira trecho removido.** Pilar mais baixo
   que a parede deixa alvenaria em cima dele e volta a ser FURO, como porta e
   janela.

Três casos novos em `blueprint3dCorte.test.ts`: laje não abre vão, viga não abre
vão, pilar baixo vira furo e não corte.
