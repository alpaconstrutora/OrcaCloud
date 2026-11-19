-- Imovib › Versões: editar (tudo) e excluir enquanto não publicada.
-- Plano: docs/planos/2026-11-19-imovib-versoes-editar-excluir.md (Fase 1).
--
-- Regra: versão PUBLICADA (oportunidade com imovib_version_id = versão e is_published) é só leitura;
-- as demais podem ser alteradas e excluídas. "Editar tudo" usa o próprio estudo como editor:
--   iniciar  → guarda a cópia de segurança do estudo e carrega a versão nele;
--   salvar   → regrava a mesma versão e devolve o estudo à cópia de segurança;
--   descartar→ devolve o estudo à cópia de segurança.
-- Enquanto a edição está aberta, só quem a abriu grava no estudo e nas tabelas dele.
--
-- Reverter:
--   DROP FUNCTION public.imovib_versao_iniciar_edicao(uuid, jsonb);
--   DROP FUNCTION public.imovib_versao_salvar_edicao(uuid, jsonb, jsonb);
--   DROP FUNCTION public.imovib_versao_descartar_edicao(uuid);
--   DROP FUNCTION public.fn_imovib_aplicar_retrato(uuid, jsonb);
--   DROP FUNCTION public.fn_imovib_substituir_filhos(text, uuid, jsonb);
--   (gatilhos trg_imovib_trava_edicao_* , trg_imovib_versao_trava_publicada,
--    trg_investor_opportunity_versao_em_edicao e suas funções)
--   DROP POLICY imovib_study_versions_update / _delete ON public.imovib_study_versions;
--   ALTER TABLE public.imovib_study_versions DROP COLUMN updated_at, DROP COLUMN updated_by;
--   ALTER TABLE public.imovib_studies DROP COLUMN edicao_versao;

-- ── 1. Colunas ───────────────────────────────────────────────────────────────
ALTER TABLE public.imovib_study_versions
    ADD COLUMN IF NOT EXISTS updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS edicao_versao jsonb;

COMMENT ON COLUMN public.imovib_studies.edicao_versao IS
    'Edição de versão em aberto: {version_id, version_label, started_by, started_by_name, started_at, backup}. Só as RPCs imovib_versao_* gravam.';

