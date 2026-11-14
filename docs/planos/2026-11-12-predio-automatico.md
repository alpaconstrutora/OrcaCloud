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

### PA4 — Estrutura
**O que muda.** Pilares/vigas/lajes no tipo (propagam pela cópia), mesma malha no térreo e na cobertura; fundação com
pendência "pré-dimensionamento, exige cálculo" (a hipótese de carga da casa não serve).
**Pronto quando.** Teste de pilares coincidentes em todos os níveis.

### PA5 — Elétrica coletiva (grande; depende da PA1 e PA3)
**O que muda.** QD por unidade no tipo (`centroDeCargas` por unidade), circuitos por quadro, climatização no quadro da
unidade do ambiente (hoje exige um quadro só — `blueprintGeradorClimatizacao.ts` ~260); no térreo QGBT + medição com um
medidor por unidade; quadro de serviço (elevador, bombas, escada, áreas comuns, garagem); prumada no shaft
(`lugarNoShaft`); demanda pela diversidade.
**Pronto quando.** No R8: um QD e um medidor por unidade, `unidadesMedidas = unidadesAtendidas`, `conferirNbr5410` sem
falta; marco grava.

### PA6 — Água fria (grande)
**O que muda.** Alimentador → reservatório inferior, recalque, superior, barrilete, prumadas pelo shaft; hidrômetro por
unidade no hall (sincronizado; `Terminal.unidadeId` passa a valer para hidrômetro); pressão (pressurizador em cima, VRP
embaixo); reserva técnica de incêndio.
**Pronto quando.** R12 pede VRP; o volume do reservatório bate com a conta manual no teste.

### PA7 — Esgoto, ventilação e pluvial (grande)
**O que muda.** Tubo de queda e ventilação no shaft por UHC acumulado (NBR 8160), desvio no térreo, subcoletor e CI no
lote, pluvial da cobertura.
**Pronto quando.** Teste do diâmetro do tubo de queda no R12; marco grava.

### PA8 — Garagem e subsolo
**O que muda.** `lancarGaragem` ampliado: rampa, pilares da malha da torre, iluminação/exaustão no quadro de serviço,
drenagem + caixa separadora, bombas quando abaixo da rede; subsolos de R8 (1) e R12 (2) no marco.
**Pronto quando.** No R8 nenhum pilar sobre vaga ou rampa.

### PA9 — PPCI
**O que muda.** `gerarPpci` no modelo final, casa de bombas e hidrantes conciliados com o reservatório; aba PPCI.
**Pronto quando.** R8 classificado A-2 com rota em todos os andares.

### PA10 — Fechamento
**O que muda.** Relatório consolidado, furos no shaft, conflitos multinível, envio ao Empreendimento
(`services/sync/massaAdapter.ts`) conferido, tempo do R12 no worker medido e fixado aqui.
**Pronto quando.** R12 completo de ponta a ponta no app dentro do tempo fixado.

PA1 e PA2 podem correr em frentes paralelas.

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
| PA3 | a fazer |
| PA4 | a fazer |
| PA5 | a fazer |
| PA6 | a fazer |
| PA7 | a fazer |
| PA8 | a fazer |
| PA9 | a fazer |
| PA10 | a fazer |
