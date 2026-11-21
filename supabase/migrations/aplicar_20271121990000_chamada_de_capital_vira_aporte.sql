-- Fase 7.1 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md
--
-- Pagar uma chamada de capital mexia em três lugares pelo cliente, em três
-- chamadas separadas (item, capital_paid do sócio, status da chamada), e não
-- gerava o aporte em investor_contributions — o extrato do investidor e a SPE
-- eram dois controles de dinheiro. Agora é uma transação só, e o pagamento vira
-- o aporte 'liquidado' do investidor na obra da SPE.
--
-- Pergunta 1 (REGRA #7): sem policy nova.
-- Pergunta 2: SECURITY INVOKER — quem chama precisa poder gravar o item, o sócio
-- e o aporte pela RLS que já existe (owner/admin da org). EXECUTE só para
-- authenticated.
--
-- Reversão: DROP FUNCTION public.fn_chamada_de_capital_registrar_pagamento(uuid, numeric, text, date);
--           ALTER TABLE public.investor_contributions DROP COLUMN capital_call_item_id;

ALTER TABLE public.investor_contributions
    ADD COLUMN IF NOT EXISTS capital_call_item_id uuid
        REFERENCES public.capital_call_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS investor_contributions_capital_call_item_idx
    ON public.investor_contributions (capital_call_item_id);

COMMENT ON COLUMN public.investor_contributions.capital_call_item_id IS
    'Item da chamada de capital cujo pagamento gerou este aporte (fn_chamada_de_capital_registrar_pagamento).';

CREATE OR REPLACE FUNCTION public.fn_chamada_de_capital_registrar_pagamento(
    p_item_id uuid,
    p_valor numeric,
    p_referencia text DEFAULT NULL,
    p_data date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_item    public.capital_call_items;
    v_call    public.capital_calls;
    v_spe     public.spe_entities;
    v_socio   public.spe_partners;
    v_pago    numeric;
    v_status  text;
    v_aporte  uuid;
BEGIN
    IF p_valor IS NULL OR p_valor <= 0 THEN
        RAISE EXCEPTION 'Informe um valor maior que zero' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_item FROM public.capital_call_items WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item da chamada não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_call FROM public.capital_calls WHERE id = v_item.capital_call_id;
    IF v_call.status = 'cancelada' THEN
        RAISE EXCEPTION 'Chamada cancelada não recebe pagamento' USING ERRCODE = '22023';
    END IF;
    IF v_item.status = 'pago' THEN
        RAISE EXCEPTION 'Este sócio já pagou a chamada inteira' USING ERRCODE = '22023';
    END IF;

    v_pago   := v_item.amount_paid + p_valor;
    v_status := CASE WHEN v_pago >= v_item.amount_due THEN 'pago' ELSE 'parcial' END;

    UPDATE public.capital_call_items
       SET amount_paid = v_pago,
           status = v_status,
           paid_at = CASE WHEN v_status = 'pago' THEN now() ELSE paid_at END,
           payment_reference = COALESCE(NULLIF(btrim(p_referencia), ''), payment_reference),
           updated_at = now()
     WHERE id = p_item_id;
    -- Membro comum lê o item, mas a RLS não deixa gravar: 0 linhas, sem erro.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sem permissão para registrar pagamento nesta chamada' USING ERRCODE = '42501';
    END IF;

    PERFORM public.increment_spe_capital_paid(v_item.spe_partner_id, p_valor);

    UPDATE public.capital_calls c
       SET status = (
               SELECT CASE
                   WHEN bool_and(i.status = 'pago') THEN 'paga'
                   WHEN bool_or(i.status IN ('pago', 'parcial')) THEN 'parcialmente_paga'
                   ELSE 'aberta'
               END
                 FROM public.capital_call_items i
                WHERE i.capital_call_id = c.id),
           updated_at = now()
     WHERE c.id = v_call.id;

    SELECT * INTO v_socio FROM public.spe_partners WHERE id = v_item.spe_partner_id;
    SELECT * INTO v_spe FROM public.spe_entities WHERE id = v_call.spe_entity_id;

    -- O extrato do investidor (investor_contributions) é por obra. SPE sem obra
    -- paga, mas não tem onde lançar o aporte: a tela avisa antes.
    IF v_spe.project_id IS NOT NULL THEN
        INSERT INTO public.investor_contributions (
            organization_id, project_id, investor_id, type, amount,
            due_date, paid_date, status, description, capital_call_item_id
        ) VALUES (
            v_call.organization_id, v_spe.project_id, v_socio.investor_id, 'aporte', p_valor,
            v_call.due_date, COALESCE(p_data, CURRENT_DATE), 'liquidado',
            'Chamada de capital: ' || v_call.title, p_item_id
        )
        RETURNING id INTO v_aporte;
    END IF;

    RETURN jsonb_build_object(
        'status', v_status,
        'amount_paid', v_pago,
        'aporte_id', v_aporte,
        'sem_obra', v_spe.project_id IS NULL
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_chamada_de_capital_registrar_pagamento(uuid, numeric, text, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_chamada_de_capital_registrar_pagamento(uuid, numeric, text, date) TO authenticated;
