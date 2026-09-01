# Parede em camadas — Planta Inteligente

## Pedido original

Sessão de 2026-09-01, primeira mensagem, transcrita literalmente:

> incorporacao < planta inteligente: componente Parede: implementar edição de camadas, o usuário pode adicionar, excluir, duplicar e editar quantas camadas ele quiser e para cada camada ele pode mover a ordem e definir espessura da camada e o material da camada com cálculo automática de área e volume da cada

Decisões tomadas na mesma sessão, por pergunta feita ao usuário:

| Pergunta | Escolha do usuário |
|---|---|
| Espessura total | **Soma das camadas manda** — `thicknessMm` vira derivado |
| Material | **Vínculo ao item SINAPI / base própria** (`item_code`) |
| Desenho | **Canvas 2D + 3D + exportadores** (DXF e IFC) |
| Reuso | **Composições salvas ("tipos de parede")** |

---

## Contexto

Hoje a parede do kernel é **homogênea**: uma `thicknessMm` única
(`utils/blueprintKernel/model.ts:39`) e **nenhum material**. O volume de alvenaria
sai de `área de face líquida × espessura` numa linha só
(`utils/blueprintKernel/quantities.ts:600`), e o painel edita a espessura por um
`<select>` de quatro valores fixos
(`components/blueprint/PainelParedeSelecionada.tsx:484-497`).

Uma parede real não é isso: bloco cerâmico 140 + chapisco/reboco 25 de cada lado
são três materiais, três preços e três serviços diferentes. Sem camadas, o
quantitativo só sabe dizer "2,4 m³ de alvenaria" — que não compra bloco, não
compra argamassa e não orça revestimento. Com camadas, cada faixa vira volume e
área próprios, ligados ao item de catálogo que os precifica.

### A ressalva registrada ao usuário

O kernel é **puro por construção** — o payload canônico não pode depender de
consulta ao banco, senão o hash deixa de ser função só do desenho. O vínculo ao
SINAPI é resolvido guardando na camada **apenas `itemCode` como texto opaco** mais
a `descricao` em cache como rótulo. O kernel nunca consulta o catálogo; quem
resolve é a UI (`DatabasePickerModal`) e o de-para. É o mesmo espaço de códigos que
`blueprint_budget_mappings.item_code` já usa, e a migration daquela tabela já
documenta por que texto e não FK.

---

## Fase 1 — Kernel: o modelo (0.11.0)

### `utils/blueprintKernel/model.ts`

- [ ] Tipos novos `FuncaoCamada` e `CamadaParede`, junto de `Wall`.
      **Pronto quando**: exportados por `utils/blueprintKernel/index.ts`.
- [ ] `Wall.camadas?: CamadaParede[]`, com comentário no peso dos vizinhos
      (`alinhamento`, `cedeSobreposicao`): ordem da face **ESQUERDA para a
      DIREITA** relativa ao sentido `a → b`; ausente = homogênea.
      **Pronto quando**: `tsc --noEmit` limpo.
- [ ] `cloneModel` (`model.ts:557`) copia o array em profundidade.
      **Pronto quando**: teste prova que desfazer não vaza camada entre versões.
- [ ] Invariantes em `assertModelInvariants` (`model.ts:1226`): `EMPTY_LAYERS`,
      `BAD_LAYER_THICKNESS`, `LAYERS_THICKNESS_MISMATCH`.
      **Pronto quando**: um teste por erro, os três lançando `KernelError`.

### `utils/blueprintKernel/commands.ts`

- [ ] Comando `SetWallLayers { wallId, camadas: CamadaParede[] | null }` — um só,
      não cinco: a UI monta a lista inteira, cada gesto é um passo de desfazer.
      Recalcula `thicknessMm` = soma. `null` volta a homogênea.
      **Pronto quando**: 25+140+25 deixa `thicknessMm === 190`.
- [ ] `SetThickness` numa parede COM camadas → `THICKNESS_FROM_LAYERS`.
      **Pronto quando**: teste prova que lança.
