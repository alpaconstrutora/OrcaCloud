-- Sprint 9: Vinculação de OEs com atividades do módulo de Planejamento
-- planning_item_ref é um snapshot JSONB (sem FK) para não criar dependência entre projetos

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS planning_item_ref JSONB;

COMMENT ON COLUMN work_orders.planning_item_ref IS
  'Snapshot da atividade de planejamento vinculada. Estrutura: { planningProjectId, planningProjectName, itemScheduleId, itemDescription, phase, plannedStart, plannedEnd, budgetedValue }';
