# Planta Inteligente — Armadura esquemática (aço) em vigas, lajes, pilares, blocos e estacas

**Data:** 16/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> implementar armadura em vigas, lajes, pilares, blocos e estacas

Decisões com o usuário: **taxa de aço por família + armadura esquemática por regra** · hipóteses
gravadas **no estudo, no banco** · o aço **entra no orçamento** em kg.

## O que é (e o que não é)

A Planta não conhece cargas: o que sai é um **pré-quantitativo de aço**. Para cada peça, o
**esquema pelos mínimos da NBR 6118** (barras, bitola, estribos ou malha) e, por cima, um **piso
por taxa de referência** (kg/m³ por família). `kg = max(esquema × (1 + perda), taxa × volume)`;
a linha diz a origem. Não é dimensionamento (sem esforço), não é detalhamento (sem dobras nem
lista de barras) e não desenha barra — o IFC continua "sem armadura", porque não contém.

### Regras por peça (`utils/blueprintArmadura.ts`)

| Peça | Esquema mínimo |
|---|---|
| Pilar | As,min = 0,4 % Ac (17.3.5.3.1), ≥ 4 barras (6 circular); barra = h + 40 Ø; estribo Øt, s = min(20 cm, menor lado, 12 Øl) (18.4.3); perímetro 2(b+h) − 8c + ganchos |
| Viga / baldrame | ρmin 0,15 % (fck ≤ 30; +0,008 %/MPa) (17.3.5.2.1); inferior ≥ 2; superior: viga 2 porta-estribos, baldrame espelho (≥ ½ As,inf, As,min); barra = L + 2 × 30 Ø; estribos Asw/s,min = 0,2 fctm/fywk·bw, s ≤ min(30 cm, 0,6 d); seção T usa a alma |
| Laje | malha inferior nas duas direções, 0,15 %·100·h cm²/m, s ≤ min(20 cm, 2h); negativos fora (o piso cobre) |
| Bloco | malha inferior 0,15 %·b·h por direção (≥ 3) com ganchos 10 Ø + estribos verticais Ø 8 c/20; tirantes por carga fora (o piso cobre) |
| Estaca | 0,5 % Ac no trecho armado (NBR 6122), ≥ 6 barras; barra = trecho + 40 Ø; espiral Øt passo 20 cm |

Peso linear NBR 7480 (`theoreticalLinearWeight` de `rebarEngine.ts`); cobrimento por CAA
(`getCobrimentoNominalCm` de `structuralMath.ts`); Ø 5,0 = CA-60, demais CA-50.

### Hipóteses (uma linha por estudo — `blueprint_study_armadura`)

fck 25 (20–40) · CAA II · perda 10 % · bitolas: pilar 12,5, viga 10, laje 8, bloco 12,5, estaca 10 ·
estribo Ø 5,0 (ou 6,3) · trecho armado da estaca 6 m (4/6/8/total) · taxas de referência kg/m³:
pilar 100, viga 90, laje 70, bloco 70, estaca 50 (0 desliga o piso). Migration
`aplicar_20270921000023_blueprint_study_armadura.sql` (aplicada com `db query -f` em
16/09/2026; conferido: tabela, RLS, 1 policy, grants só `authenticated`). Service
`blueprintArmaduraService`, hook `useBlueprintArmadura` (molde da elétrica, debounce 500 ms,
degrada para "sem persistência").

## Onde aparece

- **Gaveta "Armadura"** (ribbon Analisar › Relatórios, planta e 3D): hipóteses, tabela por família
  (peças · concreto · aço · kg/m³) e por peça (esquema · kg · origem · avisos); linha da peça
  seleciona no desenho. `PainelArmadura.tsx`.
- **Painel da peça**: "≈ 14,2 kg de aço · 4 Ø 12,5 + estribos Ø 5,0 c/15 (mínimos NBR 6118)".
- **Quantitativos** (dock): "Aço — pilares/vigas/lajes/fundação" (kg · kg/m³), "Aço — total
  (esquemático)" com CA-50/CA-60; na lista por peça, `Aço` com kg e esquema.
