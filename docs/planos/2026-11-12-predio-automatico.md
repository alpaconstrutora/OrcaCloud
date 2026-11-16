# Prédio automático — a casa automática para prédio com várias unidades por andar

## Pedido original

Sessão de 12/11/2026 (Claude Code, VS Code). Antes, a pergunta:

> pegunta: a casa automatica cria apenas uma unidade por vez ou o pavimento inteiro, em se tratando de um predio com mais
> de uma unidade por pavimento, por exemplo o empreendimento garden cambuhy

Resposta: a Casa automática gera UMA unidade unifamiliar; prédio hoje só tem a arquitetura (Estudo de massa → Pavimento
tipo → planta das unidades), sem estrutura, instalações, térreo, cobertura nem PPCI encadeados. Então:

> faça um plano para incrementar a casa automatica para predio eutomatica também.

### Decisões do usuário (12/11/2026, perguntas de múltipla escolha)

- Instalações nos outros andares: **"Cópia viva também (Recomendado)"** — o kernel passa a copiar as instalações do tipo.
- Elétrica: **"QD por unidade + QGBT + serviço (Recomendado)"**.
- Água: **"Hidrômetro individual (Recomendado)"** (Lei 13.312/2016).
- Pavimentos além do tipo: **"Térreo (hall/portaria e acesso)", "Cobertura (reservatório e casa de máquinas)", "Garagem /
  subsolo", "Incêndio (PPCI) no fim"**.
- O plano (fases PA0–PA10) foi aprovado em 12/11/2026.

## Contexto lido no código (origin/main, 12/11/2026)

- **Arquitetura do prédio já existe:** `dividirPavimentoDoBloco`/`montarPavimentoTipoDoBloco`
  (`utils/blueprintPavimentoOrtogonal.ts`, `blueprintPavimentoTipoDaMassa.ts`): pavimento tipo com corredor, unidades
  (`Unidade`), portas, núcleo (`Nucleo` ELEVADOR + SHAFT, `AddEscada`) e os andares de cima como CÓPIAS VIVAS
  (`Level.tipoDeId`); `plantasDasUnidades` (`utils/blueprintPlantaDaUnidade.ts`) desenha o interior de cada unidade.
  Térreo: "fica com o projetista". Cobertura: nada. Garagem: `lancarGaragem` (níveis + 4 paredes + vagas).
- **Cópia viva** (`sincronizarPavimentosVinculados`, `utils/blueprintKernel/commands.ts`): paredes, aberturas, estrutura,
  telhados e etiquetas — **instalações NÃO** (terminais, trechos, quadros, circuitos são por pavimento).
- **Disciplinas que já fazem conta de prédio:** quadros em hierarquia (`Quadro.tipo` QD/QGBT/MEDICAO, `quadroPaiId`,
  `unidadeId`), diversidade e `entradaDoQuadro` por unidades, esquema vertical elétrico; reservação, recalque, pressão,
  esgoto multinível, ventilação, pluvial; `gerarPpci` (classificação por altura, A-2, rota multipavimento, casa de bombas);
  VRF entre pavimentos.
- **A casa automática** (`utils/casaAutomatica/`) supõe uma casa: um QDC (`comandosParaOCentro`), um medidor, hidrômetro
  `[0]` (`blueprintAlimentador.ts`), uma caixa d'água, uma CI na frente, ≤ 3 pavimentos, telhado sobre um retângulo.

**Três achados que moldam o plano:** (1) `Circuito` não tem `levelId` — copiar pelo mapa quadro do tipo → quadro da cópia
e remapear `circuitoId(s)`, `drs`, `condensadoraId`, `quadroPaiId`; (2) unidades dos andares copiados são DERIVADAS
(`blueprintUnidadesDoPredio.ts`) e a demanda conta unidades por número (`preDimensionarQuadroCompleto`) — 16 QDs contariam
2; contar pela chave derivada (precedente `AcessorioDaUnidade.levelUid`); (3) a sincronização APAGA nas cópias o que não
tem o uid esperado — a cópia de instalações é **opt-in** no tipo, e ligar com instalação existente nas cópias é recusado
listando o que seria apagado.

## Fases

Cada fase é publicada sozinha (frente → PR → CI → merge → produção conferida) e conferida no app com estudo descartável.
O marco da casa (`__tests__/casaAutomaticaMarco.test.ts`) fica idêntico em todos os PRs; o marco do prédio cresce e toda
regravação é justificada no PR.

### PA0 — Plano e marco do prédio
**O que muda.** Este plano; `__tests__/predioAutomaticoMarco.test.ts` + `__tests__/fixtures/predioAutomaticoMarco.json`
com os prédios de referência (lote com rua ao sul, produto médio): R4, R8, R12 e RL (bloco em L), gravando o que existe
hoje — massa → pavimento tipo → planta das unidades (hash do modelo, unidades, pavimentos, cópias, unidades por andar,
paredes, núcleos). Os subsolos de R8 e R12 entram na PA8.
**Pronto quando.** O marco grava e repete idêntico; tsc limpo; o marco da casa não muda (nenhum código do app tocado).

### PA1 — Kernel: instalações na cópia viva (grande)
**O que muda.** `Level.copiaInstalacoes?: true` (omitido no canônico quando ausente — nenhum hash existente muda) e o
comando `SetCopiaInstalacoes`; sincronizar quadros, terminais, trechos e componentes (por `levelId`) e circuitos (por
`uidDaCopia(nivel.uid, circuito.uid)` com `quadroId` remapeado); passada de remapeamento de `circuitoId(s)`, `drs`,
`condensadoraId`, `quadroPaiId` (pai fora do tipo — o QGBT do térreo — fica); `LEVEL_LINKED` nas instalações das cópias
só com a flag; contagem de unidades pela chave derivada em `preDimensionarQuadroCompleto` e `entradaDoQuadro`;
`Terminal.unidadeLevelUid` para o medidor do térreo apontar a unidade de um andar; KERNEL_VERSION 0.106.0; bundle da
planta-api regenerado. Ressincronizar instalações só quando o diff tocar o tipo ou um `Level` (desempenho).
**Pronto quando.** Testes do kernel: idempotência, ordem, `LEVEL_LINKED`, GUID do IFC estável, quantitativo sem contar em
dobro, benchmark do sync; R8 com QD por unidade dá `unidadesAtendidas` = unidades do prédio; marco da casa igual; no app,
editar um ponto no tipo propaga a todos os andares e Ctrl+Z desfaz.

### PA2 — Orquestrador, tela e o tipo
**O que muda.** `utils/predioAutomatico/` (contexto, orquestrador, etapas, pedido), worker, hook e
`components/blueprint/TelaPredioAutomatico.tsx` (botão "Prédio automático" em `PainelBlocoSelecionado.tsx`), no padrão da
Casa: Programa · Hipóteses · Resultado (`PlantaDaPrevia` por pavimento, cópias com o selo "cópia do Tipo") · Relatório;
`PlanoDoPredio` no formato do `PlanoDaCasa` (um lote, um Ctrl+Z, pendências com locais), `conferirPlanoDoPredio`,
assinatura da prévia. Pré-requisito sem mudar comportamento: `instalacoes(..., opcoes?)` da casa com quadro por ambiente,
destino da água e do esgoto (padrões = os de hoje; o marco da casa prova).
**Pronto quando.** O marco do prédio grava tipo + unidades pelo orquestrador; no app a tela abre a partir de um Bloco,
mostra a prévia, lança e desfaz.

**Execução (13/11/2026).** Na PA2 o prédio só tem a arquitetura — o motor encadeia o que hoje são dois botões soltos do
painel do bloco ("Montar neste estudo" e "Gerar a planta das unidades"), numa prévia e num lote:
- `utils/predioAutomatico/hipoteses.ts` — `EtapaDoPredioId` (`PAVIMENTO_TIPO`, `PLANTAS`, `INSTALACOES_NO_TIPO`,
  `CONFERENCIA`; as fases seguintes acrescentam as suas), `EtapaDoPredio`, `HipotesesDoPredio` (`plantas: boolean`),
  `PlanoDoPredio` (lote, criados, etapas, pendências `PendenciaDoPpci` com locais, resultado, `tipoLevelId`, resumo).
- `utils/predioAutomatico/orquestrador.ts` — `motivoParaNaoGerarPredio` (bloco sem unidade, tipo já montado, sem
  produto) e `planejarPredio`: divisão → montagem (tipo + cópias vivas) → plantas internas → `SetLevelProps
  copiaInstalacoes` no tipo (PA1: as instalações das fases seguintes nascem no tipo e vão aos andares) → conferência
  (avisos da divisão, da montagem e das plantas viram pendências; cômodo sem fachada aponta a unidade).
- `utils/predioAutomatico/pedido.ts` — `PedidoDoPredio` (clonável: o desenho, o bloco, o produto, a distribuição do
  bloco, o norte, as hipóteses), `planejarPredioDoPedido`, `assinaturaDoPedidoDoPredio`, `conferirPlanoDoPredio`.
