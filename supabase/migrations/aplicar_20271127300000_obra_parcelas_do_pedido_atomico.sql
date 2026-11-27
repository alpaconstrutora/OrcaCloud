-- aplicar_20271127300000_obra_parcelas_do_pedido_atomico.sql
--
-- Recebimento mobile, Fase 1 (docs/planos/2026-11-27-recebimento-mobile.md).
-- Prova: scripts/teste-obra-parcelas-atomico.sql.
--
-- As parcelas a pagar de um pedido moram em DOIS lugares: no JSON da obra
-- (projects.settings.financialInfo.transactions, com orderId) e no razão
-- (internal_transactions). O produtor (`syncOrderToFinance`, agora em
-- services/pedidoFinanceiroMotor.ts) regravava a OBRA INTEIRA pelo
-- projectService.saveProject — settings e budget lidos no começo. No navegador
-- isso já arriscava sobrescrever o cronograma de quem editou no meio; na Edge
-- `pedido-recebimento` (servidor, para o celular) seria uma cópia velha por
-- padrão.
--
-- Esta primitiva troca SÓ as parcelas de um pedido, com a obra travada:
-- tira de financialInfo.transactions as de orderId = p_order e põe p_novas no
-- começo. Nenhuma outra chave de settings é tocada (diaryEntries também não —
-- o gatilho trg_projects_diary_entries_guard só desfaria mudança nela).
--
-- SECURITY INVOKER: no navegador vale a RLS de projects (quem não vê a obra não
-- troca nada → 42501); na Edge, o service role. Quais parcelas gerar continua
-- no TypeScript; aqui só se guarda.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`, da pasta
-- de uma frente LIGADA ao projeto. ANTES do front que chama a função.

CREATE OR REPLACE FUNCTION public.fn_obra_trocar_parcelas_do_pedido(p_project UUID, p_order UUID, p_novas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settings JSONB;
    v_info     JSONB;
    v_atuais   JSONB;
    v_lista    JSONB;
    v_n        INTEGER;
BEGIN
    IF p_project IS NULL OR p_order IS NULL THEN
        RAISE EXCEPTION 'obra e pedido são obrigatórios' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_novas) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'as parcelas novas precisam ser uma lista' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_novas) e
                WHERE jsonb_typeof(e) <> 'object' OR e ->> 'orderId' IS DISTINCT FROM p_order::text) THEN
        RAISE EXCEPTION 'toda parcela nova tem de ser do pedido informado' USING ERRCODE = '22023';
    END IF;

    SELECT p.settings INTO v_settings FROM public.projects p WHERE p.id = p_project FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'obra não encontrada ou sem permissão' USING ERRCODE = '42501';
    END IF;

    -- Mesmo padrão de financialService.addTransaction quando a obra não tem financeiro.
    v_info := CASE WHEN jsonb_typeof(v_settings -> 'financialInfo') = 'object'
                   THEN v_settings -> 'financialInfo'
                   ELSE jsonb_build_object('totalValue', 0, 'paymentMethod', 'Parcelamento Próprio',
                                           'installments', '[]'::jsonb, 'transactions', '[]'::jsonb) END;
    v_atuais := CASE WHEN jsonb_typeof(v_info -> 'transactions') = 'array' THEN v_info -> 'transactions' ELSE '[]'::jsonb END;

    SELECT p_novas || coalesce(jsonb_agg(t.e ORDER BY t.o), '[]'::jsonb)
      INTO v_lista
      FROM jsonb_array_elements(v_atuais) WITH ORDINALITY AS t(e, o)
     WHERE t.e ->> 'orderId' IS DISTINCT FROM p_order::text;

    UPDATE public.projects
       SET settings   = jsonb_set(coalesce(settings, '{}'::jsonb), '{financialInfo}',
                                  v_info || jsonb_build_object('transactions', v_lista)),
           updated_at = now()
     WHERE id = p_project;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
        RAISE EXCEPTION 'obra não encontrada ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_array_length(p_novas);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_obra_trocar_parcelas_do_pedido(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_obra_trocar_parcelas_do_pedido(UUID, UUID, JSONB) TO authenticated, service_role;
