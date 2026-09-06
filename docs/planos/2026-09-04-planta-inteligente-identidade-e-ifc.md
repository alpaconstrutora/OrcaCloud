# Planta Inteligente — Etapa 1 rumo ao BIM: identidade persistente de elemento + IFC de coordenação

## Pedido original

> incoporacao < planta inteligente:
> o que falta implementar para transformar o modulo planta inteligente em um BIM completo

Sessão `b7041736-bf7a-4895-a5ec-193e752d57b7` · 2026-09-04.

Pergunta de acompanhamento na mesma sessão: *"esse é um plano para implementacao?"* —
respondida com duas perguntas de escopo (abaixo).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-04 | Qual entregável? | **Roadmap de lacunas + plano executável da 1ª etapa** |
| 2026-09-04 | O que "BIM completo" significa? | **Todos os quatro**: modelo arquitetônico completo · interoperar com Revit/Archicad · 4D/5D ligado ao ÒPURA · instalações (MEP) |
| 2026-09-04 | Qual é a 1ª etapa? | Recomendação aceita ao aprovar o plano: **identidade persistente de elemento + IFC com aberturas, propriedades e quantidades** — é o pré-requisito de 4D/5D, da ponte com ferragem, de comentário ancorado e da rastreabilidade no Revit. Telhado/escada vêm na Etapa 2. |

## Roadmap completo (contexto — só a Etapa 1 é executada aqui)

Levantado no código em 04/09/2026. O módulo hoje é um editor paramétrico 2D com
extrusão 3D e exportação de coordenação; o próprio `blueprintIfc.ts` declara "NÃO é
um modelo BIM". Fato que bloqueava tudo: o payload canônico não guardava id, e
`modelFromCanonicalPayload` reatribuía ids por posição a cada publish — logo o GUID
IFC mudava para a mesma parede a cada revisão, FK por elemento era impossível, diff só
casava por geometria.

| Etapa | Escopo | ~dias | Situação em 06/09/2026 |
|---|---|---|---|
| **1 (esta)** | uid estável por elemento · `blueprint_objects.element_uid` · diff por uid · IFC com `IfcOpeningElement/IfcDoor/IfcWindow`, `Pset_*`, `Qto_*`, GUID por uid | 8–10 | ✅ **em produção** (04/09) |
| 2 | Telhado (`IfcRoof`), escada/rampa, forro/piso/revestimento (`IfcCovering`), tipos de esquadria, vista de corte, 3D com seleção e materiais | ~22 | 🟡 **5 de 6** — o "3D útil" ganhou a **seleção por clique** em 06/09 (a parte que destravava o 4D); faltam `IfcCovering` e, do 3D, o modo walk. Materiais por função já existiam (`COR_CAMADA_3D`) |
| 3 | 5D custo por elemento + reconciliação com orçamento aprovado · 4D vínculo elemento↔tarefa (Objeto Digital) + simulação no 3D · outbox RF-128 · ponte com ferragem | ~19 | 🟢 **o essencial FEITO em 06/09** — trava de orçamento fechado, linha de orçamento por `uid`, custo por elemento no painel e no IFC, e a simulação temporal no 3D. O vínculo elemento↔tarefa saiu **sem tabela**: é derivado da cadeia de ids (ver `2026-09-06-planta-etapa3-5d-4d.md`). Faltam o outbox RF-128 e a ponte com ferragem, ambos fora do caminho crítico |
| 4 | Viewer IFC no app (web-ifc) · **importar IFC** e DXF · `IfcTypeObject` + classificação · georreferência | ~25 | 🟡 **2 de 5** — viewer feito; importação traz só geometria ESTRUTURAL, faltam paredes e aberturas (com `GlobalId` como uid). `IfcTypeObject` existe só para esquadria, e veio de carona na Etapa 2 — falta para parede e estrutura. Faltam inteiros: DXF, classificação SINAPI, georreferência |
| 5 | Comentários ancorados em elemento + BCF · aprovação · publicar no GED e Portal | ~14 | ⬜ **não iniciada** |
| 6 | MEP como grafo de trechos + conectores · absorver `electrical_*` no kernel · clash | ~25 | ⬜ **não iniciada** |

