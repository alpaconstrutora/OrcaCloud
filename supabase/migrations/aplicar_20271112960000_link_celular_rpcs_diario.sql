-- aplicar_20271112960000_link_celular_rpcs_diario.sql
--
-- Link do celular — RPCs do Diário de Obras por token, sem login.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Parte 2 / Task 9,
-- decisões D1–D7).
-- Prova: scripts/teste-link-celular-diario.sql (seção B).
-- Depende de:
--   aplicar_20271111950000_link_celular_tabela_e_gemeos.sql (_mobile_link_resolver)
--   aplicar_20271111960000_link_celular_rpcs_tarefas.sql    (celular_sessao original)
--   aplicar_20271112950000_diario_nucleo_com_ator.sql       (núcleos e fn_pode_aprovar_diario_de)
--
-- Toda celular_* começa pelo resolver: token → (dono do link, org do link). Daí
-- em diante TUDO fica preso a essa org — nunca às outras orgs do usuário.
-- "Projeto da org" = coalesce(organization_id, settings.organizationId) = org do
-- link (as duas pernas da policy projects_org_access). Projeto fora → 42501
-- 'diário não encontrado ou sem permissão' (não diz se existe).
--
-- Gravação no Diário: só pelos núcleos _diary_upsert_core / _diary_delete_core
-- com o DONO DO LINK como ator — a regra (membro, aprovação, gatilho) é a mesma
-- do app logado. Cronograma: só manualRealPct dos itens enviados (D3).
--
-- Mídia (D7): a Edge celular-diario-midia autoriza por estas RPCs. Path aceito
-- só no formato {org}/{projeto}/{arquivo}, sem segmento '.'/'..' — o path vem de
-- registro que o próprio link grava, então é dado de quem chama.
--
-- São VOLATILE (o resolver grava last_used_at). SECURITY DEFINER com
-- search_path fixo. REGRA #7: celular_* com REVOKE de PUBLIC e anon e GRANT a
-- anon e authenticated; internos _celular_* sem EXECUTE para nenhum papel da API.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).

SET lock_timeout = '5s';

-- ── Internos ────────────────────────────────────────────────────────────────

-- O projeto é da org? (organization_id, ou settings.organizationId quando a
-- coluna é NULL). NULL nas duas → NULL (quem chama usa IS NOT TRUE).
CREATE OR REPLACE FUNCTION public._celular_projeto_da_org(p public.projects, p_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(p.organization_id, nullif(p.settings ->> 'organizationId', '')::uuid) = p_org
$$;

-- Classificação normalizada como getClassification (utils/projectClassification.ts):
-- trim + maiúsculas; ausente/vazia → ''.
CREATE OR REPLACE FUNCTION public._celular_classificacao(p_settings JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT upper(btrim(coalesce(p_settings ->> 'classification', '')))
$$;

-- Os 4 campos de vínculo/classificação do settings (D1), sem as chaves ausentes.
CREATE OR REPLACE FUNCTION public._celular_settings_enxuto(p_settings JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_strip_nulls(jsonb_build_object(
        'classification',    p_settings -> 'classification',
        'linkedProjectId',   p_settings -> 'linkedProjectId',
        'linkedProjectName', p_settings -> 'linkedProjectName',
        'organizationId',    p_settings -> 'organizationId'))
$$;

-- settings.diaryEntries como array (qualquer outra coisa → []).
CREATE OR REPLACE FUNCTION public._celular_registros(p_settings JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN jsonb_typeof(p_settings -> 'diaryEntries') = 'array'
                THEN p_settings -> 'diaryEntries' ELSE '[]'::jsonb END
$$;

-- Caminhos de mídia citados pelos registros de um settings: images[], videos[]
-- e documents[].url de cada registro de diaryEntries.
CREATE OR REPLACE FUNCTION public._celular_midias_citadas(p_settings JSONB)
RETURNS SETOF TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT c.ref
      FROM jsonb_array_elements(public._celular_registros(p_settings)) e
     CROSS JOIN LATERAL (
            SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(e -> 'images') = 'array' THEN e -> 'images' ELSE '[]'::jsonb END)
            UNION ALL
            SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(e -> 'videos') = 'array' THEN e -> 'videos' ELSE '[]'::jsonb END)
            UNION ALL
            SELECT d ->> 'url'
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e -> 'documents') = 'array' THEN e -> 'documents' ELSE '[]'::jsonb END) d
           ) c(ref)
     WHERE c.ref IS NOT NULL
