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

## Verificação (por fase)

1. `npx tsc --noEmit` · `bash scripts/check-ui-standard.sh <tsx>` · `npx vitest run` cheia ·
   `npm run build`.
2. Fase com bump: goldens provados com a string antiga antes do bump, recaptura dos hashes,
   cabeçalho do teste registra o motivo.
3. Prova no app real (Playwright, escritas bloqueadas, Desfazer ao fim) do gesto principal da fase;
   para o gerador, a mesma semente produz o mesmo hash canônico duas vezes.
4. Doc da fase nesta pasta; commit; push; `conferir-producao.sh` + CI verdes.