Detalhe do roadmap: `C:\Users\altai\.claude\plans\incoporacao-planta-inteligente-tingly-acorn.md`
(cópia de trabalho; este arquivo é a fonte versionada).

## Decisão de desenho (Bloco A)

**Seção `identity` no payload, FORA do hash, sem bump de `KERNEL_VERSION`.**

- O payload ganha uma chave de topo `identity` com arrays paralelos aos arrays
  geométricos (mesma ordem canônica). `snapshotHash` = sha256 da geometria, byte a
  byte a forma de antes. Prova: goldens passam sem recaptura.
- uid não decide ordem: todo `sort` desempata pela serialização do elemento e só
  então pelo uid.
- Snapshot antigo (sem `identity`) → uid derivado de `hash geométrico:família:índice`
  (nibble de versão `8`); duas leituras dão os mesmos uids; o 1º autosave persiste.
- Formato: UUID; para IFC, compressão em 22 chars com 1º char `0–3`.
- Consequência registrada: republicar geometria igual com uids diferentes não cria
  versão (idempotência por hash). Identidade não é conteúdo.
- `Space` continua derivado; herda `labelUid` da etiqueta que o nomeia.
- `SplitWall`/`CutWallAtStructural`: o fragmento que contém `wall.a` mantém o uid
  (preserva origem, sentido e `offsetMm` das aberturas); o outro ganha novo.
  `MergeWalls` mantém `first.uid`. Cópias (`DuplicateLevel`/`DuplicateEntities`)
  recebem uid novo.

## Plano — um item por arquivo, com critério de pronto

### Fase 1 — Kernel ✅ (04/09/2026)
- [x] `utils/blueprintKernel/hash.ts` (novo) — `sha256` + `stableStringify` saem de
  `canonical.ts` (evita ciclo com `identity.ts`). Pronto: `canonical` e `index`
  importam daqui; suíte do kernel verde.
- [x] `utils/blueprintKernel/identity.ts` (novo) — `novoUid`, `uidDeterministico`,
  `rotuloCurto`, `EH_UID`, `usarGeradorDeUid`/`uidDeTeste`/`geradorSequencial`.
  Pronto: `__tests__/blueprintIdentidade.test.ts` (20 casos) cobre formato,
  determinismo e unicidade.
- [x] `utils/blueprintKernel/model.ts` — `uid` obrigatório em `Level/Wall/Opening/
  Boundary/Structural/SpaceLabel`; `Space.labelUid`; invariantes `DUPLICATE_UID` e
  `BAD_UID`. Pronto: `tsc` limpo; teste força duplicata/formato e recebe o erro.
  Nota: uid AUSENTE é tolerado em tempo de execução (modelo literal de teste); o
  tipo exige e todo caminho de criação preenche.
- [x] `utils/blueprintKernel/canonical.ts` — `projetar` (geometria × identidade),
  `payloadDoHash`, `hashDePayload`, desempates, leitura com fallback determinístico.
  Pronto: **goldens intactos sem recaptura**; parte hasheada não contém `identity`;
  "uids diferentes → mesmo hash"; "snapshot antigo lido 2× → mesmos uids";
  round-trip preserva uids byte a byte; `hashDePayload` imune à reordenação de
  chaves do JSONB.
- [x] `utils/blueprintKernel/arrangement.ts` — `aplicarEtiquetas` grava `labelUid`.
  (`paredeEhExterna` foi movida para a Fase 5, onde o IFC a consome.)
- [x] `utils/blueprintKernel/commands.ts` — criação gera uid; cópias geram novo;
  split/cut mantêm no trecho de `a`; merge mantém `first.uid`. Pronto: casos em
  `blueprintIdentidade.test.ts` (Duplicate/Split/Merge/Cut/edição).
- [x] `utils/blueprintKernel/units.ts`, `index.ts` — nota de "sem bump" e exports.
- [x] Testes existentes ajustados (5) — comparavam o payload COMPLETO entre duas
  construções; passaram a comparar `payloadDoHash` (a semântica que queriam) —
  `blueprintKernel`, `blueprintEstrutural`, `blueprintLevelCommands`.

