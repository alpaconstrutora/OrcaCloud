-- aplicar_20271127200000_link_celular_tarefas_pedidos_todas_orgs.sql
--
-- Link do celular — Tarefas e Pedido Fast passam a valer para TODAS as
-- organizações de que o dono do link é MEMBRO, como o Diário
-- (aplicar_20271127100000). Regra do usuário (27/11/2026): link por organização
-- está descartado; o escopo padrão é sempre "as orgs de que a pessoa é membro".
-- Plano: docs/planos/2026-11-27-diario-link-todas-orgs.md (pedido 3).
-- Provas: scripts/teste-link-celular-tarefas.sql (seção D),
--         scripts/teste-link-celular-pedido-fast.sql.
--
-- Antes: toda RPC usava a org do link (`_mobile_link_resolver` → org_id).
-- Agora:
--   • Tarefas: lista, espaços, status e contagens nas orgs do dono; ver/editar
--     uma tarefa usa a org DA TAREFA (gestor, status e responsável dela);
--     criar: com espaço → org do espaço; sem espaço → `org_id` enviado pela tela
--     (que pergunta quando a pessoa tem mais de uma org — REGRA #5), e, sem ele,
--     a org do link (compatível com o front antigo).
--   • Responsáveis: `celular_responsaveis_listar(p_token, p_org)` — os da org
--     pedida (a da tarefa); sem `p_org`, a do link.
--   • Sessão: + `orgs` [{id, name}] — as orgs do dono, para a tela perguntar.
--   • Pedido Fast: autoriza quem pode pedir em PELO MENOS uma das suas orgs;
--     obras = OBRA das orgs em que ele pode pedir. A Edge `pedido-fast` decide
--     por obra (`fn_pode_criar_pedido_de(user, org da obra)`, que já confere o
--     membro) e deixa de exigir "obra da org do link" — publicar a Edge depois.
--
-- Org de que ele não participa continua de fora (is_org_member_de / o conjunto
-- _celular_orgs_do_usuario). O link segue ancorado na org em que foi gerado
-- (_mobile_link_resolver não muda).
--
-- Copiadas das definições VIVAS em produção (27/11), mudando só a org.
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`, da pasta
-- de uma frente LIGADA ao projeto (com supabase/.temp/project-ref).
-- Ordem: esta migration → front → Edge pedido-fast. Cada passo funciona com o
-- anterior (as RPCs aceitam a chamada antiga).

-- ── Sessão: + orgs do dono ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_sessao(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        'pode_aprovar_diario', public.fn_pode_aprovar_diario_de(v_user, v_org),
        'orgs',                (SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.name, o.id), '[]'::jsonb)
                                  FROM public.organizations o
                                 WHERE o.id IN (SELECT x FROM public._celular_orgs_do_usuario(v_user) AS x)));
END;
$function$;

-- ── Tarefas: lista ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_tarefas_listar(p_token text, p_space_id uuid DEFAULT NULL::uuid, p_folder_id uuid DEFAULT NULL::uuid, p_sem_pasta boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user    UUID;
    v_tarefas JSONB;
    v_obras   JSONB;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    IF coalesce(p_sem_pasta, false) AND p_space_id IS NULL THEN
        RAISE EXCEPTION '"sem pasta" exige o espaço' USING ERRCODE = '22023';
    END IF;

    WITH orgs AS (
        SELECT o FROM public._celular_orgs_do_usuario(v_user) AS o
    ), sel AS (
        SELECT t AS linha, t.id, t.due_date, t.priority, t.project_id
          FROM public.tasks t
         WHERE t.org_id IN (SELECT o FROM orgs)
           AND t.status = 'open'
           AND t.parent_task_id IS NULL
           AND (p_space_id  IS NULL OR t.space_id  = p_space_id)
           AND (p_folder_id IS NULL OR t.folder_id = p_folder_id)
           AND (NOT coalesce(p_sem_pasta, false) OR t.folder_id IS NULL)
           AND public._celular_tarefa_visivel(v_user, t.org_id, t)
         ORDER BY t.due_date ASC NULLS LAST, t.priority ASC, t.id
         LIMIT 300
    )
    SELECT coalesce(jsonb_agg(public._celular_tarefa_json(sel.linha)
                              ORDER BY sel.due_date ASC NULLS LAST, sel.priority ASC, sel.id), '[]'::jsonb),
           coalesce((SELECT jsonb_object_agg(p.id, p.name)
                       FROM public.projects p
                      WHERE p.id IN (SELECT s2.project_id FROM sel s2 WHERE s2.project_id IS NOT NULL)
                        AND public._celular_org_do_projeto(p.organization_id, p.settings) IN (SELECT o FROM orgs)),
                    '{}'::jsonb)
      INTO v_tarefas, v_obras
      FROM sel;

    RETURN jsonb_build_object('tarefas', v_tarefas, 'nomes_obras', v_obras);
END;
$function$;

-- ── Tarefas: espaços ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_espacos_listar(p_token text)
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

    SELECT coalesce(jsonb_agg(
               jsonb_build_object(
                   'id',            s.id,
                   'org_id',        s.org_id,
                   'owner_user_id', s.owner_user_id,
                   'name',          s.name,
                   'color',         s.color,
                   'icon',          s.icon,
                   'position',      s.position,
                   'created_at',    s.created_at,
                   'updated_at',    s.updated_at,
                   'folders', CASE WHEN m.membro THEN coalesce((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'id',         f.id,
                                  'space_id',   f.space_id,
                                  'name',       f.name,
                                  'color',      f.color,
                                  'position',   f.position,
                                  'created_at', f.created_at)
                              ORDER BY f.position, f.created_at, f.id)
                         FROM public.task_folders f
                        WHERE f.space_id = s.id), '[]'::jsonb)
                       ELSE '[]'::jsonb END,
                   'member_count', CASE WHEN m.membro
                       THEN (SELECT count(*) FROM public.task_space_members tsm WHERE tsm.space_id = s.id)
                       ELSE 0 END,
                   'open_task_count', (
                       SELECT count(*)
                         FROM public.tasks t
                        WHERE t.space_id = s.id
                          AND t.org_id = s.org_id
                          AND t.status = 'open'
                          AND t.parent_task_id IS NULL
                          AND public._celular_tarefa_visivel(v_user, s.org_id, t)))
               ORDER BY s.position, s.created_at, s.id), '[]'::jsonb)
      INTO v
      FROM public.task_spaces s
      CROSS JOIN LATERAL (SELECT public.is_task_space_member_de(v_user, s.id) AS membro) m
     WHERE s.org_id IN (SELECT o FROM public._celular_orgs_do_usuario(v_user) AS o)
       AND (s.owner_user_id = v_user OR m.membro);

    RETURN v;
END;
$function$;

-- ── Tarefas: status (de todas as orgs do dono; a tela recorta pela da tarefa) ─
CREATE OR REPLACE FUNCTION public.celular_status_listar(p_token text)
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
               'id',         ts.id,
               'org_id',     ts.org_id,
               'name',       ts.name,
               'color',      ts.color,
               'position',   ts.position,
               'is_default', ts.is_default,
               'is_done',    ts.is_done)
           ORDER BY ts.position, ts.id), '[]'::jsonb)
      INTO v
      FROM public.task_statuses ts
     WHERE ts.org_id IN (SELECT o FROM public._celular_orgs_do_usuario(v_user) AS o);

    RETURN v;
END;
$function$;

-- ── Tarefas: responsáveis da org pedida (a da tarefa) ────────────────────────
-- Assinatura nova (p_org com default): a de 1 argumento sai para não ficarem duas
-- sobrecargas ambíguas no PostgREST; a chamada antiga ({p_token}) cai nesta.
DROP FUNCTION IF EXISTS public.celular_responsaveis_listar(text);
CREATE FUNCTION public.celular_responsaveis_listar(p_token text, p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v_org  UUID;
    v      JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;
    v_org := coalesce(p_org, v_org);
    IF public.is_org_member_de(v_user, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'organização fora do seu acesso' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) ORDER BY e.name, e.id), '[]'::jsonb)
      INTO v
      FROM public._celular_responsaveis(v_org) e;

    RETURN v;
END;
$function$;

-- ── Tarefas: criar ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_tarefa_criar(p_token text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user    UUID;
    v_org     UUID;
    v_pedida  UUID;
    v_titulo  TEXT;
    v_space   UUID;
    v_folder  UUID;
    v_extra   TEXT;
    v_nova    public.tasks;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
        RAISE EXCEPTION 'dados da tarefa precisam ser um objeto' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(k, ', ' ORDER BY k) INTO v_extra
      FROM jsonb_object_keys(p_dados) k
     WHERE k NOT IN ('title', 'description', 'start_date', 'due_date', 'priority', 'space_id', 'folder_id', 'org_id');
    IF v_extra IS NOT NULL THEN
        RAISE EXCEPTION 'campo não aceito: %', v_extra USING ERRCODE = '22023';
    END IF;

    v_titulo := btrim(p_dados ->> 'title');
    IF v_titulo IS NULL OR v_titulo = '' THEN
        RAISE EXCEPTION 'informe o título da tarefa' USING ERRCODE = '22023';
    END IF;

    v_space  := public._celular_uuid(p_dados, 'space_id');
    v_folder := public._celular_uuid(p_dados, 'folder_id');
    v_pedida := public._celular_uuid(p_dados, 'org_id');

    IF v_space IS NOT NULL THEN
        -- Com espaço, a org é a DO ESPAÇO (e o dono tem de ser membro dela e do espaço).
        SELECT s.org_id INTO v_org
          FROM public.task_spaces s
         WHERE s.id = v_space
           AND public.is_org_member_de(v_user, s.org_id)
           AND public.is_task_space_member_de(v_user, s.id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'sem acesso a este espaço' USING ERRCODE = '42501';
        END IF;
        IF v_pedida IS NOT NULL AND v_pedida IS DISTINCT FROM v_org THEN
            RAISE EXCEPTION 'o espaço é de outra organização' USING ERRCODE = '22023';
        END IF;
    ELSE
        -- Sem espaço: a org que a tela perguntou; sem ela, a do link (front antigo).
        v_org := coalesce(v_pedida, v_org);
        IF public.is_org_member_de(v_user, v_org) IS NOT TRUE THEN
            RAISE EXCEPTION 'organização fora do seu acesso' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF v_folder IS NOT NULL AND (v_space IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.task_folders f WHERE f.id = v_folder AND f.space_id = v_space
    )) THEN
        RAISE EXCEPTION 'a pasta não é deste espaço' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.tasks AS t
           (org_id, user_id, title, description, start_date, due_date, priority,
            status, source_module, space_id, folder_id)
    VALUES (v_org, v_user, v_titulo,
            nullif(btrim(p_dados ->> 'description'), ''),
            public._celular_data(p_dados, 'start_date'),
            public._celular_data(p_dados, 'due_date'),
            CASE WHEN p_dados ? 'priority' THEN public._celular_prioridade(p_dados) ELSE 3 END,
            'open', 'manual', v_space, v_folder)
    RETURNING t.* INTO v_nova;

    RETURN public._celular_tarefa_json(v_nova);
END;
$function$;

-- ── Tarefas: atualizar (tudo pela org DA TAREFA) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.celular_tarefa_atualizar(p_token text, p_task_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user      UUID;
    v_org       UUID;
    v_extra     TEXT;
    v_titulo    TEXT;
    v_status    TEXT;
    v_status_id UUID;
    v_resp      UUID;
    v_tudo      BOOLEAN;
    v_atual     public.tasks;
    v_nova      public.tasks;
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
        RAISE EXCEPTION 'alteração precisa ser um objeto' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(k, ', ' ORDER BY k) INTO v_extra
      FROM jsonb_object_keys(p_patch) k
     WHERE k NOT IN ('title', 'description', 'start_date', 'due_date', 'priority',
                     'status', 'status_id', 'assignee_employee_id');
    IF v_extra IS NOT NULL THEN
        RAISE EXCEPTION 'campo não aceito: %', v_extra USING ERRCODE = '22023';
    END IF;

    SELECT t.* INTO v_atual
      FROM public.tasks t
     WHERE t.id = p_task_id
       AND public.is_org_member_de(v_user, t.org_id)
       AND (t.user_id = v_user
            OR ((t.assignee_employee_id IS NOT NULL OR t.space_id IS NOT NULL) AND public.is_org_gestor_de(v_user, t.org_id))
            OR (t.assignee_employee_id IS NOT NULL AND public.is_employee_do_usuario_de(v_user, t.assignee_employee_id)))
       FOR UPDATE;
    IF v_atual.id IS NULL THEN
        RAISE EXCEPTION 'tarefa não encontrada ou sem permissão para editar' USING ERRCODE = '42501';
    END IF;
    v_org := v_atual.org_id;

    IF p_patch ? 'title' THEN
        v_titulo := btrim(p_patch ->> 'title');
        IF v_titulo IS NULL OR v_titulo = '' THEN
            RAISE EXCEPTION 'informe o título da tarefa' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_patch ? 'status' THEN
        v_status := p_patch ->> 'status';
        IF v_status IS NULL OR v_status NOT IN ('open', 'done') THEN
            RAISE EXCEPTION 'status inválido (open ou done)' USING ERRCODE = '22023';
        END IF;
    END IF;

    v_status_id := public._celular_uuid(p_patch, 'status_id');
    IF v_status_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.task_statuses ts WHERE ts.id = v_status_id AND ts.org_id = v_org
    ) THEN
        RAISE EXCEPTION 'status de outra organização' USING ERRCODE = '42501';
    END IF;

    v_resp := public._celular_uuid(p_patch, 'assignee_employee_id');
    IF v_resp IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public._celular_responsaveis(v_org) e WHERE e.id = v_resp
    ) THEN
        RAISE EXCEPTION 'responsável fora desta organização' USING ERRCODE = '42501';
    END IF;

    -- WITH CHECK de tasks_update ∪ tasks_update_gestor ∪ tasks_update_assignee e o gatilho
    -- do app sobre a linha nova (espaço e criador a lista branca não deixa mudar):
    --   • criador e owner/admin trocam o responsável; quem edita só por ser o responsável
    --     continua tendo de ser o responsável depois da alteração;
    --   • tirar o responsável de tarefa fora de espaço (vira agenda pessoal) só o criador.
    v_tudo := v_atual.user_id = v_user
              OR ((v_atual.assignee_employee_id IS NOT NULL OR v_atual.space_id IS NOT NULL)
                  AND public.is_org_gestor_de(v_user, v_org));
    IF p_patch ? 'assignee_employee_id' THEN
        IF NOT v_tudo AND NOT (v_resp IS NOT NULL AND public.is_employee_do_usuario_de(v_user, v_resp)) THEN
            RAISE EXCEPTION 'só quem criou a tarefa ou o proprietário/admin da organização troca o responsável'
                USING ERRCODE = '42501';
        END IF;
        IF v_resp IS NULL AND v_atual.space_id IS NULL AND v_atual.user_id IS DISTINCT FROM v_user THEN
            RAISE EXCEPTION 'só quem criou a tarefa pode deixá-la sem responsável e fora de espaço (ela vira a agenda pessoal de quem a criou)'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    UPDATE public.tasks AS t SET
        title                = CASE WHEN p_patch ? 'title'       THEN v_titulo ELSE t.title END,
        description          = CASE WHEN p_patch ? 'description' THEN nullif(btrim(p_patch ->> 'description'), '') ELSE t.description END,
        start_date           = CASE WHEN p_patch ? 'start_date'  THEN public._celular_data(p_patch, 'start_date') ELSE t.start_date END,
        due_date             = CASE WHEN p_patch ? 'due_date'    THEN public._celular_data(p_patch, 'due_date') ELSE t.due_date END,
        priority             = CASE WHEN p_patch ? 'priority'    THEN public._celular_prioridade(p_patch) ELSE t.priority END,
        status               = CASE WHEN p_patch ? 'status'      THEN v_status ELSE t.status END,
        status_id            = CASE WHEN p_patch ? 'status_id'   THEN v_status_id ELSE t.status_id END,
        assignee_employee_id = CASE WHEN p_patch ? 'assignee_employee_id' THEN v_resp ELSE t.assignee_employee_id END
     WHERE t.id = v_atual.id
    RETURNING t.* INTO v_nova;

    RETURN public._celular_tarefa_json(v_nova);
END;
$function$;

-- ── Pedido Fast: autoriza quem pede em PELO MENOS uma das suas orgs ──────────
-- Devolve ainda a org do link (a Edge antiga a usa; a nova decide pela obra).
CREATE OR REPLACE FUNCTION public._celular_pedido_fast_autoriza(p_token text, p_acao text)
 RETURNS TABLE(user_id uuid, org_id uuid, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v_org  UUID;
BEGIN
    IF p_acao IS NULL OR p_acao NOT IN ('ler', 'criar') THEN
        RAISE EXCEPTION 'ação inválida' USING ERRCODE = '22023';
    END IF;

    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    -- Limite por link e por hora. Ler chama a IA; criar grava pedido.
    PERFORM public._celular_cota(p_token, 'pedido_fast_' || p_acao, CASE p_acao WHEN 'ler' THEN 40 ELSE 30 END);

    -- A mesma regra do app logado (Edge pedido-fast, ação ler).
    IF public.fn_pode_criar_pedido_em_alguma_de(v_user) IS NOT TRUE THEN
        RAISE EXCEPTION 'sem acesso a Pedidos de Compra' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT v_user, v_org, lower(u.email)::text FROM auth.users u WHERE u.id = v_user;
END;
$function$;

-- ── Pedido Fast: obras das orgs em que o dono pode pedir ─────────────────────
CREATE OR REPLACE FUNCTION public.celular_obras_listar(p_token text)
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user  UUID;
    v_orgs  UUID[];
BEGIN
    SELECT r.user_id INTO v_user FROM public._mobile_link_resolver(p_token) r;

    SELECT coalesce(array_agg(o), '{}'::uuid[]) INTO v_orgs
      FROM public._celular_orgs_do_usuario(v_user) AS o
     WHERE public.fn_pode_criar_pedido_de(v_user, o);
    IF cardinality(v_orgs) = 0 THEN
        RAISE EXCEPTION 'sem acesso a Pedidos de Compra' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT p.id, p.name::text
          FROM public.projects p
         WHERE p.organization_id = ANY (v_orgs)   -- a Edge numera pela coluna; obra só com settings.organizationId falharia ao criar
           AND public._celular_classificacao(p.settings) = 'OBRA'
           AND NOT coalesce((p.settings ->> 'isSystemProject')::boolean, false)
           AND btrim(coalesce(p.name, '')) NOT IN ('Gestão Comercial')
         ORDER BY p.name, p.id;
END;
$function$;

-- ── ACL (REGRA #7) ───────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public._celular_pedido_fast_autoriza(TEXT, TEXT)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_sessao(TEXT)                                        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_sessao(TEXT)                                        TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_tarefas_listar(TEXT, UUID, UUID, BOOLEAN)           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefas_listar(TEXT, UUID, UUID, BOOLEAN)           TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_espacos_listar(TEXT)                                FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_espacos_listar(TEXT)                                TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_status_listar(TEXT)                                 FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_status_listar(TEXT)                                 TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_responsaveis_listar(TEXT, UUID)                     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_responsaveis_listar(TEXT, UUID)                     TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_tarefa_criar(TEXT, JSONB)                           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefa_criar(TEXT, JSONB)                           TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB)                 FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_tarefa_atualizar(TEXT, UUID, JSONB)                 TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_obras_listar(TEXT)                                  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_obras_listar(TEXT)                                  TO anon, authenticated;
