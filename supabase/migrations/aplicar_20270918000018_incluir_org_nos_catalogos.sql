-- ============================================================
-- Migration: aplicar_20270918000018_incluir_org_nos_catalogos.sql
-- Complemento operacional do C1-06 (catálogos por organização)
--
-- O PROBLEMA QUE ELA RESOLVE
-- Depois da aplicar_...014, os catálogos (bases de dados de itens e rubricas de
-- folha) pertencem às organizações por vínculo explícito. Uma organização NOVA
-- do grupo não herda nada automaticamente.
--
-- Isso é o mecanismo funcionando, não um defeito: é justamente a ausência de
-- herança automática que impede a organização de um SEGUNDO CLIENTE de herdar
-- junto. Um gatilho em `organizations` não sabe distinguir "mais uma empresa do
-- grupo" de "outro cliente do SaaS" — as duas são um INSERT na mesma tabela.
--
-- Então a inclusão é um ATO DELIBERADO, e esta função é esse ato.
--
-- A GUARDA QUE IMPORTA
-- Não basta ser gestor da organização de destino: se bastasse, o admin do
-- cliente #2 chamaria a função para a PRÓPRIA organização e se serviria dos
-- catálogos do grupo — exatamente o buraco que o C1-06 fechou.
--
-- Por isso são duas condições, e a segunda é por registro:
--   1. o chamador é owner/admin da organização de DESTINO;
--   2. o chamador já tem acesso ao catálogo que está estendendo — só entra na
--      cópia o que ele enxerga como membro da organização DONA.
-- Quem não vê o catálogo não consegue concedê-lo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_incluir_org_nos_catalogos(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_bases int;
    v_rubricas int;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'informe a organizacao' USING ERRCODE = '22004';
    END IF;

    -- Condição 1: gestor do destino.
    IF NOT public.is_org_manager(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    -- Condição 2: só estende o que o chamador já alcança. `is_org_member` é
    -- avaliado com a identidade de quem chamou (SECURITY DEFINER muda o dono
    -- da execução, não o `auth.uid()`/`auth.jwt()`).
    INSERT INTO public.custom_database_org_shares (database_id, target_org_id)
    SELECT d.id, p_org_id
      FROM public.custom_databases d
     WHERE public.is_org_member(d.organization_id)
        OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                    WHERE sh.database_id = d.id
                      AND public.is_org_member(sh.target_org_id))
    ON CONFLICT (database_id, target_org_id) DO NOTHING;
    GET DIAGNOSTICS v_bases = ROW_COUNT;

    INSERT INTO public.rubric_org_shares (rubric_code, target_org_id)
    SELECT r.code, p_org_id
      FROM public.rubrics r
     WHERE r.organization_id IS NOT NULL      -- seed de CLT já vale para todos
       AND (public.is_org_member(r.organization_id)
            OR EXISTS (SELECT 1 FROM public.rubric_org_shares sh
                        WHERE sh.rubric_code = r.code
                          AND public.is_org_member(sh.target_org_id)))
    ON CONFLICT (rubric_code, target_org_id) DO NOTHING;
    GET DIAGNOSTICS v_rubricas = ROW_COUNT;

    RETURN jsonb_build_object(
        'organization_id', p_org_id,
        'bases_incluidas', v_bases,
        'rubricas_incluidas', v_rubricas
    );
END;
$function$;

-- Contagem do que a organização JÁ tem — para a tela dizer se falta algo.
CREATE OR REPLACE FUNCTION public.fn_catalogos_da_org(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_bases int; v_rubricas int; v_bases_total int; v_rubricas_total int;
BEGIN
    IF NOT public.is_org_member(p_org_id) AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_bases    FROM public.custom_database_org_shares WHERE target_org_id = p_org_id;
    SELECT count(*) INTO v_rubricas FROM public.rubric_org_shares          WHERE target_org_id = p_org_id;
    SELECT count(*) INTO v_bases_total    FROM public.custom_databases;
    SELECT count(*) INTO v_rubricas_total FROM public.rubrics WHERE organization_id IS NOT NULL;

    RETURN jsonb_build_object(
        'bases', v_bases, 'bases_total', v_bases_total,
        'rubricas', v_rubricas, 'rubricas_total', v_rubricas_total,
        'completo', v_bases >= v_bases_total AND v_rubricas >= v_rubricas_total
    );
END;
$function$;

-- ── Privilégios (REGRA OBRIGATÓRIA #7: REVOKE literal, junto da criação) ────
REVOKE EXECUTE ON FUNCTION public.fn_incluir_org_nos_catalogos(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_incluir_org_nos_catalogos(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_catalogos_da_org(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_catalogos_da_org(uuid) TO authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE v_anon text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO v_anon
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('fn_incluir_org_nos_catalogos','fn_catalogos_da_org')
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF v_anon IS NOT NULL THEN
        RAISE EXCEPTION 'anon nao pode executar: %', v_anon;
    END IF;

    RAISE NOTICE 'OK: inclusao de organizacao nos catalogos disponivel para gestores.';
END $$;