### Fase 2 — Diff ✅ (04/09/2026)
- [x] `utils/blueprintDiff.ts` — `parear()` casa por uid e depois pela chave
  geométrica (lista por chave, não `Map`, para paredes sobrepostas); tipos novos
  `PAREDE_MOVIDA`, `ABERTURA_MOVIDA`, `ABERTURA_ALTERADA`, `ESTRUTURA_MOVIDA` com
  `rotuloCurto`; `Alteracao.uid`; ambiente casa por `labelUid` antes do anel e do
  nome; porta que anda junto com a parede NÃO é "porta movida" (hospedeira por uid).
  Pronto: 10 testes existentes verdes sem alteração; `__tests__/blueprintDiffUid.test.ts`
  (9 casos): `TranslateEntities` → 1 movida/0 removida/0 adicionada; antigo × novo
  idêntico → `identicos`; antigo × novo movido → removida+adicionada (nunca "movida").

### Fase 3 — Persistência ✅ banco / ⏳ E2E de cliente (04/09/2026)
- [x] `supabase/migrations/aplicar_20270918000030_blueprint_element_uid.sql` (novo) —
  coluna `element_uid`, UNIQUE parcial `(snapshot_id, element_uid)`, índice
  `(organization_id, element_uid)`, RPC lendo `p_payload #>> '{identity,<fam>,<i>}'`,
  REVOKE/GRANT. Sem backfill. **Também restaura `restrict_violation` (23001)**: a
  `…20270917000004` (estrutural) tinha recriado a função com `serialization_failure`,
  regressão da correção de `…20270905000001` (só não apareceu porque o serviço casa a
  mensagem também). Pronto: `migrationsPrefixo`/`segurancaMigrations` verdes;
  **APLICADA em 04/09/2026** com `db query -f`; conferência no banco: coluna=1,
  2 índices, `errcode_ok=true`, `rpc_grava_uid=true`, grants só
  postgres/authenticated/service_role.
- [x] **Sonda SQL contra o banco real** (transação não confirmada, 0 resíduos): payload
  real do kernel publicado pela RPC → `element_uid` das 5 paredes na ordem canônica,
  abertura com uid, SPACE nomeado com o uid da etiqueta e SPACE sem nome `NULL`.
- [x] `services/blueprintService.ts` — só comentário em `loadBranchModel`.
- [ ] `__tests__/blueprintE0.integration.test.ts` — 2 casos novos ESCRITOS (uid gravado =
  `identity.walls`; mover parede e republicar mantém os 5 uids + integridade), mas
  **NÃO EXECUTADOS**: a suíte exige `BLUEPRINT_EMAIL`/`BLUEPRINT_PASSWORD` (ou o
  `agente-leitura` com `PW_SENHA`), e a senha, por regra do projeto, não fica em arquivo.
  Rodar: `BLUEPRINT_E2E=1 BLUEPRINT_EMAIL=… BLUEPRINT_PASSWORD='…' npx vitest run
  __tests__/blueprintE0.integration.test.ts`.

### Fase 4 — IFC: aberturas ✅ (04/09/2026)
- [x] `utils/blueprintIfc.ts` — por abertura: `IfcOpeningElement` (caixa largura × (espessura+2·10 mm) × altura, no sistema LOCAL da parede: `x = −comp/2 + avA + offset + largura/2`, `z = peitoril`) + `IfcRelVoidsElement`; `IfcDoor`/`IfcWindow` + `IfcRelFillsElement` (folha = caixa na espessura da parede; `passage` = só o vão); `OperationType` pela convenção do canvas (`SINGLE_SWING_LEFT` ⇔ `hingeAtStart !== swingReversed`; correr: `SLIDING_TO_LEFT` ⇔ `hingeAtStart`), com o placement da folha girado 180° quando `swingReversed` para +Y ser sempre o lado que abre. Corpo da parede continua SÓLIDO. Pronto: `__tests__/blueprintIfcBim.test.ts` — 1 vão + 1 rel por abertura, ligação parede→vão→porta, vão fora do `IfcRelContainedInSpatialStructure`, contagem de atributos IFC4 (OpeningElement 9, Door 13, Window 13, RelVoids 6, RelFills 6, Pset 5, PropertySingleValue 4, RelDefines 6, ElementQuantity 6, Quantity* 5, Wall 9, Space 11, Storey 10), 8 combinações de operação, posição do vão com e sem canto (o avanço é do corpo, não do eixo — o vão fica em −600 nos dois casos).
- [x] Confirmado antes de escrever: o modelo é **y para cima** (é o papel/tela que inverte); IFC e DXF com `y` cru NÃO espelham nada.

