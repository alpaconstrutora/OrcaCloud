-- Imovib › Versões — correções da revisão final do branch (19/11/2026).
-- Plano: docs/planos/2026-11-19-imovib-versoes-editar-excluir.md. Corrige a migration
-- aplicar_20271119920000 (já aplicada):
--   C1  edicao_versao só muda pelas RPCs: gatilho preserva a coluna em qualquer outro UPDATE
--       (uma aba antiga salvando Premissas apagava a cópia de segurança, ou ressuscitava uma edição).
--   I1  restauração de unidades só em blocos do próprio estudo (a cópia vem do cliente).
--   I2  salvar recusa se a versão sumiu; excluir recusa versão em edição.
--   I3  durante a edição, torre/tipologia não se cria nem se exclui.
--   I4  UPDATE da versão pelo cliente só em label e notes (snapshot/results só pela RPC).
-- Reverter: reaplicar as funções de aplicar_20271119920000; DROP TRIGGER trg_imovib_protege_edicao_versao
--   ON imovib_studies; DROP FUNCTION fn_imovib_protege_edicao_versao(); GRANT UPDATE ON imovib_study_versions TO authenticated.

-- C1
CREATE OR REPLACE FUNCTION public.fn_imovib_protege_edicao_versao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF current_setting('app.imovib_aplicando', true) IS DISTINCT FROM 'on' THEN
        NEW.edicao_versao := OLD.edicao_versao;
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_protege_edicao_versao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_imovib_protege_edicao_versao ON public.imovib_studies;
CREATE TRIGGER trg_imovib_protege_edicao_versao
    BEFORE UPDATE ON public.imovib_studies
    FOR EACH ROW EXECUTE FUNCTION public.fn_imovib_protege_edicao_versao();

-- I4
REVOKE UPDATE ON public.imovib_study_versions FROM authenticated;
GRANT UPDATE (label, notes) ON public.imovib_study_versions TO authenticated;

-- I2 (excluir em edição)
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

    IF TG_OP = 'DELETE' AND EXISTS (
        SELECT 1 FROM public.imovib_studies s
        WHERE s.edicao_versao IS NOT NULL AND (s.edicao_versao->>'version_id')::uuid = OLD.id
    ) THEN
        RAISE EXCEPTION 'A versão «%» está em edição no estudo — salve ou descarte a edição antes de excluir.', OLD.label
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        UPDATE public.investor_opportunities SET imovib_version_id = NULL WHERE imovib_version_id = OLD.id;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

-- I3
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
    -- Revisão (I3): durante a edição, torre/tipologia não se cria nem se exclui — nem por quem editou:
    -- a restauração não recria bloco apagado e o espelho de vendas cairia junto (CASCADE).
    IF v_edicao IS NOT NULL AND TG_TABLE_NAME IN ('imovib_blocks', 'imovib_units') AND TG_OP IN ('INSERT', 'DELETE') THEN
        RAISE EXCEPTION 'Durante a edição da versão «%», torres e tipologias não se criam nem se excluem — salve ou descarte a edição antes.',
            COALESCE(v_edicao->>'version_label', '')
            USING ERRCODE = '23514';
    END IF;
    IF v_edicao IS NOT NULL AND (v_edicao->>'started_by')::uuid IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION '«%» está editando a versão «%» — o estudo está só para leitura.',
            COALESCE(v_edicao->>'started_by_name', 'Outra pessoa'), COALESCE(v_edicao->>'version_label', '')
            USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- I1
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
                    WHERE u.id = (v_u->>'id')::uuid AND u.block_id = (v_b->>'id')::uuid
                      -- Revisão (I1): só unidades de blocos DESTE estudo (a cópia vem do cliente).
                      AND u.block_id IN (SELECT b.id FROM public.imovib_blocks b WHERE b.study_id = p_study_id);
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    PERFORM set_config('app.imovib_aplicando', 'off', true);
END;
$function$;

-- I2 (salvar sem versão)
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
    -- Revisão (I2): versão que sumiu não pode virar "salvo" com o trabalho perdido.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'A versão em edição não existe mais — descarte a edição para devolver o estudo.' USING ERRCODE = '23514';
    END IF;

    PERFORM public.fn_imovib_aplicar_retrato(p_study_id, v_ed->'backup');
    PERFORM set_config('app.imovib_aplicando', 'on', true);
    UPDATE public.imovib_studies SET edicao_versao = NULL WHERE id = p_study_id;
END;
$function$;

-- Permissões (CREATE OR REPLACE mantém as de antes; repetidas aqui para a trava de segurança das migrations).
REVOKE EXECUTE ON FUNCTION public.fn_imovib_versao_trava_publicada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_trava_edicao_de_outro() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_aplicar_retrato(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.imovib_versao_salvar_edicao(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imovib_versao_salvar_edicao(uuid, jsonb, jsonb) TO authenticated;
