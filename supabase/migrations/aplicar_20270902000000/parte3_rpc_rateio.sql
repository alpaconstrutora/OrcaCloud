-- ═════════════════════════════════════════════════════════════════════════════
-- OPEX por imóvel — PARTE 3 de 4: RPC de escrita do rateio
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar DEPOIS da parte 2 terminar.
--
-- ── O invariante ─────────────────────────────────────────────────────────────
--     SUM(allocations.amount) = internal_transactions.amount, SEMPRE.
--
-- É ele que impede o rateio de inventar ou sumir com despesa no NOI
-- consolidado. Um erro de centavo por unidade, em 200 unidades, vira R$ 2 de
-- despesa fantasma por lançamento — e ninguém descobre olhando a tela, só
-- fechando o mês.
--
-- A DIVISÃO é feita no cliente (lib/rentalAllocation.ts, com testes), porque lá
-- ela é testável de verdade. Esta RPC não confia nisso: revalida a soma no
-- servidor e RECUSA o conjunto que não fecha. Cliente com bug não corrompe o
-- razão — no máximo falha ruidosamente.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_set_property_allocations(
    p_transaction_id UUID,
    p_mode           TEXT,
    p_allocations    JSONB   -- [{"property_id": "...", "amount": 1234.56, "basis": "PRIVATE_AREA", "basis_value": 45.5}]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER          -- respeita a RLS de quem chamou: não é caminho para escrever em org alheia
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org       UUID;
    v_amount    NUMERIC(15,2);
    v_sum       NUMERIC(15,2);
    v_count     INTEGER;
BEGIN
    IF p_mode NOT IN ('DIRECT', 'PRORATED') THEN
        RAISE EXCEPTION 'Modo de rateio invalido: %', p_mode
            USING ERRCODE = '22023';
    END IF;

    -- A RLS de `internal_transactions` já recorta o que este usuário enxerga:
    -- lançamento de outra organização simplesmente não aparece aqui.
    SELECT organization_id, amount
      INTO v_org, v_amount
      FROM public.internal_transactions
     WHERE id = p_transaction_id;

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Lancamento % nao encontrado ou sem acesso', p_transaction_id
            USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(SUM((a->>'amount')::NUMERIC), 0), COUNT(*)
      INTO v_sum, v_count
      FROM jsonb_array_elements(p_allocations) AS a;

    -- Lista vazia = "desfazer a apropriação deste lançamento". Legítimo, e
    -- diferente de um rateio que não fecha.
    IF v_count > 0 AND v_sum <> v_amount THEN
        RAISE EXCEPTION
            'Rateio nao fecha: soma % difere do lancamento % (diferenca %)',
            v_sum, v_amount, (v_amount - v_sum)
            USING ERRCODE = '23514';
    END IF;

    -- Substituição atômica: trocar o modo de um lançamento já salvo não pode
    -- deixar linha da distribuição anterior para trás.
    DELETE FROM public.property_expense_allocations
     WHERE transaction_id = p_transaction_id;

    IF v_count > 0 THEN
        INSERT INTO public.property_expense_allocations
            (organization_id, transaction_id, property_id, amount, basis, basis_value)
        SELECT
            v_org,
            p_transaction_id,
            (a->>'property_id')::UUID,
            (a->>'amount')::NUMERIC,
            COALESCE(a->>'basis', 'DIRECT'),
            NULLIF(a->>'basis_value', '')::NUMERIC
        FROM jsonb_array_elements(p_allocations) AS a;
    END IF;

    UPDATE public.internal_transactions
       SET property_allocation_mode = p_mode
     WHERE id = p_transaction_id;

    RETURN v_count;
END;
$$;

-- RPC nova = REVOKE PUBLIC. E o REVOKE nominal de `anon` é o que fecha de fato:
-- o Supabase mantém `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated` no schema public, então revogar de PUBLIC não basta —
-- lição da parte 6 de Garantias F1.
REVOKE ALL ON FUNCTION public.fn_set_property_allocations(UUID, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.fn_set_property_allocations(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_set_property_allocations(UUID, TEXT, JSONB) TO authenticated;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- Deve listar SOMENTE `authenticated`:
-- SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--  WHERE routine_name = 'fn_set_property_allocations';
--
-- O invariante deve RECUSAR um rateio torto (troque o UUID por um real):
-- SELECT public.fn_set_property_allocations(
--     '<uuid-de-um-lancamento>', 'DIRECT',
--     '[{"property_id":"<uuid-imovel>","amount":0.01,"basis":"DIRECT"}]'::jsonb);
-- → tem de dar ERRO "Rateio nao fecha", a menos que o lançamento valha 0,01.
