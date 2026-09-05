# Planta Inteligente — TELHADO (Etapa 2 do roadmap BIM, item 1)

## Pedido original

> vamos com o telhado

Sessão `b7041736-bf7a-4895-a5ec-193e752d57b7` · 2026-09-04, logo após a pergunta
*"qual a próxima etapa?"* — respondida com a Etapa 2 (modelo arquitetônico
completo) e a recomendação de começar pelo telhado, por ser a ausência mais
visível e a única que também deixa buraco no orçamento.

Contexto do roadmap: `docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md`.

## O problema

Hoje o 3D e as quatro elevações mostram a casa **sem cobertura**, e o
quantitativo não tem área de telhado — que é item de compra (telha, madeiramento,
manta). `COBERTURA_IFC` declara "NÃO CONTÉM telhado" desde 04/09/2026.

## Decisões de desenho

### 1. A unidade é a ÁGUA, não o telhado

Cada plano inclinado é um elemento (`Agua`), família `roofs` no modelo. Um
"telhado de duas águas" são dois elementos que compartilham a cumeeira.

**Por que não gerar o telhado inteiro a partir do contorno + inclinação**
(esqueleto reto / straight skeleton): é um algoritmo com casos degenerados
notórios (lados colineares, furos, vértices simultâneos), e errado ele produz
geometria plausível e errada — exatamente o modo de falha que este módulo evita.
O usuário desenha o contorno de cada água, que é como ele já pensa a cobertura;
o kernel resolve a altura, que é o que ele não quer fazer à mão.

### 2. A altura é um PLANO, não uma interpolação

`z(p) = baseMm + d(p) · inclinacaoPct/100`, onde `d(p)` é a distância de `p` até
a **linha do beiral** medida em planta, positiva para dentro do polígono.

Como `z` é função afim de `x` e `y`, o resultado é um PLANO exato: qualquer
polígono em planta, convexo ou não, sobe para um polígono planar no espaço. Não
há triangulação, não há interpolação, não há caso especial.

O beiral é um **índice de lado** (`beiralIndex`), não um vetor de direção:
lado é o que o usuário aponta na tela, e um vetor deixaria gravar direção que
não corresponde a nenhum lado do desenho.

### 3. Inclinação em POR CENTO

Convenção brasileira ("telhado 30%"). Graus é derivado (`atan(pct/100)`), nunca
gravado — dois campos para a mesma grandeza divergem no primeiro arredondamento.

### 4. ÁREA REAL ≠ ÁREA PROJETADA — é a razão de o módulo existir

`areaRealM2 = areaProjetadaM2 · √(1 + (pct/100)²)`

A 30%, são **4,4% a mais**; a 100% (45°), 41% a mais. Quem orça telha pela área
em planta compra a menos, e o erro é silencioso porque o número é plausível. As
duas saem no quantitativo, lado a lado, como `areaEixoM2`/`areaPisoM2` já fazem
no ambiente.

### 5. Platibanda NÃO é entidade nova

É uma parede com altura maior que o pé-direito, e a `Wall` já faz isso. Criar um
tipo para ela duplicaria alvenaria no orçamento.

### 6. `KERNEL_VERSION` 0.11.0 → 0.12.0, com a prova

`roofs` é CONTEÚDO e entra no hash, omitido quando vazio (mesma disciplina de
`structures`). Bump + recaptura de goldens **só depois** de reverter a string de
versão e confirmar que os seis payloads voltam byte a byte ao golden anterior —
o ritual documentado no cabeçalho de `blueprintKernelGoldens.test.ts`.

## Plano — um item por arquivo, com critério de pronto

### Fase 1 — Kernel ✅ (04/09/2026)
- [x] `utils/blueprintKernel/telhado.ts` (novo) — `planoDaAgua`, `alturaNaAgua`,
  `distanciaAoBeiralMm`, `contornoDaAguaEm3d`, `perfilDaAguaNoPlano`,
  `normalDaAgua`, `medirAgua`, `AGUA_INCLINACAO_MAX_PCT`. Pronto:
  `__tests__/blueprintTelhado.test.ts` (33 casos), valores à mão no comentário.
- [x] `model.ts` — `Agua`, `roofs`, `findAgua`, `emptyModel`/`cloneModel`,
  invariantes (`BAD_ROOF_POINTS`, `BAD_ROOF_EDGE`, `BAD_ROOF_SLOPE`,
  `BAD_ROOF_SIZE`, `DEGENERATE_ROOF`, `ROOF_NOT_FOUND`) e `roofs` na trava de uid.
- [x] `commands.ts` — `AddAgua`, `SetAguaProps`, `MoveAguaVertex`, `DeleteAgua`;
  `RemoveLevel` em cascata; `DuplicateLevel`/`DuplicateEntities` copiam com uid
  novo; `TranslateEntities` leva a água junto (`aguaIds`, opcional nos dois).
- [x] `canonical.ts` — `roofs` na geometria (OMITIDA quando vazia) e em
  `identity`; leitura com `?? []` e uid derivado para payload antigo.
- [x] `quantities.ts` — `QuantidadeAgua` + `telhados[]` + totais
  `areaTelhadoM2`/`areaTelhadoProjetadaM2`/`aguas`.
- [x] `units.ts` — **0.11.0 → 0.12.0**, com a prova registrada; `index.ts` exporta.

**A prova do bump, na ordem certa:** com todo o telhado no lugar e a string
ainda em 0.11.0, os sete testes de golden passaram INTACTOS — o que só acontece
se `roofs` de fato não aparece em desenho sem cobertura. Só então a versão subiu,
e as seis falhas foram TODAS de hash, nenhuma de contagem de ambientes
(9/49/144/3/78/4).

