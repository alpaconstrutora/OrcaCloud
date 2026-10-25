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
- [ ] PR + CI
- [ ] publicação