$$;

-- Path de mídia no formato do bucket: {org}/{projeto}/{arquivo} — projeto
-- qualquer quando p_projeto é NULL —, sem barra invertida e sem segmento '.'
-- ou '..' (um registro do link pode citar 'org/../outraOrg/…').
CREATE OR REPLACE FUNCTION public._celular_midia_path_ok(p_path TEXT, p_org UUID, p_projeto UUID)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(
               p_path ~ ('^' || p_org::text || '/' || coalesce(p_projeto::text, '[^/\\]+') || '/[^/\\]+$')
           AND p_path !~ '/\.\.?(/|$)',
           false)
$$;

-- Lista de paths de mídia: no máximo 100 por pedido (o mesmo teto da Edge).
CREATE OR REPLACE FUNCTION public._celular_confere_paths(p_paths TEXT[])
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF coalesce(cardinality(p_paths), 0) > 100 THEN
        RAISE EXCEPTION 'no máximo 100 arquivos por pedido' USING ERRCODE = '22023';
    END IF;
END;
$$;

-- Planejamento aceito pelo link para este diário (D4): da org do link E
-- (PLANEJAMENTO OU o próprio settings.linkedProjectId do diário — o fallback
-- de resolverPlanejamentoDoDiario).
CREATE OR REPLACE FUNCTION public._celular_planejamento_aceito(pl public.projects, d public.projects, p_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(public._celular_projeto_da_org(pl, p_org), false)
       AND (public._celular_classificacao(pl.settings) = 'PLANEJAMENTO'
            OR pl.id::text = coalesce(d.settings ->> 'linkedProjectId', ''))
$$;

-- ── Sessão ──────────────────────────────────────────────────────────────────
-- Corpo de aplicar_20271111960000 + pode_aprovar_diario (D6).
CREATE OR REPLACE FUNCTION public.celular_sessao(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    RETURN jsonb_build_object(
        'user_id',             v_user,
        'nome',                (SELECT p.name FROM public.profiles p WHERE p.id = v_user),
        'org_id',              v_org,
        'org_nome',            (SELECT o.name FROM public.organizations o WHERE o.id = v_org),
        'pode_aprovar_diario', public.fn_pode_aprovar_diario_de(v_user, v_org));
END;
$$;

-- ── Lista de projetos da org (D1) ───────────────────────────────────────────
-- TODOS os projetos da org do link, enxutos: {id, name, updated_at, created_at,
-- settings}. settings só com classification, linkedProjectId,
-- linkedProjectName, organizationId e — nos DIARIO/OBRA e sem classificação —
-- diaryEntries reduzidos a {id, date, impediments}. A tela filtra e resume em
-- memória; o resolver de planejamento (JS) precisa do vínculo de todos.
CREATE OR REPLACE FUNCTION public.celular_diarios_listar(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v      JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id',         p.id,
               'name',       p.name,
               'updated_at', p.updated_at,
               'created_at', p.created_at,
               'settings',   public._celular_settings_enxuto(p.settings)
                             || CASE WHEN public._celular_classificacao(p.settings) IN ('DIARIO', 'OBRA', '')
                                     THEN jsonb_build_object('diaryEntries', (
                                              SELECT coalesce(jsonb_agg(jsonb_build_object(
                                                         'id',          e -> 'id',
                                                         'date',        e -> 'date',
                                                         'impediments', e -> 'impediments') ORDER BY o), '[]'::jsonb)
                                                FROM jsonb_array_elements(public._celular_registros(p.settings))
                                                     WITH ORDINALITY AS t(e, o)))
                                     ELSE '{}'::jsonb END)
           ORDER BY p.updated_at DESC NULLS LAST, p.id), '[]'::jsonb)
      INTO v
      FROM public.projects p
     WHERE public._celular_projeto_da_org(p, v_org);

    RETURN v;
END;
$$;

