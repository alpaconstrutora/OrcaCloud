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

| Etapa | Escopo | ~dias |
|---|---|---|
| **1 (esta)** | uid estável por elemento · `blueprint_objects.element_uid` · diff por uid · IFC com `IfcOpeningElement/IfcDoor/IfcWindow`, `Pset_*`, `Qto_*`, GUID por uid | 8–10 |
| 2 | Telhado (`IfcRoof`), escada/rampa, forro/piso/revestimento (`IfcCovering`), tipos de esquadria, vista de corte, 3D com seleção e materiais | ~22 |
| 3 | 5D custo por elemento + reconciliação com orçamento aprovado · 4D vínculo elemento↔tarefa (Objeto Digital) + simulação no 3D · outbox RF-128 · ponte com ferragem | ~19 |
| 4 | Viewer IFC no app (web-ifc) · **importar IFC** e DXF · `IfcTypeObject` + classificação · georreferência | ~25 |
| 5 | Comentários ancorados em elemento + BCF · aprovação · publicar no GED e Portal | ~14 |
| 6 | MEP como grafo de trechos + conectores · absorver `electrical_*` no kernel · clash | ~25 |

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

- Fases 0–7: **feitas** (commits `ba6ed4f`, `f63007d`, `b91dc4d`, `a50aaf8`, `13ac7d5`, `238b88f` na branch `feat/planta-identidade-ifc`, pasta `C:/D/frentes/planta-identidade-ifc`).
- Fase 8: **5 de 8** — faltam os três itens que dependem de credencial/visualizador (acima).
- **Não publicada** (`git push origin HEAD:main` é o deploy — REGRA #8): fica a cargo do usuário depois dos três itens pendentes, ou por decisão explícita de publicar antes deles.

## Verificação

Ver Fase 8 e a tabela de riscos no plano de trabalho. Nenhuma fase será declarada
concluída com item aberto; o estado acima é atualizado a cada commit.
