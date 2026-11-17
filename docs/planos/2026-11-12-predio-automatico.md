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

### Pedido de 16/11/2026 (depois do plano concluído) — PA11 a PA14

Sessão b02810da (Claude Code, VS Code), com as fases PA0–PA10c no ar:

> qual o proximo passo?

Resposta: nada esperando; os itens "a decidir" das Pendências — (1) o eletroduto atravessando a caixa da evaporadora, (2)
a água × esgoto que sobra, (3) os encontros da climatização, (4) o tempo do "Lançar" no R12 —, com a sugestão de começar
pelo 1 (o menor) e seguir para o 2, mostrando antes do 2 as opções de caminho para o usuário decidir. Então:

> Faça o 1 e 2 conforme sua sugestão.
> na sequencia 3 e 4

Viraram as fases PA11 (1), PA12 (2), PA13 (3) e PA14 (4).

Decisão do usuário para a PA12 (16/11/2026, múltipla escolha, com o diagnóstico à vista): **"Água abaixo do ramal
(Recommended)"** — nos cômodos secos por onde passa ramal do andar de cima, a água desce para logo abaixo dele (~2,57 m),
deixando 2,50 m livres (o mínimo da NBR 15575); a água do banheiro que passa por um tubo vertical de esgoto (RL) ganha
contorno em planta na mesma fase. Descartadas: o desvio só no cruzamento (o "U" da PA10b), o ramal de cima por outro
caminho e o tubo de queda em cada área molhada.

Decisões do usuário para a PA13 (16/11/2026, múltipla escolha, com o protótipo medido no R8):
- Eletroduto × linha frigorígena e duto de ar (os três na faixa de 2,35 m, sob a viga): **"Eletroduto junto da laje
  (Recommended)"** — o eletroduto do prédio na faixa da elétrica do forro da casa (4,5 cm abaixo do teto), acima da
  linha, do duto, da água e do esgoto de cima; atravessa viga pelos furos previstos; o desvio da evaporadora (PA11)
  estendido às descidas. Descartadas: a linha abaixo do eletroduto (o duto não tem para onde descer) e o pulo só no
  cruzamento.
- Dreno do ar passando por porta ou janela (por gravidade a ~2,10 m): **"Fica como pendência"** — o dreno não muda; o
  cruzamento segue no relatório para o projetista. Descartadas: a parede sem vão com bomba de dreno (no app inteiro, ou só
  no prédio).

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

**Execução da PA10a (15–16/11/2026).** Perfil de CPU do R12 completo (2 subsolos, 5.390 comandos), e só cortes que
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
9,5 mil pontos, 103 quadros. **O clique no Lançar** (perfil do Chrome do clique ao rascunho salvo): o grosso era a tela
pré-dimensionando a elétrica — as verificações do executivo elétrico e a NBR 5410 do modelo inteiro e do pavimento, cada
uma refazendo a árvore de quadros (o pré-dimensionamento de um quadro desce aos filhos e sobe aos pais: com 103 quadros,
quadrático) e cada circuito. **5.** O guardado passou a valer também DENTRO da recursão (por quadro e `comCadeia`: o
`visitados` só exclui ancestrais, e o kernel recusa ciclo de alimentação, então numa árvore o resultado não depende
dele) e por circuito (pelo próprio objeto); a tela confere as verificações e a NBR do modelo inteiro num escopo só.
Medido no Node, intercalado, o cálculo da tela no Lançar do R12: **14,0 → 5,3 s** (−62 %); o R12 completo 47,7 → 40,3 s;
o mesmo hash. **Dois achados de ambiente na conferência:** (a) o Chrome da conferência desenha a planta em software
(SwiftShader) — com os 21,6 mil trechos do R12, o processo de GPU tomava ~5 núcleos e o rascunho não salvava; com a
placa de vídeo (`GPU=1` no roteiro) salva; (b) a máquina é compartilhada (outras sessões com suítes e Vites): o mesmo R12
gera em 57 s com ela quieta e em 190–240 s carregada — só a medição intercalada compara antes e depois. **Tempo
fixado:** no app de desenvolvimento, com a máquina quieta, o R12 completo gera em até 90 s, o clique no Lançar volta em
até 90 s e o rascunho salva em até 30 s (medido: 57 · 61 · 9 s, antes do corte 5); o erro de console que aparece com a
tela ocupada é o sino de notificações abortando a contagem — não é do prédio.

**Execução da PA10b (16/11/2026).** Medido no R8 antes de mexer: 1.221 "conflitos", ~800 deles a PRUMADA atravessando a
laje (tubo de queda, coluna, ramal descendo, eletroduto descendo do teto) — escondiam os de verdade; e 252 encontros água
fria × esgoto: a água corre no forro (20 cm abaixo do teto) e os ramais de esgoto do andar de CIMA correm sob a laje dele,
de 15 a 40 cm abaixo do teto — na casa não há andar de cima. Decisões do usuário (perguntas de múltipla escolha):
1. **"Furo, no app inteiro"** — no kernel, a prumada que atravessa a laje deixa de ser conflito e vira PASSAGEM
   (`passagensNaLaje`: `FURO` quando atravessa, `EMBUTIDO` quando a ponta fica dentro — o eletroduto que desce do teto —,
   `noNucleo` quando cai num shaft ou caixa de elevador que já fura a laje; o tubo rente à borda conta, como contava o
   conflito). O pedaço que corre DENTRO da laje continua conflito. Os furos previstos (a lista do calculista, F14c) e a
   travessia do duto do exaustor (climatização) passaram a ler as passagens — **o marco da casa passa sem regravar**.
