-- ============================================================
-- Portal de Treinamentos — prévia do gestor "ver como" a pessoa
-- Plano: docs/planos/2026-10-16-portal-treinamentos-previa-ver-como.md
-- Pedido (16/10/2026): "implemente previa da versao mobile"
--
-- As LEITURAS do treinando (academy_portal_user_*) ganham `p_ver_como`
-- (= academy_portal_users.id). Com ele, a identidade é a daquela pessoa e a
-- autorização é ser membro da organização dela — a mesma régua de
-- academy_portal_users_create e do RLS de academy_portal_users. Sem ele,
-- nada muda (o treinando real nunca passa por aqui).
--
-- As ESCRITAS (heartbeat, concluir aula, prova, aceite, ciência, finalizar,
-- inscrição) NÃO ganham o parâmetro: continuam presas ao JWT; o gestor
-- chamando com a matrícula da pessoa recebe 42501, como hoje. Prévia é só
-- leitura. Rastro: com p_ver_como, my_access não grava last_access_at e
-- media_path não insere em academy_access_logs — a evidência de "abriu a
-- aula" é do treinando, não de quem está olhando.
--
-- REGRA #7: núcleo sem grant; cascas só `authenticated` (REVOKE de PUBLIC e
-- anon). PostgREST não aceita sobrecarga: as assinaturas antigas são
-- derrubadas ANTES de criar as novas. my_access e media_path continuam
-- VOLATILE (trava da seção 9 de aplicar_20271015000200).
-- ============================================================

SET lock_timeout = '5s';

-- ── 0. Núcleo com alvo ──────────────────────────────────────────────────
-- NULL → as minhas fichas (núcleo de 16/10, aplicar_20271016200000).
-- Alvo → só aquela identidade, se eu for membro da organização dela
-- (ativa ou não: prévia de um acesso bloqueado também é útil ao gestor).

