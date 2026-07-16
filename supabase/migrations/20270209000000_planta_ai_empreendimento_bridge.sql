-- Ponte Planta IA ↔ Empreendimento (fecha o ciclo Imovib → Planta IA → Empreendimento → Imovib).
--
-- Contexto: as pontes Imovib↔Planta IA (plantaAiIntegration.ts) e Imovib↔Empreendimento
-- (empreendimentoService.syncFromStudy/writeBackToStudy) já existiam nos dois sentidos, mas
-- Planta IA e Empreendimento só se falavam via Imovib (2 saltos). Esta migration adiciona a
-- proveniência necessária para o vínculo direto, no mesmo padrão das colunas imovib_*.
--
-- plant_floors/plant_units já existem no banco (com RLS org-scoped correta) mas nunca foram
-- populadas — eram tipos mortos em types/plantaAi.ts. Passam a ser materializadas a partir da
-- geometria do cenário (computeFloorLayout), virando a fonte 1:1 das unidades do Empreendimento.

-- ── 1. Proveniência: Empreendimento → estudo do Planta IA ────────────────────
alter table public.empreendimentos
  add column if not exists planta_ai_study_id uuid
    references public.plant_studies(id) on delete set null;

create index if not exists idx_empreendimentos_planta_ai_study
  on public.empreendimentos(planta_ai_study_id)
  where planta_ai_study_id is not null;

-- ── 2. Proveniência: Torre → cenário do Planta IA ────────────────────────────
alter table public.empreendimento_towers
  add column if not exists planta_ai_scenario_id uuid
    references public.plant_scenarios(id) on delete set null;

create index if not exists idx_empreendimento_towers_planta_ai_scenario
  on public.empreendimento_towers(planta_ai_scenario_id)
  where planta_ai_scenario_id is not null;

-- ── 3. Proveniência: Unidade → unidade materializada do Planta IA ────────────
alter table public.empreendimento_units
  add column if not exists planta_ai_unit_id uuid
    references public.plant_units(id) on delete set null;

create index if not exists idx_empreendimento_units_planta_ai_unit
  on public.empreendimento_units(planta_ai_unit_id)
  where planta_ai_unit_id is not null;

-- ── 4. Materialização idempotente do Planta IA ───────────────────────────────
-- Rematerializar um cenário precisa reencontrar o mesmo pavimento/unidade em vez de
-- duplicar. Sem isso, cada clique em "Materializar" criaria uma nova árvore e a
-- proveniência do Empreendimento apontaria para unidades órfãs.
create unique index if not exists uq_plant_floors_scenario_number
  on public.plant_floors(scenario_id, floor_number);

-- unit_code é o identificador estável dentro do pavimento (ex: "101", "102").
create unique index if not exists uq_plant_units_floor_code
  on public.plant_units(floor_id, unit_code)
  where unit_code is not null;

-- ── 5. Carimbo de sincronização (espelha empreendimentos.last_synced_at) ─────
alter table public.plant_scenarios
  add column if not exists materialized_at timestamptz;

comment on column public.empreendimentos.planta_ai_study_id is
  'Estudo de arquitetura (Planta IA) que originou este empreendimento. Vínculo direto — o caminho via Imovib continua válido e independente.';
comment on column public.empreendimento_towers.planta_ai_scenario_id is
  'Cenário do Planta IA que originou esta torre (1 cenário = 1 torre).';
comment on column public.empreendimento_units.planta_ai_unit_id is
  'Unidade materializada (plant_units) que originou esta unidade. Base do sync 1:1 e da escrita reversa.';
comment on column public.plant_scenarios.materialized_at is
  'Última materialização de plant_floors/plant_units a partir da geometria deste cenário.';