- [ ] `MergeWalls` recusa composições diferentes (`MERGE_LAYERS_MISMATCH`) e
      **inverte a ordem das camadas** quando inverte o sentido `a → b`.
      **Pronto quando**: teste de cada um dos dois casos.

### `utils/blueprintKernel/units.ts`

- [ ] `KERNEL_VERSION = 'blueprint-kernel-ts-0.11.0'` **com entrada nova no
      changelog** (`units.ts:18-97`), explicando por que a chave é emitida só
      quando há camadas.
      **Pronto quando**: a entrada existe e cita a razão das entradas 0.6.0/0.8.0.

---

## Fase 2 — Payload canônico e round-trip

### `utils/blueprintKernel/canonical.ts`

- [ ] Serializar `camadas` (`canonical.ts:194-216`), `undefined` quando não houver.
      **Pronto quando**: o hash de um desenho homogêneo não muda.
- [ ] `assinaturaDasCamadas(w)` — função pura, exportada, usada aqui, no
      `MergeWalls` e no diff.
- [ ] Desempate por assinatura na **ordenação canônica** (`canonical.ts:163-171`).
      Sem ele, duas paredes de mesma geometria e espessura com composições
      diferentes ficam em ordem instável e o hash muda sem a geometria mudar.
      **Pronto quando**: teste com duas paredes assim produz o mesmo payload em
      duas ordens de criação diferentes.
- [ ] `CanonicalPayload.walls.camadas?` no contrato tipado (`canonical.ts:352-365`).
- [ ] `modelFromCanonicalPayload` (`canonical.ts:445-462`) — ausente não volta como
      `[]`, volta como nada.
      **Pronto quando**: round-trip `model → payload → model → payload` idêntico,
      com e sem camadas.

---

## Fase 3 — Quantitativos por camada (`quant-1.6.0`)

### `utils/blueprintKernel/quantities.ts`

- [ ] `QuantidadeCamada` e `QuantidadeParede.camadas` (`quantities.ts:139-159`).
- [ ] Cálculo no `model.walls.map` (`quantities.ts:575-603`): área de cada camada =
      área de face líquida da parede (o vão atravessa todas); volume =
      `liquidaMm2 × espessuraCamada`.
      **Pronto quando**: teste prova `Σ camadas.volumeM3 === parede.volumeM3`.
- [ ] `totais.porMaterial[]` — agrupado por `itemCode`, ordenado, determinístico.
      **Pronto quando**: duas paredes com o mesmo item viram uma linha só.
- [ ] **Bump** `POLITICA_PADRAO.version = 'quant-1.6.0'` com entrada no histórico
      (`quantities.ts:59-106`).
      **Pronto quando**: a entrada existe e explica por que acréscimo de campo
      também exige bump (precedente 1.2.0/1.3.0).
- [ ] Parede homogênea devolve `camadas: []` e `porMaterial` vazio, sem mudar
      nenhum número que já existia.

---

## Fase 4 — De-para com o orçamento

### `utils/blueprintBudget.ts`

- [ ] Escopo `'CAMADA'` (`blueprintBudget.ts:50`) e medidas `VOLUME_CAMADA` (M3) e
      `AREA_CAMADA` (M2) em `MEDIDAS`, com `medir()` lendo as camadas e `ref`
      composto `${wallId}#${indice}`.
- [ ] `gerarEntriesDeCamadas(quant, itensPorCodigo, ctx)` — a ponte direta: camada
      com `itemCode` gera linha sem mapeamento configurado.
- [ ] **Trava de unidade igual à do resto** (`dimensaoDaUnidade`,
      `blueprintBudget.ts:309`): M3 → volume, M2 → área, **M ou UN → `Divergencia`,
      linha recusada**.
      **Pronto quando**: teste com item em `M` produz divergência e nenhuma linha.
- [ ] Seção "Camadas de parede" em `services/blueprintBudgetService.ts` e
      `components/blueprint/PainelOrcamento.tsx`.

---