- Worker, `hooks/usePredioAutomatico.ts`, `components/blueprint/TelaPredioAutomatico.tsx` (Programa · Hipóteses ·
  Resultado · Relatório; Gerar, Criar alternativa e Lançar na barra), botão "Prédio automático" no painel do bloco,
  `PlantaDaPrevia` com "· cópia do tipo" no nome do pavimento copiado.
- Marco do prédio passa a gerar pelo orquestrador (regravação justificada: o tipo ganha `copiaInstalacoes`).
- **Desvio:** a parametrização de `instalacoes(..., opcoes?)` da casa vai para a PA5, que é quem a consome — feita aqui,
  ficaria sem uso e sem teste que a exercite.

### PA3 — Térreo e cobertura
**O que muda.** Térreo solto (perímetro, hall/portaria, acesso, centro de medição, casa de bombas, reservatório inferior);
cobertura (laje ou telhado, reservatório superior, casa de máquinas, área de condensadoras); núcleo do térreo à cobertura.
**Pronto quando.** Marco grava os níveis; no app escada e shaft contínuos no 3D.

**Execução (14/11/2026).** Lido no código: o térreo do bloco é hoje o pavimento do lote, e a montagem do tipo deixa o 1º
pavimento "para o projetista"; o núcleo nasce no tipo e cada cópia ganha o seu, todos subindo até o pavimento mais alto
(`pavimentosDoNucleo`), com poço e casa de máquinas em cada um. O kernel modela o núcleo como UMA peça com partida e
chegada (`Nucleo.levelId`/`ateLevelId`) — a PA3 passa a usar assim. Etapas novas no orquestrador
(`utils/predioAutomatico/terreoECobertura.ts`), na ordem Pavimento tipo → **Térreo** → Plantas → **Cobertura** →
**Reservatórios** → Instalações no tipo → Conferência:
- **Térreo** (só com o tipo no 2º pavimento): pavimento próprio `<bloco> · 1º pav (térreo)` (uid determinístico, como o
  tipo), com o esqueleto do tipo colado por `DuplicateEntities` (paredes da montagem e as portas hospedadas — antes das
  plantas, sem o interior das unidades). Cada fatia de unidade vira sala do condomínio, na ordem: a da FRENTE mais perto do
  núcleo = **Hall de entrada e portaria**, depois **Centro de medição**, **Casa de bombas e reservatório inferior**, e as
  demais **Área comum**; com 2 fatias, medição e bombas dividem a segunda. Os demais nomes (circulação, núcleo) repetem os
  do tipo. **Acesso:** porta de `larguraDoAcessoMm` (1.200) na parede externa do hall mais voltada para a rua.
- **Núcleo vertical:** elevadores e shaft do tipo passam a partir do térreo (um núcleo por peça; os do tipo e das cópias
  saem): o ELEVADOR vai até o último andar com unidades (poço embaixo do térreo, casa de máquinas sobre a laje de
  cobertura), o SHAFT até o mais alto (a cobertura). A escada do tipo ganha o lance do térreo (`AddEscada` igual).
- **Cobertura:** pavimento `<bloco> · cobertura` sobre o último andar (pé-direito `peDireitoDaCoberturaMm`, 3.000), laje de
  cobertura no contorno do bloco (base no piso, `espessuraDaLajeMm` 120), platibanda de `alturaDaPlatibandaMm` (1.100) no
  contorno, e o espaço nomeado "Cobertura — área técnica (condensadoras e reservatório superior)". A escada do último
  andar chega nela.
- **Reservatórios** (depois das plantas, que dão a população): `dimensionarReservacao` com as hipóteses padrão da
  reservação (pessoas pelos dormitórios de todos os andares, 200 L/hab·dia, 60 % embaixo) — o **inferior** na casa de
  bombas do térreo, o **superior** sobre o núcleo na cobertura (cota `cotaDoReservatorioSuperiorMm`, 3.000). Volume
  declarado (moldado in loco), `sugerida`; a PA6 liga a água.
- Hipóteses novas: `terreo`, `cobertura` (ligadas) e as medidas acima; tela com as duas marcas e as medidas, resumo com o
  térreo, a cobertura e a reservação; "Lançar os N pavimentos" conta térreo e cobertura.
- Marco do prédio regravado (pavimentos +2, paredes, núcleos): justificado no PR. O teste de equivalência da PA2 passa a
  rodar com `terreo`/`cobertura` desligados.

### PA4 — Estrutura
**O que muda.** Pilares/vigas/lajes no tipo (propagam pela cópia), mesma malha no térreo e na cobertura; fundação com
pendência "pré-dimensionamento, exige cálculo" (a hipótese de carga da casa não serve).
**Pronto quando.** Teste de pilares coincidentes em todos os níveis.

**Execução (14/11/2026).** `utils/predioAutomatico/estrutura.ts`, com os planejadores da casa e as hipóteses padrão das
gavetas: pilares, vigas e lajes no TIPO (vão às cópias pela cópia viva), rodando ANTES das plantas para os pilares
ficarem no esqueleto (perímetro, corredor, divisas, núcleo) e não nas divisórias dos apartamentos; a mesma malha colada
no térreo (`DuplicateEntities` das peças do tipo — pilares em prumada); eixos por último. Vigas e lajes de um pavimento
são o teto dele, então a laje do último andar É a da cobertura — a cobertura da PA3 deixa de lançar a dela quando há
estrutura. Fundações (blocos, estacas, baldrames) sob os pilares do pavimento que assenta no chão, com a pendência
VERIFICAÇÃO "pré-dimensionamento… exige cálculo com a sondagem (NBR 6122)"; sem térreo, ficam para o projetista. O núcleo
e a escada furam as lajes sozinhos (`furosDoNucleo`, `furosDaEscada` do kernel). Hipótese nova `estrutura` (ligada).

### PA5 — Elétrica coletiva (grande; depende da PA1 e PA3)
**O que muda.** QD por unidade no tipo (`centroDeCargas` por unidade), circuitos por quadro, climatização no quadro da
unidade do ambiente (hoje exige um quadro só — `blueprintGeradorClimatizacao.ts` ~260); no térreo QGBT + medição com um
medidor por unidade; quadro de serviço (elevador, bombas, escada, áreas comuns, garagem); prumada no shaft
(`lugarNoShaft`); demanda pela diversidade.
**Pronto quando.** No R8: um QD e um medidor por unidade, `unidadesMedidas = unidadesAtendidas`, `conferirNbr5410` sem
falta; marco grava.

**Execução (14/11/2026) — dividida em PA5a e PA5b.** PA5a (`utils/predioAutomatico/eletrica.ts`): pontos pela norma no
tipo, no térreo e na cobertura (uma luz a cada 20 m² nas salas comuns); um QD por unidade no tipo (no centro de cargas
dela, filho do QGBT, com a unidade), com os circuitos SÓ dos pontos dela (o planejador recebe uma vista do modelo com os
pontos daquela unidade); no térreo, na sala de medição, QGBT trifásico, entrada de serviço, um MEDIDOR por unidade de cada
andar e o do condomínio, e o QS (quadro de serviço) com térreo, cobertura, elevador (circuito trifásico) e bombas de
recalque; um QDS (serviço do andar) no tipo, filho do QS, com as circulações — cada andar copiado com o seu; DR onde a
NBR 5410 pede (QDs, QS, QDS) e DPS no QGBT; a ligação de cada QD pela demanda. Roda antes da marca `copiaInstalacoes`
(uma sincronização no fim). Kernel 0.107.0: `Terminal.unidadeLevelId` (o pavimento da unidade medida — o 501 é a 101 no
5º pavimento); a cópia viva dá ids próprios aos DRs dos quadros copiados. PA5b: climatização no quadro da unidade,
eletrodutos e a prumada no shaft.

### PA6 — Água fria (grande)
**O que muda.** Alimentador → reservatório inferior, recalque, superior, barrilete, prumadas pelo shaft; hidrômetro por
unidade no hall (sincronizado; `Terminal.unidadeId` passa a valer para hidrômetro); pressão (pressurizador em cima, VRP
embaixo); reserva técnica de incêndio.
**Pronto quando.** R12 pede VRP; o volume do reservatório bate com a conta manual no teste.

**Execução (14/11/2026, `utils/predioAutomatico/agua.ts`).** Três etapas novas — LOUÇAS e ÁGUA FRIA antes da marca
`copiaInstalacoes` (como a elétrica: o que se desenha no tipo vai aos andares numa sincronização só) e PRESSÃO DA ÁGUA
depois dela (só então a rede do superior chega a todos os andares). Hipótese `agua` (ligada por padrão; pede as plantas).
- **Louças e pontos no tipo:** o kit de cada ambiente, os pontos de cada louça e os do kit da casa; sem aquecedor
  (chuveiro elétrico — premissa). As pendências do mobiliário saem agrupadas (uma por peça davam dezenas).
- **Rua → inferior:** o alimentador da casa (`planejarAlimentador`), rodado ANTES dos hidrômetros das unidades (ele toma
  o primeiro hidrômetro do desenho como entrada; sem nenhum, propõe o cavalete na frente). Só até o inferior.