-- ── Abrir um diário (D2) ────────────────────────────────────────────────────
-- {id, name, organization_id, settings: {classification, linkedProjectId,
-- linkedProjectName, organizationId, diaryEntries (completos)}}.
CREATE OR REPLACE FUNCTION public.celular_diario_abrir(p_token TEXT, p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id;
    IF v_p.id IS NULL OR public._celular_projeto_da_org(v_p, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'id',              v_p.id,
        'name',            v_p.name,
        'organization_id', v_p.organization_id,
        'settings',        public._celular_settings_enxuto(v_p.settings)
                           || jsonb_build_object('diaryEntries', public._celular_registros(v_p.settings)));
END;
$$;

-- ── Gravar / excluir registro ───────────────────────────────────────────────
-- Projeto da org do link (travado: a org não muda até o núcleo gravar), depois
-- o núcleo com o dono do link como ator. Retorno do núcleo: {entries, anterior}.
CREATE OR REPLACE FUNCTION public.celular_diario_salvar(p_token TEXT, p_project_id UUID, p_entry JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id FOR UPDATE;
    IF v_p.id IS NULL OR public._celular_projeto_da_org(v_p, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN public._diary_upsert_core(v_user, p_project_id, p_entry);
END;
$$;

CREATE OR REPLACE FUNCTION public.celular_diario_excluir(p_token TEXT, p_project_id UUID, p_entry_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id FOR UPDATE;
    IF v_p.id IS NULL OR public._celular_projeto_da_org(v_p, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN public._diary_delete_core(v_user, p_project_id, p_entry_id);
END;
$$;

-- ── Efetivo (D5) ────────────────────────────────────────────────────────────
-- Colaboradores ATIVO da org do link ou compartilhados com ela
-- (employee_org_shares.target_org_id) — a regra de celular_responsaveis_listar,
-- com role e status. Ordem: nome.
CREATE OR REPLACE FUNCTION public.celular_efetivo_listar(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v      JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id',     e.id,
               'name',   e.name,
               'role',   e.role,
               'status', e.status) ORDER BY e.name, e.id), '[]'::jsonb)
      INTO v
      FROM public.employees e
     WHERE e.status = 'ATIVO'
       AND (   e.org_id = v_org
            OR e.id IN (SELECT s.employee_id FROM public.employee_org_shares s WHERE s.target_org_id = v_org));

    RETURN v;
END;
$$;

-- ── Planejamento do diário: ler ─────────────────────────────────────────────
-- Diário da org e planejamento aceito (D4). {schedule, budget}: budget do
-- planejamento ou, vazio, do projeto settings.linkedProjectId dele (da mesma
-- org) — a regra de useDiaryLinkedPlanning; cada item só {id, quantity,
-- sinapiItem: {description}} (o que itensCronogramaVinculaveis/vincularAtividade usam).
CREATE OR REPLACE FUNCTION public.celular_planejamento_ler(p_token TEXT, p_diario_id UUID, p_planejamento_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user   UUID;
    v_org    UUID;
    v_d      public.projects;
    v_pl     public.projects;
    v_budget JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_d FROM public.projects p WHERE p.id = p_diario_id;
    IF v_d.id IS NULL OR public._celular_projeto_da_org(v_d, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    SELECT p.* INTO v_pl FROM public.projects p WHERE p.id = p_planejamento_id;
    IF v_pl.id IS NULL OR public._celular_planejamento_aceito(v_pl, v_d, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'planejamento não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(v_pl.budget) = 'array' AND jsonb_array_length(v_pl.budget) > 0 THEN
        v_budget := v_pl.budget;
    ELSIF coalesce(v_pl.settings ->> 'linkedProjectId', '') <> '' THEN
        SELECT pai.budget INTO v_budget
          FROM public.projects pai
         WHERE pai.id::text = v_pl.settings ->> 'linkedProjectId'
           AND public._celular_projeto_da_org(pai, v_org);
    END IF;

    RETURN jsonb_build_object(
        'schedule', v_pl.settings -> 'schedule',
        'budget',   (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'id',         b -> 'id',
                                'quantity',   b -> 'quantity',
                                'sinapiItem', jsonb_build_object('description', b -> 'sinapiItem' -> 'description'))
                            ORDER BY o), '[]'::jsonb)
                       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_budget) = 'array' THEN v_budget ELSE '[]'::jsonb END)
                            WITH ORDINALITY AS t(b, o)));
END;
$$;

-- ── Planejamento do diário: gravar evolução (D3) ────────────────────────────
-- Mesma autorização de celular_planejamento_ler. p_evolucao = {itemId: pct}:
-- objeto de até 2000 chaves, cada valor número de 0 a 100; senão 22023. Para
-- cada chave: manualRealPct no itemSchedules de mesmo id, ou {id,
-- manualRealPct} acrescentado (o fallback de aplicarEvolucaoNoCronograma). Só
-- settings.schedule muda. Sem cronograma no planejamento → nada grava e devolve
-- NULL (como sincronizarEvolucaoNoPlanejamento). Devolve o schedule gravado.
CREATE OR REPLACE FUNCTION public.celular_planejamento_gravar_evolucao(
    p_token TEXT, p_diario_id UUID, p_planejamento_id UUID, p_evolucao JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user  UUID;
    v_org   UUID;
    v_d     public.projects;
    v_pl    public.projects;
    v_sched JSONB;
    v_itens JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    IF p_evolucao IS NULL OR jsonb_typeof(p_evolucao) <> 'object' THEN
        RAISE EXCEPTION 'evolução precisa ser um objeto {item: percentual}' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_evolucao)) > 2000 THEN
        RAISE EXCEPTION 'evolução com mais de 2000 itens' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_evolucao) k
                WHERE CASE WHEN jsonb_typeof(k.value) = 'number'
                           THEN k.value::numeric NOT BETWEEN 0 AND 100
                           ELSE true END) THEN
        RAISE EXCEPTION 'evolução inválida: cada percentual tem de ser um número de 0 a 100' USING ERRCODE = '22023';
    END IF;

    SELECT p.* INTO v_d FROM public.projects p WHERE p.id = p_diario_id;
    IF v_d.id IS NULL OR public._celular_projeto_da_org(v_d, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    SELECT p.* INTO v_pl FROM public.projects p WHERE p.id = p_planejamento_id FOR UPDATE;
    IF v_pl.id IS NULL OR public._celular_planejamento_aceito(v_pl, v_d, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'planejamento não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    v_sched := v_pl.settings -> 'schedule';
    IF jsonb_typeof(v_sched) IS DISTINCT FROM 'object' THEN
        RETURN NULL;
    END IF;
    v_itens := CASE WHEN jsonb_typeof(v_sched -> 'itemSchedules') = 'array'
                    THEN v_sched -> 'itemSchedules' ELSE '[]'::jsonb END;

    SELECT coalesce(jsonb_agg(x.e ORDER BY x.grupo, x.ord), '[]'::jsonb) INTO v_itens
      FROM (
            SELECT CASE WHEN jsonb_typeof(i.e) = 'object' AND p_evolucao ? (i.e ->> 'id')
                        THEN i.e || jsonb_build_object('manualRealPct', p_evolucao -> (i.e ->> 'id'))
                        ELSE i.e END AS e,
                   0 AS grupo, i.ord
              FROM jsonb_array_elements(v_itens) WITH ORDINALITY AS i(e, ord)
            UNION ALL
            SELECT jsonb_build_object('id', k.key, 'manualRealPct', k.value),
                   1, row_number() OVER (ORDER BY k.key)
              FROM jsonb_each(p_evolucao) k
             WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_itens) i2
                                WHERE jsonb_typeof(i2) = 'object' AND i2 ->> 'id' = k.key)
           ) x;

    v_sched := jsonb_set(v_sched, '{itemSchedules}', v_itens);

    UPDATE public.projects
       SET settings   = jsonb_set(coalesce(settings, '{}'::jsonb), '{schedule}', v_sched),
           updated_at = now()
     WHERE id = v_pl.id;

    RETURN v_sched;
