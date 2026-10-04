# Planta Inteligente — Gestão de camadas por disciplina


## Pedido original
> implementar gestao de plantas: hoje temos varios módulos (eletrico, hidraulico, terreno, incendio, mecanica), gostaria de cada um destes módulos fossem criados como se fossem camadas e que pudesem ser exibir/ocultar de forma forma a poder visualizar cada uma individualmente ou as que o usuário quiser porem exemplo para verificar interferencias ele poderia exibir uma, duas ou quantas ele quiser. esse gerenciamento poderia estar localizado no painel lateral direito.
>
> Sessão 9d4df4e5 · 04/10/2026 ~03:30

## Decisões tomadas com o usuário (04/10/2026)
| Pergunta | Resposta |
|---|---|
| Granularidade | **Disciplinas + subcamadas**: Arquitetura, Estrutura, Terreno, Elétrica (iluminação / força), Hidráulica (água fria / água quente / esgoto / pluvial), Incêndio, Mecânica |
| Toggles atuais do Vista › Exibir (Elétrica—iluminação, Elétrica—força, Rede de incêndio) | **Migrar**: saem do Exibir, uma fonte só |
| Conflitos (interferências) | **Filtrar pelas camadas visíveis**, com aviso e "Ver todos" |
| Ações rápidas | **Isolar**, **Mostrar/ocultar todas**, **Contagem por camada**, **Atenuar** (3º estado) |

## Contexto — o que já existe (origin/main)
- Os "módulos" são as abas do ribbon (`ABAS_DO_RIBBON`, `BlueprintEditor.tsx:1010`): arquitetura, terreno, eletrica, hidraulica, mecanica, incendio.
- Disciplina já é dado do kernel: `DisciplinaDeRede = ELETRICA|AGUA_FRIA|AGUA_QUENTE|ESGOTO|MECANICA|PLUVIAL|INCENDIO` (`utils/blueprintKernel/model.ts:2485`), em `Trecho`, `Terminal` e `Nucleo` (shaft mecânico). Rótulos em `ROTULO_DA_DISCIPLINA` (`utils/blueprintRede.ts:345`).
- **Mecanismo único de esconder**: `ocultosNoCanvas` (`BlueprintEditor.tsx:4170`) junta olho por peça (`ocultosNoDesenho`), fase, etapa, recorte de vista e hoje os toggles `mostrarEletricaIluminacao/Forca` (`idsForaDaVistaEletrica`, `utils/blueprintRecorteEletrico.ts:73`) e `mostrarIncendio` (`idsDaRedeDeIncendio`, `utils/blueprintSimbolosIncendio.ts:39`). O canvas usa o conjunto para desenho **e** clique (`BlueprintCanvas.tsx:1932–1993`, `2894+`, `4554+`).
- Buracos que a feature precisa fechar:
  1. **3D recebe `ocultosNoDesenho`, não `ocultosNoCanvas`** (`BlueprintEditor.tsx:13625`) → hoje esconder elétrica/incêndio não some no 3D.
  2. `model.boundaries` (lote/divisa) **não** são filtradas por `ocultos` (`BlueprintCanvas.tsx:1939`).
  3. Conexões derivadas (`simbolosDasConexoes2D`) e marcas da rede não filtram por disciplina; `spaces` não filtram.
  4. Terreno tem muita coisa fora do modelo (curvas de nível, declividade, hipsometria, terraplenagem, envelope, feições do levantamento, terreno 3D) controlada por toggles próprios.
- Painel direito: `SECOES_DO_PAINEL` (`BlueprintEditor.tsx:953`: pavimentos/componentes/ambientes), aberto/fechado em `blueprint:secoesDoPainel:v2` mesclado com o padrão, ordem em `blueprint:ordemDasSecoes` saneada — seção nova entra sem `:v3`. Render em `ordemVisivel.map(...)` (`:14042`) com `SecaoAccordion`.
- Templates de vista por organização (`utils/blueprintTemplatesDeVista.ts`, `CamadasDaPlanta` com `eletricaIluminacao/eletricaForca`; JSONB saneado na leitura → **sem migration**).
- Conflitos: `conflitosDoModelo` (`utils/blueprintKernel/conflitos.ts:260`, `Conflito{trechoId, outroId, classe}`) + `conflitosArquitetonicos`; `PainelConflitos` só filtra por pavimento.