- **Planilha**: aba "Armadura" + linhas "Aço — …" em Totais; cobertura passa a declarar "ARMADURA
  ESQUEMÁTICA … não detalhamento". `OpcoesExportacao.armadura` (hipóteses) vem do editor via
  `PainelVersoes`; o GED usa o padrão.
- **Orçamento**: `Dimensao 'KG'`; medidas `PESO_ACO_PILAR/VIGA/LAJE/FUNDACAO/TOTAL`
  (`gerarLancamentos(..., { armadura })`); `preverLancamentos` lê as hipóteses do estudo e calcula
  a armadura do snapshot. A trava de unidade vale (kg → item em m³ é recusado).
- `computeQuantities` intocado (sem bump): a armadura é função pura sobre `(model, quant, hip)`.

## Verificação

- `__tests__/blueprintArmadura.test.ts` (13): pilar 19×19 → 4 Ø 12,5 + estribos c/15, kg = barras
  + estribos; 60×60 → 12 Ø 12,5, piso da taxa vence (origem TAXA); viga 15×40 → 2 Ø 10 + 2 sup.,
  estribos c/21; fck 40 sobe ρmin; baldrame espelha; laje Ø 8 c/20 nas duas direções; bloco 5 + 5 Ø
  12,5 + estribos Ø 8 c/20; estaca 6 Ø 10 de 6,4 m + espiral; CAA IV encurta o estribo; perda;
  totais e CA-50/CA-60 fecham; determinístico; `hipotesesDeArmaduraDaColuna`.
- `blueprintBudget` (+2: KG gera kg do P1, TOTAL, POR_ELEMENTO; trava; sem armadura não gera) ·
  `blueprintPlanilha` (+1 aba Armadura; cobertura) · `PainelEstruturaSelecionada` (+1) · editor
  (+1: gaveta, taxa 0 → esquema mínimo "12 Ø 12,5", Quantitativos "Aço —", painel da peça).
- Suíte 331 arquivos / 4379 testes · tsc · `check-ui-standard.sh` (4 arquivos) · build.
- App real na planta do usuário (escritas bloqueadas, 0 erros JS): gaveta "Gravadas no estudo";
  por família: Pilares 16 · 2,509 m³ · 280,2 kg · 111,7 kg/m³; Vigas 7 · 311,2 kg · 90,0; Lajes 4 ·
  693,4 kg · 70,0; Fundação 39 · 992,7 kg · 63,9; total 2.277,4 kg (CA-50 2.031,1 · CA-60 246,3);
  Quantitativos com "Aço — total". Capturas `out-arm/arm-0{1,2}-*.png`.

## Riscos declarados

Números são pré-quantitativo (mínimos + piso) e ficam ABAIXO de um projeto real em peças
carregadas — dito em toda superfície · negativos de laje e tirantes de bloco não estão no esquema ·
hipóteses por estudo, não por versão (republicar não as congela; o orçamento usa as do estudo no
momento da prévia) · o GED exporta a planilha com as hipóteses padrão.

## Exibição gráfica das armaduras (16/09/2026)

> implementar exibição gráfica das armaduras

- **Geometria** (`utils/blueprintArmaduraGeometria.ts`, puro): do esquema de cada peça saem segmentos
  em mm (z absoluto, com a elevação do pavimento). Pilar: barras verticais nos cantos/lados do
  retângulo interno ao cobrimento (`posicoesNoRetangulo`) ou no círculo, estribos retangulares/anéis
  no passo; viga/baldrame: inferiores e superiores de ponta a ponta (`posicoesNaLinha`), estribos
  no eixo; laje: malha nas duas direções, cada linha **recortada ao contorno** (`recortarAoPoligono`,
  vale para L e furos); bloco: malha inferior nas duas direções + estribos verticais; estaca: barras
  só no trecho armado (+ arranque 40 Ø acima do topo, entrando no bloco) e **espiral** contínua.
  Sem dobras nem ganchos — é o desenho do pré-quantitativo.