END;
$$;

-- ── Mídia: subir (Edge) ─────────────────────────────────────────────────────
-- A org do link, se o projeto é da org e DIARIO/OBRA; senão 42501. A Edge monta
-- o path {org}/{projeto}/{uuid}.{ext} com este retorno.
CREATE OR REPLACE FUNCTION public.celular_diario_autoriza(p_token TEXT, p_project_id UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id;
    IF v_p.id IS NULL OR public._celular_projeto_da_org(v_p, v_org) IS NOT TRUE
       OR public._celular_classificacao(v_p.settings) NOT IN ('DIARIO', 'OBRA') THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN v_org;
END;
$$;

-- ── Mídia: assinar (Edge) — D7 ──────────────────────────────────────────────
-- Dos paths pedidos, só os com prefixo {org do link}/ (formato do bucket) E
-- citados em algum registro de diário de projeto da org; os outros são
-- omitidos, sem erro. Mais de 100 → 22023. Ordem do pedido, sem repetição.
CREATE OR REPLACE FUNCTION public.celular_diario_midia_permitida(p_token TEXT, p_paths TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v      TEXT[];
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;
    PERFORM public._celular_confere_paths(p_paths);

    SELECT coalesce(array_agg(x.path ORDER BY x.ord), '{}'::text[])
      INTO v
      FROM (SELECT DISTINCT ON (u.path) u.path, u.ord
              FROM unnest(p_paths) WITH ORDINALITY AS u(path, ord)
             ORDER BY u.path, u.ord) x
     WHERE public._celular_midia_path_ok(x.path, v_org, NULL)
       AND EXISTS (SELECT 1
                     FROM public.projects p
                    WHERE public._celular_projeto_da_org(p, v_org)
                      AND x.path IN (SELECT c FROM public._celular_midias_citadas(p.settings) c));

    RETURN v;
END;
$$;

-- ── Mídia: remover (Edge) ───────────────────────────────────────────────────
-- Projeto da org (senão 42501). Dos paths pedidos, só os com prefixo
-- {org}/{projeto}/ que nenhum registro DESTE projeto cita mais. Mais de 100 → 22023.
CREATE OR REPLACE FUNCTION public.celular_diario_midia_orfa(p_token TEXT, p_project_id UUID, p_paths TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
    v      TEXT[];
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;
    PERFORM public._celular_confere_paths(p_paths);

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id;
    IF v_p.id IS NULL OR public._celular_projeto_da_org(v_p, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(array_agg(x.path ORDER BY x.ord), '{}'::text[])
      INTO v
      FROM (SELECT DISTINCT ON (u.path) u.path, u.ord
              FROM unnest(p_paths) WITH ORDINALITY AS u(path, ord)
             ORDER BY u.path, u.ord) x
     WHERE public._celular_midia_path_ok(x.path, v_org, v_p.id)
       AND x.path NOT IN (SELECT c FROM public._celular_midias_citadas(v_p.settings) c);

    RETURN v;
END;
$$;

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
-- Internos: nenhum papel da API executa; só as celular_*, que rodam como dono.
REVOKE EXECUTE ON FUNCTION public._celular_projeto_da_org(public.projects, UUID)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_classificacao(JSONB)                                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_settings_enxuto(JSONB)                                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_registros(JSONB)                                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_midias_citadas(JSONB)                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_midia_path_ok(TEXT, UUID, UUID)                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_confere_paths(TEXT[])                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._celular_planejamento_aceito(public.projects, public.projects, UUID)  FROM PUBLIC, anon, authenticated;

-- celular_*: o celular chama como anon, só com o token; a autorização é o
-- resolver + as regras acima, dentro de cada função.
REVOKE EXECUTE ON FUNCTION public.celular_sessao(TEXT)                                              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_sessao(TEXT)                                              TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diarios_listar(TEXT)                                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diarios_listar(TEXT)                                      TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_abrir(TEXT, UUID)                                  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_abrir(TEXT, UUID)                                  TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_salvar(TEXT, UUID, JSONB)                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_salvar(TEXT, UUID, JSONB)                          TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_excluir(TEXT, UUID, TEXT)                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_excluir(TEXT, UUID, TEXT)                          TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_efetivo_listar(TEXT)                                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_efetivo_listar(TEXT)                                      TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_planejamento_ler(TEXT, UUID, UUID)                        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_planejamento_ler(TEXT, UUID, UUID)                        TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_planejamento_gravar_evolucao(TEXT, UUID, UUID, JSONB)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_planejamento_gravar_evolucao(TEXT, UUID, UUID, JSONB)     TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_autoriza(TEXT, UUID)                               FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_autoriza(TEXT, UUID)                               TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_midia_permitida(TEXT, TEXT[])                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_midia_permitida(TEXT, TEXT[])                      TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_midia_orfa(TEXT, UUID, TEXT[])                     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_midia_orfa(TEXT, UUID, TEXT[])                     TO anon, authenticated;