## Classificação peça → camada (fonte única, pura)
| Camada | Peças do modelo | Overlays fora do modelo (desligam junto) |
|---|---|---|
| ARQUITETURA | walls, openings, spaces/labels, roofs, stairs, guardaCorpos, rodapes, vagas, subRegioes, componentes (exceto família CLIMATIZACAO/reservas), núcleos ELEVADOR e SHAFT sem disciplina | preenchimento/nomes dos ambientes, mobiliário sugerido, medidas/cotas das paredes |
| ESTRUTURA | structures (pilar, viga, laje, estaca, bloco, viga baldrame) | armadura 3D |
| TERRENO | boundaries (TERRENO/DIVISA/RESTRICAO), verticesDoTerreno, quadras, lotes, vias, areasPublicas, areasDeOperacao, blocos (massa) | preenchimento do terreno, curvas, declividade, hipsometria, nós, terraplenagem, envelope (2D e 3D), feições do levantamento, medidas lote/massa, terreno 3D |
| ELETRICA_ILUMINACAO / ELETRICA_FORCA | trechos/terminais `ELETRICA` pela `categoriaDoPonto`/`categoriaDoTrecho` existentes | circuito nos pontos |
| (Elétrica comum) | quadros, caixa de passagem, eletroduto compartilhado, ponto sem tipo | — visível se **alguma** subcamada elétrica estiver visível (regra atual do recorte) |
| AGUA_FRIA / AGUA_QUENTE / ESGOTO / PLUVIAL | trechos/terminais pela `disciplina`; conexões derivadas pela disciplina | marcas de verificação da rede, rótulos de rede 3D |
| INCENDIO | trechos/terminais `INCENDIO` (rede + preventivos) | — |
| MECANICA | trechos/terminais `MECANICA`, núcleo SHAFT `MECANICA`, componentes CLIMATIZACAO/reserva de equipamento | — |
| sempre visível | níveis, cortes, eixos, anotações, vistas dependentes | — |

Estado por camada: `'VISIVEL' | 'ATENUADA' | 'OCULTA'`. Estado do grupo = derivado das subcamadas (misto mostra indeterminado).

## Plano (fases; cada item: o que muda · como sei que terminou)

### F1 — Motor puro `utils/blueprintCamadasPorDisciplina.ts` (novo — `ls` antes do Write)
- Tipos `Camada`, `EstadoDaCamada`, `GRUPOS_DE_CAMADAS` (rótulo, ícone-chave, subcamadas, aba do ribbon correspondente), `ESTADOS_PADRAO` (tudo visível).
- `classificarPecas(model): Map<id, Camada | 'ELETRICA_COMUM'>` — reusa `categoriaDoPonto`, `categoriasDosCircuitos`, `categoriaDoTrecho` (`blueprintRecorteEletrico.ts`), `ehReservaDeEquipamento`, `CATALOGO_DE_COMPONENTES[t].familia`.
- `idsPorEstado(model, estados) → { ocultos: Set, atenuados: Set }`; `contagemPorCamada(model, levelIds)`; `estadoDoGrupo`; `isolar(estados, alvo, { baseAtenuada })`; `definirTodas(estado)`; `sanearEstados(raw)`; `estadosDasChavesAntigas({iluminacao, forca, incendio})`; `ladoVisivel/ conflitoVisivel(conflito, classe, estados)`.
- `simbolosDasConexoes2D`/marcas: expor a disciplina (se ainda não) para o filtro.
- **Pronto quando**: `__tests__/blueprintCamadasPorDisciplina.test.ts` cobre cada linha da tabela de classificação (1 peça por coleção), elétrica comum, isolar com/sem base, saneamento de lixo, chaves antigas → estados; `npx vitest run __tests__/blueprintCamadasPorDisciplina.test.ts` verde.

### F2 — Ligação no editor (`BlueprintEditor.tsx`)
- Estado `usePersistedState('blueprint:camadasPorDisciplina:v1', …)` — chave por **nome de disciplina** (não id de peça, então persistir é seguro, ao contrário de `ocultosNoDesenho`); valor inicial lido das chaves antigas `blueprint:mostrarEletricaIluminacao/Forca/Incendio`; lido sempre via `sanearEstados`.
- `ocultosNoCanvas` passa a somar `idsPorEstado(...).ocultos` no lugar das 3 linhas de elétrica/incêndio; remover os 3 estados antigos.
- **3D**: novo `ocultosNo3d = ocultosNoDesenho ∪ camadas.ocultos` passado ao `Blueprint3DViewer` (corrige o buraco 1 sem trazer fase/etapa para o 3D).
- Overlays: cada toggle de terreno/arquitetura/estrutura listado na tabela vira `toggle && camada !== 'OCULTA'` no ponto de uso (o toggle individual continua no Exibir). A topografia não está no kernel — vem de `useBlueprintTopografia` e entra no canvas por props (`curvasDeNivel`, `pontosCotados`, `drenagem`, …, `BlueprintCanvas.tsx:1191–1230`): com TERRENO oculto o editor passa vazio; no 3D, `mostrarTerreno`/envelope/massa idem.
- Vista › Exibir: remover os itens `eletricaIluminacao`, `eletricaForca`, `incendio`; no lugar, um item-atalho "Camadas por disciplina…" que abre/rola a seção do painel.
- Templates (`blueprintTemplatesDeVista.ts`): `ConfiguracaoDeVista.disciplinas`; `configuracaoDaColuna` saneia (ausente → derivado de `planta.eletricaIluminacao/eletricaForca`, demais visíveis); diff/rotulagem; template de fábrica "Instalações" = arquitetura atenuada + MEP visível. `configuracaoDeVista` (`:3285`) e o aplicar template passam a ler/gravar as disciplinas.
- **Pronto quando**: `tsc` limpo; testes existentes que clicavam em "Elétrica — iluminação"/"Rede de incêndio" no Exibir migrados para o painel; `__tests__/blueprintTemplatesDeVista*.test.ts` com caso de template antigo (sem `disciplinas`) e novo.

