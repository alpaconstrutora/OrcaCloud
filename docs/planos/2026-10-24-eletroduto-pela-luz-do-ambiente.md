# Planta › Elétrico — eletroduto como na obra: quadro → luz do ambiente → tomadas

## Pedido original

Sessão `9e26b316`, 24/10/2026 (manhã, logo após a publicação do PR #128), com um print de um projeto elétrico de
referência (apartamentos 201/202, eletrodutos em arco saindo das luzes):

> *"Pergunta: esses conduites passando proximo a parede nao são executado assim na obra.
> O encaminhamento geralmente parte do quadro de distribuição, vai ate o ponto de iluminacao no teto do ambiente e de la desce para as tomadas daquel ambiente. Se tiver mais de um ponto de iluminacao no teto no mesmo ambiente pode se interligar um ao outro. Pode-se tambe'm interligar uma tomada a outra na mesma parede, porem percorrendo dentro da parece."*

Respostas às 4 perguntas (mesma sessão, antes do plano):
1. Tomada × tomada: *"Quando a vizinha está mais perto (Recomendado)"*.
2. Ambiente sem luz: *"Da rede do teto mais próxima (Recomendado)"*.
3. Forro da Casa Automática: *"Sim, também no forro"*.
4. Desenho: *"Curvas, como no seu print (Recomendado)"*.

## Contexto

Pedido (24/10/2026, com print de um projeto elétrico de referência, apartamentos 201/202):
> *"esses conduites passando proximo a parede nao são executado assim na obra. O encaminhamento geralmente parte do quadro de distribuição, vai ate o ponto de iluminacao no teto do ambiente e de la desce para as tomadas daquel ambiente. Se tiver mais de um ponto de iluminação no teto no mesmo ambiente pode se interligar um ao outro. Pode-se também interligar uma tomada a outra na mesma parede, porem percorrendo dentro da parede."*

**Causa (lida em `origin/main`):** `planejarEletrodutos` (`utils/blueprintEletrodutos.ts:245-683`) não conhece o AMBIENTE do ponto.
- **Modo padrão:** cada tomada ou interruptor sobe na própria posição até o teto. O Prim com rota limitada (`arvoreComRotaLimitada`, `utils/blueprintKernel/grafoDeRede.ts:171`) pendura cada um no nó mais perto, que costuma ser a subida da tomada vizinha. O resultado é uma corrente de tomada em tomada pelo teto, rente à parede.
- **Forro da Casa Automática** (`noForro`) e **checkbox "pela parede"** (`rotaPelaParede`): o traçado anda por anéis ou eixos de parede (`arvorePelasParedes`). Rente por construção.
- **Nenhuma decisão anterior pediu "rente à parede" para a elétrica.** O "pela parede" veio da água (27/09); o forro com faixas (15/10) foi decidido para compatibilizar disciplinas.

**Decisões do usuário (24/10):**
1. Tomada liga na **vizinha da mesma parede**, por dentro da parede, **quando ela está mais perto que a luz do ambiente**. Se não, desce da luz.
2. Ambiente **sem luz no teto**: liga na **rede do teto mais próxima**, como hoje.
3. A regra vale **também no forro** da Casa Automática. O detector de conflitos avisa se cruzar algo.
4. Desenho em **curvas**, como no print (tela e prancha). 3D e quantitativo continuam pelo caminho real.

## Abordagem

### Task 1: F1 — Regra pura "ponto → luz do ambiente" (`utils/blueprintEncaminhamentoPorAmbiente.ts`, novo)

Função pura `encaminhamentoPorAmbiente(model, levelId, pendentes)` que devolve, para cada ponto de parede, **onde ele se pendura**:
- `{ tipo: 'LUZ', luzId }`;
- `{ tipo: 'VIZINHA', terminalId }`, por dentro da parede;
- `{ tipo: 'REDE' }`, que é o fallback de hoje.

**Ambiente:**
- `ambienteDoPonto` (`utils/blueprintAgrupamentoDePontos.ts:43`).
- Ponto na face da parede, fora de todo polígono: vale o cômodo mais perto, até o mesmo raio de 600 mm (`RAIO_DE_ENCAIXE_ELETRICO_MM`).

**Luzes do ambiente:** as `ILUMINACAO_TETO` cujo ambiente é o mesmo.

**Interruptor:** desce da luz que ele **comanda**, se ela estiver no mesmo ambiente. Senão, da luz mais perto do próprio ambiente. É a convenção do retorno; `composicaoDaRede` já deriva o retorno pelo caminho interruptor→luz.

**Tomada × vizinha (decisão 1):**
- **Vizinha** = ponto da **mesma parede** (encaixe por `encaixarNaParede`, mesma `wallId`, mesma face), do mesmo ambiente e com **a mesma cota** (±50 mm).
- A tomada liga na vizinha quando a distância ao longo da parede é **menor** que a distância em planta até a luz escolhida.
- A cadeia só pendura na vizinha se ela, por sua vez, chega a uma luz. Assim não forma ciclo nem fica uma cadeia solta.
- A ordem é determinística: primeiro as mais perto da luz.

Testes em `__tests__/blueprintEncaminhamentoPorAmbiente.test.ts`:
- tomada sem vizinha → LUZ;
- 2 tomadas a 0,6 m na mesma parede, luz a 2 m → a mais longe vira VIZINHA;
- tomadas em paredes diferentes → cada uma na LUZ;
- cotas diferentes (30 cm × 1,10 m) → não encadeiam;
- interruptor → a luz que ele comanda;
- 2 luzes no mesmo ambiente → cada ponto na mais perto;
- ambiente sem luz → REDE;
- ponto na face, fora do polígono → cômodo mais perto.

### Task 2: F2 — O planejador usa a regra (`utils/blueprintEletrodutos.ts`)

**Ordem no teto de cada pavimento:**
1. Árvore só com **quadro (ou prumada) + luzes de teto**. É o Prim com rota limitada de hoje, sem os pontos de parede. Assim as luzes do mesmo ambiente se interligam e as de ambientes diferentes também, pelo menor eletroduto dentro do limite de rota.
2. **Cada ponto de parede `LUZ`:**
   - trecho no teto da luz até a vertical do ponto (na face da parede, onde está a caixa);
   - descida dentro da parede até a cota do ponto (como a descida de hoje, `addTrecho(q, teto, q, cota)`).
   - Sem limite de rota: é a regra de obra.
3. **`VIZINHA`:** trecho horizontal **dentro da parede, na cota do ponto**, até a vizinha. Sem subir ao teto.
4. **`REDE`:** igual a hoje (sobe na posição e entra no Prim junto com os demais). Os pendentes `REDE` entram **depois** das luzes e dos pontos ligados a elas, e podem se pendurar em qualquer nó já alcançado.

**Outros pontos do fluxo:**
- **Nós alcançados:** os trechos dentro da parede (cota abaixo da rede) também passam a ser nós válidos para o caminho até o quadro. `caminhoEntre` já anda por qualquer aresta; só a lista `alcancados` (:430-434) olha a cota do teto, e ela continua sendo só para o teto.
- **Circuitos por trecho, condutores e bitola** (:535-579): não mudam. O caminho de cada ponto até o quadro agora passa pela luz do ambiente, e o TUG passa pela caixa da luz, como na obra.
- **Hipótese nova, `encaminhamento: 'PELA_LUZ_DO_AMBIENTE' | 'ARVORE_NO_TETO'`:**
  - padrão `PELA_LUZ_DO_AMBIENTE`;
  - o modo antigo fica disponível;
  - `rotaPelaParede` continua existindo, mas, ligado, vale só para quem cair em `REDE`;
  - na tela de hipóteses dos eletrodutos (`BlueprintEditor.tsx` ≈18717), um select "Encaminhamento" com "Quadro → luz do ambiente → tomadas (como na obra)" e "Árvore única no teto (antigo)".
- **Existente respeitado** como hoje: os confirmados ficam; Relançar refaz só os sugeridos.

Testes em `__tests__/blueprintEletrodutos.test.ts`:
- **Novo, cômodo com luz + 3 tomadas em 2 paredes:**
  - nenhum trecho de teto liga duas tomadas;
  - cada descida parte de um trecho que vem da luz;
  - a vizinha a 0,6 m liga na cota da tomada.
- **Novo, 2 cômodos:** quadro → luz A → luz B; as tomadas de B descem da luz B.
- **Novo:** ambiente sem luz → pendurado na rede.
- **Existentes:**
  - os da rota máxima (:207-259) e da árvore (:72) são reavaliados com `encaminhamento: 'ARVORE_NO_TETO'` quando testam o algoritmo antigo;
  - o "pela parede" (:490) idem.
  - Nenhum teste é apagado sem motivo escrito no plano.

### Task 3: F3 — Forro da Casa Automática (decisão 3)

Com `noForro`, a mesma regra:
- a árvore das luzes fica na cota da faixa;
- a luz → ponto sai em linha reta pela faixa até a vertical do ponto, recuada `afastamentoDaFaceMm` da face;
- daí `descidaDoForro` (`utils/blueprintRotaPeloForro.ts:627`) desce junto da viga e entra na parede, como hoje.

`paredesDoForro`/anéis ficam só para `REDE`. Um ponto sob laje rebaixada mantém `saidaDoRebaixoPelaParede` (item 6 da casa).

**Conflitos:**
- Rodar `__tests__/blueprintCasaAutomatica.test.ts:830` (conflitos do eletroduto no forro) e `blueprintRotaPeloForro.test.ts`.
- Conflito NOVO que aparecer com hidráulica ou ar não é escondido: o detector avisa. O que mudar nos testes da casa é anotado no plano com o número de conflitos antes × depois.
- `HIPOTESES_DO_FORRO_DA_CASA_PADRAO` passa `encaminhamento: 'PELA_LUZ_DO_AMBIENTE'`.

### Task 4: F4 — Desenho em curva (decisão 4; tela e prancha)

Reaproveitar `utils/blueprintEletrodutoSobreposto.ts`. Ele já curva o traço no 2D e é DESENHO, não modelo; o clique segue a `geometriaDesenhada`.
- **Novo:** todo trecho com comprimento em planta ganha um **arco base**:
  - flecha ≈ 12 % do comprimento, limitada a um teto em mm;
  - lado determinístico: pontas normalizadas, e o arco sempre à esquerda de min→max. O mesmo trecho curva sempre igual.
  - Os sobrepostos somam o deslocamento de hoje ao arco base.
  - A prumada (a = b) fica fora.
- **Canvas:** `BlueprintCanvas.tsx` ≈6498 (desenho e acerto do clique).
- **Prancha:** `utils/blueprintPranchaEletrica.ts:311-313`, com o arco como polilinha de ~12 segmentos via `Desenhista`.
- **Anotação:** o motor de anotação sem colisão recebe o arco como obstáculo (polilinha).
- 3D, corte, quantitativo, conflitos e hash **não mudam** (seguem `segmentosDoEletroduto`).
- **Testes:** `blueprintEletrodutoSobreposto.test.ts` (arco base determinístico; sobreposto continua separado) e o snapshot da prancha elétrica (regerar e conferir a imagem).

## Execução

- Frente nova de `origin/main`: `bash scripts/nova-frente.sh eletroduto-pela-luz-do-ambiente`. Ler `orçacloud-saas/CLAUDE.md` inteiro antes de editar.
- Plano versionado em `docs/planos/2026-10-24-eletroduto-pela-luz-do-ambiente.md` com o pedido literal e as 4 decisões (REGRA #6).
- Ordem F1 → F2 → F3 → F4, um commit por fase. Um subagente por fase, com revisão, como nas frentes anteriores. PR ao fim; eu faço o merge após a CI verde e confiro com `conferir-producao.sh`.
- Sem migration (hipótese nova com padrão no código; o modelo do trecho não muda). Conferir se `KERNEL_VERSION` ou o bundle da planta-api empacotam `blueprintEletrodutos.ts` (memória do bundle) e regerar se for o caso.

## Verificação

- **Testes:** `npx vitest run __tests__/blueprintEncaminhamentoPorAmbiente.test.ts __tests__/blueprintEletrodutos.test.ts __tests__/blueprintRotaPeloForro.test.ts __tests__/blueprintEletrodutoSobreposto.test.ts __tests__/blueprintPranchaEletrica.test.ts __tests__/blueprintEletricaDimensionamento.test.ts`, depois tsc e a suíte inteira com a conta fechando. O `blueprintCasaAutomatica` roda na CI, porque derruba o worker local.
- **Prova por imagem no harness:**
  - apartamento com 2 dormitórios, banheiro, sala e cozinha;
  - "Lançar tudo" da elétrica, depois Relançar eletrodutos;
  - print antes × depois, conferindo: tronco quadro → luzes, tomadas descendo da luz do cômodo, nenhum eletroduto de tomada em tomada pelo teto, curvas;
  - exportar a prancha elétrica e olhar a folha.
- **Casa Automática com forro:** gerar uma e comparar o número de conflitos elétrica × hidráulica/ar antes × depois. Informar o resultado ao usuário.
- **Quantitativo:** metros de eletroduto antes × depois no mesmo modelo, para informar a diferença.

## Fora do escopo (anotar, não fazer)

- Eletroduto pelo **piso** (tomadas baixas pelo contrapiso, tracejado na convenção): não pedido.
- Plantas já lançadas não mudam sozinhas: o usuário clica Relançar (os confirmados ficam) ou Refazer.

## Execução (24/10/2026) — o que foi feito e decidido

Execução por subagentes, uma tarefa por vez, cada uma com revisão independente e rodadas de correção; no fim, revisão
do ramo inteiro e uma correção final. Commits: `d92e7b12`, `6774e7b2` (T1) · `b2bb3708`, `ccb16bc6` (T2) ·
`f6b622b8`, `b0dca28a`, `23141a27` (T3) · `23046912`, `fb39ee47` (T4) · `bfce6fd0` (revisão final).

**Decisões tomadas na execução (além das 4 do usuário):**
- **Infraestrutura** (caixa de passagem, medidor…) fica fora da regra e não serve de vizinha.
- **Interruptor** desce da luz que comanda; se o ambiente dele não tem luz (hall), desce da luz comandada noutro
  ambiente antes de cair na rede.
- **Tomada só pendura em luz do MESMO quadro**; luz de outro quadro não serve (a caixa dela não está na rede).
- **Vizinha bloqueada** por porta/janela da mesma parede cuja faixa de altura contém a cota da tomada, e por pilar
  entre as duas caixas — na face E no eixo da parede (pilar de 14 cm em parede de 15 cm não escapa).
- **Pilar no modo pela luz:** as pegadas entram no desvio infladas por raio do tubo + 50 mm (a conferência
  `fracaoDentro` amostra a cada 50 mm e deixava passar corte de canto de até 39 mm); perto de uma ponta o anel
  encolhe pela conta do anel em esquadro; sem contorno, tenta a pegada real (nunca pior que antes). `desvioDoPilar`
  e `fracaoDentro` (água, esgoto, pluvial) NÃO mudaram.
- **Forro:** o `q` de chegada no anel só vale no cômodo do ponto ou da luz; fora disso, saída pela parede ou rede.
- **Arco:** trecho DENTRO DA PAREDE (cotas iguais ±50 mm, entre 0 e 2,10 m) fica RETO — *"percorrendo dentro da
  parede"*; teto, forro e piso em arco. Sobrepostos de um grupo usam a flecha do mais longo (tela e prancha).
- **Hipótese `encaminhamento`** (padrão "Quadro → luz do ambiente → tomadas (como na obra)"; "Árvore única no teto
  (antigo)" disponível), select no painel dos eletrodutos, guardado no navegador como o checkbox vizinho. A Casa
  Automática usa sempre o modo novo.

**Números medidos:**
- Pavimento de teste com 340 pontos e 20 cômodos (sem forro): antigo 1008,7 m de eletroduto em 183 ms; novo
  716,9 m em 28 ms, sem anel. Relançar uma planta lançada no modo antigo dá o mesmo resultado do lançamento do zero.
- **Planta Garden** (rascunho do usuário, 1 quadro, 96 pontos; rede refeita nos dois modos, harness local): antigo
  124 trechos e 144,5 m; novo 124 trechos e **193,9 m (+34 %)** — cada tomada ganha a própria descida da luz do
  cômodo em vez de encadear com a vizinha pelo teto. Os troncos rente às paredes (73, 103, 114 condutores) somem;
  os prints antes × depois mostram os arcos saindo das luzes, como no print de referência.
- Casa Automática com forro, antes da T3 → depois (5 casas):

| Casa | elétrica × água/ar | pilar, eixo dentro | pilar, raspão | viga atravessada | furos dispensa / verificar | metros |
|---|---|---|---|---|---|---|
| 12 × 30 térrea com ar | 0 → 0 | 0 → 0 | 0 → 0 | 33 → 15 | 6/27 → 5/10 | 219,0 → 266,5 |
| 12 × 30 sobrado com ar | 0 → 0 | 0 → 0 | 5 → 11 | 44 → 49 | 6/38 → 6/43 | 262,9 → 323,2 |
| 10 × 30 sobrado 4 dorm. | 0 → 0 | 0 → 0 | 1 → 1 | 61 → 70 | 4/63 → 4/70 | 268,3 → 321,9 |
| 10 × 30 3 pav. 4 dorm. | 0 → 0 | 0 → 0 | 13 → 19 | 79 → 94 | 6/78 → 8/91 | 297,8 → 367,1 |
| 12 × 30 3 pav. R1-A | 0 → 0 | 0 → 0 | 0 → 0 | 63 → 68 | 9/59 → 4/71 | 346,1 → 418,0 |

  No forro, entre cômodos o eletroduto vai de luz a luz em reta e fura a viga onde a reta cai (antes usava as
  travessias planejadas junto às paredes): mais viga e mais metros. Mantido pela decisão 3; o detector avisa.
  Raspão novo = trechos que saem do quadro encostado (5 mm) num pilar — sem espaço para afastar.

**Limitações conhecidas / próximos (anotados, não feitos):**
- Sobreposição PARCIAL com o curto curvando por cima do longo ainda cruza (geometricamente inevitável sem mudar a
  regra de lados dos sobrepostos); raro no traçado novo, em leque.
- Laço de seleção e encaixe (osnap) seguem a corda; só o clique segue o arco. Legenda da prancha mostra o
  eletroduto reto. No DXF cada eletroduto sai em 12 segmentos.
- O arco também curva trechos que seguem parede/anel (REDE "pela parede", anéis do forro em ambiente sem luz) e
  cada pedaço de um desvio de pilar.
- Na prancha não há o deslocamento por nível dos sobrepostos nem a entrada espalhada no quadro (nunca houve).
- No forro, a ligação luz × luz de cômodos diferentes poderia usar as travessias planejadas (menos furo de viga) —
  depende de decisão do usuário.
- Ponto em furo do `Space` cai em rede; recurso à pegada real do pilar não gera aviso.

## Estado
- [x] desenho aprovado (24/10/2026, plano aprovado após as 4 decisões)
- [x] Task 1 — F1 regra pura — revisada; correção 1 conferida
- [x] Task 2 — F2 planejador — revisada; correção 1 re-revisada limpa
- [x] Task 3 — F3 forro — revisada; correções 1 e 2 re-revisadas limpas
- [x] Task 4 — F4 curvas — revisada; correção 1 aceita (cruzamento parcial documentado)
- [x] revisão final do ramo — "Sim, com correções"; correção final `bfce6fd0` re-revisada limpa
- [x] tsc 0 erros; suíte inteira (antes da correção final) 11.268 ok, 0 falhas, 34 pulados; os 25 testes do
      `blueprintCasaAutomatica` que derrubam o worker local ficam para a CI
- [x] prova por imagem no harness local (planta Garden, rede refeita nos dois modos, canvas de main × novo) — sem
      erro de página; a prancha exportada não foi vista em imagem (coberta pelo teste da prancha)
- [x] PR + CI — PR #137, `ci` 17min53s verde
- [x] publicação — squash `6c3a06f7` em 24/10/2026; `conferir-producao.sh "como na obra"` ✅ (domínio serve origin/main `6c3a06f`)