## Fase 5 — Desenho: canvas 2D

### `components/blueprint/BlueprintCanvas.tsx`

- [ ] Passada nova entre a silhueta e o miolo (`BlueprintCanvas.tsx:2023-2084`):
      uma pincelada por camada, `lineWidth = espessuraMm × escala`, deslocada da
      normal, com **as mesmas** `extA`/`extB` — herdar a extensão é o que faz as
      camadas acompanharem a mitragem sem tocar em `extensaoDeCanto`.
- [ ] Só quando: a parede tem camadas, `cheia >= LIMIAR_CAMADAS_PX` (12 px) e o
      toggle está ligado.
- [ ] `COR_CAMADA` por `funcao`; sem traço extra de interface.
- [ ] Toggle "Camadas" na barra, ao lado do de Medidas.
      **Pronto quando**: verificado no app de verdade — três faixas numa parede
      25+140+25, canto em L sem entalhe, zoom afastado voltando a sólido limpo.

---

## Fase 6 — Desenho: 3D e exportadores

- [ ] `components/blueprint/Blueprint3DViewer.tsx`: laço por camada em
      `geometriaDaParede` (`:66-140`) — mesmo perfil, mesmos furos, mesmos trechos;
      muda a profundidade da extrusão e o `position` (`nrm × offset`).
      ⚠️ `@ts-nocheck`: a validação é o harness `docs/spikes/blueprint-3d`.
      **Pronto quando**: o harness sai com exit 0 e as três camadas aparecem.
- [ ] `utils/blueprintDxf.ts`: layer `PAREDES_CAMADAS` em `CAMADAS` (`:48`) + cor
      (`:71-83`); linhas de interface emitidas nela. Uma layer só, não uma por
      material — `CAMADAS` é constante fechada.
- [ ] `utils/blueprintIfc.ts`: `IfcMaterialLayerSet` + `IfcMaterialLayerSetUsage` +
      `IfcRelAssociatesMaterial`. **O sólido não muda** (`:330-352`) — é assim que
      o IFC espera. `LayerSetDirection = .AXIS2.`, `OffsetFromReferenceLine =
      -thickness/2`.
      **Pronto quando**: um viewer IFC mostra as três camadas na ordem certa.
- [ ] `utils/blueprintDiff.ts`: alteração `PAREDE_CAMADAS` (`:159-169`), comparando
      pela assinatura — senão trocar 140 de bloco por 140 de concreto não aparece
      em revisão nenhuma.
- [ ] `utils/blueprintComponentes.ts:105`: rótulo `"190 mm · 3 camadas"`.

---

## Fase 7 — UI do painel

⚠️ **REGRA #1**: ler `docs/ui_ux_guia_unificado.md` inteiro ANTES de editar, e
rodar `bash scripts/check-ui-standard.sh` em cada `.tsx` tocado DEPOIS.

- [ ] `components/blueprint/PainelCamadasParede.tsx` (novo — o painel da parede já
      tem 542 linhas). Lista reordenável com `@dnd-kit`, alça de arraste dedicada e
      botões ↑/↓ como alternativa acessível, copiando `components/BudgetRow.tsx:145`.
- [ ] Por camada: espessura via `CampoMedida` (**reusar** o exportado de
      `PainelParedeSelecionada.tsx:50`), seletor de `funcao`, item pelo
      `DatabasePickerModal`, e área/volume calculados ao vivo.
- [ ] Ações por linha com `ActionIconButton` (`duplicate`, `delete`); exclusão por
      `useConfirm()`, nunca `window.confirm`.
- [ ] Rodapé com a espessura total derivada, **só leitura**.
- [ ] "Converter em parede com camadas" / "Voltar a homogênea".
- [ ] `PainelParedeSelecionada.tsx:484-497`: o `<select>` de espessura só aparece
      sem camadas.
- [ ] `BlueprintEditor.tsx`: `mudarCamadas` espelhando `mudarEspessura` (`:1130`) —
      lote `SetWallLayers` + `TranslateEntities{manterJuncoes:true}`. Sem o
      `manterJuncoes` o anel abre e o ambiente some.
