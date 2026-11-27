-- aplicar_20271127100000_link_celular_diario_todas_orgs.sql
--
-- Link do celular — o Diário passa a valer para TODAS as organizações de que o
-- dono do link é MEMBRO (não só a org em que o link foi gerado).
-- Plano: docs/planos/2026-11-27-diario-link-todas-orgs.md
-- Prova: scripts/teste-link-celular-diario.sql (seções B e D).
--
-- Caso real (27/11): o link do Iago é da org Alpa; o Diário 001 Garden Cambuhy é
-- da Garden Cambuhy SPE, de que ele também é membro. O app logado mostrava o
-- diário; o link, não.
--
-- Antes: toda celular_* do Diário exigia "org do projeto = org do link".
-- Agora:  "o dono do link é membro da org do projeto" — a mesma pergunta que o
--         núcleo _diary_upsert_core já faz (is_org_member_de). Org de que ele não
--         participa continua recusada com a mesma mensagem (não diz se existe).
-- "Org do projeto" segue sendo _celular_org_do_projeto (coalesce da coluna com
-- settings.organizationId — as duas pernas da policy projects_org_access).
--
-- O link continua ancorado na org em que foi gerado: _mobile_link_resolver (não
-- muda) exige que o dono siga membro dela. Tarefas e Pedido Fast não mudam.
--
-- Copiadas das definições VIVAS em produção (27/11), mudando só a trava de org.
-- CREATE OR REPLACE mantém a ACL das celular_* (anon e authenticated executam,
-- PUBLIC não); a interna nova nasce sem EXECUTE para nenhum papel da API.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
-- Ordem de deploy: esta migration ANTES do front. O front antigo segue
-- funcionando (só ganha diários na lista; `pode_aprovar` novo é ignorado).

