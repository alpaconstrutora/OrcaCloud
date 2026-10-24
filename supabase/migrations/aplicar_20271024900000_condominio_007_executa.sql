-- ============================================================================
-- Condomínio 007 - Bella Vista: organização própria + migração da operação
--
-- Plano: docs/planos/2026-10-21-sindico-operador-org-condominio.md (F3)
-- Mesmo roteiro do 010 (aplicar_20271021500300). Depende de
-- aplicar_20271021500000 (fundação), …500100 (funções de migração) e
-- …500200 (Portal do Síndico pela org do condomínio).
--
-- Pedido de 24/10/2026: o síndico gerencia o condomínio PELO PORTAL, e o 007
-- estava só leitura porque operava dentro da org da Alpa. O síndico NÃO entra
-- nesta organização (não é da construtora); ela só separa os dados do
-- condomínio para o portal gravar sem cair na Alpa nem vazar o catálogo dela.
--
-- Decisões (21/10, valem para o 007 — "Histórico do 010/007: migrar tudo"):
--  - org "Condomínio Bella Vista", sem CNPJ por ora, settings.tipo = 'CONDOMINIO';
--  - proprietários: altair.rosa@ e desenvolvedor@alpaconstrutora.com.br;
--    membros: bruna.pereira@ e agente-leitura@ (equipe da Alpa, como no 010);
--  - os 9 títulos do 007 que estão em outra org ficam onde estão.
--
-- Ensaio (24/10): 0 bloqueios; 138 títulos = R$ 56.472,95; 187 boletos;
-- 167 notas; 1 contrato; 4 rateios; 16 ocupações. Não migra: 150 linhas de
-- extrato, 11 processos, 16 e-mails capturados.
--
-- Marcas dos equipamentos (achado na prova de 24/10): `fn_condominio_migrar`
-- desliga os gatilhos das tabelas que move (`fn_cm_gatilhos`), e a FK composta
-- `opura_assets (brand_id, organization_id)` (Marcas e Modelos, 13/10 — depois
-- da função) recusa levar o equipamento com a marca da Alpa (23503). Então:
--  A. ANTES, com gatilhos ligados: marca/modelo dos equipamentos do 007 vão a
--     NULL (o texto "Elevacon"/"EvoLed" fica) — lote CONDO-007-MARCAS-A;
--  B. DEPOIS: as marcas são COPIADAS para a org nova e religadas — lote
--     CONDO-007-MARCAS-B. (O 010 não tinha equipamento com marca.)
--
-- Para desfazer, NESTA ordem: fn_condominio_migracao_reverter('CONDO-007-MARCAS-B'),
-- ('CONDO-007'), ('CONDO-007-MARCAS-A') e então apagar a org criada.
-- Idempotente: recusa se o 007 já tiver organização própria.
-- ============================================================================

DO $executa$
DECLARE
    v_emp  uuid := 'fa0c02a5-c9c0-499d-bd32-a60b2eb332c9';
    v_src  uuid := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    v_org  uuid;
    v_mat  uuid;
    v_res  jsonb;
    v_ativos text[];
    v_marca  record;
    v_nova   uuid;
BEGIN
    IF (SELECT condominio_org_id FROM empreendimentos WHERE id = v_emp) IS NOT NULL THEN
        RAISE EXCEPTION 'O 007 já tem organização própria (%). Nada a fazer.', (SELECT condominio_org_id FROM empreendimentos WHERE id = v_emp);
    END IF;
    IF (SELECT organization_id FROM empreendimentos WHERE id = v_emp) IS DISTINCT FROM v_src THEN
        RAISE EXCEPTION 'O 007 não está mais na org de origem esperada.';
    END IF;

    -- 1. A organização (o gatilho cria a matriz 'condominio'); o criador é owner.
    SELECT (public.create_organization_v2('Condomínio Bella Vista', NULL, NULL, NULL, NULL, NULL, '{}'::jsonb,
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

    -- 3. Numeração dos tipos que o condomínio usa, e os contadores de escopo 007.
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
       AND scope_key ~ '(^|\|)007(\||$)'
    ON CONFLICT DO NOTHING;

    -- 4A. Marca/modelo dos equipamentos a NULL (gatilhos ligados: o texto fica).
    CREATE TEMP TABLE _marcas_007 ON COMMIT DROP AS
        SELECT id, brand_id FROM opura_assets
         WHERE empreendimento_id = v_emp AND organization_id = v_src AND brand_id IS NOT NULL;
    v_ativos := ARRAY(SELECT id::text FROM opura_assets
                       WHERE empreendimento_id = v_emp AND organization_id = v_src AND model_id IS NOT NULL);
    PERFORM public.fn_cm_aplicar('CONDO-007-MARCAS-A', 'opura_assets', 'model_id', v_ativos, NULL);
    PERFORM public.fn_cm_aplicar('CONDO-007-MARCAS-A', 'opura_assets', 'brand_id',
        ARRAY(SELECT id::text FROM _marcas_007), NULL);

    -- 4. Migrar a operação (conferência embutida: aborta se algo não bater).
    v_res := public.fn_condominio_migrar(v_emp, v_org, v_mat, 'CONDO-007');
    RAISE NOTICE 'Condomínio 007 → org % (matriz %): %', v_org, v_mat, v_res;

    -- 4B. Marcas copiadas para a org nova e religadas.
    FOR v_marca IN SELECT DISTINCT b.id, b.name, b.is_active
                     FROM _marcas_007 m JOIN product_brands b ON b.id = m.brand_id LOOP
        INSERT INTO product_brands (organization_id, name, is_active)
        VALUES (v_org, v_marca.name, v_marca.is_active)
        RETURNING id INTO v_nova;
        INSERT INTO condominio_migracao_registro (lote, tabela, registro_id, coluna, valor_antigo, valor_novo)
        VALUES ('CONDO-007-MARCAS-B', 'product_brands', v_nova::text, '__copia__', v_marca.id::text, v_org::text);
        PERFORM public.fn_cm_aplicar('CONDO-007-MARCAS-B', 'opura_assets', 'brand_id',
            ARRAY(SELECT id::text FROM _marcas_007 WHERE brand_id = v_marca.id), v_nova::text);
    END LOOP;
    IF EXISTS (SELECT 1 FROM opura_assets a JOIN _marcas_007 m ON m.id = a.id WHERE a.brand_id IS NULL) THEN
        RAISE EXCEPTION 'Equipamento do 007 ficou sem a marca depois da cópia.';
    END IF;
END
$executa$;
