# PLANO — Integração Áreas NBR 12721 × Empreendimentos (Comercial)

> Status: **PRD / aguardando implementação**
> Autor: avaliação técnica 2026-07-02
> Módulos envolvidos: `AreaEngineModule` (motor de áreas) ↔ `EmpreendimentoModule` (incorporação/comercial)

## 1. Objetivo

Permitir que um projeto de cálculo de áreas NBR 12721 seja **gerado a partir de um Empreendimento** já cadastrado, reaproveitando toda a topologia (torres, pavimentos, unidades, áreas comuns) e as áreas privativas, sem redigitar. O cálculo normativo fino (coeficientes de equivalência, coberturas, vagas autônomas, classe de divisão de comuns) permanece como enriquecimento técnico dentro do motor de áreas.

## 2. O que já existe (fundação)

- `area_projects.empreendimento_id UUID REFERENCES public.empreendimentos(id) ON DELETE SET NULL`
  (migration `20261231000000_area_engine_nbr12721_mvp.sql:179`) — **a FK já existe, mas `areaEngineService.createProject` não a preenche**.
- Versionamento/revisão do motor (`createRevisionFromVersion`) já implementado → cada import pode gerar nova versão sem destruir cálculo travado.
- Validações bloqueantes do motor (`MOTOR_007` coef ausente, `MOTOR_012` comum sem divisão) → servem de **checklist automático** do que falta revisar após o import.

## 3. Inputs exigidos pelo motor (por versão)

| Nível | Tabela | Campos-chave |
|---|---|---|
| Projeto | `area_projects` | name, project_type, endereço, registry_number, responsável técnico |
| Bloco | `area_version_blocks` | code, name, sort_order |
| Pavimento | `area_version_floors` | code, name, `floor_type`, sort_order |
| Unidade | `area_version_units` | code, `unit_type`, typology, is_autonomous, bloco/pavimento |
| Espaço | `area_version_spaces` | use_class, private_nature, **coverage_class**, **common_division_class**, ownership_accounting_mode, **real_area_m2_raw por ambiente**, **coefficient_value** |
| Acessório | `area_version_unit_accessory_links` | vaga/depósito → unidade principal |
| Rateio comum | `area_version_common_distribution_scopes` / `_common_allocations` | escopo global/bloco, alocação não-proporcional |

## 4. Mapeamento com Empreendimentos

### 4.1 ✅ Encontrados (mapa direto)

| Input do motor | Origem (`types/empreendimento.ts`) | Regra |
|---|---|---|
| `area_project.name` | `Empreendimento.name` | direto |
| `area_project.project_type` | `Empreendimento.tipo` | enum → §4.3 |
| endereço/cidade/estado | `endereco_street/city/state` | direto |
| `registry_number` | `Empreendimento.matricula` | direto |
| responsável técnico (texto) | `responsavel_tecnico` + `crea_cau` | ⚠️ motor tem `technical_responsible_id` UUID; guardar texto em `notes`/`metadata` |
| Bloco | `EmpreendimentoTower` (name, sort_order) | 1 torre → 1 bloco |
| Pavimento | `EmpreendimentoFloor` (name, tipo, floor_number) | enum → §4.3; usar `repeat_count`/`prefix` p/ materializar réplicas |
| Unidade | `EmpreendimentoUnit` (name, typology, floor_id) | unit_type default `apartment`; typology_code←typology |
| Área privativa (agregada) | `EmpreendimentoUnit.private_area` | vira 1 espaço "área privativa principal" |
| Áreas comuns (espaços) | `EmpreendimentoCommonArea` (name, category, area) | 1 → 1 espaço comum |
| Escopo de rateio | `EmpreendimentoCommonArea.tower_id` | null→`global`; preenchido→`block` |
| Nº de vagas (contagem) | `EmpreendimentoUnit.parking_spaces` | informativo (ver lacuna §4.2.5) |

### 4.2 ❌ Não encontrados (defaults no import + revisão obrigatória no motor)

