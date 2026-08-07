# Reconciliação: PRD ÒPURA Planta Inteligente × módulo Planta AI existente

## Pedido original

> avalie
>
> (anexo: `PRD_Tecnico_OPURA_Planta_Inteligente_v1.0.md`)

E, após a avaliação apontar a colisão com o módulo já existente:

> sim
>
> (aceitando: "Quer que eu escreva essa seção de reconciliação (comparando schema atual ×
> proposto, campo a campo) para anexar ao PRD antes de levar para decomposição em épicos?")

Sessão de 2026-08-06.

---

## 0. Por que este documento existe

O PRD `PRD-OPURA-PI-001` v1.0 descreve o módulo Planta Inteligente como se fosse greenfield.
Não é. O ÒPURA já tem em produção um módulo **Planta AI** com 8 tabelas, ~1.400 linhas de
serviço, ~2.300 linhas de UI e duas pontes aplicadas (Empreendimentos e Mapa Regulatório).

Pior: o PRD trata o **Gerador** como R3 — o item mais distante e arriscado do roadmap — e o
Gerador é justamente **a parte que já existe**. O que não existe é o **Digitalizador** (R1 no
PRD), que é genuinamente greenfield.

Sem esta reconciliação, a decomposição em épicos vai (a) reconstruir do zero um gerador que já
roda, (b) criar tabelas `plan_*` colidindo por uma letra com as `plant_*` existentes, e (c)
deixar sem resposta o que acontece com os empreendimentos já materializados a partir de
cenários.

---

## 1. Inventário do que já existe

### 1.1 Tabelas (migration `20270101000000_opura_planta_ai_module.sql`)

| Tabela | Papel | Estado |
|:---|:---|:---|
| `plant_studies` | Raiz de autorização (org + projeto opcional) | Em uso |
| `plant_terrains` | Terreno: área, frente, profundidade, esquina, declive, `polygon_geometry` JSONB | Em uso (1:1 com estudo) |
| `plant_urban_rulesets` | Regras urbanísticas: TO, CA básico/máx, permeabilidade, 4 recuos, gabarito, vagas, `confidence_level`, `law_reference` | Em uso (1:1 com estudo) |
| `plant_briefings` | Programa: tipologias, área-alvo, un/pavimento, pavimentos, vagas, padrão, objetivo | Em uso (1:1 com estudo) |
| `plant_scenarios` | Alternativa gerada + 6 scores + VGV/custo estimados + `materialized_at` | Em uso |
| `plant_floors` | Pavimento do cenário, `geometry_json` | Materializado desde a ponte |
| `plant_units` | Unidade do pavimento, `geometry_json` = `{x,y,width,height,color}` | Materializado desde a ponte |
| `plant_validations` | Resultado de regra: tipo, severidade, valor permitido × real, recomendação | Em uso |

RLS org-scoped por `organization_members.email` em todas as 8; políticas `anon` removidas pelo
rollout `20270208000002`.

### 1.2 Código

| Arquivo | Linhas | Papel |
|:---|---:|:---|
| `services/plantaAiEngine.ts` | 212 | `calculateEnvelope`, `generateScenarios` (3 variantes), validações inline |
| `services/plantaAiIntegration.ts` | 380 | Ponte Imovib ↔ Planta AI |
| `services/plantaAiMaterializeService.ts` | 230 | Cenário → `plant_floors`/`plant_units` idempotente |
| `services/plantaAiFromTowersService.ts` | 242 | Caminho reverso: Torres/Unidades → cenário |
| `services/plantaEmpreendimentoSync.ts` | — | Ponte direta Planta AI ↔ Empreendimento |
| `components/planta_ai/plantaGeometry.ts` | 90 | `computeFloorLayout` — fonte única do 2D e do 3D |
| `components/planta_ai/FloorPlanCanvas2D.tsx` | 383 | **Viewer** SVG (zoom/pan/rotate). Não edita geometria |
| `components/planta_ai/Building3DViewer.tsx` | 276 | Viewer 3D (react-three-fiber) |
| `components/planta_ai/PlantaAiStudyDetail.tsx` | 526 | Tela do estudo (terreno → regras → briefing → cenários) |

### 1.3 Pontes aplicadas

- `20270209000000_planta_ai_empreendimento_bridge.sql` — `empreendimentos.planta_ai_study_id`,
  `empreendimento_towers.planta_ai_scenario_id`, `empreendimento_units.planta_ai_unit_id`,
  índices únicos de idempotência e `plant_scenarios.materialized_at`.
