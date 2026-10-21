-- ============================================================================
-- Reversão do recálculo do financeiro das folhas FECHADAS de 04–06/2026
-- Plano: docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md (fase 5)
--
-- Pedido do usuário (21/10/2026): "Folhas fechadas de abril a junho: devem ser
-- recalculadas". O recálculo é feito pelo app (RH › Ciclos de folha ›
-- Re-sincronizar financeiro), com a regra nova que preserva pago, conciliado,
-- cancelado e DARF. ANTES dele, esta tabela guarda uma cópia exata de todas as
-- linhas `labor-{folha}-%` das 4 folhas. Para reverter: apagar as linhas atuais
-- `labor-{folha}-%` não preservadas e reinserir as daqui.
--
-- ⚠️ NÃO APAGAR esta tabela: é a única cópia do financeiro anterior dessas folhas.
--
-- Folhas: Alpa 04/2026 (8f506ac6), Alpa 05/2026 (c90a042a), Garden 05/2026
-- (f0cca01f), Alpa 06/2026 (728260c9).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bkp_folha_financeiro_20271021 (LIKE public.internal_transactions INCLUDING DEFAULTS);

ALTER TABLE public.bkp_folha_financeiro_20271021 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bkp_folha_financeiro_20271021 FROM PUBLIC;
REVOKE ALL ON public.bkp_folha_financeiro_20271021 FROM anon;
REVOKE ALL ON public.bkp_folha_financeiro_20271021 FROM authenticated;

COMMENT ON TABLE public.bkp_folha_financeiro_20271021 IS
    'Reversão do recálculo do financeiro das folhas fechadas 04–06/2026 (21/10/2026). NÃO APAGAR.';

INSERT INTO public.bkp_folha_financeiro_20271021
SELECT it.*
  FROM public.internal_transactions it
 WHERE it.source_system IN ('LABOR', 'PROJECT')   -- 04/2026 foi rebaixada a 'PROJECT' pelo espelho da obra
   AND (   it.reference_id LIKE 'labor-8f506ac6-9d1d-4619-8e83-fbdd0b8a3b31-%'
        OR it.reference_id LIKE 'labor-c90a042a-9f80-4bce-a988-f3f0ebf599af-%'
        OR it.reference_id LIKE 'labor-f0cca01f-c6f2-4ee4-873d-7e4a53f6815b-%'
        OR it.reference_id LIKE 'labor-728260c9-5cd4-497b-ae3d-1bc0a6300ff8-%')
   AND NOT EXISTS (SELECT 1 FROM public.bkp_folha_financeiro_20271021 b WHERE b.id = it.id);

SELECT substr(reference_id, 7, 8) AS folha, count(*) AS linhas, sum(amount) AS total
  FROM public.bkp_folha_financeiro_20271021
 GROUP BY 1 ORDER BY 1;
