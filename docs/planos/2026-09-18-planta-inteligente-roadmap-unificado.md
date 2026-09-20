# Planta Inteligente — roadmap unificado (motores + ferramentas)

**Pedido original (18/09/2026):** o usuário trouxe duas listas de referência contra o Revit 2026 —
a primeira graduada E/A/M/B/N ("ferramenta para o ciclo da incorporadora, não clone de BIM"), a
segunda graduada P0–P4 com a arquitetura de **cinco motores** (Geométrico, Paramétrico BIM,
Regras/Legislação, Generativo, Avaliação/Otimização) — pediu a comparação com o que existe e,
depois, *"um plano de implementação de tudo, unificando as duas listas"*.

**Estado medido no código (18/09):** motor Geométrico ✅ (arranjo planar, mitra, encaixe, undo,
60 comandos determinísticos); camada de saída ✅ (2D↔3D, cortes/elevações, cotas automáticas,
pranchas PDF/DXF/IFC, quantitativos, orçamento SINAPI, 4D, comentários/aprovação, MEP e estrutura
preliminares além do pedido). Ausentes: **Paramétrico** (tipos genéricos, parâmetros, fórmulas,
restrições, eixos), **Regras** (só leitura de 9 parâmetros da zona), **Programa/grafo espacial**,
**Gerador** (Planta AI gera 3 cenários de massa, sem planta), **Avaliação** (score de massa),
**pavimento tipo/unidades/núcleo vertical**, DWG, API pública, fases, multiusuário.

## Corte e ordem

| Entra | Fica |
|---|---|
| P0 e P1 das duas listas (≈ E e A) | P2 → backlog nomeado no fecho; P3/P4 fora (render, cálculo estrutural, fabricação, Dynamo, worksets, gbXML) |

Ordem = fundação antes de volume: cada motor entra com as ferramentas que ele destrava, para que
toda fase seja visível ao usuário. Dependências entre etapas estão declaradas; dentro de uma etapa
as fases são sequenciais e publicáveis sozinhas.

## Regras que valem para todas as fases

- Frente `planta-ribbon`; push em `main` = deploy. Ritual: `tsc`, `check-ui-standard` nos tsx,
  suíte cheia, `build`, doc nesta pasta, commit, push, espera domínio + CI. Prova no app real
  com escritas bloqueadas.
- Kernel determinístico: entidade/campo novo entra no canônico → **bump de `KERNEL_VERSION` +
  ritual dos goldens** (um bump por fase que mexe no payload; fases de UI não bumpam).
- Derivado nunca é gravado (`recomputeSpaces` é o molde): fórmulas, restrições satisfeitas,
  grafo espacial, score e conferências são **leituras** do modelo.
- Hipóteses/pesos: `usePersistedState` primeiro; por estudo no banco quando o usuário pedir
  (molde armadura).
- Toda regra/norma citada com fonte, e toda conferência com três estados + "não avaliado"
  (molde `PainelConferenciaNbr`).
- Português; "tela" in-flow (`data-tela`, `space-y-6 pb-20`), nunca `fixed inset-0`.

---

## Etapa 0 — Trilhos rápidos (sem motor novo) · 4 fases

O que é P0/P1 e cabe no que já existe. Serve de aquecimento e reduz a lista antes da fundação.

| Fase | Entrega | Onde / reaproveita |
|---|---|---|
| 0.1 Gestos | **Rotacionar seleção** (`RotateEntities`, ângulo em graus inteiros × 10, molde `MirrorEntities`), **Alinhar** (paredes/pilares selecionados à parede de referência: projeta pontas na reta), **Matriz** (N cópias com passo — gaveta sobre `DuplicateEntities`) | `utils/blueprintKernel/commands.ts`, `utils/blueprintSelecao.ts` (`comandoDeEspelhamento` é o molde), botões em `gruposDoAcessoRapido` e aba Modificar |
| 0.2 Tags e cotas | **Numeração de portas/janelas** (P01…/J01… determinística por pavimento, molde `prefixoDeRotulo`), **cota de nível em planta** (símbolo com a elevação do `Level`), **volume do ambiente** (área × pé-direito do pavimento) na tabela de ambientes | `BlueprintCanvas.tsx`, `quantities.ts`, `TelaQuantitativos.tsx`; sem payload novo |
| 0.3 Vistas fixas | **Planta de situação** (lote + norte + vizinhança), **implantação** (recuos + envelope + projeção do telhado), **cobertura** — entradas em `VISTAS_FIXAS` | `SeletorDeVista.tsx`, `BlueprintCanvas.tsx` (filtros de família por vista) |
| 0.4 Clash arquitetônico | **Pilar × porta/janela**, **escada × viga/pilar**, **shaft × estrutura** (quando shaft existir, E2) no mesmo `Conflito` do clash MEP; navegação até o conflito já existe | `utils/blueprintKernel/index.ts` (clash), `PainelConflitos.tsx` |

Sem bump de kernel (nenhum campo novo). Testes: `blueprintSelecao.test.ts` (rotação/alinhar), editor.

---

## Etapa 1 — Motor Paramétrico BIM · 5 fases · **fundação**

Objetivo: "20 objetos verdadeiramente paramétricos". Nada de Family Editor: **tipo + parâmetros +
fórmulas + restrições** sobre as famílias que já existem.

| Fase | Entrega | Detalhe |
|---|---|---|
| 1.1 Tipos genéricos | `tipoId?` em Wall (já é composição), Opening (já), Structural, Terminal, Escada, Agua; tabela única `blueprint_element_types` por organização (`familia`, `nome`, `propriedades JSON`) substituindo `blueprintWallTypeService`/`OpeningTypeService` por um `blueprintTypeService` | Instância herda do tipo; sobrescrita por instância marcada. Painel "Tipo" comum (`CamposQueAplicam.tsx` é o molde de "aplica a N"). **Bump** |
| 1.2 Parâmetros personalizados | `blueprint_parameter_definitions` (org): nome, chave, unidade, tipo (número/texto/booleano/lista), escopo (família ou tipo), **fórmula opcional**, `compartilhado` (aparece no IFC como Pset e na planilha). Valor por tipo e por instância: `parametros?: Record<chave, valor>` no canônico | Ida e volta no `canonical.ts`; `Pset_OPURA_Personalizado` em `blueprintIfc.ts`; coluna na planilha. **Bump** |
| 1.3 Motor de fórmulas | `utils/blueprintFormulas.ts` puro: parser próprio (aritmética, comparação, `se()`, `min/max/arred`, unidades mm/m/m²), variáveis = propriedades nativas (`largura`, `altura`, `area`, `perimetro`, `comprimento`, `espessura`, `pavimento.peDireito`) + parâmetros + do tipo; avaliação derivada por entidade com detecção de ciclo; erro vira aviso, nunca quebra o desenho | Reusado pela E3 (regras) e E5 (pesos). Testes de tabela: 40 expressões |
| 1.4 Restrições e eixos | Entidade `Eixo` (linha nomeada A,B…/1,2…, por projeto, todos os pavimentos) com encaixe; entidade `Restricao` {tipo: `TRAVA_COMPRIMENTO`, `IGUAL_COMPRIMENTO`, `DISTANCIA` (offset a eixo/parede), `ALINHADO_A_EIXO`, `PARALELO`; alvos por uid}. Solver incremental: ao mover, projeta iterativamente (máx. 8 passos) como `pontasPresasAsPecas` já faz; se não converge, **mantém o gesto e acusa a restrição violada** (nunca trava o usuário) | Pilares automáticos passam a nascer nos eixos; malha estrutural = eixos. Planos/linhas de referência = eixo sem nome. **Bump** |
| 1.5 Objeto Inteligente | Ficha unificada `fichaDoElemento(uid)`: geometria + tipo + parâmetros + fórmulas + custo (do orçamento) + material + fabricante/código (E7) + conformidade (E3), exibida no painel e exportada; "Porta: hospedeira, ambiente origem/destino (do grafo E4), acessível?" | Só leitura; junta o que as etapas anteriores criaram |

Dependências: 1.3 depende de 1.2; 1.4 de 1.3 (distância pode ser fórmula).

---

## Etapa 2 — Pavimento tipo, unidades e núcleo vertical · 5 fases

O eixo "incorporadora": repetição controlada e a unidade como objeto.

| Fase | Entrega | Detalhe |
|---|---|---|
| 2.1 Pavimento tipo | `Level.tipoDeId?` (vinculado a outro nível) + `repeticoes`; **editar o tipo propaga** (o vinculado é re-derivado: geometria do tipo transladada em Z, ids estáveis por `uid` de origem); desvincular = cópia (`DuplicateLevel` atual). Térreo/cobertura/subsolo = níveis soltos | Painel Pavimentos ganha "Tipo de N pavimentos"; quantitativo por pavimento já existe. **Bump** |
| 2.2 Unidade | Entidade `Unidade` {numero, tipologia, pcd, spaceUids[]} — polígono DERIVADO da união dos ambientes; **área privativa** (ambientes + metade das paredes geminadas + paredes externas inteiras — critério NBR 12721, reusar `utils` do módulo Áreas), **área comum** = pavimento − Σ privativas, **fração ideal** = privativa/Σ; parede geminada marcada; tabela de unidades (tela) e etiqueta na planta | Ponte com Planta AI: `plantaAiMaterializeService` cria `Unidade` do `plant_unit`. **Bump** |
| 2.3 Grupo com origem | `Grupo` {origemUids[], instancias: [{transformacao: translação+rotação+espelho}]}; editar a origem propaga às instâncias; "Repetir unidade" = criar grupo e instanciar espelhada/rotacionada (usa 0.1 e `MirrorEntities`) | Unidade tipo = Grupo + Unidade. **Bump** |
| 2.4 Núcleo vertical | `Shaft` (polígono em laje, atravessa `levelIds[]`, desconta laje como a escada), `Elevador` (caixa, poço, casa de máquinas; medidas por ficha), escada multiandares (`Escada.levelIds[]`), prumadas MEP presas ao shaft (água/esgoto automáticos preferem shaft) | Clash shaft × estrutura (0.4). **Bump** |
| 2.5 Garagem e vagas | `Vaga` (retângulo tipado: comum/PCD/idoso/moto) + **vagas automáticas** `utils/blueprintVagasAutomaticas.ts` (molde `blueprintPilaresAutomaticos`): dentro de um ambiente GARAGEM ou do envelope, fileiras 2,50×5,00 (hipóteses editáveis), faixa de circulação 5,00, pilares como obstáculo, contagem vs. exigência da zona (E3) | Tela/gaveta "Vagas" na aba Terreno. **Bump** |

Dependências: 2.3 usa 0.1; 2.5 usa E3.1 para a exigência (pode nascer com hipótese manual).

---

## Etapa 3 — Motor de Regras / Legislação · 3 fases

Hoje a zona é lida (`blueprintZonaUrbanistica`: recuos, TO, CA, permeabilidade, gabarito). Falta o
motor que **avalia** e o resto do vocabulário.