1. **`coverage_class`** (coberta padrão / coberta diferente / descoberta) → default `covered_standard`.
2. **`coefficient_value`** (equivalência: varanda 0,75, descoberto, garagem) → default `1`.
3. **`common_division_class`** (proporcional × não-proporcional) → default `proportional` (heurística opcional por `category`: GARAGEM/TECNICA → sugerir `non_proportional`).
4. **Decomposição da unidade em ambientes** → import cria só 1 espaço agregado = `private_area`. Varandas/coberturas ficam para desdobramento manual.
5. **Vaga/depósito como unidade autônoma ou espaço vinculado** → `parking_spaces` é só número; **não** gerar automaticamente. Deixar para o editor decidir (vaga autônoma × vinculada).
6. **`ownership_accounting_mode` / `is_autonomous`** → default `direct_unit` / autônoma.
7. **⚠️ Dupla contagem** — `Unit.total_area = private_area + common_area`. O motor **rateia a comum sozinho**; o import deve usar **apenas `private_area`** e **ignorar `common_area`/`total_area`** da unidade.

### 4.3 Mapas de enum

**`Empreendimento.tipo` → `area_project_type`**
`VERTICAL→vertical` · `HORIZONTAL→horizontal` · `MISTO→mixed` · `COND_LOGISTICO/COND_INDUSTRIAL→commercial`

**`FloorTipo` → `area_floor_type`**
`SUBSOLO→basement` · `TERREO→ground` · `TIPO→type` · `COBERTURA→roof` · `TECNICO→technical` · `MEZANINO/GARAGEM/OUTRO→other`

**`CommonAreaCategory`** → todos `use_class=common`; sugestão de `common_division_class`:
`LAZER/COMUM/CIRCULACAO→proportional` · `TECNICA/GARAGEM→non_proportional (sugerido)` · `OUTRO→proportional`

## 5. Arquitetura da solução (2 camadas)

### Camada A — Importador automático do esqueleto
`areaEngineService.importFromEmpreendimento(empreendimentoId, opts)`:
1. Carrega empreendimento + towers + floors + units + common_areas (via `empreendimentoService`).
2. Cria `area_project` **preenchendo `empreendimento_id`** + `area_version` v1 `draft`.
3. Materializa: torres→blocos, floors→pavimentos (enum + réplicas por `repeat_count`), units→unidades, e **1 espaço privativo principal por unidade** (`private_area`, coverage padrão, coef 1, `direct_unit`).
4. common_areas→espaços comuns `proportional` + `distribution_scope` (global/bloco por `tower_id`).
5. **Ignora `common_area`/`total_area`** da unidade (evita dupla contagem — §4.2.7).
6. Reexecução → **nova versão** (usa versionamento existente), nunca sobrescreve versão calculada/travada.
7. Idempotência: se o empreendimento já tem `area_project` vinculado, oferecer "criar nova versão" em vez de novo projeto.

### Camada B — Enriquecimento no editor de Áreas (já existe, sem código novo)
- Marcar `coverage_class` + `coefficient_value` de varandas/descobertos (lacunas 1–2).
- Reclassificar comuns proporcional × não-proporcional (lacuna 3).
- Desdobrar `private_area` em ambientes (lacuna 4).
- Gerar unidades acessórias + `accessory_links` a partir de `parking_spaces` (lacuna 5).
- A validação do motor lista automaticamente o que ainda falta.

## 6. Fases de implementação