2. **"Desvio só no cruzamento"** (a água desce num "U" sob o ramal) — tentado e medido: resolveu ~5 % (os cruzamentos
   ficam colados nos nós da rede de água dentro das áreas molhadas). Voltei a perguntar.
3. **"Forro rebaixado nas áreas molhadas"** (`predioAutomatico/desvios.ts`) — nos banheiros, lavabos e área de serviço a
   água corre a 52 cm do teto (2,48 m do piso no tipo de 3 m), abaixo da faixa do esgoto de cima; nos outros cômodos
   segue no forro e desce na parede ao entrar no molhado (a cozinha fica de fora: pé-direito de 2,50 m). Roda no tipo,
   antes da cópia viva. Pendência CONFERIR com o forro de 2,30 m. **Dois achados da conferência de pressão** (a ligação
   da rede é pela ponta EXATA): o "jogo" horizontal de 1 mm que a rede usa para casar pontas era tratado como vertical e
   apagado, e o corte rente à ponta de um trecho descartava o pedaço minúsculo — no R12, 55 pontos ficaram sem pressão.
   Agora vertical é só o trecho parado em planta com cotas diferentes, corte a menos de 5 mm da ponta não corta, e a
   descida sai em todo nó onde se encontram pedaços nas duas cotas; o marco trava `naoAvaliados = 0`.

**Água × esgoto** (o marco grava `aguaXEsgoto`): R4 62 → 4, R8 252 → 18, R12 911 → 141, RL 1.195 → 244. O que sobra é
o ramal do andar de cima atravessando cômodo SECO (sala, circulação) a caminho do shaft — fica no relatório, com o local.
A pressão dinâmica mínima cai 3 kPa (o desvio a mais na água), sem ponto insuficiente.