### Fase 5 — IFC: identidade, Psets, quantidades, cobertura ✅ (04/09/2026)
- [x] `utils/blueprintIfc.ts` — `ifcGuidDeUid` (compressão padrão, 1º char `0–3`, reversível) para elementos; pavimento por `level.uid`; ambiente por `labelUid`; projeto/terreno/edifício por `uidDeterministico(studyId:papel)` quando há `studyId`; relações e Psets/Qtos filhos derivados do uid do pai; `Tag` = rótulo curto. `Pset_WallCommon` (`IsExternal` via `paredeEhExterna`, `LoadBearing` só com composição), `Pset_Door/WindowCommon` (herda), `Pset_SpaceCommon`, `Pset_Column/Beam/SlabCommon`, `Pset_OpuraPlanta` (ElementUid, ElementLabel, StudyId, SnapshotHash, SnapshotRevision, KernelVersion, QuantitiesVersion, ItemCode); nunca Pset vazio. `Qto_Wall/Space/Door/Window/Column/Beam/Slab/Pile/FootingBaseQuantities` de UM `computeQuantities` (mm/m²/m³; `NetFloorArea` = piso, com a fórmula). `COBERTURA_IFC` reescrita (corrige "não contém materiais"; mantém "NÃO CONTÉM ARMADURA"). Pronto: GUID da parede idêntico entre revisão 1 e 2; projeto/site/edifício/pavimento idem com `studyId`; `Length` = `wallLength` em mm; áreas/volumes iguais ao quantitativo; `IsExternal` .T. ×4, .F. na divisória, omitido na parede solta.
- [x] `utils/blueprintKernel/exterior.ts` (novo) — `paredeEhExterna` por amostragem de um ponto de cada lado contra os `spaces` do nível.
- [x] `utils/blueprintExport.ts` (`OpcoesExportacao.studyId`), `services/blueprintExportService.ts` (repassa), `components/blueprint/PainelVersoes.tsx` (`opcoes()` envia `study.id`; texto "IFC de coordenação: leva portas e janelas com vão, propriedades e quantidades … não leva telhado, escada, forro, instalações nem armadura").
- [x] Testes antigos ajustados: `blueprintTrocaDeArquivos` (2 casos invertidos: agora TEM porta) e `components/PainelVersoes.test.tsx` (texto novo).

### Fase 6 — Round-trip com web-ifc ✅ (04/09/2026)
- [x] `package.json` — `web-ifc@0.0.57` em devDependencies (mesma versão do `bim-spike/`; entrada Node é a raiz do pacote via `exports["."].node`).
- [x] `__tests__/blueprintIfcRoundTrip.test.ts` — abre o STEP gerado no parser WASM de verdade: 4 IfcWall, 1 IfcDoor, 1 IfcWindow, 2 IfcOpeningElement, 2 IfcRelVoidsElement, 1 IfcSpace, Psets e Qtos > 0; a porta relida tem `GlobalId = ifcGuidDeUid(uid)`, `OverallWidth 800`, `OverallHeight 2100`, `OperationType SINGLE_SWING_LEFT`; paredes relidas com GlobalId do uid e `Tag P-XXXX`. **Rodou de verdade** (3 casos verdes, nenhum `skip`); se o WASM não inicializar, os casos pulam com o motivo no console em vez de fingir verde.