| Fase | Entrega | Detalhe |
|---|---|---|
| 3.1 Vocabulário | Zona ganha: testada mínima, área mínima do lote, afastamentos progressivos por altura (fórmula), vagas por unidade/tipologia, insolação mínima; **restrições em planta** como `Boundary.kind = 'RESTRICAO'` (APP, servidão, faixa não edificável, recuo de curso d'água) que subtraem do envelope | `blueprintZonaUrbanistica.ts`, `PainelZonaUrbanistica.tsx`, `blueprintTerreno.ts` (envelope − restrições). **Bump** (Boundary) |
| 3.2 Motor de regras | `utils/blueprintRegras.ts`: regra declarativa {id, escopo (lote/edificação/pavimento/unidade/ambiente/porta), expressão (motor 1.3), severidade, fonte}; **catálogo** em `blueprint_rule_sets` (município/lei; semente com código de obras genérico: áreas e larguras mínimas por tipo de ambiente, pé-direito mínimo, porta ≥ 0,80 m e giro 1,50 m NBR 9050, iluminação/ventilação = 1/6 e 1/12 da área) + regras da organização. **Tela "Verificar legislação"** (molde `TelaQuantitativos`): agrupada por fonte, três estados + não avaliado, clique leva ao elemento | Substitui a leitura passiva; NBR 5410 continua no seu painel, listada aqui como seção |
| 3.3 Envelope 3D | Prisma edificável (recuos × gabarito × afastamentos progressivos × restrições), volume e área máxima por pavimento; 3D translúcido; "cabe?" por pavimento na conferência | `Blueprint3DViewer.tsx`, `blueprintTerreno.ts` |

---

## Etapa 4 — Programa de necessidades e grafo espacial · 3 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 4.1 Programa | Tabela `blueprint_programs` por estudo: itens {tipo de ambiente, quantidade, área mín/ideal/máx, largura mín, pé-direito mín, exige iluminação/ventilação/fachada, privacidade (social/serviço/íntimo)}, relações {A, B, peso 0–10, obrigatória/proibida}, circulação máxima %. Tela "Programa" com matriz de proximidade editável | Semente de programas por tipologia (2Q, 3Q suíte, casa térrea) |
| 4.2 Grafo espacial | `utils/blueprintGrafoEspacial.ts` puro: nós = `Space`, arestas = parede compartilhada (do arranjo) e porta (`Opening` na parede entre dois ambientes) → adjacência, **percursos** (Dijkstra de `blueprintGrafoDeRede.ts` sobre centros de porta), circulação % (ambientes tipo CIRCULACAO + corredores), largura útil de passagem, fachada de cada ambiente (aresta externa) e orientação (norte) | Também alimenta a ficha da porta (1.5: origem/destino) |
| 4.3 Conferência do programa | Programa × desenho: atende/falta por item e relação, percursos > limite, ambientes sem fachada que exigem; seção na tela da 3.2 | Sem bump |

---

## Etapa 5 — Motor de Avaliação · 3 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 5.1 Insolação e ventilação | `utils/blueprintInsolacao.ts`: azimute/altura solar por latitude e data (georreferência já existe), horas de sol por fachada, **sombras** simples no 3D (luz direcional por data/hora — `ReguaDoTempo.tsx` é o molde de controle temporal) e sombra do entorno se houver vizinhos (polígonos com altura); ventilação cruzada = aberturas em fachadas não paralelas do mesmo ambiente | P0 nas duas listas de análise |
| 5.2 Score | `utils/blueprintAvaliacao.ts`: indicadores 0–100 com **explicação** por indicador: programa (4.3), legal (3.2), eficiência (útil/construída), circulação %, compacidade (perímetro²/área), insolação/ventilação (5.1), corredores, adjacências (Σ peso atendido), privacidade (fluxos), acessibilidade (rotas ≥ 0,90/1,20 m e portas), estrutura (vãos > limite, pilares fora de eixo), modulação, custo/m² (orçamento), paredes (m/m²), fachada, shafts, eficiência hidráulica (m de rede/ponto). Pesos editáveis (`usePersistedState` → por estudo) | Tela "Avaliação" + cartão no Resumo dos Quantitativos |
| 5.3 Sugestões | "Sugerir melhorias" derivado dos indicadores piores (texto determinístico com o elemento alvo); base para a IA da E6.4 | Sem LLM ainda |

---

## Etapa 6 — Design Options e Gerador · 4 fases · **o coração**

| Fase | Entrega | Detalhe |
|---|---|---|
| 6.1 Design Options | `blueprint_study_alternatives`: ramos do estudo (nome, origem = versão, `principal`); trocar de alternativa troca o modelo carregado; **comparar** = dois canvases sincronizados + diff semântico (`blueprintDiff`) + tabela de indicadores (5.2); "tornar principal" promove | Sem mexer no kernel: alternativa é outro snapshot |
| 6.2 Gerador determinístico | `utils/blueprintGerador.ts` (+ Web Worker): entrada = envelope (3.3) + programa (4.1) + regras (3.2) + eixos/malha (1.4) + hipóteses; passos: (a) zona por fluxo (social à frente/norte, serviço aos fundos, íntimo protegido) → (b) alocação por *squarified treemap* com áreas ideais → (c) refinamento por recozimento simulado com **semente** (função objetivo = score 5.2) → (d) paredes (`AddWall` em malha de 50 mm, mitra), portas junto à circulação, janelas nas fachadas de quem exige (`AddOpening`) → (e) automáticos já existentes (pilares, vigas/lajes, tomadas, circuitos, pontos hidráulicos, água, esgoto) → (f) avaliação. N sementes → N alternativas (6.1) ranqueadas; frente de Pareto área × custo × score | Cada alternativa é aplicável/editável no editor. Testes: programa-padrão gera solução válida e reprodutível |
| 6.3 Mobiliário e circulação automáticos | Mobiliário mínimo por tipo de ambiente (E7.1 traz a família): cama/armário, sofá/mesa, bancada/geladeira/fogão, tanque/máquina; circulação livre ≥ 0,90 m (1,20 acessível) verificada; núcleo vertical (2.4) e vagas (2.5) gerados quando o programa pede | Reusa `kitDoAmbiente`/`planejarPontosDoAmbiente` como molde |
| 6.4 IA conversacional | Edge Function com Claude: pedido em linguagem natural → **edição do programa/regras/hipóteses** (nunca geometria direta) → re-geração → resposta com o delta dos indicadores ("suíte +2 m², construída igual: sala −1,5 m², circulação −0,5 m²"); "explicar solução" = indicadores + decisões do gerador | P1; última porque só faz sentido com 6.2 estável |

---

## Etapa 7 — Famílias arquitetônicas e materiais · 4 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 7.1 Componentes | Entidade `Componente` {familia: MOBILIARIO/LOUCA/BANCADA/ARMARIO/EQUIPAMENTO, tipoId, posição, rotação, medidas}: símbolo 2D por ficha (planta humanizada depende disto), caixa 3D, custo/fabricante/código via tipo (1.1); louças ligam-se ao ponto hidráulico do mesmo lugar | `MenuComponentes` ganha família "Mobiliário"; IFC `IfcFurniture`/`IfcSanitaryTerminal`. **Bump** |
| 7.2 Piso, forro e rodapé | Piso como elemento com camadas por ambiente (tipo de piso por org, molde camadas de parede), forro/rebaixo com cota, rodapé derivado (perímetro − portas); quantitativo e orçamento por material | `quantities.ts`, `blueprintBudget.ts`. **Bump** |
| 7.3 Guarda-corpo e corrimão | Linear sobre borda de laje/varanda/escada, altura 1,10 (NBR 14718), quantitativo em m | **Bump** |
| 7.4 Biblioteca de materiais | `blueprint_materials` (org): nome, código (SINAPI/interno), custo, fabricante, propriedades físicas (densidade, condutividade P2); camadas e tipos apontam por id; orçamento lê o custo | Substitui o texto livre da camada |

Backlog P2 desta etapa: paredes curvas (arco discretizado com metadado), pisos inclinados, cortina de vidro/brises, molduras.

---

## Etapa 8 — Documentação e vistas · 4 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 8.1 Anotações | Entidade `Anotacao` {texto, leader, linha, região hachurada, cota angular} por vista; sai em PDF/DXF | **Bump** |
| 8.2 Filtros e templates de vista | Colorir por tipologia/unidade/status/fase/tipo de ambiente (`blueprintCoresAmbiente` vira uma das paletas); template de vista por org (camadas visíveis, cores, espessuras, escala); transparência e linha oculta/sombreado no 3D | `MenuExibir.tsx` |
| 8.3 Pranchas | Template de prancha por org (formato, carimbo com campos), **inserção automática de vistas** (planta por pavimento, cortes, elevações, tabelas), índice de pranchas, callout/ampliação (recorte a escala maior), conjunto de desenhos em um PDF | `blueprintExport.ts` |
| 8.4 Planta humanizada | Estilo com pisos por material, mobiliário (7.1), sombreamento das paredes, vegetação simbólica; PDF de venda | Depende de 7.1/7.2 |

---

## Etapa 9 — Interoperabilidade e API · 3 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 9.1 DWG | Import/export via conversão server-side (Edge Function com `libredwg` wasm → DXF → pipeline atual `blueprintDxf`/`PainelImportarDxf`); versão do DWG declarada | Sem tocar no kernel |
| 9.2 API pública | OpenAPI sobre RPCs `security definer` com token por organização: estudos, versões (payload canônico + hash), quantitativos, planilha, IFC, unidades/áreas; REVOKE public (regra da casa) | Documentação publicada |
| 9.3 Webhooks | `blueprint_webhooks` (org, evento: versão publicada/aprovada, comentário, alternativa principal) disparados por database webhook do Supabase; retentativa e log | |

Backlog P2: SKP, PDF vetorial genérico, conector Power BI (view SQL).

---

## Etapa 10 — Colaboração, fases e compras · 3 fases

| Fase | Entrega | Detalhe |
|---|---|---|
| 10.1 Multiusuário | Presença (Realtime) + **lock por elemento** ao começar a editar + difusão de comandos: como todo comando é determinístico e validado por invariante, o cliente remoto aplica o mesmo `Command` e rejeita o que não passa; conflitos viram aviso com o autor | Reusa `applyCommand`; sem CRDT |
| 10.2 Fases de reforma | `fase?: 'EXISTENTE'/'DEMOLIR'/'NOVO'` em entidades, filtro por fase, quantitativo de demolição (medida `DEMOLICAO_*` em `blueprintBudget`), vista antes/depois (dois canvases como 6.1) | **Bump** |
| 10.3 Planta → compras | Do quantitativo/orçamento gerar requisição no Plano de Aquisições/Suprimentos (itens, quantidades, ref. `bp:<estudo>:…` como origem) | Fecha "planta → quantitativo → orçamento → cronograma → compras" |

Menções em comentários e permissões por estudo entram na 10.1 (mesma migration).

---

## Etapa 11 — HVAC mínimo · 1 fase

Disciplina `MECANICA` no kernel: shaft mecânico (2.4), **reserva de espaço para equipamento**
(condensadora, casa de máquinas, ventilação) como `Componente` (7.1) com clash; a aba Mecânica do
ribbon nasce com ela. Dutos/terminais/cargas ficam fora (P3/P4).

---

## Sequência recomendada e dependências

```
E0 (trilhos) ──► E1 (paramétrico) ──► E2 (pavimento tipo/unidades) ──► E3 (regras) ──► E4 (programa/grafo)
                                                                            │
                     E7 (famílias) ◄── E6 (options + gerador) ◄── E5 (avaliação) ◄─┘
                          │
                          ▼
                  E8 (documentação) ─► E9 (interop/API) ─► E10 (colaboração/fases/compras) ─► E11 (HVAC)
```

E7.1 (mobiliário) pode ser antecipada para antes da 6.3. E9 e E10 são independentes de E5–E7 e
podem correr em paralelo se houver outra frente (REGRA #8: uma frente, uma pasta).

Tamanho por etapa (em publicações, cada uma com prova no app real): E0 4 · E1 5 · E2 5 · E3 3 ·
E4 3 · E5 3 · E6 4 · E7 4 · E8 4 · E9 3 · E10 3 · E11 1 = **42 fases**. Bumps de kernel
previstos: E1 (3), E2 (5), E3 (1), E7 (3), E8 (1), E10 (1) — cada um com recaptura dos goldens.

## Fora do plano (registrado)

P2 (backlog): catálogo de tipos, famílias aninhadas, sub-regiões/taludes avançados, cobertura
por extrusão, paredes curvas/inclinadas, cortina/brises, rodapés como elemento, departamento,
planta de forro, vista dependente, nuvens de revisão, tabelas personalizadas, status do conflito,
SKP, lock fino, fases personalizadas, LOD elevado, plugins.
P3/P4 (não replicar): render/ray tracing/animação, gbXML/energia/carbono, cálculo e modelo
analítico estrutural, estrutura metálica, detalhamento de armadura (a esquemática já existe),
fabricação, Dynamo/marketplace, worksets/modelo central, HVAC completo, texto 3D.

## Execução

### E0.1 — Girar · Alinhar · Matriz (18/09/2026)
- Kernel: `RotateEntities` (ângulo inteiro, centro inteiro; múltiplos de 90° exatos, outros
  arredondam ao mm sem abrir junção; abertura que deixou de caber por 1 mm recua; `rotacaoDeg`
  e `rotacaoGraus` somam o giro). Sem bump: nenhum campo novo no canônico.
- `utils/blueprintSelecao.ts`: `comandoDeRotacao` (centro da caixa arredondado),
  `comandosDeAlinhamento` (referência = última parede/divisa; paralelas ≤ 1° e pontos vão à reta
  por `TranslateEntities` com `manterJuncoes`; não paralelas ficam, com aviso; agrupa por
  deslocamento), `comandosDeMatriz` (N−1 `DuplicateEntities` a k·passo, um lote).
- Editor: grupo Seleção ganha Rotacionar 90° esq./dir. (rótulo "Rotacionar" porque "Girar" já é
  o eixo da porta), Alinhar (≥ 2 peças) e Matriz (gaveta `tarefa-matriz`: exemplares, passo X/Y
  em `blueprint:matriz`; fecha ao criar).
- Testes: `blueprintSelecao` 18 (giro exato, −90 → 270, ângulo 37° com junção fechada e porta
  cabendo, alinhar paralela/perpendicular/pilar, já alinhado, matriz e recusas); editor "girar,
  alinhar e matriz". Suíte 4592.
- App real (escritas bloqueadas: 16): parede esquerda de 7,05 m girou 90° em torno do centro e
  Desfazer devolveu; matriz 3× criou 2 cópias (7 → 9 paredes) num lote.

### E0.2 — Etiquetas de esquadria, cota de nível e volume (18/09/2026)
- `utils/blueprintNumeracao.ts` (novo, puro): `etiquetasDasAberturas` (por tipo, ordem de criação,
  por pavimento; siglas PT/J/PC/VL — "P" já é pilar), `rotuloDeNivel` (±0,00 / +2,80 / −1,20, em cm
  antes do sinal), `volumeDoAmbienteM3` (piso × pé-direito do pavimento). O navegador passou a
  numerar pela mesma função ("Porta 2" ↔ "PT2").
- Canvas: prop `etiquetasDeAbertura`; a etiqueta sai do lado oposto ao da cota da parede, com
  o mesmo botão dos rótulos de ambiente (renomeado "Nome, área, nível e etiquetas"); o rótulo do
  ambiente ganhou a 4ª linha com a cota de nível do pavimento.
- Tela Quantitativos › Por ambiente: colunas Pé-direito (m) e Volume (m³). A planilha não
  ganhou volume porque não recebe o modelo (só `Quantitativos`) — fica para quando o volume
  entrar em `quantities.ts`.
- Testes: `blueprintNumeracao` (4), editor "Por ambiente (E0.2)". Suíte 4597. App real (escritas
  bloqueadas: 14): "±0,00" em cada ambiente, "PT1" ao lado da porta, colunas 2,80 / 70,52 na tela.

### E0.3 — Situação · Implantação · Cobertura (18/09/2026)
- `utils/blueprintVistasDePlanta.ts` (novo, puro): `AJUSTE_DA_VISTA` (nível, cotas, envelope, só
  contorno), `nivelDaVista` (mais baixo; cobertura = mais alto com telhado), `paredesExternasDoNivel`
  (ponto médio sobre aresta paralela do `contornoExternoDoNivel` — o anel tem vértice em toda
  junção), `idsOcultosNaVista` (instalações, estrutura, escadas, cortes, esquadrias e internas do
  pavimento da vista).
- `VistaBlueprint` ganhou `situacao | implantacao | cobertura` (9 vistas fixas, ícones no acesso
  rápido). O canvas é o mesmo da planta: o editor força `levelId`, soma os ocultos da vista ao olho
  do usuário e desliga rótulos/medidas/grade/circuitos; cotas e envelope conforme o ajuste. Faixa
  `faixa-vista-de-planta` diz vista, pavimento e recorte, com "voltar à planta". Read-only como as
  elevações (sem ferramentas); aba Vista só oferece o preenchimento do terreno. Cortes passaram a
  respeitar `ocultos` no canvas. Exportar a vista atual cai na prancha de planta.
- Limite declarado: a cadeia de cotas continua a do modelo (inclui os vãos escondidos) — a cota
  por vista é da E8.2 (templates de vista).
- Testes: `blueprintVistasDePlanta` (3), editor "E0.3" + contagem de 9 vistas. Suíte 4601. App
  real (escritas bloqueadas: 14): as três faixas ("Situação · Térreo…", "Cobertura · Pavimento
  1…"), contorno sem interiores, envelope só na implantação, "voltar à planta" devolve as
  ferramentas.

### E0.4 — Clash arquitetônico (18/09/2026) · fecha a Etapa 0
- `utils/blueprintKernel/conflitosArquitetonicos.ts` (novo): `conflitosArquitetonicos(model)` →
  `ConflitoArquitetonico {pecaId/uid, familia opening|stair, outroId/uid, classe, levelId,
  medidaMm, em}`. Tipo próprio porque a peça não é um trecho; mesma natureza do clash MEP
  (pendência, nunca desconto). Regras: **vão × estrutura** = faixa da estrutura na parede
  (`faixaDaEstruturaNaParede`, a mesma conta do desconto) cruza o vão em planta E em altura
  (viga-verga acima da janela não é conflito); **escada × pilar** = área comum de qualquer fatia
  com a pegada; **escada × altura livre** = viga/laje sobre o percurso com menos de 2,10 m
  (NBR 9077, 4.6.2) entre o topo do degrau da fatia e a face inferior da peça — peça abaixo do
  degrau não conta.
- Painel Conflitos lista os arquitetônicos antes dos MEP (clique seleciona a peça); contagem do
  botão e do drawer soma os dois; BCF ganha `topicosDeConflitosArquitetonicos` (mesmo `Clash`,
  semente por par de uids, alvo no encontro).
- Testes: `blueprintConflitosArquitetonicos` (3: pilar no vão 200 mm, verga não conflita, viga
  baixa conflita; pilar na escada; viga no 1º degrau livre × no fim faltando altura; viga de
  fundação não conta), editor "E0.4". Suíte 4605. App real (escritas bloqueadas: 15): parede +
  porta + pilar no mesmo ponto → Conflitos 385 → 386, "Porta V-28E3 encontra C-4CD3 · 200 mm do
  vão tomados pela estrutura — a esquadria não fecha".

**Etapa 0 concluída** (4 fases: a02c07cb, 20aa1015, 734429f4 e esta). Próxima: E1.1 (tipos
genéricos).

### E1.1 — Tipo × instância para estrutura, ponto, escada e telhado (18/09/2026)
- **Decisão revista contra o kernel**: o plano dizia `tipoId` no canônico; o kernel já decidiu
  duas vezes (`CamadaParede`, `Esquadria`) que o tipo é MOLDE no catálogo, a peça carrega o VALOR
  COPIADO e "são do mesmo tipo" é ASSINATURA — um `tipoId` faria a revisão publicada mudar quando
  o catálogo mudasse. E1.1 generaliza essa decisão em vez de contrariá-la: **sem bump**.
- `utils/blueprintTipos.ts` (puro): `PropriedadesDoTipo` por família (ESTRUTURA: kind, seção,
  altura, base, circular · TERMINAL: disciplina, tipo, cota, classificação, potência, medidas,
  volume · ESCADA · TELHADO), `propriedadesDa*`, `assinaturaDoTipo` (sem vazios — sobrevive ao
  JSON), `resumoDoTipo`, `camposDa*` (volta para `Set*Props`). Posição, giro, rótulo e vínculo
  ficam fora.
- Migration `aplicar_20270918000040_blueprint_element_types.sql` **aplicada** (tabela=1, RLS,
  4 policies, anon 0): uma tabela para as quatro famílias, `propriedades` JSONB. Parede e
  esquadria ficam nas tabelas próprias. `services/blueprintElementTypeService.ts`.
- `components/blueprint/SeletorDeTipo.tsx` (compartilhado): "Aplicar tipo…" (copia num comando;
  estrutura troca de família + medidas num lote), "Salvar tipo" com nome inline sugerido, "Tipo X
  · N peças iguais no desenho". Nos painéis de Estrutura e de Ponto (terminal); escada e telhado
  ganham o mesmo bloco na E1.5.
- Testes: `blueprintTipos` (4), editor "E1.1" (seletor, contagem, aplicar 30×30, nome sugerido).
  Suíte 4610. App real (escritas bloqueadas: 14): pilar mostra "Sem tipo salvo · 32 peças iguais
  no desenho" e o nome sugerido "Pilar 40×14 · 2,80 m".

### E1.2 — Parâmetros personalizados (18/09/2026) · kernel 0.33.0
- **Kernel** (bump 0.32.0 → 0.33.0, ritual dos goldens: provado em 0.32.0 com os campos no lugar,
  248 testes; depois recaptura dos 6 hashes): `parametros?: Record<chave, número|texto|booleano>`
  em parede, abertura, estrutura, telhado, escada, trecho, terminal e quadro; `assertParametros`
  (chave `[a-z][a-z0-9_]{0,39}`, texto ≤ 200, ≤ 50 por peça, nunca `{}`); comando único
  `SetParametros {familia, id, valores}` (`null` apaga; objeto novo, nunca mutação); canônico ida e
  volta com a chave só quando há parâmetro — o acervo não muda de hash.
- **Definições** (significado da chave) fora do kernel: migration
  `aplicar_20270918000050_blueprint_parameter_definitions.sql` **aplicada** (chave, nome, família
  ou todas, tipo NUMERO/TEXTO/BOOLEANO/LISTA, unidade, opções, compartilhado, `formula` reservado
  à E1.3); `blueprintParameterDefinitionService` com `chaveDeParametroDoNome` ("fck do concreto
  (MPa)" → `fck_do_concreto_mpa`).
- **UI** `PainelParametros` sob o painel de qualquer peça das oito famílias: um campo por
  definição (número/texto gravam ao sair, lista e sim/não na hora; um Ctrl+Z por campo), valores
  sem definição legíveis e apagáveis, "Nova definição" inline.
- **Saídas**: IFC `Pset_OpuraPersonalizado` por peça (IfcReal/IfcBoolean/IfcLabel, chave como
  nome); planilha ganha a aba **Parâmetros** (`linhasDeParametros(model)`).
- Fora desta fase (declarado): filtro `compartilhado` nas saídas (hoje todo parâmetro sai), edição
  e exclusão de definições (só criação inline), valor por TIPO (E1.1 usa assinatura, não id).
- Testes: `blueprintParametros` (5), goldens, editor "E1.2". Suíte 4616. App real (escritas
  bloqueadas: 14): painel no pilar, "Nova definição" derivando `fck_do_concreto_mpa`.

### E1.3 — Motor de fórmulas (18/09/2026)
- `utils/blueprintFormulas.ts` (puro, sem `eval`): léxico + descida recursiva (ou/e/não, comparações
  incl. `=` e `<>`, `+ − * / % ^`, unário, parênteses, texto entre aspas, vírgula OU ponto decimal),
  funções `se, min, max, abs, arred, piso, teto, raiz, pot, texto, numero, vazio`, constantes
  `verdadeiro/falso/sim/pi`. Erros em português com coluna; variável desconhecida é erro (nunca 0
  silencioso); divisão por zero e resultado não finito são erro. `variaveisDaPeca(model, alvo)`:
  nativas por família em m/m²/m³ (+ irmãs `_mm`), `pavimento.pe_direito/cota/nome`, mais os
  parâmetros gravados (a nativa vence o gravado de mesmo nome). `avaliarDefinicoes`: fórmulas em
  ordem de dependência, ciclo acusado nas duas pontas, erro por definição. Tudo DERIVADO, nunca
  gravado.
- Definição ganhou `formula` (a coluna reservada na E1.2); painel mostra a definição com fórmula
  como valor calculado (ƒ, tooltip com a fórmula, erro em âmbar no lugar do número); "Nova
  definição" tem campo de fórmula com sintaxe conferida ao digitar, botão travado no erro e a lista
  de variáveis da família.
- Fora desta fase: fórmula nas saídas (IFC/planilha exportam só o gravado — calculado é da E1.5),
  edição de fórmula existente (recriar com o mesmo nome substitui).
- Testes: `blueprintFormulas` (9), editor "E1.3". Suíte 4626. App real (escritas bloqueadas: 14):
  "Faltou ")" fechando arred( (col. 27)" trava o salvar; corrigida, libera; lista de variáveis.

### E1.4a — Eixos da malha (18/09/2026) · kernel 0.34.0
- **Kernel** (bump 0.33.0 → 0.34.0, goldens provados em 0.33.0 com 268 testes e recapturados):
  entidade `Eixo {nome, a, b}` sem pavimento (como o corte — o eixo A é o mesmo em todos os
  andares), `model.eixos`, comandos `AddEixo` (nome por palpite: horizontal = letra, vertical =
  número; `''` = linha de referência sem bolha), `SetEixoProps`, `MoveEixoVertex`, `DeleteEixo`;
  canônico `eixos` só quando há; identidade `X-`; invariantes (comprimento, nome ≤ 8).
- **Canvas**: traço-ponto cinza-azulado com bolha e nome nas duas pontas; ferramenta `eixo` (dois
  cliques, orto, Escape cancela); seleção pela linha (depois do corte); o eixo entra nos alvos do
  **encaixe** (SOBRE/PERPENDICULAR/INTERSECAO) — o ímã puxa para a linha e para os cruzamentos.
- **Editor**: ferramenta "Eixo" no grupo Estrutural da Arquitetura; `PainelEixoSelecionado` (nome,
  direção, comprimento, cruzamentos, Excluir); exclusão no lote da seleção.
- **Pilares automáticos**: `cruzamentosDeEixos(model)`; um pilar por cruzamento (`onde: 'EIXO'`,
  sem giro, paredes que passam pelo ponto cedem), antes dos nós de parede e ganhando a disputa por
  proximidade; idempotente.
- Planos/linhas de referência (P1) = eixo sem nome — mesmo tipo, sem bolha.
- Testes: `blueprintEixos` (3), goldens, editor "E1.4". Suíte 4630. App real (escritas bloqueadas:
  14): eixos "1" e "A" desenhados com bolhas, painel "Eixo A · horizontal · 17,00 m · 1
  cruzamento", "Pilares automáticos 1".
- Restrições (`Restricao` + conferência/ajuste) ficam na **E1.4b**, próxima publicação.

### E1.4b — Restrições (18/09/2026) · kernel 0.35.0 · fecha a E1.4
- **Decisão**: restrição ACUSA, não trava. Nada de solver escondido no arraste (o usuário brigaria
  com o desenho): a restrição é a intenção declarada no kernel, a conferência é derivada e cada
  violação oferece **Ajustar** — um comando visível, um Ctrl+Z. É a postura de
  `pontasPresasAsPecas`.
- **Kernel** (bump 0.34.0 → 0.35.0, goldens provados em 0.34.0 com 256 testes e recapturados):
  `Restricao {tipo, alvo, referencia?, valorMm?}` com referências por **uid** no modelo (sobrevive
  ao `SplitWall`) e por **índice** no canônico; tipos `ALINHADO_A_EIXO`, `DISTANCIA_AO_EIXO`,
  `TRAVA_COMPRIMENTO`, `IGUAL_COMPRIMENTO`, `PARALELO` com `EXIGENCIAS_DA_RESTRICAO`; comandos
  `AddRestricao` (a igual substitui) e `DeleteRestricao`; `limparRestricoesOrfas` na cauda de todo
  comando (apagar a parede leva a restrição, sem cada `Delete*` lembrar); invariantes.
- `utils/blueprintRestricoes.ts`: `conferirRestricoes(model)` → atendida/desvio (mm ou °)/
  descrição/`correcao` (`TranslateEntities` perpendicular com junções mantidas, `MoveVertex` da
  ponta B para comprimento, `RotateEntities` inteiro em torno do centro para paralela) ou
  `semCorrecaoPorque` (parede não paralela ao eixo → "gire-a antes"). Tolerâncias 1 mm / 0,5°.
- **UI** `PainelRestricoes`: sob o painel da parede/peça (lista da peça + "Nova restrição" com
  tipo, referência — eixos, paredes, vigas — e valor) e no drawer **Restrições** (Analisar ›
  Relatórios, contagem = violadas). Linha: ✓/⚠, descrição, Ajustar, Remover, clique seleciona.
- Testes: `blueprintRestricoes` (6), goldens, editor "E1.4b" (declara, viola 300 mm, conta 1,
  Ajustar zera, Remover apaga). Suíte 4637. App real (escritas bloqueadas: 17): parede
  perpendicular ao eixo A → "não é paralela ao eixo A (90.0°) — gire-a antes de alinhar", botão
  Restrições 1, sem Ajustar (correto).

**Etapa 1 restante:** E1.5 (Objeto Inteligente — ficha unificada; seletor de tipo em escada e
telhado; fórmulas nas saídas).

### E1.5 — Objeto Inteligente (18/09/2026) · fecha a Etapa 1
- `utils/blueprintFicha.ts` (puro, só leitura): `fichaDoElemento(model, id, {definicoes,
  conferencias, custo})` → seções Geometria (por família; a porta diz hospedeira, offset, os dois
  ambientes que liga e se é acessível NBR 9050), Tipo (peças iguais por assinatura), Parâmetros
  (gravados + calculados ƒ), Custo (orçamento), Restrições (atendida/violada com desvio);
  `fichaComoTexto` para copiar. `FichaDoElemento` recolhida sob os painéis, com "Copiar".
- **Seletor de tipo** (E1.1) chegou à escada e ao telhado (`camposDaEscada/camposDoTelhado`).
- **Fórmulas nas saídas**: `parametrosCalculadosDoModelo(model, definições)` (só o que avaliou);
  `OpcoesExportacao.definicoesDeParametro` (PainelVersoes carrega as com fórmula) → IFC mescla os
  calculados no `Pset_OpuraPersonalizado`; planilha ganha a coluna **Origem** (gravado/fórmula).
- Definições de parâmetro carregadas UMA vez no editor e entregues ao painel e à ficha.
- Testes: `blueprintFicha` (3), editor "E1.5" (ficha do pilar com 224 calculado; seletor na
  escada). Suíte 4641. App real (escritas bloqueadas: 14): ficha da porta "Liga Ambiente 4 ↔
  Ambiente 3 · Acessível sim · Térreo · pé-direito 2,80 m".

**Etapa 1 concluída** (E1.1 32d6c5c · E1.2 afab5ffc · E1.3 53002b37 · E1.4a 6b8f2957 · E1.4b
72c965ce · E1.5 esta). Kernel 0.35.0. Próxima: **E2.1 — pavimento tipo** (`Level.tipoDeId` +
propagação; bump).

### E2.1 — Pavimento tipo (18/09/2026) · kernel 0.36.0
- **Decisão**: cópia viva MATERIALIZADA, não derivada em leitura. `Level.tipoDeId` marca o
  pavimento cópia; ao fim de TODO comando (cauda de `aplicarSemHash`),
  `sincronizarPavimentosVinculados` reconcilia paredes, aberturas, estrutura, telhado e etiquetas a
  partir do tipo, com **uid determinístico** por (pavimento, peça de origem) e o MESMO id quando a
  cópia já existe (seleção e histórico não pulam; o pilar do 3º andar é o mesmo GUID no IFC).
  Idempotente — hash estável. Por isso canvas, quantitativos, IFC e navegador não precisaram
  saber de nada. Instalações NÃO são copiadas (são por pavimento e têm lançamento automático).
- Editar arquitetura/estrutura na cópia é recusado ANTES de aplicar (`LEVEL_LINKED`: "é cópia do
  pavimento tipo X: edite o tipo (a edição propaga) ou desvincule"); instalações e as
  propriedades do pavimento seguem livres. Sem corrente de tipos (invariante); remover o tipo
  desvincula os dependentes e as cópias ficam. Vincular um pavimento já desenhado descarta o que
  ele tinha (avisado na tela).
- Kernel: `AddLevel.tipoDeId`, `SetLevelProps.tipoDeId` (null desvincula), canônico `Level.tipoDe`
  por índice; bump 0.35.0 → 0.36.0 (goldens provados em 0.35.0 com 262 testes e recapturados).
- UI: Pavimentos › Ações: "Repetir como pavimento tipo…" (N cópias vivas acima do topo),
  "Vincular a um tipo…", "Desvincular do tipo"; linha diz "cópia de X — edite lá, propaga aqui" /
  "pavimento tipo de N"; faixa no canvas do pavimento cópia com "editar o tipo" e "desvincular".
- Testes: `blueprintPavimentoTipo` (4), goldens, editor "E2.1". Suíte 4646. App real (escritas
  bloqueadas: 16): "Repetir 2" → Térreo 1/2 com 7 paredes, faixa, e a parede desenhada na cópia
  recusada com a mensagem do kernel.

### E2.2 — Unidade (19/09/2026) · kernel 0.37.0
- **Decisão**: a unidade é um conjunto de ETIQUETAS de ambiente (`Unidade {numero, tipologia?,
  pcd, etiquetaUids[]}`), porque o ambiente é derivado e só a etiqueta tem identidade estável.
  Uma etiqueta pertence a no máximo uma unidade (invariante; atribuir transfere). Polígono,
  área privativa, área comum e fração ideal são DERIVADOS em `utils/blueprintUnidades.ts` —
  nada disso entra no payload, logo nunca ficam desatualizados.
- **Área privativa NBR 12721**: Σ área de EIXO dos ambientes (o anel do arranjo planar já corre
  no eixo, então a geminada e a divisa com área comum já entram pela metade) + metade externa
  das paredes externas (`comprimento × espessura/2`, por lado do anel; sem o acerto de canto —
  declarado). Cada lado do anel é classificado olhando o outro lado: INTERNA (mesma unidade),
  GEMINADA (outra unidade — tracejado violeta na planta, pintado por último com halo porque
  embaixo da laje/elétrica sumia), COMUM (ambiente sem unidade), EXTERNA (nenhum ambiente).
  Área comum do pavimento = `areaConstruidaMm2` − Σ privativas do pavimento; fração ideal =
  privativa ÷ Σ privativas do estudo (o módulo Áreas NBR 12721 continua sendo o lugar do
  coeficiente de padrão e do Quadro IV-B — recebe estas privativas como entrada).
- Kernel: `AddUnidade`, `SetUnidadeProps` (`labelIds` substitui o conjunto), `DeleteUnidade`,
  `SetUnidadeDoAmbiente {spaceId, unidadeId|null, nome?}` (cria a etiqueta se o ambiente não
  tem); número único (`BAD_UNIT`); `limparEtiquetasOrfasDasUnidades` na cauda (a unidade fica,
  vazia); canônico `unidades: [{numero, tipologia?, pcd, etiquetas: [índices]}]` por número,
  omitido sem unidade; prefixo de rótulo `U`; bump 0.36.0 → 0.37.0 (goldens provados em 0.36.0
  com 257 testes e recapturados).
- UI: cartão do ambiente (Navegador › Ambientes) ganha "Unidade" (Área comum / Un. N / + Nova
  unidade…); rótulo na planta "Un. 101 · PCD" abaixo do nome; tela **Analisar › Unidades**
  (`TelaUnidades`, molde Quantitativos): número/tipologia/PCD editáveis na linha, ambientes,
  privativa, fração ideal (‰, decimal no title), Planta AI (m²), geminada com, excluir; tabela
  por pavimento (construída / privativa / comum); recusa do kernel visível na tela (a faixa do
  editor fica escondida com a tela aberta).
- **Ponte com o Planta AI** (`services/blueprintUnidadesPlantaAiService.ts`, só leitura): estudo →
  empreendimento (zona urbanística ou sugerido pela obra) → torres com `planta_ai_scenario_id` →
  `plant_units`; `comandosDeImportacaoDoPlantaAi` cria por número as que faltam (idempotente),
  sem ambientes; a coluna "Planta AI (m²)" compara a privativa prevista lá com a medida aqui.
  Estudo sem empreendimento: botão desabilitado com a explicação (foi o caso do estudo de prova).
- Testes: `blueprintUnidades` (5: kernel, canônico, medidas exatas 37,20 m² / 500 ‰ / comum,
  INTERNA, ponte), goldens, editor "unidades (E2.2)". Suíte 4652. App real (escritas
  bloqueadas: 15): "+ Nova unidade…" em dois ambientes → Un. 101/102 no rótulo da planta, parede
  entre eles tracejada, tela com 27,65 / 26,52 m², 510,419 ‰ / 489,581 ‰, comum 48,07 m², "Já
  existe a unidade "101"" na recusa.

### E2.3 — Grupo com origem (19/09/2026) · kernel 0.38.0
- **Decisão**: a mesma disciplina do pavimento tipo, em planta. `Grupo {nome, levelId, pivo,
  origem: {walls, structures, labels} por uid, instancias: [{uid, levelId, translacao,
  rotacaoGraus ∈ {0,90,180,270}, espelho ∈ {NENHUM,X,Y}}]}`. Transformação rígida inteira:
  espelho e giro em torno do pivô, depois translação. As cópias são MATERIALIZADAS ao fim de
  todo comando (`sincronizarGrupos`, antes da sincronização do pavimento tipo, que então as
  copia para os pavimentos vinculados): paredes (+ aberturas, com `swingReversed` trocado no
  espelho e offset preservado a partir da imagem de `a`), estrutura (`rotacaoDeg`
  espelhado/girado) e etiquetas, uid determinístico `uidDaCopia(instância, origem)` — a
  mesma função do pavimento tipo, agora em `model.ts`. Cópia que existia antes do comando
  (`copiasAntes`, levantada em `aplicarSemHash`) e deixou de ser esperada é apagada — é assim
  que remover instância / excluir grupo limpam sem que ninguém "lembre".
- Editar cópia é recusado ANTES de aplicar (`GROUP_INSTANCE`: "É instância do grupo X: edite a
  origem (a edição propaga) ou desagrupe"). A recusa do pavimento tipo e a do grupo agora
  partilham `alvosDoComando(command)` (ids que cada comando de edição toca). Invariantes: sem
  corrente (origem não pode ser cópia), peça em uma origem só, instância nunca em pavimento
  cópia (E2.1), giro/espelho/translação válidos. Peça apagada sai da origem (cauda); o grupo
  fica.
- Comandos: `AddGrupo` (com `instancias` iniciais — "Repetir unidade" é UM comando), `SetGrupoProps`,
  `AddInstanciaDeGrupo` (recusa a instância exatamente sobre a origem; `unidade` cria a unidade
  nova com as etiquetas copiadas = **unidade tipo**), `SetInstanciaDeGrupo`,
  `DeleteInstanciaDeGrupo`, `DeleteGrupo {manterInstancias}` (desagrupar × excluir com cópias).
  Canônico `grupos` por (pavimento, pivô, nome) com origem por índice e instâncias ordenadas;
  identidade `grupos` + `instanciasDeGrupo` (achatadas) para as cópias voltarem com os mesmos
  uids; bump 0.37.0 → 0.38.0 (goldens provados em 0.37.0 com 280 testes e recapturados).
- `utils/blueprintGrupos.ts`: `grupoDaSelecao`, `comandoDeAgrupar`, `descreverInstancia`,
  `numeroSugerido` ("101"→"102", "Casa 3"→"Casa 3 B"), `planoDeRepeticaoDaUnidade(modo)` —
  espelhada à direita/esquerda/acima/abaixo (pivô na aresta da caixa dos ambientes) ou
  deslocada; a parede (e o pilar) SOBRE a linha do espelho ficam fora da origem, então a original
  passa a ser a geminada entre as duas (E2.2); paredes que passam do contorno são copiadas
  inteiras, com aviso ("divida-as antes").
- UI: ribbon Seleção › "Grupo com origem" (gaveta `PainelGrupo`: agrupar a seleção; grupo da
  seleção com ΔX/ΔY/giro/espelho + Instanciar, lista de instâncias com remover, Desagrupar,
  Excluir grupo e cópias; lista dos grupos do pavimento com "selecionar a origem"); tela
  Unidades › ação "Repetir a unidade N" (lado, número sugerido, deslocamento) com o resultado no
  rodapé.
- Testes: `blueprintGrupos` (5: transformação, materialização/propagação/recusa/sem corrente,
  remover/desagrupar/excluir/órfã, canônico ida e volta com uids das cópias, repetir unidade →
  102 geminada com 500 ‰), goldens, editor "E2.3". Suíte 4658. App real (escritas bloqueadas:
  17): "Repetir a unidade 101 espelhada à esquerda" → 102 criada com o aviso das 2 paredes que
  extrapolam, 7 → 10 paredes, cópia visível à esquerda com a geminada tracejada; renomear o
  ambiente copiado recusado com a mensagem do kernel (lida antes do autosave bloqueado
  sobrescrever a faixa); gaveta: "#1 · espelho X · Térreo", remover → "Sem instâncias ainda",
  desagrupar → volta a "Agrupar a seleção".

### E2.4 — Núcleo vertical (19/09/2026) · kernel 0.39.0
- **Decisão**: UMA entidade, `Nucleo {tipo: SHAFT | ELEVADOR, levelId (partida), ateLevelId?
  (chegada; ausente = o mais alto), ring, rotulo, pocoMm?/casaDeMaquinasMm?/capacidade? (só
  elevador)}` — o elevador é um shaft com ficha, não uma segunda família. Como a escada, fica
  FORA do arranjo planar; o que faz ao quantitativo é FURAR a laje que atravessa
  (`furosDoNucleo`, irmão de `furosDaEscada`: lajes com cota entre o piso de partida
  (exclusive) e o teto do último pavimento (inclusive)), descontada em área e volume e no 3D.
  Desenhado em todo pavimento que atravessa (`pavimentosDoNucleo`, por cota).
- **Escada multiandares** = `Escada.ateLevelId?` (chegada declarada, acima da partida): o
  desnível vira a diferença de cota e a escada fura toda laje no caminho — sem `levelIds[]`
  redundante. Remover a chegada volta ao próximo acima; remover a partida leva a peça.
- **Clash** `NUCLEO_X_ESTRUTURA` (E0.4): pilar/viga com área comum com o contorno em qualquer
  pavimento atravessado (a laje fica de fora: é furada). Rótulos no painel de conflitos e no BCF.
- **Prumadas MEP presas ao shaft**: `shaftPreferido(model, ponto, nível, raio)` — a coluna de água
  (`posicaoDaColuna`) e o tubo de queda do esgoto sobem pelo shaft mais próximo ao alcance
  (`raioDoShaftMm`, padrão 3000, nas duas hipóteses); sem shaft, como antes. Só SHAFT atrai;
  elevador não.
- **Ficha do elevador** (`FICHA_DO_ELEVADOR`, 4/6/8/10/13 passageiros: cabina, caixa, poço, casa
  de máquinas — ordem de grandeza NBR NM 207 / NBR 5665, "confirmar com o fabricante"):
  "Aplicar ficha" COPIA para a peça (valor, não vínculo); o painel avisa quando a caixa
  desenhada é menor que a da ficha.
- Kernel: `AddNucleo/SetNucleoProps/MoveNucleoVertex/DeleteNucleo`, `SetEscadaProps.ateLevelId`,
  RemoveLevel limpa chegadas; canônico `nucleos` (+ `stairs[].ate`) por índice, omitidos sem
  núcleo; prefixo `H`; bump 0.38.0 → 0.39.0 (goldens provados em 0.38.0 com 301 testes e
  recapturados).
- UI: Componentes › Circulação ganha **Shaft** e **Elevador** (ferramenta `nucleo`: dois cantos,
  como o retângulo; prévia com as medidas); canvas desenha a caixa com as diagonais (tracejadas
  no shaft) e o rótulo, seleção pela caixa; `PainelNucleoSelecionado` (tipo, rótulo, de/até,
  medidas e ficha); navegador lista com caixa e pavimentos; escada ganha "Até".
- Testes: `blueprintNucleoVertical` (5), goldens, editor "E2.4". Suíte 4664. App real (escritas
  bloqueadas: 15): Elevador e Shaft desenhados por dois cliques, painel com "2 pavimento(s) ·
  5,60 m", ficha de 8 aplicada com o aviso da caixa menor, símbolos na planta.
- Fora desta fase (registrado): caixa do elevador no 3D (só o furo aparece); mover o núcleo por
  arraste/`TranslateEntities` (como a escada, ainda não entra na seleção transformável).

### E2.5 — Garagem e vagas (19/09/2026) · kernel 0.40.0
- **Kernel**: `Vaga {levelId, at (centro), larguraMm, comprimentoMm, rotacaoGraus, tipo COMUM | PCD |
  IDOSO | MOTO, numero?, sugerida?}` — demarcação de piso, fora do arranjo planar;
  `DIMENSAO_DA_VAGA` (comum 2,50 × 5,00; PCD 3,70 × 5,00 com a faixa de 1,20 m da NBR 9050; idoso
  2,50 × 5,00; moto 1,00 × 2,00); `contornoDaVaga`. Comandos `AddVaga` (medidas do tipo quando
  omitidas), `SetVagaProps` (trocar o tipo sem medidas leva as do tipo novo), `MoveVaga` (mover
  confirma a sugerida, como o terminal), `DeleteVaga`; RemoveLevel leva as vagas; canônico `vagas`
  omitido sem vaga; prefixo `W`; bump 0.39.0 → 0.40.0 (goldens provados em 0.39.0 com 257 testes e
  recapturados).
- **Vagas automáticas** (`utils/blueprintVagasAutomaticas.ts`, molde dos pilares automáticos):
  região = ambiente escolhido ("Garagem" por nome, por padrão) ou o maior contorno externo do
  pavimento; bandas `vaga | circulação | vaga vaga | circulação | …` no eixo mais comprido (ou o da
  hipótese), toda fileira encostada numa circulação (a 2ª do par só nasce se a circulação seguinte
  couber); dentro da fileira as vagas se encostam e o que estiver no caminho (parede, pilar/viga,
  núcleo, escada, vaga confirmada) é obstáculo — a seguinte tenta 250 mm adiante. Recuo padrão de
  200 mm porque o anel do ambiente corre no eixo da parede. PCD (2 %, ≥ 1, 3,70 m, no começo da
  1ª fileira) e idoso (5 %, ≥ 1) por hipótese; moto só se pedida. Exigência: número manual ou
  `vagas por unidade × unidades` (E2.2); o resumo ACUSA "faltam N", nunca trava. Idempotente:
  relançar substitui as sugeridas do pavimento; `comandosDeAceite` / `comandosDeLimpeza`.
- UI: aba Terreno › **Garagem › Vagas** (gaveta `PainelVagas`: hipóteses, região, plano por tipo,
  conferência PCD/idoso/exigência, Lançar/Relançar, Aceitar N sugeridas, Apagar sugeridas);
  Componentes › **Vagas** (Vaga, Vaga PCD, Vaga idoso, Vaga de moto — um clique no centro); canvas
  desenha número + sigla, sugerida tracejada, faixa hachurada na PCD; seleção pelo retângulo;
  `PainelVagaSelecionada` (tipo, número, medidas, giro, Aceitar); navegador lista por tipo.
- Testes: `blueprintVagas` (4: entidade/canônico, garagem 20 × 15 → 7 = 1 PCD + 1 idoso + 5,
  pilar desvia, 2 e 3 fileiras conforme o fundo, exigência), goldens, editor "E2.5". Suíte 4669.
  App real (escritas bloqueadas: 16): na casa de 13,7 × 6,7 m o plano explica "não cabe uma fileira
  com circulação (10,0 m)"; com um retângulo de 52 × 15 m desenhado, 20 vagas (1 PCD, 1 idoso, 18
  comuns) lançadas como sugeridas, botão do ribbon "Vagas 20"; vaga PCD avulsa pelo menu com o
  painel (3,70 × 5,00 m).
- Fora desta fase (registrado): espinha de peixe (45°) e vagas em fila (paralelas), mover a vaga por
  arraste no canvas (hoje pelo painel/giro), e a exigência vinda da zona (E3.1).

### E3.1 — Vocabulário (19/09/2026) · kernel 0.41.0
- **Zona ganha** testada mínima, área mínima do lote, vagas por unidade, insolação mínima e
  **afastamento progressivo por altura** (`{aPartirDeM, formula em h}`, avaliado pelo motor da
  E1.3: "acima de 6 m: (H − 6)/10", "H > 9: (H-9)/8" e variantes são lidos por
  `lerAfastamentoProgressivo`; o ilegível entra em `naoAplicados`, como sempre). Onde mora: os
  catálogos de zona não têm os campos, então vivem em `blueprint_study_urban_context`
  (migration `aplicar_20270919000044`, APLICADA), digitados à mão no painel da zona
  ("Vocabulário complementar") e marcados MANUAL; `lerZona` já os aceita como texto quando a
  zona os trouxer, e a deriva os compara.
- **Recuos efetivos** (`recuosEfetivos`): laterais e fundos = máx(recuo fixo, fórmula(altura
  desenhada)); frente não muda; o envelope usa os efetivos e o painel do terreno diz "afastamento
  progressivo em vigor: X m". **Conferência do lote** (`conferirLote`): testada (Σ divisas FRENTE)
  e área vs. mínimas — acusa, não trava; sem frente marcada, diz que não pôde conferir.
  **Vagas por unidade** da zona alimenta o lançamento de vagas (E2.5) por cima da hipótese.
- **Restrição em planta**: `Boundary.kind = 'RESTRICAO'` + `restricao {tipo APP | CURSO_DAGUA |
  SERVIDAO | NAO_EDIFICAVEL, faixaMm}` (faixas padrão 30 / 15 / 3 / 15 m — a lei local decide);
  não divide ambiente (fora do arranjo planar, como o TERRENO). `faixasRestritas`: o retângulo da
  linha até a paralela a `faixaMm` para o lado do centro do lote; `naDivisa` quando as duas pontas
  estão sobre o MESMO lado do lote. `envelopeConstrutivo` recorta o anel pelo semiplano além da
  faixa quando ela corre pela divisa (APP na margem "empurra" o envelope como um recuo maior) e,
  para a faixa no meio do lote (servidão), desconta a área e avisa "o contorno não a recorta" —
  um anel só não representa duas peças. Comandos `AddBoundary.restricao`, `SetBoundaryRestricao`;
  canônico `boundaries[].restricao` só onde há; bump 0.40.0 → 0.41.0 (goldens provados em 0.40.0
  com 280 testes e recapturados).
- UI: ferramenta **Divisa** ganha "A linha é: Limite solto / Faixa restrita do lote" + tipo (com a
  faixa padrão); canvas hachura a faixa em terracota com o rótulo; painel do terreno edita tipo
  e faixa da restrição selecionada, mostra "Área construtível … depois dos recuos e das faixas
  restritas (N m² restritos)", a conferência do lote e o afastamento em vigor; painel da zona
  ganha o vocabulário complementar com validação da fórmula.
- Testes: `blueprintVocabularioDaZona` (2: leitura/afastamento/recuos efetivos/conferência/deriva;
  faixa na divisa recorta 17 × 22 → 17 × 15 m, servidão no meio só desconta, não divide ambiente,
  SetBoundaryRestricao, canônico), goldens, editor "E3.1". Suíte 4672. App real (escritas
  bloqueadas: 17): servidão de 3 m pelo meio do lote hachurada, "198,00 m² … (53,30 m² restritos).
  1 faixa(s) no meio do lote: a área conta, o contorno não a recorta"; testada mínima 25 m →
  "nenhuma divisa marcada como frente para conferir" (o lote da prova não tem papéis).
- Fora desta fase (registrado): insolação mínima é só vocabulário (a conferência é da E5, com o
  norte georreferenciado); recorte do envelope em duas peças para a servidão no meio.

### E3.2 — Motor de regras (19/09/2026)
- **Regra declarativa** (`utils/blueprintRegras.ts`): `{escopo LOTE | EDIFICACAO | PAVIMENTO | UNIDADE |
  AMBIENTE | PORTA, quando?, expressao, severidade ERRO | AVISO | INFO, fonte, artigo?}`, avaliada
  pelo motor de fórmulas da E1.3 (comparações, `e`/`ou`/`nao`, textos) contra as VARIÁVEIS de cada
  alvo (`VARIAVEIS_DO_ESCOPO`, documentadas na tela): ambiente = tipo NBR 5410, área útil, menor lado
  pela face interna, pé-direito, área de janelas/portas nas paredes do contorno, unidade PCD; porta =
  vão, altura, tipo; lote/edificação = do contexto (terreno, aproveitamento, altura, zona). Três
  estados + NÃO AVALIADA quando falta dado ("falta o dado 'to_max' — taxa de ocupação máxima da
  zona") ou a expressão não parseia — nunca conforme em silêncio; `quando` falso = não se aplica.
  Acusa, não trava.
- **Semente** (`REGRAS_SEMENTE`, 21 regras, dita como semente — cada município tem os seus
  números): áreas e larguras mínimas por tipo de ambiente, pé-direito habitável/serviço,
  iluminação 1/6 e 1/8 e ventilação 1/12, porta ≥ 0,80 m (NBR 9050 6.11.2.4) e ≥ 2,10 m, giro
  de 1,50 m no banheiro de unidade PCD (NBR 9050 7.5), TO/CA/testada/área mínima e gabaritos da
  zona, pé-direito do pavimento. A **NBR 5410** entra como fonte pelas conferências já feitas no
  painel do ambiente (tomadas mínimas, luz de teto/interruptor), adaptadas no editor sem segunda
  conta.
- **Catálogo da organização**: `blueprint_rule_sets` (migration `aplicar_20270919000045`, APLICADA:
  RLS por `is_org_member`, JSONB de regras) + `blueprintRuleSetService`; a tela grava no conjunto
  "Regras da organização" e remove por regra; `problemasDaRegra` valida nome, escopo, sintaxe e
  variáveis do escopo antes de salvar. Sem organização no topo ("Todas") não grava, e diz.
- **Tela "Verificar legislação"** (Analisar › Legislação, contagem = erros violados; molde
  Quantitativos): resumo (violadas com erros/avisos, conformes, não avaliadas), abas Resultados
  (filtro por estado e por fonte, busca, clique leva ao elemento — etiqueta do ambiente, porta) e
  Regras (semente só leitura + as da organização + formulário validado).
- Testes: `blueprintRegras` (3: variáveis por escopo na casa de prova, semente com violadas/
  conformes/não avaliadas e motivo, `quando` composto, expressão não booleana/inválida,
  validação), editor "E3.2" (filtros, clique leva à porta, aba Regras). Suíte 4676. App real
  (escritas bloqueadas: 14): "14 violada(s) (6 erro(s), 8 aviso(s)) · 50 conforme(s) · 6 não
  avaliada(s)", fontes semente / NBR 5410 / NBR 9050 / Zona; não avaliadas nomeiam o dado que falta;
  21 regras listadas; sem organização, o botão de gravar explica.
- Fora desta fase (registrado): a semente é genérica — os números do município entram pelas regras
  da organização; regra de UNIDADE/PAVIMENTO só tem as variáveis básicas; E3.3 leva o resultado ao
  BCF/relatório e às fases de projeto.

### E3.3 — Envelope 3D (19/09/2026)
- **Prisma edificável por pavimento** (`utils/blueprintEnvelope3d.ts`, `envelopeVertical`): para
  cada pavimento, os recuos EFETIVOS na altura do topo dele (afastamento progressivo da E3.1) →
  `envelopeConstrutivo` (recuos fixos + faixas restritas) → anel × [piso, teto]. Gabarito em altura
  (topo > gabarito) e em pavimentos (ordem entre os de cota ≥ 0; subsolo não conta) marcam o
  pavimento "acima do gabarito", com o motivo. **"Cabe?"**: o contorno externo desenhado (eixo)
  dentro do anel do envelope (vértices, 1 mm de folga) e a área que sobra fora quando o recorte é
  possível. Volume e área máximos = Σ dos pavimentos dentro do gabarito. Tudo derivado.
- **Conferência**: painel do terreno ganha "Envelope por pavimento" (envelope, desenhado, cabe / N m²
  fora / acima do gabarito, afastamento em vigor, máximos); as regras de PAVIMENTO (E3.2) ganham
  `area_envelope`, `area_fora_envelope`, `cabe_no_envelope`, `acima_do_gabarito` e a semente duas
  regras ("Pavimento dentro do envelope edificável", "Pavimento dentro do gabarito", fonte Zona) —
  aparecem na tela Legislação, não avaliadas sem lote.
- **3D**: um prisma translúcido por pavimento (âmbar; vermelho acima do gabarito), sem escrever
  profundidade, por cima da edificação; toggle "Envelope edificável" no menu Exibir do 3D (ligado
  por padrão; desabilitado sem lote).
- Testes: `blueprintEnvelope3d` (2: recuos por pavimento com (h−3)/2, gabarito em altura e em
  pavimentos com subsolo, cabe?/área fora, volume máximo, ponte com as regras), editor "E3.3".
  Suíte 4679. App real (escritas bloqueadas: 14): "máx. 396,00 m² e 1.109 m³ dentro do gabarito ·
  Térreo 198,00 m² 102,24 m² cabe · Pavimento 1 …", dois prismas no 3D em volta da casa.
- Fora desta fase (registrado): envelope com recuos por lado diferentes por pavimento além do
  progressivo (ex.: recuo de frente maior a partir do 3º); "cabe?" pela face externa (hoje eixo).

### E4.1 — Programa de necessidades (19/09/2026)

**O que entrou.** O programa é do ESTUDO, fora do payload (é intenção, não geometria — sem bump do kernel):

- **Tabela `blueprint_programs`** (migration `aplicar_20270919000046_blueprint_programs.sql`, APLICADA via `db query -f`): uma linha por estudo (`UNIQUE study_id`, FK composta para `blueprint_studies(id, organization_id)` com CASCADE), `nome` + `programa jsonb`, RLS `is_org_member`, `REVOKE … FROM anon`. `services/blueprintProgramService.ts` (`get/save/remove`), `hooks/useBlueprintPrograma.ts` (molde armadura: estado local na hora, gravação com respiro de 500 ms, `persistenciaIndisponivel` degrada para a sessão, `erroDeGravacao` acusado na tela).
- **`utils/blueprintPrograma.ts`** (puro): vocabulário próprio `USOS_DO_AMBIENTE` (13 usos: sala, cozinha, dormitório, suíte, banheiro, lavabo, área de serviço, varanda, circulação, garagem, escritório, depósito, outro) com `FICHA_DO_USO` — ponte `tipoNbr5410` para `TIPOS_DE_AMBIENTE` do kernel, privacidade padrão, área mín/ideal/máx, largura mín, pé-direito mín, exige iluminação/ventilação/fachada e o casador de nome (`nomes`). `Programa {nome, itens[], relacoes[], circulacaoMaxPct}`; `ItemDoPrograma` com todos os campos da linha do roadmap; `RelacaoDoPrograma {a, b, peso 0–10, tipo DESEJAVEL|OBRIGATORIA|PROIBIDA}` como par NÃO ordenado (`relacaoEntre`, `definirRelacao`: obrigatória força 10, proibida força 0, desejável com peso 0 apaga). `novoItem`, `adicionarItem/atualizarItem/removerItem` (leva as relações), `trocarUsoDoItem` (puxa a ficha nova só nos campos que ainda estavam na ficha antiga), `problemasDoPrograma` (acusa, não trava), `resumoDoPrograma` (ambientes, Σ áreas por quantidade, por privacidade, área ideal com a circulação máxima por cima), `usoDoNome` (a palavra que aparece PRIMEIRO manda: "Varanda gourmet" é varanda, "Cozinha/Serviço" é cozinha; suíte antes de dormitório), `programaDaColuna` (leitura tolerante do JSONB: uso inventado → OUTRO, número inválido → padrão do uso, relação órfã/duplicada/consigo cai).
- **Sementes** `programaSemente('APTO_2Q' | 'APTO_3Q_SUITE' | 'CASA_TERREA')` com ids legíveis (`sala`, `coz`, `suite`, `bsuite`…), relações (cozinha × serviço e suíte × banheiro da suíte obrigatórias; cozinha × dormitório, garagem × suíte proibidas; circulação × dormitórios 9…) e circulação máxima 15 % (12 % na casa).
- **Tela "Programa"** (`components/blueprint/TelaPrograma.tsx`, Analisar › Programa, contagem = nº de itens, testids `tela-programa`, `resumo-programa`, `problemas-do-programa`, `novo-item`, `aplicar-semente`, `matriz-de-proximidade`): resumo com nome do programa, circulação máxima e o seletor de semente (com confirmação `useConfirm` quando já há itens); aba **Itens** (`StandardTable`, célula editável: nome, uso, quantidade, áreas, largura, pé-direito, exigências, privacidade; remover) e aba **Proximidade** — a matriz triangular item × item, cada célula um `<select>` (—, 1…10, Obrig., Proib.) com tom por peso.

**Decisões.** (1) Vocabulário do programa separado do tipo NBR 5410 — o kernel continua grosso de propósito; a ponte é a ficha, e o casamento com o desenho (E4.3) será pelo NOME do ambiente, não por tipo. (2) Os valores por uso são referência de mercado declarada na tela, não norma. (3) Um programa por estudo (não biblioteca por organização) — as sementes vivem no código; biblioteca fica para quando houver pedido. (4) Suíte modelada como item SUITE + item BANHEIRO "da suíte" com relação obrigatória, em vez de um flag: é o que a matriz e o gerador entendem.

**Prova no app real (escritas bloqueadas: 17).** Botão "Programa" no Analisar; tela vazia ("0 ambiente(s) em 0 item(ns)"); semente 3Q suíte → 11 ambientes em 10 itens, 96,20 m² ideal, 108,33 m² com circulação, 14 relações (2 obrigatórias, 4 proibidas); área ideal da sala 24 → 26 e o resumo vai a 98,20; matriz com 45 selects, Suíte × Banheiro da suíte = Obrig., Sala × Cozinha 8 → 10; a gravação com respiro bateu no bloqueio e a tela acusou "Não gravou o programa: … Failed to fetch". 0 erros de página. Testes: `__tests__/blueprintPrograma.test.ts` (4) e editor "programa (E4.1)"; suíte 368 arquivos / 4684 testes; build OK.

### E4.2 — Grafo espacial (19/09/2026)

**O que entrou** (tudo derivado; sem bump):

- **`utils/blueprintGrafoEspacial.ts`**: `construirGrafoEspacial(model, levelId)` → nós = `Space` (`NoEspacial`: nome, `uso` pelo casador de nome da E4.1, circulação, etiqueta, área, centro dentro do anel, fachadas, nº de portas, `ilhado`); arestas = **PAREDE dividida** (o lado do anel de um ambiente corre sobre uma parede e do outro lado está o outro — contado uma vez por par, comprimento somado por parede) e **PORTA/PASSAGEM** (`Opening` com os dois lados amostrados no centro do vão; um lado no exterior = **saída**). `vizinhosDe` (o exterior só aparece quando há porta para ele), `percursoEntre`/`percursoAteASaida` — Dijkstra com predecessor (`menorCaminhoEntre`, novo em `blueprintGrafoDeRede.ts`) numa rede centro do ambiente ↔ porta, porta ↔ porta no mesmo ambiente, porta de saída ↔ exterior; devolve mm, ambientes na ordem, portas e o **menor vão** pelo caminho. **Circulação %** = Σ área dos ambientes de uso CIRCULAÇÃO (nome) + corredores pela forma (`ehCorredor`: sem uso, lado menor ≤ 1,5 m e ≥ 2,5× comprido) / área útil; `circulacaoDoModelo` soma pavimentos. **Fachadas**: lados externos por parede com `azimuteGraus` (normal externa × norte do desenho — `georreferencia.rotacaoNorteDeg`, +Y = norte sem georreferência, a convenção do IFC), ponto cardeal (8 setores) e as janelas/portas naquele lado. `resumirGrafo` (portas, passagens, saídas, ilhados, sem fachada, portas com vão < 0,80, percurso mais longo até a saída), `descreverFachadas` ("N 4,00 m · L 3,00 m (1 jan.)").
- **Largura útil** = o vão (`widthMm`, que no kernel já é vão livre) — a mesma leitura da regra NBR 9050 da E3.2 e da ficha; descontar folha aqui criaria dois números para a mesma porta.
- **Gaveta "Grafo"** (Analisar › Grafo, `PainelGrafoEspacial.tsx`, testids `tarefa-grafo`, `resumo-do-grafo`, `tabela-do-grafo`, `percurso-entre`, `resultado-do-percurso`): resumo + avisos (sem saída, ilhados, sem fachada, porta estreita), tabela por ambiente (uso, área, liga-se a por porta, encosta em por parede, fachada, até a saída), "Percurso entre dois ambientes" (de → para/exterior). Clique na linha seleciona a etiqueta e fecha a gaveta.
- **Cartão do ambiente** no navegador: linha "Liga-se a … · Fachada … · Saída …" (testid `grafo-do-ambiente-<spaceId>`; vermelho quando ilhado, âmbar sem fachada).
- **Ficha da porta (E1.5)** lê a aresta do grafo ("Liga: Sala ↔ exterior (saída)"); a amostragem local ficou de reserva para porta em parede solta.

**Decisões.** (1) Percurso pelos centros das portas, não por navegação livre no polígono — é o que o roadmap pediu e basta para rota de fuga/acessibilidade em pré-projeto; o centro do ambiente é o centróide (ou um ponto interior quando o centróide cai fora, em L/U). (2) Circulação por NOME (+ corredor pela forma) porque `TIPOS_DE_AMBIENTE` do kernel não tem CIRCULAÇÃO e não convém bumpar o kernel para isso. (3) Um grafo por pavimento; escadas/elevadores entre pavimentos ficam para quando a avaliação (E5) pedir. (4) Só leitura — nada grava, nada bloqueia.

**Prova no app real (escritas bloqueadas: 14).** Cartões dos 4 ambientes com vizinhos, fachadas orientadas com janelas e distância à saída; botão "Grafo 4"; gaveta: 4 ambientes, 4 portas, 5 paredes divididas, 1 saída, circulação 0,0 % de 99,05 m², percurso mais longo 11,38 m; percurso Ambiente 1 → Ambiente 4 = 12,28 m por Ambiente 3 (2 portas, menor vão 0,90); → exterior 10,85 m; clique na linha fecha a gaveta. 0 erros. Testes: `__tests__/blueprintGrafoEspacial.test.ts` (3) e editor "grafo espacial (E4.2)"; suíte 369 arquivos / 4688 testes; build OK.

### E4.3 — Conferência do programa (19/09/2026) · fecha a Etapa 4

**O que entrou** (sem bump; tudo derivado):

- **`utils/blueprintConferenciaDoPrograma.ts`**: `conferirPrograma(model, programa)` → `ConferenciaDoPrograma {itens, relacoes, circulacao, foraDoPrograma, resumo}`. **Casamento** item ↔ ambiente pelo uso que o nome sugere (`usoDoNome`, o mesmo do grafo); entre itens do mesmo uso, o ambiente cujo nome contém o nome do item (sem acento/caixa) vai primeiro; o resto na ordem do programa até a quantidade; um ambiente casa com UM item; sobras = "fora do programa" (INFO). **Por ambiente casado**: área útil (face interna, como o painel) × mín (ERRO)/ideal (AVISO)/máx (AVISO), largura mínima (menor lado da caixa interna — `larguraMinimaMm` exportada da E3.2), pé-direito do pavimento, iluminação natural (janela na fachada), ventilação (janela ou porta para fora), contato com a fachada, percurso até a saída ≤ `percursoMaxM` (não avaliada sem saída no pavimento). **Por relação**: obrigatória = porta direta (ERRO); proibida = nem parede nem porta (ERRO); desejável peso ≥ 7 = parede ou porta em comum (AVISO), 4–6 = até 2 portas de distância (INFO), ≤ 3 = informação; item sem ambiente casado ou pares em pavimentos diferentes → não avaliada com o motivo. **Circulação** % ≤ `circulacaoMaxPct`. `linhasParaLegislacao` traduz tudo em `ResultadoDeRegra` com a fonte "Programa de necessidades" (ids `prog-qtd-*`, `prog-<verificação>-*`, `prog-rel-*`, `prog-circulacao`, `prog-fora`).
- **Programa** ganhou `percursoMaxM: number | null` (campo "Percurso máx. até a saída (m)" na tela; sementes com 30 m; coluna JSONB sanitizada; `null` = não confere).
- **Tela Verificar legislação**: aba **Programa** (testids `conferencia-do-programa`, `resumo-da-conferencia`, `conferencia-itens`, `conferencia-relacoes`, `fora-do-programa`) — por item (pedidos n/N, encontrados com pavimento e área útil, verificações que não atendem), matriz de proximidade (pedido, no desenho, estado), fora do programa; sem programa, link "Abrir a tela Programa". As linhas também entram em **Resultados** (filtro por fonte) e na contagem do botão do ribbon.

**Decisões.** (1) Casamento por NOME, não por tipo NBR 5410 (que é grosso) nem por marcação manual — o projetista já nomeia os ambientes; a tela mostra o que casou e o "fora do programa" denuncia o que não casou. (2) Área ideal/máxima e percurso são AVISO; mínimo, largura, pé-direito, iluminação/ventilação/fachada e relações obrigatória/proibida são ERRO. (3) Um par representativo por relação (o melhor no mesmo pavimento) — a linha aponta para ele. (4) Nada grava; nada trava.

**Prova no app real (escritas bloqueadas: 16).** Sem programa: a aba diz e abre a tela Programa; semente 2Q aplicada na sessão (gravação bloqueada); Ambiente 3 → "Sala" e Ambiente 4 → "Cozinha" pelo cartão; Legislação 14 erros; aba Programa: 18 atendidos · 8 faltas · 8 não avaliadas; Sala (Térreo) 30,37 m² casada (iluminação falta — sem janela), Cozinha casada (iluminação e ventilação faltam), 5 itens sem ambiente; Sala × Cozinha peso 8 "porta direta · atende"; 6 ambientes fora do programa com o pavimento; Resultados filtrados pela fonte: 40 linhas. 0 erros. Testes: `__tests__/blueprintConferenciaDoPrograma.test.ts` (2) e editor "conferência do programa (E4.3)"; suíte 370 arquivos / 4691 testes; build OK.

**Etapa 4 fechada** (4.1 programa, 4.2 grafo espacial, 4.3 conferência). Próxima: Etapa 5 (5.1 insolação/ventilação, 5.2 score).

### E5.1 — Insolação e ventilação (19/09/2026)

**O que entrou** (sem bump; tudo derivado):

- **`utils/blueprintInsolacao.ts`**: `posicaoSolar(latitude, diaDoAno, horaSolar)` (declinação de Cooper; altura pelo triângulo de posição; azimute a partir do norte, horário, válido nos dois hemisférios), `direcaoDoSol(pos, rotacaoNorteDeg)` no espaço do desenho (norte do desenho = `georreferencia.rotacaoNorteDeg`, +Y sem georreferência — a convenção do IFC), `horasDeSolNaFachada` (varredura de 15 min; sol ≥ 5° acima do horizonte, à frente da normal externa e sem sombra do entorno no meio do trecho a 1,20 m do piso), `analisarInsolacao(grafo, …)` → por ambiente: horas por fachada e horas do AMBIENTE (união das fachadas COM JANELA) em 21/06, 21/03 e 21/12, `ventilacaoCruzada` (aberturas para fora em fachadas não paralelas, ≥ 30° módulo 180°), "agora" (SOL/SOMBRA/SEM_JANELA/NOITE). **Entorno**: `VizinhoDoEntorno {lado, alturaM, afastamentoM, profundidadeM}` → `prismasDoEntorno` (retângulo ao longo da divisa, do lado de fora do lote) e `sombreado` (marcha do raio até o topo do prisma mais alto). `resumirInsolacao`, `insolacaoParaRegras`, `LATITUDE_PADRAO` (Brasília, dita como suposição).
- **Grafo (E4.2)** ganhou `meio` e `normal` em cada fachada — a insolação parte daí.
- **Motor de regras (E3.2)**: variáveis de AMBIENTE `horas_sol_inverno`, `horas_sol_verao`, `ventilacao_cruzada`, `insolacao_minima` (da zona, E3.1); sementes `sem-amb-insolacao` (sala/dormitório com janela: `horas_sol_inverno >= insolacao_minima`, ERRO — não avaliada até a zona dizer o mínimo) e `sem-amb-ventilacao-cruzada` (INFO, NBR 15575-1).
- **Gaveta Analisar › Insolação** (`PainelInsolacao.tsx`, testids `tarefa-insolacao`, `instante-solar`, `posicao-do-sol`, `hora-solar`, `resumo-da-insolacao`, `tabela-de-insolacao`, `entorno`, `novo-vizinho`): data de referência ou livre, HORA SOLAR (régua 5–19 h), latitude (da georreferência, travada; senão suposta e dita), "Sol e sombras no 3D", posição do sol, resumo (sem sol no inverno / abaixo do mínimo, sem ventilação cruzada), tabela por ambiente, vizinhos do entorno (lado, altura, afastamento, profundidade). Hipóteses em `usePersistedState('blueprint:insolacao')` — do navegador, como as demais hipóteses de análise.
- **3D**: props `sol` (direção unitária) e `entorno` (prismas cinza que projetam sombra) em `Blueprint3DViewer`/`Blueprint3DTab`; a luz direcional principal passa a vir do sol (posição = centro + direção × 2·spread; intensidade cai com sol baixo, cor quente perto do horizonte) — as sombras que já existiam (`shadows`, `castShadow`) seguem a data/hora. Botão do ribbon conta os ambientes com janela e 0 h de sol em 21/06.

**Decisões.** (1) Hora SOLAR, não do relógio — a conta é astronômica e a tela diz isso; fuso/horário de verão ficariam a cargo de quem interpreta. (2) A sombra da própria edificação sobre si não entra na contagem de horas (declarado); o 3D a mostra. (3) Vizinhos declarados por divisa (não desenhados) — o desenho não tem o quarteirão; é o que se sabe numa visita ao lote. (4) Ambiente conta só fachadas com janela: sol numa parede cega não é insolação. (5) O ponto de referência é o meio do trecho externo a 1,20 m — peitoril; janelas altas ou baixas não mudam a conta (simplificação).

**Prova no app real (escritas bloqueadas: 14).** Gaveta abre com 21/06 às 9 h: "Sol a 31° de altura, azimute 49° (NE) · latitude SUPOSTA"; 4 ambientes, 2 com janela a oeste (5,0 · 5,5 · 6,0 h nas três datas), "sombra" às 9 h e "sol" às 15 h (azimute 311°, NO); verão às 15 h: 47°, 252° (O); vizinho de 15 m colado na lateral direita não muda as janelas a oeste (coerente); 3D com a luz vindo do sol da tarde. 0 erros. Testes: `__tests__/blueprintInsolacao.test.ts` (2) e editor "insolação (E5.1)"; suíte 371 arquivos / 4694 testes; build OK.

### E5.2 — Score (19/09/2026)

**O que entrou** (sem bump; tudo derivado):

- **`utils/blueprintAvaliacao.ts`**: `avaliar(entradas, hipoteses)` → `Avaliacao {indicadores[18], notaGeral, avaliados, naoAvaliados, piores[3]}`. Cada `Indicador {chave, rotulo, nota 0–100 | null, peso, explicacao, detalhes[], alvos[{id, rotulo, levelId}]}`. Os dezoito: **programa** (E4.3: atendidos + ½ avisos / total), **legal** (E3.2: conformes / (conformes + 2·erros + avisos), sem as linhas do programa), **eficiência** (útil/construída, régua 60→90 %), **circulação** (% da útil: 100 até metade do limite do programa, 60 no limite, 0 no dobro; 15 % sem programa), **compacidade** (P²/A do contorno externo, 16 = quadrado, ponderado por área), **insolação** (E5.1: ambientes de permanência com ≥ mínimo da zona — ou 1 h suposta — de sol de inverno pelas janelas), **ventilação cruzada**, **corredores** (circulações ≥ 0,90 m livres e portas ≥ 0,80), **adjacências** (Σ peso das desejáveis atendidas), **privacidade** (íntimo sem porta para serviço nem para a rua), **acessibilidade** (portas ≥ 0,80 e circulações ≥ 1,20 na rota até a saída), **estrutura** (vigas > vão máximo, pilares > 0,10 m de um eixo de parede), **modulação** (paredes múltiplas do módulo ±5 mm), **custo/m²** (prévia do orçamento × referência, régua 80→140 %), **paredes** (m/m², 0,6→1,4), **fachada** (quem exige tem janela num lado externo), **shafts** (molhados a ≤ raio de um shaft; só com 2+ pavimentos), **hidráulica** (m de rede/ponto, 3→12). O que não dá para medir fica `null` com o motivo — nunca 0 nem 100 em silêncio. Nota geral = média ponderada dos avaliados; peso 0 tira da média. `hipotesesDaAvaliacaoDaColuna` sanitiza (pesos presos a 0–10). `HipotesesDaAvaliacao {pesos, referenciaM2BRL, vaoMaxDaVigaMm 6000, moduloMm 100, raioDoShaftMm 3000}`.
- **Tela "Avaliação"** (`TelaAvaliacao.tsx`, Analisar › Avaliação com a nota geral no botão; testids `tela-avaliacao`, `resumo-da-avaliacao`, `nota-geral`, `piores`, `hipoteses-da-avaliacao`, `tabela-de-indicadores`, `detalhes-<chave>`): nota geral, piores três, "Pesos e hipóteses" (referência R$/m², vão de viga, módulo, raio do shaft, restaurar padrão), tabela com barra, peso editável na linha e explicação; a linha abre os detalhes e os alvos clicáveis ("Ir para": ambiente, porta, peça — seleciona e fecha a tela). Hipóteses em `usePersistedState('blueprint:avaliacao')`.
- **Cartão no Resumo dos Quantitativos** (`CartaoDaAvaliacao`, testid `cartao-da-avaliacao`): nota, avaliados/sem dado, piores, "Ver avaliação".

**Decisões.** (1) Réguas de PRÉ-PROJETO escritas em cada indicador — comparam alternativas do mesmo estudo; a norma continua no motor de regras. (2) Insolação e ventilação recalculadas dentro do motor para TODOS os pavimentos (a gaveta E5.1 só faz o ativo), ao meio-dia de 21/06 como instante; a latitude/norte/entorno são os da gaveta. (3) O custo só pontua com prévia de orçamento E referência informada — sem inventar CUB. (4) Pesos do navegador (o roadmap previa "→ por estudo"; fica para quando a E6 comparar alternativas).

**Prova no app real (escritas bloqueadas: 14).** Botão "Avaliação 86"; 10 avaliados, 8 sem dado (ambientes sem nome: insolação, privacidade, fachada, shafts não avaliados e dizem por quê); eficiência 100 (185,63/204,48 = 90,8 %), compacidade 89, estrutura 70 (14 de 46 com aviso), modulação 14 (2 de 14 paredes), hidráulica 83 (4,57 m/ponto); zerar o peso da legislação move a nota geral 86 → 89; detalhes da legislação listam os erros com o alvo; clique em "Ambiente 1: Iluminação natural" fecha a tela e seleciona; cartão no Resumo dos Quantitativos com "Ver avaliação". 0 erros. Testes: `__tests__/blueprintAvaliacao.test.ts` (3) e editor "avaliação (E5.2)"; suíte 372 arquivos / 4698 testes; build OK.

### E5.3 — Sugestões (19/09/2026) · fecha a Etapa 5

**O que entrou** (sem bump; sem LLM):

- **`utils/blueprintSugestoes.ts`**: `sugerirMelhorias(avaliacao)` → `Sugestao {id, indicador, prioridade ALTA|MEDIA|BAIXA, titulo (imperativo), texto (com os números), alvo {id, rotulo, levelId} | null, destino (programa | legislacao | insolacao | orcamento | terreno | grafo | quantitativos) | null, desbloqueio, impacto}`. Indicador avaliado abaixo de 75 gera sugestões — uma por alvo (máx. 6, "… e mais N"), com molde de texto próprio por indicador (alargar porta para 0,80/corredor para 0,90/1,20; dar sol de inverno; cruzar ventilação; proteger privacidade; encurtar vão de viga; trazer pilar ao eixo; modular parede; aproximar par da matriz; agrupar áreas molhadas; aproximar de shaft; etc.). Prioridade pelo IMPACTO (100 − nota) × peso, em terços (ordem estável: impacto desc, depois a ordem canônica). Indicador **não avaliado por dado barato** vira DESBLOQUEIO (prioridade baixa, badge "dado") com a porta de entrada: definir programa, nomear ambientes, pedir prévia do orçamento, informar custo de referência, porta para o exterior, matriz de proximidade. `resumirSugestoes`, `textoDasSugestoes` (markdown simples: cabeçalho com a nota, seções por prioridade, "Para avaliar o que falta") — o que se cola numa reunião e o que a IA da E6.4 vai receber.
- **Tela Avaliação › aba Sugestões** (testids `sugestoes`, `resumo-das-sugestoes`, `sugestao-<id>`, `copiar-sugestoes`): lista com badge de prioridade, título, indicador de origem, texto, "Ir para <alvo>" (seleciona e fecha a tela) e "Abrir <destino>" (tela ou gaveta via `onNavegar`); "Copiar como texto" (clipboard).

**Decisões.** (1) Determinístico e explicável: a mesma avaliação sempre dá a mesma lista, na mesma ordem; a E6.4 recebe este texto pronto em vez de inventar. (2) Uma sugestão por alvo, não por indicador — é o alvo que o projetista clica. (3) Desbloqueios separados das melhorias: "falta dado" não é defeito de projeto. (4) Peso 0 no indicador silencia as sugestões dele (mesma régua da nota geral).

**Prova no app real (escritas bloqueadas: 14).** 29 sugestões (6 altas, 8 médias, 7 baixas, 8 desbloqueios): altas = os erros de iluminação natural (legislação) por ambiente e pavimento; médias = modulação (geral + por parede: 7,05 m, 14,05 m…); "Copiar" → "Copiado"; "Abrir Programa" abre a tela do programa; "Ir para Ambiente 1 (Térreo)…" fecha a tela e seleciona. 0 erros. Testes: `__tests__/blueprintSugestoes.test.ts` (2) e editor "sugestões (E5.3)"; suíte 373 arquivos / 4701 testes; build OK.

**Etapa 5 fechada** (5.1 insolação/ventilação, 5.2 score, 5.3 sugestões). Próxima: Etapa 6 (6.1 Design Options, 6.2 gerador determinístico, 6.3 mobiliário e circulação automáticos, 6.4 IA conversacional).

### E6.1 — Design Options (19/09/2026)

**O que entrou** (sem mexer no kernel — alternativa é outro snapshot):

- **A alternativa É um ramo** (`blueprint_branches`): sem tabela paralela. Migration `aplicar_20270919000047_blueprint_alternativas.sql` (APLICADA): colunas `principal` (UM por estudo — índice parcial `blueprint_branches_um_principal_por_estudo`), `descricao`, `origem_snapshot_id` (a versão publicada de onde nasceu — informativo; a base de carga continua `parent_snapshot_id`); backfill marcou o ramo "principal" (ou o mais antigo) de cada estudo.
- **Serviço** (`blueprintService.ts`): `ramoPrincipal(branches)`, `createAlternative({studyId, organizationId, fromBranchId, nome, descricao, model})` (cópia do conteúdo editável — rascunho ou última versão — para um ramo novo, NUNCA apontando o snapshot da origem como pai, como `duplicateStudy`), `renameBranch`, `setPrincipalBranch` (desmarca e marca; o índice garante um), `deleteBranch` (recusa a principal). `BRANCH_COLS` e `BlueprintBranch` com os campos novos. `duplicateStudy` e `BlueprintModule` passam a usar `ramoPrincipal`.
- **Trocar de alternativa troca o modelo carregado**: `BlueprintEditor` ganhou `onTrocarRamo`; `BlueprintModule` remonta o editor com `key={branchId}` — histórico, seleção e zoom são do ramo.
- **Tela Colaborar › Alternativas** (`TelaAlternativas.tsx`, testids `tela-alternativas`, `resumo-alternativas`, `nova-alternativa`, `comparacao`, `diff-alternativas`, `indicadores-comparados`): tabela dos ramos (nome e descrição editáveis na célula, aberta/principal, revisão publicada, rascunho salvo, criada), "Nova a partir desta", Abrir, **Comparar**, Tornar principal (estrela), Excluir (não principal, com confirmação). **Comparação**: duas `MiniPlanta` (SVG só leitura, novo `MiniPlanta.tsx`) na MESMA escala e enquadramento (caixa da união dos dois modelos), com as peças do diff em laranja; seletor de pavimento; diff semântico (`diffSnapshots(outra, aberta)`: paredes/ambientes/piso e a lista de alterações); tabela de indicadores da E5.2 lado a lado com Δ (a outra avaliada com o mesmo programa, regras e hipóteses; sem custo — a prévia é da aberta; e sem lote/envelope — por isso "legal" pode diferir em modelos idênticos).

**Decisões.** (1) Ramo = alternativa: já tinha nome, rascunho, publicações e histórico; inventar `blueprint_study_alternatives` duplicaria tudo. (2) Comparar com miniaturas SVG sincronizadas pela caixa, não com dois Konva: barato, determinístico e suficiente para ler o que muda; o diff pinta as peças. (3) Promover não move conteúdo — só troca a marca; o orçamento cita snapshots, então nada quebra.

**Prova no app real (escritas bloqueadas: 15).** Colaborar › "Alternativas 2"; tabela com as duas (aberta/principal, rev., rascunho); Comparar → 2 miniaturas, "Idênticas — nada mudou", indicadores lado a lado (nota geral 86 × 85, Δ +1); "Nova a partir desta" com a escrita bloqueada → alerta "Failed to fetch" (1 bloqueada no clique); Abrir a outra → o editor remonta e a tela diz "aberta: Teste E6.1". 0 erros. Testes: editor "alternativas (E6.1)" (lista, criação com o modelo, comparação com diff e indicadores, promover, abrir); suíte 373 arquivos / 4702 testes; build OK.

**⚠️ Incidente na prova (19/09/2026, registrado em memória):** a primeira rodada do harness usou um segundo `page.route` (dublê de leitura de `blueprint_branches`) com `route.continue()` para métodos não-GET — isso NÃO passa pelo bloqueador de escritas, e o clique "Nova alternativa" fez um INSERT real: ramo **"Teste E6.1"** (`c72fd7a8-…`) no estudo "Planta 14/09/2026", cópia do rascunho da principal, 0 snapshots, não principal. Corrigido o harness (`route.fallback()`); a remoção do ramo fica a cargo do usuário (a tela Alternativas exclui, ou `DELETE FROM blueprint_branches WHERE id = 'c72fd7a8-896b-46ee-8d9c-062b48c24814'`).

### E6.2 — Gerador determinístico (19/09/2026)

**O que entrou** (sem bump — o gerador só emite comandos do kernel):

- **`utils/blueprintGerador.ts`**: `gerar(entrada, semente, hipóteses)` → `ResultadoDoGerador {ambientes (retângulos no mundo, zona, área, menor lado, lados externos), comandos, model, avaliacao, resumo {construída, útil, paredes m, objetivo inicial→final}, decisoes[], avisos[]}`. Entrada = programa (E4.1) + envelope do pavimento (E3.3, ou o retângulo declarado sem lote) + direção da frente (divisa FRENTE a partir do centro do lote; sem ela, sul) + norte + latitude. Passos: **(a)** retângulo de trabalho = maior de eixos alinhados dentro do envelope (`maiorRetanguloInscrito`, histograma em grade de 250 mm); frame canônico frente→fundo; zonas: social+serviço à frente (social primeiro), corredor de largura fixa quando o programa tem CIRCULAÇÃO, íntimos ao fundo em UMA linha (todos encostam no corredor); **(b)** treemap em faixas (ordem preservada) com as áreas ideais escaladas ao retângulo (aviso quando caem abaixo da mínima); **(c)** recozimento simulado com mulberry32 semeado — ordem inicial embaralhada por semente dentro de cada zona, trocas dentro das faixas e serviço frente↔fundo, função objetivo proxy do score (largura mínima, proporção > 2,2, fachada/iluminação de quem exige, sol de inverno pela fachada, matriz: obrigatória 10 / proibida 10 / desejável ∝ peso × distância, íntimo na rua, sala fora da frente 12, serviço na frente 1); **(d)** paredes externas e internas (lados dos retângulos unidos por linha, malha de 50 mm, uid determinístico por semente), `NameSpace` com o tipo NBR 5410 do uso, PORTAS por BFS a partir do hub (corredor, senão sala; preferência de pai corredor > sala > mesma zona) + porta direta nas relações OBRIGATÓRIAS adjacentes, ENTRADA de 0,90 m na frente (sala > social > corredor), JANELAS na fachada de quem exige preferindo o norte (basculante 0,60 × 0,60 a 1,60 no banheiro/lavabo); vãos nunca se sobrepõem (intervalos por parede, folga 150 mm); **(e)** automáticos existentes: pilares, vigas, lajes, tomadas + luz NBR 5410 (com potência padrão), pontos hidráulicos — água e esgoto ficam para o projetista (declarado); **(f)** avaliação E5.2 com programa, regras semente e insolação. `gerarAlternativas` (1..N sementes, ranqueadas por nota), `frenteDePareto` (área construída ↓, metros de parede ↓ como proxy de custo, nota ↑), `comandosDeGeometria` + `nomesParaOModelo` para "aplicar aqui" em dois lotes (paredes por uid, aberturas por `wallUid`, nomes calculados sobre o modelo simulado — o kernel é determinístico).
- **Web Worker** `utils/blueprintGerador.worker.ts` + `hooks/useGerador.ts`: as sementes rodam fora do fio principal, resultados chegam um a um (progresso, Parar); sem `Worker` (jsdom) roda no fio com o mesmo `gerar`.
- **Tela Analisar › Gerar** (`TelaGerador.tsx`, testids `tela-gerador`, `hipoteses-do-gerador`, `contexto-do-gerador`, `gerar`, `alternativa-escolhida`, `ambientes-gerados`, `decisoes-do-gerador`, `avisos-do-gerador`, `criar-alternativa-gerada`, `aplicar-gerada`): hipóteses (sementes, iterações, corredor, pé-direito, retângulo sem lote, automáticos), contexto (programa, envelope m², frente, norte), tabela ranqueada (nota, construída, útil, paredes, objetivo, Pareto, avisos), miniatura da escolhida + ambientes + decisões + avisos; "Criar alternativa com esta" (ramo E6.1 com o modelo gerado) e "Aplicar neste pavimento" (aviso se já há paredes). Hipóteses em `usePersistedState('blueprint:gerador')`.

**Decisões.** (1) Treemap em faixas com ordem preservada (não squarified puro): a zona por fluxo é a informação mais valiosa e o squarified a destruiria; o preço é a proporção de salas largas em retângulos largos — limitação declarada para a E6.3/6.4 melhorarem (duas colunas na faixa social). (2) Objetivo proxy no recozimento e score completo no fim — o score E5.2 exige remontar o arranjo planar a cada iteração. (3) Íntimos em uma linha: acesso garantido pelo corredor vale mais que proporção. (4) Reprodutibilidade é contrato: mesma entrada + semente = mesmo hash (teste). (5) Água/esgoto fora dos automáticos do gerador (dependem de reservatório e CI posicionados).

**Prova no app real (escritas bloqueadas: 16).** Programa 3Q suíte (na sessão), envelope do pavimento 198 m² → 4 alternativas em ~600 ms no Worker (notas 87/84/83/83, três na frente de Pareto), 11 ambientes zonados (social/serviço à frente, 5 íntimos ao fundo com janela ao norte), entrada na sala, 14 paredes, decisões e sem avisos; "Criar alternativa" bloqueada → alerta. 0 erros. Testes: `__tests__/blueprintGerador.test.ts` (3: PRNG/retângulo inscrito; 2Q válido, zonado, reprodutível; L com frente ao norte, automáticos, ranking, Pareto, remapeamento) e editor "gerador (E6.2)"; suíte 374 arquivos / 4706 testes; build OK (worker empacotado: `blueprintGerador.worker-*.js`).

### E6.3 — Mobiliário e circulação automáticos (19/09/2026)

**O que entrou** (sem bump — o mobiliário é DERIVADO até a E7.1 trazer a entidade `Componente`):

- **`utils/blueprintMobiliario.ts`**: `KIT_POR_USO` (dormitório: cama de casal 1,40 × 1,90 com faixa de uso 0,60 nos três lados, armário 1,80 × 0,60 alto e cego, criado; suíte: cama 1,60 × 2,00, armário 2,40; sala: sofá 2,00 × 0,90, mesa de jantar 1,40 × 0,90 livre no centro, rack; cozinha: bancada com pia 1,80 × 0,60, geladeira 0,70 alta, fogão 0,60; serviço: tanque, máquina; banheiro: box 0,90, vaso 0,40 × 0,65, lavatório 0,50 × 0,45; lavabo; escritório) — cada peça com faixa de uso na frente/lados, "alta", preferência de lado (CEGO/QUALQUER/LIVRE) e prioridade. `mobiliarDoAmbiente(model, space)`: retângulo interno (face das paredes; maior retângulo inscrito por histograma quando o ambiente não é retângulo), portas reservam vão + giro (0,90 m), janelas penalizam peça alta e cabeceira; ordem de lados por nota (porta +4, janela +6 para altas/camas, oposto à porta −2 para cama, lado mais comprido); varredura de 50 mm ao longo do lado; a PEÇA não invade peça, faixa alheia nem giro; FAIXAS de uso podem se sobrepor entre si (o pé da cama e a frente do armário dividem a mesma faixa). "Não coube" declarado. **Circulação livre por grade de 50 mm**: transformada de distância de Chebyshev (2 passadas) + BFS a partir de TODAS as células livres do giro da porta, só por células com folga ≥ raio; alvo = faixa de uso de cada peça; busca binária no raio → `larguraLivreMm`; `ok90`, `ok120`, `foraDaRota90`, `semPorta` (mede do centro e avisa). `mobiliarNivel`, `resumirMobiliario`. **`sugerirShaft`**: com 2+ pavimentos e nenhum shaft, um `AddNucleo` SHAFT 0,60 × 0,60 no canto do ambiente molhado mais perto do centro do pavimento (E2.4).
- **Gaveta Analisar › Mobiliário** (`PainelMobiliario.tsx`, testids `tarefa-mobiliario`, `resumo-do-mobiliario`, `tabela-do-mobiliario`, `gerados-pelo-programa`, `sugerir-shaft`, `lancar-vagas-<spaceId>`): "Mostrar no desenho", rota acessível (1,20), giro da porta; resumo (com kit, peças, não couberam, circulação passa em N de M, abaixo da régua, sem kit); tabela por ambiente (uso, peças, não coube, livre, passa/não passa); "Quando o programa pede": Lançar vagas na garagem reconhecida pelo nome (abre a gaveta de vagas da E2.5 com a região = o ambiente) e Sugerir shaft (aplica e seleciona). Botão do ribbon conta os ambientes que não passam.
- **Canvas**: prop `mobiliario` — retângulos tracejados ciano (vermelho quando a circulação do ambiente não passa) com rótulo, por cima do piso e abaixo das cotas.

**Decisões.** (1) Sugestão derivada, não peça: sem bump agora; a E7.1 traz a família e o "aceitar". (2) Faixas de uso sobrepostas entre si — é assim que quartos reais funcionam (a passagem entre cama e armário serve aos dois); o que não pode é peça sobre faixa. (3) Circulação medida por grade a partir do giro inteiro da porta (partir de uma célula colada na parede travava a busca — a folga ali é pequena por definição). (4) Vagas pelo planejador existente (E2.5) em vez de peça "vaga" do kit: já persiste e já confere PCD/idoso. (5) Núcleo vertical só como shaft (o elevador/escada dependem de decisões que o programa ainda não traz).

**Prova no app real (escritas bloqueadas: 16).** Três ambientes renomeados (Dormitório 1, Cozinha, Sala) → "3 ambiente(s) com kit de 4 · 9 peça(s) · circulação de 0,90 m passa em 3 de 3" (Dormitório 1: cama, armário, criado, 1,30 m livre; Cozinha: bancada, geladeira, fogão, 1,70 m; Sala: sofá, mesa, rack, 1,30 m); "Mostrar no desenho" pinta as peças no canvas; shaft habilitado ("no canto de Cozinha…") → criado e o painel do núcleo abre. 0 erros. Testes: `__tests__/blueprintMobiliario.test.ts` (2) e editor "mobiliário (E6.3)"; suíte 375 arquivos / 4709 testes; build OK.

### E6.4 — IA conversacional (19/09/2026) · fecha a Etapa 6

**O que entrou** (sem bump; a IA nunca toca geometria):

- **Edge Function `planta-ia`** (`supabase/functions/planta-ia/index.ts`, PUBLICADA): usuário validado pelo token; chama Claude (`claude-sonnet-4-6`) com a ferramenta obrigatória `emitir_mudancas` — esquema fechado: `itens[] {op: ajustar_area | definir_quantidade | adicionar | remover | exigir, alvo, deltaM2, areaIdealM2, quantidade, uso, nome, iluminacao, ventilacao, fachada}`, `programa {circulacaoMaxPct, percursoMaxM}`, `gerador {sementes, iteracoes, larguraCorredorMm, peDireitoMm, automaticos, retanguloSemEnvelope}`, `pesos {indicador: 0–10}`, `entendimento`. Sem `ANTHROPIC_API_KEY` → 503 `SEM_CHAVE` (mesmo desenho de `bi-narrative`). ⚠️ O projeto ainda NÃO tem a chave configurada: `npx supabase secrets set ANTHROPIC_API_KEY=…` liga a IA sem novo deploy.
- **`utils/blueprintIa.ts`** (puro): `MudancasDaIa` (o esquema acima), `aplicarMudancas(m, programa, hipGerador, hipAvaliacao)` — valida faixas (áreas 0–500 m², sementes 1–12, iterações 20–5000, corredor 0,80–3,00 m, pé-direito 2,30–6,00, pesos 0–10), resolve o alvo por nome/uso (`itemPorAlvo`), devolve `aplicadas[]` e `recusadas[]` (nunca lança); **`interpretarPedidoLocal`** — sem IA, entende por padrão de texto: "suíte +2 m²", "aumente/reduza a sala em/para 3 m²", "3 dormitórios", "mais um escritório", "sem/tire a varanda", "corredor de 1,20", "pé-direito 2,8", "N sementes/iterações", "sem/com automáticos", "circulação 12 %", "percurso 20 m", "peso da insolação 8", "priorize custo"; `deltaDeIndicadores(antes, depois)` ("nota 88 → 87 (−1) · Modulação 100 → 55 (−45) …"), `deltaDeAreas` (por ambiente, novos/removidos), `explicarSolucao(decisoes, avaliacao, avisos)` (nota, decisões numeradas, avisos, o que pesa, pontos fortes, próximos passos da E5.3), `mudancasDaResposta` (saneia o JSON da função).
- **`services/plantaIaService.ts`**: `pedirMudancasAIa(pedido, contexto)` → `{mudancas | null, indisponivel}`; nunca lança por indisponibilidade.
- **Gaveta Analisar › Conversar** (`PainelIa.tsx`, testids `tarefa-ia`, `estado-da-ia`, `exemplo-de-pedido`, `explicar-solucao`, `explicacao-da-solucao`, `conversa`, `turno-<id>`, `delta`, `enviar-pedido`): estado da IA (ligada / não configurada → intérprete local), exemplos clicáveis, campo de pedido, turnos (pedido → origem IA/local + entendimento + aplicado/recusado → "Re-gerando…" → delta dos indicadores e das áreas contra a melhor alternativa anterior), "Explicar a alternativa #N" (ou o desenho aberto). Fluxo no editor: pedido → `pedirMudancasAIa` (contexto = programa, hipóteses, pesos, indicadores, decisões) → se `null`, `interpretarPedidoLocal` → `aplicarMudancas` → `setPrograma` (persiste no estudo) + hipóteses do gerador/avaliação → `gerador.gerar` com as mesmas sementes (Worker) → o turno fecha quando `rodando` cai, com `concluirTurno(antes = melhor gerada, depois = nova melhor)`.

**Decisões.** (1) IA propõe, código decide: o esquema fechado + `aplicarMudancas` são a única porta — sem texto livre virando comando, sem geometria. (2) Intérprete local como degradação de verdade (não placeholder): cobre os pedidos comuns e faz a fase funcionar hoje, sem chave; a IA entra por cima quando configurada, com o mesmo esquema. (3) Delta contra a melhor alternativa anterior (não contra o desenho aberto): é a pergunta que o projetista faz ("melhorou?"). (4) "Explicar" é determinístico — decisões do gerador + E5.2 + E5.3 — e vale mesmo sem IA.

**Prova no app real (escritas bloqueadas: 2 — a chamada à função não é escrita).** Programa 2Q na sessão, 2 sementes geradas (melhor: #2, nota 88); Conversar: "Sala de estar +6 m² e corredor de 1,20 m" → Edge Function respondeu **503** (publicada, sem chave) → intérprete local: "Sala de estar/jantar: área ideal 18,00 → 24,00 m² · corredor de 1,20 m" → re-geração → "nota 88 → 87 (−1) · Modulação 100 → 55 · Circulação 92 → 82 · Corredores 90 → 100 · Programa 94 → 96 · Áreas: Sala +9,90 m², Circulação +3,60, Dormitório 1 −3,25 …"; estado passa a "IA não configurada"; "Explicar a alternativa" traz nota, decisões numeradas e próximos passos. 0 erros. Testes: `__tests__/blueprintIa.test.ts` (2) e editor "conversar (E6.4)" (local → delta; IA respondendo → aplicada; incompreensível → sem mudança); suíte 377 arquivos / 4718 testes; build OK.

**Etapa 6 fechada** (6.1 Design Options, 6.2 gerador, 6.3 mobiliário/circulação, 6.4 IA). Próxima: Etapa 7 (7.1 Componentes — bump).

### E7.1 — Componentes (19/09/2026) · abre a Etapa 7

**O que entrou** (**bump `KERNEL_VERSION` 0.41.0 → 0.42.0** — o payload canônico ganha a chave `componentes` e a identidade `M`):

- **Kernel** (`utils/blueprintKernel/model.ts`): entidade **`Componente {id, uid, levelId, tipoId, familia, at, larguraMm, profundidadeMm, alturaMm, rotacaoGraus, rotulo?, sugerido?, parametros?}`**, famílias `MOBILIARIO | LOUCA | BANCADA | ARMARIO | EQUIPAMENTO`, **catálogo fechado `CATALOGO_DE_COMPONENTES`** com 20 tipos (`CAMA_CASAL`, `CAMA_SOLTEIRO`, `CRIADO`, `ARMARIO`, `ESTANTE`, `SOFA`, `POLTRONA`, `MESA_JANTAR`, `CADEIRA`, `RACK`, `ESCRIVANINHA`, `BANCADA`, `BANCADA_SECA`, `GELADEIRA`, `FOGAO`, `TANQUE`, `MAQUINA`, `VASO`, `LAVATORIO`, `BOX`) — cada ficha traz rótulo, família, medidas padrão, símbolo 2D e, nas louças/equipamentos molhados, `ligaAoPonto` (tipo hidráulico NBR 5626 da E-hidráulica). `contornoDoComponente` (retângulo girado pelo centro), `pontoHidraulicoDoComponente(model, c, raio = 600)` (**ligação DERIVADA**: o terminal do tipo certo mais perto, a até 0,60 m — sem FK no modelo), `findComponente`, invariantes `BAD_COMPONENT` (tipo fora do catálogo, família fora da lista, medida ≤ 0, giro fora de 0–359, rótulo > 40, pavimento inexistente) e unicidade de id. Comandos `AddComponente` (medidas do catálogo quando omitidas; `sugerido`), `SetComponenteProps` (trocar `tipoId` puxa família e medidas da ficha nova quando não vieram explícitas; giro normalizado 0–359), `MoveComponente` (**mover confirma o sugerido**), `DeleteComponente`; `RemoveLevel` leva os componentes do pavimento. Canônico: chave `componentes` só quando há algum (ordenados por pavimento, x, y), `identity.componentes` sempre; prefixo de rótulo curto **`M-`**. Goldens: provadas com a string antiga e os campos no lugar (6 hashes idênticos, porque acervo sem componente não muda), depois bump e recaptura (`dc573093…`, `acbc6d40…`, `54fc1a82…`, `3ebfa1ca…`, `5d34d953…`, `c76f68cd…`) — cabeçalho de `__tests__/blueprintKernelGoldens.test.ts`.
- **Tipos de elemento (E1.1)**: `FamiliaDeTipo += 'COMPONENTE'` (`utils/blueprintTipos.ts`: `propriedadesDoComponente`, `camposDoComponente`) — o componente recebe custo/fabricante/código pelo tipo salvo, como estrutura e terminal. Migration **`aplicar_20270919000050_blueprint_element_types_componente.sql`** (CHECK da família ganha `'COMPONENTE'`; **aplicada** em produção sob o número 000048 e renumerada para 000050 porque outra frente — `stock_items_source_ativos` — chegou ao 000048 primeiro; cabeçalho registra).
- **Menu Arquitetura › Mobiliário** (`MenuComponentes.tsx`, família `MOBILIARIO`, título "Mobiliário, louças, bancadas, armários e equipamentos — o catálogo de componentes"): dois grupos — "Mobiliário — dormitório e sala" (11) e "Mobiliário — cozinha, serviço e banho" (9); chaves `COMPONENTE_<tipoId>`; escolher arma a ferramenta `componente` (um clique no centro; prévia tracejada da ficha sob o cursor). **Canvas**: caixa com o símbolo da ficha (cama com cabeceira e travesseiros, sofá com encosto e braços, mesa, bacia oval, lavatório, box com diagonal e ralo, pia com cuba, fogão com 4 bocas, geladeira, tanque, máquina, armário em X, cadeira), rótulo quando cabe, sugerido tracejado; seleção por clique (componente antes da vaga); mover pela seleção múltipla. **Painel** `PainelComponenteSelecionado.tsx` (`painel-componente`): tipo (select puxa a ficha), família, rótulo, largura/profundidade/altura, giro 0/90/180/270, "Aceitar" no sugerido, Excluir, linha **`ponto-ligado`** ("ligado — a N mm" clicável → seleciona o ponto; ou "nenhum a até 0,60 m — lance o ponto (Hidráulica) ou aproxime a peça"), `SeletorDeTipo familia="COMPONENTE"`. **Navegador**: grupo por chave com "Tipo N", medida e "· sugerido" (`linhasDeComponentes`).
- **E6.3 → componentes**: `comandosDeMobiliario(lista, levelId, model)` transforma o mobiliário derivado em `AddComponente sugerido:true` (giro 90 quando a peça encosta em O/L; **idempotente** — não repete tipo já existente no mesmo ambiente); botão **"Aceitar como componentes (N)"** (`aceitar-mobiliario`) na gaveta Analisar › Mobiliário, com "— N já no pavimento".
- **IFC** (`utils/blueprintIfc.ts`): louça → **`IfcSanitaryTerminal`** (PredefinedType TOILETPAN / WASHHANDBASIN / SHOWER / SINK), o resto → **`IfcFurniture`** (BED / TABLE / CHAIR / SHELF / USERDEFINED), caixa apoiada no piso girada pelo giro declarado, `Pset_OpuraPlanta` + `Pset_OpuraComponente {TipoId, Familia, Sugerido}`. **3D**: caixas por componente (louça branca, armário madeira, equipamento cinza, mobiliário verde-oliva; sugerido translúcido; clicável → seleciona).

**Decisões.** (1) Catálogo FECHADO no kernel (como `tipoHidraulico`/`tipoEletrico`), não texto livre: é o que dá símbolo, IFC, ligação ao ponto e contagem sem inventar; tipo novo = PR no catálogo. (2) Ligação ao ponto hidráulico é derivada por proximidade + tipo, não FK: não há o que ficar órfão ao mover/apagar, e a regra é a mesma que o olho aplica. (3) O mobiliário automático (E6.3) continua derivado; "aceitar" é que grava — sugerido tracejado até o usuário mover ou confirmar (mesmo contrato das vagas e tomadas sugeridas). (4) Um bump só para a entidade inteira; piso/forro/rodapé (E7.2) e revestimentos (E7.3) não mexem no canônico se puderem viver como derivados/`parametros`.

**Prova no app real (estudo "Planta 14/09/2026", escritas bloqueadas: 16, 0 erros de página).** Menu Mobiliário presente com 20 itens; "Cama de casal" arma a ferramenta (o botão passa a dizer qual) → um clique no canvas cria o componente e abre o painel ("Cama de casal · Mobiliário · 1,40 × 1,90 × 0,50 m · giro 0° · M-EE94"); giro 90° e troca para Vaso → "Louça · 0,40 × 0,65 × 0,40 m · giro 90°" e "Ponto hidráulico (Vaso sanitário): nenhum a até 0,60 m"; navegador com o grupo "Mobiliário — dormitório e sala 1". Ambientes renomeados na sessão (Dormitório 1, Cozinha, Sala, Banheiro) → gaveta Mobiliário "4 ambiente(s) com kit · 12 peça(s)" → **Aceitar: 1 → 13 componentes no pavimento; aceitar de novo: 13 → 13**. Planta com as peças tracejadas e rotuladas; vista 3D renderiza sem erro (as caixas ficam dentro do volume fechado — não visíveis de fora nesta prova). Testes: `__tests__/blueprintComponente.test.ts` (3: comandos/invariantes, canônico ida e volta + versão, ponto ligado + aceite idempotente + IFC) e editor "componentes (E7.1)" (menu → ferramenta; navegador → painel com ficha e ponto ligado a 300 mm; trocar tipo → ficha nova e aviso; aceitar → 1 → 4, idempotente; cama sugerida no navegador); suíte 378 arquivos / 4722 testes; tsc, check-ui e build OK.

Próxima: E7.2 — Piso, forro e rodapé.

### E7.2 — Piso, forro e rodapé (19/09/2026)

**O que entrou** (**bump `KERNEL_VERSION` 0.42.0 → 0.43.0** — a etiqueta ganha `acabamentos`; **quantitativo `quant-1.10.0 → 1.11.0`**):

- **Kernel** (`model.ts`): **`SpaceLabel.acabamentos?: AcabamentosDoAmbiente {piso?: CamadaParede[] (de baixo para cima), forro?: {camadas (de cima para baixo), rebaixoMm}, rodape?: Rodape {alturaMm, itemCode, descricao} | null}`**. Mora na ETIQUETA porque o ambiente é derivado — a mesma âncora que já leva nome, tipo e unidade; as camadas reusam `CamadaParede` (molde da parede: código opaco de catálogo, função, descrição-cache). `rodape: null` = "sem rodapé" declarado (≠ ausente = pela política). `FUNCOES_DE_CAMADA`, `clonarAcabamentos`, `acabamentosOuAusente` (`{}` → ausente), `assinaturaDosAcabamentos`, `acabamentosDoAmbiente(model, space)`, limites `MAX_REBAIXO_DE_FORRO_MM = 2000`, `MAX_ALTURA_DE_RODAPE_MM = 500`. Invariante `BAD_FINISH` (vazio, lista vazia, espessura ≤ 0 ou não inteira, função fora da lista, rebaixo/altura fora da faixa, código/descrição não-texto). Comandos: `NameSpace` e `SetSpaceLabelProps` ganham `acabamentos?` (SUBSTITUI o conjunto; `null` limpa; ausente não mexe — renomear não é redecorar). Canônico: emitido só quando declarado; goldens provadas com a string antiga (248 verdes) e recapturadas após o bump (`1d35688a…`, `e18119c6…`, `2cb1e665…`, `1f4399b0…`, `8f0f4ce2…`, `c04f4867…`).
- **Quantitativo 1.11.0** (`quantities.ts`): `QuantidadeAmbiente` += `piso?: {camadas medidas}`, `forro?: {rebaixoM, camadas}`, `rodapeDeclarado?` — cada camada com **área = área de piso líquida** (recuada, sem ilhas nem pilares) e volume = área × espessura; **rodapé declarado vence a altura da política; `null` zera o comprimento** (banheiro azulejado não compra rodapé). `totais.porAcabamento: {escopo PISO|FORRO|RODAPE, itemCode, descricao, funcao, areaM2, volumeM3, comprimentoM, ambientes}` — a lista de compras. Ambiente sem declaração não muda de número.
- **Orçamento** (`blueprintBudget.ts`): **`gerarLancamentosDeAcabamentos`** — sem de-para (o item foi escolhido no desenho, como nas camadas de parede); a **unidade do item decide**: piso/forro m³ → volume, m² → área; rodapé m → comprimento, m² → comprimento × altura; outra unidade ou sem código → divergência, nunca linha. Ids `bp:<estudo>:acabamento:<escopo>:<código>:<função>`; somado ao de-para, às camadas e às esquadrias em `blueprintBudgetService` (códigos resolvidos na mesma ida ao catálogo).
- **Tipos da organização (E1.1)**: `FamiliaDeTipo += 'PISO' | 'FORRO'` (`PropriedadesDePiso {camadas, rodape?}`, `PropriedadesDeForro {camadas, rebaixoMm}`, `propriedadesDoPiso/Forro`, `aplicarTipoDePiso/Forro` preservando o outro escopo, `resumoDasCamadas`); `assinaturaDoTipo` passou a serializar objetos/arrays em JSON com chaves ordenadas (antes `String()` daria `[object Object]` e todo piso teria a mesma assinatura). Migration **`aplicar_20270919000051_blueprint_element_types_piso_forro.sql`** (CHECK da família; aplicada e conferida).
- **`utils/blueprintAcabamentos.ts`** (puro): 8 presets com espessuras reais e código VAZIO de propósito (cerâmica/porcelanato/laminado/cimentado/banheiro; gesso/PVC/pintura na laje), `aplicarPreset`, **`presetsSugeridos(tipoDeAmbiente)`** (banheiro azulejado sem rodapé + PVC; cozinha/serviço cerâmica + PVC; sala/dormitório porcelanato + gesso; varanda cerâmica + laje), `resumirAcabamentos`, `semMaterial`, `resumirAcabamentosDoNivel`, `peDireitoUtilMm` (pé-direito − piso − rebaixo − forro).
- **Gaveta Arquitetura › Acabamentos › "Piso e forro"** (`PainelAcabamentos.tsx`; testids `tarefa-acabamentos`, `resumo-dos-acabamentos`, `sugerir-acabamentos`, `tabela-de-acabamentos`, `editor-de-acabamentos`, `aplicar-aos-iguais`, `materiais-de-acabamento`): tabela por ambiente (piso, forro, rodapé, m² de piso, m de rodapé, **pé-direito útil**, "N sem material"); "Sugerir pelo tipo (N)"; editor por ambiente com preset, **camadas** (espessura, função, descrição, material pelo `DatabasePickerModal`, subir/descer/excluir), rebaixo, rodapé pela política / declarado (altura + descrição + material) / sem, `SeletorDeTipo` PISO e FORRO (salvar/aplicar tipo da organização), "Aplicar aos N do mesmo tipo (NBR 5410)" num lote, Limpar; materiais do desenho inteiro. Cada gesto = um comando (`SetSpaceLabelProps` na etiqueta existente; `NameSpace` com o nome exibido quando o ambiente ainda não tinha etiqueta). **Cartão do ambiente** ganha a linha `acabamentos-do-ambiente-<id>` ("Piso: … · Forro: … · Rodapé: …") com o botão que abre a gaveta já naquele ambiente. **Quantitativos**: Resumo com linhas "Acabamento · Piso/Forro/Rodapé · material" e Por ambiente com as colunas Piso, Forro e Rodapé (material).
- **IFC**: o `IfcCovering` do piso/forro DECLARADO ganha `IfcMaterialLayerSet` (uma `IfcMaterialLayer` por camada) e `Qto_CoveringBaseQuantities.Width` (espessura total); o forro leva `Pset_OpuraAcabamento {RebaixoMm, Camadas}`; o **rodapé declarado sai como `IfcCovering .SKIRTINGBOARD.`** com Length (perímetro − vãos que chegam ao piso), Height e NetArea, material associado, `IfcRelCoversSpaces`; "sem rodapé" não emite; sem declaração o arquivo é o de antes (continua sem sólido — cabeçalho atualizado).

**Decisões.** (1) Acabamento na etiqueta, não "elemento piso" com contorno próprio: o contorno é o do ambiente e divergiria dele na primeira parede movida; a etiqueta já é a identidade estável do ambiente (IFC, unidades). (2) Camadas = `CamadaParede`: mesmo vocabulário, mesma assinatura, mesmo caminho para o orçamento. (3) Três estados de rodapé (política / declarado / sem) porque "não disse" e "não tem" compram coisas diferentes. (4) O orçamento dos acabamentos declarados NÃO passa pelo de-para; `AREA_PISO` no de-para continua para quem não declara — quem faz os dois compra duas vezes, e a prévia mostra os blocos separados (mesma nota das camadas de parede). (5) Tipo de piso/forro pelo catálogo de tipos de elemento (E1.1), não tabela nova: é o mesmo "molde na org, valor copiado no payload". (6) Um bump para o campo inteiro; E7.3 (guarda-corpo) tem bump próprio.

**Prova no app real (estudo "Planta 14/09/2026", escritas bloqueadas: 17, 0 erros de página).** Ambientes nomeados e classificados na sessão; cartão "sem declaração"; botão do ribbon "Piso e forro 4"; gaveta "0 de 4 … 4 sem piso · 4 sem forro" → **Sugerir pelo tipo → 4 de 4**: Dormitório 1 "Porcelanato · 55 mm / gesso rebaixo 30 cm / rodapé 7 cm · 25,18 m² · 18,50 m · pé-direito útil 2,43 m", Cozinha cerâmica + PVC, **Banheiro "Cerâmica antiderrapante · sem rodapé → 0,00 m · 2,54 m"**; editor do Banheiro: preset gesso → rebaixo 30 cm e pé-direito útil 2,43 m; seletor de tipo PISO presente ("Nenhum tipo salvo"); materiais do desenho: Porcelanato 92,81 m² / 0,85 m³ (4 amb.), Contrapiso 185,62 m² / 4,18 m³ (8), gesso 161,53 m² (7), rodapé de porcelanato 52,42 m / 3,67 m² (3) — 21 camadas sem código de catálogo (esperado: preset não escolhe item); cartão "Piso: Porcelanato (55 mm) · Forro: … · Rodapé: …"; Quantitativos › Resumo com as linhas "Acabamento · Piso · Porcelanato 92,81 m²" e Por ambiente com as três colunas ("Banheiro … sem rodapé"; pavimento sem declaração "— — política"). Testes: `__tests__/blueprintAcabamentos.test.ts` (6: comandos/invariantes, canônico, quantitativo, orçamento por unidade, IFC, presets/tipos) e editor "acabamentos (E7.2)" (cartão → gaveta no ambiente; sugerir; rodapé "sem" zera; aplicar aos iguais; tipo PISO salvo aplica; quantitativo); suíte 379 arquivos / 4729 testes; tsc, check-ui e build OK. Ajuste colateral: o teste E7.1 pinava a versão exata do kernel — passou a exigir ≥ 0.42.0.

Próxima: E7.3 — Guarda-corpo e corrimão (bump).

### E7.3 — Guarda-corpo e corrimão (19/09/2026)

**O que entrou** (**bump `KERNEL_VERSION` 0.43.0 → 0.44.0**; **quantitativo 1.11.0 → 1.12.0**):

- **Kernel** (`model.ts`): entidade **`GuardaCorpo {id, uid, levelId, tipo GUARDA_CORPO|CORRIMAO, pontos: Point[] (polilinha ≥ 2, sem trecho nulo), alturaMm, material METALICO|VIDRO|ALVENARIA|MADEIRA|INOX, itemCode, descricao, rotulo?, sugerido?}`**, `ALTURA_PADRAO_DO_GUARDA_CORPO_MM {1100, 920}`, `ALTURA_MINIMA_DO_GUARDA_CORPO_MM = 1100`, `FAIXA_DO_CORRIMAO_MM = [800, 920]`, `comprimentoDoGuardaCorpo`, `findGuardaCorpo`; invariante `BAD_RAILING`. O kernel NÃO impõe a altura da norma (levantamento do existente é desenho válido) — a conferência é aviso. Comandos `AddGuardaCorpo` (altura padrão do tipo), `SetGuardaCorpoProps` (trocar o tipo puxa a altura padrão nova só se a atual era a padrão do antigo), `MoveGuardaCorpo {dx, dy}` (mover confirma o sugerido), `DeleteGuardaCorpo`; `RemoveLevel` leva junto. Canônico `guardaCorpos` só quando há peça (ordem: pavimento, x, y do 1º ponto, tipo); identidade prefixo **`B-`** (balaustrada). Goldens provadas com a string antiga (248 verdes) e recapturadas (`d1a02436…`, `5d166d0b…`, `b1f7ab84…`, `1a56629f…`, `083ee86a…`, `1b58be7f…`).
- **Quantitativo 1.12.0**: `guardaCorpos[] {comprimentoM, alturaM, areaM2 = comprimento × altura, trechos, material, itemCode, sugerido}`, `totais.comprimentoGuardaCorpoM`, `totais.comprimentoCorrimaoM`, `totais.porGuardaCorpo` (tipo × material × código). **Orçamento**: medidas de de-para `COMPRIMENTO_GUARDA_CORPO` (M), `AREA_GUARDA_CORPO` (M2 — vidro e gradil por m²), `COMPRIMENTO_CORRIMAO` (M), escopo `GUARDA_CORPO`, com a trava de unidade; e **`gerarLancamentosDeGuardaCorpos`** para a peça com item declarado (m → comprimento, m² → área; outra unidade = divergência; sem item fica para o de-para, sem divergência).
- **`utils/blueprintGuardaCorpo.ts`** (puro): **`conferirGuardaCorpo`** (guarda-corpo < 1,10 m = ERRO NBR 14718; corrimão fora de 0,80–0,92 = AVISO NBR 9050 6.9.4; vidro sem item = AVISO NBR 7199), **`sugerirGuardaCorpos(model, levelId, hip)`** — (1) borda de LAJE sem parede em cima, em pavimento elevado (amostras a cada 50 cm; nenhuma pode ter eixo de parede a meia espessura + 100 mm) → guarda-corpo de 1,10 m; (2) escada/rampa → corrimão a meia largura dos dois lados (ou um), por lance, a 0,92 m; idempotente (mesmo tipo com extremos a ≤ 300 mm = "já coberta"); motivos legíveis quando nada sai ("pavimento mais baixo", "toda borda tem parede", "sem escada"); `resumirGuardaCorpos`; `HIPOTESES_DE_GUARDA_CORPO_PADRAO`.
- **UI**: menu Componentes › Circulação ganha **Guarda-corpo** e **Corrimão** (ferramenta `guardacorpo`, dois cliques com orto e prévia, como o eixo); canvas desenha linha dupla com balaústres a cada 12 cm (corrimão linha grossa), sugerido tracejado, seleção por qualquer trecho; **`PainelGuardaCorpoSelecionado`** (`painel-guarda-corpo`: tipo, altura, material, item do catálogo via `DatabasePickerModal`, rótulo, comprimento/área derivados, avisos `avisos-do-guarda-corpo`, Aceitar/Excluir); **gaveta Arquitetura › Acabamentos › Guarda-corpos** (`PainelGuardaCorpos`, testids `tarefa-guarda-corpos`, `resumo-dos-guarda-corpos`, `lancar-guarda-corpos`, `tabela-de-sugestoes`, `motivos-da-sugestao`, `aceitar-guarda-corpos`, `tabela-de-guarda-corpos`) com hipóteses persistidas (`blueprint:guardaCorpos`), sugestões com Lançar por linha ou todas, peças do pavimento com conferência; contagem do botão = sugestões + peças abaixo do mínimo; navegador com as chaves `GUARDA_CORPO`/`CORRIMAO`; Quantitativos › Resumo (metros por tipo + por material).
- **IFC**: **`IfcRailing`** `.GUARDRAIL.`/`.HANDRAIL.`, um sólido por trecho (comprimento × 50 mm, na altura, apoiado no piso), `Qto_RailingBaseQuantities.Length`, `Pset_OpuraGuardaCorpo {Tipo, Material, AlturaMm, ItemCode, Sugerido}`, item de catálogo na classificação; cabeçalho declara que a espessura é marca de lugar. **3D**: um painel por trecho (vidro translúcido, inox metálico, sugerido translúcido, clicável).

**Decisões.** (1) Polilinha própria em vez de "ancorar na borda da laje": a proteção sobrevive a mover a laje ou a parede, e a sugestão é só a origem do desenho. (2) A norma confere, não trava (idem E7.2). (3) Sugestão só em pavimento elevado e só onde NENHUMA amostra da aresta tem parede — aresta parcialmente livre não é sugerida inteira (evita atravessar a parede); quem quiser o trecho livre desenha com dois cliques. (4) Varanda no térreo com parede baixa (parapeito) fica de fora: o desenho não sabe se a parede baixa é peitoril ou mureta de guarda-corpo. (5) Um bump para a entidade; sem tabela nova (material fechado + item de catálogo já cobrem o custo).

**Prova no app real (estudo "Planta 14/09/2026", escritas bloqueadas: 15, 0 erros de página).** Gaveta no Térreo: 0 peças e os motivos ("Térreo é o pavimento mais baixo…" · "sem escada ou rampa"); no Pavimento 1: "toda borda de laje tem parede em cima" (a laje real é toda fechada — motivo honesto, sem sugestão inventada). Menu Componentes oferece Guarda-corpo e Corrimão; dois cliques criam a peça (painel "Metálico · 4,40 m · h 1,10 m · 4,84 m² · B-…"); altura 900 → "NBR 14718: altura 0,90 m abaixo do mínimo de 1,10 m"; material Vidro → 3,96 m² e aviso NBR 7199; gaveta lista a peça com a conferência; Quantitativos › Resumo "Guarda-corpo 4,40 m" e "Guarda-corpo · vidro 4,40 m · 3,96 m² · sem item de catálogo"; 3D sem erro. Testes: `__tests__/blueprintGuardaCorpo.test.ts` (6: comandos/invariantes, canônico, quantitativo + de-para + linha direta, conferência, sugestão idempotente, IFC) e editor "guarda-corpos (E7.3)" (gaveta sugere 2 corrimãos da escada; lançar → 3 peças, 2 sugeridas; aceitar; painel avisa e limpa ao subir para 1,10 m; vidro; menu; navegador; no Superior a borda sul da laje vira sugestão de 8 m); suíte 380 arquivos / 4736 testes; tsc, check-ui e build OK. Ajuste colateral: o teste E7.2 pinava a versão exata do kernel — passou a exigir ≥ 0.43.0.

Próxima: E7.4 — Biblioteca de materiais (`blueprint_materials`).

### E7.4 — Biblioteca de materiais (19/09/2026) · fecha a Etapa 7

**O que entrou** (**sem bump** — ver a decisão 1):

- **Tabela `blueprint_materials`** (migration **`aplicar_20270919000052_blueprint_materials.sql`**, aplicada; RLS `is_org_member`, zero grants a `anon`, `UNIQUE (organization_id, codigo)`): `codigo` (o MESMO espaço de `CamadaParede.itemCode` — SINAPI ou interno "INT-…"), `nome`, `fonte SINAPI|INTERNA`, `unidade`, `custo`, `fabricante`, **`densidade_kg_m3`, `condutividade_w_mk`** (P2), `cor` (#rrggbb), `funcao` e `espessura_padrao_mm` (a camada nasce pronta), `propriedades` jsonb, `active`. `types/blueprint.ts` `BlueprintMaterialRow`; **`services/blueprintMaterialService.ts`** (`list` com org nula = "Todas", `byCodigos`, `create`, `update`, `deactivate`); **`hooks/useBlueprintMateriais`** (carrega uma vez por editor; `porCodigo`; indisponível = lista vazia + motivo).
- **`utils/blueprintMateriais.ts`** (puro): `Material`, `materialDaLinha`, `validarMaterial`, `indicePorCodigo`, **`camadaDoMaterial`** (função + espessura usuais), **`massaKg`** (volume × ρ), **`desempenhoTermico`** (R = Σ e/λ; U = 1/(Rsi + R + Rse), NBR 15220; câmara de ar sem material = 0,17; camada sem λ derruba o U e é nomeada), `custoDe` (grandeza pela unidade do material — m², m³, m, un, kg; não casa = `null`), `itemDoMaterial` (→ `SinapiItem`), `resumirUso`, **`MATERIAIS_SEMENTE`** (12 internos com ρ e λ, custo zero para a org preencher).
- **Tela Arquitetura › Acabamentos › Materiais** (`TelaMateriais.tsx`, testids `tela-materiais`, `resumo-dos-materiais`, `form-material`, `erros-do-material`, `salvar-material`, `novo-material`, `importar-sinapi`, `semear-materiais`): `StandardTable` com código, nome (amostra de cor), fonte, unidade, custo, fabricante, ρ, λ, função, e padrão, **uso no desenho** (m²/m³/m + ≈ kg + R$ estimado, pelo quantitativo ao vivo) e ativo; formulário in-flow com validação; importar do catálogo (`DatabasePickerModal`, código entra como está); semear padrão; desativar (com `useConfirm`) não apaga — o código continua resolvível. Gravação por `useOrgWriteTarget` (REGRA #5: topo em "Todas" abre o modal de organização). Contagem do botão = códigos do desenho fora da biblioteca.
- **`SeletorDeMaterial`** (select da biblioteca + "Catálogo…"; código atual fora da biblioteca aparece como opção própria, nunca some) em **`PainelCamadasParede`** (por camada; escolher puxa a função do material), **`PainelAcabamentos`** (camadas de piso/forro, "adicionar camada da biblioteca", rodapé só m/m²; **desempenho térmico do piso e do forro** — `termico-do-piso/forro` — com Rsi/Rse horizontais 0,17/0,04) e **`PainelGuardaCorpoSelecionado`** (m/m²). Sem material na biblioteca, os painéis ficam como eram (botão do catálogo).
- **Orçamento**: `resolverItens(codes, organizationId)` passa a consultar a biblioteca depois do SINAPI e da base própria — **material com custo > 0 sobrepõe** (é o preço que a organização paga); custo zero só preenche código que ninguém resolveu (importado sem preço não zera item que o SINAPI cota); indisponível = segue sem. `blueprintBudgetService` passa `snapshot.organization_id`. **Quantitativos › Resumo**: linhas de Material e Acabamento ganham "≈ kg" (ρ) e "R$" (custo pela unidade) e "fora da biblioteca" quando há biblioteca e o código não está nela.

**Decisões.** (1) **Sem campo novo no kernel e sem bump**: a fase pedia "camadas e tipos apontam por id" — o kernel nunca resolve código (decisão de `CamadaParede`), então o "id" que a camada aponta É o código, e a biblioteca é quem o torna id de algo. Um `materialId` no payload faria o hash de uma revisão publicada depender da biblioteca do dia. (2) Desativar, não apagar: o código fica no desenho e continua resolvível (mesma razão de `blueprint_wall_types`). (3) Biblioteca sobrepõe SINAPI só com custo preenchido. (4) Térmico e massa são pré-dimensionamento declarado (sem ponte térmica, sem umidade). (5) Tipos de piso/forro/parede continuam sendo composições (E1.1/E7.2) — a biblioteca é o material de cada camada, não a composição.

**Prova no app real (estudo "Planta 14/09/2026", escritas bloqueadas: 21, 0 erros de página).** Botão "Materiais" no ribbon; tela abre com a biblioteca da organização **vazia** (persistência disponível — sem aviso), "Semear padrão (12)" habilitado; "Novo material" → Salvar vazio → "código é obrigatório · nome é obrigatório"; preenchido → o modal de organização da REGRA #5 (topo em "Todas") → escolhida uma org, a gravação foi bloqueada pelo harness e o erro apareceu no formulário (`Failed to fetch`, uma por organização alvo); "Importar do catálogo" abre o picker SINAPI (base/ref/UF); gaveta Acabamentos com biblioteca vazia mantém os botões do catálogo (3 camadas do preset). Testes: `__tests__/blueprintMateriais.test.ts` (5: linha/validação, camada/massa/custo/item, térmico NBR 15220, sementes/resumo, kernel intacto sem bump) e editor "biblioteca de materiais (E7.4)" (ribbon conta o código fora da biblioteca; tela lista uso com ≈ 878 kg e R$ 263,34; criar valida e grava pelo serviço com uma org na loja; Quantitativos com massa/custo; seletor da biblioteca troca a camada e o térmico sai "R 0,04 · U 3,93"); suíte 381 arquivos / 4742 testes; tsc, check-ui e build OK.

**Etapa 7 fechada** (7.1 Componentes, 7.2 Piso/forro/rodapé, 7.3 Guarda-corpo, 7.4 Biblioteca de materiais). Próxima: **E8.1 — Anotações** (bump).

### E8.1 — Anotações (19/09/2026) · abre a Etapa 8

**O que entrou** (**bump `KERNEL_VERSION` 0.44.0 → 0.45.0**):

- **Kernel** (`model.ts`): entidade **`Anotacao {id, uid, vista, tipo TEXTO|LEADER|LINHA|HACHURA|COTA_ANGULAR, pontos[], texto, alturaMm, traco CONTINUO|TRACEJADO|PONTILHADO, hachura DIAGONAL|CRUZADA|PONTOS|SOLIDA|null, rotacaoGraus, cor}`**, **por vista**: `{PLANTA levelId} | {CORTE corteId} | {ELEVACAO direcao}` — na planta os pontos são (x, y) do modelo; no corte/elevação, (u, v) do plano da vista. `PONTOS_MINIMOS_DA_ANOTACAO` (1/2/2/3/3), `ALTURA_PADRAO_DO_TEXTO_MM = 250` (mm do MODELO — a nota escala com o desenho; a exportação divide pela escala), `MAX_TEXTO_DE_ANOTACAO = 500`, **`anguloDaCota`** (derivado — cota digitada mente quando a parede move), `mesmaVista`, `findAnotacao`; invariante `BAD_ANNOTATION` (vista inexistente, pontos de menos, texto vazio em TEXTO/LEADER, hachura fora da HACHURA ou HACHURA sem padrão, altura ≤ 0, traço/cor inválidos). Comandos `AddAnotacao` (texto padrão "Texto", hachura DIAGONAL), `SetAnotacaoProps`, `MoveAnotacao {dx, dy}`, `DeleteAnotacao`; **`RemoveLevel` leva as da planta e `DeleteCorte` as do corte**. Canônico `anotacoes` só quando há (vista por ÍNDICE de pavimento/corte + direção; ordem planta < corte < elevação, depois 1º ponto); identidade prefixo **`A-`**. Goldens provadas com a string antiga (248 verdes) e recapturadas (`99994d7d…`, `da389052…`, `2f8f9a06…`, `75780761…`, `540bdfa8…`, `c06ff546…`).
- **`utils/blueprintAnotacoes.ts`** (puro, a MESMA geometria da tela, do PDF e do DXF): `anotacoesDaVista`, `tracejadoMm`, **`pontaDaSeta`** (proporcional à altura do texto), **`linhasDaHachura`** (retas a 45°/135° recortadas por interseção com as arestas do polígono; grade de pontos; sólida = preenchimento), **`cotaAngularDesenhada`** (arco pelo lado menor, raio 60 % da menor perna ≥ 200 mm, rótulo na bissetriz), `distanciaAAnotacao` (seleção: texto pela caixa, hachura pelo interior, o resto pelos segmentos), `resumirAnotacoes`.
- **Canvas** (ferramenta `anotacao`): texto fecha no 1º clique, leader no 2º, cota angular no 3º (orto em relação ao VÉRTICE), linha e hachura acumulam e fecham no duplo clique (vértice repetido dentro da tolerância do clique é ignorado — o 2º clique do duplo não vira vértice); prévia tracejada; desenho de cada tipo (seta preenchida, hachura, arco + rótulo, texto multilinha girado); seleção por clique antes de tudo (é a camada de cima); Escape desiste. **Ribbon Inserir › Anotações**: cinco botões (Texto, Texto com seta, Linha, Região hachurada, Cota angular) com contagem por tipo, armam/desarmam a ferramenta. **`PainelAnotacaoSelecionada`** (`painel-anotacao`): texto multilinha, altura, traço, padrão da hachura, giro do texto, cor, **ângulo derivado** (`angulo-da-cota`), vértices editáveis um a um, Excluir.
- **PDF** (`blueprintExport.ts` **`desenharAnotacoes`**): a planta desenha as suas por cima das cotas; corte/elevação recebem as do modelo por `OpcoesExportacao.anotacoes` (o serviço passa `model.anotacoes` nas pranchas e no PNG) e filtram por `corteId`/`direcao`; altura do texto = mm do modelo ÷ denominador, mínimo 1,5 mm de papel. **DXF** (`blueprintDxf.ts`): camada **`PLANTA-ANOTACOES`** (cor 30) com TEXT/LINE/POLYLINE (hachura = contorno + linhas; cota = duas retas + arco em POLYLINE + TEXT), e cada bloco de elevação/corte leva as suas no mesmo deslocamento.

**Decisões.** (1) Anotação NÃO é construção: fora de ambiente, quantitativo, orçamento, IFC e navegador — está no payload porque prancha sem anotação não é prancha e porque a identidade `A-` tem de sobreviver entre revisões. (2) Por vista, gravada (não derivada): "esta nota fica no corte AA" é decisão do desenhista. (3) A ferramenta de criação existe na PLANTA; corte e elevação já aceitam anotações no modelo, no PDF e no DXF — a ferramenta nessas vistas fica para a E8.3 (pranchas), quando a vista ganha interação. (4) Altura em mm do modelo, não do papel — é como o CAD pensa e é o que deixa uma nota valer em 1:50 e em 1:100 sem duas cópias. (5) Um bump para a entidade inteira.

**Prova no app real (estudo "Planta 14/09/2026", escritas bloqueadas: 17, 0 erros de página).** Inserir mostra os 5 botões; "Texto" arma (`aria-pressed`); 1 clique cria e abre o painel ("Texto na planta · 1 ponto(s) · texto 250 mm · A-…"); editar texto e altura 400 reflete; "Texto com seta" com 2 cliques (prévia tracejada); **cota angular com 3 cliques → "90,0° (derivado)"** (a 1ª rodada deu 0,0° porque o orto travava a 2ª ponta em relação à 1ª — corrigido para travar em relação ao vértice); **hachura com 3 cliques + duplo clique → 3 vértices** (a 1ª rodada gravou 4: o clique do duplo, deslocado uns mm pelo orto, virava vértice — corrigido com a tolerância do clique); padrão trocado para cruzada; planta com os quatro (captura); contagens "Texto 1 · Texto com seta 1 · Cota angular 1 · Região hachurada 1". Testes: `__tests__/blueprintAnotacoes.test.ts` (5: comandos/invariantes, vista manda em RemoveLevel/DeleteCorte, canônico por índice, geometria, PDF+DXF), `__tests__/components/blueprintAnotacaoCanvas.test.tsx` (4: cliques por tipo, duplo clique/Escape, seleção por caixa e traço, painel) e editor "anotações (E8.1)" (ribbon conta/arma/desarma); suíte 383 arquivos / 4752 testes; tsc, check-ui e build OK. Ajuste colateral: o teste E7.4 pinava a versão exata do kernel — passou a ≥ 0.44.0.

Próxima: E8.2 — Filtros e templates de vista.

### E8.2 — Filtros e templates de vista (19/09/2026)

**O que entrou** (**sem bump** — tudo é configuração de leitura):

- **`utils/blueprintPaletas.ts`** (puro): **`ModoDeCor`** `NENHUM | AMBIENTE | TIPO_DE_AMBIENTE | UNIDADE | USO | PAVIMENTO` e **`coresDaVista(model, modo, levelId?)`** → cor por `spaceId` + **legenda** (rótulo, cor, quantidade no recorte do pavimento, ambiente colorido mesmo fora do recorte — a mesma unidade tem a mesma cor em todos os pavimentos). `blueprintCoresAmbiente` virou a paleta AMBIENTE; TIPO usa cores fixas por classe NBR 5410 (`PALETA_DO_TIPO_DE_AMBIENTE`); USO uma por uso do programa (E4.1, `usoDoNome`); UNIDADE/PAVIMENTO paleta cíclica por índice (área comum em cinza). A paleta não toca no modelo nem no hash.
- **`utils/blueprintTemplatesDeVista.ts`** (puro): **`ConfiguracaoDeVista {planta: 13 camadas de exibição, modoDeCor, vista3d: 5 camadas, estilo3d}`**, `CONFIGURACAO_PADRAO`, **`configuracaoDaColuna`** (JSONB sanitizado chave a chave), **`diferencas`**/`mesmaConfiguracao` (a prévia "N mudança(s)" e o "· atual"), **4 templates de fábrica** (Apresentação, Executivo (cotas), Instalações, Comercial (unidades)), `validarTemplate` (nome único, ≤ 60). **`Estilo3d`** `SOMBREADO | LINHA_OCULTA | TRANSPARENTE`.
- **Tabela `blueprint_view_templates`** (migration **`aplicar_20270919000053_blueprint_view_templates.sql`**, aplicada; RLS `is_org_member`, zero grants a `anon`, nome único por org) + `services/blueprintViewTemplateService.ts` (list/create/update/remove = desativar).
- **`MenuVista`** (ao lado de Exibir, na planta e nas vistas; testids `menu-vista`, `painel-da-vista`, `legenda-de-cores`, `templates-de-vista`, `salvar-vista-como`, `confirmar-template`, `erro-do-template`): "Colorir ambientes por" (liga o preenchimento se estava desligado) com legenda; "Estilo do 3D"; templates de fábrica + da organização com "Aplicar template X" (título diz o que muda), "· atual" quando a configuração bate, remover (só os da org); "Salvar vista atual como template…" (REGRA #5 via `useOrgWriteTarget`; o popover não fecha enquanto grava, para o erro/sucesso chegar). O botão diz o template ativo ou o modo de cor. O item "Uma cor por ambiente" do Exibir continua como atalho do modo AMBIENTE. Editor: `modoDeCor` (persistido `blueprint:modoDeCor`, nascendo do legado `coresPorAmbiente`), `estilo3d` (`blueprint:vista3dEstilo`), `configuracaoDeVista` (captura) e `aplicarConfiguracaoDeVista` (todos os toggles de uma vez); canvas ganha `coresDosAmbientes`.
- **3D** (`Blueprint3DViewer`/`Blueprint3DTab` prop `estilo`): **linha oculta** = paredes e estrutura brancas, rugosas, com arestas pretas sempre; **transparente** = paredes e estrutura a 35 % sem `depthWrite` (as instalações e o interior aparecem); sombreado = como era.
- Colateral necessário: o **modal de organização** (REGRA #5) passou a ser montado fora de qualquer tela — estava só dentro da tela Materiais, e o "Salvar template" pela planta nunca o abria (a promessa ficava pendurada, sem erro). Agora vale para Materiais e Vista.

**Decisões.** (1) Template é da ORGANIZAÇÃO e é configuração de leitura: aplicar não mexe no desenho nem no hash — por isso mora fora do kernel e do estudo. (2) Templates de fábrica sempre presentes e imutáveis: dão o "por onde começar" e não dependem de migration. (3) "Fase/status" já colorem PEÇAS pelo 4D (`coresPorUid`); a paleta por AMBIENTE não tem status próprio, então a fase não entrou como modo de ambiente. (4) "Espessuras" (peso de linha) ficou fora: o canvas não tem um peso de traço global e o PDF/DXF já fixam pesos por família — inventar um multiplicador sem saída no papel seria mentira; entra na E8.3 com as pranchas. (5) "Escala" também fica na E8.3 (é da prancha, não da vista).

**Prova no app real (estudo "Planta 14/09/2026", escritas bloqueadas: 19, 0 erros de página).** Menu "Vista" presente; 4 templates de fábrica listados com "N mudança(s)"; "Colorir por tipo" → legenda "Banheiro 1 · Cozinha / serviço 1 · Sala / dormitório 2" e a planta pintada por classe; por unidade → "Área comum / sem unidade 4"; **Aplicar "Executivo (cotas)"** → o botão diz o template, `localStorage` com medidas/cotas ligadas, preenchimento desligado, cor NENHUM, 3D linha oculta; **Salvar vista atual** → modal de organização da REGRA #5 (topo em "Todas"), gravação bloqueada e o erro no popover (uma linha por org); 3D em linha oculta e em transparente (instalações visíveis através das paredes). Testes: `__tests__/blueprintPaletas.test.ts` (2: paletas/legenda por recorte + hash intacto; configuração/diff/fábrica/validação) e editor "vista (E8.2)" (colorir por tipo com legenda e persistência; 4 + 1 templates; aplicar liga/desliga camadas, cor e estilo; estilo 3D; salvar valida vazio/repetido e grava com a configuração atual); suíte 386 arquivos / 4762 testes; tsc, check-ui e build OK.

Próxima: E8.3 — Pranchas.

### E8.3 — Pranchas (20/09/2026)

**O que entrou** (**sem bump** — o conjunto é DERIVADO do modelo e do template; nada novo no payload):

- **`utils/blueprintPranchas.ts`** (puro): **`TemplateDePrancha {papel, paisagem, denominadorPlanta, denominadorCortes, denominadorAmpliacao, cotas, carimbo {empresa, responsavel, registro, cliente, endereco, prefixo, camposExtras[≤6]}, incluir {indice, plantas, cortes, elevacoes, ampliacoes, tabelas, eletrica}}`**, `TEMPLATE_DE_PRANCHA_PADRAO` (A1 paisagem, 1:50 / 1:50 / 1:25), **3 templates de fábrica** (A1 · 1:50 padrão; A3 · 1:100 estudo sem cotas/ampliações/tabelas; A0 · 1:50 executivo + elétrica), `templateDePranchaDaColuna` (JSONB sanitizado: papel fora da lista → A1, escala fora da lista → padrão, prefixo vazio → "A"), `papelDoTemplate` (orientação), `validarNomeDoTemplateDePrancha`. **`planejarConjunto(model, template)`** → `PranchaPlanejada[]` numeradas `<prefixo>-01…`: índice; **uma planta por pavimento com parede** (de baixo para cima); elétrica por pavimento + quadro de cargas + unifilar uma vez (só com circuitos); um corte por corte do modelo; 4 fachadas; **ampliação por banheiro e cozinha/serviço** (recorte = caixa do ambiente com 60 cm de folga, na escala de ampliação); quadro de áreas e de esquadrias. `modeloDoPavimento(model, levelId)` recorta paredes, aberturas, ambientes, etiquetas e anotações do pavimento (níveis e cortes inteiros).
- **`utils/blueprintExport.ts`**: `OpcoesExportacao` += `recorte?` (ampliação: `enquadrar` pela caixa com folga zero, `Desenhista.recortar/fimDoRecorte` opcional — PDF e canvas cortam o que sai do retângulo — e moldura), `carimboDaOrg?` (bloco à esquerda: empresa, responsável · registro, cliente, endereço, extras) e `prancha? {numero, total, titulo}` (bloco à direita: "Prancha / A-03 / de N"); **`desenharIndice`** (tabela Nº / Prancha / Escala) e **`desenharTabelas`** (quadro de áreas por ambiente + total; quadro de esquadrias por nome/tipo/L×A/qtd); folha sem escala diz "Sem escala" e não desenha escala gráfica.
- **`services/blueprintExportService.ts`**: `desenharConjunto(model, opcoes, template, novaFolha)` (uma folha por prancha; **quando a escala do template não cabe no papel, a folha desce para a escala sugerida e o carimbo diz a escala real**), `montarConjuntoPdf` (um PDF só, `…-conjunto-Npr.pdf`), `exportarConjuntoPdf`.
- **Tabela `blueprint_sheet_templates`** (migration **`aplicar_20270919000054_blueprint_sheet_templates.sql`**, aplicada; RLS `is_org_member`, zero grants a `anon`, nome único por org, `updated_at` por trigger) + `services/blueprintSheetTemplateService.ts` (list/create/update/remove = desativar).
- **`PainelConjuntoDePranchas`** dentro de Versões › Exportar (testids `conjunto-de-pranchas`, `editar-template-de-prancha`, `edicao-do-template-de-prancha`, `salvar-template-de-prancha`, `confirmar-template-de-prancha`, `erro-do-template-de-prancha`, `plano-do-conjunto`, `gerar-conjunto`): seletor de template (fábrica + da organização, remover só os da org), **plano do conjunto ao vivo** (número, tipo, título, escala — muda enquanto se edita), edição de formato (papel, orientação, 3 escalas, cotas), **carimbo** (empresa, responsável, registro, prefixo, cliente, endereço) e inclusões; "Salvar como template…" (nome único; REGRA #5 via `useOrgWriteTarget`, uma gravação por org alvo); "Gerar conjunto (PDF, N folhas)". Exporta sempre a VERSÃO escolhida, como o resto do painel.

**Decisões.** (1) O conjunto é derivado, não gravado: o que se persiste é o TEMPLATE (formato + carimbo + inclusões) — a lista de pranchas nasce do modelo e por isso nunca fica órfã quando um pavimento, corte ou banheiro aparece ou some. (2) Escala que não cabe NÃO bloqueia o conjunto (ao contrário do PDF avulso, que desabilita o botão): a folha desce para a escala que cabe e o carimbo diz qual é — um conjunto de 12 folhas não pode travar por uma. (3) Ampliação = a mesma planta com recorte e clip, na escala de ampliação; não é uma vista nova nem entra no payload. (4) Espessuras de traço continuam fixas por família no PDF/DXF (E8.2, decisão 4): um "peso de linha" por template ficaria sem efeito visível sem reescrever o desenhista — fica declarado como pendência, não escondido. (5) Cotas/anotações por vista de corte/elevação (E8.1, decisão 3) não entraram: a prancha de corte sai como já saía, com as anotações do modelo.

**Prova no app real (estudo "Planta 23/08/2026" publicado, versão 1; escritas bloqueadas: 16; `blueprint_sheet_templates` continua com 0 linhas).** Colaborar › Versões: painel "Conjunto de pranchas" com os 3 templates de fábrica; plano padrão = A-01 índice, A-02 planta Térreo 1:50, A-03…A-06 fachadas, A-07 tabelas; editar (A2, 1:100, empresa/responsável, prefixo ARQ, sem fachadas) → plano vira ARQ-01…ARQ-03 na hora; salvar com nome de fábrica → "já existe um template chamado …" sem ir ao banco; nome novo → modal de organização da REGRA #5 (topo em "Todas") → gravação bloqueada e o erro ao lado do botão; **Gerar conjunto** → `planta-23082026-v1-conjunto-3pr.pdf` com 3 páginas conferidas (índice em tabela; planta 1:100 em A2 com cotas, carimbo "Alpa Construtora / Eng. Prova", "Prancha ARQ-02 de 3", escala gráfica; quadro de áreas com 6 ambientes e total 136,70 m² + quadro de esquadrias). Testes: `__tests__/blueprintPranchas.test.ts` (5: sanitização/fábrica/nome; plano completo do sobrado com banheiro e corte, prefixo e inclusões; modelo por pavimento; ampliação com `recortar`/`fimDoRecorte`, enquadramento sem folga e carimbo da org; índice, conjunto de 10 folhas pelo desenhista de prova e auto-ajuste de escala em A4) e `PainelVersoes.test.tsx` "conjunto de pranchas (E8.3)" (2: plano derivado e edição ao vivo chegando ao serviço; salvar recusa nome repetido, grava na org e o template novo entra no seletor e troca o plano); suíte 389 arquivos / 4785 testes; tsc, check-ui e build OK.

Próxima: E8.4 — Planta humanizada.

### E8.4 — Planta humanizada (20/09/2026) · fecha a Etapa 8

**O que entrou** (**sem bump** — é um ESTILO de leitura; nada toca no payload nem no hash):

- **`utils/blueprintHumanizada.ts`** (puro): **`estiloDoPiso(model, space)`** decide o material do piso na ordem *declarado > tipo > uso > padrão* — a ÚLTIMA camada de acabamento do piso da E7.2 pela descrição (`padraoDaDescricao`: porcelanato, cerâmica/azulejo, madeira/laminado/vinílico, pedra/granito/mármore, carpete, cimento/concreto, deck, grama), senão o tipo NBR 5410 (banheiro/cozinha → cerâmica, varanda → deck, sala/dormitório → madeira), senão o uso pelo nome (E4.1; "jardim/quintal" → grama, garagem → cimento), senão porcelanato; cada estilo tem cor, cor da trama e módulo, e diz a `origem`. **`tramaDoPiso(space, estilo)`** → segmentos em mm JÁ RECORTADOS pelo polígono do ambiente (`recortarSegmento`: côncavo e com buracos), ancorados na origem do modelo (ambientes vizinhos alinham as juntas): grade para porcelanato/cerâmica, fiadas desencontradas para pedra, tábuas com topos desencontrados para madeira/deck, tufos determinísticos para grama, nada para carpete/cimento. **`sombraDaParede`**/`corpoDaParede` (retângulo estendido nos cantos, deslocado 120 mm para sudeste). **`vegetacaoSimbolica(model, levelId)`**: árvores no LOTE (fora da casa, longe das paredes, dentro do lote com folga; malha de 2,5 m com ruído determinístico) e um arbusto por varanda/jardim; `copa` como polígono. **`simboloNoMundo(componente)`** e **`COR_DA_FAMILIA`**: o símbolo do mobiliário (E7.1) em dados (linhas, polilinhas, círculos/elipses → 24 lados) para o PDF desenhar o mesmo do canvas. `resumirPisos`.
- **Templates de vista (E8.2)** ganham **`estiloPlanta: 'TECNICA' | 'HUMANIZADA'`** (ausente em template gravado → técnica; sanitizado; no diff como "Planta: Humanizada") e o **5º template de fábrica "Humanizada (venda)"** (sem grade, medidas, cotas, camadas e circuitos; preenchimento e rótulos ligados; laje no 3D).
- **Menu Vista**: "Estilo da planta" (Técnica/Humanizada); em humanizada, o resumo dos pisos (`resumo-dos-pisos`: "Porcelanato 3 · Cerâmica 1 (1 suposto)") diz de onde veio cada trama e que mobiliário e vegetação são ilustrativos; ligar a humanizada liga o preenchimento; o botão diz "Humanizada". Editor: `estiloPlanta` persistido em `blueprint:estiloPlanta`, entra na configuração de vista (salvar/aplicar template).
- **Canvas** (props `humanizada`, `pisosHumanizados`, `vegetacao`): ambiente pintado com a cor do piso (o "Colorir por" continua vencendo) + a trama; **sombra** das paredes sob as paredes; **paredes CHEIAS** (`#2f2f2f`, sem escavar o miolo); mobiliário preenchido pela **cor da família**; árvores (copa + raios) e arbustos. A trama é recortada uma vez por modelo/estilo (`useMemo`), não a cada quadro.
- **PDF/PNG** (`OpcoesExportacao.humanizada`): pisos com cor e trama, sombra OPACA (papel não compõe alfa), parede cheia, mobiliário por família com símbolo, vegetação; **aviso próprio** `AVISO_HUMANIZADA` ("PLANTA HUMANIZADA — ilustrativa… Não vale para execução nem para aprovação legal.") e **sem cotas** independentemente do que o painel marcou. `PranchaExport += 'humanizada'` (checkbox "Humanizada" em Versões › Exportar, obedece à escala caber como a planta); no **conjunto (E8.3)** a inclusão "Plantas humanizadas (venda)" gera `HUMANIZADA` por pavimento logo depois das plantas técnicas.
- **Colateral que vale para a prancha técnica também**: o PDF/PNG da planta **não desenhava aberturas** (parede fechada onde há porta) — `desenharAberturas` entrou com a geometria do canvas: vão aberto, batentes, porta com folha + arco de giro (12 segmentos), janela no eixo, correr recolhida, vão livre só com batentes. Na humanizada, sem isso, a parede cheia escondia toda porta.

**Decisões.** (1) Humanizada é ESTILO DE VISTA (E8.2), não entidade: mora no template de vista da organização e no `localStorage`, como o modo de cor — não há "planta humanizada" gravada. (2) O piso vem do que foi DECLARADO (E7.2) antes de qualquer suposição, e a suposição é dita ("1 suposto"): a planta de venda não pode inventar acabamento em silêncio. (3) Vegetação e sombra são desenho de apresentação: não entram em quantitativo, orçamento, IFC nem DXF. (4) O PDF humanizado sai sem cotas e com aviso próprio SEMPRE — é material de venda, e uma cota nele vira promessa contratual. (5) Trama recortada em geometria (não por `clip`) para PDF, canvas e teste verem o mesmo desenho. (6) Sem "renderização realista" (texturas bitmap, sombras suaves): o desenhista de PDF só sabe linha, polígono e texto, e é isso que sai igual na tela e no papel.

**Prova no app real (estudo "Planta 14/09/2026" para a tela; "Planta 23/08/2026" publicado para o PDF; escritas bloqueadas: 14 + 16).** Vista › Estilo da planta lista Técnica/Humanizada; humanizada → `blueprint:estiloPlanta="HUMANIZADA"`, preenchimento ligado, resumo "Porcelanato 3 · Cerâmica 1" (os quatro ambientes têm piso DECLARADO desde a prova da E7.2, por isso sem "suposto"), botão "Humanizada"; canvas com paredes cheias, sombra, pisos coloridos com trama e arbusto na varanda (capturas); 5 templates de fábrica; **Aplicar "Humanizada (venda)"** → grade e cotas desligadas, botão diz o template; voltar à técnica. Versões › Exportar: checkbox "Humanizada" → `planta-23082026-v1-1_100.pdf` conferido (paredes cheias com sombra, cozinha em cerâmica, demais em porcelanato com trama, **duas portas com arco**, aviso "PLANTA HUMANIZADA — ilustrativa…", sem cotas); conjunto com "Plantas humanizadas (venda)" → plano A-03 "Planta humanizada — Térreo". Testes: `__tests__/blueprintHumanizada.test.ts` (7: material declarado/tipo/uso/padrão/lote + hash intacto; recorte côncavo/buraco; trama alinhada e desencontrada; sombra; vegetação determinística; símbolo do fogão; PDF humanizado × técnico com aberturas), `blueprintPaletas` (estiloPlanta, 5 templates), `blueprintPranchas` (inclusão humanizada; folha com sombra e aviso só na humanizada), editor "planta humanizada (E8.4)" e `PainelVersoes` "planta humanizada (E8.4)"; suíte 390 arquivos / 4794 testes; tsc, check-ui e build OK.

**Etapa 8 fechada** (8.1 Anotações, 8.2 Filtros e templates de vista, 8.3 Pranchas, 8.4 Planta humanizada). Próxima: **E9.1 — DWG**.

### E9.1 — DWG (20/09/2026) · abre a Etapa 9

**O que entrou** (**sem tocar no kernel**; sem migration):

- **Edge Function `dwg-converter`** (`supabase/functions/dwg-converter/`, **publicada** com `npx supabase functions deploy dwg-converter`): POST com os bytes do `.dwg` (`application/octet-stream`, JWT de usuário obrigatório, sem organização — nada é lido nem gravado) → **DXF em texto** (`application/dxf`) com `X-Dwg-Version` (cabeçalho do arquivo, "AC1032"), `X-Dwg-Release` ("AutoCAD 2018+"), `X-Dwg-Bytes` e `X-Libredwg-Code`. 400 quando o cabeçalho não é `AC10xx` ou o corpo é vazio; 413 acima de 30 MB; 422 quando o libredwg devolve código ≥ 128 (DWG_ERR_CRITICAL: truncado, cifrado, fora do alcance) — códigos menores são avisos e o DXF sai inteiro (o TERRENO.dwg real da empresa dá 4 e converte). O conversor é o **libredwg 0.13.3 em WebAssembly** (`@mlightcad/libredwg-web@0.7.14`, GPL): a cola emscripten vem **vendorada** com duas alterações marcadas "OPURA" (detecção de Node fixada em `false`; `await import("module")` removido — o Deno resolveria o especificador no empacotamento), e o binário vai como **arquivo estático gzip** (`static_files` no `config.toml`; 9,5 MB → 2,2 MB, porque o upload da function recusa o binário cru com 413) descomprimido por `DecompressionStream` uma vez por instância. **A seção de memória do wasm foi reescrita** (`initial` 1 GB → 64 MB, máximo mantido em 4 GB com crescimento): o pacote é compilado com `-sINITIAL_MEMORY=1GB` e o worker da Edge Function recusava com `WORKER_RESOURCE_LIMIT`. Script da reescrita e da vendoração documentados no cabeçalho dos arquivos.
- **`services/blueprintDwgService.ts`**: `conferirDwg` (vazio, > 30 MB, cabeçalho ≠ `AC10xx` — recusa ANTES de ir ao servidor), `releaseDoCabecalho`, **`converterDwgParaDxf(file)`** (`supabase.functions.invoke` com `ArrayBuffer`; lê versão/release/código dos headers; o JSON de erro da function vira a frase da tela).
- **`PainelImportarDxf`** aceita `.dwg` (`accept=".dxf,.dwg"`): o DWG vai ao conversor, volta como DXF e entra no **MESMO pipeline** (`prepararDxf` → camada → unidade medida → faces/eixos → paredes); ao lado do nome, **"DWG AC1015 · AutoCAD 2000/2002 · 92 KB, convertido para DXF no servidor"** (`versao-do-dwg`) e o aviso do libredwg quando o código é > 0; texto de abertura diz que DWG é convertido no servidor e que **o caminho inverso não existe** (`aviso-dwg`). Ribbon Inserir › Importar › "Do DXF/DWG".

**Decisões.** (1) **Servidor, como o roadmap fixou** (confirmado com o usuário em 20/09): o wasm de 9,5 MB não entra no bundle de quem nunca abre DWG, e a function é o único lugar onde uma versão nova do libredwg é trocada. Custo aceito: o DWG sai do navegador para a function (não é gravado em lugar nenhum). (2) **Não há exportação DWG**: o wasm publicado é compilado com `--disable-write`; o formato de troca para o CAD continua sendo o DXF (E4), e a tela diz isso em vez de oferecer um botão que não existe. (3) A versão do DWG vem do **cabeçalho do arquivo** (6 bytes), no cliente e no servidor — é o que aparece antes da conversão e não depende do libredwg. (4) O DXF gerado pelo libredwg passa pelo pipeline **sem caminho especial**: as recusas (ARC, CIRCLE, ELLIPSE) aparecem como em qualquer DXF, e a unidade continua sendo MEDIDA, não lida do cabeçalho. (5) Códigos de aviso do libredwg (< 128) não derrubam a importação: o DXF está inteiro e o painel diz que houve aviso.

**Prova de fora (curl, JWT por password grant com as credenciais do `.env.local`, nunca impressas) e no app real.** Sem token → 401; `TERRENO.dwg` (25 920 bytes, AC1032) → 200, DXF de 123 123 bytes em 0,66 s, `X-Dwg-Release: AutoCAD 2018+`, código 0; `Miguel Lousada.dwg` (94 346 bytes, AC1015) → 200, DXF de 314 366 bytes em 0,70 s; o próprio DXF enviado como DWG → 400 "Isto não é um DWG"; corpo vazio → 400; DWG truncado (3 000 bytes) → 422 "código 256". Antes da reescrita da memória a function respondia 546 `WORKER_RESOURCE_LIMIT` — registrado para a próxima atualização do wasm. **No app** (estudo "Planta 14/09/2026", escritas bloqueadas: 15): Inserir › "Do DXF/DWG" (título diz que o DWG é convertido no servidor), `accept=".dxf,.dwg"`, aviso do caminho inverso; `lousada.dwg` → uma chamada à function em produção (200, AC1015, AutoCAD 2000/2002, código 0), painel com "DWG AC1015 · AutoCAD 2000/2002 · 92 KB", camadas `0 — 305 traços` / OBRYSY / puertas, unidade sugerida por medição, 79 paredes, 186 ARC + 22 CIRCLE + 2 ELLIPSE listados como não convertidos, "Importar 79" habilitado; arquivo `.dwg` com conteúdo de PDF → recusado localmente ("não é um DWG"), **zero chamadas** à function. Testes: `__tests__/blueprintDwgService.test.ts` (4: conferência local; octet-stream + headers; Blob/sem headers/vazio; JSON de erro → frase) e `PainelImportarDxf.test.tsx` "importar DWG (E9.1)" (2: DWG entra pelo pipeline com a versão declarada e vira a mesma parede; recusa do conversor na tela); suíte 391 arquivos / 4800 testes; tsc, check-ui e build OK.

Próxima: E9.2 — API pública.

### E9.2 — API pública (20/09/2026)

**O que entrou** (**sem tocar no kernel**; migration **000055**; duas coisas publicadas fora do push: a migration e a Edge Function):

- **Tokens por organização** — `blueprint_api_tokens` (`aplicar_20270920000055_blueprint_api_tokens.sql`, aplicada): nome, **prefixo** (12 caracteres, para reconhecer na lista), **só o SHA-256** do token, validade opcional, `last_used_at`/`usos`, revogação. RLS de LEITURA por `is_org_member`; criar e revogar passam pelas RPCs **`blueprint_api_token_create`** (`security definer`, exige `auth.uid()` e `is_org_member` da org pedida; gera `opk_` + 48 hex e devolve o texto UMA vez) e **`blueprint_api_token_revoke`** — EXECUTE só para `authenticated`. **RPCs da API** (`api_blueprint_resolver` valida hash/ativo/validade e registra o uso; `api_blueprint_studies`, `api_blueprint_versions`, `api_blueprint_version` devolvem só o que é da organização do token; estudo de outra org = NULL) — EXECUTE **só para `service_role`**; REVOKE de public/anon/authenticated em tudo (regra da casa).
- **Edge Function `planta-api`** (publicada com `--no-verify-jwt`: a autenticação é o token `opk_…` no `Authorization: Bearer` ou `X-Api-Key`, não um JWT): `GET /v1/estudos`, `/v1/estudos/{id}/versoes`, `/v1/estudos/{id}/versoes/{rev|ultima}` (payload canônico + hash + kernel publicado) e os **derivados pelo kernel** — `/quantitativos` (JSON de `computeQuantities`), `/planilha.csv` (as mesmas abas do .xlsx: `## Aba`, `;`, vírgula decimal, BOM), `/ifc` (o mesmo `gerarIfc` da tela), `/unidades` (unidades com área somada + ambientes com pavimento, tipo, unidade, áreas e perímetro). O kernel roda em Deno pelo **`kernel.bundle.mjs`** (229 KB, esbuild, sem dependências), gerado por **`scripts/build-planta-api-kernel.mjs`** e COMMITADO; o teste `plantaApi.test.ts` acusa bundle desatualizado (KERNEL_VERSION) e prova paridade (hash, quantitativos, IFC e planilha idênticos aos do app). 401 sem/inválido/revogado/vencido (sem dizer qual), 404 para estudo/revisão inexistente PARA O TOKEN, 405 fora de GET, 400 revisão inválida.
- **Documentação publicada**: `GET /planta-api/openapi.json` (OpenAPI 3.1, 7 rotas, `securitySchemes.tokenDaOrganizacao`, schemas) e `GET /planta-api/docs` em **Markdown** — a plataforma rebaixa `text/html` a `text/plain` (medido: `Content-Type: text/plain` + `nosniff`), então a página humana é a **tela Planta › Colaborar › API**, que renderiza a tabela de rotas do MESMO objeto `openapi()`.
- **Tela "API pública"** (`TelaChavesDeApi`, in-flow, ribbon Colaborar › Integração › API com a contagem de tokens ativos): como usar (curl), links para docs/openapi, rotas (7), lista (`StandardTable`: nome, prefixo, organização quando o topo está em "Todas", criado, validade, último uso, chamadas, status), **Novo token** (nome + validade opcional; REGRA #5 via `useOrgWriteTarget('single')` — um token é de UMA organização), **token mostrado uma vez** com copiar e "Já guardei", revogar com confirmação. `services/blueprintApiTokenService.ts` (list/create/revoke).
- Colateral: o **modal de organização** (REGRA #5) estava montado DENTRO do container do editor, que fica `hidden` enquanto qualquer tela está aberta — o modal existia e não aparecia (a tela API mostrou; valia para Materiais também). Movido para fora do container.

**Decisões.** (1) Token da ORGANIZAÇÃO, não do usuário: integração (BI/ERP/planilha) sobrevive à troca de pessoas e é revogada num lugar só; o texto do token não existe no banco (hash) nem em log. (2) **RPCs `service_role`-only + function**: nenhuma rota do PostgREST aceita o token diretamente — o único caminho é a function, que só sabe fazer GET; e a function não usa `service_role` para consultar tabelas, só para chamar RPCs que escopam pela organização do token (o alerta da auditoria de 01/09 sobre `service_role` + `organization_id` do cliente não se aplica: a org vem do token, no banco). (3) **Só publicado**: o rascunho nunca sai pela API; cada versão traz o hash e o kernel que a publicou, e os derivados são recalculados pelo kernel ATUAL (`kernel_calculo`) — dito na resposta e na doc. (4) Kernel **empacotado e commitado** em vez de importado: a function só enxerga a própria pasta; o teste de frescor é o que impede o bundle de envelhecer em silêncio. (5) Sem paginação e sem cache: dezenas de versões por estudo e dezenas de ms por recálculo; entra quando doer. (6) `verify_jwt = false` só nesta function — documentado no `config.toml`.

**Prova.** *SQL em transação com ROLLBACK* (simulando `auth.uid()` do usuário e `RESET ROLE`): token no formato, resolver acha a org, token de lixo devolve 0 linhas, 59 estudos da Alpa, versões e payload (31 paredes, hash `2d71dfd8…`) do "Planta 23/08/2026", estudo da SPE Garden → NULL; tabela continuou com 0 linhas. *De fora, sem token*: `/docs` 200 (Markdown), `/openapi.json` 200 (7 rotas, `servers` com a URL pública https), `/v1/estudos` sem token → 401, token de lixo → 401, POST → 405. *De fora, com token real* (criado pela MESMA RPC da tela com o JWT do usuário, **com autorização explícita do usuário em 20/09**; nome "Integracao - prova E9.2", prefixo `opk_e35c0363`, **deixado ativo** para uso; o texto do token não foi impresso e o arquivo temporário foi apagado): `/v1/estudos` 200 (59 estudos, 4 com versão, 0,32 s); versões e `ultima` do 23/08 (payload com 31 paredes, kernel publicado 0.7.0); `/quantitativos` 200 (kernel_calculo 0.45.0, 6 ambientes, 136,70 m², 31 paredes); `/planilha.csv` 200 (`text/csv`, BOM `EF BB BF`, 5 abas: Totais, Ambientes, Paredes, Aberturas, Quadro de esquadrias); `/ifc` 200 (143 696 bytes, `ISO-10303-21`, 31 IfcWall); `/unidades` 200 (6 ambientes com áreas); estudo de outra org → 404; revisão 99 → 404; `X-Api-Key` → 200; `usos` = 10 e `last_used_at` preenchido. *No app* (estudo "Planta 14/09/2026", escritas bloqueadas: 15): Colaborar › API abre a tela em fluxo (cabeçalho, como usar, link para docs, 7 rotas, lista vazia), nome vazio recusado, nome novo → modal REGRA #5 (topo em "Todas") → RPC `blueprint_api_token_create` bloqueada e o erro no formulário; nenhum token criado pelo harness (0 linhas antes da prova com curl). Testes: `__tests__/plantaApi.test.ts` (3: bundle fresco e idêntico ao kernel; CSV; OpenAPI + Markdown), `TelaChavesDeApi.test.tsx` (4) e editor "API pública (E9.2)"; suíte 393 arquivos / 4808 testes; tsc, check-ui e build OK.

Próxima: E9.3 — Webhooks.

### E9.3 — Webhooks (20/09/2026) · fecha a Etapa 9

**O que entrou** (**sem tocar no kernel**; migration **000056** aplicada; Edge Function **`planta-webhooks`** publicada; job do **pg_cron** agendado):

- **`blueprint_webhooks`** (assinaturas da organização: nome, URL https, **segredo** gerado no banco para o HMAC, eventos assinados — `versao.publicada`, `versao.aprovada`, `comentario.criado`, `alternativa.principal` —, ativo/pausado, último status) com RLS `is_org_member` para tudo; **`blueprint_webhook_entregas`** (a FILA e o LOG: payload congelado, status `PENDENTE|ENTREGUE|FALHOU`, tentativas, HTTP, erro, próxima tentativa) — membros leem; escrevem o banco e o despachante.
- **"Database webhook" do Supabase = pg_net num gatilho**: `fn_blueprint_webhook_enfileirar(org, evento, payload)` grava uma entrega por webhook ativo assinante e **cutuca** a function por `net.http_post` com o `CRON_SECRET` da casa (`fn_cron_secret()`, REGRA #7). Gatilhos: `blueprint_snapshots` AFTER INSERT (publicada) e AFTER UPDATE OF `approval_status` → `APROVADO` (aprovada); `blueprint_comments` AFTER INSERT; `blueprint_branches` AFTER UPDATE OF `principal` (false → true). Os três gatilhos engolem qualquer erro com `RAISE WARNING`: **webhook nunca derruba a publicação**. RPCs de membro `blueprint_webhook_testar` (enfileira `teste.ping`) e `blueprint_webhook_reenviar`. **Retentativa**: job `planta-webhooks-retentativas` (a cada minuto, só cutuca **quando há entrega vencida**).
- **Edge Function `planta-webhooks`** (gate `chamadaDeCron`; `verify_jwt = false` documentado): reserva o lote (`UPDATE … RETURNING`, chamadas simultâneas não pegam as mesmas), POST com `Content-Type: application/json`, `X-Opura-Event`, `X-Opura-Delivery`, `X-Opura-Attempt` e **`X-Opura-Signature: sha256=HMAC-SHA256(segredo, corpo)`**, 10 s de timeout, `redirect: 'manual'` (3xx = falha); 2xx → ENTREGUE; senão tentativa + 1 e a próxima pela política **1 min, 5 min, 30 min, 2 h, 12 h; 6ª falha → FALHOU**; webhook apagado/pausado → FALHOU na hora. Atualiza `ultimo_status`/`ultima_entrega_at`.
- **`supabase/functions/planta-webhooks/politica.ts`** (puro, sem import; vale em Deno, vitest e Vite): eventos e rótulos, `validarUrlDeWebhook` (só https pública: sem credenciais, sem localhost/.local/faixas privadas — o disparo sai do servidor), `validarWebhook`, `esperaAposFalha`, `assinar`/`assinaturaConfere` (WebCrypto, tempo constante), `exemploDeReceptor` (Node com `timingSafeEqual`).
- **Tela Colaborar › Integração › Webhooks** (`TelaWebhooks`, in-flow; contagem de ativos no ribbon): como funciona + exemplo de receptor; lista (URL, segredo abreviado com copiar, eventos, última entrega com HTTP, ativo/pausado clicável); novo/editar com validação e checkboxes de eventos descritos; **Testar** (RPC) e apagar com confirmação ("para só pausar, use o status"); **log das entregas** (quando, webhook, evento com o payload no título, estado, tentativas, HTTP, erro/próxima tentativa) com filtro por webhook, Atualizar e **Reenviar** (só fora de PENDENTE). `services/blueprintWebhookService.ts`.

**Decisões.** (1) **Fila no banco + um despachante**: o gatilho só grava e cutuca; quem fala com a internet é a function. Publicar uma versão nunca espera o ERP de ninguém, e um destino fora do ar não segura nada. (2) **Payload congelado na entrega**: o receptor recebe o que era verdade no evento, e reenviar manda o mesmo corpo — sem recomputar. (3) **HMAC, não token na URL**: o receptor prova que o POST veio da ÒPURA e que o corpo não mudou; o segredo é da assinatura e fica visível para os membros (é o que se cola no receptor). (4) **Só URL https pública**: o disparo sai da nuvem; `localhost` e IP privado nunca chegariam, e a recusa na tela evita a fila de falhas silenciosas. (5) Política de retentativa fixa e declarada (≈ 14 h no total); depois disso a pessoa reenvia — não há fila infinita. (6) Cron condicional: sem entrega vencida, sem chamada. (7) Sem entrega de rascunho nem de eventos de outras telas: só os quatro do roadmap + `teste.ping`.

**Prova.** *SQL em transação com ROLLBACK* (membro cria "ERP" [publicada, aprovada, principal] e "Chat" [comentário]; Testar pela RPC; INSERT em `blueprint_snapshots`, UPDATE de aprovação, INSERT em `blueprint_comments`, UPDATE de `principal`): **5 entregas, cada uma no webhook certo** (Chat só recebeu `comentario.criado`; ERP recebeu `teste.ping`, `versao.publicada`, `versao.aprovada`, `alternativa.principal`) com as chaves esperadas no payload; **5 cutucadas na fila do pg_net** com `Authorization: Bearer …`; tabelas e fila voltaram a 0. *De fora*: function sem segredo → 401; GET → 405. *De ponta a ponta* (com autorização explícita do usuário em 20/09; 2 webhooks de prova criados pela MESMA rota da tela e **apagados ao fim** — log foi junto, tabelas em 0): Testar nos dois → **em 5 s** o despachante rodou (respostas do pg_net: `{"entregues":1}` e `{"pendentes":1}`): `httpbin.org/status/204` → **ENTREGUE**, tentativa 1, HTTP 204; `httpbin.org/status/500` → **PENDENTE**, tentativa 1, HTTP 500, erro "HTTP 500", **próxima tentativa em 62 s**; `ultimo_status`/`ultima_entrega_at` preenchidos nos dois. *No app* (estudo "Planta 14/09/2026", escritas bloqueadas: 15): Colaborar › Webhooks abre a tela em fluxo (como funciona, lista vazia, log vazio); nome vazio + `http://localhost` → "nome é obrigatório · a URL tem de ser https"; nome e URL válidos → modal REGRA #5 → INSERT bloqueado e o erro no formulário; nenhum webhook criado pelo harness. Testes: `__tests__/blueprintWebhooks.test.ts` (5: eventos; URL; validação; retentativa; HMAC igual ao `node:crypto` do receptor), `TelaWebhooks.test.tsx` (4) e editor "webhooks (E9.3)"; `segurancaMigrations` exigiu REVOKE também nas funções de gatilho (feito no arquivo e no banco); suíte 395 arquivos / 4818 testes; tsc, check-ui e build OK.

**Etapa 9 fechada** (9.1 DWG, 9.2 API pública, 9.3 Webhooks). Próxima: **E10.1 — Multiusuário**.

### E10.1 — Multiusuário (20/09/2026) · abre a Etapa 10

**O que entrou** (**sem bump** — presença, trava e difusão são Realtime, efêmeros; o payload não muda. Migration **000057** aplicada para o que persiste: permissões por estudo e menções):

- **`utils/blueprintColaboracao.ts`** (puro): `agregarPresenca` (um participante por `userId`, N abas = N conexões, sem a própria pessoa, cor estável por chave, iniciais), **trava por elemento = seleção da outra pessoa** (`travasDe`, `idsTocadosPeloComando` — todo campo `…Id`/`…Ids` menos `levelId`; criar não toca em nada — e `travaDoComando` para um lote), **`MensagemDeComando {id, autor, comandos, hashDepois}`** e **`aplicarRemoto(history, msg)`**: aplica comando a comando com id de idempotência (`ModelHistory.apply(cmd, id)` — a mesma mensagem duas vezes não aplica duas vezes), acusa recusa do kernel e **divergência de hash**; `papelNoEstudo` (sem linha = EDITOR); `mencoesDoTexto`/`sugerirMencoes` (`@email` ou `@primeiro-nome` único, sem acento).
- **`hooks/useBlueprintColaboracao.ts`**: canal Realtime **por ramo** (`blueprint:ramo:<branchId>`): presença (`track` com pavimento e seleção, só quando muda) e `broadcast` de comandos; avisos de conflito (comando recusado / divergência) com o autor.
- **`useBlueprintEditor(branchId, ganchos)`**: `antesDeAplicar(comandos)` (recusa antes do kernel: trava alheia ou somente leitura — vira `lastError`) e `depoisDeAplicar(comandos, hash)` (difunde); **`aplicarExterno(msg)`** aplica o remoto sem redifundir. No editor: **desfazer/refazer desligam com outra pessoa no ramo** (desfazer localmente o comando dela divergiria; o botão diz por quê), a presença publica `levelId` + `selectedIds`, o canvas mostra **crachá na cor da pessoa** no elemento que ela edita (parede, abertura, componente, ambiente) e um **banner de conflito** com "Recarregar do servidor".
- **Permissões por estudo**: `blueprint_study_permissions` (estudo × e-mail × `LEITOR|EDITOR`, RLS de membro) + **policies RESTRICTIVE** `blueprint_branches_leitor_nao_grava` (UPDATE) e `blueprint_snapshots_leitor_nao_publica` (INSERT) via `fn_blueprint_e_leitor(study_id)` sobre `auth.jwt()->>'email'` — a RLS de membro continua igual; o leitor só perde a gravação. Na tela: faixa "Você é leitor" e todo comando recusado com a razão. **Tela Colaborar › Equipe › Acesso** (`TelaAcessoDoEstudo`: quem está no ramo agora e o que edita; papel por membro da organização com Editor/Leitor; contagem de presentes no botão; chips de presença no ribbon).
- **Menções em comentários**: coluna `blueprint_comments.mencoes` + gatilho `fn_blueprint_comment_mencoes` que grava UMA `notifications` por mencionado (tipo `planta_mencao`, com `organization_id`, link para o estudo/comentário, sem notificar o próprio autor; erro engolido com WARNING). No painel: `@` sugere membros da organização do estudo, clicar completa, "Vai notificar: …" antes de enviar; `criarComentario` leva `mencoes`.

**Decisões.** (1) **Sem CRDT, como o roadmap**: comando determinístico + invariante + hash. A trava por seleção evita o conflito antes; o hash pega o que escapar e a saída honesta é recarregar. (2) **Trava = seleção**: sem tabela de locks, sem expiração para gerenciar — a presença some, a trava some. (3) **Canal por ramo**: alternativas são modelos independentes; misturar canais misturaria comandos que não se aplicam. (4) **Desfazer desliga com gente no ramo** em vez de fingir que funciona: desfazer é local e não tem inverso difundível. (5) **Leitor é restrição, não concessão**: acesso continua sendo da organização; a tabela só REDUZ, e a RLS RESTRICTIVE garante que a tela não é a única barreira. (6) Menção notifica pelo banco (gatilho), não pelo cliente: quem comenta pelo BCF ou pela API futura notifica igual.

**Prova.** *No app real* (estudo "Planta 14/09/2026", ramo principal; **segundo cliente = script `scripts/prova-e101-segundo-cliente.ts`** com o mesmo login e chave de presença própria "Zeca da Prova", que só LÊ o rascunho e fala pelo canal; escritas do navegador bloqueadas: 17): antes, ribbon sem presença e "Acesso" sem número; o segundo cliente entra com o Ambiente 1 selecionado → **chip "ZP" no ribbon, "Acesso 1", desfazer desligado** ("desligado enquanto há outra pessoa neste ramo"), **crachá "ZD" no ambiente** no canvas (captura); renomear o Ambiente 1 → `"spc_lvl_0001_0001" está em edição por Zeca da Prova — espere a seleção dela ser solta`; o segundo cliente difunde `NameSpace` do Ambiente 2 com o hash calculado pelo kernel sobre o rascunho → **"Copa do Zeca" aparece no navegador sem aviso** (hash bateu); difunde um comando com `spaceId` inexistente → **banner "Um comando de Zeca da Prova foi recusado aqui (Ambiente inexistente…)" com Recarregar**; tela Acesso lista "Zeca da Prova · editando 1 elemento(s)" e 7 membros com Editor/Leitor; marcar Leitor → gravação bloqueada e o erro na tela; Comentários: `@des` sugere "@Dev", clicar completa e mostra "Vai notificar: desenvolvedor@…". Testes: `__tests__/blueprintColaboracao.test.ts` (4: presença/cores; ids tocados e trava; dois `ModelHistory` convergem, replay idempotente, recusa e divergência; papel e menções), editor "multiusuário (E10.1)" (trava recusa com autor, difusão com hash, comando remoto entra sem redifundir, presença no ribbon e na tela, desfazer desligado) e `PainelComentarios` "menções (E10.1)"; `segurancaMigrations` OK; suíte 396 arquivos / 4824 testes; tsc, check-ui e build OK.

Próxima: E10.2 — Fases de reforma (bump).

### E10.2 — Fases de reforma (20/09/2026)

**O que entrou** (**bump `blueprint-kernel-ts-0.45.0 → 0.46.0`** e **`quant-1.12.0 → quant-1.13.0`**: a fase entra no payload canônico e muda os totais; ritual dos goldens cumprido — com a string antiga e os campos no lugar, 263 testes do kernel passaram e só a política dos quantitativos acusou a versão; depois o bump e a recaptura dos 6 hashes, registrados no cabeçalho de `blueprintKernelGoldens.test.ts`. Sem migration: a fase vive no snapshot):

- **Kernel** (`model.ts`): `FASES_DE_REFORMA = ['EXISTENTE','DEMOLIR','NOVO']`, `FaseDeReforma`, `ROTULO_DA_FASE`, `faseDe(peça)` (ausência = `NOVO`); campo opcional `fase` em **parede, abertura, estrutura e componente**; invariante `BAD_PHASE`. `canonical.ts` só emite `fase` quando EXISTENTE/DEMOLIR (disciplina das chaves opcionais: o acervo antigo mantém o hash). Comando **`SetFase { ids, fase }`** (`null`/`NOVO` apaga a chave; id desconhecido = `NOT_FOUND`; valor inválido = `BAD_PHASE`); cópia de grupo propaga a fase.
- **Quantitativos** (`quantities.ts`): `fase` em cada linha de parede/abertura/estrutura; listas completas em `paredesTodas/aberturasTodas/estruturasTodas`; **`paredes/aberturas/estruturas` e todos os agregados contam só o NOVO**; `totais.demolicao` e `totais.existente` (`ResumoDeFase`: paredes, área, volume de alvenaria, aberturas, concreto) à parte.
- **Orçamento** (`blueprintBudget.ts`): escopo `DEMOLICAO` com as medidas `DEMOLICAO_AREA_PAREDE`, `DEMOLICAO_VOLUME_ALVENARIA`, `DEMOLICAO_ABERTURAS`, `DEMOLICAO_VOLUME_CONCRETO` (só o que tem `fase === 'DEMOLIR'`).
- **`utils/blueprintFases.ts`** (puro): `FiltroDeFase 'TUDO'|'ANTES'|'DEPOIS'|'DEMOLICAO'`, `FASES_VISIVEIS`, `COR_DA_FASE` (existente cinza; a demolir vermelho tracejado), `pecasComFase`, `idsOcultosPelaFase`, `fasePorId`, `contagemPorFase`, `faseDaSelecao`, `resumirFases`.
- **Vista**: `ConfiguracaoDeVista.fase` (padrão `TUDO`, saneado, diff "Fase: …"), select **"Fase da reforma"** no `MenuVista` (o botão Vista mostra Antes/Depois/Demolição), `blueprint:filtroDeFase` persistido; o filtro entra em `ocultosNoCanvas` junto com camadas e pavimentos.
- **Canvas**: parede existente em cinza; **a demolir em vermelho tracejado cheio** (a passada branca do miolo é pulada, senão o tracejado some no zoom); aberturas herdam a fase da parede; estrutura e componentes na cor da fase.
- **Ribbon Arquitetura › Reforma**: **Existente / A demolir / Novo** agem sobre a seleção (desabilitados sem seleção; `aria-pressed` quando toda a seleção já está na fase; contagem por fase no rótulo) e **Antes / depois** abre a tela.
- **`TelaAntesDepois.tsx`** (in-flow): duas `MiniPlanta`s na mesma caixa (esquerda = existente + a demolir tracejado; direita = existente + novo), seletor de pavimento, contagem por fase, três cartões (demolir / existente / novo) com o resumo e "Selecionar as N peças no desenho"; aviso quando nada está marcado. `MiniPlanta` ganhou `ocultos` e `fases` (`data-fase` nas linhas).
- **Quantitativos › Demolição**: Alvenaria a demolir (m³), Esquadrias a remover, Concreto a demolir, Existente que fica (m).

**Decisões.** (1) **NOVO = ausência da chave**: o acervo inteiro é "obra nova" sem migração e sem mudar hash. (2) **Totais e orçamento contam só o novo**; demolição é escopo próprio (serviço de demolição custa por m²/m³, não por m² de alvenaria nova); o existente não entra em nenhum dos dois — está escrito na tela. (3) Fase é **atributo da peça, não camada**: a mesma parede pode estar na camada "Alvenaria" e ser a demolir; o filtro de vista compõe com camadas e pavimentos. (4) Abertura sem fase própria segue a fase da parede (no canvas); no quantitativo, a fase da abertura é a dela. (5) Antes/depois reaproveita `MiniPlanta`/`caixaDosModelos` da E6.1 em vez de um segundo canvas.

**Prova.** *No app real* (estudo "Planta 14/09/2026", escritas bloqueadas): "A demolir" desabilitado sem seleção; Parede 1 → A demolir (rótulo "A demolir 1", canvas com a parede vermelha tracejada); Parede 3 → Existente ("Existente 1"); Vista › "Fase da reforma" oferece Tudo/Antes/Depois/Só demolição, "Depois" some com a parede demolida e persiste em `blueprint:filtroDeFase`, "Só demolição" mostra só a parede vermelha; **Antes / depois**: 2 miniaturas, "1 existente(s) · 1 a demolir · 159 nova(s)", resumo demolir "1 parede(s) · 14,03 m² · 2,10 m³ de alvenaria", SVG do antes com 1 linha tracejada e 2 existentes; **Quantitativos › Demolição**: "Alvenaria a demolir 2,10 m³ … Existente que fica 7,45 m". **escritas bloqueadas: 16**. Testes: `blueprintFases.test.ts` (4), editor "fases de reforma (E10.2)", goldens recapturadas, pins `quant-1.13.0`. `planta-api` **redeployada (v4)** com o `kernel.bundle.mjs` regenerado (o teste de frescor da E9.2 acusou o bundle velho — é para isso que ele existe).

Próxima: E10.3 — Planta → compras.

### E10.3 — Planta → compras (20/09/2026) · fecha a Etapa 10

**O que entrou** (**sem bump** e **sem migration**: nada novo no payload; o destino é `procurement_plan_items`, a tabela que o Plano de Aquisições já tem — a Planta só passa a ser mais uma origem dela):

- **`utils/blueprintCompras.ts`** (puro): `explodirEmInsumos(linhas bp:)` — composição × quantidade, **só material e equipamento** (mão de obra e subcomposição ficam de fora), agrupado por insumo (código, ou descrição normalizada sem código), com a **memória por linha** (`origens`: id `bp:…`, descrição, quantidade); linha sem composição de tipo INSUMO = **compra direta** (porta pronta, material da biblioteca); composição sem componentes = `semComposicao` (dito, não inventado); `precificarInsumos` preenche pelo catálogo o preço que o componente do SINAPI importado não traz; `dataDeNecessidade` = **menor início entre as tarefas das linhas** no cronograma da obra (a ponte 4D: a tarefa tem o id da linha), senão a data padrão da tela — e `doCronograma` diz qual foi; `prazoDoInsumo` (específico > genérico > 0, como o motor), `somarDias` sem fuso; `datarInsumos` (necessário em, comprar até, estoque do Almoxarifado abatido, nunca negativo); **`linhasDoPlano`** → linhas de `procurement_plan_items` com **`source_budget_item_id = bp:<estudo>:compras:<insumo>`**, `source_budget_item_desc = Planta "<nome>" rev. N · K linha(s)`, `period_id = planta:<estudo>`, memória em `notes`; `resumirCompras`.
- **`services/blueprintComprasService.ts`**: `preverCompras(snapshot, obra, dataPadrao)` — o MESMO `preverLancamentos` do orçamento (versão publicada, de-para, camadas, acabamentos, guarda-corpos, esquadrias) + cronograma + prazos + posição líquida + `contarNoPlano`; `lancarNoPlano` **substitui só os pendentes desta planta** (prefixo) e insere em lotes, auditoria `COMPRAS_LANCADAS`; `abrirCotacao` = `procurementService.generateQuotationFromItems` (o caminho da tela do plano: cria a Solicitação de Cotação e marca os itens `quoted`), auditoria `COTACAO_ABERTA`; `nomeDaObra`.
- **`TelaCompras.tsx`** (in-flow, Analisar › **Compras**, ao lado de Orçamento): obra vinculada (ou aviso para vincular em Analisar › Orçamento), data padrão, **Prever compras** → 4 cartões (insumos, linhas da planta, datados pelo cronograma, total estimado), avisos (obra sem tarefa datada; linhas só de mão de obra; linhas sem composição, listadas), "já no plano: P pendentes (substituídos) e Q em cotação/pedido (ficam)", `StandardTable` (código + descrição, un., quantidade, em estoque, a comprar, custo, total, necessário em com `*` quando é a data padrão, comprar até com o prazo no title, nº de linhas com a memória no title); **Lançar no Plano de Aquisições** (confirmação diz o que substitui) e **Abrir cotação** (só depois de lançar, com os ids lançados).

**Decisões.** (1) **Mesma tabela, mesma semântica**: nada de "requisição da planta" paralela — o item nasce onde Suprimentos já trabalha (tela do plano, cotação, pedido, curva S), com a planta como origem legível. (2) **Insumo, não serviço**: o que se compra é o componente da composição; a linha `bp:` continua no orçamento como serviço. (3) **A data vem do cronograma quando existe** e é dito quando não vem (`*` na tela, "Data padrão" nas observações) — previsão não se vende como plano. (4) **Regerar substitui pendentes e preserva o que já andou** — a mesma política de `generatePlan`, provada por acidente na prova (ver abaixo). (5) Preço do componente pelo catálogo da organização (`resolverItens`: SINAPI + própria + biblioteca), o mesmo resolvedor do orçamento.

**Prova.** *No app real* (estudo "Planta 23/08/2026", obra "Igreja Divino Espirito Santo", versão 1; de-para AREA_PISO → 101751 "Piso em taco de madeira"). **Escritas bloqueadas (16)**: Analisar › Compras abre em fluxo; obra e data padrão (20/10/2026) no cabeçalho; Prever → "Insumos 2 · Linhas da planta 1 · Datados pelo cronograma 0 de 2 · Total estimado R$ 44.318,44", aviso "A obra não tem tarefa datada no cronograma"; linhas **44396 Cola branca base PVA 78,605 KG × R$ 48,71 = R$ 3.828,84** e **6214 Taco de madeira 143,539 M2 × R$ 282,08 = R$ 40.489,59** (136,7 m² × 0,575 e × 1,05 — os coeficientes da composição); cotação desabilitada antes de lançar; Lançar → confirmação → falha honesta (POST abortado). **Escrita real, autorizada pelo usuário ("lançar, provar e apagar")**, com o bloqueio aberto só para `procurement_plan_items`, `quotation_requests`, `blueprint_audit_events` e RPCs (0 escritas fora da lista): "2 item(ns) no Plano de Aquisições da obra", **Cotação COT-018-0004 aberta com 2 item(ns)**; banco: 2 linhas com `source_budget_item_id = bp:975214f4…:compras:6214|44396`, `status quoted`, `need_date 2026-10-20`, `notes` com a memória; `quotation_requests` com 2 itens; auditoria `COMPRAS_LANCADAS` (inseridas 2, total 44318,44) e `COTACAO_ABERTA`. **Suprimentos › Plano de Aquisições** (só leitura): grupo "Outubro de 2026", item "COLA BRANCA BASE PVA 44396 ← Planta "Planta 23/08/2026" rev. 1 · 1 linha(s) · 78,6049 KG · R$ 3.828,84 · 20/10/2026". A prova rodou duas vezes sem querer: a segunda **não substituiu** os itens já `quoted` (removidas 0) e criou COT-018-0005 — a regra "fica o que já andou" no ato. Limpeza: 4 itens e 2 cotações apagados (0 restantes); os 4 eventos de auditoria **ficam** — `blueprint_audit_events` é imutável por trigger, como deve ser. Testes: `blueprintCompras.test.ts` (9), editor "planta → compras (E10.3)" (2); suíte 398 arquivos / 4840 testes; tsc, check-ui e build OK.

**Etapa 10 fechada** (10.1 Multiusuário, 10.2 Fases de reforma, 10.3 Planta → compras). Próxima: **E11.1 — HVAC**.

### E11.1 — HVAC mínimo (20/09/2026) · fecha a Etapa 11 e o roadmap

**O que entrou** (**bump `blueprint-kernel-ts-0.46.0 → 0.47.0`** — o roadmap não previa bump na E11, mas a regra da casa manda: o enum de disciplinas, a família de componente e duas chaves novas mudam o que o payload pode dizer; ritual dos goldens cumprido — com a string antiga e tudo no lugar, 343 testes de kernel/canônico/goldens/IFC/componentes passaram; depois o bump e a recaptura dos 6 hashes, registrada no cabeçalho de `blueprintKernelGoldens.test.ts`. Sem migration):

- **Kernel** — disciplina **`MECANICA`** em `DisciplinaDeRede`/`DISCIPLINAS` (com cota 2600, bitola 200, cor `#0d9488`, nome "Duto" em `blueprintRede` — a disciplina existe; o menu de dutos não, como o roadmap manda); **`Nucleo.disciplina`** (só SHAFT; ausente = geral; `AddNucleo`/`SetNucleoProps`; virar elevador apaga; invariante `BAD_CORE`); família de componente **`CLIMATIZACAO`** com os tipos **CONDENSADORA** (0,85 × 0,33 × 0,70 m, folga 300), **EVAPORADORA** (0,90 × 0,22 × 0,30 m a 2,20 m, folga 150), **CASA_DE_MAQUINAS** (2,00 × 1,50 × 2,50 m, folga 600) e **EXAUSTOR** (0,40 × 0,40 × 0,40 m a 2,30 m, folga 100) — ficha com `cotaMm` e `folgaMm`; **`Componente.cotaMm`** (base acima do piso; nasce da ficha; só emitido quando > 0; trocar o tipo traz a cota da ficha; invariante `BAD_COMPONENT`). Símbolos 2D `CONDENSADORA`/`EVAPORADORA`/`EXAUSTOR`/`RESERVA` no canvas e na humanizada; **folga tracejada** em volta da reserva.
- **Clash da reserva** (`conflitosArquitetonicos.ts`, exportado `conflitosDeReserva`): `RESERVA_X_ESTRUTURA` (pilar sempre; viga/laje só se a faixa de altura cruza a da caixa), `RESERVA_X_PAREDE` (corpo da parede dentro da caixa ≥ 50 mm de lado — encostar não é atravessar), `RESERVA_X_COMPONENTE` (outra peça dentro da caixa + folga, na mesma faixa de altura). Só as peças de climatização acusam. Entram na mesma lista (`PainelConflitos`, com o nome da parede/peça) e no mesmo BCF (`outroFamilia`).
- **Aba Mecânica** no ribbon: `MenuComponentes` família **MECANICA** (grupos "Mecânica — climatização" e "Mecânica — ventilação e reservas", este com o **Shaft mecânico** = `{tool:'nucleo', nucleo:'SHAFT', disciplina:'MECANICA'}`; `disciplinaDoNucleo` no editor, `chaveAtiva` acende "Shaft mecânico"); grupo Conferência com **Conflitos das reservas** (contagem, abre a lista) e **Shafts mecânicos** (seleciona). Painéis: **Disciplina** no shaft (`PainelNucleoSelecionado`, Geral + as cinco) e **Cota da base** no componente. 3D: caixa na cota, verde-azulado. IFC: climatização como **equipamento** — `IfcUnitaryEquipment .SPLITSYSTEM.` (condensadora/evaporadora), `IfcFan .PROPELLORAXIAL.` (exaustor), `IfcBuildingElementProxy .PROVISIONFORSPACE.` (casa de máquinas: é reserva de espaço) — e a base na cota.

**Decisões.** (1) **Reserva, não equipamento**: a peça é o LUGAR com folga, para o clash pegar cedo; dimensionamento (cargas, dutos, terminais) fica para P3/P4, como o roadmap. (2) **Componente, não entidade nova**: a reserva reaproveita tudo do componente (catálogo, painel, canvas, 3D, IFC, fases, inventário) e ganha só `cotaMm` — que serve também à louça suspensa amanhã. (3) A **folga é da ficha**, não da peça: conserto de manual, não decisão por instância. (4) **Só a climatização acusa clash**: mobiliário encostado em mobiliário é a vida; a regra de altura evita o falso positivo da evaporadora sobre o sofá. (5) Shaft mecânico = shaft com disciplina, e não um terceiro tipo de núcleo: mesma geometria, mesmo furo de laje, mesmo conflito com estrutura.

**Prova.** *No app real* (estudo "Planta 14/09/2026", escritas bloqueadas): as abas são "Arquitetura | Terreno | Elétrica | Hidráulica | **Mecânica** | Inserir | Analisar | Colaborar | Vista"; o menu Mecânica oferece "Condensadora | Evaporadora hi-wall | Exaustor / ventilação | Casa de máquinas | Shaft mecânico"; Condensadora num clique → painel "Condensadora (split) · Climatização · 0,85 × 0,33 × 0,70 m · giro 0°"; um pilar no mesmo ponto → **"Conflitos das reservas 1"** e a lista diz "Condensadora (split) M-72FD encontra C-4076 — estrutura dentro da reserva do equipamento (≈ 257 mm de lado em comum)"; canvas com a caixa, o símbolo e a **folga tracejada** em volta (captura); Shaft mecânico por dois cantos → painel com **Disciplina = MECANICA** e "Shafts mecânicos 1"; Evaporadora → **cota 2200** no painel. 0 erros de página; **escritas bloqueadas: 17**. Testes: `blueprintHvac.test.ts` (4: kernel/canônico/invariantes, reservas e cota, clash com a cena de 3 conflitos e 3 não-conflitos, IFC), editor "HVAC mínimo (E11.1)", goldens recapturadas, `blueprintRede` (5 cores) e ribbon (9 abas) atualizados; suíte 399 arquivos / 4845 testes; tsc, check-ui (7 tsx) e build OK. `planta-api` **redeployada (v5)** com o bundle 0.47.0.

**Etapa 11 fechada — e com ela as 42 fases do roadmap.** O que ficou explicitamente fora é o P3/P4 do próprio roadmap (HVAC completo — dutos, terminais e cargas —, render, energia/carbono, analítico estrutural, fabricação, Dynamo/marketplace, worksets, texto 3D).

### P2.1 — Status do conflito: aceite com justificativa (20/09/2026) · backlog P2

**Pedido:** *"na Planta: backlog P2 do fecho (por exemplo: status do conflito aberto/resolvido, dutos como trechos MECANICA, catálogo de tipos por organização, mover núcleo/vaga por arraste)"* — quatro fases, P2.1 a P2.4, uma publicação cada.

**O que entrou** (sem bump — nada no payload; migration **000058** `blueprint_conflict_acceptances` aplicada por `db query -f`):

- **A lista continua derivada; o que se grava é a DECISÃO.** `PainelConflitos` nasceu sem "resolver" (conflito se resolve no desenho), e isso fica: o status é **ACEITO**, com justificativa (3–500 caracteres), autor e data, por **par de uids** (`<uid da peça>:<uid do outro>` — a mesma semente do tópico BCF), por estudo. O aceito sai da contagem do ribbon e fica numa seção própria e visível ("Aceitos (N) — fora da contagem, com justificativa"), com **Reabrir**. Quando o desenho muda e o par some, a lista some (a derivação manda) e a linha fica órfã (`aceitesOrfaos`); quando o par volta, a decisão vale de novo.
- **O aceite caduca se o encontro crescer**: guarda a medida (mm) no momento do aceite; se a atual passar de 25 % + 20 mm além dela (`cresceuAlemDoAceito`), o conflito volta a ABERTO com a nota "cresceu desde o aceite (X → Y mm) — volta a contar". Aceitar 13 mm de raspão não é aceitar 400 mm de viga dentro da caixa.
- **`utils/blueprintConflitoStatus.ts`** (puro): chaves, `classificarMep/classificarArq`, `contarStatus`, `aceitesOrfaos`, `validarJustificativa`. **`services/blueprintConflitoStatusService.ts`**: `list`, `aceitar` (upsert por estudo+chave, com o e-mail de quem aceita), `reabrir` (delete). **RLS**: membro da organização lê/grava; **LEITOR do estudo (E10.1) vê, mas não aceita nem reabre** — três policies RESTRICTIVE (INSERT/UPDATE/DELETE), e não FOR ALL, para não esconder os aceites dele; `segurancaMigrations` OK.
- **BCF**: `topicosDeConflitos`/`…Arquitetonicos` recebem os aceites e o tópico do par aceito sai **`Closed`** com "ACEITO por <e-mail>: <justificativa>" na descrição.
- Editor: aceites carregados por estudo (falhar = sem status); o botão **Conflitos** do ribbon conta só os **abertos**; `podeDecidir = !somenteLeitura`.

**Decisões.** (1) Vocabulário "aceito", não "resolvido": resolvido é o que o desenho deixou de ter, e isso a lista já faz sozinha. (2) Por par de uids e por estudo (não por ramo): a decisão é sobre as duas peças, e vale nas alternativas. (3) A tabela tem `medida_mm` para a caducidade — sem isso o aceite seria um "ignorar para sempre". (4) O leitor vê o aceite (é informação de projeto) e não decide (é decisão de projeto).

**Prova.** *No app real* (estudo "Planta 14/09/2026"): **escritas bloqueadas (15)** — ribbon "Conflitos 385", 385 abertos e nenhum aceito; "Aceitar…" sem texto → "Diga por que o conflito é aceito (mínimo 3 caracteres)"; com texto → falha honesta (POST abortado), 385 continuam. **Escrita real, autorizada ("aceitar, provar e reabrir")**, bloqueio aberto só para `blueprint_conflict_acceptances` (0 escritas fora): aceitar "Elétrica I-EE31 encontra L1 · 0,013 m por dentro" → **384 abertos, ribbon "Conflitos 384"**, seção "Aceitos (1)" com *“prova P2.1 — eletroduto será desviado na revisão” — altair.rosa@…, 20/09/2026, com 13 mm*; **Reabrir** → 385 de novo; banco com 0 linhas ao fim (POST upsert + DELETE, nada mais). Testes: `blueprintConflitoStatus.test.ts` (3: contagem/chave, caducidade e órfãos, BCF Closed), editor "status do conflito (P2.1)" (aceitar exige justificativa, tira da contagem, Aceitos, reabrir); suíte 400 arquivos / 4849 testes; tsc, check-ui e build OK.

Próxima: P2.2 — dutos como trechos MECANICA.

### P2.2 — Dutos como trechos MECANICA (20/09/2026) · backlog P2

**O que entrou** (**sem bump**: a disciplina `MECANICA` já existe no kernel desde a E11.1 — o duto é um `Trecho` e o difusor um `Terminal`, famílias que o payload já tem; nada novo no canônico):

- **Menu Mecânica › "Mecânica — dutos e terminais"** (3ª coluna): **Duto** = `{tool:'rede', disciplina:'MECANICA'}` (dois cliques, no forro a **2,60 m**, "bitola" = **Ø equivalente 200 mm** de partida — `COTA_PADRAO_MM`/`BITOLA_PADRAO_MM` da E11.1, cota do terminal subida para 2600) e **Difusor / grelha** = terminal MECANICA com o **nome em texto** (`tipoTexto: 'Difusor'` — novo campo opcional de `EscolhaComponente`; "Grelha de retorno" e "Tomada de ar exterior" se trocam no painel), gravado com **300 × 300 × 50 mm** (`MEDIDAS_PADRAO_TERMINAL_MECANICO`, num segundo comando como as caixas hidráulicas). O nome mecânico não vaza para a tomada seguinte (`TIPOS_DE_TERMINAL_MECANICO` limpa o texto ao sair da mecânica).
- **Canvas**: o duto sai na cor da disciplina (verde-azulado) com o rótulo **"Ø 200"** (cano é "DN"); o terminal mecânico leva o **X do difusor** dentro do símbolo.
- **Quantitativos/Orçamento**: o duto entra em `porBitola` como as tubulações ("Mecânica DN 200 · 4,44 m · 1 trecho(s)"); o terminal em `porTerminal` com o nome como classificação ("Difusor · Mecânica · terminal de ar", em vez de "a classificar"); medida nova **`COMPRIMENTO_DUTO`** (escopo INSTALACAO, m, uma linha por Ø) no de-para do orçamento.
- **Clash**: o duto no forro que atravessa a viga entra em Conflitos como qualquer trecho × estrutura — nenhuma regra nova, só a disciplina passando pela porta que já existia.

**Decisões.** (1) Duto = trecho, não entidade nova: mesma geometria (a, b, duas cotas, bitola), mesmo canônico, mesmo clash, mesma prumada; o que o HVAC completo (P3/P4) acrescentaria é seção retangular, carga térmica e dimensionamento — fora. (2) Terminal mecânico sem taxonomia fechada: três nomes usuais bastam para pré-projeto, e criar `tipoMecanico` no kernel exigiria bump por um vocabulário que ainda não tem uso (cargas). (3) O texto do rótulo "Ø" no duto (diâmetro equivalente) e "DN" nos canos — é como cada disciplina lê a prancha.

**Prova.** *No app real* (estudo "Planta 14/09/2026", escritas bloqueadas 16): o menu Mecânica lista "… | Duto | Difusor / grelha"; Duto por dois cliques → navegador "Duto", canvas com o trecho verde-azulado e "Ø 200" (captura); Difusor num clique → navegador "Difusor / grelha", círculo com X; **Quantitativos › Instalações: "Mecânica DN 200 · 4,44 m · 1 trecho(s), comprimento real"** e "Mecânica 1 un" para o terminal. 0 erros de página. Testes: `blueprintDutos.test.ts` (3: padrões/canônico/medidas, quantitativo + `COMPRIMENTO_DUTO`, clash duto × viga), editor E11.1 estendido (7 itens, Duto e Difusor armam a ferramenta); suíte 401 arquivos / 4852 testes; tsc, check-ui (4 tsx) e build OK.

Próxima: P2.3 — catálogo de tipos por organização.

### P2.3 — Catálogo de tipos da organização (20/09/2026) · backlog P2

**Correção de rumo, antes de tudo:** o fecho dizia "hoje tipos vivem no estudo" — errado. `blueprint_element_types` é **da organização desde a E1.1** (`organization_id`, RLS de membro). O que não existia era a **tela do catálogo**: os tipos só nasciam inline ("salvar tipo" no painel da peça) e não havia onde vê-los, renomear, desativar, medir o uso, semear padrões nem levar de uma organização para outra. É isso que a P2.3 entrega (fecho corrigido).

**O que entrou** (**sem bump, sem migration**):

- **`utils/blueprintCatalogoDeTipos.ts`** (puro): **`SEMENTES_DE_TIPOS`** (18 tipos padrão de pré-projeto: pilares 14×30, 19×40, 20×40, 25×50 e Ø30; vigas 14×40 e 19×50; laje 12; baldrame 20×40; estaca Ø30 · 6 m; TUG 100 VA a 30 e 110 cm, TUE 600 VA a 220 cm, luz de teto 100 VA; escada 1,20 · espelho 17,5 e rampa 1,20; telhados cerâmico 30 % e fibrocimento 10 % — medidas usuais, não norma), `faltamSementes` (por família + nome, sem maiúsculas), **`usosPorAssinatura(model)`** (estrutura, ponto, escada, telhado, componente — o vínculo tipo × instância que existe), `agruparPorFamilia`, `validarNomeDeTipo` (único por família), `paraCopiar`.
- **Serviço** (`blueprintElementTypeService`): `listAllElementTypes` (todas as famílias, inativos inclusive; `null` = o que a RLS deixar), `renameElementType`, `setElementTypeActive`, `upsertElementTypes` (sementes e cópia: upsert por org + família + nome).
- **`TelaCatalogoDeTipos.tsx`** (in-flow, **Arquitetura › Tipos**, ao lado de Materiais; contagem de ativos no ribbon): "Como funciona" (tipo é molde), `StandardTable` (família, nome, propriedades via `resumoDoTipo`, **no desenho**, organização quando o topo está em "Todas", status), ações renomear (inline, validação), desativar/reativar, excluir (confirmação que avisa quantas peças têm a assinatura e que **continuam como estão**), **Semear padrões (N)** e **Copiar para organização…** — as duas gravações passam pelo `useOrgWriteTarget('all-allowed')` (REGRA #5: o topo em "Todas" abre o modal de organização).

**Decisões.** (1) Sementes no código, não no banco: são referência declarada e mudam com o produto; a organização edita as suas. (2) "No desenho" é por **assinatura** (as mesmas propriedades), fiel à E1.1 — não há `tipoId` na peça e não vai haver. (3) Desativar ≠ excluir: desativado some do seletor e fica para reativar; excluir é definitivo e nunca toca peça. (4) Piso/forro entram no catálogo (listar, renomear, desativar) mas não no "no desenho": a assinatura deles vive por ambiente, no painel de acabamentos.

**Prova.** *No app real* (estudo "Planta 14/09/2026", topo em "Todas"): **escritas bloqueadas (15)** — Arquitetura › Tipos abre em fluxo, lista **0 tipos** (não havia nenhum em nenhuma organização), "Semear padrões (18)" abre o modal de organização → Alpa → upsert abortado, erro honesto. **Escrita real, autorizada ("semear na Alpa e manter")**, bloqueio aberto só para `blueprint_element_types` (0 escritas fora): semear → **18 tipos**, "18 tipo(s) padrão criados.", botão desabilitado; renomear "Rampa 1,20 m (NBR 9050)" → "Rampa acessível 1,20 m"; desativar (riscado) e reativar; excluir → confirmação "some do seletor de toda a organização" → 17; semear de novo → **"Semear padrões (1)"** recria a rampa → 18. Banco: Alpa com 18 ativos (10 estrutura, 4 terminal, 2 escada, 2 telhado). Testes: `blueprintCatalogoDeTipos.test.ts` (2: sementes aplicáveis ao kernel; faltam/usos/grupos/validação/cópia), editor "catálogo de tipos (P2.3)" (tela, semear na org do topo, usos = 2, renomear recusa duplicado, desativar, excluir com aviso de usos); suíte 402 arquivos / 4855 testes; tsc, check-ui e build OK.

Próxima: P2.4 — mover núcleo e vaga por arraste.

### P2.4 — Mover núcleo, vaga e componente por arraste (20/09/2026) · backlog P2

**O que entrou** (**sem bump**: `TranslateEntities` ganha três listas opcionais de ids — comando, não payload):

- **Kernel**: `TranslateEntities { …, nucleoIds?, vagaIds?, componenteIds? }` — andam **rígidos** como a estrutura (contorno do shaft, centro da vaga e do componente recebem o delta e nada mais; nenhum entra no arranjo planar); **mover confirma o sugerido** (`sugerida`/`sugerido` caem, como no terminal); seleção vazia continua `EMPTY_SELECTION`; id desconhecido recusa.
- **Canvas**: as três famílias entram no arraste da seleção (`movendoSelecao`) com **prévia = commit** (as listas `nucleos`/`vagas`/`componentes` que desenham e testam clique já saem deslocadas durante o gesto) e no `comitarDeslocamento` — que serve ao arraste **e às setas** (um passo do Mover; Shift = 10). `onMoverSelecao` leva `pecas {nucleoIds, vagaIds, componenteIds}`; o editor os põe no mesmo `TranslateEntities` — **um gesto, um Ctrl+Z**.
- **Por que nunca tinha funcionado na prática**: a **LAJE se pega pelo miolo** e vinha antes de componente/vaga/núcleo na ordem do clique — dentro de um ambiente com laje, o sofá nunca era clicável, logo nunca arrastável. Agora, havendo peça de piso sob o cursor, a laje cede (pilar e viga continuam na frente: são pequenos, quem clica neles quer eles).

**Decisões.** (1) Sem comando novo (`MoveNucleo` etc.): o gesto da seleção é um só, e a família nova entra no comando que já existe — é assim que estrutura, água, rede e quadro entraram. (2) Rígido, sem `manterJuncoes`: núcleo, vaga e componente não têm junção com nada. (3) O arraste do vértice do núcleo (`MoveNucleoVertex`, alça) continua sendo outra coisa: forma, não posição.

**Prova.** *No app real* (estudo "Planta 14/09/2026", escritas bloqueadas 19): condensadora e shaft mecânico no rascunho; Selecionar → clique na condensadora **dentro do ambiente com laje** seleciona a condensadora (antes selecionava L2, a laje); arraste de 150 px → some do ponto antigo e reaparece a ~130 px à direita (orto: só x; delta 2,6–3,0 m no passo do Mover); shaft: clique no miolo seleciona (Disciplina = MECANICA), arraste de 100 px para baixo → some de cima e aparece embaixo; **Ctrl+Z devolve o shaft ao ponto antigo**. 0 erros de página. Testes: `blueprintMoverPecas.test.ts` (2: os três rígidos no mesmo comando, sugerido confirmado, volta pelo delta oposto com o hash igual; vazio/desconhecido recusados), editor "mover núcleo, vaga e componente (P2.4)" (setas deslocam sofá + shaft juntos pelo autosave, Ctrl+Z devolve os dois); suíte 403 arquivos / 4858 testes; tsc, check-ui e build OK.

**Backlog P2 do pedido de 20/09 concluído** (P2.1 status do conflito, P2.2 dutos, P2.3 catálogo de tipos, P2.4 arraste). O restante do backlog P2 segue nomeado no fecho.

### P2.5 — Definições de parâmetro: editar/excluir, fórmula e filtro `compartilhado` (20/09/2026) · backlog P2

**Pedido:** *"PODE SEGUIR"* — o resto do backlog P2 nomeado no fecho, na mesma cadência. Esta fecha o que E1.2/E1.3 deixaram declarado: "filtro `compartilhado` nas saídas (hoje todo parâmetro sai), edição e exclusão de definições (só criação inline)" e "edição de fórmula existente".

**O que entrou** (**sem bump, sem migration**):

- **Filtro `compartilhado` nas saídas**: `chavesPrivadas(definicoes)` e `semChavesPrivadas` (`blueprintFormulas.ts`); `linhasDeParametros(model, calculados, privadas)` deixa a chave privada fora da **planilha**; `gerarIfc(…, { chavesPrivadas })` a tira do `Pset_OpuraPersonalizado` (gravada ou calculada) e não emite Pset para a peça que só tinha privadas; `blueprintExportService` passa as privadas nos dois caminhos. Chave **sem definição** continua saindo (o desenho publicado é o que vale, não o catálogo).
- **`updateParameterDefinition(id, patch)`** no serviço (nome, família, unidade, opções, compartilhado, fórmula — a **chave não muda**: é o que a peça carrega).
- **`TelaParametros.tsx`** (in-flow, **Arquitetura › Parâmetros**, ao lado de Tipos; contagem no ribbon): "Como funciona", `StandardTable` (nome + unidade, chave, família, tipo, fórmula, **"Sai nas saídas"** sim/privada, **no desenho** = peças que carregam a chave — `usosPorChave`, organização quando o topo está em "Todas"), **Editar** (formulário inline: nome, família, unidade, fórmula com `erroDeSintaxe`, opções, checkbox "Sai nas saídas") e **Excluir** (confirmação que diz quantas peças carregam a chave e que **continuam com o valor** — o painel passa a mostrá-lo como "sem definição").

**Decisões.** (1) Privada ≠ apagada: o valor fica na peça e na tela; só as saídas para fora da organização o omitem — é o que "compartilhado" sempre quis dizer. (2) Chave imutável: renomear a chave deixaria o payload publicado apontando para uma definição que não existe; muda-se o nome de gente, não o de programa. (3) Excluir não toca peça: mesma regra do catálogo de tipos (P2.3) e da E1.1 — o desenho publicado é o que vale.

**Prova.** *No app real* (estudo "Planta 14/09/2026"): **escritas bloqueadas (14)** — Arquitetura › Parâmetros abre em fluxo, lista 0 definições (não havia nenhuma), "0 privada(s) hoje". **Escrita real, autorizada ("criar, provar e apagar")**, bloqueio aberto só para `blueprint_parameter_definitions` (0 escritas fora): "Nova definição" no painel da Parede 1 (Custo interno, número, R$, fórmula) → modal de organização → Alpa → a tela lista 1 definição ("parede · Número · comprimento_m * 120 · sim"); **Editar**: fórmula `comprimento_m * altura_m * 95` + "Sai nas saídas" desligado → "atualizada", marca **privada**; **Excluir** → confirmação → 0 definições; banco de volta a 0 (POST upsert, PATCH, DELETE — nada mais). Testes: `blueprintParametrosPrivados.test.ts` (4: chaves privadas/filtro puro, planilha, IFC com contagem de Psets, usos por chave), editor "definições de parâmetro (P2.5)" (lista com usos, fórmula inválida recusada, editar grava privada, excluir com aviso de usos); suíte 404 arquivos / 4863 testes; tsc, check-ui e build OK.

Próxima: P2.6 — caixa do elevador no 3D.

### P2.6 — Caixa do elevador e shaft no 3D (20/09/2026) · backlog P2

**O que entrou** (**sem bump**): a E2.4 deixou "só o furo aparece" no 3D. Agora **`utils/blueprintNucleo3d.ts`** (puro) diz o que se desenha por núcleo: **SHAFT** = prisma translúcido do piso de partida ao teto do último pavimento atravessado (verde-azulado se `MECANICA`, cinza se geral); **ELEVADOR** = caixa translúcida (mesma altura) + **poço** abaixo do piso de partida + **casa de máquinas** acima do último teto (as medidas da ficha da E2.4) + **cabine** opaca de 2,20 m no pavimento de partida, recuada 100 mm das paredes da caixa. O viewer só extruda o anel (`ExtrudeGeometry` + `Edges`), com `depthWrite` desligado no translúcido — é vazio de projeto, não massa, e a planta continua legível por dentro. Clique seleciona o núcleo; respeita pavimentos visíveis e ocultos.

**Decisões.** (1) Números fora do viewer (que está sob `@ts-nocheck`): o que dá para testar sem WebGL é a lista de prismas (cotas, alturas, cores). (2) Translúcido, não sólido: o shaft e a caixa são o que NÃO se constrói. (3) A cabine é ilustrativa (2,20 m, recuo fixo): ninguém dimensiona cabine em pré-projeto — o que importa é ver que o elevador para ali.

**Prova.** *No app real* (estudo "Planta 14/09/2026", escritas bloqueadas 16): elevador por dois cantos com a ficha de 8 passageiros aplicada e shaft mecânico no rascunho; **Vista: 3D** — a caixa do elevador translúcida com a casa de máquinas acima da cobertura e o shaft verde-azulado atravessando os dois pavimentos (captura); 0 erros de página. Testes: `blueprintNucleo3d.test.ts` (2: elevador com caixa 5,80 m / poço −1,40 / casa 2,20 / cabine recuada, e sem ficha só caixa + cabine; shaft por disciplina e até o pavimento de chegada); suíte 405 arquivos / 4865 testes; tsc, check-ui e build OK.

Próxima: P2.7 — vagas em espinha de peixe (45°) e em fila.

### P2.7 — Vagas em espinha de peixe (45°) e em fila (20/09/2026) · backlog P2

**O que entrou** (**sem bump**: hipótese da tarefa, não payload — a vaga já tinha `rotacaoGraus`):

- **`HipotesesDeVagas.arranjo`**: `PERPENDICULAR` (de ré, 90° — o de sempre e o padrão para o estado persistido antigo sem a chave), **`ESPINHA_45`** e **`PARALELA`** (em fila). **`geometriaDoArranjo`** dá, por arranjo, a **profundidade da banda** (c · (l+c)·sen 45° ≈ 5,30 m · l), o **passo ao longo da fileira** (l · l/sen 45° ≈ 3,54 m · c + 1,00 m de manobra), o centro dentro do passo e o **giro relativo à fileira** (0 · 45°/135° conforme o lado da circulação, para o carro entrar de frente vindo dela · 90°). `planejarVagas` usa isso nas bandas e na colocação; o comando `AddVaga` grava o giro de cada vaga.
- **Âncora no lado oposto à circulação**: a vaga mais funda que a banda (a PCD com a faixa de 1,20 m, na espinha e na fila) cresce **para** a circulação — que é onde a faixa de embarque fica —, nunca para fora da região nem para dentro da banda vizinha. Para o de ré (profundidade = banda) nada muda.
- **Painel** (Terreno › Garagem › Vagas): select **Arranjo** com os três, e a dica de que a espinha admite circulação mais estreita (3,50 m).

**Decisões.** (1) A espinha por giro de 45° do retângulo (caixa envolvente 5,30 × 5,30, passo 3,54): é a geometria clássica e cabe na verificação de obstáculos que já existia (o contorno real, girado). (2) Fila com 1,00 m de manobra fixa: pré-projeto; o município que pedir 5,50 m de vaga paralela ajusta o comprimento. (3) O lado do giro alterna com o lado da circulação porque é isso que faz a espinha ser espinha.

**Prova.** *No app real* (estudo "Planta 14/09/2026", escritas bloqueadas 16): garagem de 16,9 × 9,3 m desenhada em retângulo fora da casa; Terreno › Vagas com a região "Ambiente 1 · 166,46 m²": **de ré** não cabe ("não cabe uma fileira com circulação (10,0 m)" — honesto), **espinha de peixe** com circulação 3,50 → "3 vaga(s) a lançar · Comum 1 · PCD 1 · Idoso 1", lançadas a 45° (captura); **em fila** → "4 vaga(s) a lançar", lançadas deitadas; `blueprint:vagas.arranjo` persistido. 0 erros de página. Testes: `blueprintVagasArranjos.test.ts` (3: geometria dos três arranjos, espinha sem sobreposição com giros 45/135 e todas dentro da garagem, fila com passo c + 1,00 m e mais bandas que de ré), `blueprintVagas.test.ts` intacto; suíte 406 arquivos / 4868 testes; tsc, check-ui e build OK.

Próxima: P2.8 — volume do ambiente na etiqueta (E0.2) e "cabe?" pela face externa (E3.3).

### P2.8 — Volume do ambiente no quantitativo e "cabe?" pela face externa (20/09/2026) · backlog P2

**O que entrou** (**sem bump de kernel**; **quantitativos `quant-1.13.0 → 1.14.0`** — campo novo por ambiente; o cache é chaveado pela versão, e o `kernel.bundle.mjs` da `planta-api` foi regerado e a função **redeployada**):

- **`QuantidadeAmbiente.peDireitoM` e `volumeM3`** (`quantities.ts`): pé-direito **útil** = pé-direito do pavimento − rebaixo do forro declarado (E7.2); volume = área de piso líquida × pé-direito útil. Antes a tela calculava sozinha pelo pé-direito do pavimento (sem o rebaixo) e a **planilha não tinha volume** (E0.2 deixou registrado). Agora o número é um só: a tela lê do quantitativo (com o fallback do pavimento para cache antigo) e a aba Ambientes da planilha ganha **"Pé-direito útil (m)"** e **"Volume (m³)"**.
- **"Cabe?" pela FACE EXTERNA** (`blueprintEnvelope3d.ts`): o contorno externo do nível corre no eixo das paredes; a edificação vai até a face, meia espessura adiante. O contorno é deslocado para fora pela meia espessura da parede externa mais grossa do pavimento (`anelRecuado` com recuo negativo — a mesma mitra do envelope). Efeito: parede de 20 cm com a **face na linha do recuo cabe**; com o eixo a 5 cm além, **invade 5 cm pela face** (antes passava). Os dois testes que citavam o eixo (`blueprintEnvelope3d`, editor E3.3) foram atualizados para os números da face (12,2 × 3,1 m e 12,2 × 4,1 m fora).

**Decisões.** (1) O volume entra no quantitativo, não só na tela: é o que a planilha e a API publicam. (2) Meia espessura da parede mais grossa do pavimento, e não por trecho do contorno: `contornoExternoDoNivel` não diz que parede é cada lado; o erro possível é a favor da segurança (uma parede fina no meio de grossas fica 1–2 cm mais recuada na conta). (3) Bump só dos quantitativos: o payload canônico não mudou.

**Prova.** *No app real* (estudo "Planta 14/09/2026", escritas bloqueadas 14): Analisar › Quantitativos › Por ambiente lê **"quant-1.14.0"** e a linha "Ambiente 1 · … Placa de gesso acartonado · rebaixo 0,30 m · … · **2,50** · **62,96**" — pé-direito útil 2,80 − 0,30 e volume 25,19 m² × 2,50 m, do quantitativo. Testes: `blueprintVolumeEFace.test.ts` (2: pé-direito útil e volume com e sem forro + colunas da planilha; face na linha cabe e 5 cm além invade 12,2 × 0,05 m²), pins `quant-1.14.0` (5 arquivos), `plantaApi` (bundle fresco); suíte 407 arquivos / 4870 testes; tsc, check-ui e build OK; `planta-api` v6.

Próxima: P2.9 — números do município por semente e regra de UNIDADE/PAVIMENTO com mais variáveis (E3.2), ou o que você preferir do backlog.

### P2.9 — Regras de UNIDADE e PAVIMENTO com mais variáveis (20/09/2026) · backlog P2

**O que entrou** (**sem bump**: variáveis do motor de regras, derivadas do modelo; a E3.2 deixou "regra de UNIDADE/PAVIMENTO só tem as variáveis básicas"):

- **UNIDADE** ganha `area_util` (Σ área de piso líquida dos ambientes — o contorno recuado, sem paredes; sempre menor que a privativa), `dormitorios` (ambientes SALA_DORMITORIO cujo nome fala em dormitório, quarto ou suíte — o kernel junta sala e dormitório num tipo só, então o nome decide), `banheiros`, `cozinhas`, `varandas` (por tipo NBR 5410), `pavimentos` (duplex = 2), `geminada` (divide parede com outra unidade), `area_por_dormitorio` (ausente sem dormitório).
- **PAVIMENTO** ganha `unidades`, `area_privativa`, `area_comum` (construída − privativa), `eficiencia` (privativa ÷ construída, %; ausente sem unidade), `escadas`, `elevadores` (núcleos ELEVADOR que atravessam o pavimento), `vagas` (confirmadas) e `banheiros` — tudo pelo `quadroDeUnidades` da E2.2 e pelos núcleos da E2.4.
- **Quatro sementes** (referência de mercado, não norma; a organização edita): *Unidade: ao menos um banheiro* (ERRO, quando ≥ 2 ambientes), *Unidade: ao menos um dormitório* (AVISO), *Pavimento tipo: eficiência ≥ 70 %* (AVISO, quando ≥ 2 unidades), *Elevador acima de 12 m de cota* (ERRO, quando cota > 12) — 29 regras semente no total.

**Decisões.** (1) Dormitório pelo nome, dito na descrição da variável: mudar o `TipoDeAmbiente` do kernel para separar sala de dormitório seria bump por um vocabulário que a regra resolve. (2) `eficiencia` ausente sem unidade: número que não existe não vira zero. (3) As sementes novas usam `quando` para não acusar planta sem unidade — a casa térrea da prova não ganhou violação nova.

**Prova.** *No app real* (estudo "Planta 14/09/2026", escritas bloqueadas 14): Analisar › Legislação — resultados "17 violada(s) · 54 conforme(s) · 13 não avaliada(s)" (nenhuma violação nova: sem unidades, as regras de unidade não têm alvo e as de pavimento caem no `quando`); aba **Regras 29** lista as quatro novas; o editor de regras documenta as variáveis novas de UNIDADE (`area_util`, `dormitorios`, `geminada`, `area_por_dormitorio`) e de PAVIMENTO (`eficiencia`, `elevadores`, `vagas`, `area_comum`). Testes: `blueprintRegrasUnidadePavimento.test.ts` (2: variáveis documentadas e nos alvos de um tipo com duas unidades geminadas; sementes — 102 sem banheiro VIOLADA, eficiência conforme, elevador a 13 m VIOLADA → conforme com elevador, sem unidades nada acusa); suíte 408 arquivos / 4872 testes; tsc e build OK.

Próxima: P2.10 — exigência de vagas vinda da zona (E2.5) e recuos por lado por pavimento (E3.3).

## Verificação (por fase)

1. `npx tsc --noEmit` · `bash scripts/check-ui-standard.sh <tsx>` · `npx vitest run` cheia ·
   `npm run build`.
2. Fase com bump: goldens provados com a string antiga antes do bump, recaptura dos hashes,
   cabeçalho do teste registra o motivo.
3. Prova no app real (Playwright, escritas bloqueadas, Desfazer ao fim) do gesto principal da fase;
   para o gerador, a mesma semente produz o mesmo hash canônico duas vezes.
4. Doc da fase nesta pasta; commit; push; `conferir-producao.sh` + CI verdes.

## Fecho do roadmap (20/09/2026)

**42 de 42 fases publicadas** entre 18 e 20/09/2026 (E0.1 `a02c07cb` → E11.1 `b7fce8be`), cada uma
num commit próprio em `main`, com prova no app real de escritas bloqueadas (e escrita real só
quando o usuário autorizou: token da API E9.2, webhooks E9.3, itens do plano E10.3 — os dois
últimos apagados depois). Kernel **0.32.0 → 0.47.0** (15 bumps, cada um com o ritual dos goldens
registrado no cabeçalho de `blueprintKernelGoldens.test.ts`); quantitativos **quant-1.10.0 →
1.13.0**; 22 migrations `blueprint_*` aplicadas por `db query -f` (000030 a 000057); 4 Edge
Functions (`planta-ia`, `dwg-converter`, `planta-api`, `planta-webhooks`). Suíte: 4.597 → 4.845
testes.

Os cinco motores do pedido original existem e se falam: Geométrico (kernel), Paramétrico
(tipos, parâmetros, fórmulas, restrições, eixos), Regras (vocabulário da zona, regras
declarativas, envelope 3D), Programa/Grafo (programa, grafo, conferência), Avaliação (insolação,
score, sugestões) e o Gerador (design options, gerador determinístico, mobiliário, IA). A cadeia
"planta → quantitativo → orçamento → cronograma → compras" fechou na E10.3.

### Backlog P2 nomeado (o que o plano deixou de fora, com endereço)

Do corte original ("Fora do plano"): catálogo de tipos (os tipos são da organização desde a E1.1;
faltava a TELA do catálogo — feita na P2.3), famílias aninhadas, sub-regiões/taludes avançados, cobertura por extrusão,
paredes curvas/inclinadas, cortina/brises, rodapés como elemento próprio (hoje declaração por
ambiente, E7.2), departamento, planta de forro, vista dependente, nuvens de revisão, tabelas
personalizadas, status do conflito (aberto/resolvido — hoje só a lista e o BCF), SKP, lock fino
(hoje trava por seleção, E10.1), fases personalizadas (hoje EXISTENTE/DEMOLIR/NOVO, E10.2), LOD
elevado, plugins.

Registrado fase a fase ("fora desta fase"), por etapa:
- **E0.2**: volume do ambiente na etiqueta quando o volume entrar em `quantities.ts`.
- **E1.2/E1.3**: filtro `compartilhado` nas saídas; editar/excluir definição de parâmetro (só
  criação inline); valor por TIPO; fórmula nas saídas; editar fórmula existente.
- **E2.4/E2.5**: caixa do elevador no 3D (só o furo aparece); mover núcleo e vaga por arraste;
  espinha de peixe (45°) e vagas em fila; exigência de vagas vinda da zona.
- **E3.1–E3.3**: recorte do envelope em duas peças para servidão no meio; números do município
  por semente (hoje regras da organização); regra de UNIDADE/PAVIMENTO com mais variáveis; recuos
  por lado diferentes por pavimento além do progressivo; "cabe?" pela face externa.
- **E9.2**: `/docs` em HTML (a plataforma rebaixa para text/plain — a página humana é a tela).
- **E11.1**: dutos como trechos MECANICA no menu (a disciplina já existe no kernel), terminais e
  cargas térmicas — é o "HVAC completo" do P3/P4.

### Fora, e por decisão (P3/P4 — não replicar)

Render/ray tracing/animação, gbXML/energia/carbono, cálculo e modelo analítico estrutural,
estrutura metálica, detalhamento de armadura, fabricação, Dynamo/marketplace, worksets/modelo
central, HVAC completo, texto 3D.

### Como retomar

Uma fase por commit, o mesmo ritual da seção "Regras que valem para todas as fases"; toda fase que
mude o payload canônico sobe o kernel e recaptura os goldens; escrita real no banco só com
autorização explícita do usuário, e apagada depois quando for prova.
