# Planta › eletroduto não bifurca, e é flexível (curva contínua no 3D)

## Pedido original

Sessão de 25/10/2026, noite, com dois prints do 3D da Garden (o eletroduto que sobe do quadro e se divide em dois no
forro; os cantos de 90° dos eletrodutos):

> *"1. o conduite que sobe do painel e bifurca para dois lados. Isso nao acontece na instalacao.
> deve sair dois eletrodutos um para cada lado. eletrodutos conduite nao bifurca.
> 2. Outro ponto, o conduite e flexivel e nao deve fazer curva em 90 graus (veja Print). refaça com curva continuada e sem corte"*

## Diagnóstico (rascunho da Garden gravado 25/10 18:16 e relançado numa sonda com o motor de `origin/main`)

- **A bifurcação do print 1:** do QDC (6750, 11705, cota 1.600) sobe UM eletroduto com os 31 circuitos até a faixa do
  forro (2.755); a 15 cm dali, em (6625, 11525), ele se divide: 18 circuitos para um lado, 13 para o outro. O motor monta
  uma árvore a partir do quadro e o tronco é compartilhado "por construção" (cabeçalho de `blueprintEletrodutos.ts`);
  sem caixas de passagem (`caixas: null`, a escolha da Garden), a derivação fica sem caixa.
- **Sobras:** 11 eletrodutos SEM circuito no rascunho — 10 que sobem do quadro até 2.150 (de um lançamento antigo, com
  a rede sob a viga) e 1 paralelo a um trecho da luz da sala. `refazerEletrodutos` apaga a "rede do quadro" por
  CIRCUITO (`redeDoQuadro`), então eles sobrevivem a todo relançamento — e no 3D o feixe de 10 parece o tronco.
- **Os cantos:** o 3D desenha cada pedaço reto de cada trecho como um cilindro (`cilindrosDoTrecho`): o "L" do trecho
  e o encontro de um trecho com o seguinte saem em canto vivo de 90°.

## Itens

### 1. Refazer apaga as sobras sem circuito — `utils/blueprintEletrodutos.ts`

- **O que muda:** `refazerEletrodutos` apaga também o eletroduto SEM circuito ligado (pelas pontas) à rede do quadro ou
  ao próprio quadro. O sem circuito solto, longe da rede, fica (pode ser reserva desenhada à mão).
- **Pronto quando:** teste — os 10 tocos sem circuito do quadro e o paralelo sem circuito saem no refazer; o solto
  longe fica.

### 2. Eletroduto não bifurca — `utils/blueprintEletrodutoSemDerivacao.ts` (novo), `utils/blueprintEletrodutos.ts`

- **O que muda:** no fim do planejamento, `desdobrarDerivacoes` percorre a rede nova a partir do quadro; num nó SEM
  caixa (não é ponto, quadro, caixa de passagem nem rede existente) de onde saem dois ou mais ramos, cada ramo ganha o
  PRÓPRIO eletroduto de volta até a caixa (ou o quadro) anterior — os trechos de cima são repetidos, um por ramo, cada
  um com os circuitos do seu ramo e a bitola recalculada por eles. Na Garden: do QDC saem dois eletrodutos, um para cada
  lado. Com caixas de passagem ligadas, a derivação já tem caixa e nada muda.
- **Pronto quando:** testes do módulo (T no meio do forro vira dois eletrodutos até o quadro; derivação sobre caixa
  fica; cadeia de dois níveis; circuitos e bitola por ramo) e do motor (o plano da Garden-modelo não tem nó sem caixa
  com 3+ eletrodutos).

### 3. Eletroduto flexível no 3D — `utils/blueprintEletrodutoFlexivel3D.ts` (novo), `components/blueprint/Blueprint3DViewer.tsx`

- **O que muda:** o eletroduto (só a elétrica) vira um TUBO contínuo: os trechos encadeados por nós sem caixa formam uma
  linha só, os cantos viram curva (raio até 6 × o diâmetro, nunca mais que 45 % do pedaço menor), e cada trecho é
  desenhado na sua parte da curva — continua selecionável sozinho, sem corte na emenda. Os eletrodutos que correm juntos
  (os do item 2) saem lado a lado, em faixas paralelas.
- **Pronto quando:** testes do módulo (canto em "L" vira arco tangente às duas retas; emenda entre trechos no mesmo
  ponto; paralelos afastados); print do 3D da Garden antes × depois.

Pedido seguinte (mesma sessão, noite, com uma referência isométrica — eletrodutos azuis em curva contínua, caixas da luz
de teto redondas/octogonais com aba — e a foto de uma laje com os conduítes laranjas e as caixas octogonais):

> *"veja esse print. Esse esse desegin para os eletrodutos flexiveis (conduites) e para as caixas de iluminacao no teto. também estou te passando uma foto real de um conduite para seu conhecimento"*