- [ ] `PainelQuantitativos` (`:4297-4520`) ganha a tabela "Por material".

---

## Fase 8 — Composições salvas ("tipos de parede")

- [ ] Migration `supabase/migrations/aplicar_20270901000001_blueprint_wall_types.sql`,
      espelhando `aplicar_20270905000005_blueprint_budget_mappings.sql`: bloco por
      bloco, `SET lock_timeout`, RLS por `is_org_member`, **sem** política `anon`.
      ⚠️ **NUNCA `supabase db push`** — aplicar com `db query --linked -f`.
      **Pronto quando**: `information_schema.columns` confirma a tabela, conferida
      de fora do app.
- [ ] `services/blueprintWallTypeService.ts` — **REGRA #5**:
      `organizationId?: string | null`, `.eq()` só se houver; nada de
      `if (!organizationId) return` nem `organizations[0]`; `select` estreito.
- [ ] UI no painel: "Aplicar tipo…" e "Salvar como tipo…", `useOrgContext()` para o
      `orgId` e `useOrgWriteTarget()`/`forEachTargetOrg` na escrita.
      **Pronto quando**: um tipo salvo numa organização não aparece em outra.

---

## Estado (01/09/2026)

Fases 1–8 implementadas. `npm run ci` verde: typecheck + **2217 testes** + build.

Verificado de verdade, não só mecanicamente:

| O quê | Como | Resultado |
|---|---|---|
| Payload canônico não mudou em parede homogênea | Protocolo do `blueprintKernelGoldens.test.ts`: string de versão revertida a 0.10.0, os 7 testes voltaram a passar byte a byte | ✅ a mudança de hash é só a versão |
| O desempate por composição tem dentes | Removido o `localeCompare` da ordenação → o teste falha | ✅ |
| Σ camadas = volume da parede | `blueprintCamadas.test.ts` | ✅ 22 testes |
| Canvas 2D — faixas, canto, limiar de zoom | `docs/spikes/wall-render/camadas.mjs` (BlueprintCanvas REAL), 4 prints | ✅ |
| 3D — empilhamento consistente entre paredes | `docs/spikes/blueprint-3d` cena `?cena=camadas`, composição assimétrica 10/140/40 | ✅ sem erro de console |
| Painel — as 6 ações do pedido | `__tests__/components/PainelCamadasParede.test.tsx` | ✅ 12 testes |
| Migration aplicada | `db query --linked`, de fora do app | ✅ `tabela=1 com_rls=1 policies=4 anon_grants=0 fk_auth_users=0` |

### O defeito que só a largura real revelou (corrigido)

Rodado no app de verdade em 01/09/2026 (skill `rodar-app`, planta
"Planta 23/08/2026", 33 paredes). `<main>` mede **1340 px**, e o painel da
parede ~270 px.

**A linha da camada estourava o painel.** Numa linha única — alça, cor, função,
espessura, duplicar, excluir — o campo de ESPESSURA era empurrado para fora da
borda: sobrava um "mm" cortado, e a medida mais editada da tela ficava
inalcançável. O botão de material virava "Escolher ma…".

Nenhum harness pegou: harness não tem sidebar, e a memória
`feedback_harness_sem_sidebar_mente_sobre_largura` já registrava exatamente
isso. Os 12 testes de componente também não pegam — jsdom não faz layout.

Corrigido em `PainelCamadasParede.tsx`: a linha virou **três faixas** —
(1) alça + cor + função + mover/duplicar/excluir, (2) espessura editável +
volume/área, (3) material em largura inteira. Reconferido no app.

Roteiro do app guardado em `c:/tmp/pwtest/camadas-fluxo.cjs` (fora do repo — usa
senha por env). Ele desfaz tudo com Ctrl+Z no fim e confere a volta.

