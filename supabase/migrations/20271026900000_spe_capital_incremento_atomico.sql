-- Incremento atômico dos totalizadores de capital do sócio de SPE (26/10/2026).
--
-- `speService.addCapitalCall` chamava `increment_spe_capital_call`, que nunca foi
-- criada, e caía num fallback "lê, soma, grava" sem conferir erro;
-- `addCapitalPayment` fazia o mesmo lê-soma-grava direto. Efeitos:
--   * `capitalCallService.createCall` dispara os incrementos em paralelo — dois
--     para o mesmo sócio liam o mesmo total e um se perdia;
--   * a RLS de `spe_partners` só deixa owner/admin gravar; para membro comum o
--     UPDATE pegava 0 linhas, sem erro, e o total ficava errado calado.
--
-- As duas funções são SECURITY INVOKER: valem as MESMAS policies de
-- `spe_partners` de quem chama (nenhuma permissão nova). Linha não alterada
-- (sócio inexistente ou fora do alcance da RLS) vira erro 42501, em vez de
-- sucesso silencioso.

CREATE OR REPLACE FUNCTION public.increment_spe_capital_call(p_partner_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_total numeric;
BEGIN
    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'Valor da chamada de capital não pode ser negativo'
            USING ERRCODE = '22023';
    END IF;

    UPDATE spe_partners
       SET capital_calls_total = capital_calls_total + p_amount
     WHERE id = p_partner_id
    RETURNING capital_calls_total INTO v_total;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sócio de SPE não encontrado ou sem permissão para alterá-lo'
            USING ERRCODE = '42501';
    END IF;

    RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_spe_capital_paid(p_partner_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_total numeric;
BEGIN
    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'Valor do pagamento de capital não pode ser negativo'
            USING ERRCODE = '22023';
    END IF;

    UPDATE spe_partners
       SET capital_paid = capital_paid + p_amount
     WHERE id = p_partner_id
    RETURNING capital_paid INTO v_total;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sócio de SPE não encontrado ou sem permissão para alterá-lo'
            USING ERRCODE = '42501';
    END IF;

    RETURN v_total;
END;
$$;

-- REGRA #7: o Postgres dá EXECUTE a PUBLIC e o Supabase dá grant nominal a anon.
REVOKE ALL ON FUNCTION public.increment_spe_capital_call(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.increment_spe_capital_call(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_spe_capital_call(uuid, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.increment_spe_capital_paid(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.increment_spe_capital_paid(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_spe_capital_paid(uuid, numeric) TO authenticated;