CREATE OR REPLACE FUNCTION public.fn_academy_portal_user_employees_ou_previa(p_ver_como UUID)
RETURNS TABLE (portal_user_id UUID, org_id UUID, employee_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_alvo RECORD;
BEGIN
    IF p_ver_como IS NULL THEN
        RETURN QUERY
            SELECT e.portal_user_id, e.org_id, e.employee_id
              FROM public.fn_academy_portal_user_employees() e;
        RETURN;
    END IF;

    SELECT x.id, x.org_id, x.employee_id INTO v_alvo
      FROM public.academy_portal_users x
     WHERE x.id = p_ver_como;
    IF v_alvo.id IS NULL THEN
        RAISE EXCEPTION 'Acesso ao portal não encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.is_org_member(v_alvo.org_id) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT v_alvo.id, v_alvo.org_id, v_alvo.employee_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_academy_portal_user_employees_ou_previa(UUID) FROM PUBLIC, anon, authenticated;

-- A matrícula é de uma das fichas (minhas, ou da pessoa da prévia)?
-- Só as leituras passam p_ver_como; as escritas chamam com um argumento.
DROP FUNCTION IF EXISTS public.fn_academy_portal_user_assert_enrollment(UUID);
CREATE OR REPLACE FUNCTION public.fn_academy_portal_user_assert_enrollment(p_enrollment_id UUID, p_ver_como UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_dono UUID;
BEGIN
    SELECT en.employee_id INTO v_dono
      FROM public.academy_enrollments en
     WHERE en.id = p_enrollment_id
       AND en.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees_ou_previa(p_ver_como) e);
    IF v_dono IS NULL THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
    RETURN v_dono;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_academy_portal_user_assert_enrollment(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── 1. Quem sou eu / quem é a pessoa da prévia ──────────────────────────
-- Escreve last_access_at (só sem alvo): por isso NÃO é STABLE.

DROP FUNCTION IF EXISTS public.academy_portal_user_my_access();
CREATE OR REPLACE FUNCTION public.academy_portal_user_my_access(p_ver_como UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
    IF p_ver_como IS NULL THEN
        IF v_email = '' THEN RETURN '[]'::jsonb; END IF;
        UPDATE public.academy_portal_users
           SET last_access_at = NOW()
         WHERE email = v_email AND is_active;
    ELSE
        -- Prévia: autoriza (membro da org da pessoa) e não toca em last_access_at.
        PERFORM * FROM public.fn_academy_portal_user_employees_ou_previa(p_ver_como);
    END IF;

    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'portal_user_id',   u.id,
                   'org_id',           u.org_id,
                   'org_nome',         o.name,
                   'name',             u.name,
                   'email',            u.email,
                   'phone',            u.phone,
                   'cpf',              u.cpf,
                   'tipo',             u.tipo,
                   'employee_id',      u.employee_id,
                   'empresa_terceira', u.empresa_terceira,
                   'funcao',           e.role,
                   'matricula',        e.matricula
               ) ORDER BY o.name)
          FROM public.academy_portal_users u
          JOIN public.organizations o ON o.id = u.org_id
          LEFT JOIN public.employees e ON e.id = u.employee_id
         WHERE CASE WHEN p_ver_como IS NULL
                    THEN u.email = v_email AND u.is_active
                    ELSE u.id = p_ver_como END
    ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_my_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_my_access(UUID) TO authenticated;

-- ── 2. Matrículas ───────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.academy_portal_user_list_enrollments();
CREATE OR REPLACE FUNCTION public.academy_portal_user_list_enrollments(p_ver_como UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id',              en.id,
               'org_id',          en.org_id,
               'org_nome',        o.name,
               'course_id',       en.course_id,
               'curso',           c.nome,
               'nr_referencia',   c.nr_referencia,
               'categoria',       c.categoria,
               'version_id',      en.version_id,
               'versao',          v.versao,
               'status',          en.status,
               'origem',          en.origem,
               'percentual',      en.percentual_progresso,
               'nota_final',      en.nota_final,
               'data_limite',     en.data_limite,
               'data_conclusao',  en.data_conclusao,
               'certificate_id',  en.certificate_id,
               'carga_horaria',   COALESCE(NULLIF(v.carga_horaria_ead, 0), c.carga_horaria)
           ) ORDER BY
               CASE en.status WHEN 'EM_ANDAMENTO' THEN 0 WHEN 'NAO_INICIADO' THEN 1
                              WHEN 'REPROVADO' THEN 2 WHEN 'AGUARDANDO_AVALIACAO' THEN 3
                              ELSE 9 END,
               en.data_limite NULLS LAST, c.nome), '[]'::jsonb)
      FROM public.academy_enrollments en
      JOIN public.training_courses c ON c.id = en.course_id
      JOIN public.academy_course_versions v ON v.id = en.version_id
      JOIN public.organizations o ON o.id = en.org_id
     WHERE en.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees_ou_previa(p_ver_como) e)
       AND en.status <> 'CANCELADO';
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_list_enrollments(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_list_enrollments(UUID) TO authenticated;

-- ── 3. Conteúdo da matrícula (player) ───────────────────────────────────
-- Mesmo payload de antes (aplicar_20271015000200 §3): tem_midia, NUNCA
-- storage_path — quem assina é a Edge Function academy-portal-media.

DROP FUNCTION IF EXISTS public.academy_portal_user_get_content(UUID);
CREATE OR REPLACE FUNCTION public.academy_portal_user_get_content(p_enrollment_id UUID, p_ver_como UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE en RECORD; v RECORD;
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id, p_ver_como);

    SELECT * INTO en FROM public.academy_enrollments WHERE id = p_enrollment_id;
    SELECT * INTO v  FROM public.academy_course_versions WHERE id = en.version_id;

    RETURN jsonb_build_object(
        'enrollment', jsonb_build_object(
            'id', en.id, 'status', en.status, 'percentual', en.percentual_progresso,
            'nota_final', en.nota_final, 'aceite_em', en.aceite_em,
            'data_limite', en.data_limite, 'certificate_id', en.certificate_id),
        'versao', jsonb_build_object(
            'id', v.id, 'versao', v.versao, 'notas_versao', v.notas_versao,
            'percentual_minimo', v.regra_percentual_minimo,
            'nota_minima', v.regra_nota_minima,
            'exige_aceite', v.regra_exige_aceite,
            'texto_aceite', v.regra_texto_aceite,
            'ordem_obrigatoria', v.regra_ordem_obrigatoria),
        'modulos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', m.id, 'titulo', m.titulo, 'descricao', m.descricao, 'ordem', m.ordem,
                'aulas', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', l.id, 'titulo', l.titulo, 'descricao', l.descricao,
                        'ordem', l.ordem, 'tipo', l.tipo,
                        'video_url', l.video_url, 'conteudo_html', l.conteudo_html,
                        'tem_midia', (l.storage_path IS NOT NULL),
                        'duracao_segundos', l.duracao_segundos,
                        'tempo_minimo_segundos', l.tempo_minimo_segundos,
                        'obrigatoria', l.obrigatoria,
                        'permite_avanco_rapido', l.permite_avanco_rapido,
                        'progresso', jsonb_build_object(
                            'percentual', COALESCE(pr.percentual, 0),
                            'posicao_segundos', COALESCE(pr.posicao_segundos, 0),
                            'concluida', COALESCE(pr.concluida, FALSE))
                    ) ORDER BY l.ordem)
                      FROM public.academy_lessons l
                      LEFT JOIN public.academy_lesson_progress pr
                             ON pr.lesson_id = l.id AND pr.enrollment_id = p_enrollment_id
                     WHERE l.module_id = m.id), '[]'::jsonb)
            ) ORDER BY m.ordem)
              FROM public.academy_modules m WHERE m.version_id = en.version_id), '[]'::jsonb),
        'materiais', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', mt.id, 'titulo', mt.titulo, 'tipo', mt.tipo, 'url', mt.url,
                'lesson_id', mt.lesson_id, 'module_id', mt.module_id,
                'tem_arquivo', (mt.storage_path IS NOT NULL),
                'exige_download', mt.exige_download) ORDER BY mt.ordem)
              FROM public.academy_materials mt WHERE mt.version_id = en.version_id), '[]'::jsonb),
        'avaliacoes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id, 'titulo', a.titulo, 'tipo', a.tipo,
                'nota_minima', a.nota_minima, 'tentativas_max', a.tentativas_max,
                'tempo_limite_minutos', a.tempo_limite_minutos,
                'tentativas_usadas', (
                    SELECT COUNT(*) FROM public.academy_attempts at
                     WHERE at.assessment_id = a.id AND at.enrollment_id = p_enrollment_id
                       AND at.status <> 'EM_ANDAMENTO'),
                'melhor_nota', (
                    SELECT MAX(at.nota) FROM public.academy_attempts at
                     WHERE at.assessment_id = a.id AND at.enrollment_id = p_enrollment_id)))
              FROM public.academy_assessments a
             WHERE a.version_id = en.version_id AND a.ativa), '[]'::jsonb)
    );