- `20270218000003_copy_planta_ruleset_to_regulatory.sql` — as regras urbanísticas do estudo
  foram copiadas para `empreendimento_regulatory_zones` (Mapa Regulatório), que passou a ser o
  repositório compartilhado.

---

## 2. Comparação campo a campo: proposto (PRD §15.1) × existente

### 2.1 Sobreposição direta

| PRD propõe | Já existe | Veredito |
|:---|:---|:---|
| `plan_studies` (id, org_id, project_id, name, unit_system, status) | `plant_studies` (id, organization_id, project_id, name, status, city/state/address) | **Colisão de nome por 1 letra.** Conceito ~igual. Falta só `unit_system` |
| `plan_levels` (elevation_mm, default_height_mm) | `plant_floors` (floor_number, floor_type, áreas) | Conceitos primos: `plan_levels` é o nível do modelo; `plant_floors` é o pavimento do cenário. Podem coexistir, mas o nome confunde |
| `generation_problems` (constraints, weights) | `plant_terrains` + `plant_urban_rulesets` + `plant_briefings` | **Já existe, desnormalizado em 3 tabelas 1:1.** O PRD normaliza num objeto só |
| `generation_runs` (solver_version, seed, budget) | — | Não existe. `generateScenarios` roda síncrono no cliente, sem seed nem registro de execução |
| `generation_variants` (rank, score, components) | `plant_scenarios` (6 scores + `general_score`) | **Já existe.** Falta: rank explícito, seed, componentes do score versionados |
| `rule_packages` / `rule_definitions` | `plant_urban_rulesets` (1:1 com estudo) + `empreendimento_regulatory_zones` | Existe como **dado por estudo/empreendimento**, não como pacote versionado por jurisdição. É o gap real do PRD §13 |
| `validation_runs` / `validation_results` | `plant_validations` | **Já existe** o resultado (com valor permitido × real e recomendação). Falta a *execução* reproduzível e o `rule_version_id` |
| `rule_overrides` | — | Não existe |
| `model_snapshots` (hash, kernel_version, payload) | — | Não existe. Cenários são mutáveis, sem hash, sem imutabilidade |
| `model_branches` (parent_snapshot, revision) | — | Não existe |
| `model_objects` (walls, openings, spaces) | `plant_units.geometry_json` = retângulo | **Diferença de natureza**, não de implementação. Ver §3 |
| `quantity_snapshots` | — | Não existe |
| `plan_sources` / `source_pages` / `source_transforms` | — | Não existe — **Digitalizador é 100% greenfield** |
| `inference_runs` / `inference_candidates` | — | Não existe — greenfield |
| `audit_events` / `integration_outbox` | — | Não existe neste módulo |

### 2.2 O que o PRD ignora que já existe

Campos e comportamentos em produção que o PRD §15 não contempla e que **quebrariam se o
modelo novo substituísse o atual sem mapeamento**:

- `plant_scenarios.materialized_at` — carimbo da última materialização.
- Índices únicos `uq_plant_floors_scenario_number` e `uq_plant_units_floor_code` — garantem que
  rematerializar não duplica a árvore.
- `empreendimentos.planta_ai_study_id`, `empreendimento_towers.planta_ai_scenario_id`,
  `empreendimento_units.planta_ai_unit_id` — **proveniência viva**. Empreendimentos reais já
  apontam para linhas dessas tabelas.
- Regra "1 cenário = 1 torre" (`plantaAiFromTowersService`).
- `plant_scenarios.selected` está **morto** — a fonte de verdade é
  `plant_studies.selected_scenario_id`. O PRD não sabe disso e o modelo novo pode repetir o erro.
- `plant_urban_rulesets` já foi espelhado no Mapa Regulatório. Criar `rule_packages` sem
  reconciliar com `empreendimento_regulatory_zones` cria uma **terceira** fonte de regra urbanística.

---

## 3. A diferença que importa: retângulo × topologia

Esta é a distinção que decide o escopo, e o PRD não a nomeia.

**Modelo atual.** A unidade é um retângulo: `{x, y, width, height, color}`, posicionado por
`computeFloorLayout` numa grade `cols × rows` derivada da pegada do prédio. Não há paredes, não
há aberturas, não há grafo planar. Área é `width × height`. É suficiente para estudo de massa,
VGV preliminar e materialização em Torres/Unidades — que é exatamente o que o módulo entrega hoje.

