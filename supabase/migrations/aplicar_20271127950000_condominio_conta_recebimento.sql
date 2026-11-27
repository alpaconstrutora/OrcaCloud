-- ============================================================================
-- Condomínio › Financeiro: "Conta de recebimento" (27/11/2026)
--
-- Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
--
-- A emissão dos boletos da cota (Edge `asaas-charge`) não pergunta a conta: usa
-- `fn_conta_asaas_da_org(org do condomínio)` com a service_role — a conta Asaas ativa
-- da própria org ou, sem ela, a de outra org marcada "Atende também". A tela não tinha
-- como mostrar isso: chamada pelo navegador, a mesma função roda com a RLS de
-- `payment_account_gateway` (só a org DONA vê a linha) e a conta emprestada some —
-- o quadro diria "sem conta" enquanto a emissão usaria uma.
--
-- `condominio_conta_recebimento(p_org)` responde o que a emissão vai usar, com os dados
-- para a tela (nome, org dona, ambiente) e o problema quando há mais de uma (a mesma
-- frase da recusa). Não devolve chave nem erro da Asaas.
--
-- Por que não basta chamar `fn_conta_asaas_da_org` aqui dentro: o 2º passo dela
-- (`fn_conta_atende_org` → `fn_orgs_atendidas_pela_conta`) devolve vazio para quem tem
-- papel `authenticated` e não é membro da org DONA da conta — mesmo em SECURITY DEFINER,
-- porque olha `auth.role()`. Para org de CONDOMÍNIO a conta que atende é só a dona ou um
-- vínculo explícito em `payment_account_organizations` (o "atende todas" não alcança
-- condomínio desde 21/10/2026, "caixa próprio") — exatamente `fn_sindico_conta_atende`,
-- que o portal já usa. O 1º passo (conta da própria org) e as frases de recusa seguem
-- os da emissão.
--
-- REGRA #7: SECURITY DEFINER com a autorização dentro (membro da org ou superadmin);
-- REVOKE de PUBLIC/anon. Reverter: DROP FUNCTION.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.condominio_conta_recebimento(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id  uuid;
    v_ids uuid[];
    v_r   record;
    v_nom text;
BEGIN
    IF p_org IS NULL OR NOT (p_org IN (SELECT public.minhas_orgs_membro()) OR public.is_superadmin()) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sem acesso a esta organização.');
    END IF;
    SELECT name INTO v_nom FROM public.organizations WHERE id = p_org;
    BEGIN
        v_id := public.fn_conta_asaas_da_org(p_org);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        RETURN jsonb_build_object('ok', true, 'orgNome', v_nom, 'conta', NULL, 'problema', SQLERRM);
    END;
    -- Conta emprestada a condomínio (ver o cabeçalho): sem a trava de membro da dona.
    IF v_id IS NULL AND public.fn_org_eh_condominio(p_org) THEN
        SELECT array_agg(g.payment_account_id) INTO v_ids
          FROM public.payment_account_gateway g
         WHERE g.ativo AND g.provider = 'asaas'
           AND public.fn_sindico_conta_atende(g.payment_account_id, p_org);
        IF array_length(v_ids, 1) > 1 THEN
            RETURN jsonb_build_object('ok', true, 'orgNome', v_nom, 'conta', NULL, 'problema',
                'Mais de uma conta Asaas atende esta organização — deixe só uma com "Atende também".');
        END IF;
        v_id := v_ids[1];
    END IF;
    IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'orgNome', v_nom, 'conta', NULL);
    END IF;
    SELECT pa.name, pa.organization_id, o.name AS org_nome, g.env
      INTO v_r
      FROM public.payment_accounts pa
      JOIN public.payment_account_gateway g ON g.payment_account_id = pa.id
      JOIN public.organizations o ON o.id = pa.organization_id
     WHERE pa.id = v_id;
    RETURN jsonb_build_object('ok', true, 'orgNome', v_nom, 'conta', jsonb_build_object(
        'id', v_id, 'nome', v_r.name, 'propria', v_r.organization_id = p_org,
        'orgDona', v_r.org_nome, 'ambiente', v_r.env));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.condominio_conta_recebimento(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.condominio_conta_recebimento(uuid) TO authenticated;
