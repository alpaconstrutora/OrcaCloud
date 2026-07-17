# Mapa de Correspondência — Empreendimento × Planta IA × Viabilidade (Imovib)

> **Objetivo:** o módulo Empreendimento deve possuir **todos** os dados de estrutura e
> arquitetura. Este documento mapeia campo a campo os três módulos e mede a distância
> até 100% de correspondência.
>
> **Data:** 2026-07-16 · **Schema conferido contra o banco REMOTO**, não contra o repo.

---

## Método (e sua limitação)

O histórico de `schema_migrations` deste projeto é furado (migrations aplicadas via SQL
direto). Então o schema foi sondado direto no banco via PostgREST: `select=<coluna>` é
validado no parse **antes** do RLS, então coluna inexistente retorna `42703` mesmo com
`anon` sem acesso aos dados. Um canário (`__nao_existe__`) confirmou que a sonda
distingue de fato ausência de coluna.

**Resultado:** todo campo declarado em `types/empreendimento.ts`, `types/plantaAi.ts` e
`types/imovib.ts` **existe no banco**. Não há drift repo→banco nestes três módulos.

> ⚠️ **Limitação:** a sonda prova que "toda coluna do types existe no banco". Não prova o
> inverso (colunas no banco que o types desconhece) — isso exigiria `information_schema`,
> inacessível pela anon key.

---

## Inventário

| Módulo | Tabela | Colunas | Papel |
|---|---|---:|---|
| **Empreendimento** | `empreendimentos` | 45 | Hub: identidade, SPE, endereço, terreno, comercial |
| | `empreendimento_towers` | 13 | Torre (= obra) |
| | `empreendimento_floors` | 11 | Pavimento (gerador de unidades) |
| | `empreendimento_units` | 31 | Unidade real |
| | `empreendimento_common_areas` | 12 | Área comum |
| **Planta IA** | `plant_studies` | 13 | Estudo de arquitetura |
| | `plant_terrains` | 11 | Terreno (geometria) |
| | `plant_urban_rulesets` | 22 | **Parâmetros urbanísticos** |
| | `plant_briefings` | 14 | Programa/produto desejado |
| | `plant_scenarios` | 30 | Cenário = 1 prédio simulado |
| | `plant_floors` | 9 | Pavimento materializado |
| | `plant_units` | 13 | Unidade materializada |
| **Viabilidade** | `imovib_studies` | 41+ | Estudo econômico |
| | `imovib_blocks` | 5 | Bloco (= torre) |
| | `imovib_units` | 8 | Tipologia |
| | `imovib_unit_instances` | 11 | Unidade do espelho |

---

## Matriz por domínio

Legenda: ✅ existe e sincroniza · ⚠️ existe dos dois lados, **sem sync** · ❌ não existe no destino · — não se aplica

### A. Identidade / SPE / responsáveis

| Dado | Empreendimento | Viabilidade | Planta IA | Correspondência |
|---|---|---|---|---|
| Nome | `name` | `name` | `name` | ⚠️ sem sync |
| CNPJ da SPE | `spe_cnpj` | `spe_cnpj`, `cnpj` | ❌ | ⚠️ sem sync |
| Razão social / fantasia | `spe_razao_social`, `spe_nome_fantasia` | ❌ | ❌ | ❌ só no Emp |
| Incorporadora | `developer_name` | `developer_name`, `developer` | ❌ | ⚠️ sem sync |
| Gestor | `manager` | `manager`, `project_manager` | `responsible_user_id` | ⚠️ sem sync |
| Construtora | `construtora` | ❌ | ❌ | ❌ só no Emp |
| Resp. técnico / CREA-CAU | `responsavel_tecnico`, `crea_cau` | ❌ | ❌ | ❌ só no Emp |
| Matrícula / processo | `matricula`, `numero_processo` | ❌ | ❌ | ❌ só no Emp |

**Zero sync neste domínio inteiro.** `spe_cnpj`, `developer_name` e `manager` têm nome
idêntico dos dois lados e mesmo assim são digitados duas vezes.

### B. Localização

| Dado | Empreendimento | Viabilidade | Planta IA | Correspondência |
|---|---|---|---|---|
| Endereço de divulgação | `endereco_*` (7 campos) | ❌ | ❌ | ❌ só no Emp |
| Cidade / estado | `endereco_city/state`, `terreno_city/state` | `location_macro` (string única) | `city`, `state` | ⚠️ formatos incompatíveis |
| Bairro | `endereco_neighborhood` | `location_micro` | `neighborhood` | ⚠️ sem sync |