**Modelo do PRD.** A parede é o objeto primário (eixo, espessura, altura); a abertura é hospedada
num segmento de parede; o ambiente é uma **face derivada de um grafo planar**, não um retângulo
declarado. Área vem da topologia. Isso habilita quantitativos de alvenaria, revestimento, rodapé
— o que o modelo atual não consegue nem aproximar.

**Consequência:** os dois modelos não são versões do mesmo schema. São representações
diferentes do mesmo domínio, com poderes diferentes. Um retângulo pode virar 4 paredes
determinísticamente; 4 paredes de um estudo real **não** voltam a virar retângulo sem perda.
A conversão é de mão única.

---

## 4. Decisões de portão

> **Resolvidas em 2026-08-06.** As quatro foram decididas conforme a recomendação de cada uma.
> O texto de aplicação está em
> [`2026-08-06-emendas-prd-planta-inteligente.md`](./2026-08-06-emendas-prd-planta-inteligente.md).
>
> | ID | Escolha |
> |:---|:---|
> | DR-01 | **Coexistência** — sem migrar dado do Planta AI v1 |
> | DR-02 | Prefixo **`blueprint_*`** (não `dwg_*`, ver nota na emenda; nunca `plan_*`) |
> | DR-03 | `rule_packages` **absorvem** o Mapa Regulatório |
> | DR-04 | Rust **não aprovado** — Spike A ganha braço TypeScript puro; empate resolve a favor do TS |

O registro original das opções, abaixo, fica preservado pela justificativa:

### DR-01 — O kernel topológico substitui ou complementa o gerador atual?

**Opção A — Coexistência (recomendada).** `plant_*` continua sendo o Gerador de estudo de massa
(terreno → cenário → torre). O novo módulo nasce só como **Digitalizador**, com nome e prefixo
distintos, e produz plantas de nível de detalhe que o gerador atual nunca produziu. As duas
árvores se encontram depois, por ponte explícita, quando ambas estiverem maduras.
*Custo:* dois modelos geométricos no sistema por um período longo.
*Ganho:* zero risco para os empreendimentos já materializados; o R1 do PRD entrega sozinho.

**Opção B — Substituição.** O kernel novo vira a única representação; `plant_scenarios` passa a
gerar paredes em vez de retângulos; `plant_floors`/`plant_units` são migradas.
*Custo:* migração de dado real com proveniência viva em três tabelas de Empreendimento —
não é greenfield, é reforma de fundação sob prédio ocupado. E o PRD **não tem** um capítulo de
migração para isso (§24 fala de rollout de feature, não de conversão de dado existente).
*Ganho:* uma fonte geométrica só.

**Recomendação:** A. Se B for escolhida, o PRD precisa de um capítulo novo "Migração do Planta AI
v1", com: mapeamento retângulo→paredes, o que acontece com `planta_ai_unit_id` de unidades já
vendidas/reservadas, e ensaio de rollback.

### DR-02 — Nomenclatura

`plan_studies` × `plant_studies` diferem por uma letra. Isso é armadilha garantida em `grep`,
em revisão de PR e em migration. Duas saídas:

- Se **Opção A**: prefixar o novo módulo por função, não por sinônimo. Sugestão: `dwg_*`
  (`dwg_sources`, `dwg_pages`, `dwg_candidates`, `dwg_snapshots`) ou `blueprint_*`.
- Se **Opção B**: assumir os nomes `plant_*` existentes e evoluí-los por migration, sem criar
  um segundo vocabulário.

Em nenhum cenário criar `plan_*`.

### DR-03 — Onde vive a regra urbanística

Hoje há duas cópias: `plant_urban_rulesets` (por estudo) e `empreendimento_regulatory_zones`
(Mapa Regulatório, compartilhado). O PRD §13 propõe uma terceira: `rule_packages` +
`rule_definitions` versionados por jurisdição.

A terceira é conceitualmente a certa — é a única com vigência, fonte e versão. Mas o PRD precisa
declarar que ela **absorve** o Mapa Regulatório (que já tem o cadastro por cidade,
`20270819000005`, ainda não aplicada), em vez de conviver com ele. Caso contrário o sistema fica
com três respostas possíveis para "qual o recuo frontal desta zona".

### DR-04 — Kernel em Rust/WASM