-- ── 2. Policies de UPDATE/DELETE da versão (por conjunto, REGRA #7 + memória "RLS por conjunto") ──
DROP POLICY IF EXISTS imovib_study_versions_update ON public.imovib_study_versions;
CREATE POLICY imovib_study_versions_update ON public.imovib_study_versions
    FOR UPDATE TO authenticated
    USING (study_id IN (SELECT s.id FROM public.imovib_studies s WHERE s.organization_id IN (SELECT public.minhas_orgs_membro())))
    WITH CHECK (study_id IN (SELECT s.id FROM public.imovib_studies s WHERE s.organization_id IN (SELECT public.minhas_orgs_membro())));

DROP POLICY IF EXISTS imovib_study_versions_delete ON public.imovib_study_versions;
CREATE POLICY imovib_study_versions_delete ON public.imovib_study_versions
    FOR DELETE TO authenticated
    USING (study_id IN (SELECT s.id FROM public.imovib_studies s WHERE s.organization_id IN (SELECT public.minhas_orgs_membro())));

-- ── 3. Versão publicada é só leitura; excluir limpa a escolha dos rascunhos ───
CREATE OR REPLACE FUNCTION public.fn_imovib_versao_trava_publicada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_titulo text;
BEGIN
    SELECT o.title INTO v_titulo
    FROM public.investor_opportunities o
    WHERE o.imovib_version_id = OLD.id AND COALESCE(o.is_published, FALSE)
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Versão publicada na oportunidade «%» — só leitura.', COALESCE(v_titulo, 'sem título')
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        UPDATE public.investor_opportunities SET imovib_version_id = NULL WHERE imovib_version_id = OLD.id;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_versao_trava_publicada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_imovib_versao_trava_publicada ON public.imovib_study_versions;
CREATE TRIGGER trg_imovib_versao_trava_publicada
    BEFORE UPDATE OR DELETE ON public.imovib_study_versions
    FOR EACH ROW EXECUTE FUNCTION public.fn_imovib_versao_trava_publicada();

-- ── 4. Publicar com a versão em edição é recusado ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_investor_opportunity_versao_em_edicao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_label text;
BEGIN
    IF NOT COALESCE(NEW.is_published, FALSE) OR NEW.imovib_version_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT s.edicao_versao->>'version_label' INTO v_label
    FROM public.imovib_studies s
    WHERE s.edicao_versao IS NOT NULL
      AND (s.edicao_versao->>'version_id')::uuid = NEW.imovib_version_id;
    IF FOUND THEN
        RAISE EXCEPTION 'A versão «%» está em edição no estudo — salve ou descarte antes de publicar.', COALESCE(v_label, '')
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_opportunity_versao_em_edicao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_investor_opportunity_versao_em_edicao ON public.investor_opportunities;
CREATE TRIGGER trg_investor_opportunity_versao_em_edicao
    BEFORE INSERT OR UPDATE ON public.investor_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.fn_investor_opportunity_versao_em_edicao();

-- ── 5. Só quem abriu a edição grava no estudo e nas tabelas dele ──────────────
CREATE OR REPLACE FUNCTION public.fn_imovib_trava_edicao_de_outro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_row     record;
    v_study   uuid;
    v_edicao  jsonb;
BEGIN
    IF current_setting('app.imovib_aplicando', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    v_row := COALESCE(NEW, OLD);

    IF TG_TABLE_NAME = 'imovib_studies' THEN
        v_study := v_row.id;
    ELSIF TG_TABLE_NAME = 'imovib_units' THEN
        SELECT b.study_id INTO v_study FROM public.imovib_blocks b WHERE b.id = v_row.block_id;
    ELSE
        v_study := v_row.study_id;
    END IF;

    SELECT s.edicao_versao INTO v_edicao FROM public.imovib_studies s WHERE s.id = v_study;
    IF v_edicao IS NOT NULL AND (v_edicao->>'started_by')::uuid IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION '«%» está editando a versão «%» — o estudo está só para leitura.',
            COALESCE(v_edicao->>'started_by_name', 'Outra pessoa'), COALESCE(v_edicao->>'version_label', '')
            USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_trava_edicao_de_outro() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['imovib_studies','imovib_blocks','imovib_units','imovib_capex_items','imovib_funding_sources',
                             'imovib_scenarios','imovib_risks','imovib_market_comparables','imovib_land_checklist',
                             'imovib_partners','imovib_regulatory_zones']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_imovib_trava_edicao_%1$s ON public.%1$I', t);
        EXECUTE format('CREATE TRIGGER trg_imovib_trava_edicao_%1$s BEFORE INSERT OR UPDATE OR DELETE ON public.%1$I
                        FOR EACH ROW EXECUTE FUNCTION public.fn_imovib_trava_edicao_de_outro()', t);
    END LOOP;
END $$;

-- ── 6. Aplicar uma cópia ao estudo (interna) ──────────────────────────────────
-- Tabela "folha" (nada aponta para ela): substituída por inteiro, mantendo os ids. Cada linha da cópia
-- é completada com a linha atual de mesmo id (colunas que a leitura do app não traz, como created_by).
CREATE OR REPLACE FUNCTION public.fn_imovib_substituir_filhos(p_tabela text, p_study uuid, p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_linhas jsonb;
BEGIN
    IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
        RETURN; -- parte ausente da cópia: tabela intocada
    END IF;
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(to_jsonb(jsonb_populate_record(a, e || jsonb_build_object(''study_id'', $1)))), ''[]''::jsonb)
           FROM jsonb_array_elements($2) e
           LEFT JOIN public.%1$I a ON a.id = (e->>''id'')::uuid AND a.study_id = $1', p_tabela)
        INTO v_linhas USING p_study, p_linhas;
    EXECUTE format('DELETE FROM public.%1$I WHERE study_id = $1', p_tabela) USING p_study;
    EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_recordset(NULL::public.%1$I, $1)', p_tabela)
        USING v_linhas;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_substituir_filhos(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_imovib_aplicar_retrato(p_study_id uuid, p_retrato jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    -- Identidade, governança (parecer/critérios) e a própria edição não vêm da cópia.
    v_protegidas text[] := ARRAY['id','organization_id','name','version','created_at','updated_at','edicao_versao',
        'recommendation','recommendation_notes','recommended_by','recommended_at','recommended_by_user_id',
        'recommendation_snapshot','hurdle_irr_spread','hurdle_margin_percent','hurdle_max_exposure'];
    v_cols text;
    v_rel  jsonb := p_retrato->'relatorio';
    v_b    jsonb;
    v_u    jsonb;
BEGIN
    PERFORM set_config('app.imovib_aplicando', 'on', true);

    -- Premissas: colunas do estudo presentes na cópia, exceto as protegidas.
    SELECT string_agg(format('%1$I = r.%1$I', a.attname), ', ') INTO v_cols
    FROM pg_attribute a
    WHERE a.attrelid = 'public.imovib_studies'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname <> ALL (v_protegidas) AND p_retrato ? a.attname;
    IF v_cols IS NOT NULL THEN
        EXECUTE format('UPDATE public.imovib_studies s SET %s
                          FROM (SELECT (jsonb_populate_record(x, $2)).* FROM public.imovib_studies x WHERE x.id = $1) r
                         WHERE s.id = $1', v_cols)
            USING p_study_id, p_retrato;
    END IF;

    PERFORM public.fn_imovib_substituir_filhos('imovib_scenarios', p_study_id, p_retrato->'cenarios');
    PERFORM public.fn_imovib_substituir_filhos('imovib_market_comparables', p_study_id, v_rel->'comparaveis');
    PERFORM public.fn_imovib_substituir_filhos('imovib_risks', p_study_id, v_rel->'riscos');
    PERFORM public.fn_imovib_substituir_filhos('imovib_land_checklist', p_study_id, v_rel->'dueDiligence');
    PERFORM public.fn_imovib_substituir_filhos('imovib_partners', p_study_id, v_rel->'socios');
    PERFORM public.fn_imovib_substituir_filhos('imovib_capex_items', p_study_id, p_retrato->'capex_items');
    PERFORM public.fn_imovib_substituir_filhos('imovib_funding_sources', p_study_id, p_retrato->'funding_sources');

    -- Blocos e unidades: só UPDATE onde o id existe (apagar levaria o espelho de vendas junto).
    -- Ids que não são uuid (torre:… da estrutura do empreendimento) são ignorados.
    IF jsonb_typeof(p_retrato->'blocks') = 'array' THEN
        FOR v_b IN SELECT * FROM jsonb_array_elements(p_retrato->'blocks') LOOP
            CONTINUE WHEN COALESCE(v_b->>'id', '') !~ '^[0-9a-fA-F-]{36}$';
            UPDATE public.imovib_blocks b SET
                name = COALESCE(v_b->>'name', b.name),
                construction_cost_sqm = CASE WHEN v_b ? 'construction_cost_sqm' THEN (v_b->>'construction_cost_sqm')::numeric ELSE b.construction_cost_sqm END,
                sales_price_sqm = CASE WHEN v_b ? 'sales_price_sqm' THEN (v_b->>'sales_price_sqm')::numeric ELSE b.sales_price_sqm END
            WHERE b.id = (v_b->>'id')::uuid AND b.study_id = p_study_id;
            IF jsonb_typeof(v_b->'units') = 'array' THEN
                FOR v_u IN SELECT * FROM jsonb_array_elements(v_b->'units') LOOP
                    CONTINUE WHEN COALESCE(v_u->>'id', '') !~ '^[0-9a-fA-F-]{36}$';
                    UPDATE public.imovib_units u SET
                        (name, quantity, private_area, common_area, pavimentos, is_vendavel) =
                        (SELECT r.name, r.quantity, r.private_area, r.common_area, r.pavimentos, r.is_vendavel
                           FROM jsonb_populate_record(u, v_u - 'id' - 'block_id') r)
                    WHERE u.id = (v_u->>'id')::uuid AND u.block_id = (v_b->>'id')::uuid;
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    PERFORM set_config('app.imovib_aplicando', 'off', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_aplicar_retrato(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 7. RPCs ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.imovib_versao_iniciar_edicao(p_version_id uuid, p_backup jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_ver public.imovib_study_versions;
    v_aberta jsonb;
    v_titulo text;
BEGIN
    SELECT * INTO v_ver FROM public.imovib_study_versions WHERE id = p_version_id;
    IF NOT FOUND OR NOT public.imovib_unit_instance_org_check(v_ver.study_id) THEN
        RAISE EXCEPTION 'Versão não encontrada ou sem permissão.' USING ERRCODE = '42501';
    END IF;
    SELECT o.title INTO v_titulo FROM public.investor_opportunities o
     WHERE o.imovib_version_id = p_version_id AND COALESCE(o.is_published, FALSE) LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Versão publicada na oportunidade «%» — só leitura.', COALESCE(v_titulo, 'sem título') USING ERRCODE = '23514';
    END IF;
    SELECT edicao_versao INTO v_aberta FROM public.imovib_studies WHERE id = v_ver.study_id FOR UPDATE;
    IF v_aberta IS NOT NULL THEN
        RAISE EXCEPTION 'Já há uma edição aberta neste estudo (versão «%»).', v_aberta->>'version_label' USING ERRCODE = '23514';
    END IF;
    IF p_backup IS NULL OR jsonb_typeof(p_backup) <> 'object' THEN
        RAISE EXCEPTION 'Cópia de segurança do estudo ausente.' USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.imovib_aplicando', 'on', true);
    UPDATE public.imovib_studies SET edicao_versao = jsonb_build_object(
        'version_id', v_ver.id, 'version_label', v_ver.label, 'started_by', auth.uid(),
        'started_by_name', COALESCE(auth.jwt()->'user_metadata'->>'full_name', auth.jwt()->'user_metadata'->>'name', auth.jwt()->>'email'),
        'started_at', now(), 'backup', p_backup)
    WHERE id = v_ver.study_id;
    PERFORM public.fn_imovib_aplicar_retrato(v_ver.study_id, v_ver.snapshot);
END;
$function$;

CREATE OR REPLACE FUNCTION public.imovib_versao_salvar_edicao(p_study_id uuid, p_snapshot jsonb, p_results jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_ed jsonb;
BEGIN
    IF NOT public.imovib_unit_instance_org_check(p_study_id) THEN
        RAISE EXCEPTION 'Sem permissão neste estudo.' USING ERRCODE = '42501';
    END IF;
    SELECT edicao_versao INTO v_ed FROM public.imovib_studies WHERE id = p_study_id FOR UPDATE;
    IF v_ed IS NULL THEN
        RAISE EXCEPTION 'Não há edição de versão aberta neste estudo.' USING ERRCODE = '23514';
    END IF;
    IF (v_ed->>'started_by')::uuid IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Só quem abriu a edição («%») pode salvar.', v_ed->>'started_by_name' USING ERRCODE = '42501';
    END IF;

    -- O gatilho trava_publicada recusa se a versão estiver publicada.
    UPDATE public.imovib_study_versions
       SET snapshot = p_snapshot, results = p_results, updated_at = now(), updated_by = auth.uid()
     WHERE id = (v_ed->>'version_id')::uuid AND study_id = p_study_id;

    PERFORM public.fn_imovib_aplicar_retrato(p_study_id, v_ed->'backup');
    PERFORM set_config('app.imovib_aplicando', 'on', true);
    UPDATE public.imovib_studies SET edicao_versao = NULL WHERE id = p_study_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.imovib_versao_descartar_edicao(p_study_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_ed jsonb;
    v_admin boolean;
BEGIN
    IF NOT public.imovib_unit_instance_org_check(p_study_id) AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Sem permissão neste estudo.' USING ERRCODE = '42501';
    END IF;
    SELECT edicao_versao INTO v_ed FROM public.imovib_studies WHERE id = p_study_id FOR UPDATE;
    IF v_ed IS NULL THEN
        RETURN; -- nada aberto: descartar de novo não é erro
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.imovib_studies s
        JOIN public.organization_members om ON om.organization_id = s.organization_id
        WHERE s.id = p_study_id AND om.email = auth.jwt()->>'email' AND om.role IN ('admin', 'owner')
    ) OR public.is_superadmin() INTO v_admin;
    IF (v_ed->>'started_by')::uuid IS DISTINCT FROM auth.uid() AND NOT v_admin THEN
        RAISE EXCEPTION 'Só quem abriu a edição («%») ou um administrador pode descartar.', v_ed->>'started_by_name' USING ERRCODE = '42501';
    END IF;

    PERFORM public.fn_imovib_aplicar_retrato(p_study_id, v_ed->'backup');
    PERFORM set_config('app.imovib_aplicando', 'on', true);
    UPDATE public.imovib_studies SET edicao_versao = NULL WHERE id = p_study_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.imovib_versao_iniciar_edicao(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.imovib_versao_salvar_edicao(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.imovib_versao_descartar_edicao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imovib_versao_iniciar_edicao(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imovib_versao_salvar_edicao(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imovib_versao_descartar_edicao(uuid) TO authenticated;
