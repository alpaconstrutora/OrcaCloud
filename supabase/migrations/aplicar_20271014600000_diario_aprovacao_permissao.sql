-- ============================================================================
-- Diário de Obras — APROVAR/RECUSAR passa a exigir permissão (14/10/2026)
-- Plano: docs/planos/2026-10-14-diario-mobile-itens-5-a-8.md (item 7)
--
-- Até aqui qualquer pessoa que gravasse no diário podia marcar um registro
-- "Aprovado" ou "Recusado", e alterar ou excluir um registro já aprovado.
--
--   1. fn_pode_aprovar_diario(org) — quem aprova: admin/owner da organização
--      do diário, ou membro com a chave `canApproveDiary` = true (Usuários ›
--      Permissões Detalhadas › Operação de Obra). Sem a chave, `member` e
--      `viewer` NÃO aprovam (o papel member "não mexe em aprovações" —
--      getDefaultPermissions). Mesma regra no front: utils/diaryAprovacao.ts.
--   2. diary_upsert_entry — exige a permissão quando o registro (a) passa a
--      Aprovado/Recusado, ou (b) já estava Aprovado no banco (alterar, inclusive
--      desaprovar). Recusado continua editável por quem grava (corrigir e
--      reenviar), e manter Recusado não exige nada.
--   3. diary_delete_entry — excluir registro Aprovado exige a permissão.
--   Corpo das duas copiado do ARQUIVO aplicar_20271014500000 + as checagens.
--
-- Em 14/10/2026: nenhum registro Aprovado/Recusado em produção (3 Rascunho) e
-- nenhum membro com a chave — ninguém perde nada que já tinha feito.
--
-- REGRA #7: REVOKE de PUBLIC e anon em toda função; a DEFINER confere a
-- autorização dentro (auth.uid()).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Quem aprova ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pode_aprovar_diario(p_org UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_perm JSONB;
BEGIN
    IF auth.uid() IS NULL OR p_org IS NULL THEN
        RETURN FALSE;
    END IF;
    -- O mesmo casamento de membro do is_org_member: user_id; e-mail só em linha legada sem user_id.
    SELECT m.role, m.permissions INTO v_role, v_perm
      FROM public.organization_members m
     WHERE m.organization_id = p_org
       AND ((m.user_id IS NOT NULL AND m.user_id = auth.uid())
            OR (m.user_id IS NULL AND lower(m.email) = lower(auth.jwt()->>'email')))
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

REVOKE EXECUTE ON FUNCTION public.fn_pode_aprovar_diario(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_pode_aprovar_diario(UUID) TO authenticated;

-- ── 2. Gravar um registro (com a checagem de aprovação) ─────────────────────

CREATE OR REPLACE FUNCTION public.diary_upsert_entry(p_project_id UUID, p_entry JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
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

    SELECT e INTO v_anterior
      FROM jsonb_array_elements(coalesce(v_settings -> 'diaryEntries', '[]'::jsonb)) e
     WHERE e ->> 'id' = v_id
     LIMIT 1;
    v_status_ant := coalesce(nullif(v_anterior ->> 'status', ''), CASE WHEN v_anterior IS NULL THEN NULL ELSE 'Rascunho' END);

    -- Aprovação: o registro aprovado está travado; aprovar/recusar é de quem aprova.
    IF v_status_ant = 'Aprovado' AND NOT public.fn_pode_aprovar_diario(v_org) THEN
        RAISE EXCEPTION 'Registro aprovado: só quem aprova o Diário de Obra pode alterá-lo (Usuários › Permissões Detalhadas › Operação de Obra).'
            USING ERRCODE = '42501';
    END IF;
    IF v_status_nov IN ('Aprovado', 'Recusado') AND v_status_nov IS DISTINCT FROM v_status_ant
       AND NOT public.fn_pode_aprovar_diario(v_org) THEN
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

-- ── 3. Excluir um registro (aprovado só por quem aprova) ────────────────────

CREATE OR REPLACE FUNCTION public.diary_delete_entry(p_project_id UUID, p_entry_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
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

    SELECT e INTO v_anterior
      FROM jsonb_array_elements(coalesce(v_settings -> 'diaryEntries', '[]'::jsonb)) e
     WHERE e ->> 'id' = p_entry_id
     LIMIT 1;

    IF v_anterior ->> 'status' = 'Aprovado' AND NOT public.fn_pode_aprovar_diario(v_org) THEN
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

REVOKE EXECUTE ON FUNCTION public.diary_delete_entry(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.diary_delete_entry(UUID, TEXT) TO authenticated;