- **Recalque:** bomba ao lado do inferior, sucção, e o recalque pelo canto do shaft — um trecho no térreo, um no tipo
  (as cópias repetem) e um na cobertura até o alto do superior. DN por Forchheimer (consumo diário em 6 h), altura
  manométrica pelo desnível + perdas, motor pela série comercial.
- **Barrilete e coluna:** do fundo do superior ao canto do shaft (o centro é da prumada elétrica) e a coluna nele, dois
  trechos por andar. O DN é o do trecho mais carregado (o do último andar leva o prédio inteiro — com a cópia viva todos
  os andares têm o mesmo tubo).
- **Hidrômetro por unidade (kernel 0.108.0: `Terminal.unidadeId` vale no HIDRÔMETRO):** no nicho da parede entre a
  unidade e o hall, longe de vãos e pilares. A rede do andar (a coluna → os hidrômetros) corre no forro pelo EIXO do
  corredor, com uma derivação a cada hidrômetro; no bloco em asas (L, U, T, H), pelo motor da casa só na circulação. O
  hidrômetro é escolhido pela vazão de projeto da maior unidade (≤ ½ Qmáx: perda até 25 kPa).
- **Rede de cada unidade:** o motor da casa (`planejarAgua`) no forro, numa VISTA só com o pavimento tipo, os cômodos e os
  pontos da unidade e nenhum tubo de água — e o trecho que fecha anel sai do lote.
- **Pressão:** `pressoesDaOrigem` do superior no prédio inteiro; ponto abaixo da mínima → pressurizador na saída do
  superior (+100 kPa); estática acima de 400 kPa → VRP no ramal de cada unidade, depois do hidrômetro (no tipo: todos os
  andares levam, e nos de cima, abaixo do ajuste, ela não atua — fica para conferir se o projeto prefere estação
  redutora na coluna).
- **Reserva de incêndio:** pela Tabela 4 da IT 17 do CBMMG (A-2, coluna 1, faixa da área total = bloco × pavimentos),
  como `volumeRtiL` do superior (o volume dele cresce dela). Sem exigência (≤ 750 m² e ≤ 12 m), premissa. O PPCI (PA9)
  confere com a rede de hidrantes.

**Achados no caminho (spike de 14/11):**
1. Com a vista inteira, a origem da unidade já estava ligada (pelo ramal do hidrômetro) à rede do hall, e o motor
   pendurava colunas da unidade direto nela — 4 das 5 unidades do R8 numa componente só, a água passando por fora do
   hidrômetro. Cada rede passou a ser traçada só com o que é dela; o teste confere que, sem os ramais dos hidrômetros,
   cada componente tem os pontos de UMA unidade.
2. "Pelas paredes", os ramais de unidades vizinhas corriam no mesmo eixo da parede comum e se ligavam — no forro (os anéis
   de cada cômodo) não. E as descidas do forro até o hall e até a unidade entravam na parede pelo mesmo ponto do eixo:
   o ramal da unidade sai 400 mm ao lado.
3. No forro o motor só anda pelo anel do cômodo: para chegar ao lado de lá do corredor dava a volta pela ponta (13 m
   para um lado e 18 m de volta) — daí o barrilete do andar pelo eixo do corredor.
4. A 2 m/s (a da casa) o último andar ficava com −89 kPa: o hidrômetro de 3 m³/h perdia 65 kPa e o ramal da unidade, no
   forro, tem dezenas de curvas de contorno. A rede do prédio é dimensionada a 1 m/s e o hidrômetro pela vazão.
5. Desempenho: a coluna de cada grupo de pontos procurava lugar fugindo dos pilares e vãos de TODOS os pavimentos (na casa
   ela atravessa os andares) — 8,7 s no R8; e o ponto de entrada do hall dentro de um pilar fazia a busca varrer a
   parede inteira milímetro a milímetro. Vista só com o tipo e o ramal longe dos pilares: a etapa caiu de 10 s para ~2 s.
6. Na CI o caso RL do marco passou de 300 s (os 4 casos já somavam 355 s na PA5b). A água aplica tudo num lote só (eram
   2 aplicações por unidade e mais 5) e o kernel guarda o uid determinístico de cada semente (o mapa das cópias dos grupos
   "unidades iguais" recalculava por sha256 o uid de cada peça copiada a cada comando) — no RL, água 10,8 → 7,2 s e louças
   4,9 → 2,8 s, com os marcos idênticos. O que sobra é o kernel: as invariantes rodam a cada comando do lote, e o RL tem o
   modelo maior. O tempo-limite do marco por caso foi para 600 s; o tempo do RL no worker fica para a PA10.

**Conferência no app (14/11, `c:/tmp/pwtest/conferencia-predio-pa6.cjs`, estudo descartável arquivado):** R8 — os 20
portões: hipótese "água" ligada por padrão, resultado com os hidrômetros e a pressão, 5 hidrômetros em cada um dos 7
andares, coluna em 7 andares, barrilete, recalque do térreo à cobertura, 2.480 trechos de água, RTI de 12 m³ no superior
(25.440 L = 13.440 + 12.000); Ctrl+Z volta ao bloco sozinho. **Para a PA10:** o clique em "Lançar" levou 53 s para voltar
(aplicar o resultado e redesenhar ~6 mil trechos no mesmo passo, com a máquina carregada).

### PA7 — Esgoto, ventilação e pluvial (grande)
**O que muda.** Tubo de queda e ventilação no shaft por UHC acumulado (NBR 8160), desvio no térreo, subcoletor e CI no
lote, pluvial da cobertura.
**Pronto quando.** Teste do diâmetro do tubo de queda no R12; marco grava.

**Dividida em duas (14/11/2026), como a PA5:** PA7a esgoto e ventilação (com o "pronto quando"); PA7b o pluvial da
cobertura.

**Execução da PA7a (14/11/2026, `utils/predioAutomatico/esgoto.ts`).** Etapa ESGOTO antes da marca `copiaInstalacoes`
(como a água). Hipótese `esgoto` (ligada por padrão; pede a água — as louças vêm com ela).
- **Tubo de queda por grupo molhado:** rente à face da parede da unidade mais perto do vaso (do lado da unidade — as
  unidades espelhadas não se encontram na parede comum), escorregando para fora de vão, pilar e de outro tubo vertical;
  a coluna de ventilação 200 mm ao lado, ao longo da parede.
- **Ramais:** o motor da casa (`planejarEsgoto`) numa VISTA só com o tipo, os cômodos e os pontos da unidade, e como
  "caixas de inspeção" os pontos dos tubos de queda (a −400 mm, no forro do andar de baixo). As verticais no ponto do
  tubo saem; cada chegada vira um nó dele. O tubo que nenhum ramal alcança sai (o motor junta o grupo pela rede).
- **Empilhamento:** o tubo de queda de cada andar vai da junção mais baixa do andar (j, sob o piso) até `pé-direito + j`
  — a junção do andar de cima; partido em cada cota de chegada. A cópia viva empilha.
- **DN (NBR 8160):** tubo de queda pela Tabela 6 (UHC do grupo × os andares, a UHC de um andar; ≥ 100 com bacia); coluna
  de ventilação pela tabela (`dnDaColunaDeVentilacao`); desvio, saída e coletor pela Tabela 7.
- **Ventilação:** primária — o tubo de queda atravessa a laje da cobertura e sobe a 2 m (terraço); a coluna de ventilação
  liga-se a ele embaixo (no forro do térreo, abaixo do ramal mais baixo) e em cima (0,6 m acima da laje). Os ramais de
  ventilação de cada bacia ficam para o projetista (premissa).
- **Térreo:** o desvio suspenso no forro até a fachada da rua (bloco retangular: um coletor pelo eixo do corredor, com uma
  derivação a cada tubo; em asas: em linha reta até a saída), descendo 1 %; na fachada desce até sob o piso, sai para a
  caixa de inspeção a 1 m fora, e o coletor vai até a ligação na rede pública, presumida a 1,5 m de profundidade.

**Achados no caminho:**
1. Com a "caixa" do tubo de queda funda (−3 m), as ligações diretas desciam em rampa até ela, sem a vertical final que
   marcava a junção — e só 84 das 315 louças do R8 chegavam à rede. Com a caixa no forro de baixo e o tubo partido em
   cada chegada, 315 de 315 (R12: 836 de 836) — o teste confere toda louça de todo andar até a ligação.
2. No coletor suspenso do térreo, a derivação chegava ao eixo numa cota e a linha principal passava ali em outra: dois
   nós na mesma posição, rede partida. Toda posição do desvio com mais de uma cota ganha uma vertical.
3. Custo (R12, máquina carregada): a etapa ~5 s (um lote só de ~1.000 comandos — as invariantes rodam a cada um) e a
   conferência +~5 s.
4. **No app, o "Lançar" não salvava** (conferência de 14/11): a tela ficava presa mais de 4 min. O perfil do navegador
   mostrou `conflitosDoModelo` (os choques entre redes, recalculados a cada mudança do modelo) medindo cada trecho contra
   toda estrutura, todo vão e todo outro trecho — no R8 com as peças de climatização, 44,8 s por chamada. Agora por
   GRADE espacial (cubos de 2 m; só mede o que divide célula, e o teste exato é o mesmo): 54 ms, os mesmos 2.141
   conflitos (comparados com a versão anterior; R4 idem). O clique caiu para 68 s e o rascunho (3,5 MB) salva em 2 s.
   **Para a PA10:** o resto do clique é trabalho da tela que já existia — a NBR 5410 da elétrica (~28 s no perfil), as
   marcas de verificação das redes (~22 s) e o desenho do canvas (~18 s).

