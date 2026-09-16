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
