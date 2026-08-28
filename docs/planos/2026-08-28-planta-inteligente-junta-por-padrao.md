# Planta Inteligente — manter a junção por padrão ao mover parede

## Pedido original

Sessão de 2026-08-28, primeira mensagem, transcrita literalmente:

> incorporacao < planta inteligente: Atualmente ao mover uma parede que está
> conectada, o padrão é desconectar e um aviso para conectar ponta solta.
> Desfazendo uma conexão que já existia. Por padrão é melhor manter conectado e
> usar stretch. qual sua avaliacao a respeito?

### Decisões tomadas na mesma sessão

Perguntado sobre a semântica e o escopo, o usuário escolheu:

1. **Junta rígida** — a vizinha mantém a própria direção; nunca é entortada para
   acompanhar. (Alternativas recusadas: manter a translação crua de hoje;
   apenas inverter o padrão sem mudar a conta.)
2. **Corpo + alça da ponta** — os dois gestos passam a preservar a junção.
   (Alternativa recusada: só o arraste do corpo.)

---

## Contexto — por que mudar

`modoMover` nascia em `'MOVER'`: o bloco andava rígido e o que encostava nele
desencostava. O usuário só descobria pelo aviso âmbar "N ponta(s) solta(s)" no
painel lateral, e tinha de acionar "Conectar automaticamente" para desfazer o
estrago.

A inversão é conceitual: **a conexão é intenção, o comprimento da vizinha é
consequência.** O padrão antigo descartava a intenção para preservar a
consequência. E o custo do erro é assimétrico — quando o anel abre,
`recomputeSpaces` perde o ambiente e junto vão área, perímetro, rótulo e o
de-para do orçamento pendurado nele, sem erro nenhum na tela.

Mas inverter a chave sozinha não resolvia: o `ESTICAR` de então tinha três
buracos que virariam a nova falha padrão.

1. **T continuava desencostando** — a vizinhança era casada por coordenada exata
   (`pointKey`), e ponta que morre no meio do corpo da outra não é vértice de
   ninguém.
2. **Enviesava vizinha ortogonal** — a vizinha era transladada pelo mesmo delta;
   bastava deslizar uma parede ao longo de si mesma para as perpendiculares
   virarem diagonal. Pior que desencostar: o anel continua fechado, nenhum
   diagnóstico dispara, e a área sai calculada num cômodo torto.
3. **Vizinha que colapsa abortava o gesto** — comprimento zero →
   `DEGENERATE_WALL` → nada acontecia.

---

## A regra, como ficou

São **duas** regras, porque são dois gestos com significados diferentes.

### Arrastar o CORPO — a junta é RECONSTRUÍDA

Cada ponta presa de vizinha não selecionada anda pela **componente de `delta`
paralela ao eixo da própria vizinha** (`componenteNoEixo`). Projetada no próprio
eixo, a vizinha só pode mudar de **comprimento**, nunca de direção.

| Gesto | Vizinhas perpendiculares | Junta |
|---|---|---|
| Parede arrastada **perpendicular** a si (o caso comum) | mudam de comprimento, seguem a 90° | preservada |
| Parede arrastada **paralela** a si | não se mexem | canto em L solta (geometricamente forçado) — sinalizado; T sobre corpo longo sobrevive |
| Arraste **diagonal** | seguem só na componente delas | preservada onde alcança, sinalizada onde não |

Exceção: vizinha presa pelas **duas** pontas (ponte entre dois selecionados)
translada pelo `delta` cheio — está sendo carregada entre dois hospedeiros que
andam juntos.

### Arrastar a ALÇA — a junta ANDA JUNTO

O vértice **é** a junta, então ela segue o vértice: toda ponta que estava nele
vai para o lugar novo (a vizinha pode girar, e é o certo — ela tem de alcançar a
junta), e toda ponta que repousava no **corpo** da parede movida desliza pelo
próprio eixo até o corpo novo (`cantoEntreEixos`), sem sair do prumo.

### Detecção e tolerância