> `location_macro` do Imovib é `"Cidade - UF"` concatenado. `plantaAiIntegration.ts:289-290`
> faz `city: imovib.location_macro, state: imovib.location_macro` — o **mesmo valor nos dois
> campos**, com o comentário "Simplificação". É perda de dado já hoje, entre Planta e Imovib.

### C. Terreno

| Dado | Empreendimento | Viabilidade | Planta IA | Correspondência |
|---|---|---|---|---|
| Área | `terreno_area` | `terreno_area` | `area` | ⚠️ Emp sem sync · Planta↔Imovib ✅ |
| Frente | `terreno_frente` | `terreno_frente`, `land_frontage` | `frontage` | ⚠️ Emp sem sync |
| Fundos / profundidade | `terreno_fundos` | `terreno_fundos` | `depth` | ⚠️ Emp sem sync |
| Laterais | `terreno_lateral_direita/esquerda` | idem | ❌ | ⚠️ sem sync |
| Esquina | ❌ | ❌ | `is_corner` | ❌ morre no Planta |
| Topografia | ❌ | ❌ | `slope_type` | ❌ morre no Planta |
| Tipo de terreno | ❌ | ❌ | `terrain_type` | ❌ morre no Planta |
| Polígono (geo) | ❌ | ❌ | `polygon_geometry` | ❌ morre no Planta |
| Orientação da frente | ❌ | ❌ | `frontage_orientation` | ❌ morre no Planta |
| Endereço do terreno | `terreno_*` (7 campos) | ❌ | `address` | ⚠️ sem sync |

**As 5 medidas de terreno do Empreendimento têm nome idêntico às do Imovib e nenhum sync
as preenche.** `empreendimentoService.syncFromStudy` só escreve torres/unidades/áreas
comuns — nunca toca a linha do empreendimento.

### D. Parâmetros urbanísticos ⛔

| Dado | Empreendimento | Viabilidade | Planta IA |
|---|---|---|---|
| Zona | ❌ | `zoning`, `zoning_info` + `imovib_regulatory_zones.zona` | `zone_name` |
| CA básico / máximo | ❌ | `ca_basic`, `ca_max` | `floor_area_ratio_basic/max` |
| Taxa de ocupação | ❌ | `occupancy_rate`, `occupancy_rate_max` | `occupancy_rate` |
| Permeabilidade | ❌ | `taxa_permeabilidade_minima` | `permeability_rate` |
| Recuos (4) | ❌ | ❌ | `front/left/right/rear_setback` |
| Gabarito | ❌ | `gabarito_altura_maxima` | `max_floors`, `max_height` |
| Vagas exigidas | ❌ | ❌ | `parking_rule_type`, `parking_spaces_per_unit` |
| Área mín. de unidade | ❌ | ❌ | `min_unit_area` |
| Lei / fonte / confiança | ❌ | ❌ | `law_reference`, `source_document`, `confidence_level` |
| Uso permitido | ❌ | `zoning_info` | `allowed_use` |

