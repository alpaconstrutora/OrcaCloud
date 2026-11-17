-- aplicar_20271117980100_diretoria_resumo_semanal.sql
-- ÒPURA CEO — resumo semanal da Diretoria (1ª entrega, Parte 2). Plano: docs/planos/2026-11-17-opura-ceo.md
-- Prova: scripts/teste-diretoria-resumo.sql (BEGIN … ROLLBACK, termina em TUDO OK).
-- Depende de aplicar_20271117980000_diretoria_ceo.sql.
--
-- O que cria:
--   • diretoria_semana_numeros: a "foto" de cada segunda-feira por organização (quantidade e valor
--     por tipo de exceção, determinações vencidas) — base do "melhorou × piorou". Só o servidor grava.
--   • fn_diretoria_registrar_semana(): grava a foto de toda org com alguém com a permissão Diretoria.
--   • fn_diretoria_resumo_destinatarios(): quem ligou "Receber toda segunda" (diretoria.resumo_semanal).
--   • fn_diretoria_resumo_dados(p_user): o painel das orgs em que p_user tem a permissão, os tipos
--     que ele silenciou, o e-mail dele e a foto da semana anterior — para a Edge Function
--     diretoria-resumo-semanal montar o e-mail. As três só para o servidor (service_role/postgres).
--   • fn_diretoria_painel passa a trazer `semana_anterior` (a tela mostra a mesma comparação).
--   • Job do pg_cron "diretoria-resumo-semanal": segunda 10:00 GMT (07:00 de Brasília) registra a
--     semana e chama a function com o CRON_SECRET. A foto é gravada no banco ANTES da chamada:
--     enquanto a function não estiver publicada, as fotos já se acumulam.
--
-- Aplicar: npx supabase db query --linked -f supabase/migrations/aplicar_20271117980100_diretoria_resumo_semanal.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. foto da semana ───────────────────────────────────────────────────────────
CREATE TABLE public.diretoria_semana_numeros (
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    semana          date NOT NULL CHECK (extract(isodow FROM semana) = 1),
    numeros         jsonb NOT NULL,
    gravado_em      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, semana)
);
COMMENT ON TABLE public.diretoria_semana_numeros IS
    'Diretoria (ÒPURA CEO): foto de cada segunda-feira por organização ({por_tipo: {tipo: {quantidade, valor}}, determinacoes_vencidas}). Grava só fn_diretoria_registrar_semana.';

ALTER TABLE public.diretoria_semana_numeros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.diretoria_semana_numeros FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.diretoria_semana_numeros TO authenticated;
GRANT ALL ON TABLE public.diretoria_semana_numeros TO service_role;
CREATE POLICY diretoria_semana_numeros_select ON public.diretoria_semana_numeros
    FOR SELECT TO authenticated USING (organization_id IN (SELECT public._diretoria_orgs(false)));

-- Números de um conjunto de orgs, com a mesma conta do painel.
CREATE OR REPLACE FUNCTION public._diretoria_numeros(p_orgs uuid[], p_hoje date)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    WITH g AS (SELECT e FROM jsonb_array_elements(public._diretoria_excecoes(p_orgs, p_hoje)->'grupos') e)
    SELECT jsonb_build_object(
        'por_tipo', COALESCE((SELECT jsonb_object_agg(x.tipo, jsonb_build_object('quantidade', x.q, 'valor', x.v))
                                FROM (SELECT g.e->>'tipo' AS tipo, sum((g.e->>'quantidade')::integer) AS q,
                                             sum((g.e->>'valor')::numeric) AS v
                                        FROM g GROUP BY 1) x), '{}'::jsonb),
        'determinacoes_vencidas', (SELECT count(*) FROM public.diretoria_determinacoes d
                                    WHERE d.organization_id = ANY(p_orgs) AND d.status <> 'concluida' AND d.prazo < p_hoje))
$$;

-- Foto da semana anterior (segunda passada), somada nas orgs que a têm; nula se nenhuma tem.
CREATE OR REPLACE FUNCTION public._diretoria_semana_anterior(p_orgs uuid[], p_hoje date)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    WITH s AS (SELECT n.* FROM public.diretoria_semana_numeros n
                WHERE n.organization_id = ANY(p_orgs)
                  AND n.semana = date_trunc('week', p_hoje)::date - 7)
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM s) THEN NULL ELSE jsonb_build_object(
        'semana', date_trunc('week', p_hoje)::date - 7,
        'orgs', (SELECT count(*) FROM s),
        'por_tipo', COALESCE((SELECT jsonb_object_agg(y.tipo, jsonb_build_object('quantidade', y.q, 'valor', y.v))
                                FROM (SELECT x.key AS tipo, sum((x.value->>'quantidade')::integer) AS q,
                                             sum((x.value->>'valor')::numeric) AS v
                                        FROM s, jsonb_each(s.numeros->'por_tipo') x GROUP BY x.key) y), '{}'::jsonb),
        'determinacoes_vencidas', (SELECT COALESCE(sum((s.numeros->>'determinacoes_vencidas')::integer), 0) FROM s)) END
$$;

-- Orgs (por membro) em que a pessoa tem a permissão Diretoria — a regra de _diretoria_orgs, sem
-- depender de auth.uid() (o resumo roda no servidor, para cada destinatário).
CREATE OR REPLACE FUNCTION public._diretoria_orgs_de(p_user uuid)
RETURNS uuid[] LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    SELECT ARRAY(
        SELECT DISTINCT m.organization_id
          FROM public.organization_members m
         WHERE m.user_id = p_user
           AND (COALESCE(m.permissions ->> 'canViewDiretoria', 'false') = 'true'
                OR COALESCE(m.permissions ->> 'canEditDiretoria', 'false') = 'true'
                OR EXISTS (SELECT 1 FROM public.superadmins s JOIN auth.users u ON u.id = p_user
                            WHERE s.email = lower(u.email))))
