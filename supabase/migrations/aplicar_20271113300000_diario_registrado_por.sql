-- ============================================================================
-- Diário de Obras — "registrado por" / "editado por" (13/11/2026)
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
--        (### Ajustes — Diário: registrado por (2026-11-13))
-- Prova: scripts/teste-diario-registrado-por.sql
--
-- Por quê: o usuário perguntou se o Diário preenchido por um usuário é visto
-- pelos demais (é: os registros moram em projects.settings.diaryEntries, que
-- todo membro da org lê), mas o registro não dizia QUEM o fez. Ele aprovou
-- mostrar "Registrado por <nome>" e, se editado, "editado por <nome> em …".
--
-- Decisão: o carimbo é do BANCO, dentro do núcleo de gravação
-- _diary_upsert_core(p_ator, …) — o app logado (diary_upsert_entry, ator =
-- auth.uid()) e o link do celular (celular_diario_salvar, ator = dono do link)
-- passam por ele, então ninguém carimba em nome de outro:
--   · o que vier em p_entry.registradoPor / p_entry.editadoPor é descartado;
--   · registradoPor = {id, nome, em} só quando o registro é CRIADO (sem
--     anterior); nas edições é preservado do anterior — registro antigo sem
--     carimbo continua sem (não se inventa autor);
--   · editadoPor = {id, nome, em} a cada edição de registro que já existia;
--   · id = p_ator; nome = profiles.name → organization_members.name na org do
--     diário → parte local do e-mail (auth.users); em = now() em ISO UTC.
-- O resto do núcleo é cópia literal do ARQUIVO aplicar_20271112950000 (não do
-- banco): mensagens, ERRCODEs, aprovação, a marca orcacloud.diario_escrita e o
-- retorno {entries, anterior}.
--
-- Portal do Cliente: a autoria é interna. client_portal_get_data (cópia do
-- ARQUIVO 20270725000001, idêntica ao banco em 13/11/2026) passa a devolver
-- settings.diaryEntries sem registradoPor/editadoPor. Diferenças conscientes:
-- SET search_path = public, pg_temp (tudo já era public.-qualificado) e o
-- REVOKE de PUBLIC (REGRA #7) — anon e authenticated seguem com EXECUTE.
-- A Edge Function client-portal-diary-download lê images/videos/documents
-- desse mesmo retorno: não é afetada.
--
-- ⚠️ Aplicar com db query -f — nunca db push:
--      npx supabase db query --linked -f <este arquivo>
--
-- Rollback: reaplicar a seção 2 (_diary_upsert_core) de
--   supabase/migrations/aplicar_20271112950000_diario_nucleo_com_ator.sql
-- e o client_portal_get_data de
--   supabase/migrations/20270725000001_client_portal_tabs_on_client.sql
-- (só o CREATE FUNCTION; o ALTER TABLE ali é IF NOT EXISTS). Os carimbos já
-- gravados ficam nos registros, inofensivos: o front sem esta versão os ignora.
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Núcleo: gravar um registro, com o carimbo de autoria ─────────────────

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
    v_entry      JSONB;
    v_nome       TEXT;
    v_autor      JSONB;
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

    -- Autoria (aplicar_20271113300000): quem grava é o ator, nunca o cliente.
    -- Descarta o que veio em p_entry e carimba: registradoPor só na criação
    -- (sem anterior) e preservado do anterior nas edições — registro antigo sem
    -- carimbo segue sem; editadoPor a cada edição de registro que já existia.
    SELECT nullif(btrim(pr.name), '') INTO v_nome FROM public.profiles pr WHERE pr.id = p_ator;
    IF v_nome IS NULL THEN
        SELECT nullif(btrim(m.name), '') INTO v_nome
          FROM public.organization_members m
         WHERE m.organization_id = v_org
           AND ((m.user_id IS NOT NULL AND m.user_id = p_ator)
                OR (m.user_id IS NULL AND lower(m.email) = lower((SELECT u.email FROM auth.users u WHERE u.id = p_ator))))
           AND nullif(btrim(m.name), '') IS NOT NULL
         LIMIT 1;
    END IF;
    IF v_nome IS NULL THEN
        SELECT nullif(btrim(split_part(u.email, '@', 1)), '') INTO v_nome FROM auth.users u WHERE u.id = p_ator;
    END IF;
    v_autor := jsonb_build_object('id', p_ator, 'nome', v_nome,
                                  'em', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    v_entry := p_entry - 'registradoPor' - 'editadoPor';
    IF v_anterior IS NULL THEN
        v_entry := v_entry || jsonb_build_object('registradoPor', v_autor);
    ELSE
        IF jsonb_typeof(v_anterior -> 'registradoPor') = 'object' THEN
            v_entry := v_entry || jsonb_build_object('registradoPor', v_anterior -> 'registradoPor');
        END IF;
        v_entry := v_entry || jsonb_build_object('editadoPor', v_autor);
    END IF;

    SELECT coalesce(jsonb_agg(x.e ORDER BY x.e ->> 'date' DESC, x.ord), '[]'::jsonb) INTO v_lista
      FROM (
            SELECT v_entry AS e, 0 AS ord
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
    -- Só rede de segurança (a linha está travada pelo FOR UPDATE); a permissão já foi conferida acima.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sem permissão para gravar neste diário' USING ERRCODE = '42501';
    END IF;
    PERFORM set_config('orcacloud.diario_escrita', 'off', true);

    RETURN jsonb_build_object('entries', v_lista, 'anterior', v_anterior);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._diary_upsert_core(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- ── 2. Portal do Cliente: sem a autoria do Diário ───────────────────────────

CREATE OR REPLACE FUNCTION public.client_portal_get_data(p_token TEXT)
RETURNS JSON AS $$
DECLARE
    v_tok     public.client_portal_tokens;
    v_cli     public.clients;
    v_proj    RECORD;
    v_tabs    JSONB;
BEGIN
    SELECT * INTO v_tok
    FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN json_build_object('valid', FALSE, 'error', 'Token inválido ou expirado');
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = v_tok.client_id;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    -- Projeto vinculado ao cliente (para os demais dados do portal) —
    -- seleção determinística; ainda serve de fallback do legado de abas.
    SELECT p.id, p.name, p.settings INTO v_proj
    FROM public.projects p
    WHERE p.settings->>'clientId' = v_cli.id::text
    ORDER BY
        (p.settings ? 'clientPortalTabs') DESC,
        (UPPER(COALESCE(p.settings->>'classification', '')) = 'OBRA') DESC,
        p.updated_at DESC NULLS LAST
    LIMIT 1;

    -- 1º) Fonte canônica: coluna do próprio cliente
    IF v_cli.portal_tabs IS NOT NULL AND jsonb_typeof(v_cli.portal_tabs) = 'array' THEN
        v_tabs := v_cli.portal_tabs;
    -- 2º) Legado: clientPortalTabs no projeto vinculado
    ELSIF v_proj.id IS NOT NULL AND (v_proj.settings ? 'clientPortalTabs') THEN
        v_tabs := v_proj.settings->'clientPortalTabs';
    ELSE
        -- 3º) Legado: qualquer projeto da org com clientPortalTabs configurado
        SELECT p.settings->'clientPortalTabs' INTO v_tabs
        FROM public.projects p
        WHERE p.settings->>'organizationId' = v_tok.org_id::text
          AND p.settings ? 'clientPortalTabs'
          AND jsonb_array_length(p.settings->'clientPortalTabs') > 0
        ORDER BY p.updated_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    RETURN json_build_object(
        'valid',       TRUE,
        'client',      row_to_json(v_cli),
        'project',     CASE WHEN v_proj.id IS NOT NULL
                            THEN json_build_object('id', v_proj.id, 'name', v_proj.name, 'settings',
                                 -- Autoria do Diário é interna: o portal não leva registradoPor/editadoPor.
                                 CASE WHEN jsonb_typeof(v_proj.settings -> 'diaryEntries') = 'array'
                                      THEN jsonb_set(v_proj.settings, '{diaryEntries}',
                                               (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(e) = 'object'
                                                                               THEN e - 'registradoPor' - 'editadoPor'
                                                                               ELSE e END ORDER BY ord), '[]'::jsonb)
                                                  FROM jsonb_array_elements(v_proj.settings -> 'diaryEntries')
                                                       WITH ORDINALITY AS t(e, ord)))
                                      ELSE v_proj.settings END)
                            ELSE NULL END,
        'portal_tabs', v_tabs
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.client_portal_get_data(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.client_portal_get_data(TEXT) TO anon, authenticated;
