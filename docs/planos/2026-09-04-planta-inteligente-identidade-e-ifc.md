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

### Fase 4 — IFC: aberturas
- [ ] `utils/blueprintIfc.ts` — `IfcOpeningElement` + `IfcRelVoidsElement` por
  abertura; `IfcDoor`/`IfcWindow` + `IfcRelFillsElement` (passage = só vão);
  `OperationType` pela convenção do canvas. Pronto: testes por conteúdo (1 vão + 1
  rel por abertura; contagem de atributos; 8 combinações de operação).

### Fase 5 — IFC: identidade, Psets, quantidades, cobertura
- [ ] `utils/blueprintIfc.ts` — `ifcGuidDeUid`; `Pset_*` só com o que o modelo sabe;
  `Pset_OpuraPlanta`; `Qto_*` de um único `computeQuantities`; `COBERTURA_IFC` nova
  (corrige o item "não contém materiais"). Pronto: GUID igual entre revisões para a
  parede que não mudou; `^[0-3]`; `IFCQUANTITYLENGTH` = `wallLength` em mm; nenhum
  Pset vazio.
- [ ] `utils/blueprintExport.ts`, `services/blueprintExportService.ts`,
  `components/blueprint/PainelVersoes.tsx` — repassam `studyId`; texto da UI.

### Fase 6 — Round-trip (time-box 0,5 d)
- [ ] `package.json` (+`web-ifc@0.0.57` dev) e `__tests__/blueprintIfcRoundTrip.test.ts`.
  Pronto: abre o STEP e conta `IFCDOOR`, ou `skip` com motivo declarado.

### Fase 7 — UI
- [ ] `components/blueprint/PainelParedeSelecionada.tsx`,
  `PainelEstruturaSelecionada.tsx` — linha "Identificador" copiável.
- [ ] `docs/ui_ux_guia_unificado.md` — seção "Identificador técnico só-leitura".
  Pronto: `check-ui-standard.sh` nos `.tsx` tocados; teste de componente com clipboard
  mockado.

### Fase 8 — Verificação ponta a ponta
- [ ] `npm run typecheck` · `npx vitest run __tests__/blueprint*` · migration aplicada
  · E2E · app real (2 revisões, diff "movida", IFC nos dois) · IFC aberto em
  visualizador com portas/janelas/Psets/Qto e GUID estável.

## Estado

- Fase 0 (este plano): feito.
- Fases 1–8: pendentes.

## Verificação

Ver Fase 8 e a tabela de riscos no plano de trabalho. Nenhuma fase será declarada
concluída com item aberto; o estado acima é atualizado a cada commit.