$$;

CREATE OR REPLACE FUNCTION public.fn_diretoria_registrar_semana()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_semana date := date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date;
    v_org    uuid;
    v_n      integer := 0;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'sem acesso: só a rotina do servidor registra a semana' USING ERRCODE = '42501';
    END IF;
    FOR v_org IN
        SELECT DISTINCT m.organization_id
          FROM public.organization_members m
         WHERE m.user_id IS NOT NULL
           AND (COALESCE(m.permissions ->> 'canViewDiretoria', 'false') = 'true'
                OR COALESCE(m.permissions ->> 'canEditDiretoria', 'false') = 'true'
                OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(m.email)))
    LOOP
        INSERT INTO public.diretoria_semana_numeros (organization_id, semana, numeros)
        VALUES (v_org, v_semana, public._diretoria_numeros(ARRAY[v_org], v_hoje))
        ON CONFLICT (organization_id, semana) DO UPDATE SET numeros = EXCLUDED.numeros, gravado_em = now();
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.fn_diretoria_resumo_destinatarios()
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'sem acesso: só a rotina do servidor lista os destinatários' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT p.user_id FROM public.preferencias p
     WHERE p.escopo = 'USUARIO' AND p.chave = 'diretoria.resumo_semanal' AND p.valor = 'true'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.fn_diretoria_resumo_dados(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_email text;
    v_orgs  uuid[];
BEGIN
    IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'sem acesso: só a rotina do servidor monta o resumo de outra pessoa' USING ERRCODE = '42501';
    END IF;
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user;
    v_orgs := CASE WHEN v_email IS NULL THEN '{}'::uuid[] ELSE public._diretoria_orgs_de(p_user) END;
    RETURN public._diretoria_painel_montar(v_orgs, v_hoje) || jsonb_build_object(
        'orgs', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.name) ORDER BY o.name)
                            FROM public.organizations o WHERE o.id = ANY(v_orgs)), '[]'::jsonb),
        'semana_anterior', public._diretoria_semana_anterior(v_orgs, v_hoje),
        'silenciados', (SELECT p.valor FROM public.preferencias p
                         WHERE p.escopo = 'USUARIO' AND p.user_id = p_user AND p.chave = 'diretoria.silenciados'),
        'destinatario', jsonb_build_object(
            'user_id', p_user, 'email', v_email,
            'nome', COALESCE((SELECT NULLIF(btrim(pf.name), '') FROM public.profiles pf WHERE pf.id = p_user), v_email)));
END $$;

-- ── 2. o painel traz a semana anterior ──────────────────────────────────────────
-- Igual à da migration …980000, com `semana_anterior` a mais (mesma assinatura e retorno).
CREATE OR REPLACE FUNCTION public.fn_diretoria_painel(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_orgs uuid[];
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'sem acesso: o painel da diretoria exige um usuário' USING ERRCODE = '42501';
    END IF;
    IF p_org IS NOT NULL THEN
        IF NOT public._diretoria_pode(p_org, false) THEN
            RAISE EXCEPTION 'sem acesso: falta a permissão "Diretoria (CEO)" nesta organização' USING ERRCODE = '42501';
        END IF;
        v_orgs := ARRAY[p_org];
    ELSE
        v_orgs := ARRAY(SELECT public._diretoria_orgs(false));
    END IF;

    RETURN public._diretoria_painel_montar(v_orgs, v_hoje)
        || jsonb_build_object(
               'orgs', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.name,
                                                       'pode_editar', public._diretoria_pode(o.id, true)) ORDER BY o.name)
                     FROM public.organizations o WHERE o.id = ANY(v_orgs)), '[]'::jsonb),
               'semana_anterior', public._diretoria_semana_anterior(v_orgs, v_hoje));
END;
$function$;

-- ── 3. privilégios (REGRA #7, pergunta 2) ───────────────────────────────────────
REVOKE ALL ON FUNCTION public._diretoria_numeros(uuid[], date)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_semana_anterior(uuid[], date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_orgs_de(uuid)                 FROM PUBLIC, anon, authenticated;
-- Servidor: a Edge Function (service_role) e o pg_cron (postgres). Com usuário, recusam por dentro.
REVOKE ALL ON FUNCTION public.fn_diretoria_registrar_semana()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_diretoria_resumo_destinatarios()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_diretoria_resumo_dados(uuid)          FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_registrar_semana()       TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_resumo_destinatarios()   TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_resumo_dados(uuid)       TO service_role;
-- fn_diretoria_painel foi recriada acima: CREATE OR REPLACE mantém o ACL, mas o REVOKE fica
-- escrito aqui também (REGRA #7 — a trava lê o texto de cada arquivo).
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_painel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_painel(uuid) TO authenticated;

-- ── 4. job semanal ──────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'diretoria-resumo-semanal') THEN
        PERFORM cron.unschedule('diretoria-resumo-semanal');
    END IF;
END $$;

SELECT cron.schedule(
    'diretoria-resumo-semanal',
    '0 10 * * 1',
    $cron$
    SELECT public.fn_diretoria_registrar_semana();
    SELECT net.http_post(
        url := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/diretoria-resumo-semanal',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body := '{}'::jsonb
    );
    $cron$
);

COMMIT;