**Relatório consolidado** (`predioAutomatico/compatibilizacao.ts`, na Conferência, sobre o modelo final; aba
**Compatibilização** na tela): conflitos do prédio inteiro por tipo — rede em porta ou janela, em pilar, em equipamento
(com as caixas das peças de climatização), e o ENCONTRO entre redes (o kernel só registra o par que se toca ou se cruza,
sempre com 0 mm — por isso rede × rede é sempre conflito, como na casa, F27) —, por rede e por pavimento, com os locais no
tipo e nos pavimentos únicos (as cópias repetem o tipo); encostos de raspão (tubo rente a pilar, vão ou equipamento);
prumadas na laje (furo próprio, no shaft, eletroduto embutido); e a lista de furos para o calculista sem os andares
copiados e sem as passagens que não furam. As 30 linhas soltas de conflito da climatização (uma por trecho, sem local)
saíram — o relatório as cobre. No R8: 245 redes em porta ou janela (189 do dreno do ar), 4 em pilar, 63 em equipamento
(56 eletrodutos lançados depois da climatização cruzando caixa de evaporadora — ninguém contava), 700 encontros entre
redes (o grosso é climatização × eletroduto), 306 prumadas furando a laje fora do shaft, 47 no shaft, 487 eletrodutos
embutidos; 106 furos na lista. Custo no R12: ~0,3 s.
**Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pa10b.cjs`, o R8 com 1 subsolo, estudo descartável arquivado):
a aba Compatibilização com os números do marco (1.012 conflitos, 306 furos na laje, 47 no shaft, 487 embutidos, 106
furos na tabela, 10 pavimentos na lista), o conflito consolidado do Relatório abrindo o tipo na planta com as marcas, as
linhas soltas da climatização fora, e no rascunho salvo depois do Lançar a água a 2,48 m nos 7 andares (124 trechos em
cada — o tipo e as cópias), sem erro de console.

**Execução da PA10c (16/11/2026).**

*Envio ao Empreendimento* (`services/sync/massaAdapter.ts`). Conferido com os quatro prédios lançados: o envio mandava a
ESTIMATIVA da massa pela área — unidade no térreo de uso comum e quantas "caberiam" por andar — e não o que o prédio
desenhou (R4 8 × 6, R8 47 × 35, R12 96 × 88, RL 111 × 91). Decisão do usuário: **"unidades do prédio"** — o bloco com o
pavimento tipo montado e unidades desenhadas manda as unidades da planta: os andares que têm unidade, o número (101,
201…), a tipologia e a área privativa MEDIDA (o preço-semente sai dela), a área comum do bloco rateada pela privativa. A
chave segue `<bloco>:<ordinal>:<posição>` (a posição sai do número): a unidade que existe nos dois casa com a já enviada;
a que só a estimativa tinha (T01, 106…) vira órfã — o motor nunca apaga. Sem o tipo montado, a estimativa de antes. O aviso
diz quanto a estimativa daria, e o da garagem lançada, as vagas desenhadas. **Achado no caminho:** `ordinalDoPavimento`
contava PAVIMENTOS, e o térreo do lote e o do bloco estão os dois na cota 0 — o tipo virava o 3º, e as unidades dos
andares copiados saíam "Torre · 3º pav · 101" em vez de 201 (no app e no envio). Passou a contar COTAS (o mesmo andar);
vale também para o recuo escalonado da zona.

*Rota de fuga.* Os três achados anotados na PA9a não eram o que pareciam:
1. "A boca do lance multiandares na outra ponta" — não era: a circulação mais longe ficava a 26,6 m da escada em TODOS os
   andares do R4, o tipo inclusive. O tipo passava porque a escada que chega do térreo e a que sobe à cobertura (o mesmo
   eixo, a mesma caixa) contavam como DUAS saídas (limite de 35 m em vez de 25 m). Corrigido no motor da rota: as saídas
   de um andar são as caixas de escada.
2. E a "Circulação" que reprovava no R4 é o corredor DENTRO do apartamento — a A-2 conta da porta da unidade (IT 08,
   5.5.2.2), mas o motor reconhecia o cômodo da unidade só pelo nome (sala, dormitório…). Passou a reconhecer também pela
   etiqueta da unidade (no tipo e nas cópias). O R4 fica limpo sem nada a lançar.
3. "As asas do RL sem caminho" — um triângulo de 0,0002 m² onde duas paredes se encontram desalinhadas por milímetros: a
   rota passou a ignorar "ambiente" de menos de 0,1 m².

Com isso, o que sobrou é de projeto, e o usuário decidiu:
- **"Detecção + pendência"**: com uma escada, a circulação comum do R12 (até 29,6 m) e do RL (até 37,3 m) passa dos 25 m da
  saída única; com detecção o limite é 40 m (Tabela 5). O prédio lança a detecção (o motor de alarme da planta: detectores
  de fumaça nas áreas comuns do TIPO — as cópias repetem —, central, acionadores e avisadores) quando a rota pede, mesmo
  sem a norma exigir; pendência CONFERIR com o local. O que passar mesmo assim fica na conferência, que agora diz que falta
  uma 2ª escada (ou declarar Y/Z).
- **"Porta no fim da asa"**: o térreo do RL tinha uma porta só, e as salas comuns da asa ficavam a 40–51 m dela (35 m no
  térreo com saída única). Quando alguma sala do térreo passa do limite, o prédio abre uma 2ª porta para o exterior
  (1,20 m) na circulação, no trecho de fachada mais perto do pior ponto — antes dos equipamentos, para a sinalização e a
  iluminação já lerem a rota com ela; pendência CONFERIR (o caminho dela até a via pública é da arquitetura).

Resultado (o marco trava): a rota limpa em TODOS os andares dos quatro prédios; detecção só no R12 (17 detectores no
tipo) e no RL (27); R4 e R8 com o mesmo modelo de antes.

**Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pa10c.cjs`, o RL, estudo descartável arquivado): a aba PPCI
com a rota em todos os 9 andares sem ambiente sem rota nem acima do limite; no Relatório a 2ª porta do térreo e a
detecção, cada uma levando à planta (a porta no fim da asa comprida); no rascunho salvo, o térreo com 2 portas para o
exterior, 9 detectores de fumaça em cada um dos 7 andares e a central, as 91 unidades numeradas 101…713; e o envio ao
Empreendimento calculado na página com o modelo salvo (nada gravado no Empreendimento): 91 unidades, 13 por andar,
nenhuma no térreo. Sem erro de console.

### PA11 — O eletroduto contorna a evaporadora e o exaustor
**O que muda.** `planejarEletrodutos` (`utils/blueprintEletrodutos.ts`, vale para o editor, a casa e o prédio): a reta na
cota da rede desvia também da CAIXA das peças de climatização (`volumesDasPecasDeClimatizacao`) que ela alcança na
vertical, como já desviava de pilar.
**Pronto quando.** Nenhum eletroduto dentro de uma evaporadora ou de um exaustor nos quatro prédios (o marco trava
`eletrodutoNoEquipamento = 0`); teste do desvio que falha no código de antes; o marco da casa idêntico.

**Execução da PA11 (16/11/2026).** Diagnóstico no R8: os 56 eram 35 eletrodutos × evaporadora e 21 × exaustor, 5 + 3 por
andar, todos na reta da rede a 2,35 m (10 cm sob a viga) — a reta cruza a parede justo onde a evaporadora está
pendurada (a caixa vai de 2,05 a 2,35 m, centro a 2,20 m) ou passa pelo exaustor no teto do banheiro (2,10 a 2,50 m). O
motor só desviava de pilar. Agora `ligarNaRede` junta aos obstáculos as caixas que a rede alcança na vertical (o raio do
tubo + 50 mm, porque a ocupação ainda aumenta o diâmetro), menos a que tem uma das pontas a menos de 50 mm (a ligação da
própria peça, como o kernel conta), infladas como o pilar pela luz (raio + 50 mm); sem contorno com elas, a reta de antes
(nunca pior). Conflitos com equipamento, antes → depois: R4 9 → 0, R8 63 → 7, R12 330 → 88, RL 133 → 21 — os que sobram
são dos dutos de ar (a exaustão do banheiro, `MECANICA`) — PA13. O marco da casa ficou idêntico (nas casas nenhuma reta
da rede cruzava peça).

**Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pa11.cjs`, o R8, estudo descartável arquivado): a aba
Compatibilização com 886 conflitos (245 em porta ou janela · 4 em pilar · 630 encontros entre redes · 7 em equipamento — eram
1.012 e 63), o conflito com equipamento do Relatório só com dutos (7); no rascunho salvo depois do Lançar, 588 peças de
climatização, 3.606 trechos de eletroduto e nenhum dentro de evaporadora ou exaustor (o kernel com as caixas: só os 7
dutos). Sem erro de console.

### PA12 — A água × esgoto que sobra
**O que muda.** Diagnóstico (16/11, os quatro prédios gerados): os encontros que sobram são a água do andar no forro
(2,80 m) cruzando o ramal de esgoto do andar de CIMA, que corre sob a laje (o fundo dele de 2,61 a 2,90 m em 95 % dos
trechos) a caminho do shaft, nos cômodos secos — R8 18 (cozinha 6, sala 6, a descida da água no banheiro 6); R12 141
(cozinha 60, circulação 40, dormitório e suíte 40, garagem 1); RL 244 (circulação 138, cozinha 78, e 28 da água
rebaixada do banheiro e da área de serviço passando por um tubo vertical de esgoto do mesmo andar). Decisão do usuário:
**água abaixo do ramal** — em `utils/predioAutomatico/desvios.ts`, a água do tipo desce para logo abaixo do ramal do andar
de cima (~2,57 m, 2,50 m livres) nos cômodos secos por onde ele passa, como a PA10b fez nos molhados; e desvia em planta
do tubo vertical de esgoto que atravessa a faixa dela.
**Pronto quando.** O marco trava `aguaXEsgoto` nos quatro prédios no que sobrar (estimativa: R8 0, R12 ~1, RL ~0 com o
contorno), com cada sobra explicada; a água continua chegando a todo ponto (`naoAvaliados = 0`, nenhum fora da faixa); o
marco da casa idêntico; no app, a água a ~2,57 m nos cômodos secos sob o ramal, no tipo e nas cópias.

**Execução da PA12 (16/11/2026).** `rebaixarAguaNasAreasMolhadas` virou `rebaixarAguaNoForro` (`desvios.ts`): além dos
molhados (2,48 m), os cômodos SECOS por onde passa ramal do andar de cima — o ramal do próprio tipo sob o piso, que é o
de cima das cópias — recebem a água a 2,57 m (`AGUA_SOB_O_RAMAL_ABAIXO_DO_TETO_MM` = 430); o nó entre cômodos de cotas
diferentes ganha as descidas de uma cota à seguinte. E o pedaço rebaixado que passaria por um tubo vertical de esgoto (o
tubo de queda dentro do banheiro, no RL, que sobe até o ramal de cima, a 2,71 m — a PA10b, ao baixar a água para 2,48 m,
pôs a água nele) contorna-o em planta pelos cantos (`desvioDoPilar`, o tubo como um quadrado de raio + raio + 30 mm).
Água × esgoto: R4 4 → 0, R8 18 → 0, R12 141 → 1, RL 244 → 0 — o 1 do R12 é da garagem (as duas redes do próprio
subsolo, fora do tipo; estava lá desde a PA8). No R8, 14 cômodos molhados e 16 secos sob o ramal por andar. A pendência
CONFERIR da água diz as duas cotas.

**Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pa12.cjs`, o R8, estudo descartável arquivado): no Relatório a
pendência da água com as duas cotas (14 molhados a 2,48 m, 16 secos sob o ramal a 2,57 m); a aba Compatibilização com 868
conflitos (612 encontros entre redes — eram 630); no rascunho salvo depois do Lançar, 77 trechos de água a 2,57 m e 124 a
2,48 m em CADA um dos 7 andares (o tipo e as cópias) e nenhum cruzamento água × esgoto no prédio. Sem erro de console.

