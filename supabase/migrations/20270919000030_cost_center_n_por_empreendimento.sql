-- ============================================================================
-- Centro de custo: N por empreendimento (fim do 1:1)
-- Plano: docs/planos/2026-09-19-centro-de-custo-n-por-empreendimento.md
--
-- O índice único `uidx_cost_center_por_empreendimento` (20270905000024) nasceu
-- da regra do rateio condominial — "um centro de custo por condomínio" — e
-- passou a valer para o cadastro inteiro. Decisão do usuário em 2026-09-19:
-- um empreendimento PODE ter mais de um centro de custo. O rateio passa a
-- somar as despesas de todos os centros de custo do condomínio (ver
-- condominioRateioService.previa, `costCenterIds`).
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- (nunca `db push` — ver CLAUDE.md da raiz). Idempotente.
-- ============================================================================
SET lock_timeout = '5s';

DROP INDEX IF EXISTS public.uidx_cost_center_por_empreendimento;

-- O índice de busca (não único) continua: idx_cost_centers_v2_empreendimento.

COMMENT ON COLUMN public.cost_centers_v2.empreendimento_id IS
  'Empreendimento ao qual este centro de custo pertence (N:1 — um empreendimento '
  'pode ter vários centros de custo; cada centro de custo aponta para no máximo '
  'um). No rateio condominial, a despesa do condomínio é a soma dos lançamentos '
  'de TODOS os seus centros de custo. Complementa `project_id` (20270907000000), '
  'que deriva empreendimento a partir da OBRA — caminho que não existe para '
  'prédio em operação sem obra vinculada. Era 1:1 até 20270919000030.';