**Execução da PA7b (14/11/2026, `utils/predioAutomatico/pluvial.ts`).** Etapa PLUVIAL antes da marca (hipótese
`pluvial`, ligada; pede a cobertura). A cobertura é laje plana com platibanda: RALOS por dentro da platibanda junto dos
cantos (passando deles, no meio dos lados mais longos); de cada um, o CONDUTOR VERTICAL pela face externa da fachada — um
trecho por andar no tipo, da passagem sob a laje deste andar à do de cima (a cópia viva empilha, como o tubo de queda);
no térreo desce até enterrado, CAIXA DE AREIA ao pé, e o CONDUTOR HORIZONTAL até a SAÍDA na frente do lote (todos chegam
nela na mesma cota — a do mais longo com a declividade da premissa). NBR 10844: Q = I·A/60 com a área do bloco; a
intensidade das premissas pluviais do estudo (o editor passa as mesmas da gaveta do pluvial); sem cidade nem intensidade,
150 mm/h com a pendência (a norma só permite adotá-la até 100 m²); o número de condutores pela capacidade do DN 100, no
mínimo 2; o DN de cada um pela vazão dele. Testes: a vazão e o número de condutores à mão (R8: 480 m² → 1.200 L/min → 2
condutores), cada ralo chega à saída passando por todos os andares, e 400 mm/h nas premissas pedem mais condutores (R4).
Marco: R4 2 condutores, R8 2, R12 3, RL 5 — todos DN 100. **Conferência no app (14/11,
`c:/tmp/pwtest/conferencia-predio-pa7b.cjs`, estudo descartável arquivado):** R8 — 2 ralos, o condutor nos 7 andares, 2
caixas de areia e a saída, e tudo o que a PA6/PA7a conferiam; o "Lançar" salva em 2 s (o clique, ~66 s — PA10). O único
"erro" foi a leitura das preferências abortada com a página presa no clique. ⚠️ Vite ligado desde antes da troca de ramo:
o `import()` do roteiro pega OUTRA instância do store (os módulos voltam do HMR com carimbo) — sem organização, a RLS
recusa criar o estudo. Reiniciar o Vite.

**Conferência no app (14/11, `c:/tmp/pwtest/conferencia-predio-pa7a.cjs`, estudo descartável arquivado):** R8 — os 22
portões: hipótese "esgoto" ligada por padrão, o resultado com os tubos de queda, 5 tubos de queda em cada um dos 7
andares, os 5 subindo a 2 m da cobertura, 55 trechos de ventilação, 899 de esgoto, uma caixa de inspeção e uma ligação;
o que a PA6 conferia (hidrômetros, coluna, RTI) segue igual; Ctrl+Z volta ao bloco sozinho.

### PA8 — Garagem e subsolo
**O que muda.** `lancarGaragem` ampliado: rampa, pilares da malha da torre, iluminação/exaustão no quadro de serviço,
drenagem + caixa separadora, bombas quando abaixo da rede; subsolos de R8 (1) e R12 (2) no marco.
**Pronto quando.** No R8 nenhum pilar sobre vaga ou rampa.

**Dividida em três (15/11/2026), como a PA7 e a PA9:** **PA8a** — o subsolo como arquitetura e estrutura (pavimentos,
núcleo descendo, malha, rampa, laje e vagas; é onde mora o "pronto quando"); **PA8b** — a SEGUNDA SAÍDA da garagem
(pedida pelo usuário em 15/11, depois da PA8a: "Sim" a lançar a escada de emergência que a rota acusava) e a elétrica
dela (iluminação e exaustão num quadro da garagem, filho do quadro de serviço); **PA8c** — a drenagem com a caixa
separadora, o poço e as bombas quando o piso fica abaixo da rede (pede tipos novos de ponto no kernel).

**Execução da PA8a (15/11/2026, `lancarSubsolos` em `utils/predioAutomatico/garagem.ts`).** O subsolo do estudo é o
bloco de GARAGEM abaixo do solo que contém a torre — o que o gerador de massa já põe no retângulo do lote
(`SUBSOLO_1`/`SUBSOLO_2`); sem ele, a etapa SUBSOLOS não roda. Ela entra depois da ESTRUTURA (a malha do térreo desce) e
antes das FUNDAÇÕES, que passam a assentar no subsolo mais fundo. Os pavimentos têm os uids do "Lançar vagas" do painel do
bloco (`uidDoPisoDaGaragem`, os nomes de `nomeDoPiso`): um não lança por cima do outro — com as vagas já lançadas pelo
painel, a etapa para com a pendência. Em cada subsolo: as paredes de contenção no contorno; o NÚCLEO descendo (elevador e
shaft passam a partir do mais fundo; a escada sobe lance a lance, a do 1º ao térreo da torre — explícito, porque o desenho
tem outro pavimento na cota 0, o de referência da massa); o HALL do núcleo do térreo fechado igual, com a porta no mesmo
lugar; os PILARES da torre em prumada e, fora da projeção dela, os eixos dela estendidos ao contorno com vão de até 7,5 m
(hipótese) — sem vigas: o teto da garagem é laje lisa (poupa altura e deixa a rampa passar sem cortar viga); a LAJE de
cada subsolo no contorno, em pedaços retangulares em volta do vão da rampa que sai dele (a laje não tem furo); a RAMPA de
veículos de mão única (3 m, até 20 % — hipóteses) junto à frente, fugindo dos pilares da torre, do núcleo e da escada: a
de entrada desce da calçada (a parede da frente) para dentro; com dois subsolos, a de baixo vai em VAIVÉM, afastada da
frente por um patamar de 5,5 m onde o carro vira. Na ponta de cada rampa que encosta num piso fica uma área de CHEGADA de
5 m sem vaga nem pilar estendido. As VAGAS pelo lançador da E2.5, que já contorna paredes, pilares, núcleo e escadas — a
rampa que chega de baixo fura o piso e a chegada é livre, então as duas entram na vista dele como rampas de mentira. A
conferência do "pronto" roda no fim da etapa (pilar sobre vaga ou rampa vira pendência). **Achados no caminho:** (1) o
hall pegava o ambiente da garagem — o ponto da escada cai no FURO dela, e `pointInPolygon` no anel dizia que sim; (2) a
1ª versão deixava a vaga S1-1 colada na saída de baixo da rampa e, no vaivém, a rampa de baixo terminava contra a parede
da frente — vieram a chegada e o patamar; (3) no R12 as duas faixas coladas não cabem nos 20 m de frente com patamar e
chegada: a de baixo é procurada sozinha, o mais perto da de entrada, e cai entre os pilares da torre (a pendência diz);
(4) as vigas da torre copiadas no subsolo viravam obstáculo para as vagas (o lançador só ignora laje) — saíram;
(5) a área da reserva técnica de incêndio (PA6) passou a contar os subsolos, como o PPCI já contava. **A garagem pede
uma segunda saída:** no R8 (40 × 60 m, uma escada no núcleo) o fundo fica a 45 m da escada (limite 35 m) — a pendência
da rota diz que a garagem pede uma escada de emergência longe da primeira; o marco exige a rota limpa só nos andares da
torre. **Desempenho:** o lançador de extintores testava ~100 mil segmentos na garagem (cada um amostrado a cada 25 cm em
`visivel`) — 22 s de 36 s da etapa no R12. `visivel` ganhou um atalho EXATO: as amostras ficam todas entre a 1ª e a
última; no ambiente convexo, com essas duas a mais de 1 mm da borda e o trecho a mais de 1 mm de cada furo, toda amostra
cai dentro (a distância à borda é côncava por dentro) — a mesma resposta sem amostrar; e o caminho pelos vértices fica
guardado por ambiente e pontas. Extintores 22 s → 2,9 s; o R12 completo com 2 subsolos em ~46 s, o mesmo de antes da
garagem. Hash do R8 e do R12 completos idêntico antes e depois da otimização; marco da casa idêntico. **Marco
regravado:** R4 e RL com o modelo idêntico (só os campos novos `garagem`, `vagas`, `pilaresSobreVagaOuRampa`); R8 e R12 com
os subsolos — e a reserva técnica de incêndio sobe (R8 12 → 16 m³, R12 16 → 20 m³) porque a área passa a contar a
garagem, com o que dela decorre (1 trecho de água a mais no R8; 0,4 m de altura manométrica no R12). **Conferência no app
(15/11, `c:/tmp/pwtest/conferencia-predio-pa8a.cjs`, estudo descartável arquivado):** R8 com o bloco de subsolo — a
hipótese da garagem ligada, "Garagem 60 vaga(s) · 1 subsolo · 1 rampa" no resultado, o subsolo primeiro na prévia;
"Lançar os 10 pavimentos" (14,5 s); no salvo: elevador e shaft partindo do 1º subsolo, 100 pilares e 100 blocos de
fundação nele (o térreo sem bloco), 2 pedaços de laje, a rampa veicular da calçada, 60 vagas e nenhum pilar sobre vaga
ou rampa, Garagem e Hall nomeados, a escada subindo ao térreo da torre; tudo o que as fases anteriores conferiam segue
igual (a RTI conferida passou a 16 m³); Ctrl+Z volta ao bloco sozinho.