"Presa" cobre vértice compartilhado **e** encosto em T, pela mesma conta
(`projecaoNoSegmento`, extraída de `encostosSemJuncao`). A régua é
`DEFAULT_TOLERANCE_MM` (5 mm) — a do **arranjo planar**, que é a autoridade sobre
quem está ligado a quem. Meia espessura é a régua das ferramentas de *reparo*,
generosas de propósito; um gesto de arraste não pediu conserto.

### Nunca abortar

Ponta que colapsaria a vizinha fica onde está e entra em `soltas`. O gesto
inteiro nunca mais é derrubado por causa de uma vizinha.

---

## O que mudou, arquivo a arquivo

| Arquivo | Mudança | Pronto quando |
|---|---|---|
| `utils/blueprintKernel/geom.ts` | `projecaoNoSegmento` e `componenteNoEixo` novos | ✅ `encostosSemJuncao` passou a usar a primeira; 217/217 sem alterar expectativa |
| `utils/blueprintKernel/arrangement.ts` | `encostosSemJuncao` usa `projecaoNoSegmento` | ✅ conta não duplicada |
| `utils/blueprintKernel/model.ts` | `pontasDeslocadas` com a regra nova e retorno `{destinos, soltas}`; `pontasNoVerticeMovido` nova | ✅ testes abaixo |
| `utils/blueprintKernel/commands.ts` | `TranslateEntities.arrastarVizinhas` → `manterJuncoes`; `MoveVertex.manterJuncoes?` (padrão `false`) | ✅ chamadores crus inalterados, provado por hash |
| `utils/blueprintKernel/index.ts` | exporta o que a UI usa | ✅ nada importa módulo interno |
| `components/blueprint/BlueprintEditor.tsx` | `modoJuncao: 'MANTER'\|'SOLTAR'`, padrão `MANTER`, persistido; botão; `moverSelecao`/`moverPonta`; `esticarParede` passa a usar o kernel | ✅ 80/80 nos componentes |
| `components/blueprint/BlueprintCanvas.tsx` | prop `manterJuncoes`; anel âmbar tracejado nas juntas que vão soltar, durante o arraste | ✅ harness |
| `components/blueprint/PainelSelecaoMultipla.tsx` | vocabulário novo | ✅ 194/194 |

### Fora de escopo, de propósito

- **Selecionados andam sempre rígidos.** Ponta de parede *selecionada* que
  repousava no corpo de uma *não selecionada* solta ao sair de cima dela.
  Adaptar o selecionado quebraria a garantia de que o comprimento é preservado e
  as aberturas não saem de posição.
- `conectarAgora`, `encostosSemJuncao`, `cantosEncostados`, ferramenta Juntar e a
  lista de vãos ficaram como estavam. Continuam cobrindo o que sobra — só que
  agora sobra bem menos.

### ⚠️ Mudança de comportamento que vale conferir em planta real

Uma **divisa colinear** com a parede movida, num deslocamento perpendicular aos
dois, **não acompanha mais** — antes ela acompanhava e virava diagonal. Uma
divisa é linha de escritura: entortá-la em silêncio é pior que soltá-la, porque o
anel continua fechado e nenhum diagnóstico dispara. Agora a ponta fica e o
desencosto é reportado. O teste
`a divisa entra na MESMA conta das paredes — e uma divisa COLINEAR não é entortada`
trava esse comportamento; o irmão dele prova que a divisa **perpendicular**
continua acompanhando.

---

## Verificação

Estado em 2026-08-28, tudo executado:

- ✅ `npx vitest run` — 1686 passaram, 24 puladas, 88 arquivos. Inclui
  `blueprintKernelGoldens`, que prova que nenhuma planta existente mudou de hash
  sem intenção.