### PA13 — Os encontros da climatização
**Diagnóstico (16/11, R8 com PA11 + PA12).** 588 dos 612 encontros entre redes envolvem a climatização; no tipo (contado
uma vez) são 84: eletroduto × linha frigorígena 23 e × duto de ar 17 (os três a 2,35 m — a linha sai do topo da
evaporadora, o duto de 25 cm vai de 2,10 a 2,35 m, o eletroduto 10 cm sob a viga), as descidas da água × dreno 13 e ×
linha 12, e o resto miúdo (linha × duto, dreno × duto, descidas do eletroduto). E o dreno, por gravidade a ~2,10 m no eixo
da parede, passa sobre as portas (verga a 2,10 m) e pelo alto das janelas (até 2,20 m): 27 no tipo do R8, 38 no do RL.
Protótipo (eletroduto na faixa da elétrica do forro da casa): encontros entre redes 612 → 307, os 40 do eletroduto
horizontal → 0, +3 furos em viga para o calculista; as descidas do eletroduto no forro passaram a cruzar 35 evaporadoras
(o desvio da PA11 só valia na reta). Decisões do usuário no "Pedido".
**O que muda (decidido).** O eletroduto do prédio na faixa da elétrica do forro (`noForro` de `planejarEletrodutos`,
como a casa); o desvio da evaporadora e do exaustor também nas descidas e na árvore do forro; as descidas da água ×
linha e dreno, se o caminho for simples. O dreno não muda (pendência). Antes, para referência: O duto de ar (a exaustão do banheiro) atravessando a caixa de uma evaporadora ou de um exaustor (R8 7, R12
88, RL 21 — o que sobrou da PA11); a linha frigorígena e os dutos × eletroduto; o dreno × água; o dreno do ar passando por porta ou
janela. Diagnóstico por tipo na abertura da fase, como na PA11.
**Pronto quando.** Encontros eletroduto × linha frigorígena e × duto de ar zerados no tipo dos quatro prédios (trava no
marco) — *revisto na execução: zerados os HORIZONTAIS; sobram as descidas cruzando a linha/duto junto da parede, contadas
no marco*; `eletrodutoNoEquipamento` segue zero; os furos em viga a mais listados para o calculista; o dreno × porta/janela
continua no relatório, como pendência explícita; marco da casa idêntico (a casa já lança no forro) ou cada mudança
justificada.

**Execução da PA13 (16/11/2026).**
- O eletroduto do prédio passou para a faixa da elétrica do forro da casa (`HIPOTESES_ELETRODUTO_DO_PREDIO`, 4,5 cm abaixo
  do teto, como a casa), e a etapa ELETRODUTOS passou para DEPOIS da água, do esgoto e do pluvial — junto da laje, a rede
  precisa ver as prumadas, os ramais do andar de cima e as descidas das louças de cima pela laje para desviar deles.
- O andar de cima do tipo é a 1ª cópia, ainda sem instalações (a cópia viva entra no fim): o planejador recebe
  `comOAndarDeCima` — o que o tipo tem sob o piso (trechos e as peças de climatização no piso, como o ponto de dreno)
  espelhado no pavimento de cima. Só para planejar.
- O desvio da PA11 vale também para as peças do pavimento de cima (o ponto de dreno no piso de cima, que o eletroduto na
  laje cruzava), e a DESCIDA do forro trata a evaporadora/exaustor pendurado na parede como um vão (desce ao lado e corre
  por baixo até a tomada, como sob a janela — F18).
- **Desempenho** (o achado da fase): com o esgoto já lançado, a faixa do forro tem centenas de obstáculos e o contorno da
  reta (`desvioDoPilar`, grafo de visibilidade quadrático nos cantos) levou o R4 a 60 s e o RL a 5–8 min. Corrigido: os
  obstáculos da faixa guardados por pavimento e cota, só os perto da reta (`PERTO_DA_RETA_MM` = 500), o obstáculo que contém
  a ponta fora (o quadro logo abaixo da descida da louça de cima), e um teto no grafo só no prédio
  (`noForro.grafoAteNos` = 120; acima dele, contorno só dos pilares e das peças). A casa segue sem teto — o teto mudava
  um caso do marco dela. Tempos (máquina quieta): R4 3 s · R8 20 s · R12 74 s · RL 98 s (PA12: ~16 s no R8).
- Resultado (PA12 → PA13): encontros entre redes R4 98 → 59, R8 612 → 295, R12 1.732 → 621, RL 1.247 → 530; eletroduto ×
  linha frigorígena R8 203 → 14, R12 462 → 44, RL 378 → 28; × duto de ar R8 133 → 0, R12 649 → 0, RL 455 → 63 (as descidas
  e a chegada na tomada do ar a 2,20 m); furos em viga para o calculista +4/+5/+8 (o eletroduto atravessando viga pelas
  travessias, como na casa). Novo e explicado: eletroduto × esgoto do andar de cima R8 32, R12 104, RL 91 — o eletroduto
  na laje cruzando a descida da louça de cima pela laje, onde o contorno desiste (vizinhança densa, teto do grafo) ou o
  quadro da unidade está logo abaixo dela. O dreno × porta/janela não muda (decisão: pendência).