**Execução da PA8b (15/11/2026, `utils/predioAutomatico/garagem.ts` e `eletrica.ts`).** **As saídas de emergência:**
fora do pavimento de descarga, a rota mede o caminhamento até a boca de uma escada (IT 08, 5.5.2.1), pelos pontos que ela
toma como o pior de cada ambiente (os cantos recuados e o centro); com mais de uma escada no pavimento, a Tabela 5 dá
35 m (tipo X, o mais restritivo; sem chuveiros nem detecção — `CAMINHAMENTO_NA_GARAGEM_M`). As escadas de emergência
entram uma a uma, encostadas no contorno, fora da projeção da torre e longe das rampas e das chegadas, onde o ponto mais
longe mais melhora (a conta: por dentro da garagem até a porta do hall mais perto e dali à boca, ou reto até a porta da
caixa), até todos ficarem a 33 m (2 m de folga) — no máximo 3; garagem pequena que já atende não ganha escada. Cada uma
é uma pilha de lances (subsolo → de cima; o 1º → térreo da torre), com a caixa fechada em cada subsolo (a porta no
patamar de baixo) e no TÉRREO (as quatro paredes, a porta para o jardim) — a rota chega ao exterior por ela. O hall do
núcleo no subsolo ganha a PORTA DA FRENTE, junto ao pé da escada: a única era a copiada do térreo (para o corredor, no
fundo) e os cantos da frente contornavam o hall (40,7 m no R8). Resultado: R8 com 1 escada (no meio da parede do fundo),
pior caminhamento 30,7 m; R12 com 2 (fundo e frente), 34,9 m — a rota limpa em todos os andares do R8, subsolo
inclusive. A pendência "sem solução" da conta foi descartada: a estimativa (35,1 m no R12) é conservadora, e quem acusa é a
conferência de incêndio, pela rota de verdade. **A elétrica:** pontos pela norma em cada subsolo (uma luz a cada 20 m²,
como as salas comuns), os EXAUSTORES na parede do fundo — a oposta à frente, por onde a rampa traz o ar —, pela
renovação (6 trocas/h, 10.000 m³/h e 1,1 kW cada: hipóteses nomeadas), fugindo das caixas de escada e dos pilares, e um
QDG por subsolo (filho do QS) do lado de fora da porta da frente do hall, com os circuitos da garagem; a seção de cada
circuito pela queda de tensão (6.2.7 — os de iluminação de 40 m passavam de 4 % com 1,5 mm²). R8: 128 luzes e 5
exaustores no QDG. A caixa da escada no térreo fica no jardim, fora do prédio: sai da vista dos hidrantes (sem isso, o
térreo ganhava um hidrante dentro de cada caixa). **Desempenho:** a caixa da escada encostada no contorno deixa o anel da garagem não
convexo e o atalho exato da `visivel` não valia — o R12 levou 169 s. O atalho passou a valer em qualquer anel: com a 1ª
amostra a mais de 1 mm da borda e o trecho entre a 1ª e a última a mais de 1 mm de toda aresta (sem cruzá-la), o trecho
todo fica dentro — o mesmo resultado (hash igual), 17 s.
Marco regravado: R4 e RL idênticos; R8 e R12 com as escadas de emergência (1 e 2), as luzes (128 e 310) e os exaustores
(5 e 12), uma vaga a menos por subsolo onde a caixa entrou, e a rota limpa em todos os subsolos — o R8 volta a exigir a
rota limpa em TODOS os andares. Marco da casa idêntico. **Conferência no app (15/11,
`c:/tmp/pwtest/conferencia-predio-pa8b.cjs`, estudo descartável arquivado):** R8 — "Garagem 59 vaga(s) · 1 subsolo · 1
rampa · 1 escada de emergência · 5 exaustores" no resultado; a aba PPCI com rota em todos os 10 andares e nenhum acima
do limite; no salvo, a escada de emergência subindo ao térreo da torre, a caixa dela no térreo, o QDG filho do QS, 5
exaustores e 128 luzes em circuito; tudo o que a PA8a e as fases anteriores conferiam segue igual; Ctrl+Z volta ao bloco.

**Execução da PA8c (15/11/2026, `utils/predioAutomatico/drenagem.ts`, kernel 0.109.0).** **Kernel:** o ponto de esgoto
aceita `CAIXA_SEPARADORA` (separadora de água e óleo, cota do TUBO como o tanque séptico) e `POCO_DE_RECALQUE` (cota do
FUNDO) — ficha, conexões, IFC (IFCINTERCEPTOR .OIL. e IFCDISTRIBUTIONCHAMBERELEMENT .SUMP.), quantitativo ("Caixa"),
símbolo e as listas de passagem do esgoto e do pluvial. Provado antes do bump: com a string em 0.108.0, os goldens, os
dois marcos e os testes de hidráulica, IFC e quantitativos passaram (22 arquivos, 209 testes); depois, as seis falhas
dos goldens foram todas de hash; o bundle da planta-api regerado. **A área técnica** (PA8a/`garagem.ts`): no subsolo mais
fundo, 3,2 × 2,0 m encostada no contorno, o mais perto do pé da rampa que chega a ele, livre de pilar, hall, escadas e
rampas — reservada antes dos pilares estendidos e das vagas, que fogem dela. **A etapa DRENAGEM_DA_GARAGEM** (depois do
esgoto e da elétrica, antes dos equipamentos de incêndio — o circuito das bombas pega os pontos soltos do subsolo, e a
alimentação das luminárias de emergência fica fora de circuito, como em todo andar): em cada subsolo, RALOS (um a cada
400 m², no ponto livre de vaga, pilar, escada e rampa mais perto do centro de cada célula de uma grade) e a CANALETA no
pé de cada rampa, numa rede em PENTE — um coletor na linha da chegada e um ramal reto de cada coluna de ralos, cada ralo
descendo do piso à cota do seu nó, caimento de 1 % para o destino (a 1ª versão ligava cada ralo em diagonal à
separadora, 40 m cruzando a garagem); os de cima descem por uma prumada sobre a separadora; no mais fundo, a CAIXA
SEPARADORA e — com o fundo do poço abaixo da rede pública (a profundidade presumida do esgoto, 1,5 m) — o POÇO DE
RECALQUE com 2 BOMBAS submersíveis de 1,1 kW (uma reserva; hipótese) no QDG, e o RECALQUE DN 50 subindo pelos subsolos e,
no térreo, em L até a caixa de inspeção do esgoto (reto, cortaria por baixo da torre). Acima da rede, a separadora fica
em pendência para a ligação por gravidade. R8: 6 ralos e 1 canaleta; R12: 18 ralos e 2 canaletas; os dois com poço,
bombas e recalque.
Marco do prédio regravado: R4 e RL só o hash (a string do kernel); R8 e R12 com a drenagem (+21 e +58 trechos de esgoto),
o R12 com uma vaga e um pilar estendido a menos (a área técnica). Marco da casa: só o `resultado` dos 8 casos (a string),
como no bump da PA6. **Conferência no app (15/11, `c:/tmp/pwtest/conferencia-predio-pa8c.cjs`, estudo descartável
arquivado):** R8 — "6 ralo(s), poço com 2 bombas" no resultado; no salvo, 6 ralos, a canaleta, a separadora, o poço, as 2
bombas em circuito e o recalque em 3 trechos; tudo o que a PA8a/b e as fases anteriores conferiam segue igual; Ctrl+Z
volta ao bloco. (No meio da verificação o disco C: encheu — 144 perfis temporários do Chrome de 11 a 14/11 apagados com o
aval do usuário, 15 GB.)

### PA9 — PPCI
**O que muda.** `gerarPpci` no modelo final, casa de bombas e hidrantes conciliados com o reservatório; aba PPCI.
**Pronto quando.** R8 classificado A-2 com rota em todos os andares.

**Dividida em três (14/11/2026), a pedido de iniciar a PA9 antes da PA8 (garagem):** o gerador de PPCI da planta
(`gerarPpci`) recusa no prédio — põe peças em todo pavimento e edita portas (a barra antipânico), e as cópias vivas
recusam instalação e arquitetura próprias; e os ids que ele prevê só batem se nada mais numerar no meio.
- **PA9a (esta):** a classificação, as exigências e a ROTA DE FUGA de todos os andares, no modelo final — o "pronto quando".
- **PA9b:** os equipamentos de cada andar no tipo (extintores, sinalização, iluminação de emergência, alarme).
- **PA9c:** os hidrantes, a rede e a casa de bombas conciliados com o reservatório (a RTI já está no superior — PA6).
Quando a PA8 entrar (garagem, subsolos), a classificação e a rota passam a contá-los.