END;
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_get_content(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_get_content(UUID, UUID) TO authenticated;

-- ── 4. Certificados ─────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.academy_portal_user_certificate(UUID);
CREATE OR REPLACE FUNCTION public.academy_portal_user_certificate(p_enrollment_id UUID, p_ver_como UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c RECORD;
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id, p_ver_como);
    SELECT * INTO c FROM public.academy_certificates WHERE enrollment_id = p_enrollment_id;
    IF c.id IS NULL THEN
        RETURN jsonb_build_object('exists', FALSE);
    END IF;
    RETURN jsonb_build_object(
        'exists', TRUE, 'id', c.id, 'numero', c.numero,
        'codigo_validacao', c.codigo_validacao, 'emitido_em', c.emitido_em,
        'carga_horaria', c.carga_horaria, 'data_conclusao', c.data_conclusao,
        'data_validade', c.data_validade, 'tem_pdf', (c.storage_path IS NOT NULL));
END;
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_certificate(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_certificate(UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.academy_portal_user_certificates();
CREATE OR REPLACE FUNCTION public.academy_portal_user_certificates(p_ver_como UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id',               c.id,
               'enrollment_id',    c.enrollment_id,
               'numero',           c.numero,
               'codigo_validacao', c.codigo_validacao,
               'emitido_em',       c.emitido_em,
               'carga_horaria',    c.carga_horaria,
               'nota_final',       c.nota_final,
               'data_conclusao',   c.data_conclusao,
               'data_validade',    c.data_validade,
               'tem_pdf',          (c.storage_path IS NOT NULL),
               'revogado_em',      c.revogado_em,
               'curso',            t.nome,
               'nr_referencia',    t.nr_referencia,
               'versao',           v.versao,
               'org_id',           c.org_id,
               'org_nome',         o.name
           ) ORDER BY c.emitido_em DESC), '[]'::jsonb)
      FROM public.academy_certificates c
      JOIN public.training_courses t ON t.id = c.course_id
      LEFT JOIN public.academy_course_versions v ON v.id = c.version_id
      JOIN public.organizations o ON o.id = c.org_id
     WHERE c.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees_ou_previa(p_ver_como) e);
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_certificates(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_certificates(UUID) TO authenticated;

-- ── 5. Histórico ────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.academy_portal_user_history();
CREATE OR REPLACE FUNCTION public.academy_portal_user_history(p_ver_como UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id',                     et.id,
               'course_id',              et.course_id,
               'course_nome',            t.nome,
               'nr_referencia',          t.nr_referencia,
               'categoria',              t.categoria,
               'origem',                 et.origem,
               'data_realizacao',        et.data_realizacao,
               'data_validade',          et.data_validade,
               'status',                 et.status,
               'nota',                   et.nota,
               'aprovado',               et.aprovado,
               'carga_horaria',          et.carga_horaria,
               'instrutor',              et.instrutor,
               'local',                  et.local,
               'academy_certificate_id', et.academy_certificate_id,
               'tem_certificado_arquivo', (et.certificado_url IS NOT NULL),
               'org_id',                 et.org_id,
               'org_nome',               o.name
           ) ORDER BY et.data_realizacao DESC, t.nome), '[]'::jsonb)
      FROM public.employee_trainings et
      JOIN public.training_courses t ON t.id = et.course_id
      JOIN public.organizations o ON o.id = et.org_id
     WHERE et.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees_ou_previa(p_ver_como) e);
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_history(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_history(UUID) TO authenticated;

-- ── 6. Catálogo (a inscrição, academy_portal_user_enroll, não muda) ─────

DROP FUNCTION IF EXISTS public.academy_portal_user_catalog();
CREATE OR REPLACE FUNCTION public.academy_portal_user_catalog(p_ver_como UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH minhas AS (
        SELECT e.org_id, e.employee_id FROM public.fn_academy_portal_user_employees_ou_previa(p_ver_como) e
    ),
    vigente AS (
        SELECT DISTINCT ON (v.course_id) v.course_id, v.id AS version_id, v.versao, v.carga_horaria_ead
          FROM public.academy_course_versions v
         WHERE v.status = 'PUBLICADA'
         ORDER BY v.course_id, v.versao DESC
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id',                   t.id,
               'nome',                 t.nome,
               'descricao',            t.descricao,
               'nr_referencia',        t.nr_referencia,
               'categoria',            t.categoria,
               'modalidade',           t.modalidade,
               'carga_horaria',        COALESCE(NULLIF(vg.carga_horaria_ead, 0), t.carga_horaria),
               'validade_meses',       t.validade_meses,
               'inscricao_prazo_dias', t.inscricao_prazo_dias,
               'versao',               vg.versao,
               'version_id',           vg.version_id,
               'org_id',               t.org_id,
               'org_nome',             o.name,
               'enrollment_id',        en.id,
               'enrollment_status',    en.status,
               'ja_matriculado',       (en.id IS NOT NULL)
           ) ORDER BY t.nome), '[]'::jsonb)
      FROM public.training_courses t
      JOIN minhas m ON m.org_id = t.org_id
      JOIN vigente vg ON vg.course_id = t.id
      JOIN public.organizations o ON o.id = t.org_id
      LEFT JOIN public.academy_enrollments en
             ON en.version_id = vg.version_id AND en.employee_id = m.employee_id
            AND en.status <> 'CANCELADO'
     WHERE t.status = 'ATIVO' AND t.inscricao_aberta;
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_catalog(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_catalog(UUID) TO authenticated;

-- ── 7. Mídia: path só para o dono (ou para a prévia do gestor) ──────────
-- Sem alvo, registra a evidência no log (por isso NÃO é STABLE). Com alvo,
-- resolve o caminho e NÃO loga: quem abriu foi o gestor, não o treinando.

DROP FUNCTION IF EXISTS public.academy_portal_user_media_path(UUID, UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.academy_portal_user_media_path(
    p_lesson_id UUID DEFAULT NULL, p_material_id UUID DEFAULT NULL, p_certificate_id UUID DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL, p_ver_como UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_path    TEXT;
    v_org     UUID;
    v_enroll  UUID;
    v_emp     UUID;
    v_lesson  UUID;
    v_version UUID;
    v_evento  TEXT := 'ABERTURA';
BEGIN
    IF p_lesson_id IS NOT NULL THEN
        SELECT l.storage_path, l.org_id, l.version_id, l.id
          INTO v_path, v_org, v_version, v_lesson
          FROM public.academy_lessons l WHERE l.id = p_lesson_id;
    ELSIF p_material_id IS NOT NULL THEN
        SELECT m.storage_path, m.org_id, m.version_id, m.lesson_id
          INTO v_path, v_org, v_version, v_lesson
          FROM public.academy_materials m WHERE m.id = p_material_id;
        v_evento := 'DOWNLOAD_MATERIAL';
    ELSIF p_certificate_id IS NOT NULL THEN
        SELECT c.storage_path, c.org_id, c.enrollment_id, c.employee_id
          INTO v_path, v_org, v_enroll, v_emp
          FROM public.academy_certificates c
         WHERE c.id = p_certificate_id
           AND c.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees_ou_previa(p_ver_como) e);
        IF v_path IS NULL THEN
            RAISE EXCEPTION 'Certificado sem PDF ou de outra pessoa' USING ERRCODE = '42501';
        END IF;
        RETURN jsonb_build_object('storage_path', v_path, 'org_id', v_org, 'enrollment_id', v_enroll);
    ELSE
        RAISE EXCEPTION 'Informe p_lesson_id, p_material_id ou p_certificate_id' USING ERRCODE = '22023';
    END IF;

    IF v_path IS NULL THEN
        RAISE EXCEPTION 'Recurso sem arquivo' USING ERRCODE = 'P0002';
    END IF;

    -- Matrícula viva de uma das fichas na versão do recurso.
    SELECT en.id, en.employee_id INTO v_enroll, v_emp
      FROM public.academy_enrollments en
     WHERE en.version_id = v_version
       AND en.status NOT IN ('CANCELADO','EXPIRADO')
       AND en.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees_ou_previa(p_ver_como) e)
     ORDER BY en.created_at DESC
     LIMIT 1;
    IF v_enroll IS NULL THEN
        RAISE EXCEPTION 'Sem matrícula ativa neste treinamento' USING ERRCODE = '42501';
    END IF;

    IF p_ver_como IS NULL THEN
        INSERT INTO public.academy_access_logs (org_id, enrollment_id, lesson_id, employee_id, evento, canal, user_agent)
        VALUES (v_org, v_enroll, v_lesson, v_emp, v_evento, 'PORTAL', p_user_agent);
    END IF;

    RETURN jsonb_build_object('storage_path', v_path, 'org_id', v_org, 'enrollment_id', v_enroll);
END;
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_media_path(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_media_path(UUID,UUID,UUID,TEXT,UUID) TO authenticated;

-- ── 8. Travas ───────────────────────────────────────────────────────────
-- (a) cada leitura existe UMA vez (PostgREST não resolve sobrecarga) e com
--     p_ver_como; (b) quem escreve continua volátil.
DO $$
DECLARE r RECORD; v_n INTEGER;
BEGIN
    FOR r IN
        SELECT unnest(ARRAY['academy_portal_user_my_access','academy_portal_user_list_enrollments',
                            'academy_portal_user_get_content','academy_portal_user_certificate',
                            'academy_portal_user_certificates','academy_portal_user_history',
                            'academy_portal_user_catalog','academy_portal_user_media_path']) AS nome
    LOOP
        SELECT COUNT(*) INTO v_n
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = r.nome;
        IF v_n <> 1 THEN
            RAISE EXCEPTION 'Função % tem % assinaturas (esperado 1)', r.nome, v_n;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = r.nome
               AND pg_get_function_identity_arguments(p.oid) LIKE '%p_ver_como%'
        ) THEN
            RAISE EXCEPTION 'Função % ficou sem p_ver_como', r.nome;
        END IF;
    END LOOP;

    FOR r IN
        SELECT p.proname
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('academy_portal_user_my_access','academy_portal_user_media_path')
           AND p.provolatile <> 'v'
    LOOP
        RAISE EXCEPTION 'Função % escreve e não pode ser STABLE/IMMUTABLE', r.proname;
    END LOOP;
END $$;
