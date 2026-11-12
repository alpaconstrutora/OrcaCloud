-- ============================================================================
-- Diário de Obras — núcleo de gravação com ator explícito (12/11/2026)
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Parte 2, Task 8)
-- Prova: scripts/teste-link-celular-diario.sql (seção A)
--
-- "Uma regra, dois chamadores": o link do celular (Task 9) grava no Diário como
-- a pessoa dona do link, sem sessão. Para a regra não se duplicar:
--
--   1. fn_pode_aprovar_diario_de(user, org) — o corpo de fn_pode_aprovar_diario
--      do arquivo aplicar_20271014600000 com auth.uid() → p_user e o e-mail de
--      auth.jwt() → auth.users.email de p_user (mesmo arranjo de
--      is_org_member_de). fn_pode_aprovar_diario(org) passa a chamar o gêmeo
--      com auth.uid() — mesmos privilégios de hoje.
--   2. _diary_upsert_core / _diary_delete_core(p_ator, …) — o corpo de
--      diary_upsert_entry / diary_delete_entry copiado do ARQUIVO
--      aplicar_20271014600000 (não do banco, não da …500000: a checagem de
--      aprovação sumiria). SECURITY DEFINER, então a RLS de projects não vale
--      mais aqui dentro: no lugar dela, depois do SELECT … FOR UPDATE, a
--      checagem explícita is_org_member_de(p_ator, org do diário) — org =
--      coalesce(organization_id, settings.organizationId), o mesmo par de
--      pernas da policy projects_org_access. Aprovação por
--      fn_pode_aprovar_diario_de(p_ator, org). Mesma marca do gatilho
--      (orcacloud.diario_escrita), mesmo retorno {entries, anterior}, mesmas
--      mensagens e ERRCODEs.
--   3. diary_upsert_entry / diary_delete_entry — mesma assinatura e privilégios;
--      passam a SECURITY DEFINER (o núcleo não é executável por authenticated),
--      recusam auth.uid() NULL e chamam o núcleo com auth.uid().
--
-- Diferença consciente em relação à RLS: a policy "Users can update their own
-- projects" (auth.uid() = user_id) deixava o CRIADOR do projeto gravar mesmo
-- fora da org; o núcleo exige ser membro da org do diário. Em 12/11/2026: 0
-- projetos cujo criador não é membro da org deles.
--
-- REGRA #7: REVOKE de PUBLIC e anon em toda função; gêmeo e núcleos também de
-- authenticated (só os chamadores DEFINER os chamam). A autorização mora dentro.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Quem aprova ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pode_aprovar_diario_de(p_user UUID, p_org UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role  TEXT;
    v_perm  JSONB;
    v_email TEXT;
BEGIN
    IF p_user IS NULL OR p_org IS NULL THEN
        RETURN FALSE;
    END IF;
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user;
    -- O mesmo casamento de membro do is_org_member: user_id; e-mail só em linha legada sem user_id.
    SELECT m.role, m.permissions INTO v_role, v_perm
      FROM public.organization_members m
     WHERE m.organization_id = p_org
       AND ((m.user_id IS NOT NULL AND m.user_id = p_user)
            OR (m.user_id IS NULL AND lower(m.email) = lower(v_email)))
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    IF v_role IN ('admin', 'owner') THEN
        RETURN TRUE;
    END IF;
    IF v_perm ? 'canApproveDiary' THEN
        RETURN coalesce((v_perm->>'canApproveDiary')::boolean, FALSE);
    END IF;
    RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pode_aprovar_diario_de(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_pode_aprovar_diario(p_org UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_pode_aprovar_diario_de(auth.uid(), p_org);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pode_aprovar_diario(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_pode_aprovar_diario(UUID) TO authenticated;

-- ── 2. Núcleo: gravar um registro ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._diary_upsert_core(p_ator UUID, p_project_id UUID, p_entry JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id         TEXT := p_entry ->> 'id';
    v_settings   JSONB;
    v_org        UUID;
    v_anterior   JSONB;
    v_lista      JSONB;
    v_status_ant TEXT;
    v_status_nov TEXT := coalesce(nullif(p_entry ->> 'status', ''), 'Rascunho');
BEGIN
    IF jsonb_typeof(p_entry) IS DISTINCT FROM 'object' OR coalesce(v_id, '') = '' THEN
        RAISE EXCEPTION 'registro do diário sem id' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p_entry ->> 'date', '') = '' THEN
        RAISE EXCEPTION 'registro do diário sem data' USING ERRCODE = '22023';
    END IF;

    SELECT p.settings, coalesce(p.organization_id, nullif(p.settings ->> 'organizationId', '')::uuid)
      INTO v_settings, v_org
      FROM public.projects p
     WHERE p.id = p_project_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    -- No lugar da RLS de projects (a função é DEFINER): o ator tem de ser membro da org do diário.
    IF v_org IS NULL OR NOT public.is_org_member_de(p_ator, v_org) THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    SELECT e INTO v_anterior
      FROM jsonb_array_elements(coalesce(v_settings -> 'diaryEntries', '[]'::jsonb)) e
     WHERE e ->> 'id' = v_id
     LIMIT 1;
    v_status_ant := coalesce(nullif(v_anterior ->> 'status', ''), CASE WHEN v_anterior IS NULL THEN NULL ELSE 'Rascunho' END);

    -- Aprovação: o registro aprovado está travado; aprovar/recusar é de quem aprova.
    IF v_status_ant = 'Aprovado' AND NOT public.fn_pode_aprovar_diario_de(p_ator, v_org) THEN
        RAISE EXCEPTION 'Registro aprovado: só quem aprova o Diário de Obra pode alterá-lo (Usuários › Permissões Detalhadas › Operação de Obra).'
            USING ERRCODE = '42501';
    END IF;
    IF v_status_nov IN ('Aprovado', 'Recusado') AND v_status_nov IS DISTINCT FROM v_status_ant
       AND NOT public.fn_pode_aprovar_diario_de(p_ator, v_org) THEN
        RAISE EXCEPTION 'Aprovar ou recusar registro do diário exige a permissão de aprovação (Usuários › Permissões Detalhadas › Operação de Obra).'
            USING ERRCODE = '42501';
    END IF;

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
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sem permissão para gravar neste diário' USING ERRCODE = '42501';
    END IF;
    PERFORM set_config('orcacloud.diario_escrita', 'off', true);

    RETURN jsonb_build_object('entries', v_lista, 'anterior', v_anterior);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._diary_upsert_core(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- ── 3. Núcleo: excluir um registro ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._diary_delete_core(p_ator UUID, p_project_id UUID, p_entry_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settings JSONB;
    v_org      UUID;
    v_anterior JSONB;
    v_lista    JSONB;
BEGIN
    IF coalesce(p_entry_id, '') = '' THEN
        RAISE EXCEPTION 'registro do diário sem id' USING ERRCODE = '22023';
    END IF;

    SELECT p.settings, coalesce(p.organization_id, nullif(p.settings ->> 'organizationId', '')::uuid)
      INTO v_settings, v_org
      FROM public.projects p
     WHERE p.id = p_project_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    -- No lugar da RLS de projects (a função é DEFINER): o ator tem de ser membro da org do diário.
    IF v_org IS NULL OR NOT public.is_org_member_de(p_ator, v_org) THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    SELECT e INTO v_anterior
      FROM jsonb_array_elements(coalesce(v_settings -> 'diaryEntries', '[]'::jsonb)) e
     WHERE e ->> 'id' = p_entry_id
     LIMIT 1;

    IF v_anterior ->> 'status' = 'Aprovado' AND NOT public.fn_pode_aprovar_diario_de(p_ator, v_org) THEN
        RAISE EXCEPTION 'Registro aprovado: só quem aprova o Diário de Obra pode excluí-lo (Usuários › Permissões Detalhadas › Operação de Obra).'
            USING ERRCODE = '42501';
    END IF;

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

REVOKE EXECUTE ON FUNCTION public._diary_delete_core(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 4. RPCs do app logado: chamam o núcleo com auth.uid() ───────────────────

CREATE OR REPLACE FUNCTION public.diary_upsert_entry(p_project_id UUID, p_entry JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'sem permissão para gravar neste diário' USING ERRCODE = '42501';
    END IF;
    RETURN public._diary_upsert_core(auth.uid(), p_project_id, p_entry);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.diary_upsert_entry(UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.diary_upsert_entry(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.diary_delete_entry(p_project_id UUID, p_entry_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'sem permissão para gravar neste diário' USING ERRCODE = '42501';
    END IF;
    RETURN public._diary_delete_core(auth.uid(), p_project_id, p_entry_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.diary_delete_entry(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.diary_delete_entry(UUID, TEXT) TO authenticated;