**Execução da PA9a (`utils/predioAutomatico/ppci.ts`).** Etapa INCÊNDIO depois da marca (só confere, `CALCULOU`):
`classificarEdificacao` com as premissas de incêndio do estudo (o editor passa as mesmas da tarefa de incêndio), a divisão
delas ou A-2, o piso de descarga = o térreo do prédio e a ALTURA declarada = o piso do último andar com unidades (sem ela,
a classificação tomava a cobertura técnica: 24 m no R8 em vez de 21); `exigenciasDaEdificacao`; e `percursoDeFuga` de
todos os ambientes, resumido por andar (ambientes, sem rota, acima do limite, a pior distância) — ambiente sem rota ou
acima do limite vira VERIFICAÇÃO com o local. Aba PPCI na tela (ocupação, altura, área, medidas exigidas, a rota por andar).

**Achado: a escada parava no 3º andar.** A escada do tipo nasce sem `ateLevelId` — vai só ao pavimento de cima: no R8,
do 4º ao 8º andar e a cobertura não tinham escada, e a rota de 241 ambientes não chegava à saída. A montagem do pavimento
tipo (a do prédio automático e a do botão do painel do bloco) leva agora a escada até a última cópia, e com a cobertura
até ela (a PA3 dizia que ela chegava lá). Com isso, todo ambiente de todo andar tem caminho até a saída no R8, no R4 e
no R12 (no RL, 1 por andar fica sem caminho — asas).

**Marco (14/11):** R4 A-2 9 m · R8 A-2 21 m · R12 A-2 33 m · RL A-2 21 m. **O R8 sai limpo** (nenhum ambiente sem rota nem
acima do limite — o "pronto quando"; o marco o exige). Os outros ficam gravados como estão, com estes achados para a PA10:
- **Caminhamento até a escada nos andares de cima:** a rota (`percursoDeFuga`) põe a boca do lance multiandares no início
  dele só no pavimento de partida; nos de cima, na outra ponta — numa escada reta, uns 4 m adiante. No R4 o 3º andar passa
  do limite de 25 m em 2 ambientes e o tipo, igual a ele, não. A escada real tem patamar no mesmo lugar em cada andar.
- **Térreo comprido** (R12, RL): salas comuns a mais de 25 m da porta de entrada — o térreo pede outra saída.
- **RL (asas):** um ambiente por andar sem caminho até a escada.

**Desempenho (CI):** o RL do marco passou de 600 s na CI com a rota de fuga — `caminhoDentro` (o caminho por dentro do
ambiente) refazia o grafo de visibilidade inteiro para cada par de portas; na circulação de um prédio, 15 dos 16 s da rota
de 891 ambientes. A visibilidade entre vértices do contorno passou a ser guardada por ambiente: 3,9 s, o mesmo resultado
(o marco, que grava a rota de cada andar dos quatro prédios, passa sem regravar).

**Conferência no app (14/11, `c:/tmp/pwtest/conferencia-predio-pa9a.cjs`, estudo descartável arquivado):** R8 — a aba
PPCI com A-2, 21 m, 4.375 m², 8 medidas exigidas e a rota em 9 pavimentos (nenhum com ambiente sem rota); depois do
Lançar, a escada do tipo chega à cobertura; tudo o que as PA3–PA7 conferiam segue igual; Ctrl+Z volta ao bloco sozinho.

**Execução da PA9b (15/11/2026, `lancarEquipamentosDeIncendio` em `utils/predioAutomatico/ppci.ts`).** Etapa
EQUIPAMENTOS DE INCÊNDIO antes da marca: extintores (com placa), sinalização da rota, iluminação de emergência (até 3
passadas) e, quando exigidos, os dispositivos do alarme — pelos MESMOS motores e na mesma ordem do PPCI da planta, numa
VISTA SEM OS ANDARES COPIADOS (`vistaSemAsCopias`); o tipo recebe e a cópia viva leva aos andares. Cada lote é aplicado na
vista e no modelo real, e os ids criados têm de bater (senão para — as peças seguintes apontariam para outras). R8: 1
extintor, 4 placas e 4 luminárias de emergência na circulação de cada andar; o térreo e a cobertura com os seus.
**Achados:** (1) a vista sem as cópias deixava o elevador chegando a um andar que não existe nela e o medidor do térreo
medindo a unidade de um andar inexistente — todo `...LevelId`/`levelUid` que aponta para uma cópia passa a apontar para o
tipo na vista; (2) os motores punham extintor na varanda e placa no dormitório — em habitação (grupo A) a rota conta da
porta da unidade (IT 08, 5.5.2.2), e na vista ficam só as áreas comuns. Teste: no prédio pronto, toda área comum de todo
andar com extintor ao alcance e a rota iluminada. Ficam para o projetista (pendência): o eletroduto do laço do alarme e a
barra antipânico (ela edita as portas). **CI:** os 4 casos do marco somavam 873 s na última CI verde (o RL perto dos 600 s por caso); com a
etapa nova o limite por caso foi a 20 min — baixar o custo do RL (as invariantes a cada comando, a conferência da NBR 5410)
é da PA10. **Conferência no app (15/11, `c:/tmp/pwtest/conferencia-predio-pa9b.cjs`, estudo descartável
arquivado):** R8 — a lista dos equipamentos na aba PPCI; depois do Lançar, 1 extintor, 4 placas e 4 luminárias em cada um
dos 7 andares; tudo o que as PA3–PA9a conferiam segue igual. Com a máquina sem carga, o clique no Lançar levou 13 s.

**Execução da PA9c (15/11/2026, `lancarHidrantesDoPredio` em `utils/predioAutomatico/ppci.ts`).** Etapa HIDRANTES antes
da marca, só quando a classificação exige. Os hidrantes pelo motor da planta (`proporHidrantes` — a mangueira esticada
de porta em porta), na vista sem as cópias e COM os cômodos das unidades (a mangueira tem de alcançar dentro delas), com o
abrigo e a placa (`kitDaPeca`): no R8, 1 hidrante na circulação de cada andar, 1 no hall do térreo e 1 na área técnica da
cobertura, nenhum ambiente descoberto. A REDE não é a do motor da planta (ele traça a coluna inteira de uma vez, do
pavimento da bomba ao último hidrante — recusado nos andares copiados): a COLUNA DE INCÊNDIO fica 30 cm ao lado do
hidrante do tipo (o mais perto da escada), um trecho por andar de −400 a 2600 mm (a base é o 2600 do andar de baixo — a
cópia viva empilha, como o tubo de queda), com o ramal no forro até o hidrante de cada pavimento. A FONTE é a reserva
técnica no reservatório superior (a parcela da caixa de água fria — PA6) com a BOMBA de incêndio na cobertura, ao lado
dele (sucção afogada do fundo; a jockey ligada à principal, 2 pressostatos e o manômetro): a gravidade não dá a pressão
dos andares de cima, e o `proporFonte` da planta poria a bomba no térreo, longe da reserva. O REGISTRO DE RECALQUE no
passeio pelo motor da planta (`proporRecalque`), ligado à coluna no térreo. Teste: todo hidrante de todo andar ligado
pela rede de incêndio à bomba e ao registro de recalque. Fica para o cálculo do PPCI da planta: o DN da rede e a curva da
bomba (premissa: DN 65). Marco: R4/R8/R12 com 1 hidrante por pavimento, RL com 2; todos com bomba e recalque. **Conferência no
app (15/11, `c:/tmp/pwtest/conferencia-predio-pa9c.cjs`, estudo descartável arquivado):** R8 — a aba PPCI com os
hidrantes; depois do Lançar, 1 hidrante em cada um dos 7 andares, a bomba na cobertura, o registro de recalque e a coluna
em 8 trechos (os 7 andares e a cobertura); 5 placas por andar (a do abrigo entrou); tudo o que as fases anteriores
conferiam segue igual.

### PA10 — Fechamento
**O que muda.** Relatório consolidado, furos no shaft, conflitos multinível, envio ao Empreendimento
(`services/sync/massaAdapter.ts`) conferido, tempo do R12 no worker medido e fixado aqui.
**Pronto quando.** R12 completo de ponta a ponta no app dentro do tempo fixado.

**Dividida em três (15/11/2026), como as outras:** **PA10a** — desempenho e o tempo do R12 fixado (o "pronto quando";
é também o que pesa na CI); **PA10b** — relatório consolidado, furos no shaft e conflitos multinível; **PA10c** — o envio
ao Empreendimento conferido e os achados da rota de fuga deixados pela PA9a (ver "Pendências em aberto").

**Execução da PA10a (15/11/2026, em curso).** Perfil de CPU do R12 completo (2 subsolos, 5.390 comandos), e só cortes que
dão o MESMO resultado — o marco (o hash do modelo dos quatro prédios) e o da casa passam sem regravar:
1. **Invariantes do kernel** (`assertModelInvariants`, que roda a cada COMANDO — de propósito, ver `aplicarSemHash`): a
   conferência "o pavimento existe" percorria a lista de pavimentos a cada peça (25 lugares); um conjunto montado uma vez
   por chamada — 31,7 → 8,2 ms por chamada no R8 final.
