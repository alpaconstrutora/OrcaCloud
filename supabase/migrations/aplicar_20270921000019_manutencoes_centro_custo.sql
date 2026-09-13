-- ==========================================================================
-- Gestão de Ativos · Manutenções · Centro de Custo
-- Date: 2026-09-13
-- Tabela: public.opura_asset_maintenances
-- ==========================================================================
-- CONTEXTO
-- A ordem de manutenção tem custo (`cost`) mas nenhuma dimensão contábil: não
-- dava para saber a qual centro de custo o gasto da oficina pertence. Pedido
-- do usuário em 2026-09-13: coluna "Centro de custo" na tabela da aba
-- Manutenções e o campo no formulário de agendamento.
--
-- Mesma dimensão usada pela folha e pelo financeiro: public.cost_centers_v2.
-- ON DELETE SET NULL — apagar um centro de custo não apaga o histórico de
-- manutenção, só o desclassifica.
--
-- Sem policy nova: a tabela já tem RLS por organization_id e a coluna é só
-- um atributo da linha. Sem função nova (REGRA #7 não se aplica).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + FK criada só se não existir.
-- ==========================================================================

ALTER TABLE public.opura_asset_maintenances
  ADD COLUMN IF NOT EXISTS cost_center_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'opura_asset_maintenances_cost_center_id_fkey'
  ) THEN
    ALTER TABLE public.opura_asset_maintenances
      ADD CONSTRAINT opura_asset_maintenances_cost_center_id_fkey
      FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opura_asset_maintenances_cost_center
  ON public.opura_asset_maintenances (cost_center_id);

COMMENT ON COLUMN public.opura_asset_maintenances.cost_center_id IS
  'Centro de custo (cost_centers_v2) ao qual o gasto da manutenção pertence. NULL = não classificado.';
