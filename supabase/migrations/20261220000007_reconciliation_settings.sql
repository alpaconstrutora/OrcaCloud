-- ============================================================
-- Configuração de Tolerância da Conciliação (Central Inteligente · Fase 2)
-- OrçaCloud SaaS · Migration 20261220000007
-- Idempotente (Regra de Ouro 10).
--
-- Tolerâncias e limiares do motor de score (bankReconciliationService).
-- Multa/juros continuam em asaas_charge_config (reaproveitado).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reconciliation_settings (
  organization_id   UUID        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  value_tol_abs     NUMERIC     NOT NULL DEFAULT 50,    -- tolerância de valor absoluta (R$)
  value_tol_pct     NUMERIC     NOT NULL DEFAULT 3,     -- tolerância de valor (%)
  encargos_tol_pct  NUMERIC     NOT NULL DEFAULT 0.5,   -- folga ao casar valor esperado com encargos (%)
  date_window_days  INT         NOT NULL DEFAULT 10,    -- janela de data para pontuar proximidade
  auto_threshold    INT         NOT NULL DEFAULT 100,   -- score p/ conciliação automática
  suggestion_min    INT         NOT NULL DEFAULT 40,    -- score mínimo p/ virar sugestão
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reconciliation_settings_org" ON public.reconciliation_settings;
CREATE POLICY "reconciliation_settings_org" ON public.reconciliation_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = reconciliation_settings.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

GRANT ALL ON public.reconciliation_settings TO authenticated;

-- FIM: 20261220000007_reconciliation_settings.sql