⚠️ **Duas checagens do roteiro nasceram erradas e acusaram falha inexistente** —
registrado porque é o modo de falha que engana:
- "seletor de espessura ainda na tela" casava com o seletor da BARRA DE
  FERRAMENTAS (a espessura do desenho, que fica por projeto). Trocado por
  contagem direta dos `<select>` de 100/150/200/250: 2 com parede homogênea,
  1 com composição.
- "ainda com composição" depois do desfazer: o desfazer limpa a SELEÇÃO, o
  painel some junto, e procurar o texto dele acusava erro numa parede correta.
  Trocado pelo rótulo da lista de Componentes, que não depende de seleção.

### Efeito colateral do teste no app (aceito)

A planta usada saiu de "Sem alterações" para "Rascunho salvo": o autosave
regravou o `draft_payload`. O CONTEÚDO voltou ao original (Desfazer ficou
desabilitado, `Parede 5` voltou a "15 cm de espessura" sem sufixo de camadas,
33 paredes · 6 ambientes inalterados) e o **snapshot publicado nunca foi
tocado** — publicar é ação explícita e não foi feita.

### Pendente de verificação

- [ ] **IFC aberto num viewer externo** (Revit/ArchiCAD/BIMvision) confirmando o
      `IfcMaterialLayerSet` com as camadas na ordem certa. O código emite a
      estrutura correta, mas nenhum teste daqui lê IFC.

### Desvio consciente do plano aprovado

O plano previa acrescentar `VOLUME_CAMADA` e `AREA_CAMADA` ao catálogo `MEDIDAS`
de `blueprintBudget.ts`, para o de-para. **Não foi feito, e de propósito.**

Um mapeamento aponta UMA medida para UM item. "Volume de camada → item X"
somaria bloco, reboco e isolamento de todas as paredes num item só, e sairia uma
linha com número plausível e errado — exatamente o desfecho que a trava de
unidade daquele arquivo existe para impedir. A necessidade é atendida inteira
pela ponte direta `gerarLancamentosDeCamadas`, onde é o `itemCode` da PRÓPRIA
camada que decide o item, e a unidade dele decide se vai volume (m³) ou área de
face (m²). Registrado no código, no cabeçalho da função.

### Artefato a mais, não previsto no plano

Duas cenas de harness (`?cena=camadas` no 3D, `?camadas=1` no wall-render) e o
runner `camadas.mjs`. Não estavam no plano; entraram porque a alternativa era
afirmar "o desenho está certo" sem ter visto — e a direção do empilhamento no 3D
é justamente o tipo de sinal trocado que só um print com composição assimétrica
denuncia.

---

## Verificação

```bash
npx vitest run __tests__/blueprintCamadas.test.ts          # arquivo novo
npx vitest run __tests__/blueprintKernel.test.ts __tests__/blueprintKernelGoldens.test.ts
npx vitest run __tests__/blueprintQuantities.test.ts __tests__/blueprintBudget.test.ts
npx vitest run __tests__/orgContextGuard.test.ts __tests__/migrationsPrefixo.test.ts
npm run ci                                                  # typecheck + suíte + build
bash scripts/check-ui-standard.sh <cada .tsx tocado>
```

Depois, **no app de verdade** (skill `rodar-app`): desenhar um retângulo, converter
uma parede em 25+140+25, e conferir na tela as três faixas no 2D, o canto em L, o
zoom afastado, as três camadas no 3D e área/volume batendo com a conta à mão.

⚠️ O harness `docs/spikes/blueprint-3d` pode já estar quebrado antes de qualquer
mudança: rodar **primeiro**, na árvore limpa, para saber de onde se parte.

---

## Ordem

Fases 1 → 2 → 3 são a espinha e nada roda sem elas. Da 4 em diante dá para
paralelizar; a 8 é independente das 5–7. Deploy só depois da fase 7.

⚠️ Ao começar (2026-09-01) a árvore já estava suja de **outra frente** (fiscal,
contratos, dívidas, partner — 9 arquivos modificados + `FiscalAnalytics.tsx` novo).
Não são desta tarefa e não devem ser tocados nem commitados aqui.