2. **`aplicarLote`** (kernel): o `applyBatch` sem o hash do fim. O orquestrador encadeia milhares de lotes e só quer o
   modelo; o hash do resultado sai uma vez. O `applyBatch` de todo o resto continua igual.
3. **Rota de fuga:** a visibilidade de um ponto a cada vértice do ambiente guardada por ambiente (o extintor mede o mesmo
   ponto contra centenas de candidatas).
4. **NBR 5410:** o pré-dimensionamento dos quadros guardado DURANTE a conferência (`comPreDimensionamentoGuardado` — a
   5.1.3.2.2, a regra do quadro e a entrada refaziam a mesma conta: 7,6 s no R12); fora dela nada muda. Vale também para
   a conferência da tela.

Medido INTERCALADO (a máquina é compartilhada), o mesmo hash nas quatro rodadas: R12 completo **63,6 → 43,1 s** (−32 %);
elétrica 9,9 → 6,9 s, equipamentos de incêndio 16,9 → 10,3 s, conferência 12,9 → 7,0 s. **Achado no app:** o R12 de
ponta a ponta "travava" no Lançar — não era desempenho (o perfil mostrou a página ociosa): o botão estava desligado com
"o produto ou as hipóteses mudaram depois da prévia". O catálogo de evaporadoras e as premissas do estudo chegam depois
que a tela abre; gerar antes deles dava uma prévia que nascia VELHA (o resultado acusava "0 split(s) por andar"). O
"Gerar" passou a ficar desligado, com o motivo, enquanto a entrada carrega. **R12 de ponta a ponta no app** (Vite de
desenvolvimento, `c:/tmp/pwtest/conferencia-predio-pa10a.cjs`, estudo descartável arquivado): gerar 57 s · clique no
Lançar 61 s · salvar o rascunho 9 s · Ctrl+Z 1,5 s; salvo com 16 pavimentos, 2 subsolos, 174 vagas, 21,6 mil trechos,
9,5 mil pontos, 103 quadros. **Tempo fixado (proposta):** no app de desenvolvimento, o R12 completo gera em até 90 s, o
clique no Lançar volta em até 90 s e o rascunho salva em até 30 s. Falta: o perfil do clique no Lançar (o trabalho da
tela depois do resultado) e o PR.

PA1 e PA2 podem correr em frentes paralelas.

## Pendências em aberto (15/11/2026)

O que o prédio automático ainda não faz, ou faz e deixa para conferir. "Projetista" = fica de propósito como pendência na
tela (o motor não decide); "fase" = trabalho previsto.

| Área | Pendência | Onde fica |
|---|---|---|
| Desempenho | Clique no "Lançar" do R12: 61 s (trabalho da tela: NBR 5410, marcas de verificação das redes, canvas) | PA10a |
| Desempenho | Gerar o R12 no worker: 57 s no app de desenvolvimento | PA10a (tempo fixado) |
| Desempenho | Marco do RL perto do limite da CI (20 min por caso); o bloco "o motor (PA2)" subiu para 180 s depois de deixar a main vermelha (15/11) | PA10a |
| Fechamento | Relatório consolidado do prédio (o de hoje é a lista de pendências por etapa) | PA10b |
| Fechamento | Furos no shaft por onde passam as prumadas (previsto no plano; a medir na PA10b) | PA10b |
| Fechamento | Conflitos multinível — choques entre redes de pavimentos diferentes (previsto no plano; a medir na PA10b) | PA10b |
| Fechamento | Envio ao Empreendimento (`massaAdapter`) conferido com o prédio lançado | PA10c |
| Rota de fuga | Nos andares de cima, a boca do lance multiandares fica na outra ponta da escada (R4: 2 ambientes do 3º andar passam de 25 m) | PA10c |
| Rota de fuga | Térreo comprido (R12, RL): salas comuns a mais de 25 m da porta — pede outra saída | PA10c |
| Rota de fuga | RL (bloco em L): um ambiente por andar sem caminho até a escada (as asas) | PA10c |
| PPCI | DN da rede de hidrantes e curva da bomba (premissa DN 65) — o cálculo hidráulico do PPCI da planta | projetista |
| PPCI | Eletroduto do laço do alarme; barra antipânico nas portas da rota | projetista |
| Garagem | Rampa de mão única e as curvas de concordância; mão dupla pelo número de vagas — o código de obras | projetista |
| Garagem | Laje sobre o subsolo e os pilares da malha estendida (vão de até 7,5 m) — pré-dimensionamento, exige cálculo | projetista |
| Garagem | Subsolo de contorno não retangular: rampa e laje à mão; piso acima da rede: a separadora por gravidade à mão | projetista |
| Elétrica | Entrada em média tensão quando a demanda passa do padrão de baixa tensão (R8: 298 kVA) | projetista |
| Elétrica | Eletrodutos do quadro de serviço e dos QDGs (térreo, cobertura, elevador, garagem) | projetista |
| Água e esgoto | Cota da rede pública presumida (1,5 m); caixa sifonada/de gordura não lançadas (ligado direto ao tubo de queda) | projetista |
| Fundações | Pré-dimensionamento pelas hipóteses da gaveta — exige sondagem e cálculo (NBR 6122) | projetista |
| Plantas | Cômodos sem fachada em unidades rasas e largas (o gerador é o da casa) | projetista |

## Riscos

- Perda de dados na cópia viva → opt-in + recusa com a lista do que seria apagado.
- Desempenho do sync (20 andares × ~2 mil peças a cada comando) → ressincronizar instalações só quando o diff tocar o
  tipo ou um `Level`; benchmark.
- Quantitativo contando em dobro se já multiplica o tipo pelas cópias → teste na PA1.
- Hipóteses de casa vazando → cada uma vira parâmetro com o padrão de casa; o marco da casa protege.
- Lote grande para `conferirPlano` → medir; conferir por etapa se passar do limite.

## Estado

