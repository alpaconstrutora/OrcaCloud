-- VERIFICAÇÃO 1.4b — emitir credencial de portal exige owner/admin DA organização.
-- Termina em RAISE EXCEPTION: qualquer token gerado no meio é descartado.
BEGIN;

-- Alvos reais: um cliente e a organização dona dele; e um gestor legítimo dela.
SELECT set_config('v.client', (SELECT id::text FROM clients WHERE organization_id IS NOT NULL AND NOT coalesce(is_shared,false) ORDER BY id LIMIT 1), true);
SELECT set_config('v.org',    (SELECT organization_id::text FROM clients WHERE organization_id IS NOT NULL AND NOT coalesce(is_shared,false) ORDER BY id LIMIT 1), true);
SELECT set_config('v.gestor', (SELECT om.email FROM organization_members om
                                WHERE om.organization_id = (SELECT organization_id FROM clients WHERE organization_id IS NOT NULL AND NOT coalesce(is_shared,false) ORDER BY id LIMIT 1)
                                  AND om.role IN ('owner','admin') ORDER BY om.email LIMIT 1), true);
SELECT set_config('v.membro', (SELECT om.email FROM organization_members om
                                WHERE om.role = 'member' ORDER BY om.email LIMIT 1), true);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_client uuid := current_setting('v.client')::uuid;
    v_org    uuid := current_setting('v.org')::uuid;
    v_gestor text := current_setting('v.gestor');
    v_membro text := nullif(current_setting('v.membro'), '');
    r_gestor text; r_membro text; r_estranho text; r_anon text;
BEGIN
    -- 1) Gestor da organização: TEM de conseguir.
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','email',v_gestor)::text, true);
    BEGIN
        PERFORM client_portal_generate_token(v_client, v_org);
        r_gestor := 'EMITIU (esperado)';
    EXCEPTION WHEN OTHERS THEN r_gestor := 'RECUSOU — ' || SQLERRM || '  <-- REGRESSAO!';
    END;

    -- 2) Membro comum da mesma organização: não deve conseguir.
    IF v_membro IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','email',v_membro)::text, true);
        BEGIN
            PERFORM client_portal_generate_token(v_client, v_org);
            r_membro := 'EMITIU  <-- FALHA: membro comum nao deveria';
        EXCEPTION WHEN OTHERS THEN r_membro := 'recusado (' || SQLERRM || ')';
        END;
    ELSE
        r_membro := '(nenhum membro comum no banco para testar)';
    END IF;

    -- 3) Usuário sem vínculo nenhum: não deve conseguir.
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"poc-sem-vinculo@exemplo-invalido.test"}', true);
    BEGIN
        PERFORM client_portal_generate_token(v_client, v_org);
        r_estranho := 'EMITIU  <-- FALHA';
    EXCEPTION WHEN OTHERS THEN r_estranho := 'recusado (' || SQLERRM || ')';
    END;

    RAISE EXCEPTION E'\n=== VERIFICACAO 1.4b (transacao abortada) ===\n'
        'Cliente alvo: %  | organizacao: %\n'
        '  gestor da org (%)      : %\n'
        '  membro comum (%)       : %\n'
        '  sem vinculo            : %\n'
        '=== fim ===',
        v_client, v_org, v_gestor, r_gestor, coalesce(v_membro,'-'), r_membro, r_estranho;
END $$;

ROLLBACK;