### F3 — Seção "Camadas" no painel direito (`components/blueprint/PainelCamadas.tsx` novo)
- `SECOES_DO_PAINEL` += `{ id: 'camadas', rotulo: 'Camadas', naVista: false, no3d: true }` (04/10: elevação e corte não leem `ocultos`, então a seção fica na planta e no 3D) (antes de Componentes); `SECOES_ABERTAS_PADRAO.camadas = true`; ramo `idDaSecao === 'camadas'` no map de `:14042`.
- Linha por grupo (chevron expande subcamadas): olho (visível↔oculta), botão atenuar (meio-tom), rótulo, **contagem** de peças no pavimento ativo (no 3D, nos pavimentos da vista; camada vazia esmaecida), **Isolar**. Cabeçalho da seção (`acoes` do `SecaoAccordion`): "Mostrar todas", "Ocultar todas", e preferência "Isolar mantém a arquitetura como referência" (persistida, padrão ligada).
- Botões com `ActionIconButton`/padrão de ícone do app; desabilitado sempre com motivo no `title` (memória: botão desligado diz por quê); Isolar ativo mostra "Reexibir" no mesmo lugar.
- Seleção: ao ocultar/atenuar, tirar da seleção os ids que deixaram de ser clicáveis (como `alternarOcultoNoDesenho` faz).
- **Pronto quando**: `__tests__/components/PainelCamadas.test.tsx` (olho, atenuar, isolar/reexibir, mostrar/ocultar todas, contagem, grupo indeterminado); `bash scripts/check-ui-standard.sh components/blueprint/PainelCamadas.tsx components/blueprint/BlueprintEditor.tsx` exit 0; guia (`docs/ui_ux_guia_unificado.md`) lido inteiro antes e §19.5 (painel da Planta) atualizado com a seção Camadas.

### F4 — Atenuar (meio-tom) no 2D e no 3D
- O 2D é **um único `<canvas>` 2D** desenhado num efeito em ordem fixa (fundo → ambientes → paredes → … → loteamento → terreno → estrutura → trechos de todas as disciplinas `:5703` → conexões `:6042` → terminais `:6134` → quadros → componentes → núcleos …) — não há camada Konva por disciplina para esconder, então tudo é por id.
- `BlueprintCanvas`: prop `atenuados?: ReadonlySet<string>`; nos laços de desenho das coleções da tabela, `ctx.globalAlpha = ALFA_ATENUADO` (≈0,25) para id atenuado; overlays de camada atenuada desenhados com o mesmo alfa; **clique ignora atenuados** (filtrar nas listas/funções de acerto, não no desenho); `boundaries` passam a respeitar `ocultos` (buraco 2); conexões/marcas filtradas e atenuadas pela disciplina (buraco 3).
- `Blueprint3DViewer`: prop `atenuados`; malha atenuada com material `transparent`, `opacity` ≈0,15, `depthWrite=false`, sem raycast.
- **Pronto quando**: teste de unidade do helper de alfa/seleção; verificação visual (F6) com print 2D e 3D mostrando hidráulica visível sobre estrutura atenuada.

### F5 — Conflitos respeitam as camadas
- `PainelConflitos` recebe `estados` + classificação; lista só conflitos com **os dois lados não ocultos** (`conflitoVisivel`); faixa "Filtrado pelas camadas visíveis — N de M · Ver todos" (toggle local); destaque 3D e exportação BCF seguem a lista exibida.
- Badge de contagem do relatório no ribbon (Analisar › Conflitos) mostra a contagem filtrada com o total no `title`.
- **Pronto quando**: teste do filtro (estrutura × esgoto aparece com as duas visíveis; some ao ocultar esgoto; "Ver todos" devolve); teste do componente atualizado.

