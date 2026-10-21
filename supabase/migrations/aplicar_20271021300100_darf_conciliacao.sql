-- ==========================================================================
-- aplicar_20271021300100_darf_conciliacao.sql
-- DARF × conciliação: desfazer a conciliação do DARF inteiro de uma vez.
-- Plano: docs/planos/2026-10-21-agrupar-tributos-em-darf.md (fase 5)
-- ==========================================================================
-- O DARF é pago num débito só do extrato e conciliado com TODOS os membros
-- (fn_reconcile_group). A trava `trg_darf_pago_junto` (aplicar_20271021300000)
-- recusa no commit um membro conciliado e outro não — então desfazer o vínculo
-- de UM membro (fn_reconcile_unmatch) também é recusado. Esta função desfaz
-- todos os vínculos dos membros na mesma transação, chamando a função que já
-- existe (sem alterá-la — ela serve a conciliação inteira).
--
-- SECURITY INVOKER: quem autoriza é a RLS e as checagens de fn_reconcile_unmatch.
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA db push.
-- ==========================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_darf_desfazer_conciliacao(p_darf_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_match uuid;
    v_n int := 0;
BEGIN
    PERFORM 1 FROM public.darfs WHERE id = p_darf_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DARF não encontrado ou sem acesso.' USING ERRCODE = 'P0001';
    END IF;

    FOR v_match IN
        SELECT DISTINCT m.id
          FROM public.reconciliation_matches m
          JOIN public.internal_transactions it ON it.id = m.internal_transaction_id
         WHERE it.darf_id = p_darf_id
         ORDER BY m.id
    LOOP
        PERFORM public.fn_reconcile_unmatch(v_match);
        v_n := v_n + 1;
    END LOOP;

    IF v_n = 0 THEN
        RAISE EXCEPTION 'Este DARF não está conciliado com o extrato.' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_desfazer_conciliacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_darf_desfazer_conciliacao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- VERIFICAÇÃO:
-- SELECT proname, proacl FROM pg_proc WHERE proname = 'fn_darf_desfazer_conciliacao';
-- ==========================================================================
-- FIM: aplicar_20271021300100_darf_conciliacao.sql
-- ==========================================================================