**Um teste vizinho mudou de forma:** `blueprintCamadas` congelava
`KERNEL_VERSION` num literal e falhava a cada bump sem acrescentar sinal — quem
obriga a pensar num bump são os goldens. Virou "o payload carrega a versão
CORRENTE", que é o que de fato sustenta a retrocompatibilidade.

### Fase 2 — Vistas ✅ (04/09/2026)
- [x] `utils/blueprintElevation.ts` — `AguaElevacao` (POLÍGONO `{u,v}[]`, a única
  família que não é retângulo) em `ProjecaoElevacao.telhados`; entra no `bbox` em
  `u` e no topo de `v`; a linha do solo não sobe. Pronto:
  `__tests__/blueprintTelhadoVistas.test.ts` (6 casos): cotas 2800/4150 numa água
  de 30% com beiral a 2,80 m; quadro de 6150 → −500..6500; degenerada só na vista
  em que colapsa.
- [x] `components/blueprint/ElevationCanvas.tsx` — pinta o polígono na ordem de
  profundidade (`COR_TELHADO`); `bboxVisivel` inclui o telhado sempre (sem toggle).
- [x] `components/blueprint/Blueprint3DViewer.tsx` — `geometriaDaAgua`: prisma
  inclinado montado DIRETO em coordenadas de mundo (topo = `contornoDaAguaEm3d`,
  base = topo − espessura·normal, laterais), triangulado em planta. **Não** usa
  `ExtrudeGeometry` + rotação: o mapeamento `y → Z` do viewer é uma reflexão e uma
  base de 3 vetores sai canhota num plano inclinado. Câmera enquadra a cumeeira e o
  beiral. Cor de telha, `ocultos` respeitado.
- [ ] Não verificado no navegador (harness `docs/spikes/blueprint-3d` exige o app).

### Fase 3 — Editor
- [ ] `hooks/useBlueprintEditor.ts` — ferramenta `telhado` (polígono, como a
  laje). `MenuComponentes.tsx` — grupo **Cobertura**.
- [ ] `components/blueprint/PainelAguaSelecionada.tsx` (novo) — inclinação, cota
  do beiral, espessura, qual lado é o beiral, e o quantitativo da peça.
- [ ] `BlueprintCanvas.tsx` — desenho em planta: contorno, seta de caimento e
  rótulo da inclinação.
- [ ] Botão **"Gerar do contorno do pavimento"** — `contornoExternoDoNivel` +
  `anelRecuado` com recuo NEGATIVO (meia espessura + beiral). Pronto: uma água
  única cobrindo a casa, com o beiral pedido.

### Fase 4 — Saídas ✅ (04-05/09/2026)
- [x] `blueprintDxf.ts` — camadas `PLANTA-TELHADO` e `ELEVACAO-TELHADO` (ACI 30,
  laranja de telha), contorno + seta de caimento + rótulo "TELHADO 30%"; o beiral
  entra no afastamento das elevações; cobertura reescrita.
- [x] `blueprintIfc.ts` — **`IfcRoof` por pavimento agregando uma `IfcSlab`
  `.ROOF.` por água**. O sólido é `perfilDaAguaNoPlano` extrudado ao longo da
  normal, com `Axis = normal` e `RefDirection = eixoX` — o Y local que o IFC
  deriva cai na subida da rampa. `Pset_RoofCommon` com `ProjectedArea` E
  `TotalArea`, `Pset_SlabCommon.PitchAngle` (radiano), `Qto_Roof/SlabBaseQuantities`
  com a área REAL. `PredefinedType`: FLAT/SHED com uma água, NOTDEFINED com duas
  ou mais (duas águas podem ser GABLE ou duas SHED — não se adivinha).
- [x] `blueprintKernel/telhado.ts` — `PlanoDaAgua.eixoX` (novo). **Sem ele o anel
  HORÁRIO saía espelhado no IFC**: `e` inverte com o sentido do anel, e a base
  `(e, up, normal)` ficava canhota; `eixoX = (n.y, −n.x)` é destra sempre.
- [x] `blueprintPlanilha.ts` — aba **Telhado** (as duas áreas, graus, beiral,
  altura máxima, fórmula) e bloco TELHADO nos totais.
- [x] `blueprintBudget.ts` — escopo `TELHADO` e as medidas `AREA_TELHADO` (real,
  a que compra) e `AREA_TELHADO_PROJETADA`, ambas m², com a trava de unidade.
- [x] `blueprintDiff.ts` — `TELHADO_ADICIONADO/REMOVIDO/MOVIDO/INCLINACAO`,
  pareadas por uid com fallback pelo contorno; peso = área real.
- [x] `blueprintExport.ts` — a água entra no PDF da elevação como POLÍGONO.
- [x] `identity.ts` — prefixo `T` para a família `roof`.
- [x] Pronto: `__tests__/blueprintTelhadoSaidas.test.ts` (16 casos), incluindo a
  prova de que anel anti-horário e horário dão a MESMA normal e a MESMA área.
- [x] Dois testes vizinhos ajustados: `blueprintBudget` usava `AREA_TELHADO`
  como exemplo de medida INEXISTENTE (virou `AREA_PISCINA`), e
  `blueprintPrecisaoMover` lia o delta na posição 3 (o `aguaIds` entrou antes).

### Fase 5 — Persistência
- [ ] Migration `aplicar_2027091800003X_blueprint_telhado.sql` — `object_type`
  aceita `'ROOF'`; RPC explode `payload->'roofs'` com `element_uid`.

### Fase 6 — Verificação
- [ ] `tsc`, suíte, goldens, `check-ui-standard`, build, migration aplicada.

## Estado

- Fase 0 (este plano): feita.
- Fases 1–6: pendentes.