### 4. A caixa OCTOGONAL da luz de teto — `utils/blueprintEletrodutoFlexivel3D.ts` (`CAIXA_OCTOGONAL_MM`), `components/blueprint/Blueprint3DViewer.tsx`

- **O que muda:** a luz de teto no 3D deixa de ser o cubo de 100 mm e vira a caixa 4×4 octogonal: prisma de 8 lados,
  100 × 50 mm, cinza claro, com a ABA de 120 mm embaixo (para o ambiente). Os eletrodutos (o curso contínuo do item 3)
  entram pelas laterais dela — como na referência e na foto.
- **Pronto quando:** print do 3D da Garden refeita.

### 5. Um furo por feixe — `utils/blueprintFurosPrevistos.ts`

- **O que muda (achado na CI):** com os eletrodutos repetidos, cada um que atravessava uma viga no mesmo lugar contava
  um furo, e cada furo tinha o outro "a menos de 2h" — todos "verificar" (casa automática: térrea 8 > 7, sobrado 69 > 39).
  Os que atravessam a mesma peça no mesmo ponto passam por UM furo, do tamanho do feixe (os tubos lado a lado, 10 mm de
  vão, mais a folga); o furo diz os trechos (`trechoIds`).
- **Pronto quando:** `blueprintCasaAutomatica` "eletroduto sem anel… no máximo 7/39 furos" passa (a conta de anel ajustada
  como em `blueprintEletrodutos`: os que correm juntos são um caminho só); os testes de furos passam.

**Para a Garden mudar:** relançar (refazer) os eletrodutos depois da publicação.

## Estado

- [x] item 1 + teste — `blueprintEletrodutoSemDerivacao.test.ts` (o toco do quadro e a sobra em cadeia saem; o solto
  fica); na sonda da Garden, os 11 sem circuito saem no refazer (240 → 231 trechos)
- [x] item 2 + testes — `blueprintEletrodutoSemDerivacao.test.ts` (6: o T no forro vira dois desde o quadro; bitola por
  ramo; derivação em caixa fica; dois níveis = três do quadro; nó SOBRE a caixa de um ponto repete a descida; cadeia
  simples igual). Achado no caminho: o "nó sobre caixa" — a caixa do ponto (e o quadro) já era a da derivação no motor;
  ali cada eletroduto DESCE até a caixa (a descida se repete), e só no meio do forro o ramo volta até a caixa anterior.
  Segundo achado: o 2º lançamento escolhia qualquer um dos eletrodutos que correm juntos e somava os circuitos de volta
  num tronco — o caminho do circuito agora passa pelo que já o leva. `blueprintEletrodutos.test.ts` ajustado (a árvore
  com as descidas repetidas; a conta de anel conta os que correm juntos como um caminho; a travessia da Cozinha com dois
  eletrodutos e um furo) — 62/62; conjunto elétrico 615/615. Sonda da Garden relançada: nenhum nó sem caixa bifurca
  (o do quadro e o do forro têm só pares que passam)
- [x] item 3 + testes + print — `blueprintEletrodutoFlexivel3D.test.ts` (6: o "L" vira curva sem quebra > 15° e começa a
  6 × Ø; até 45 % do pedaço; emenda sem corte, mesmo ponto e direção; na caixa a linha termina; os juntos lado a lado;
  cada um segue o de mesmos circuitos). Harness local: a Garden gravada no viewer de `origin/main` × refeita pelo motor
  novo no viewer novo — do QDC sobem DOIS eletrodutos lado a lado, cada um curva para o seu lado; os cantos viraram
  curvas; as emendas entre trechos sem fio de luz (cada ponta avança 4 mm por dentro da vizinha, mesma cor)
- [x] tsc + suíte — tsc 0 erros; suíte local (sem `blueprintCasaAutomatica`, que roda na CI): 11.517 ok + 3 testes de tela que caíram por tempo sob carga e passaram sozinhos (`PainelVersoes`, `TelaWebhooks`: 43/43) = 11.520 ok, 0 falhas, 34 pulados, total 11.554. Bundle da planta-api inalterado
- [x] item 4 + print — harness: a luz (4150, 8900) da Garden refeita, octógono com a aba, os eletrodutos entrando
  pelas laterais
- [x] item 5 + testes — `blueprintCasaAutomatica -t "eletroduto sem anel"` 2/2 (local, filtrado); testes de furos 4/4
- [x] PR + CI — PR #172, `ci` verde na 3ª rodada (18min57s): a 1ª pegou a casa automática (conta de anel e furos — itens
  4 e 5), a 2ª passou e o merge bateu em conflito de docs com o #173 (rebase)
- [x] publicação — squash `8b69470f` em 25/10/2026; `conferir-producao.sh` provou o domínio servindo 8b69470 (sem texto
  novo de tela; sem deploy de função)