- **Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pa13.cjs`, o R8, estudo descartável arquivado): gerar em 35 s;
  a aba Compatibilização com 295 encontros entre redes; a etapa "Eletrodutos por quadro junto da laje" depois do pluvial;
  no rascunho salvo, 547 trechos de eletroduto do tipo a 2,955 m e nenhum a 2,35 m, nenhum dentro de equipamento nem ×
  duto de ar. E o **R12 de ponta a ponta** (`conferencia-predio-pa10a.cjs`): gerar 54,5 s, Lançar 50,7 s, salvar 9,6 s —
  dentro do tempo fixado na PA10a (90 · 90 · 30 s); Ctrl+Z volta tudo; 29.953 trechos (eram 21.671). Sem erro de console.

### PA14 — O tempo do "Lançar" no R12
**O que muda.** O clique no "Lançar" do R12 (61 s no app na PA10a): o que sobra é o desenho da planta (21,6 mil
trechos) e as marcas de verificação das redes — medir onde vai o tempo antes de mexer.
**Pronto quando.** O tempo do Lançar do R12 medido no app (intercalado, com a máquina quieta) cai, e o novo limite fica
fixado no teste de desempenho da PA10a; o modelo lançado é o mesmo (hash igual).

**Execução da PA14 (16/11/2026).** Medido antes de mexer: o perfil do Chrome no clique do Lançar do R12 (depois da PA13:
51 s, 29.953 trechos) — todo o tempo é o RENDER do editor recalculando o que deriva do modelo novo: a conferência da
NBR 5410 (18,5 s: o pré-dimensionamento dos 103 quadros 7,4 s, a fiação dentro da regra do eletroduto 7,1 s), a
composição da fiação da rede para o desenho (14,5 s, dos quais ~10 s em `arestasDo`), as marcas de verificação das redes
(9,2 s: ventilação 3,6, condutores pluviais 3,4) e da climatização (5,9 s). Feito, sem mudar resultado:
- `arestasDo` (`utils/blueprintKernel/fiacao.ts`): as arestas de cada circuito numa passada só, na mesma ordem — antes,
  cada circuito filtrava os 30 mil eletrodutos.
- `composicaoDaRede` guardada por modelo (o canvas, o editor, a conferência da NBR 5410 e o painel pediam a mesma rede a
  cada render; o modelo do kernel não muda depois de criado e ninguém altera a composição — conferido). Bundle da
  planta-api regerado.
- A/B intercalado no app (o R12 de ponta a ponta, máquina quieta): **Lançar 51,3 / 51,1 s → 37,3 / 36,9 s**; gerar e
  salvar iguais (~54 s, ~9–12 s). Os dois marcos idênticos (o modelo lançado é o mesmo).
- O limite fixado passa a ser gerar ≤ 90 s, **Lançar ≤ 60 s** (era 90 s) e salvar ≤ 30 s — portões no roteiro do R12
  (`c:/tmp/pwtest/conferencia-predio-pa10a.cjs`).
- Fica para depois (ganho menor, mexe em algoritmo): o pré-dimensionamento dos quadros (a 1ª conta de cada um, já guardada
  dentro da conferência desde a PA10a), a ventilação e os condutores pluviais nas marcas de verificação.

PA1 e PA2 podem correr em frentes paralelas.

## Pendências em aberto (17/11/2026, depois da PA14)

O que o prédio automático ainda não faz, ou faz e deixa para conferir. "Projetista" = fica de propósito como pendência na
tela (o motor não decide); "acompanhamento" = vigiar a cada mudança; "a decidir" = trabalho possível, sem fase. Os
quatro "a decidir" de 16/11 viraram as fases PA11–PA14, todas no ar: as linhas riscadas são o que elas resolveram,
e o que deixaram entrou como linha nova. Os números são do marco no main
(`__tests__/fixtures/predioAutomaticoMarco.json`); "decisão do usuário" só onde a escolha veio da pergunta de múltipla
escolha.

| Área | Pendência | Onde fica |
|---|---|---|
| Desempenho | Clique no "Lançar" do R12: 37 s depois da PA14 (limite 60 s); o que sobra é o pré-dimensionamento dos 103 quadros na conferência da NBR 5410 (7 s), as marcas de verificação (ventilação, pluvial, climatização) e o desenho | a decidir |
| Desempenho | R12 de ponta a ponta no app depois da PA14: gerar ~54 s, Lançar 37 s, salvar 9–12 s — dentro do tempo fixado (gerar 90 s · Lançar 60 s, desde a PA14 · salvar 30 s; portões em `c:/tmp/pwtest/conferencia-predio-pa10a.cjs`) — vigiar a cada fase | acompanhamento |
| Desempenho | Marco do RL perto do limite da CI (20 min por caso; a CI inteira leva 30–39 min nos PRs da PA11–PA14; o `TowerEditorTerrenoDaPlanta`, instável sob carga, caiu uma vez no #529 e passou rodando de novo só o que falhou); o bloco "o motor (PA2)" subiu para 180 s depois de deixar a main vermelha (15/11) | acompanhamento |
| Compatibilização | ~~Água × esgoto que sobra: o ramal do andar de cima atravessando cômodo seco a caminho do shaft (R8 18, R12 141, RL 244)~~ — resolvido: a água abaixo do ramal também nos cômodos secos; sobra 1 na garagem do R12 (redes do próprio subsolo) | feito na PA12 |
| Compatibilização | Forro rebaixado a 2,57 m (2,50 m livres) nos cômodos secos por onde passa o ramal do andar de cima — confira com a arquitetura | projetista |
| Compatibilização | ~~Eletroduto × linha frigorígena e × duto de ar, os três na faixa de 2,35 m sob a viga (R8 336, R12 1.111, RL 833)~~ — resolvido: o eletroduto junto da laje; sobram as descidas (linha abaixo) | feito na PA13 |
| Compatibilização | As descidas do eletroduto cruzando a linha frigorígena e o duto de ar junto da parede, a caminho da tomada (R8 14, R12 44, RL 91 — `eletrodutoXClimatizacao` no marco) | a decidir |
| Compatibilização | O duto de ar (a exaustão do banheiro) atravessando a caixa de uma evaporadora ou de um exaustor (R8 7, R12 88, RL 21) — o que sobrou da PA11; a PA13 não mexeu no duto | a decidir |
| Compatibilização | As descidas da água cruzando o dreno e a linha frigorígena (no tipo do R8: 13 × dreno, 12 × linha, no diagnóstico da PA13) — a PA13 previa "se o caminho for simples" e não mexeu | a decidir |
| Compatibilização | O dreno do ar, por gravidade a ~2,10 m no eixo da parede, passando sobre porta ou pelo alto de janela (27 no tipo do R8, 38 no do RL) — no relatório | projetista (decisão do usuário, 16/11) |
| Compatibilização | O eletroduto junto da laje cruzando a descida da louça do andar de cima pela laje (R8 32, R12 104, RL 91) — onde a vizinhança é densa demais para o contorno, ou o QD da unidade fica logo abaixo dela | a decidir |
| Compatibilização | Furos em viga do eletroduto junto da laje (+4 a +8 por prédio, nas travessias fora do apoio) — confira com o calculista | projetista |
| Compatibilização | ~~Eletroduto lançado depois da climatização atravessando a caixa da evaporadora (R8: 56)~~ — resolvido: o eletroduto contorna a evaporadora e o exaustor (zero nos quatro prédios) | feito na PA11 |
| Compatibilização | Forro rebaixado a 2,30 m nos banheiros, lavabos e área de serviço (a água abaixo dos ramais de cima) — confira com a arquitetura | projetista |
| Rota de fuga | Prédio com a circulação acima de 40 m da escada única (mesmo com a detecção): a 2ª escada no fim do corredor — hoje só a pendência | projetista |
| Rota de fuga | Características construtivas (X/Y/Z, IT 08 Tabela 3) não declaradas: a Tabela 5 usa X, o mais restritivo — declarar na premissa muda os limites | projetista |
| Rota de fuga | A 2ª porta do térreo (RL): o caminho dela até a via pública e a calçada | projetista |
| Envio ao Empreendimento | Unidades já enviadas pela estimativa que o prédio não tem (T01, a 6ª por andar…) ficam órfãs no Empreendimento — o motor nunca apaga | projetista |
| PPCI | DN da rede de hidrantes e curva da bomba (premissa DN 65) — o cálculo hidráulico do PPCI da planta | projetista |
| PPCI | Eletroduto do laço do alarme; barra antipânico nas portas da rota | projetista |
| Garagem | Rampa de mão única e as curvas de concordância; mão dupla pelo número de vagas — o código de obras | projetista |
| Garagem | Laje sobre o subsolo e os pilares da malha estendida (vão de até 7,5 m) — pré-dimensionamento, exige cálculo | projetista |
| Garagem | Subsolo de contorno não retangular: rampa e laje à mão; piso acima da rede: a separadora por gravidade à mão | projetista |
| Elétrica | Entrada em média tensão quando a demanda passa do padrão de baixa tensão (R8: 465 kVA com a climatização e a garagem) | projetista |
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

**Resumo (17/11/2026):** **todas as fases estão no ar** — PA0 a PA10c (o plano de 12/11) e PA11 a PA14 (o pedido de
16/11, os quatro "a decidir"). Último merge de código: 19caa13 (#527, PA14); o plano, em #529 (6b055c1) e nesta revisão.
A produção serve o main e a CI do main está verde. Nada em andamento. O que sobra está em "Pendências em aberto": cinco
"a decidir" (sem fase — o tempo que sobra no Lançar e quatro encontros de redes), o que fica de propósito para o
projetista e o que é acompanhamento. Kernel em `blueprint-kernel-ts-0.109.0` (PA11–PA14 não mudam a versão; a PA14 mexe
na fiação do kernel sem mudar o modelo).

| Fase | PR | Commit no main |
|---|---|---|
| PA0 — plano e marco | #388 | c35ccbb |
| PA1 — instalações na cópia viva (kernel 0.106.0) | #390 | d75771a |
| PA2 — orquestrador, tela e o tipo | #401 | 473e53b |
| PA3 — térreo, cobertura e reservatórios | #413 | e428cab |
| PA4 — estrutura e fundações | #419 | 8d90cd4 |
| PA5a — elétrica coletiva (kernel 0.107.0) | #424 | 12c434c |
| PA5b — climatização, eletrodutos e prumada | #427 | 358974c |
| PA6 — água fria (kernel 0.108.0) | #433 | 7088354 |
| PA7a — esgoto e ventilação | #440 | 7bef1f1 |
| PA7b — pluvial da cobertura | #444 | b1d5eef |
| PA8a — garagem no subsolo | #465 | a047901 |
| PA8b — escadas de emergência e elétrica da garagem | #470 | ca61bd1 |
| PA8c — drenagem da garagem (kernel 0.109.0) | #480 | 5dba184 |
| PA9a — classificação de incêndio e rota de fuga | #447 | ee08cf5 |
| PA9b — equipamentos de incêndio | #457 | 87e303f |
| PA9c — hidrantes, coluna, bomba e recalque | #459 | 0df7667 |
| PA10a — desempenho e o tempo do R12 fixado | #495 | d1b7f59 |
| PA10b — laje = passagem, água rebaixada, compatibilização | #499 | 637bca4 |
| PA10c — envio ao Empreendimento e achados da rota | #503 | 6206737 |
| PA11 — eletroduto contorna a evaporadora e o exaustor | #518 | a16c71c |
| PA12 — água abaixo do ramal de cima também nos cômodos secos | #520 | 2b363ad |
| PA13 — eletroduto junto da laje | #525 | 4d0f1e7 |
| PA14 — o Lançar do R12 51 → 37 s | #527 | 19caa13 |

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
| PA8 | **PA8c feita** (drenagem: ralos e canaletas em pente, caixa separadora, poço com 2 bombas no QDG e recalque à CI do térreo; kernel 0.109.0). **PA8b feita** (escada(s) de emergência da garagem — rota do subsolo limpa no R8 e no R12; QDG, luzes e exaustores). **PA8a feita** (ver a Execução) — subsolo do estudo lançado: R8 1 subsolo com 60 vagas (o contorno livre levaria 91), 1 rampa, 40 pilares da torre + 60 da malha estendida, fundação no subsolo; R12 2 subsolos com 177 vagas e a rampa em vaivém; **nenhum pilar sobre vaga ou rampa** (o marco confere). A garagem pedia uma 2ª saída — resolvida na PA8b. — a PA8 está completa |
| PA9 | **PA9a feita** — R8 classificado A-2 (21 m, até o último andar com unidades) com rota de fuga em todos os andares (a escada do tipo vai agora até a cobertura); aba PPCI. **PA9b feita** (extintores, sinalização e iluminação nas áreas comuns do tipo — cada andar repete). **PA9c feita** (hidrante em todo pavimento; coluna de incêndio empilhada; bomba na cobertura ao lado da reserva técnica; registro de recalque no passeio) |
| PA10 | **PA10a feita** (desempenho com o mesmo resultado: R12 completo 63,6 → 40,3 s, o cálculo da tela no Lançar 14,0 → 5,3 s; o "Gerar" espera a entrada carregar — a prévia do R12 nascia velha; R12 de ponta a ponta no app: gerar 57 s, Lançar 61 s, salvar 9 s com a máquina quieta; tempo fixado 90/90/30 s). **PA10b feita** (a prumada na laje é passagem, não conflito, no app inteiro; a água no forro rebaixado das áreas molhadas — água × esgoto R4 62 → 4, R8 252 → 18, R12 911 → 141, RL 1.195 → 244; o relatório de compatibilização na aba nova; conferida no app com o R8). **PA10c feita** (o envio ao Empreendimento manda as unidades da planta — R8 35 em vez da estimativa de 47 —, a numeração das cópias 201…; a rota de fuga limpa nos quatro prédios: caixas de escada, corredor do apartamento fora da medição, resíduo de geometria ignorado, detecção no R12 e no RL, 2ª porta no térreo do RL) — ver "Pendências em aberto" |
| PA11 | feita, no ar (#518, a16c71c; conferida no app com o R8) — o eletroduto contorna a caixa da evaporadora e do exaustor (`planejarEletrodutos`): eletroduto dentro de equipamento R4 9 → 0, R8 56 → 0, R12 242 → 0, RL 112 → 0 (o marco trava zero); de quebra, menos encontros entre redes (R8 700 → 630) e +3 caixas de passagem por andar no R8 (as curvas do contorno, regra da NBR 5410). Marco da casa idêntico |
| PA12 | feita, no ar (#520, 2b363ad; conferida no app com o R8) — a água abaixo do ramal de cima também nos cômodos secos (2,57 m) e contornando o tubo de queda do banheiro: água × esgoto R4 4 → 0, R8 18 → 0, R12 141 → 1 (garagem), RL 244 → 0 |
| PA13 | feita, no ar (#525, 4d0f1e7; conferida no app — R8 e o R12 de ponta a ponta) — eletroduto junto da laje (faixa da elétrica do forro, etapa depois do esgoto, o andar de cima espelhado para o desvio): encontros entre redes R8 612 → 295, RL 1.247 → 530, eletroduto × duto zerado no R8 e no R12; desempenho domado (RL 98 s); eletroduto × esgoto de cima R8 32, R12 104, RL 91 (explicado); dreno × porta/janela = pendência |
| PA14 | feita, no ar (#527, 19caa13; A/B intercalado no app) — o Lançar do R12 no app 51 → 37 s (a fiação da rede: arestas por circuito numa passada e a composição guardada por modelo); limite fixado em 60 s; modelo idêntico |