- **F1 — Import básico** ✅ **IMPLEMENTADO (2026-07-02)**: `areaEngineService.importFromEmpreendimento(empreendimentoId, organizationId)` — preenche `empreendimento_id`, cria projeto + versão v1 `draft`, materializa torres→blocos, andares distintos das unidades→pavimentos, unidades→unidades e 1 espaço privativo por unidade (`private_area`, coverage padrão, coef 1). Áreas comuns→espaços proporcionais global/bloco + `distribution_scope`. Ignora `common_area`/`total_area` (dupla contagem) e vagas. Mapas de enum (`mapEmpreendimentoTipo`/`mapFloorTipo`) no próprio serviço. Botão "Importar de Empreendimento" + painel de seleção + banner de resultado no `AreaEngineModule`. Retorna `AreaImportReport` (contagens + warnings). `source_type='api'`, `source_reference=empreendimento_unit:<id>`. Deixa em `draft` p/ enriquecimento (Camada B) antes de calcular.
- **F2 — Materialização de réplicas** ✅ **IMPLEMENTADO (2026-07-02)**: import agora usa os templates `empreendimento_floors` como fonte dos pavimentos, expandindo `repeat_count` (floorNum = `floor_number + rep`), com `floor_type` do template e nome via `name`/número. **Inclui andares sem unidade** (garagem/técnico) — necessários no Quadro I por pavimento, que a F1 perdia. Fallback: se a torre não tem template de pavimentos, deriva dos andares distintos das unidades (+warning de que Quadro I fica incompleto). Áreas comuns com torre+`floor` identificável recebem `floor_id` (melhora o Quadro I). Unidades continuam mapeadas por `unit.floor` absoluto (que `generateUnitsFromFloors` já define por réplica).
- **F3 — Re-sync / drift** ✅ **IMPLEMENTADO (2026-07-02)**: `importFromEmpreendimento` detecta projeto já vinculado (`getProjectByEmpreendimento`); se existe, cria **nova versão** (rebuild do estado atual, `source_version_id`=anterior) em vez de duplicar o projeto, e atualiza os dados-mestres do projeto. `computeAreaDrift(prev, next)` compara por código de unidade / área privativa / nome de bloco → `AreaResyncDrift` (unidades +/−, áreas alteradas, blocos +/−). A versão anterior nunca é mutada (baseline). UI: banner mostra "Re-sincronização v{n}" + lista de mudanças; `AreaImportReport` ganhou `isNewProject/versionNumber/previousVersionId/drift`.
- **F4 — Write-back** ✅ **IMPLEMENTADO (2026-07-03)**: `areaEngineService.writeBackFractionsToEmpreendimento(versionId)` grava fração ideal (decimal + milésimos, Quadro IV-B) e área real total (`qivb_f_real_total_area_raw`) de volta em `EmpreendimentoUnit`. Migration `20261231000013_area_engine_empreendimento_writeback.sql`: (a) `area_version_units.source_empreendimento_unit_id` — rastreabilidade unidade-do-motor → unidade-de-origem, preenchida no import (F1); (b) `empreendimento_units` ganha `fracao_ideal_decimal`, `fracao_ideal_thousandths`, `area_real_total_m2`, `area_engine_version_id`, `area_engine_synced_at` — campos só-leitura para o Comercial, alimentados exclusivamente pelo motor. Guarda: bloqueia em `draft`/`superseded`/`cancelled` (exige ao menos `calculated`). Unidades sem proveniência (criadas manualmente no editor, fora de import) são contadas e ignoradas — nunca inferidas. Botão "Fração ideal → Empreendimento" no `AreaEngineModule` + banner de resultado. **Precisa `supabase db push`** para a migration `20261231000013`.

## 7. Decisões travadas (2026-07-02)

- **Dupla contagem** — ✅ CONFIRMADO: `EmpreendimentoUnit.private_area` é privativa pura; a comum vive em campo separado (`common_area`). Import usa **só `private_area`** e **ignora `common_area`/`total_area`**.
- **Vagas** — ✅ DECIDIDO: import **não gera** vagas a partir de `parking_spaces`. Fica para o editor de Áreas (Camada B).
- **Nível do projeto** — ✅ DECIDIDO: `area_project` no nível do **empreendimento inteiro** (multi-torre), não por obra/torre. Correto para o Quadro NBR.

Riscos residuais menores:
- **Responsável técnico** — descasamento texto×UUID; no MVP guardar texto em `metadata`/`notes`.
- **Migrations do motor aplicadas no remoto** — pré-requisito; confirmar antes de expor o botão.

## 8. Estimativa de cobertura

Camada A resolve **~70%** (topologia completa + áreas privativas agregadas → já produz Quadro II/IV-B básico e frações ideais). Os ~30% restantes (coeficientes, coberturas, vagas) são **decisão técnica que a NBR exige de humano** — não devem ser inferidos no import. Enriquecer o *cadastro* de Empreendimentos com esses campos seria over-engineering; mantê-los no domínio do motor.