### F6 — Verificação ponta a ponta e publicação
- `npm run ci` (typecheck + suíte inteira, conferindo a CONTA de testes no JSON — memória do Node 24 intermitente) + `bash scripts/check-xss-sinks.sh`.
- App real via skill `rodar-app` (Playwright, servidor novo, escopo `[role="dialog"].pointer-events-auto` para Sheets): estudo com estrutura + hidráulica + elétrica + terreno → (a) ocultar cada grupo e conferir 2D e 3D; (b) isolar Hidráulica com base atenuada; (c) esgoto + estrutura visíveis → Conflitos filtrado; (d) recarregar a página → estado persistido; (e) aplicar template "Instalações". Prints anexados ao plano.
- Push `git push origin HEAD:main`, ler o check-run `ci`, `bash scripts/conferir-producao.sh "Ocultar todas"`, fechar a frente.

## Arquivos críticos
- novo `utils/blueprintCamadasPorDisciplina.ts`, novo `components/blueprint/PainelCamadas.tsx`
- `components/blueprint/BlueprintEditor.tsx` (estado, `ocultosNoCanvas`, `ocultosNo3d`, Exibir, seção do painel, templates, conflitos)
- `components/blueprint/BlueprintCanvas.tsx`, `components/blueprint/Blueprint3DViewer.tsx` (atenuados, boundaries, conexões)
- `utils/blueprintTemplatesDeVista.ts`, `components/blueprint/PainelConflitos.tsx`
- reuso: `utils/blueprintRecorteEletrico.ts`, `utils/blueprintSimbolosIncendio.ts` (`idsDaRedeDeIncendio` fica só para quem mais usar), `utils/blueprintRede.ts` (`ROTULO_DA_DISCIPLINA`, `COR_DA_DISCIPLINA` para o marcador de cor da linha)
- testes: `__tests__/blueprintCamadasPorDisciplina.test.ts`, `__tests__/components/PainelCamadas.test.tsx`, testes do editor/Exibir/templates/conflitos afetados

## Fora do escopo (registrado)
- Gás: não existe no kernel (só citado em comentário). Entra como subcamada quando a disciplina existir.
- `SISTEMA_IFC` sem entrada para MECANICA (`utils/blueprintIfc.ts:2104`) — achado lateral, não é desta frente.
- Travar camada contra edição (já existe trava por DISCIPLINA na colaboração — `blueprintColaboracao.ts`).
- Camadas por pavimento (estado é global ao estudo, por navegador).
- Cor por disciplina configurável.

## Estado
- [x] F1 — motor puro (59 testes)
- [x] F2 — ligação no editor (3D passa a esconder as camadas; overlays de terreno/arquitetura/estrutura/elétrica com o grupo; Exibir sem os 3 toggles; templates com `disciplinas`)
- [x] F3 — seção Camadas no painel (PainelCamadas 7 testes + 3 no editor; guia §19.5)
- [x] F4 — atenuar (2D: fator multiplicativo no globalAlpha + clique/laço pulam atenuados; divisas, ambientes, conexões e marcas respeitam ocultos; 3D: passada fantasma translúcida sem raycast) — prova visual na F6
- [x] F5 — conflitos filtrados (faixa "N de M · Ver todos"; ribbon, cabeçalho, destaque 3D e BCF seguem a lista exibida; 5 testes)
- [ ] F6 — verificação e publicação

## Verificação (04/10/2026)
- Suíte inteira (`vitest --maxWorkers=4`, JSON): 717 arquivos, 7.464 testes = 7.430 ✅ + 34 pendentes (integração/arquivo-de-prova pulados — linha de base), 0 falhas; a conta fecha.
- `tsc --noEmit` limpo; `check-ui-standard.sh` limpo em `PainelCamadas.tsx`, `PainelConflitos.tsx`, `BlueprintEditor.tsx`.
- Harness `docs/spikes/camadas/` (canvas, 3D e `PainelCamadas` REAIS, sem login) — `medir.mjs` é portão, 15/15 ✅:
  pilar oculto = fundo em volta (25,8 × 23,4); meio-tom 57,4 entre visível 141,6 e oculto; clique no pilar seleciona só com a Estrutura visível;
  "Expandir Hidráulica → Isolar Esgoto" pelo painel dá esgoto visível / arquitetura meio-tom / resto oculto; ocultar Terreno muda o desenho (divisa obedece);
  3D: passada translúcida desenha (paredes e pilar translúcidos com o tubo aparecendo através), sem erro de console.
- Desvio do plano registrado: a seção fica na planta e no 3D (`naVista: false`) — elevação e corte não leem o conjunto de ocultos.
- Ainda não feito: passeio no app real com login (precisa da senha do usuário de leitura, que não fica gravada).