-- ── Interna: orgs de que o usuário é membro ──────────────────────────────────
-- Mesmo casamento de is_org_member_de / minhas_orgs_membro: user_id; e-mail só
-- em linha legada sem user_id. Corretor (broker_profiles) não é membro.
CREATE OR REPLACE FUNCTION public._celular_orgs_do_usuario(p_user UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT DISTINCT m.organization_id
      FROM public.organization_members m
     WHERE p_user IS NOT NULL
       AND m.organization_id IS NOT NULL
       AND (   (m.user_id IS NOT NULL AND m.user_id = p_user)
            OR (m.user_id IS NULL
                AND lower(m.email) = lower((SELECT u.email FROM auth.users u WHERE u.id = p_user))))
$$;

-- ── Lista ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_diarios_listar(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v      JSONB;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id',         p.id,
               'name',       p.name,
               'updated_at', p.updated_at,
               'created_at', p.created_at,
               'settings',   public._celular_settings_enxuto(p.settings)
                             || CASE WHEN public._celular_classificacao(p.settings) IN ('DIARIO', 'OBRA')
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
     WHERE public._celular_org_do_projeto(p.organization_id, p.settings)
           IN (SELECT o FROM public._celular_orgs_do_usuario(v_user) AS o);

    RETURN v;
END;
$function$;

-- ── Abrir: + pode_aprovar da org DO DIÁRIO ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_diario_abrir(p_token text, p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id;
    v_org := public._celular_org_do_projeto(v_p.organization_id, v_p.settings);
    IF v_p.id IS NULL OR public.is_org_member_de(v_user, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'id',              v_p.id,
        'name',            v_p.name,
        'organization_id', v_p.organization_id,
        'pode_aprovar',    public.fn_pode_aprovar_diario_de(v_user, v_org),
        'settings',        public._celular_settings_enxuto(v_p.settings)
                           || jsonb_build_object('diaryEntries', public._celular_registros(v_p.settings)));
END;
$function$;

-- ── Autoriza (subir mídia): devolve a org DO DIÁRIO (a Edge monta o path com ela)
CREATE OR REPLACE FUNCTION public.celular_diario_autoriza(p_token text, p_project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;
    PERFORM public._celular_cota(p_token, 'subir', 120);

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id;
    v_org := public._celular_org_do_projeto(v_p.organization_id, v_p.settings);
    IF v_p.id IS NULL OR public.is_org_member_de(v_user, v_org) IS NOT TRUE
       OR public._celular_classificacao(v_p.settings) NOT IN ('DIARIO', 'OBRA') THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN v_org;
END;
$function$;

-- ── Excluir / salvar: a trava de org, depois o núcleo (que reconfere membro) ──
CREATE OR REPLACE FUNCTION public.celular_diario_excluir(p_token text, p_project_id uuid, p_entry_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id FOR UPDATE;
    IF v_p.id IS NULL
       OR public.is_org_member_de(v_user, public._celular_org_do_projeto(v_p.organization_id, v_p.settings)) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN public._diary_delete_core(v_user, p_project_id, p_entry_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.celular_diario_salvar(p_token text, p_project_id uuid, p_entry jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id FOR UPDATE;
    IF v_p.id IS NULL
       OR public.is_org_member_de(v_user, public._celular_org_do_projeto(v_p.organization_id, v_p.settings)) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN public._diary_upsert_core(v_user, p_project_id, p_entry);
END;
$function$;

-- ── Mídia órfã: path {org do diário}/{diário}/… ──────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_diario_midia_orfa(p_token text, p_project_id uuid, p_paths text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
    v      TEXT[];
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;
    PERFORM public._celular_confere_paths(p_paths);

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id;
    v_org := public._celular_org_do_projeto(v_p.organization_id, v_p.settings);
    IF v_p.id IS NULL OR public.is_org_member_de(v_user, v_org) IS NOT TRUE THEN
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
$function$;

-- ── Mídia permitida: path {org}/… com org do dono, citado por projeto DA MESMA org
CREATE OR REPLACE FUNCTION public.celular_diario_midia_permitida(p_token text, p_paths text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v      TEXT[];
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;
    PERFORM public._celular_cota(p_token, 'assinar', 600);
    PERFORM public._celular_confere_paths(p_paths);

    -- Cada pedido válido casa com UMA org do dono (o path começa pelo uuid dela).
    -- Os citados são levantados só nas orgs que aparecem nos pedidos.
    WITH orgs AS (
        SELECT o FROM public._celular_orgs_do_usuario(v_user) AS o
    ), pedidos AS (
        SELECT DISTINCT ON (u.path) u.path, u.ord, og.o AS org
          FROM unnest(p_paths) WITH ORDINALITY AS u(path, ord)
          JOIN orgs og ON public._celular_midia_path_ok(u.path, og.o, NULL)
         ORDER BY u.path, u.ord
    ), citados AS (
        SELECT DISTINCT x.org, c.ref
          FROM public.projects p
         CROSS JOIN LATERAL (SELECT public._celular_org_do_projeto(p.organization_id, p.settings) AS org) x
         CROSS JOIN LATERAL public._celular_midias_citadas(p.settings) AS c(ref)
         WHERE x.org IN (SELECT DISTINCT pe.org FROM pedidos pe)
    )
    SELECT coalesce(array_agg(pe.path ORDER BY pe.ord), '{}'::text[])
      INTO v
      FROM pedidos pe
     WHERE EXISTS (SELECT 1 FROM citados ct WHERE ct.org = pe.org AND ct.ref = pe.path);

    RETURN v;
END;
$function$;

-- ── Efetivo: colaboradores ATIVOS das orgs do dono (e compartilhados com elas) ─
CREATE OR REPLACE FUNCTION public.celular_efetivo_listar(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v      JSONB;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id',     e.id,
               'name',   e.name,
               'role',   e.role,
               'status', e.status) ORDER BY e.name, e.id), '[]'::jsonb)
      INTO v
      FROM public.employees e
     WHERE e.status = 'ATIVO'
       AND (   e.org_id IN (SELECT o FROM public._celular_orgs_do_usuario(v_user) AS o)
            OR e.id IN (SELECT s.employee_id FROM public.employee_org_shares s
                         WHERE s.target_org_id IN (SELECT o FROM public._celular_orgs_do_usuario(v_user) AS o)));

    RETURN v;
END;
$function$;

-- ── Planejamento: diário de org do dono; planejamento DA MESMA org do diário ──
CREATE OR REPLACE FUNCTION public.celular_planejamento_ler(p_token text, p_diario_id uuid, p_planejamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user   UUID;
    v_org    UUID;
    v_d      public.projects;
    v_pl     public.projects;
    v_budget JSONB;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_d FROM public.projects p WHERE p.id = p_diario_id;
    v_org := public._celular_org_do_projeto(v_d.organization_id, v_d.settings);
    IF v_d.id IS NULL OR public.is_org_member_de(v_user, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    SELECT p.* INTO v_pl FROM public.projects p WHERE p.id = p_planejamento_id;
    IF v_pl.id IS NULL OR public._celular_planejamento_aceito(v_pl.id, v_pl.organization_id, v_pl.settings, v_d.settings, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'planejamento não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(v_pl.budget) = 'array' AND jsonb_array_length(v_pl.budget) > 0 THEN
        v_budget := v_pl.budget;
    ELSIF v_pl.settings ->> 'linkedProjectId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        -- Pela chave primária; vínculo que não é uuid fica sem orçamento.
        SELECT pai.budget INTO v_budget
          FROM public.projects pai
         WHERE pai.id = (v_pl.settings ->> 'linkedProjectId')::uuid
           AND coalesce(pai.organization_id, nullif(pai.settings ->> 'organizationId', '')::uuid) = v_org;
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
$function$;

CREATE OR REPLACE FUNCTION public.celular_planejamento_gravar_evolucao(p_token text, p_diario_id uuid, p_planejamento_id uuid, p_evolucao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user  UUID;
    v_org   UUID;
    v_d     public.projects;
    v_pl    public.projects;
    v_sched JSONB;
    v_itens JSONB;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    IF p_evolucao IS NULL OR jsonb_typeof(p_evolucao) <> 'object' THEN
        RAISE EXCEPTION 'evolução precisa ser um objeto {item: percentual}' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_evolucao)) > 2000 THEN
        RAISE EXCEPTION 'evolução com mais de 2000 itens' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_evolucao) k WHERE k = '' OR length(k) > 100) THEN
        RAISE EXCEPTION 'evolução inválida: id de item vazio ou com mais de 100 caracteres' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_evolucao) k
                WHERE CASE WHEN jsonb_typeof(k.value) = 'number'
                           THEN k.value::numeric NOT BETWEEN 0 AND 100
                           ELSE true END) THEN
        RAISE EXCEPTION 'evolução inválida: cada percentual tem de ser um número de 0 a 100' USING ERRCODE = '22023';
    END IF;

    SELECT p.* INTO v_d FROM public.projects p WHERE p.id = p_diario_id;
    v_org := public._celular_org_do_projeto(v_d.organization_id, v_d.settings);
    IF v_d.id IS NULL OR public.is_org_member_de(v_user, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    SELECT p.* INTO v_pl FROM public.projects p WHERE p.id = p_planejamento_id FOR UPDATE;
    IF v_pl.id IS NULL OR public._celular_planejamento_aceito(v_pl.id, v_pl.organization_id, v_pl.settings, v_d.settings, v_org) IS NOT TRUE THEN
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
$function$;

-- ── ACL (REGRA #7) ───────────────────────────────────────────────────────────
-- Interna: nenhum papel da API executa.
REVOKE EXECUTE ON FUNCTION public._celular_orgs_do_usuario(UUID) FROM PUBLIC, anon, authenticated;
-- celular_*: CREATE OR REPLACE mantém a ACL; reafirmada aqui (SECURITY DEFINER recriada repete o REVOKE).
REVOKE EXECUTE ON FUNCTION public.celular_diarios_listar(TEXT)                                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diarios_listar(TEXT)                                      TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_abrir(TEXT, UUID)                                  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_abrir(TEXT, UUID)                                  TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_autoriza(TEXT, UUID)                               FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_autoriza(TEXT, UUID)                               TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_excluir(TEXT, UUID, TEXT)                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_excluir(TEXT, UUID, TEXT)                          TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_salvar(TEXT, UUID, JSONB)                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_salvar(TEXT, UUID, JSONB)                          TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_midia_orfa(TEXT, UUID, TEXT[])                     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_midia_orfa(TEXT, UUID, TEXT[])                     TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_midia_permitida(TEXT, TEXT[])                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_midia_permitida(TEXT, TEXT[])                      TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_efetivo_listar(TEXT)                                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_efetivo_listar(TEXT)                                      TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_planejamento_ler(TEXT, UUID, UUID)                        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_planejamento_ler(TEXT, UUID, UUID)                        TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_planejamento_gravar_evolucao(TEXT, UUID, UUID, JSONB)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_planejamento_gravar_evolucao(TEXT, UUID, UUID, JSONB)     TO anon, authenticated;
