-- ============================================================
-- Evolução do sistema de Checklist — Controle Operacional
-- Sem breaking changes: colunas adicionadas com IF NOT EXISTS
-- ============================================================

-- 1. Resposta agora tem status técnico (em vez de apenas boolean)
ALTER TABLE public.oe_checklist_responses
  ADD COLUMN IF NOT EXISTS response_status TEXT
    CHECK (response_status IN ('conforme','nao_conforme','parcial','nao_aplicavel'));

-- 2. Resposta pode referenciar a NC gerada automaticamente
ALTER TABLE public.oe_checklist_responses
  ADD COLUMN IF NOT EXISTS nc_id UUID
    REFERENCES public.non_conformances(id) ON DELETE SET NULL;

-- 3. Item pode definir severidade padrão (usada ao gerar NC automaticamente)
ALTER TABLE public.oe_checklist_items
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'moderate'
    CHECK (severity IN ('minor','moderate','major'));

-- 4. Item pode ter categoria para agrupamento visual (ex: Estrutura, Acabamento)
ALTER TABLE public.oe_checklist_items
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Índice para rastreabilidade NC → resposta de origem
CREATE INDEX IF NOT EXISTS idx_checklist_resp_nc
  ON public.oe_checklist_responses(nc_id)
  WHERE nc_id IS NOT NULL;
