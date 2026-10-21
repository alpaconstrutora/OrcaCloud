-- ============================================================================
-- Condomínio 010 - Galeria Altavista: organização própria + migração da operação
--
-- Plano: docs/planos/2026-10-21-sindico-operador-org-condominio.md (F1.4)
-- Depende de aplicar_20271021500000 (fundação), …500100 (funções de migração)
-- e …500200 (Portal do Síndico pela org do condomínio).
--
-- Decisões do usuário (21/10/2026):
--  - org própria "Condomínio Galeria Altavista", sem CNPJ por ora (preenche na
--    matriz depois); marca settings.tipo = 'CONDOMINIO';
--  - proprietários: altair.rosa@ e desenvolvedor@alpaconstrutora.com.br;
--    membros: bruna.pereira@ e agente-leitura@ (o síndico entra na F2, admin);
--  - migrar TODO o histórico da operação (o cadastro do prédio fica na Alpa).
--
-- Numeração: copia da Alpa a configuração dos tipos que o condomínio usa e os
-- contadores de escopo 010 — o próximo número segue a série (CTC-010-…,
-- CTS-010-036-…, PC-…), sem repetir.
--
-- Rodar PRIMEIRO num bloco desfeito (ensaio). Para desfazer depois de rodado:
-- fn_condominio_migracao_reverter('CONDO-010') e então apagar a org criada
-- (cascata leva matriz, membros, numeração e contadores dela).
-- Idempotente: recusa se o 010 já tiver organização própria.
-- ============================================================================

DO $executa$
DECLARE
    v_emp  uuid := '02c7e405-c632-4274-aea0-a90af917dcc0';
    v_src  uuid := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    v_org  uuid;
    v_mat  uuid;
    v_res  jsonb;
BEGIN
    IF (SELECT condominio_org_id FROM empreendimentos WHERE id = v_emp) IS NOT NULL THEN
        RAISE EXCEPTION 'O 010 já tem organização própria (%). Nada a fazer.', (SELECT condominio_org_id FROM empreendimentos WHERE id = v_emp);
    END IF;
    IF (SELECT organization_id FROM empreendimentos WHERE id = v_emp) IS DISTINCT FROM v_src THEN
        RAISE EXCEPTION 'O 010 não está mais na org de origem esperada.';
    END IF;

    -- 1. A organização (o gatilho cria a matriz 'condominio'); o criador é owner.
    SELECT (public.create_organization_v2('Condomínio Galeria Altavista', NULL, NULL, NULL, NULL, NULL, '{}'::jsonb,
            'altair.rosa@alpaconstrutora.com.br', '{"tipo":"CONDOMINIO"}'::jsonb)).id INTO v_org;
    UPDATE organizations SET code = public.get_next_organization_code() WHERE id = v_org AND code IS NULL;
    SELECT id INTO v_mat FROM companies WHERE org_id = v_org AND is_headquarters;
    IF v_mat IS NULL THEN RAISE EXCEPTION 'A matriz da org nova não foi criada.'; END IF;

    -- 2. Equipe (o gatilho preenche user_id pelo e-mail).
    INSERT INTO organization_members (organization_id, email, role, name)
    VALUES (v_org, 'desenvolvedor@alpaconstrutora.com.br', 'owner', 'Dev'),
           (v_org, 'bruna.pereira@alpaconstrutora.com.br', 'member', 'bruna.pereira'),
           (v_org, 'agente-leitura@alpaconstrutora.com.br', 'member', 'Claude Code')
    ON CONFLICT (organization_id, email) DO NOTHING;

    -- 3. Numeração dos tipos que o condomínio usa, e os contadores de escopo 010.
    INSERT INTO document_numbering_settings (organization_id, doc_type, slots, prefix, separator, seq_padding, year_suffix)
    SELECT v_org, doc_type, slots, prefix, separator, seq_padding, year_suffix
      FROM document_numbering_settings
     WHERE organization_id = v_src
       AND doc_type IN ('CONDO_RATEIO', 'PURCHASE_ORDER', 'QUOTATION', 'SERVICE_CONTRACT', 'SUPPLY_CONTRACT')
    ON CONFLICT DO NOTHING;
    INSERT INTO document_number_counters (organization_id, doc_type, scope_key, last_seq)
    SELECT v_org, doc_type, scope_key, last_seq
      FROM document_number_counters
     WHERE organization_id = v_src
       AND doc_type IN ('CONDO_RATEIO', 'PURCHASE_ORDER', 'QUOTATION', 'SERVICE_CONTRACT', 'SUPPLY_CONTRACT')
       AND scope_key ~ '(^|\|)010(\||$)'
    ON CONFLICT DO NOTHING;

    -- 4. Migrar a operação (conferência embutida: aborta se algo não bater).
    v_res := public.fn_condominio_migrar(v_emp, v_org, v_mat, 'CONDO-010');
    RAISE NOTICE 'Condomínio 010 → org % (matriz %): %', v_org, v_mat, v_res;
END
$executa$;