### Fase 7 — UI ✅ (04/09/2026)
- [x] `components/blueprint/IdentificadorDoElemento.tsx` (novo) — linha "Identificador": rótulo curto (P-1A2B) com o uid inteiro no `title` + `ActionIconButton kind="duplicate" size="sm"` que copia o uid INTEIRO e confirma trocando o ícone por 2 s; sem uid não renderiza.
- [x] `components/blueprint/PainelParedeSelecionada.tsx` (parede e abertura, sob o título) e `PainelEstruturaSelecionada.tsx` (sob a linha de volume/fôrma) usam o componente.
- [x] `docs/ui_ux_guia_unificado.md` — nova **§27 "Identificador técnico só-leitura (copiável)"** + item no CHECKLIST DE APLICAÇÃO (REGRA #1, passo 4).
- [x] Pronto: `bash scripts/check-ui-standard.sh` nos 4 `.tsx` tocados → "Nenhuma violação mecânica"; `__tests__/components/IdentificadorDoElemento.test.tsx` (3) e 3 casos novos em `PainelParedeSelecionada.test.tsx` (rótulo/título, prefixo de vão, sem uid sem linha). Itens do checklist verificados: §9.2 botão-ícone (ActionIconButton) · §21 rótulo de campo (`text-xs font-semibold text-slate-500`) · §7 (não há `<td>`) · §13 (sem toast, de propósito) · §16 (radius herdado do ActionIconButton). Não se aplicam: tabela, KPI, toolbar, busca, badge, modal, empty/loading state.
- [ ] **Não verificado no navegador** — a skill `rodar-app` exige `PW_SENHA` do agente-leitura, que não fica em arquivo; pendente para o usuário (ver Fase 8).

### Fase 8 — Verificação ponta a ponta (04/09/2026) — 5 de 8
- [x] `npx tsc --noEmit` limpo.
- [x] `npx vitest run` — 130 arquivos / 2.363 testes verdes (26 pulados: E2E sem credencial e afins); goldens do kernel intactos.
- [x] `migrationsPrefixo`, `segurancaMigrations` verdes; migration APLICADA e conferida no banco; sonda SQL da RPC com payload real.
- [x] `bash scripts/check-ui-standard.sh` nos 4 `.tsx` tocados — sem violação.
- [x] `npm run build` (tsc + vite + PWA) verde.
- [ ] **E2E de cliente** (`BLUEPRINT_E2E=1`) — 2 casos escritos, NÃO executados: exige `BLUEPRINT_EMAIL`/`BLUEPRINT_PASSWORD`.
- [ ] **App real** (skill `rodar-app`: abrir estudo antigo, publicar 2 revisões, ver "Parede P-xxxx movida", exportar IFC) — NÃO executado: exige `PW_SENHA`.
- [ ] **IFC num visualizador de terceiros** (BIMvision / viewer do `bim-spike/`) — o parser `web-ifc` já releu o arquivo em teste (entidades, GUIDs, OperationType), mas a conferência VISUAL da mão da porta e dos Psets no painel do visualizador não foi feita.

## Estado

**Etapa 1 está em produção desde 04/09/2026** (`97918fe`, `1e53449`, `31c8cd1`,
`0e429c8`, `70e04d1`, `aa46774`, `91834c3` em `main`). Fases 0–7 feitas; Fase 8
com 3 itens ainda abertos, listados em "Pendências" abaixo.

Este arquivo é a fonte consolidada do roadmap. Cada frente posterior tem plano
próprio, e todas também estão **em produção**:

| Frente | Plano | Em produção desde |
|---|---|---|
| Telhado — a água (0.12.0) | `2026-09-04-planta-inteligente-telhado.md` | 05/09 (`42ce147`…`804f72a`) |
| Vista de corte (0.13.0) | `2026-09-05-planta-inteligente-corte.md` | 05/09 (`b614cc6`…`2b4ed73`) |
| Escada e rampa (0.14.0) | `2026-09-05-planta-inteligente-escada-rampa.md` | 05/09 (`2a1723a`…`f98a700`) |
| Tipos de esquadria (0.15.0) | `2026-09-05-planta-inteligente-tipos-de-esquadria.md` | 05/09 (`b1a9e6a`…`b62431d`) |
| Visualizador de IFC (Etapa 4, item 1) | `2026-09-05-visualizador-ifc.md` | 05/09 (`fda4b42`) |
| Biblioteca + importação de IFC | `2026-09-05-ifc-persistir-e-importar.md` | 05/09 (`626c5d0`, `80cc12d`, `5bf947b`) |

## Depois da publicação — o que o uso real encontrou (05–06/09)

São NOVE, e nenhum é falha da Etapa 1: três da vista 3D, dois do corte, três da
importação de IFC e um de regressão de outra frente. Ficam registrados porque
são a prova de por que o "pendente de olho" importa — **todos** passaram por
suíte verde, typecheck limpo e build ok antes de chegar ao usuário.

⚠️ E o nono não foi achado por uso nem por olho: foi achado **medindo contra o
artefato real**. Nenhum teste o pegaria, porque nenhum teste roda com 3.345
peças.

⚠️ **Dois deles são o MESMO defeito, em componentes diferentes** (as linhas 2 e
6): uma vista que enquadra por efeito, e um campo que move o desenho fora da
lista de dependências. Deu "o IFC não aparece" no 3D e "o corte não aparece" na
vista de corte, com dois dias de intervalo. A terceira vez é provável — qualquer
vista nova que enquadre sozinha precisa depender de tudo que desloca o
conteúdo.

| Defeito | Causa | Corrigido em |
|---|---|---|
| Aba 3D não abria (`Cannot access 'w' before initialization`) | `furosPorLaje` declarado DEPOIS do `useMemo` que o consumia — TDZ. Escondido pelo `@ts-nocheck` do R3F, que desliga o TS2448 que o pegaria | `a759fb1` |
| "O IFC não aparece na planta 3D" | O enquadramento da câmera ignorava `structures` e `stairs`; um estudo só com estrutura caía no padrão (origem, alcance 20) | `adfddd6` |
| "Não ocupa toda a área da tela" | **Regressão de outra frente** (`271626d`, 04/09): um `<div>` sem altura envolvendo o `AppRouter` fez `height: 100%` parar de resolver em TODAS as telas abaixo | `dfaa8f9` |
| "O grid está tremendo" | Moiré (não z-fighting: o erro de profundidade é 2–6 mm contra 120 mm de folga). Célula de 1 m desenhada além de 400 m vira sub-pixel. Latente havia muito tempo; só apareceu quando o canvas voltou à altura cheia | `472e93e` |
| Modelo importado longe do desenho | **Não era defeito.** A `GetCoordinationMatrix` do arquivo é a identidade e o prédio nasce no canto da origem do próprio IFC — a tradução é fiel. Faltava a tela DIZER onde as peças cairiam, e deixar escolher | `1fd5db4` |
| Pavimentos do IFC caíam todos no térreo | O fator de unidade era deduzido comparando a cota do pavimento com o TOPO das peças — que inclui a altura, e nunca dá a escala. Caía no fallback `1`: cotas de 3,40 m viravam 0,34 m. Passou despercebido no estudo do usuário porque ele tem UM pavimento | `0fe910b` |
| "Não encontro o botão Inverter o lado" | Ele existia e funcionava, e ainda assim era inalcançável: só na Planta, num painel dentro de seção recolhida, e a marca do corte é a ÚLTIMA na prioridade de clique — um corte traçado só por cima da construção não se seleciona | `2005aad` |
| "Ao inverter, o corte não aparece; tenho que sair e voltar" | **O mesmo defeito do 3D, de novo**: o conteúdo se move e o quadro não segue. A projeção recalculava certo; o efeito que enquadra não dependia de nada do corte. Inverter desloca a caixa de `u ∈ [−75, 5075]` para `[−5075, 75]` — sobreposição de 3% | `e1de401` |
| Importar IFC real travava a tela por **62 s** | `applyBatch` chamava `applyCommand` em laço, e `applyCommand` calcula `snapshotHash` — que serializa o modelo inteiro. n comandos = n hashes de um modelo que cresce: O(n²). E os hashes intermediários eram DESCARTADOS. Medido só quando a importação foi rodada contra o modelo de 14 MB do usuário | `10e5ecd` |
| `verifyQuantitySnapshot` acusava divergência em TODO snapshot | `totais` foi tratado como `Record<string, number>` e comparado com `!==`, mas `porMaterial` e `porEsquadria` são ARRAYS — identidade de referência os declara sempre diferentes. O `as` mentia, então o compilador não avisava. Achado pelo E2E na primeira execução; nenhuma tela consome a função, então não chegou ao usuário | (nesta entrega) |

**A lição, e ela se repetiu nas duas frentes:** a conta estava na CAMADA ERRADA.
Os três defeitos do 3D moravam em `Blueprint3DViewer.tsx`, sob `@ts-nocheck`,
onde nem compilador nem teste alcançam; o fator de unidade morava na TELA, quando
quem tem a matriz é o serviço. Nos dois casos o código parecia razoável de perto,
e só a medição contra o artefato real mostrou o erro.

O que mudou por causa disso: as contas do 3D saíram para
`utils/blueprint3dEnquadramento.ts` e a de unidade para `medirFatorParaMm`, as
duas puras e testadas. O harness ganhou dois portões que erro de console não
pegava (enquadramento em pixel, energia de moiré no horizonte) e a tela de
importação ganhou o primeiro teste de componente, com o parser dublado — os três
verificados nos DOIS sentidos, reintroduzindo o defeito para ver reprovar.

## Pendências

### Verificações que dependem de credencial ou de visualizador de terceiros
Abertas para TODAS as frentes acima, não só para a Etapa 1:

- [x] **E2E de cliente** — **RODOU em 06/09/2026, e os 23 casos passam** contra o banco real. Achou um defeito de produto e cinco defeitos do próprio teste; ver "O que o E2E encontrou" abaixo. Resíduos conferidos depois: zero.
- [ ] **IFC num visualizador de terceiros** (BIMvision/Solibri) — `web-ifc` já relê o arquivo em teste, mas falta a conferência VISUAL de: mão da porta batendo com o símbolo do canvas · `Pset_*`/`Qto_*` no painel · `IfcDoorType` agrupando instâncias ("P1") · orientação do sólido da **escada** (a normal direita como `Axis` está provada só por raciocínio) · telhado. *(A orientação do CORTE saiu desta lista: foi confirmada na tela em 06/09.)*
- [ ] **Visualizador de IFC no app** (`BimViewerModule`) — ninguém confirmou ter aberto a cena. Câmera, iluminação e destaque de seleção só se conferem abrindo.

### Fechadas pelo uso real em 06/09
- [x] **Editor 3D** — aberto pelo usuário; três defeitos encontrados e corrigidos (tabela acima).
- [x] **Ferramenta de corte** — usada no app e confirmada: traçar, abrir a vista, ajustar pelas pontas.
- [x] **"Inverter o lado" era inalcançável** — o usuário não achou o botão em 06/09, e com razão: ele só existia na Planta, num painel dentro de uma seção recolhida, e a marca do corte é a última na prioridade de clique. Hoje existe em três lugares: barra da planta (com a marca selecionada), barra da vista de corte e painel do corte selecionado.
- [x] **Inverter não redesenhava a vista** — relatado logo depois; era o quadro não seguindo o desenho (ver tabela). Corrigido nas dependências do enquadramento, com o salto medido em teste.
- [x] **Inverter espelha para o lado CERTO** — confirmado de olho pelo usuário em 06/09. Fecha a ORIENTAÇÃO do corte, que era o risco concentrado da frente: `olharPara` estava provado só por teste, e a convenção (`ESQUERDA` = normal esquerda de `a → b`) bate com o que quem desenha espera. **Nada mais do corte está aberto.**
- [x] **Importação de IFC** — usada de verdade: 440 componentes entraram num estudo.
- [x] **A distância até o desenho** — investigada em 06/09; a suspeita de que a `GetCoordinationMatrix` estivesse sendo perdida foi **refutada por medição** (ela é a identidade). O modelo nasce no canto da origem do próprio IFC e a tradução é fiel; o que faltava era a tela dizer onde as peças cairiam. Resolvido com pegada visível e três âncoras — ver `2026-09-05-ifc-persistir-e-importar.md`.
- [x] **Casamento de pavimento** — conferido em 06/09 e **havia defeito**: o fator de unidade era deduzido comparando a cota do pavimento com o TOPO das peças, o que nunca dá a escala; caía no fallback `1` e jogava todos os pavimentos para o térreo. Corrigido medindo o fator na matriz — ver `2026-09-05-ifc-persistir-e-importar.md`.

### O que o E2E encontrou, na primeira vez que rodou (06/09)

Um defeito de **produto** e cinco do **próprio teste** — que é o motivo de um
teste nunca executado não valer como garantia:

- **Produto**: `verifyQuantitySnapshot` comparava `totais` com `!==` sobre
  valores que são arrays, e portanto acusava divergência em todo snapshot. O
  tipo `as Record<string, number>` escondia isso do compilador. Corrigido com
  comparação por `stableStringify`.
- **Teste, 2 casos**: `toBe` (identidade) para comparar arrays — o mesmo engano
  do produto, no arquivo que deveria pegá-lo.
- **Teste, 3 casos**: assumiam uma organização **sem de-para cadastrado**. A
  organização real tem um (`AREA_PISO → 101751`, ativo), que gera uma linha em
  toda prévia. Contar o total media a configuração de quem roda, não o código;
  agora os casos isolam as linhas pelo id do próprio mapeamento, e o caso do
  "não duplica" conta relativo ao que a prévia gerou.

⚠️ E uma armadilha de ambiente: deixar `BLUEPRINT_E2E=1` num `.env.local` sem
credencial ao lado faz o Vite ligar o bloco em TODA rodada de `npm run test`, e
a suíte inteira falha por falta de senha. Está anotado no cabeçalho do teste.

### Não implementado do roadmap
- **Etapa 2**: `IfcCovering` (forro/piso/revestimento como elemento) e, do "3D útil", o **modo walk** — o clique de seleção saiu em 06/09 e os materiais por função já existiam.
- **Importação de IFC — seção T no kernel.** Medido no modelo real: 219 vigas recusadas por serem seção T (mesa + alma), que o kernel não representa. É feature de verdade — alcança modelo, desenho 2D, 3D, IFC e quantitativo —, e a primeira pergunta do plano dela é se basta T ou se aparecem L e I nos outros projetos, coisa que dá para medir antes de decidir. Ver `2026-09-05-ifc-persistir-e-importar.md`.
- **Etapa 4**: importar paredes e aberturas do IFC preservando `GlobalId` como uid (hoje só geometria estrutural entra) · importar DXF · `IfcTypeObject` + classificação SINAPI · georreferência (`IfcMapConversion`).
- **Etapas 3, 5 e 6**: inteiras.

### Dívida conhecida
- ~~`removerUnderlay` deixa objetos órfãos no storage~~ — **corrigido em 06/09**: apaga a linha e, se nenhuma outra a citar, os dois arquivos (imagem e vetor). O caminho vem do sha256 do conteúdo, então duas linhas podem apontar para um arquivo só — apagar sem essa guarda quebraria a prancha que ficou.
  Os órfãos que já existiam foram **limpos em 06/09**, com autorização explícita: 2 arquivos, 2,4 MB (duas cópias da mesma imagem, em estudos que já não existem). Bucket depois: **36 arquivos, 23 linhas, 0 órfãos e 0 linhas sem arquivo** — nenhuma prancha em uso foi tocada.
- Dois escritores em `projects.budget` (Medição Inteligente gera id aleatório) — unificar na Etapa 3.
- ~~`Building3DViewer` (Planta AI) nunca auditado~~ — **auditado em 06/09, e TINHA irmão**: o mesmo defeito de câmera (`<Canvas camera>` só vale na montagem, e "Centralizar" chamava `controls.reset()`, devolvendo o enquadramento de ANTES da mudança de cenário). Corrigido. Duas cenas com o mesmo erro fizeram a conta sair para `utils/camera3d.ts`, que agora serve as duas.
  ⚠️ **Continua sem prova de runtime**: o arquivo está sob `@ts-nocheck` e a Planta AI não tem harness. A verificação foi estrutural (escopo, ordem das declarações, `useThree` dentro do `<Canvas>`), mais suíte e build. Um harness para ela é o passo que falta — a Planta Inteligente só encontrou seus três defeitos porque tinha um.
- ⚠️ **Etapa 3 muda de escopo**: o modelo real medido (AltoQi Eberick, 1,22 MB) tem 2.132 property sets e **zero `IfcElementQuantity`**. Quantitativo de arquivo de terceiro terá de sair da malha, não do arquivo.

## Verificação

Nenhuma fase é declarada concluída com item aberto. O estado acima é atualizado
a cada commit — ver a memória "nunca declarar corrigido sem verificar".