Não há uma linha de Rust no repositório: zero `.rs`, zero `Cargo.toml`. Todo o stack é
TypeScript/React/Supabase/Vite — inclusive o `bim-spike/`, que é TS + react-three-fiber.

O PRD já marca isso como pendente (DP-04) e propõe o Spike A. **Ampliar o Spike A** para rodar
duas implementações do mesmo conjunto de 25 casos: uma em Rust/WASM e outra em TypeScript puro
com política de arredondamento rígida (inteiros em mm, como o próprio PRD §9.2 exige). Só comprar
o custo de uma segunda linguagem se o TS falhar no determinismo ou na performance do RNF-003.

---

## 5. Emendas ao PRD antes da decomposição

1. **§2 (Resumo executivo)** — acrescentar parágrafo declarando que o Gerador descrito em R3 tem
   uma v1 em produção (`plant_*`), e que este PRD trata da geração **topológica**, distinta da
   geração **paramétrica por retângulo** existente.

2. **§4.2 (Não objetivos)** — se DR-01 = A, incluir: *"Este ciclo não substitui nem migra o motor
   de geração paramétrica atual (`plant_scenarios` → materialização em Torres/Unidades). Os dois
   coexistem."*

3. **§6 (Releases)** — reordenar. O R3 (Gerador) do PRD é, no todo, menos urgente do que o PRD
   supõe: já há uma resposta em produção para o job "estudar aproveitamento do terreno". O R1
   (Digitalizador) é o único greenfield sem substituto — deve concentrar o investimento.

4. **§13 (Motor de regras)** — declarar a relação com `empreendimento_regulatory_zones` e com o
   Mapa Regulatório (DR-03).

5. **§15 (Modelo de dados)** — renomear todo o prefixo `plan_*` (DR-02) e acrescentar as colunas
   de proveniência que o módulo atual já usa, se houver ponte planejada.

6. **§24 (Migração e rollout)** — se DR-01 = B, criar subseção de conversão de dado existente com
   ensaio de rollback. Se A, declarar explicitamente que não há migração de dado.

7. **§30 (Spike A)** — adicionar braço TypeScript puro (DR-04).

8. **Novo apêndice** — "Estado do Planta AI v1": tabelas, serviços, pontes e as duas armadilhas
   conhecidas (`plant_scenarios.selected` morto; regra "1 cenário = 1 torre").

---

## 6. Critério de pronto deste documento

- [x] Inventário das 8 tabelas existentes com estado de uso
- [x] Inventário do código (serviços, componentes, pontes)
- [x] Comparação campo a campo PRD §15.1 × schema real
- [x] Lista do que o PRD ignora e que quebraria em caso de substituição
- [x] Nomeação da diferença conceitual (retângulo × topologia)
- [x] Quatro decisões de portão com recomendação
- [x] Emendas pontuais ao PRD, por seção
- [x] DR-01 a DR-04 decididas (2026-08-06) — ver §4
- [x] Texto de aplicação das 8 emendas escrito
- [ ] **Pendente:** aplicar as emendas no arquivo do PRD e publicar como v1.1
      (o PRD não está versionado no repositório — veio como anexo de conversa)

---

## 7. Verificação

O que foi verificado lendo o código/migrations (não de memória):

- `types/plantaAi.ts`, `services/plantaAiEngine.ts`, `components/planta_ai/plantaGeometry.ts`,
  `components/planta_ai/FloorPlanCanvas2D.tsx` (confirmado: **viewer**, sem edição de geometria)
- `supabase/migrations_pending_review/20270101000000_opura_planta_ai_module.sql` (8 tabelas + RLS)
- `supabase/migrations/20270208000002_drop_anon_dev_policies_rollout.sql` (anon removida das 8)
- `supabase/migrations/20270209000000_planta_ai_empreendimento_bridge.sql` (proveniência + índices únicos)
- `supabase/migrations/20270218000003_copy_planta_ruleset_to_regulatory.sql` (regras espelhadas)
- Ausência de Rust: busca por `*.rs` e `Cargo.toml` no repositório inteiro → zero resultados

O que **não** foi verificado no navegador nem no banco remoto: se as 8 tabelas estão de fato
aplicadas no Supabase de produção (a migration está em `migrations_pending_review/`, mas
migrations posteriores em `migrations/` fazem `ALTER TABLE` nelas — o que indica que sim, foram
aplicadas fora do histórico, coerente com o histórico furado conhecido do projeto).
