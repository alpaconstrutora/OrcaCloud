# Hidrossanitário — roadmap para "substituir o projetista"

## Pedido original

Sessão de 28/09/2026 (VS Code). Depois da classificação em
`docs/planos/2026-09-28-hidrossanitario-benchmark-altoqi.md` (323 funcionalidades do AltoQi
Builder Hidrossanitário, critério **"Substituir o projetista"**), a resposta terminava com:

> Se quiser, o próximo passo é transformar isso num roadmap por etapas, como foi feito com a
> análise do Revit.

Resposta do usuário, literal:

> sim

O benchmark (pedido literal, legenda, tabelas e evidências) é a entrada deste plano; os números
abaixo saem dele.

## Estado de partida (28/09/2026, commit `1cde506`, kernel `0.61.0`)

- **168 funcionalidades Essenciais**: 67 ✅, 34 🟡, 67 ❌.
- O que está de pé é o **traçar e quantificar**: água fria e quente automáticas pelas paredes,
  esgoto automático com junção 45° e TQ, kits por ambiente, louça que lança os pontos,
  conexões derivadas desenhadas em 2D bifilar e 3D, quantitativo, orçamento, IFC dos pontos.
- O que falta é o **calcular e entregar**: 101 Essenciais em 10 blocos — pressão (11),
  reservatório e alimentação (19), pluvial (13), ventilação (8), esgoto completo (12),
  tratamento individual (6), prancha (15), memoriais (6), verificação visível (3),
  entregáveis de dados (8).

## Corte e ordem

| Entra | Fica (registrado no fim) |
|---|---|
| Os **101 Essenciais** pendentes, e os itens A que um deles exige para funcionar (ex.: sub-rede para separar o pluvial nos quantitativos; pressurizador e VRP junto da pressão) | O resto dos A, os M e os B viram backlog nomeado: PEX, boiler e solar, aproveitamento de chuva, elevatória, piscina, lançamento em corte, edição no 3D, biblioteca personalizada, imagens no BCF |

**Ordem** (a do benchmark): **pressão primeiro** — é o que o projetista confere antes de tudo,
e destrava avisos, bomba e hidrômetro —; depois **entrega** (prancha e memorial), para que cada
cálculo novo já saia documentado; depois as **normas completas** de água (reservatório e
alimentação) e esgoto (tabelas NBR 8160 e ventilação); por fim os **sistemas inteiros novos**
(pluvial e tratamento). A Etapa 0 vem antes de tudo porque é barata e visível.

## Regras que valem para todas as fases

- **REGRA #8:** uma frente por etapa (`bash scripts/nova-frente.sh hidro-e<N>`); push em `main`
  é o deploy; `conferir-producao.sh` prova. Ritual: `tsc`, suíte cheia, `check-ui-standard` nos
  `.tsx` tocados, `check-xss-sinks`, harness visual quando há desenho (molde:
  `docs/spikes/esgoto-isometrico`), plano atualizado, commit, push, conferência de fora.
- **Modelo único:** só se grava o que o usuário decide (tubo, ponto, peça, hipótese). Vazão,
  perda, pressão, DN sugerido, volume, avisos, memorial e prancha são **derivados** — funções
  puras lendo o modelo, recalculadas a cada mudança, nunca cópia guardada.
- **Kernel:** campo ou entidade nova no canônico → bump de `KERNEL_VERSION` + goldens (um bump por
  fase que muda o payload; fase de cálculo ou de desenho não bumpa).
- **Norma citada com fonte** (NBR, edição, tabela/equação) em cada constante; toda verificação
  com três estados + "não avaliado" — molde `PainelConferenciaNbr` / `blueprintNbr5410.ts`.
- **Hipóteses** (per capita, dias de reserva, intensidade pluviométrica, material do tubo):
  `usePersistedState` primeiro; por estudo no banco quando o usuário pedir (molde armadura/elétrica).
- **Prova na planta real** só em estudo descartável, e conferindo o banco depois (memória
  `feedback_bloqueio_playwright_nao_segurou_autosave_planta`); para a planta do usuário, a
  simulação em memória (teste temporário lendo `draft_payload`) é o jeito seguro.

---

## Etapa 0 — Trilhos rápidos (sem motor novo) · 4 fases

| Fase | Entrega | Onde / reaproveita |
|---|---|---|
| 0.1 Verificação visível ✅ | **Pontas abertas no desenho** (anel vermelho na ponta, contagem na gaveta), **aviso de DN no esgoto** (trecho confirmado menor que o pedido pela UHC, e maior que o necessário), aviso de peça pendente no croqui | `conexoesDerivadas().pontasAbertas` já calcula; `BlueprintCanvas.tsx`; `planejarEsgoto` |
| 0.2 Quantitativo por pavimento ✅ | Tubos por DN, conexões e pontos **por pavimento** e por disciplina; **equipamentos e reservatórios como linhas próprias** (hoje contados como pontos), com volume/modelo | `utils/blueprintQuantitativosPorPavimento.ts` (hoje sem hidráulica), `quantities.ts:porBitola/porConexao` |
| 0.3 IFC de instalação ✅ | Tubo como **`IfcPipeSegment`** (e `IfcDuctSegment` na mecânica), conexões derivadas como **`IfcPipeFitting`** com o tipo (joelho, tê, junção, redução), `Pset` com DN, cota, declividade | `utils/blueprintIfc.ts` (hoje `IfcFlowSegment` genérico; `entidadeDoPontoHidraulico` é o molde) |
| 0.4 Peças que faltam ✅ | Tipos **válvula de descarga, torneira de boia, VRP, registro de esfera**, **bidê, banheira, mictório, ralo linear, ponto de espera** na ficha (peso, UHC, DN mínimo, cota, símbolo) | `utils/blueprintHidraulica.ts:FICHA_DO_PONTO_HIDRAULICO`, `TIPOS_DE_PONTO_HIDRAULICO` (**bump**) |

Fecha 3 Essenciais do bloco "verificação visível", 5 dos "entregáveis de dados", e prepara a
Etapa 4 (boia) e a 1 (VRP).

---