| Fase | Situação |
|---|---|
| PA0 | feito — marco com R4 (4 pav · 2 un/andar · 72 paredes), R8 (8 · 5 · 357), R12 (12 · 8 · 891), RL em L (8 · 13 · 910); grava em ~4 s e repete idêntico; tsc limpo. As unidades por andar saem do produto médio na largura de cada bloco (o plano previa 2/2/4 — fica a variedade medida) |
| PA1 | feito — `Level.copiaInstalacoes?` (0.106.0): quadros, terminais, trechos e componentes do tipo vão para as cópias com uid determinístico, circuitos pelo mapa quadro do tipo → quadro da cópia, e os vínculos (`circuitoId(s)`, `quadroId`, `quadroPaiId`, `drs`, `alvoId`, `condensadoraId`, `centralAlarmeId`, `bombaPrincipalId`, `paiUid`) remapeados; pai fora do tipo (QGBT do térreo) fica. `unidadesAtendidas` conta a unidade de cada andar (`unidadeNoPavimento`: 101 no tipo, 201/301 nas cópias). Testes em `__tests__/blueprintCopiaDeInstalacoes.test.ts`. **Desvios do plano:** (1) em vez do comando `SetCopiaInstalacoes`, é uma opção do `SetLevelProps` (mesmo lugar onde o vínculo `tipoDeId` já é feito); (2) a recusa de editar instalação da cópia varre os campos do comando (como `recusarEdicaoEmPavimentoVinculado`), não o diff; (3) `Terminal.unidadeLevelUid` fica para a PA5, que é quem cria o medidor por unidade no térreo; (4) o dirty-check foi feito: as instalações só ressincronizam quando o comando é de pavimento ou o diff toca instalação do tipo. **Benchmark:** no R4 com instalação, `AddWall` no térreo leva ~40 ms com a flag × ~36 ms sem; mover um ponto do tipo, ~79 ms (teste fixa < 1.500 ms). Prova do bump: com a string em 0.105.0, goldens, os dois marcos e 1.073 testes passaram; depois, só hashes mudaram (marcos regravados: casa `resultado` ×8, prédio `modelo` ×4, nenhuma contagem). **Conferência no app (12/11, `c:/tmp/pwtest/conferencia-predio-pa1.cjs`, estudo descartável arquivado):** térreo + tipo + 2 cópias com QGBT no térreo e QD/circuito/tomada/trecho no tipo — as cópias mostram a instalação do tipo; Ctrl+A e Shift+→ no tipo levaram tomada e QD das duas cópias juntos (+2.000 mm) e o QGBT ficou; Ctrl+Z voltou os três andares. A faixa azul da cópia dizia "Instalações … são próprias" — passou a dizer que as instalações também vêm do tipo quando ele as copia |
| PA2 | feito — motor em `utils/predioAutomatico/` (etapas Pavimento tipo · Plantas · Instalações no tipo · Conferência), worker, `usePredioAutomatico`, `TelaPredioAutomatico` (Programa · Hipóteses · Resultado · Relatório), botão "Prédio automático" no painel do bloco, "· cópia do tipo" no seletor da prévia. O lote dá exatamente o desenho dos dois botões de antes + a marca do tipo (`__tests__/predioAutomatico.test.ts`); marco do prédio regravado pelo orquestrador — só os 4 hashes de `modelo` mudaram, e sem a marca o R4 tem o hash antigo (provado). **Conferência no app (13/11, `c:/tmp/pwtest/conferencia-predio-pa2.cjs`, estudo descartável arquivado):** R4 com o produto médio — painel do bloco → Prédio automático → prévia (6 unidades, 2 por andar × 3, tipo + 2 cópias seladas) → Lançar os 3 pavimentos (226 elementos, um lote) → rascunho com 2 cópias e a marca → "Gerar de novo" desligado (tipo já montado) → Ctrl+Z volta ao bloco sozinho. Desvio: `instalacoes(..., opcoes?)` da casa vai para a PA5 |
| PA3 | feito — `utils/predioAutomatico/terreoECobertura.ts`: térreo próprio do bloco (esqueleto do tipo, salas do condomínio, porta de entrada no TRECHO de fachada do hall voltado para a rua), núcleo único desde o térreo (elevador até o último andar com unidades, shaft até a cobertura; os do tipo saem), lance da escada no térreo, cobertura (laje, platibanda pelas paredes de fachada do tipo, área técnica nomeada) e reservatórios pela população de todos os andares (60 % inferior na casa de bombas, o resto superior sobre o núcleo). Hipóteses novas na tela; seletor da prévia pela cota. Marco regravado: pavimentos +2, paredes +11/+14/+17/+27 (R4/R8/R12/RL), contagens de núcleo iguais (as cópias nunca tiveram núcleo próprio). **Achados no caminho:** a porta não cabia no R8 (a parede de fachada corre o lado inteiro — passou a medir o trecho que faz divisa com o hall); o rótulo da laje caía sobre o nome da área técnica (a prancha escreve os dois no centro) — a laje de cobertura sai sem rótulo, a numeração é da PA4. **Conferência no app (14/11, `c:/tmp/pwtest/conferencia-predio-pa3.cjs`, estudo descartável arquivado):** R8 — prévia com 5 salas no térreo, cobertura a +24 m e 33.600 L; "Lançar os 9 pavimentos"; rascunho com térreo, cobertura, elevador térreo→8º pav, shaft térreo→cobertura, reservatórios de 20.160 e 13.440 L; 3D com o núcleo contínuo do poço à casa de máquinas; Ctrl+Z volta ao bloco sozinho |
| PA4 | feito — estrutura e fundações (ver a Execução da PA4). R8: 40 pilares, 10 vigas e 7 lajes em cada um dos 7 andares com unidades, a mesma malha no térreo e 40 blocos de fundação. **Achado de desempenho:** cada comando do kernel custa pelo tamanho do modelo (~49 ms no RL, +60 % com as cópias vinculadas); as fundações depois das plantas levavam 22,7 s no RL — lançadas logo depois da estrutura (antes das plantas), 2,9 s, com o MESMO modelo final (hashes iguais). Tempos do marco: R4 0,5 s · R8 1,7 s · R12 4,7 s · RL 8,4 s (a PA10 fixa o do worker). Marco regravado: só o hash do modelo mudou, e ganhou a contagem `estruturas` (201 · 546 · 1.059 · 1.179). **Conferência no app (14/11, `c:/tmp/pwtest/conferencia-predio-pa4.cjs`, estudo descartável arquivado):** R8 — resumo com a estrutura, 40P 10V 7L iguais nos 7 andares, térreo 40P 10V 7L 40B com os pilares em prumada, Ctrl+Z volta a 0 peças; as conferências da PA3 repetidas |
| PA5 | **PA5a feita** (ver a Execução). R8: 5 QDs + 1 QDS por andar × 7, 36 medidores (35 + condomínio), `unidadesMedidas = unidadesAtendidas` (35 = 35); NBR 5410 sem falta na instalação — a única é a da ENTRADA (298 kVA passam do padrão de baixa tensão: vira pendência "entrada em média tensão"; no R4 a entrada T5 dá 160 A contra IB 160,6 A — o padrão genérico é hipótese, conferir com a concessionária). **Desempenho do kernel (sem mudar resultado; suíte da planta 5.696 verdes, marcos com paredes/estruturas idênticos):** a cópia viva, os grupos e os ambientes só re-derivam quando o comando toca o que eles copiam; `copiasDeInstancia` e as invariantes sem buscas quadráticas — o RL foi de 275 s para 18 s, o R8 ~5 s. **Lançar sem reaplicar:** a trava compara o hash do desenho de origem (`hashDoOriginal`) e o editor empilha o resultado do worker como um passo (`runBatchPrevisto` → `ModelHistory.applyPrecomputed`). Marco com `quadros` e `terminais`. Conferência no app (14/11, `c:/tmp/pwtest/conferencia-predio-pa5.cjs`): os 16 portões, Ctrl+Z zera quadros e medidores. PA5a no ar (#424, 12c434c). **PA5b feita** (`utils/predioAutomatico/climatizacaoERede.ts`): a climatização SÓ no tipo (opção `niveis` do gerador — as cópias recebem pela cópia viva), cada ponto de ar no QD da unidade dele (opção `quadroDoPonto`: circuitos por quadro, cada um com a vista dos seus pontos); a condensadora do cômodo sem fachada no ambiente técnico MAIS PERTO e nunca a menos de 0,9 m de outra (opção `condensadorasSeparadas` — sem ela o tipo empilhava 6 condensadoras num ponto, e as peças idênticas faziam o canônico desempatar pelo uid aleatório: o hash mudava a cada geração); a verificação da climatização nos mesmos pavimentos (as cópias saíam "sem equipamento"); eletrodutos dos quadros do tipo cujos circuitos ficam no tipo (o QS, que alimenta a cobertura, ficaria com trechos nas cópias — vai pela prumada, com aviso); a PRUMADA dos alimentadores no shaft (trecho vertical no térreo e no tipo, contínua até o último andar). O editor passa o catálogo de evaporadoras e as premissas (como na casa) e carrega o catálogo com a tela aberta. **Desempenho:** `caminhoEntre` (busca de caminho da fiação) montava o mapa de vizinhos copiando a lista a cada aresta e usava `shift()` — a conferência de eletrodutos do R8 levava 27 s; com o mapa guardado por lista e a fiação guardando a lista de cada circuito, 1,2 s (mesma busca, mesmo caminho). R8 completo ~10 s com a climatização. Marco regravado com a climatização (catálogo semente da casa); a casa idêntica |
| PA6 | feito (ver a Execução) — R8: 5 hidrômetros por andar × 7 (35 = as 35 unidades), coluna DN 85, recalque DN 50 (1,5 cv), RTI 12 m³, pressurizador no superior, nenhum ponto fora da faixa (dinâmica mín. 77 kPa, estática máx. 332 kPa). **R12 pede VRP** (estática máx. 207 kPa depois dela); R4 e RL fecham sem ponto fora da faixa. O volume dos reservatórios conferido à mão no teste. Kernel 0.108.0 (`Terminal.unidadeId` no hidrômetro). Marco com `trechosDeAgua` e o resumo da água; a casa idêntica. PR #433 |
| PA7 | **PA7a feita** (ver a Execução) — R8: 5 tubos de queda por andar (DN 100), 120 UHC por andar, ventilação DN 75, coletor DN 150; toda louça de todo andar chega à ligação (315 de 315; R12 836 de 836). **No R12, os tubos de queda dão DN 100 pela Tabela 6** (o marco confere cada um). Conflitos por grade (44,8 s → 54 ms, mesmo resultado). **PA7b feita** (pluvial da cobertura: R8 2 condutores DN 100 para 1.200 L/min) |
| PA8 | **PA8c feita** (drenagem: ralos e canaletas em pente, caixa separadora, poço com 2 bombas no QDG e recalque à CI do térreo; kernel 0.109.0). **PA8b feita** (escada(s) de emergência da garagem — rota do subsolo limpa no R8 e no R12; QDG, luzes e exaustores). **PA8a feita** (ver a Execução) — subsolo do estudo lançado: R8 1 subsolo com 60 vagas (o contorno livre levaria 91), 1 rampa, 40 pilares da torre + 60 da malha estendida, fundação no subsolo; R12 2 subsolos com 177 vagas e a rampa em vaivém; **nenhum pilar sobre vaga ou rampa** (o marco confere). A garagem pede uma 2ª saída (pendência). — a PA8 está completa |
| PA9 | **PA9a feita** — R8 classificado A-2 (21 m, até o último andar com unidades) com rota de fuga em todos os andares (a escada do tipo vai agora até a cobertura); aba PPCI. **PA9b feita** (extintores, sinalização e iluminação nas áreas comuns do tipo — cada andar repete). **PA9c feita** (hidrante em todo pavimento; coluna de incêndio empilhada; bomba na cobertura ao lado da reserva técnica; registro de recalque no passeio) |
| PA10 | **PA10a em curso** (desempenho: R12 completo 63,6 → 43,1 s com o mesmo resultado; o "Gerar" espera a entrada carregar — a prévia do R12 nascia velha; R12 de ponta a ponta no app: gerar 57 s, Lançar 61 s, salvar 9 s). PA10b (relatório, furos no shaft, conflitos multinível) e PA10c (envio ao Empreendimento, achados da rota) a fazer — ver "Pendências em aberto" |