- **3D**: item **Exibir › Armadura** (só na vista 3D, persistido em `blueprint:vista3dArmadura`,
  nasce desligado). Dois `LineSegments` (longitudinal ferro-oxidado, transversal/malha vermelho)
  montados de uma vez — milhares de segmentos em dois draw calls; o **concreto fica translúcido**
  (opacity 0,28, sem depthWrite) para as barras aparecerem. Respeita pavimentos visíveis e peças
  ocultas.
- **Painel da peça**: `SecaoArmadaSvg` — o corte transversal com contorno, estribo no cobrimento e
  barras como pontos, na MESMA distribuição do 3D (uma regra só); laje = faixa de 1 m; bloco = corte
  pela largura; estaca = círculo com espiral. Legenda "Seção esquemática · 40 × 14 cm · cobrimento 3 cm".
- `ArmaduraDaPeca.cobrimentoMm` passou a sair do esquema (quem desenha precisa dele).

Prova: `__tests__/blueprintArmaduraGeometria.test.ts` (7: barras dentro do cobrimento, do pé ao topo,
estribos no passo; giro e elevação; viga nas cotas certas; laje em L recortada; bloco e estaca —
trecho armado, arranque, espiral; filtro por pavimento) · painel (+1: SVG com 4 barras + estribo;
estaca redonda; viga com barras embaixo e em cima) · editor (+1: item Exibir › Armadura no 3D,
persistido) · suíte 332/4388 · tsc · build. App real na planta do usuário (escritas bloqueadas,
0 erros JS): painel de P3 "≈ 17,5 kg · 4 Ø 12,5 + estribos Ø 5,0 c/14" com a seção 40 × 14; no 3D,
Exibir › Armadura mostra barras e estribos nos 16 pilares, vigas, malha das 4 lajes, blocos,
baldrames e o trecho armado das estacas com espiral, concreto translúcido. Capturas
`out-a3d/a3d-0{1,2,3}-*.png`.

## Lançamento manual de armadura (16/09/2026)

> implemente lançamento manual de armadura

No painel da peça, abaixo da seção, **"Lançar manualmente"** troca o esquema automático pelo do
projetista (`ArmaduraManualForm.tsx`): pilar/estaca = barras + Ø + estribo/espiral Ø + c/;
viga/baldrame = inferiores, superiores (n e Ø próprios) + estribos; laje = malha Ø + c/; bloco =
barras na largura e na profundidade + Ø + estribos. Os valores nascem do esquema automático atual
(`manualAPartirDoEsquema`) e o projetista ajusta. "Voltar ao automático" apaga o lançamento.

- Gravado nas hipóteses do estudo por `uid` (`HipotesesDeArmadura.porPeca`, saneado em
  `hipotesesDeArmaduraDaColuna`) — mesma persistência, mesma leitura em toda parte: kg, 3D, seção,
  Quantitativos, planilha e orçamento (`origem: 'MANUAL'`, rótulo "manual", memória de cálculo
  "armadura lançada manualmente (…) × (1 + perda)"). `armaduraDaPeca` usa os números do lançamento e
  o automático só como régua: abaixo do mínimo da NBR 6118 (As, nº de barras, estribo acima do
  máximo) vira **aviso**, não impedimento. **O piso da taxa não se aplica** à peça manual.
- A gaveta Armadura conta "N peça(s) com armadura lançada manualmente" e oferece "Voltar todas ao
  automático".

Prova: módulo (+3, 16: pilar 8 Ø 16 + Ø 6,3 c/10 → MANUAL sem piso; 4 Ø 10 e c/30 → avisos de
mínimo/máximo; outra peça segue automática; viga/laje/bloco/estaca manuais; `porPeca` saneado) ·
painel (+1: Lançar manualmente parte de 4 Ø 12,5 c/15; mudar barras/estribo chama o callback; Voltar
manda null) · editor (+1: origem manual no painel, contagem e linha "manual" na gaveta, limpar) ·
suíte 332/4393 · tsc · build. App real na planta do usuário (escritas bloqueadas, 0 erros JS): P3
lançado com 8 Ø 12,5 + estribos Ø 6,3 c/14 → "≈ 33,6 kg (manual)", seção com 8 barras. Captura
`out-man/man-01-painel.png`.