## Etapa 1 — Motor de pressão (NBR 5626:2020) · 4 fases · **fundação**

Transforma o dimensionamento "por velocidade" em cálculo completo de água fria e quente.

| Fase | Entrega | Detalhe |
|---|---|---|
| 1.1 Materiais e perda distribuída ✅ | Tabela de **materiais** (PVC soldável, CPVC, PPR, cobre; PEX fica pronto para o backlog) com diâmetro interno e **rugosidade absoluta**; **perda distribuída por Darcy-Weisbach** com fator de atrito de **Swamee-Jain** (a "fórmula universal" do Anexo da NBR 5626:2020 — cobre "rugosidade dos materiais"); material por trecho (padrão da disciplina, sobrescrevível) | `utils/blueprintHidraulicaPressao.ts` puro; `DIAMETROS` migra para a tabela de materiais. Material no trecho = **bump** |
| 1.2 Perdas localizadas ✅ | **Comprimento equivalente** de cada conexão derivada (joelho 90/45, tê passagem/saída lateral, junção, redução, luva), de registro e de hidrômetro, por DN e material (tabela com fonte) — as conexões já são conhecidas por nó (`conexoesDerivadas`, com `ramais`) | O tê distingue passagem direta × saída lateral pelo `ramais` (colinear ou não) |
| 1.3 Pressão em cada ponto ✅ | Da origem (nível d'água do reservatório = fundo + lâmina) a cada ponto: **pressão disponível = desnível − perdas acumuladas** no caminho; **pressão mínima por aparelho** na ficha (10 kPa dinâmica; valores maiores onde o fabricante pede — chuveiro, válvula de descarga); pressão estática máxima 400 kPa; **aviso de pressão insuficiente/excessiva** na gaveta e no desenho (ponto em vermelho); **simulador** = a mesma conta com hipóteses editáveis (altura da caixa, material) | Três estados por ponto (molde conferência NBR 5410). Pressurizador e VRP (0.4) entram aqui como ganho/queda na linha |
| 1.4 Dimensionar por pressão ✅ | O DN deixa de ser só "velocidade ≤ 3 m/s": **aumenta no caminho crítico até todo ponto atender**; conferência NBR 5626 (vazão, velocidade, pressão dinâmica e estática, DN mínimo) com fonte; perda e vazão suportada do **hidrômetro** | `dimensionarDN` vira a primeira passada; o ajuste por pressão é iterativo e determinístico |

Fecha o bloco **pressão** (11) e o critério "Dimensionamento utilizando critérios normativos".

---

## Etapa 2 — Prancha hidrossanitária · 4 fases

A entrega gráfica. Molde: a prancha elétrica (`utils/blueprintPranchaEletrica.ts`:
`desenharEletrica`, `linhasDaLegenda`) e o planejador `utils/blueprintPranchas.ts`.

| Fase | Entrega | Detalhe |
|---|---|---|
| 2.1 Pranchas de água e de esgoto | `TipoDePrancha` **HIDRAULICA** e **SANITARIA** (e **PLUVIAL** quando a Etapa 6 existir): planta de cada pavimento com a rede bifilar (`faixaDoTubo2D`), conexões (`simbolosDasConexoes2D`), caixas, ø e i %; **legendas automáticas** de condutos (material × DN × cor), peças e símbolos, atualizadas pelo modelo | PDF/DXF pelo caminho de exportação que as pranchas já usam |
| 2.2 Isométrico de prancha | **Esquema isométrico automático** por ambiente molhado e por coluna: projeção isométrica 2D (30°) da rede, com ø, cotas dos pontos e nome das peças — a mesma geometria do 3D (`pecasDasConexoes3D`), projetada | `utils/blueprintIsometricoPrancha.ts` puro; é o "detalhe" hidráulico e sanitário |
| 2.3 Esquema vertical | Corte esquemático de **colunas, TQ e ventilação** por pavimento, com níveis; **legenda automática de colunas** (AF-1, AQ-1, TQ-1, CV-1) | Colunas e TQ já são identificáveis (prumadas com posição fixa entre pavimentos) |
| 2.4 Cotas e indicações | **Cota de nível do tubo** (e de fundo das caixas) na planta, **indicação das peças** (nome da conexão no detalhe), elevações; o corte (`blueprintCorte.ts`) sai na prancha com a rede | fecha os 🟡 do grupo 18 |

Fecha o bloco **prancha** (15).

---

## Etapa 3 — Memoriais e emissão · 3 fases

Molde: `utils/blueprintEletricaExecutivo.ts` (projeto emitido amarrado ao hash do desenho e das
hipóteses, com responsável e ART) e o DOCX de `utils/blueprintMemorialLote.ts`.

| Fase | Entrega | Detalhe |
|---|---|---|
| 3.1 Memorial de cálculo | Derivado do modelo, trecho a trecho: água (ΣP, Q, DN, V, J, perdas, pressão), esgoto (UHC, DN, declividade, cota), reservatório, bomba, pluvial, tratamento — cada seção só aparece se o sistema existe | DOCX e PDF; tabelas iguais às da conferência |
| 3.2 Memorial descritivo | Sistemas, materiais, normas, premissas (hipóteses), peças | texto montado dos mesmos dados |
| 3.3 Emissão com ART | **Conferência hidrossanitária** (NBR 5626, 8160, 10844, 7229) sem falta → emitir; o registro fica imutável e deixa de valer quando o desenho ou as hipóteses mudam | reaproveita `ResponsavelTecnico`, `snapshotHash` |

Fecha o bloco **memoriais** (6) e dá o "entregável para o cliente".

---

## Etapa 4 — Reservatório e alimentação · 4 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 4.1 Consumo e volume | **População** pelos dormitórios do programa (2 por dormitório, 1 por dependência — hipótese editável, com fonte), **per capita** (200 L/hab·dia padrão), dias de reserva → **consumo diário e volume**; **divisão inferior/superior** (hipótese 60/40 quando houver inferior); relatório | Ambientes: `utils/blueprintPrograma.ts` (`DORMITORIO`, `SUITE`); volume sugerido vs. o declarado na caixa |
| 4.2 Papel e peças da caixa | Reservatório com **papel** (SUPERIOR/INFERIOR) e **forma** (prismática/cilíndrica, 3D certo); **boia, extravasor e limpeza** lançados junto da caixa (trechos + peças, DN por norma) | **bump** (papel/forma no terminal) |
| 4.3 Entrada e alimentador | Ponto de **entrada de água** (cavalete + hidrômetro geral) no limite do lote → **alimentador predial** automático até o reservatório (inferior se houver, senão superior), pelas paredes/piso | `arvorePelasParedes` + hidrômetro da 0.4/1.4; perda no hidrômetro da 1.4 |
| 4.4 Recalque | Com inferior + superior: **bomba de recalque**, **sucção e recalque** dimensionados (vazão pelo consumo e horas de funcionamento — Forchheimer), **altura manométrica** (desnível + perdas da Etapa 1), potência | `BOMBA` deixa de ser só peça; relatório de bombas |

Fecha o bloco **reservatório e alimentação** (19).

---

## Etapa 5 — Esgoto e ventilação NBR 8160 · 5 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 5.1 Tabelas da norma | `dnPorUhc` (4 degraus) dá lugar às **tabelas da NBR 8160** por tipo de tubo: ramal de descarga (por aparelho), ramal de esgoto, **tubo de queda** (por UHC e pavimentos), **subcoletor e coletor por declividade** | o plano sabe o papel de cada trecho (ramal/TQ/coletor) na árvore |
| 5.2 Fluxo e verificação | **Sentido do fluxo** gravado no trecho (o automático já sabe; o manual pergunta pela cota); **verificação de declividade e de fluxo em qualquer trecho** (manual incluído): contrafluxo, declividade abaixo da mínima, DN que diminui a jusante — no desenho e na conferência | **bump** (sentido no trecho); fecha "sentido do fluxo", "tubos inadequados", "inconsistências" |
| 5.3 Coletor predial | Da caixa de inspeção à **ligação na rede pública** (ponto no limite do lote com a cota da rede), **caixas de inspeção intermediárias** por distância e deflexão, coletor e subcoletores nomeados | aviso quando a cota da rede não permite a gravidade (→ elevatória, backlog) |
| 5.4 Ventilação | **Ramais de ventilação automáticos** respeitando a **distância máxima do desconector ao tubo ventilador** (tabela da NBR 8160), **colunas dimensionadas** (por UHC e comprimento), **prolongamento acima da cobertura** (até o telhado da E-telhado + 30 cm), verificação da ventilação de cada aparelho | a coluna DN 50 fixa de hoje vira caso particular |
| 5.5 Desvio estrutural | O traçado automático (água e esgoto) **evita pilares e vigas** — os conflitos trecho × estrutura já detectados (`conflitosDoModelo`) viram obstáculos no grafo | molde: `arvorePelasParedes` com nós proibidos |

Fecha os blocos **esgoto completo** (12) e **ventilação** (8).

---

## Etapa 6 — Águas pluviais (NBR 10844) · 4 fases · sistema novo

| Fase | Entrega | Detalhe |
|---|---|---|
| 6.1 Disciplina e contribuição | Disciplina **`PLUVIAL`** (cor, prancha, quantitativo, IFC); **área de contribuição** de cada água do telhado (projeção + inclinação, NBR 10844) e de lajes/terraços; **intensidade pluviométrica** por cidade (tabela com fonte) e período de retorno | `Agua.inclinacaoPct` do telhado já existe. **bump** |
| 6.2 Calhas | Calha como trecho de **seção** (retangular/semicircular) ao longo do beiral, dimensionada por **Manning**; bocais | quantitativo em metro de calha |
| 6.3 Condutores | **Condutores verticais** (ábaco/tabela da norma) e **horizontais** (por declividade), lançamento automático até **caixas de areia** e à sarjeta/rede | reaproveita o motor de árvore do esgoto (sem UHC; com vazão) |
| 6.4 Ralos e quantitativos | Ralos externos e hemisféricos, redes independentes, quantitativo de calhas, conferência NBR 10844 | fecha o grupo 12 (E) |

Fecha o bloco **pluvial** (13).

---

## Etapa 7 — Tratamento individual (NBR 7229 / 13969) · 2 fases · sistema novo

| Fase | Entrega | Detalhe |
|---|---|---|
| 7.1 Unidades | **Tanque séptico, filtro anaeróbio, sumidouro** como peças com corpo (molde `corpoDaCaixa3D`), lançadas no lote a jusante da caixa de inspeção | **bump** (tipos novos) |
| 7.2 Dimensionamento | **V = 1000 + N (C·T + K·Lf)** (NBR 7229), vazão contribuinte pela população da 4.1, **taxa de infiltração do solo** (hipótese), área do sumidouro; relatório e seção no memorial | vala de infiltração/filtração e múltiplos sumidouros ficam no backlog |

Fecha o bloco **tratamento individual** (6).

---

## Etapa 8 — Água quente dimensionada e insumos · 2 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 8.1 Aquecedor de passagem | **Vazão simultânea** dos pontos quentes → **L/min do aquecedor** e escolha do modelo (tabela), com a pressão da Etapa 1 | fecha "aquecedor de passagem" e "dimensionamento das tubulações" de água quente |
| 8.2 Insumo por peça | **Composição de insumos por peça** (conexão, registro, caixa → itens SINAPI), para o orçamento sair por peça e não só por medida | `blueprintBudget.ts` (medidas de hoje) + `itemCode` |

Fecha o bloco **entregáveis de dados** (8, somados aos da Etapa 0).

---

## Sequência e dependências

```
E0 ─┬─► E1 (pressão) ──► E4 (reservatório: 4.3/4.4 usam perdas)
    │        └────────► E8.1 (aquecedor usa pressão)
    ├─► E2 (prancha) ──► E3 (memorial/emissão) ◄── recebe cada cálculo novo
    ├─► E5 (esgoto + ventilação) ──► E7 (tratamento a jusante da CI)
    └─► E6 (pluvial; usa o motor de árvore da E5)
```

Ordem de execução: **E0 → E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8**. E2 e E3 entram cedo de
propósito: a partir delas, cada etapa seguinte acrescenta sua seção à prancha e ao memorial em
vez de deixar a documentação para o fim.

**Tamanho:** 32 fases em 9 etapas; 6 bumps de kernel (0.4, 1.1, 4.2, 5.2, 6.1, 7.1) — as demais são cálculo ou desenho derivado.

## Cobertura dos 101 Essenciais pendentes

| Bloco do benchmark | E pendentes | Onde fecha |
|---|---|---|
| Pressão e perda de carga | 11 | 1.1–1.4 (a parte "Hunter" do item de métodos fica no backlog; os pesos já existem) |
| Reservatório e alimentação | 19 | 4.1–4.4, 1.4 (hidrômetro) |
| Pluvial | 13 | 6.1–6.4 |
| Ventilação NBR 8160 | 8 | 5.4 |
| Esgoto completo | 12 | 5.1–5.3, 5.5, 0.1 (aviso de DN) |
| Tratamento individual | 6 | 7.1–7.2 |
| Prancha hidrossanitária | 15 | 2.1–2.4 |
| Memoriais | 6 | 3.1–3.3 (o relatório do reservatório nasce na 4.1) |
| Verificação visível | 3 | 0.1, 5.2 |
| Entregáveis de dados | 8 | 0.2, 0.3, 0.4, 8.1, 8.2 |
| **Total** | **101** | |

## Fora do plano (backlog nomeado)

| Item | Grau | Por que fica |
|---|---|---|
| PEX com manifold, multicurva, raio mínimo | A/M | a tabela de materiais da 1.1 já deixa o PEX a um passo; manifold é fase própria |
| Boiler, placas solares, recirculação | A/M | aquecimento central é nicho no residencial da incorporadora |
| Aproveitamento de água da chuva (cisterna, Rippl, simulação) | A/M | depende do pluvial (E6); entra logo depois se a cidade exigir |
| Estação elevatória de esgoto | M | aparece como aviso na 5.3 quando a gravidade não fecha |
| Piscinas (NBR 10339) | B | — |
| Lançamento em corte, planta+detalhe simultâneo, edição no 3D | A/M | produtividade, não entrega |
| Biblioteca de peças personalizadas, fabricantes, símbolo/3D próprios | A/M | exige editor de famílias |
| Imagens nas notas BCF, vínculo vivo de IFC externo, filtro por pavimento nas colisões | A/M | coordenação, não projeto |
| Hunter probabilístico para água, sub-redes nomeadas além do pluvial | M/A | a NBR 5626 usa pesos; sub-rede entra só onde uma fase precisar |
| Integração com AltoQi Cloud | N | produto de terceiro |

## Execução

Pedido de execução, mesma sessão (28/09/2026), literal:

> Etapa 0

Frente `hidro-e0`.

### E0.1 — Verificação visível (28/09/2026)

- `utils/blueprintVerificacaoRede.ts` (novo): `marcasDeVerificacao` junta **ponta aberta**
  (`conexoesDerivadas().pontasAbertas`, menos a saída da ventilação, que é aberta de propósito),
  **DN fora do necessário** no esgoto e **louça sem ponto** (`pontosDaLouca`); pavimento da marca
  = o do trecho. `resumoDaVerificacao` para a gaveta.
- `utils/blueprintEsgotoAutomatico.ts:verificarDnDoEsgoto`: todo trecho da rede de cada CI
  (manual incluído) contra as UHC a montante e o maior ramal de descarga, pela mesma regra do
  lançamento; o TQ passa DN ≥ 100 adiante e nunca é "maior"; trecho sem UHC (ventilação) não é
  avaliado. MENOR = erro, MAIOR = aviso.
- Desenho (`BlueprintCanvas.tsx`): anel vermelho tracejado na ponta aberta, texto "DN 50 < 100
  (6 UHC)" junto do trecho, anel âmbar na louça sem ponto — tamanho em pixel.
- Gavetas de água e de esgoto: `PainelVerificacaoDaRede` com a contagem, cada DN fora e
  "Selecionar".
- **Pronto quando** ✔: 7 testes em `blueprintVerificacaoRede.test.ts` — os três de FALSO
  POSITIVO (casa com esgoto automático, sobrado com ventilação, água pelas paredes → nenhuma
  marca) e os casos de cada marca; 3 testes do painel; harness
  `docs/spikes/esgoto-isometrico?vista=2d&defeitos=1` em servidor novo, console limpo (as três
  marcas no lugar). Suíte: 509 arquivos / 5.822 testes.

### E0.2 — Quantitativo por pavimento (28/09/2026)

- `utils/blueprintKernel/quantities.ts`: as linhas de compra da rede saíram de dentro de
  `computeQuantities` para `agruparPorBitola`, `agruparPorTerminal`, `agruparPorConexao`
  (exportadas) — o total e o pavimento usam a MESMA conta. Saída do quantitativo inalterada
  (76 testes de quantitativo/planilha/orçamento/conexões verdes sem mudar uma linha).
- `utils/blueprintQuantitativosPorPavimento.ts`: `redeDoPavimento` (tubo por DN, ponto,
  conexão de um nível; sem nível = o total, tal qual); a conexão é do pavimento do TRECHO
  dela (o ramal sob o piso do andar é do andar); `reservatoriosPorVolume`; `familiaDoPonto`;
  a linha do pavimento ganhou tubo hidráulico (m), pontos e conexões.
- `TelaQuantitativos.tsx`: aba **Instalações** com o filtro de pavimento (ao lado do de
  disciplina); **caixa d'água pelo volume** (família Reservatório), aquecedor/bomba/hidrômetro
  como **Equipamento**, CI/CS/CG/ralo sifonado como **Caixa**; aba **Por pavimento** com a
  coluna Instalações.
- **Pronto quando** ✔: sobrado com esgoto automático — a SOMA dos pavimentos fecha com o
  total em metros, conexões e pontos; conexão sob o piso do andar contada no andar; teste de
  tela (aba Instalações, filtro Superior some com a caixa de 500 L do térreo e o aquecedor).
  Suíte: 510 arquivos / 5.826 testes.

### E0.3 — IFC de instalação (28/09/2026)

- `utils/blueprintIfc.ts`: o trecho sai na **classe da rede** — `IfcPipeSegment .RIGIDSEGMENT.`
  (água fria, quente, esgoto), `IfcCableCarrierSegment .CONDUITSEGMENT.` (eletroduto),
  `IfcDuctSegment .RIGIDSEGMENT.` (duto) — com `Qto_PipeSegment…`/`Qto_CableCarrierSegment…`/
  `Qto_DuctSegmentBaseQuantities`; `Pset_OpuraInstalacao` ganhou `CotaAMm`, `CotaBMm`,
  `DeclividadePct` (esgoto) e `Sugerido`.
- As **conexões derivadas** saem como `IfcPipeFitting` (.BEND./.JUNCTION./.CONNECTOR./
  .TRANSITION.) com uma bolsa por boca (a forma do 3D), no pavimento do TRECHO, no
  `IfcDistributionSystem` da rede e com `Pset_OpuraConexao`; a conexão MANUAL continua saindo
  só pelo ponto dela. `solidoAoLongo` é o cilindro compartilhado por trecho e conexão.
- `supabase/functions/planta-api/kernel.bundle.mjs` regerado (`scripts/build-planta-api-kernel.mjs`)
  — o teste de frescor da E9.2 acusou, como deve.
- **Pronto quando** ✔: `ifcIdaEVoltaProprio` (web-ifc): nenhum `IfcFlowSegment`; eletroduto e
  cano lidos com `PredefinedType` certo; um "L" de esgoto → um `IfcPipeFitting` "Joelho 90° DN
  100", BEND, com malha. `ifcContagemDeAtributos` com as entidades novas na lista verificada pelo
  web-ifc. `plantaApi.test.ts` (paridade do bundle). Suíte cheia verde.
- Publicado `90b7e7c`; **`planta-api` redeployada** com o bundle novo e o gate provado de fora
  (REGRA #7): sem token → 401, token falso → 401, `/docs` → 200.

### E0.4 — Peças que faltam (28/09/2026) · kernel 0.62.0 · fecha a Etapa 0

- **Kernel** (bump 0.61.0 → 0.62.0, ritual dos goldens: com a string em 0.61.0 e os tipos no
  lugar, 294 testes de kernel/goldens/hidráulica passaram; depois do bump as seis falhas foram
  todas de hash, contagem de ambientes intacta — recapturados; 12 testes que fixam a versão
  atualizados): `TIPOS_DE_PONTO_HIDRAULICO` + **BIDE, BANHEIRA, MICTORIO, VALVULA_DESCARGA,
  PONTO_ESPERA, TORNEIRA_BOIA, RALO_LINEAR, REGISTRO_ESFERA, VRP**, com as disciplinas de cada.
- **Ficha** (`blueprintHidraulica.ts`): peso NBR 5626 (válvula de descarga = 32, DN 32), UHC
  NBR 8160, DN mínimo, cota usual, medidas (ralo linear 700 × 70); o ponto de espera entra com a
  hipótese de um lavatório (peso 0,3 · 1 UHC), dita na ajuda.
- **Esgoto automático:** RALO_LINEAR é coletor (como a caixa sifonada); bidê e banheira são
  aparelhos do coletor do ambiente.
- **IFC:** bidê `.BIDET.`, banheira `.BATH.`, mictório `.URINAL.`, válvula de descarga
  `IfcValve .FLUSHING.`, VRP `.PRESSUREREDUCING.`, registro de esfera `.ISOLATING.`, ralo linear
  `IfcWasteTerminal .FLOORTRAP.`, boia `IfcValve .USERDEFINED.`, espera `IfcSanitaryTerminal
  .USERDEFINED.`.
- **Pronto quando** ✔: taxonomia (14; o caso de "valor inventado" usava 'BIDE' e passou a usar
  um inventado de fato), esgoto com ralo linear (o chuveiro do box entra nele), web-ifc lê bidê
  BIDET, banheira BATH e VRP PRESSUREREDUCING. Bundle da `planta-api` regerado (0.62.0).
  Suíte: 510 arquivos / 5.829 testes.

**Etapa 0: 4 de 4 fases publicadas.**

---

Pedido de execução da Etapa 1, mesma sessão (28/09/2026), literal:

> sim

Frente `hidro-e1`.

### E1.1 — Materiais e perda distribuída (28/09/2026) · kernel 0.63.0 · quant-1.17.0

- **Kernel** (0.62.0 → 0.63.0, ritual: com a string em 0.62.0 e o campo no lugar a suíte inteira
  — 5.836 testes — passou; depois do bump só os seis hashes, recapturados; 12 pins de versão):
  `MATERIAIS_DE_TUBO` (PVC soldável, CPVC, PPR, cobre), `materialPadraoDaDisciplina` (PVC na
  fria, CPVC na quente), `materialDoTrecho`; `Trecho.material?` só em água fria/quente
  (`BAD_PIPE_MATERIAL`), em `AddTrecho`/`SetTrechoProps` (`null` volta ao padrão), omitido do
  canônico quando ausente.
- `utils/blueprintHidraulicaPressao.ts` (novo): `FICHA_DO_MATERIAL` (diâmetro interno por DN e
  rugosidade, com a norma de produto como fonte), `diametroInternoMm`, `fatorDeAtrito`
  (64/Re; Swamee-Jain), `perdaDistribuida` (Darcy-Weisbach, viscosidade 20 °C / 60 °C). O
  `DIAMETROS` da água automática passou a sair dessa tabela.
- **Quantitativo quant-1.17.0**: `material` no trecho e na linha de compra; PVC e PPR do mesmo DN
  viram duas linhas. Rótulos (tela, planilha, orçamento) com o material no FIM — o filtro que
  procura "Água fria DN 25" continua casando; o `ref` do orçamento só muda quando o material
  foge do padrão. Portão "MUDOU A FÓRMULA? A VERSÃO TEM QUE SUBIR" registrado.
- **Tela:** "Material" no painel do trecho de água (com "Padrão da rede (PVC soldável)");
  **IFC:** `Pset_OpuraInstalacao.Material`.
- **Pronto quando** ✔: 7 testes em `blueprintHidraulicaPressao.test.ts` — canônico ida e volta,
  invariante, quantitativo separado por material, **Darcy a menos de 15 % de Fair-Whipple-Hsiao**
  (a fórmula clássica do PVC) em quatro casos residenciais, valor conferido à mão (PVC DN 25 a
  0,3 L/s → 0,82 m/s, J 0,044 m/m), laminar 64/Re, quente perde menos; 2 testes do painel.
  Suíte: 511 arquivos / 5.836 testes (+ os novos). Publicado `66f549e`; `planta-api`
  redeployada (0.63.0), gate provado (401/401/200); domínio conferido.

### E1.2 + E1.3 — Perdas localizadas e pressão em cada ponto (28/09/2026)

Publicadas juntas: a perda localizada só aparece no resultado de pressão.

- **E1.2** (`blueprintHidraulicaPressao.ts`): `COMPRIMENTO_EQUIVALENTE_M` por peça e DN 20…75
  (tabela usual de PVC rígido — anexo da NBR 5626:1998 e catálogos; aplicada a todos os materiais,
  aproximação declarada), interpolada entre DN (CPVC 22, 28…); tê de PASSAGEM × SAÍDA LATERAL;
  redução como joelho 45°; luva sem perda; entrada/saída; `perdaNoHidrometroKpa` — NBR 5626:
  Δh = (36·Q)²·Qmáx⁻² (100 kPa na vazão máxima).
- **E1.3** (`utils/blueprintPressaoDaRede.ts`, novo): `pressoesDaOrigem` percorre a rede em árvore
  da origem; em cada trecho, desnível − perda distribuída − conexão do nó de montante (tê pela
  geometria: saída alinhada com a chegada = passagem) − peças sobre o trecho (registros,
  válvula de retenção, hidrômetro); a VRP limita a jusante (dinâmica e estática) ao ajuste.
  Mínima: 10 kPa (NBR 5626:2020) ou a da ficha (`pressaoMinimaKpa`: válvula de descarga 20);
  estática máxima 400 kPa. Estados OK / INSUFICIENTE / EXCESSIVA / NÃO AVALIADO (sem caminho —
  nunca zero). Ponto crítico = menor folga. `pressoesDoModelo`: frias primeiro, e a QUENTE parte do
  que a fria entrega ao aquecedor menos a perda dele (hipótese). Hipóteses (`HIPOTESES_PRESSAO_PADRAO`):
  lâmina 0, aquecedor 20 kPa, VRP 200 kPa, hidrômetro Qmáx 3 m³/h.
- **Tela:** gaveta da água com `PainelPressoesDaAgua` (tabela por rede, crítico, estado, ponto
  selecionável, hipóteses editáveis = simulador, persistidas em `blueprint:pressaoDaAgua`); marcas
  `PRESSAO_BAIXA`/`PRESSAO_ALTA` no desenho, calculadas com as MESMAS hipóteses da gaveta.
- **Pronto quando** ✔: 9 testes em `blueprintPressaoDaRede.test.ts` — rede simples CONFERIDA À
  MÃO (2,20 m menos a perda em 6,8 m equivalentes), caixa baixa = insuficiente, tê passagem × lateral
  com os comprimentos da tabela, prédio de 45 m = excessiva e VRP segura em 200, hidrômetro pela
  fórmula, ponto solto = não avaliado, água quente a partir do aquecedor; marca no desenho; 2 testes
  do painel. Harness `?cena=agua&vista=2d`: chuveiro 70 cm abaixo do fundo da caixa marca −0,6 kPa
  e a pia 4,6 kPa — a rede dimensionada só por velocidade (DN 20) não atende: é o que a 1.4 resolve.
  Suíte: 514 arquivos / 5.859 testes.

### E1.4 — Dimensionar por pressão (28/09/2026) · fecha a Etapa 1

- `blueprintPressaoDaRede.ts`: `ajustarDnPorPressao` — enquanto houver ponto INSUFICIENTE, no
  caminho do de menor folga aumenta em UM DN comercial (tabela do material) o trecho SUGERIDO de
  maior perda por metro, e recalcula (determinístico, até 80 passos). Não mexe em trecho
  confirmado (aviso "aumente à mão"); se nem a estática chega à mínima, desiste do ponto com o
  aviso "nenhum diâmetro resolve; eleve a caixa ou pressurize". `comAjusteDePressao(model, plano)`
  aplica o plano numa cópia e devolve o mesmo plano com os `SetTrechoProps` no fim — UM lote, um
  Ctrl+Z (os ids dos trechos novos são os que o editor dará: kernel determinístico). O cálculo
  passou a devolver `caminhos` (trechos da origem a cada ponto) e `avisos` — **vazão suportada do
  hidrômetro** (acima da Qmáx).
- Editor: `planosDeAgua`, "Relançar" e "Refazer" saem já com o ajuste (com as hipóteses de
  pressão da gaveta). O primeiro dimensionamento continua sendo o de velocidade; a pressão manda
  onde for mais exigente.
- **Pronto quando** ✔: 4 testes — a sala que a velocidade deixa INSUFICIENTE sai toda OK depois do
  ajuste, só com trechos sugeridos e DN comercial; chuveiro 70 cm abaixo da caixa → "nenhum
  diâmetro resolve"; trecho confirmado → aviso e nenhum comando; hidrômetro pequeno → aviso de
  vazão. Harness `?cena=agua&vista=2d`: a marca da pia some (o trecho vai a ø25), a do chuveiro
  fica (só o desnível resolve). Suíte: 514 arquivos / 5.863 testes.

**Etapa 1: 4 de 4 fases publicadas.**


### E2.1 — Pranchas de água e de esgoto (28/09/2026)

- `utils/blueprintPranchaHidro.ts` (novo, puro): `desenharHidrossanitaria` põe a rede por cima da
  planta — tubo **bifilar** quando a largura real passa de 0,8 mm no papel (duas bordas e o miolo
  claro), senão traço; as conexões derivadas (`simbolosDasConexoes2D`: bolsas e disco no nó); caixas
  de esgoto com tampa e o reservatório com a pegada gravada; pontos com a sigla; prumada como
  círculo com o nome; ø e i % (`rotuloDoTrecho2D`) ao lado do tubo, do lado de cima e sem cruzar o
  traço (`posicaoDoRotulo`). `itensDaLegendaHidro`/`desenharLegendaHidro`: a legenda só do que
  EXISTE — condutos por rede × material × DN com a amostra da cor, conexões, pontos e peças.
- Conjunto de pranchas: `TipoDePrancha` **HIDRAULICA**, **SANITARIA** e **DETALHES_HIDRO**;
  `incluir.hidraulica` / `incluir.sanitaria` (padrão desligado; o executivo A0 de fábrica liga e
  passou a se chamar "executivo + instalações"). Uma planta por pavimento **que tem a rede**
  (`temRedeNoPavimento`) e uma folha "Legenda e detalhes hidrossanitários" no fim (a E2.2 põe os
  isométricos nela). `desenharConjunto` tem os três `case` — o `default: break` mudo não engole.
- Exportação avulsa (aba Versões): pranchas "Hidráulica" e "Esgoto" no PDF e no PNG, com a
  folha de legenda uma vez só; no DXF, camadas `PLANTA-AGUA(-TEXTO)` e `PLANTA-ESGOTO(-TEXTO)`
  (tubo na largura real em mm do mundo, textos no tamanho de papel a 1:50) e a linha na
  `COBERTURA_DXF`. `ehPlantaDaPrancha` junta as cinco "plantas" que antes eram três `||` repetidos.
- **Pronto quando** ✔: 9 testes em `blueprintPranchaHidro.test.ts` — sem a opção a planta é a de
  sempre; água sem nada de esgoto e vice-versa; ø100 bifilar a 1:50 com "i 2 %", "TQ1 ø100" e a CI;
  legenda estável; conjunto só com o pavimento que tem rede e sem folha de legenda quando não há
  rede; nenhuma folha em branco; DXF com as bordas do ø100 a 50 mm do eixo. Harness
  `docs/spikes/prancha-hidro` (porta 3147): banheiro + área com água e esgoto automáticos, três
  folhas A3 conferidas no olho. Suíte: 515 arquivos / 5.872 testes; build ok.

### E2.2 — Isométrico de prancha (28/09/2026)

- `utils/blueprintIsometricoPrancha.ts` (novo, puro): `isometricosDoModelo` — um por pavimento ×
  rede (água, esgoto) × ambiente que tem ponto dessa rede; os trechos entram **recortados** na
  caixa do ambiente (+300 mm de folga, para pegar o ponto na face da parede) por Liang–Barsky com
  a cota interpolada — o tronco que segue até a CI lá fora não esmaga o detalhe. Z = elevação do
  pavimento + cota. `projetarIsometrico`: isométrico VERDADEIRO a 30° (1 m em x, y ou z mede 1 m).
  `desenharIsometrico`: título "Água — Banheiro (Térreo)", a maior escala da lista que cabe, ø em
  cada tubo (sem cruzar o traço), nó de cada conexão, e cada ponto com "sigla · h 0,60".
  `desenharIsometricos`: grade com células perto de 3:2; abaixo de 35 mm de altura não desenha e a
  folha diz "+N isométrico(s) não couberam — use um papel maior".
- A folha "Legenda e detalhes hidrossanitários" (conjunto e exportação avulsa) traz os
  ISOMÉTRICOS abaixo da legenda.
- Fica para depois: isométrico **por coluna** (sai com o esquema vertical, 2.3) e o nome da
  conexão no detalhe (2.4).
- **Pronto quando** ✔: 6 testes em `blueprintIsometricoPrancha.test.ts` — verdadeira grandeza nos
  três eixos; recorte com cota interpolada e prumada inteira; um isométrico por ambiente × rede,
  com o ramal de 5,4 m cortado em x = 2300; ø25 e "LV · h 0,60" no papel e tudo dentro da caixa;
  a folha com "ISOMÉTRICOS" e a contagem do que não coube. Harness `docs/spikes/prancha-hidro`:
  quatro isométricos (água e esgoto do banheiro e da área de serviço) numa A3.

### E2.3 — Esquema vertical (28/09/2026)

- `utils/blueprintEsquemaVertical.ts` (novo, puro): `colunasDoModelo` agrupa os trechos VERTICAIS
  da mesma disciplina no mesmo (x, y), em qualquer pavimento, e numera no desenho inteiro — AF-n,
  AQ-n, TQ-n (+ CV-n quando o TQ tem ventilação), por x e depois y. Fica de fora a **descida ao
  ponto** (vertical com uma ponta na cota de um ponto da rede a até 200 mm: o ponto na face, a
  descida no eixo da parede), salvo o que é coluna de fato: no esgoto o que o planejador chamou de
  "TQ"/"Ventilação"; na água o que chega ao teto ou ao piso (atravessa a laje).
  `desenharEsquemaVertical`: pavimentos como linhas de nível com nome e cota, a cobertura
  tracejada, uma vertical por coluna (ventilação tracejada, travessia da laje desenhada), ø em cada
  mudança, a saída de cada ramal e a **legenda das colunas**; escala vertical da lista.
- Folha nova **ESQUEMA_HIDRO** no conjunto (depois da legenda, só quando há coluna das redes
  pedidas) e na exportação avulsa (PDF e PNG, depois da legenda).
- A planta de cada pavimento usa o MESMO nome (`nomesDasColunas`, calculado no desenho inteiro e
  levado em `OpcoesExportacao.nomesDasColunas`): os verticais empilhados no mesmo ponto viram UM
  círculo com "TQ-1 · CV-1 ø100" — antes saíam "TQ" e "Ventilação" escritos um sobre o outro.
- **Pronto quando** ✔: 7 testes em `blueprintEsquemaVertical.test.ts` com um sobrado lançado pelos
  planejadores — AF atravessando os dois andares, UM TQ com CV, nenhuma "coluna" no chuveiro, no
  lavatório ou na sifonada; legenda com a CV logo depois do TQ; esquema com +0,00/+2,90/+5,70;
  filtro por rede; planta do superior com "TQ-1 · CV-1"; folha no fim do conjunto. Harness
  `docs/spikes/prancha-hidro?cena=sobrado` conferido no olho. Suíte: 517 arquivos / 5.884 testes.

### E2.4 — Cotas e indicações (28/09/2026) · fecha a Etapa 2

- Planta: o tubo de ÁGUA leva a altura ("ø25 mm · h 2,20"; "de → para" quando inclina); a caixa
  de esgoto leva a cota da TAMPA e a do FUNDO relativas ao piso ("CT −0,10 · CF −0,70", de
  `extensaoVerticalDaCaixa`). O esgoto continua com ø e i % no tubo.
- Isométrico: a peça em cada nó pela sigla (`SIGLA_DA_CONEXAO`: J90, J45, T, Y, X, L, R) e a
  legenda da folha passa a dizer "J90 — Joelho 90°". O nó só entra se for de um tubo DESTE
  isométrico, com o z da ponta do tubo — o kernel encontra os andares na laje (piso de cima =
  teto de baixo) e a elevação conta a espessura dela; antes, os nós do andar de cima ficavam
  soltos no ar no isométrico do térreo.
- Corte na prancha: `OpcoesExportacao.instalacoesNoCorte` — a rede atrás do plano em linha na cor
  da disciplina (esgoto tracejado, como na tela) e a cortada na cor da disciplina em vez do cinza
  da parede. Liga sozinho no conjunto com hidráulica/esgoto e na exportação avulsa com as pranchas
  hidrossanitárias marcadas; o corte arquitetônico de sempre não muda.
- **Pronto quando** ✔: testes novos em `blueprintPranchaHidro`, `blueprintIsometricoPrancha` e
  `blueprintEsquemaVertical` — "h 2,20" no tubo, CT/CF na CI, "J90" no detalhe, nenhum nó solto no
  isométrico do sobrado, corte sem a opção = zero traço de água e com ela > 0 (e o conjunto liga).
  Harness `prancha-hidro?cena=sobrado` com a 5ª folha, o Corte AA. Suíte: 521 arquivos / 5.905
  testes.

**Etapa 2: 4 de 4 fases publicadas.** Fica para depois (backlog): isométrico por COLUNA (o esquema
vertical cobre o traçado das colunas) e anticolisão dos rótulos na planta.

### E3.1 + E3.2 — Memorial de cálculo e memorial descritivo (28/09/2026)

- `utils/blueprintMemorialHidro.ts` (novo, puro): os memoriais como BLOCOS (título, seção,
  parágrafo, tabela), derivados do modelo a cada vez. **Cálculo:** premissas; água por origem,
  trecho a trecho (Abastece, material, DN, L, ΣP, Q, V, J, hf distribuída e localizada, P a
  jusante — de `pressoesDoModelo`, o mesmo cálculo das marcas) e ponto a ponto (disponível ×
  mínima × estática) com o ponto crítico; reservação SÓ com medidas declaradas (volume bruto);
  esgoto com aparelhos × UHC, trechos (UHC, DN × DN mínimo, L, i × i mínima, cotas — de
  `esgotoTrechoATrecho`, o mesmo percurso da verificação do DN) e caixas (tampa/fundo); colunas
  (E2.3). **Descritivo:** objeto, normas, sistemas, materiais, peças por pavimento, premissas,
  execução e ensaios. Cada seção só sai se o sistema existe; premissa de aquecedor/hidrômetro só
  com a peça no desenho. `linhasDoMemorial`/`blocosDasLinhas`: texto para a emissão (E3.3), ida e
  volta sem perda.
- `utils/blueprintEsgotoAutomatico.ts`: `esgotoTrechoATrecho` (cálculo por trecho) e
  `verificarDnDoEsgoto` virou esse cálculo filtrado. ⚠️ **Achado pelo memorial:** o lançamento
  arredondava a queda (`Math.round`) — 0,72 m a 2 % davam 14 mm = **1,94 %**, abaixo da mínima que
  ele mesmo promete. Agora arredonda para cima.
- Arquivos: `services/blueprintMemorialHidroService.ts` — PDF com tabelas (jspdf-autotable; A4
  deitado quando há tabela larga; rodapé com "página x de y"; Σ √ − Δ → trocados por texto, que a
  fonte WinAnsi não tem) e DOCX (`utils/blueprintMemorialDocx.ts`: WordprocessingML mínimo, pizzip
  com DEFLATE, cabeçalho de tabela repetido). ⚠️ O roadmap dizia "o DOCX de
  `blueprintMemorialLote`" — ele não existia (o do loteamento sai em .txt); este é o primeiro.
- Tela: ribbon Hidráulica → grupo **Documentos → Memoriais** (gaveta "Memoriais
  hidrossanitários", `PainelMemoriaisHidro`): o sumário das seções de cada memorial e PDF/DOCX; sem
  rede, botões desligados dizendo por quê. As premissas são as das gavetas de água, pressão e
  esgoto (ainda por navegador — ver E3.3).
- **Pronto quando** ✔: 14 testes em `blueprintMemorialHidro.test.ts` com o sobrado lançado pelos
  planejadores (`__tests__/fixtures/sobradoHidro.ts`, agora compartilhado com o esquema vertical) —
  seções na ordem; linha a linha igual a `pressoesDoModelo`/`esgotoTrechoATrecho`; ΣP de volta da
  vazão; UHC somando; DN reduzido à mão aparece como "DN abaixo do exigido (100)"; declividade do
  lançamento ≥ mínima; reservatório 1,2 × 1,0 × 0,8 = 960 L; só esgoto sem premissa de água; ida e
  volta do texto com "|" e célula vazia; DOCX escapado e deitado; troca WinAnsi. 3 testes do painel.
  PDF (3 págs. de cálculo, 2 de descritivo) conferido no olho; DOCX aberto pelo mammoth sem erro.
  Suíte: 526 arquivos / 5.942 testes; build ok.