- ✅ `npx tsc --noEmit` — limpo.
- ✅ `bash scripts/check-ui-standard.sh` nos três `.tsx` — sem violação (REGRA #1).
- ✅ `docs/spikes/mover-selecao/medir.mjs` — **6 medições em Chrome de verdade**:
  `laço discrimina · soltar é rígido · manter puxa a vizinha · medição anda
  junto · T acompanha sem torcer · anel avisa no arraste · anel discrimina`.
  As duas últimas leem **pixel do canvas com o botão do mouse ainda apertado** —
  prévia que só se pode conferir depois de soltar não serve de aviso. E o anel
  aparece no canto que solta e **não** no que sobrevive.
- ✅ `docs/spikes/arrastar-ponta/medir.mjs` — 5 medições: `arrastou · trava
  funciona · trava discrimina · sem o modo, solta · com o modo, mantém`.
- ✅ `__tests__/components/BlueprintEditor.test.tsx` — o botão da barra nasce em
  "Manter junções" com `aria-pressed=true`, e a chave alterna para "Soltar".

### No app de verdade (Incorporação › Planta Inteligente)

Roteiro Playwright com Chrome do sistema, login real da conta de leitura, numa
planta de rascunho criada para o teste e **apagada no fim** — o editor faz
autosave 1500 ms depois de cada gesto, então arrastar parede numa planta do
usuário GRAVA. Sala 5 paredes com divisória em **T** no meio, dois ambientes:

- ✅ a chave **nasce em "Manter junções"** (`aria-pressed=true`)
- ✅ o T fecha dois ambientes: 40,15 m² e 42,70 m²
- ✅ **arrastar a parede de cima perpendicular a si**: os dois ambientes
      SOBREVIVEM, sem aviso de ponta solta, e as áreas mudam coerentemente
      (40,15 → 46,75 · 42,70 → 49,73)
- ✅ **Ctrl+Z** devolve exatamente o estado anterior, num passo
- ✅ **encurtar pelo painel** (11,65 m → 11,25 m) numa parede que hospeda o T:
      continua com 2 ambientes, sem ponta solta — o caminho `esticarParede`
- ✅ a escolha **SOLTAR sobrevive ao recarregar** (`localStorage` = `"SOLTAR"`;
      reaberto o editor, o botão volta como Soltar). Padrão devolvido a MANTER.
- ✅ nenhum erro de JS, console ou 4xx/5xx do PostgREST fora do ruído conhecido
      da Central de Controle (`57014 statement timeout`)

Ainda não exercitado: planta **importada de PDF**, com dezenas de paredes e
junções já reparadas pelo passe automático. O comportamento é o mesmo por
construção, mas a escala não foi medida.

---

## Adendo — escolher qual ponta anda (28/08/2026, mesma sessão)

### Pedido original

> quando eu seleciono uma parede e altero o seu comprimento no painel direto
> digitando o valor que eu desejo, como eu escolho qual extremidade da parede
> deve ser aplicada a nova medida?

Não dava. A ponta era decidida pela regra automática de `esticamento`
(12/08/2026): anda a LIVRE quando só uma está livre; senão anda a FINAL (`b`).
Numa parede com os dois cantos fechados isso sempre puxava a final — e "final"
é a ordem em que a parede foi desenhada, informação que **não aparece na tela
depois**. O painel anunciava a escolha, mas não deixava mudá-la.

### O que foi feito

- `esticamento` passa a ser **padrão, não sentença**: `ancoraManual` (guardado
  como `{ wallId, end }`, para a escolha morrer sozinha ao trocar de parede, sem
  `useEffect` de limpeza) sobrepõe a regra.
- Painel: dois botões **Início / Fim** ao lado do campo Comprimento, o em vigor
  marcado com `aria-pressed`. `title` de cada um diz a consequência daquela
  ponta — "ponta livre, nada mais se mexe" ou "ponta presa, o canto vai junto".
- **Passar o mouse acende a ponta no desenho** (`destaqueDePonta` no canvas,
  disco na cor de seleção com contorno branco). Sem isso os botões seriam duas
  palavras sem referente — é justamente a informação invisível que motivou o
  pedido. Desenhado a partir do modelo já deslocado, para não apontar o vazio
  durante um arraste.

### Verificação

- ✅ `npx vitest run` — 1691 passaram, 24 puladas; 5 casos novos em
  `PainelParedeSelecionada.test.tsx` (botões, `aria-pressed`, callback, hover,
  `title` por ponta, ausência sem parede selecionada)
- ✅ `tsc --noEmit` limpo; `check-ui-standard.sh` sem violação
- ✅ **No app, medindo pixel do canvas** numa planta de rascunho descartada:
  retângulo com os dois cantos da parede presos, padrão vem "Fim"; encurtar 1 m
  com **Fim** move um lado e deixa o outro parado, com **Início** move o lado
  OPOSTO — a prova de que o controle não é enfeite
- ✅ o disco de destaque cai em pontas DIFERENTES: "Início" em x=1069, "Fim" em
  x=488, numa parede que vai de x=483 a x=1074

⚠️ Nesse retângulo "Início" ficou à DIREITA: as paredes que o Retângulo gera
correm no sentido do anel, então `a` não é o extremo esquerdo. Os rótulos são
fiéis ao modelo; quem resolve a ambiguidade é o destaque no desenho.

---

## Adendo 2 — nomear o beco da junta paralela (28/08/2026)

### Pedido

Perguntado qual seria a escolha **tecnicamente correta** para a divisa colinear,
a resposta foi **A** (não move, reporta): a restrição é *inviável*, não ambígua —
a vizinha tem 1 grau de liberdade (deslizar no próprio eixo) e o deslocamento é
perpendicular a ele. Diante de restrição inviável, o correto é reportar, não
escolher uma aproximação em silêncio. O usuário pediu então a melhoria do aviso.

### Correção de uma afirmação minha

Eu disse que, com A, "o anel do lote abre". **Está errado para divisa `TERRENO`.**
`segmentosDoNivel` exclui `kind === 'TERRENO'` do arranjo, então uma divisa de
terreno desencostada de uma parede não afeta ambiente, área nem o anel do lote —
ele é formado por divisas entre si. Nesse caso A não tem contrapartida nenhuma:
é estritamente melhor, e o comportamento antigo *corrompia* o anel do lote ao
arrastar o canto dele junto com uma parede do prédio.

O beco existe, sim, mas noutro caso: **parede colinear com parede**, ou divisa de
`kind` comum — aí a ponta solta de verdade.

### O beco, e por que merecia diagnóstico próprio

Duas pontas soltas PARALELAS e deslocadas de lado. Nenhuma ferramenta alcança:
`cantoEntreEixos` recusa pelo `SENO_MINIMO_CANTO`, e com ela a ferramenta Juntar
e o botão "Conectar automaticamente"; `encostosSemJuncao` exige a ponta dentro de
meia espessura; `cantosEncostados` exige sobreposição; a lista de vãos exige
mesma linha. O usuário clicava no botão e **nada acontecia, sem explicação**.

### O que foi feito

- `juntasParalelasSemCanto` em `arrangement.ts`, ao lado dos outros diagnósticos
  de topologia. `SENO_MINIMO_CANTO` passou a ser exportado de `geom.ts` para a
  régua de paralelismo ser **a mesma** que faz `cantoEntreEixos` recusar —
  reimplementada, o aviso apareceria onde Juntar resolve, ou calaria onde ela
  recusa.
- O afastamento é **decomposto no eixo da parede solta**: uma junta desfeita por
  deslocamento perpendicular deixa as duas pontas FRENTE A FRENTE. Sem isso o
  aviso nascia largo — em duas paredes colineares acusava TRÊS pontas, incluindo
  as extremidades opostas, que nunca foram junta. Aviso que aponta o que não é
  problema ensina a ignorar o aviso.
- Painel: linha própria dentro da caixa âmbar, dizendo que aquelas ferramentas
  não refazem esse encontro **e o que fazer** — selecionar os dois segmentos e
  mover juntos. Quando há divisa envolvida, explica também por que ela não
  acompanha sozinha.

### Verificação

- ✅ 1698 testes; 7 novos em `juntasParalelasSemCanto`, incluindo o que trava o
  ruído (4 pontas soltas → 2 achados, ambos em x=4000) e os que provam que
  `encostosSemJuncao` e `cantosEncostados` devolvem vazio ali — a prova de que o
  aviso é necessário
- ✅ `tsc` limpo; `check-ui-standard.sh` sem violação
- ✅ No app, planta de rascunho descartada: duas paredes colineares, mover uma
  perpendicular → o painel mostra "2 pontas encostavam em algo PARALELO", explica
  por que o botão não resolve, e diz "selecione as duas". Não fala em divisa
  quando não há divisa.

---

## Adendo 3 — medida interna e de eixo trocadas em alguns lados (28/08/2026)

### Pedido, com print

> veja print que as medidas internas e externas estão trocadas em um dos lados

### O defeito

Não era a cadeia de cotas (botão **Cotas**) e sim o botão **Medidas**. Cada parede
recebe dois números: o de EIXO e o de face interna (`int. …`). O lado de cada um
saía de `rotuloDoTraco`, que normaliza a normal pela orientação da **TELA** — para
o rótulo não depender do sentido em que a parede foi desenhada. A cota interna ia
sempre no lado OPOSTO ao da de eixo.

Isso não é o interior do cômodo, e o código já registrava a limitação como aceita,
usando o prefixo "int." como remendo. Medido num retângulo, erra em **duas das
quatro paredes**:

| parede | rótulo `int.` caía |
|---|---|
| baixo | FORA do cômodo ❌ |
| direita | dentro ✅ |
| cima | dentro ✅ |
| esquerda | FORA do cômodo ❌ |

Na tela, uma parede mostrava o número interno por dentro e a vizinha por fora —
lido junto, parece que as duas medidas foram trocadas. Era exatamente o print.

### A correção

`normalParaODentro(spaces, wall)` em `utils/blueprintCotas.ts`: devolve a normal
unitária apontando para o ambiente derivado, ou `null` quando a pergunta não tem
resposta única. A régua passa a ser o **ambiente do arranjo planar**, não a
orientação da tela.

`null` é deliberado para parede entre dois cômodos (os dois lados são "dentro") e
para parede que não fecha ambiente: ali o lado volta a ser o de antes, porque
inventar um interior seria trocar erro visível por arbítrio silencioso — e é por
isso que o prefixo "int." **permanece**, agora como reforço e não como remendo.

No canvas, `normalDoTraco` foi extraída de `rotuloDoTraco` para que quem decide o
lado use exatamente a mesma normal — recalculada à parte, as duas divergiriam.

### Verificação

- ✅ 1698 testes + 6 novos em `blueprintCotasPorLado.test.ts`: a normal aponta
  para dentro nas quatro paredes, é unitária e perpendicular ao eixo, devolve
  `null` em divisória entre dois ambientes e em parede solta, e **não depende do
  sentido em que a parede foi desenhada** (o retângulo desenhado no sentido
  inverso dá o mesmo resultado — era daí que o defeito vinha)
- ✅ `tsc` limpo; `check-ui-standard.sh` sem violação
- ✅ Print no app, retângulo com **Medidas** ligado: os quatro lados com o número
  interno para dentro e o de eixo para fora

### Adendo 3.1 — o texto de Medidas acompanha a parede

> girar o texto acompanhando a parede

Em parede VERTICAL os dois números saíam deitados lado a lado e se atropelavam —
no print, a cota de eixo aparecia cortada, colada na interna ("6,8 int. 6,70 m"
numa fileira). `rotuloDoTraco` passa a girar o texto pelo ângulo do traço,
normalizado para nunca sair de cabeça para baixo. É a convenção de prancha, e o
que a cadeia de Cotas já fazia.

⚠️ **A rotação é em torno do ponto JÁ deslocado, e o rótulo sai em `(0,0)`.**
Deslocar depois de girar amarraria o lado ao ângulo: nas paredes em que a
normalização soma π o "para cima" local inverte, e o rótulo pularia para o outro
lado — desfazendo em silêncio a correção do adendo 3.

Conferido por print: verticais lendo na vertical, horizontais na horizontal, e o
interno para dentro nos quatro lados.

### Adendo 3.2 — o mesmo defeito na cadeia de Cotas

Achado ao investigar o 3.1, e confirmado com o usuário antes de mexer.

Na cadeia de Cotas o rótulo saía como `(0, -7)` **depois** de `ctx.rotate(ang)`.
"Para cima" no referencial girado inverte justamente nos lados em que a
normalização do ângulo soma π — então em três lados o rótulo ficava 7 px para
dentro da própria linha de cota e no quarto ficava 7 px para fora.

Mesma correção do 3.1: o afastamento é calculado ANTES de girar, e o rótulo sai
em `(0,0)`. A direção "para fora" vem de dois pontos da mesma conta de
`pontoDaCota` (um metro afastados), para acompanhar o espelhamento do Y do canvas
sem repetir a regra no renderizador.

Medido num retângulo pela mesma técnica que achou o defeito: antes, o lado
`(6000,4000)→(0,4000)` divergia dos outros três; agora os doze rótulos (4 lados ×
3 níveis) caem todos para dentro da própria linha. Conferido também por print,
com as cadeias de cima e de baixo espelhadas.

---

## Adendo 4 — a correção do adendo 3 não alcançava a DIVISÓRIA (28/08/2026)

### Pedido, com print

> a correcao das cotas ainda nao aconteceu. veja print. tenho duas paredes com
> dimensoes iguais, porem com medidas internas diferentes, uma com 2,20 e outra
> com 2,35

### O que eu errei

Os NÚMEROS estavam certos — as duas paredes têm o mesmo eixo (2,35) e a mesma
face interna (2,20). O que variava era **qual dos dois ficava visível de dentro
do cômodo**.

No adendo 3 eu fiz `normalParaODentro` devolver `null` para parede entre dois
ambientes, com a justificativa de que "ali não existe *o* interior". Raciocinei
sobre um retângulo isolado. **Numa planta real a maioria das paredes é
divisória** — então a correção não alcançava justamente o caso comum, e o lado
voltava a ser o da orientação da tela:

| parede da cozinha | o que se lia de dentro |
|---|---|
| topo (perímetro) | `int. 2,20` ✅ |
| baixo (divisória) | `2,35` — o número de EIXO ❌ |

### A regra nova (decidida com o usuário)

Um rótulo por parede não serve aos dois cômodos: seja qual for o lado, um lê o
interno e o outro lê o eixo. Então:

- **Perímetro** (ambiente de um lado só): interno para dentro, eixo para fora.
- **Divisória** (ambiente dos DOIS lados): o interno sai **repetido**, um de cada
  lado, e o **eixo não sai**. O eixo é o número "de fora", e divisória não tem
  lado de fora.
- **Sem ambiente nenhum**: vale o arranjo de sempre.

Invariante que isso restaura: **de dentro de qualquer cômodo, toda parede mostra
`int. X`.**

`ambientesNaParede` substitui a pergunta anterior e devolve os FATOS dos dois
lados (`positivo`/`negativo`), deixando a decisão com quem desenha.
`normalParaODentro` continua existindo como envoltório fino — e os testes dela
seguem valendo.

### Verificação

- ✅ 1708 testes; 5 novos separando divisória de perímetro, mais um que prova que
  **o número nunca foi o problema**: as três paredes horizontais têm eixo e face
  interna idênticos
- ✅ `tsc` limpo; `check-ui-standard.sh` sem violação
- ✅ Print: divisória com `int. 7,10 m` dos dois lados e sem eixo; perímetro com
  `7,25 m` por fora e `int. 7,10 m` por dentro

---

## Adendo 5 — o recuo de canto explodia e comia a medida interna (28/08/2026)

### Pedido, com print

> ainda continua errado e parece ser um erro bem feio desta vez. como é possivel
> essas medidas serem iguais 2,20

### O defeito

`recuoAteFace` calcula o quanto a parede vizinha corta da face desta:
`(t/2) / sen(θ)`. Essa expressão **diverge quando θ→0**, e a única trava era
`sen < 1e-6` — colinearidade EXATA. Medido numa parede de 9,00 m com espessura
150 mm:

| ângulo da vizinha | recuo | `int.` resultante |
|---|---|---|
| 90° | 75 mm | 8,93 m |
| 10° | 432 mm | 8,57 m |
| 5° | 860 mm | 8,14 m |
| 1° | 4.285 mm | 4,71 m |
| **0,5°** | **8.572 mm** | **0,43 m** |
| 0,2° | 21.429 mm | 0,00 m |

Em planta gerada de PDF, parede que deveria ser continuação da outra chega com
décimos de grau de desvio o tempo todo. O número interno saía absurdo e nada na
tela denunciava.

### O que torna isso um deslize claro

As outras DUAS contas de mitra do módulo já tinham teto:

- `extensaoDeCanto` (silhueta desenhada): `Math.min(meia / tg, meia * AVANCO_MAX)`
  — o comentário diz "sem teto vira farpa"
- `recuoDoCanto` (cadeia de cotas, `blueprintCotas.ts`): `if (sen < 0.14) continue`
  — "< ~8°: rasante demais para ser o fechamento"

Só `recuoAteFace` ficou sem. E o comentário de `recuoDoCanto` sempre disse que as
duas não podiam divergir.

### A correção

`SENO_MINIMO_MITRA = 0.14` (~8°) passa a ser exportada do kernel, e `recuoDoCanto`
importa em vez de repetir o literal — **uma régua, um lugar**. Abaixo dela a
vizinha é continuação, não canto: recuo zero.

### Alcance

O número errado ficava só na LEITURA — `faceInternaMm` é consumida pelo rótulo de
Medidas e pela linha "Livre entre faces" do painel. `computeQuantities` não a usa,
então **orçamento e quantitativos nunca foram afetados**, e o payload canônico não
muda (goldens intactos).

### Verificação

- ✅ 1711 testes; 3 novos: vizinha rasante não corta nada, canto de verdade
  continua descontando com desconto limitado, e a face interna nunca some numa
  parede longa
- ✅ Ortogonal segue exatamente meia espessura (75 mm), como sempre foi
- ✅ `tsc` limpo; goldens intactos

---

## Adendo 6 — a cota interna, e o erro que ela revelou (28/08/2026)

### Pedido

> estamos rodando em circulos. vamos resolver de outra maneira. implemente opcao
> de cota interna. ao fazer isso voce vai identificar o erro

O usuário estava certo, e o caminho que ele apontou era o certo.

### O erro

Havia **dois números diferentes, ambos corretos, com o mesmo nome**:

| conta | o que mede | quebra na divisória? |
|---|---|---|
| `faceInternaMm(parede)` — rótulo `int.` de **Medidas** | vão da PAREDE entre as faces das pontas DELA | **não** |
| cadeia `internas` de `cadeiasDoLado` | cada AMBIENTE, de face a face | **sim** |

Numa fachada que atravessa três cômodos, o primeiro dá **os três somados**. Era o
`int. 5,67 m` aparecendo ao lado de uma cozinha de 2,20 — e "duas paredes com
dimensões iguais, porém com medidas internas diferentes": uma cortada por
divisória, a outra não.

**Por que passou por três rodadas de correção.** Eu vinha testando em retângulo
simples, e sem divisória os dois números COINCIDEM. O caso que denuncia é
justamente o que eu não estava construindo. Há um teste travando isso agora
(`sem divisória os dois coincidem — é por isso que o retângulo simples não
denunciava`).

### O que foi feito

- **Botão "Interna" na barra**: desenha só a cadeia por AMBIENTE, de face a face.
  Sozinha ela vai para a linha mais perto do desenho; junto com "Cotas" ocupa o
  nível de sempre. Reusa `cadeiasPorLado`, sem conta nova.
- **O rótulo de Medidas deixou de dizer `int.`** e passa a dizer `livre`. Ele
  mede a parede, não o cômodo, e "livre" é o vocabulário que o painel da parede
  já usava: *"Livre entre faces: X m · o eixo mede Y m"*. Some a colisão.

### Verificação

- ✅ 1715 testes; 4 novos comparando as duas contas: o vão livre da parede ignora
  a divisória, a cadeia interna quebra nela, **a soma dos ambientes + a espessura
  da divisória fecha contra o vão livre** (prova de que os dois são coerentes e a
  diferença é a divisória), e o caso sem divisória em que coincidem
- ✅ `tsc` limpo; `check-ui-standard.sh` sem violação
- ✅ Print com fachada de 9,10 m atravessando três cômodos: `livre 9,10 m` na
  parede e `3,05 / 2,85 / 2,90` na cadeia interna, lado a lado no mesmo desenho