**O Empreendimento tem ZERO colunas de parâmetro urbanístico.** A aba "Mapa Regulatório"
não é dado do empreendimento: é `<ImovibRegulatoryMapTab studyId={e.imovib_study_id} />`
([EmpreendimentoDetail.tsx:295](components/empreendimento/EmpreendimentoDetail.tsx#L295))
— uma **janela** para o estudo. Sem estudo vinculado, a aba mostra empty state. O mesmo
vale para "Bloco e Tipologia" (`ImovibBlocksTypologyTab`).

> Isto é o coração do pedido: hoje o Empreendimento **não possui** os dados de
> arquitetura/regulatórios — ele os *empresta* do Imovib em tempo de render.
> As 22 colunas de `plant_urban_rulesets` (as mais ricas dos três) não chegam nem ao
> Imovib, quanto mais ao Empreendimento.

### E. Briefing / produto

| Dado | Empreendimento | Viabilidade | Planta IA |
|---|---|---|---|
| Tipo | `tipo` (5 valores) | `segment`, `sub_classification`, `development_modality` | `development_type` |
| Padrão | ❌ | ❌ | `product_standard` |
| Objetivo | ❌ | ❌ | `main_objective` |
| Tipologias alvo | ❌ | ❌ | `allowed_typologies` |
| Áreas alvo | ❌ | ❌ | `target_unit_area_min/max` |
| Elevador / varanda / suíte | ❌ | ❌ | `has_elevator/balcony/suite` |
| Público-alvo | ❌ | `target_audience` | ❌ |

### F. Torre / Bloco / Cenário

| Dado | Empreendimento | Viabilidade | Planta IA | Correspondência |
|---|---|---|---|---|
| Nome | `towers.name` | `blocks.name` | `scenarios.name` | ✅ Imovib · local no Planta (proposital) |
| Nº de pavimentos | `floors_count` | ❌ | `floors_count` | ⚠️ **Imovib não tem** |
| Unid. por pavimento | `units_per_floor` | ❌ | `units_per_floor` | ⚠️ **Imovib não tem** |
| Custo/m² | `construction_cost_sqm` | `construction_cost_sqm` | derivado de `estimated_cost` | ✅ |
| Venda/m² | `sales_price_sqm` | `sales_price_sqm` | derivado de `estimated_vgv` | ✅ |
| Obra vinculada | `project_id` | ❌ | ❌ | ❌ só no Emp |
| Áreas totais | ❌ | ❌ | `total_built/private/common/sellable_area` | ⚠️ só write-back |
| Vagas totais | ❌ | ❌ | `total_parking_spaces` | ❌ |
| Eficiência / CA usado | ❌ | `efficiency_percent` | `efficiency_ratio`, `occupancy_used`, `floor_area_ratio_used` | ❌ |
| Scores (6) | ❌ | `location_score` | `urban/architectural/commercial/economic/construction/general_score` | — não deve corresponder |

**Torre sincronizada do Imovib nasce sem `floors_count`/`units_per_floor`** — as colunas
existem no Empreendimento, mas `imovib_blocks` só tem 5 colunas e não as possui.

### G. Pavimentos

| Dado | Empreendimento | Viabilidade | Planta IA | Correspondência |
|---|---|---|---|---|
| Tabela | `empreendimento_floors` (11) | ❌ (só `units.pavimentos`) | `plant_floors` (9) | ⚠️ **sem sync nenhum** |
| Número | `floor_number` | — | `floor_number` | ⚠️ |
| Tipo | `tipo` (8 valores) | — | `floor_type` | ⚠️ |
| Áreas | ❌ | — | `gross_area`, `private_area`, `common_area`, `circulation_area` | ❌ |
| Geometria | ❌ | — | `geometry_json` | ❌ |
| Repetição / prefixo | `repeat_count`, `prefix` | — | ❌ | ❌ |

**Nenhuma das duas arestas cria `empreendimento_floors`.** O sync Planta→Emp lê
`plant_floors` só para extrair `_floor_number` e gravá-lo em `units.floor` — o resto da
tabela (4 áreas + geometria) é descartado. `empreendimento_units.floor_tipo` existe e
`plant_floors.floor_type` existe, e mesmo assim não são ligados.

### H. Unidade ⭐ (o domínio mais crítico)

| Dado | Empreendimento | Viabilidade (`instances`) | Planta IA (`plant_units`) | Correspondência |
|---|---|---|---|---|
| Nome / código | `name` | `name` | `unit_code` | ✅ ambos |
| Pavimento | `floor` | `floor` | via `plant_floors` | ✅ ambos |
| Tipologia | `typology` | via `imovib_units.name` | `unit_type` | ✅ ambos |
| Área privativa | `private_area` | `private_area` | `private_area` | ✅ ambos |
| Área comum | `common_area` | ❌ (vem da tipologia) | derivada de `gross_area` | ✅ ambos |
| Área total | `total_area` | ❌ | calculada | ✅ ambos |
| **Dormitórios** | `bedrooms` | ❌ **não existe** | `bedrooms` | ⚠️ **só via Planta** |
| **Banheiros** | `bathrooms` | ❌ **não existe** | `bathrooms` | ⚠️ **só via Planta** |
| **Vagas** | `parking_spaces` | ❌ **não existe** | `parking_spaces` | ⚠️ **só via Planta** |
| **Suítes** | ❌ **não existe** | ❌ | `suites` | ❌ **morre no Planta** |
| Varanda | ❌ | ❌ | `has_balcony`, `has_suite` | ❌ morre no Planta |
| **Posição** | `position_type` | `position_type` | ❌ **não existe** | ⚠️ **só via Imovib** |
| **Orientação solar** | `sun_orientation` | `sun_orientation` | ❌ **não existe** | ⚠️ **só via Imovib** |
| Vista | `view_type` | ❌ | ❌ | ❌ 100% manual |
| Geometria | ❌ | ❌ | `geometry_json` (x,y,w,h) | ❌ morre no Planta |
| Preço | `price` | `price` | ❌ (semente do VGV) | ✅ Imovib |
| Status | `status` | `status` (com acento) | ❌ | ✅ via `translateStatus` |
| Vendável | `is_vendavel` | `is_vendavel` (tipologia) | ❌ (assume true) | ✅ Imovib |
| Fração ideal | `fracao_ideal_*`, `area_real_total_m2` | ❌ | ❌ | — vem do motor NBR 12721 |

> **Nenhuma das duas arestas preenche a unidade por completo, e elas são complementares:**
> pelo Imovib vêm posição/orientação/preço/status mas **faltam dormitórios, banheiros e
> vagas**; pelo Planta IA vêm dormitórios/banheiros/vagas mas **faltam posição e
> orientação**. Sincronizar pelas duas causa sobrescrita mútua parcial.

### I. Áreas comuns

| Dado | Empreendimento | Viabilidade | Planta IA | Correspondência |
|---|---|---|---|---|
| Tabela | `empreendimento_common_areas` (12) | via `units.is_vendavel=false` | `scenarios.total_common_area`, `floors.common_area/circulation_area` | ✅ Imovib · ❌ Planta |
| Categoria | `category` (6 valores) | inferida do nome | ❌ | ⚠️ heurística |

**Assimetria:** Imovib→Emp cria áreas comuns; Planta→Emp não cria nenhuma.

### J. Comercial

| Dado | Empreendimento | Viabilidade | Planta IA | Correspondência |
|---|---|---|---|---|
| VGV total | `vgv_total` | calculado (não persistido) | `estimated_vgv` | ⚠️ **sem sync** |
| Custo estimado | ❌ | `land_cost`, `capex_*` | `estimated_cost` | ❌ |
| Lançamento / entrega | `launch_date`, `expected_delivery_date` | `base_date` + `duration_months` | ❌ | ⚠️ derivável, sem sync |

`empreendimentos.vgv_total` existe e **nenhum sync o escreve**, embora
`plant_scenarios.estimated_vgv` esteja disponível.

---

## Placar

| Domínio | Correspondência real |
|---|---|
| A. Identidade / SPE | 0% sincronizado (campos homônimos, digitação dupla) |
| B. Localização | 0% (formatos incompatíveis) |
| C. Terreno | 0% para o Emp (5 campos homônimos sem sync) |
| D. Urbanístico | **0% — Emp não tem as colunas** |
| E. Briefing | ~5% (só `tipo`) |
| F. Torre | ~60% (falta `floors_count`/`units_per_floor` via Imovib) |
| G. Pavimentos | **0% — tabelas correspondem, sync inexiste** |
| H. Unidade | ~65% por aresta, complementares |
| I. Áreas comuns | 50% (só Imovib) |
| J. Comercial | ~30% |

### Limitação estrutural

`plantaEmpreendimentoSync` filtra por `study.selected_scenario_id` e sincroniza **um único
cenário** → **no máximo 1 torre por estudo do Planta IA**. Empreendimento multi-torre
nunca terá proveniência Planta completa. O Imovib não tem essa limitação (N blocos).

---

## Caminho para 100%

**F1 — Unidade completa (maior impacto, menor custo).**
Adicionar a `imovib_unit_instances`: `bedrooms`, `bathrooms`, `parking_spaces`.
Adicionar a `empreendimento_units`: `suites`.
Adicionar a `plant_units`: `position_type`, `sun_orientation` (deriváveis do
`geometry_json` + `frontage_orientation` do terreno).
→ fecha o domínio H nas duas arestas.

**F2 — Empreendimento dono do regulatório.**
Criar `empreendimento_urban_params` espelhando `plant_urban_rulesets` (22 col.) e
sincronizar Planta→Emp e Imovib→Emp. A aba "Mapa Regulatório" passa a ler do
empreendimento, com o estudo como origem — não como fonte em tempo de render.
→ fecha D e desacopla a aba do `imovib_study_id`.

**F3 — Terreno + identidade no sync.**
`syncFromStudy` passa a escrever a linha do empreendimento (5 medidas de terreno,
`spe_cnpj`, `developer_name`, `manager`, `vgv_total`). Campos já existem dos dois lados.
→ fecha A/C/J.

**F4 — Pavimentos.**
`plant_floors` → `empreendimento_floors` (`floor_number`, `floor_type`→`tipo`, áreas).
Adicionar áreas a `empreendimento_floors`.
→ fecha G.

**F5 — Torre e áreas comuns.**
`floors_count`/`units_per_floor` em `imovib_blocks`; Planta→Emp cria áreas comuns.
→ fecha F/I.

**F6 — Geometria (pré-req do BIM LAB).**
`geometry_json` em `empreendimento_units` + polígono do terreno.

**F7 — Multi-torre no Planta IA.** Decisão de produto: N cenários selecionados por
estudo, ou 1 estudo por torre.
