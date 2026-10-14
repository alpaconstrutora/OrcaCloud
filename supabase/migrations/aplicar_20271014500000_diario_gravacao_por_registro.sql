-- ============================================================================
-- Diário de Obras — GRAVAÇÃO POR REGISTRO (14/10/2026)
-- Plano: docs/planos/2026-10-14-diario-gravacao-por-registro.md
--
-- Os registros moram em projects.settings.diaryEntries (JSONB). Até aqui toda
-- gravação regravava o settings INTEIRO a partir da cópia que a tela tinha em
-- memória — e quem salvava por último apagava o registro do outro (prévia
-- mobile × desktop, campo × escritório, auto-save de 2 s, "Editar projeto").
--
--   1. diary_upsert_entry / diary_delete_entry — trocam UM registro com a
--      linha travada (SELECT … FOR UPDATE). Devolvem a lista gravada e a versão
--      anterior do registro, para o cliente limpar mídia órfã contra o banco.
--      SECURITY INVOKER: quem decide se pode gravar é a RLS de projects
--      (projects_org_access) — a função não amplia nada.
--   2. trg_projects_diary_entries_guard — UPDATE que não veio dessas funções
--      não muda diaryEntries: a chave volta ao valor do banco. É o que impede o
--      save do projeto inteiro (cópia velha) de apagar registro. INSERT
--      (duplicar/importar projeto) não passa por aqui.
--
-- A marca de "veio da função" é um GUC local à transação
-- (set_config(..., true)): morre no fim da chamada PostgREST.
--
-- REGRA #7: REVOKE de PUBLIC e anon em toda função.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Gatilho de guarda ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_projects_diary_entries_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_setting('orcacloud.diario_escrita', true) = 'on' THEN
        RETURN NEW;
    END IF;
    IF NEW.settings IS NULL
       OR (NEW.settings -> 'diaryEntries') IS NOT DISTINCT FROM (OLD.settings -> 'diaryEntries') THEN
        RETURN NEW;
    END IF;
    IF OLD.settings ? 'diaryEntries' THEN
        NEW.settings := jsonb_set(NEW.settings, '{diaryEntries}', OLD.settings -> 'diaryEntries');
    ELSE
        NEW.settings := NEW.settings - 'diaryEntries';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_projects_diary_entries_guard() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_projects_diary_entries_guard ON public.projects;
CREATE TRIGGER trg_projects_diary_entries_guard
    BEFORE UPDATE OF settings ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.fn_projects_diary_entries_guard();

-- ── 2. Gravar um registro ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.diary_upsert_entry(p_project_id UUID, p_entry JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id       TEXT := p_entry ->> 'id';
    v_settings JSONB;
    v_anterior JSONB;
    v_lista    JSONB;
BEGIN
    IF jsonb_typeof(p_entry) IS DISTINCT FROM 'object' OR coalesce(v_id, '') = '' THEN
        RAISE EXCEPTION 'registro do diário sem id' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p_entry ->> 'date', '') = '' THEN
        RAISE EXCEPTION 'registro do diário sem data' USING ERRCODE = '22023';
    END IF;

    SELECT p.settings INTO v_settings
      FROM public.projects p
     WHERE p.id = p_project_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    SELECT e INTO v_anterior
      FROM jsonb_array_elements(coalesce(v_settings -> 'diaryEntries', '[]'::jsonb)) e
     WHERE e ->> 'id' = v_id
     LIMIT 1;

    SELECT coalesce(jsonb_agg(x.e ORDER BY x.e ->> 'date' DESC, x.ord), '[]'::jsonb) INTO v_lista
      FROM (
            SELECT p_entry AS e, 0 AS ord
            UNION ALL
            SELECT e, 1
              FROM jsonb_array_elements(coalesce(v_settings -> 'diaryEntries', '[]'::jsonb)) e
             WHERE e ->> 'id' IS DISTINCT FROM v_id
           ) x;

    PERFORM set_config('orcacloud.diario_escrita', 'on', true);
    UPDATE public.projects
       SET settings   = jsonb_set(coalesce(settings, '{}'::jsonb), '{diaryEntries}', v_lista),
           updated_at = now()
     WHERE id = p_project_id;
    -- Leitura liberada e escrita não (RLS de UPDATE) = 0 linhas, sem erro: vira erro aqui.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sem permissão para gravar neste diário' USING ERRCODE = '42501';
    END IF;
    PERFORM set_config('orcacloud.diario_escrita', 'off', true);

    RETURN jsonb_build_object('entries', v_lista, 'anterior', v_anterior);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.diary_upsert_entry(UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.diary_upsert_entry(UUID, JSONB) TO authenticated;

-- ── 3. Excluir um registro ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.diary_delete_entry(p_project_id UUID, p_entry_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settings JSONB;
    v_anterior JSONB;
    v_lista    JSONB;
BEGIN
    IF coalesce(p_entry_id, '') = '' THEN
        RAISE EXCEPTION 'registro do diário sem id' USING ERRCODE = '22023';
    END IF;

    SELECT p.settings INTO v_settings
      FROM public.projects p
     WHERE p.id = p_project_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    SELECT e INTO v_anterior
      FROM jsonb_array_elements(coalesce(v_settings -> 'diaryEntries', '[]'::jsonb)) e
     WHERE e ->> 'id' = p_entry_id
     LIMIT 1;

    SELECT coalesce(jsonb_agg(e ORDER BY ord), '[]'::jsonb) INTO v_lista
      FROM jsonb_array_elements(coalesce(v_settings -> 'diaryEntries', '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
     WHERE e ->> 'id' IS DISTINCT FROM p_entry_id;

    IF v_anterior IS NOT NULL THEN
        PERFORM set_config('orcacloud.diario_escrita', 'on', true);
        UPDATE public.projects
           SET settings   = jsonb_set(coalesce(settings, '{}'::jsonb), '{diaryEntries}', v_lista),
               updated_at = now()
         WHERE id = p_project_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'sem permissão para gravar neste diário' USING ERRCODE = '42501';
        END IF;
        PERFORM set_config('orcacloud.diario_escrita', 'off', true);
    END IF;

    RETURN jsonb_build_object('entries', v_lista, 'anterior', v_anterior);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.diary_delete_entry(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.diary_delete_entry(UUID, TEXT) TO authenticated;
