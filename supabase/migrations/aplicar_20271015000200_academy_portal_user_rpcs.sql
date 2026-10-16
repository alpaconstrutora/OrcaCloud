-- ============================================================
-- Portal de Treinamentos — passo 2: RPCs do treinando logado
-- Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
--
-- O treinando entra com e-mail e senha mas NÃO é membro da organização:
-- toda leitura direta de tabela devolveria [] (RLS de membro). Por isso
-- tudo passa por aqui — o mesmo desenho do Portal do Colaborador por token
-- (20270850000008), trocando "token → employee" por "e-mail do JWT →
-- academy_portal_users → employee(s)".
--
-- Pré-requisito: 20270850000006_academy_engine.sql (fn_academy_*_internal).
--
-- REGRA #7: núcleo sem grant; cascas só `authenticated` (REVOKE de PUBLIC e
-- anon); a autorização (a matrícula é de uma das MINHAS fichas) fica DENTRO
-- de cada função. As funções que escrevem NÃO são STABLE (20270855000000).
-- ============================================================

SET lock_timeout = '5s';

-- ── 0. Núcleo: e-mail do JWT → fichas do treinando ─────────────────────

CREATE OR REPLACE FUNCTION public.fn_academy_portal_user_employees()
RETURNS TABLE (portal_user_id UUID, org_id UUID, employee_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT u.id, u.org_id, u.employee_id
      FROM public.academy_portal_users u
     WHERE u.is_active
       AND u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
       AND coalesce(auth.jwt() ->> 'email', '') <> '';
$$;
REVOKE ALL ON FUNCTION public.fn_academy_portal_user_employees() FROM PUBLIC, anon, authenticated;

-- A matrícula é de uma das minhas fichas? Devolve o employee_id dono.
CREATE OR REPLACE FUNCTION public.fn_academy_portal_user_assert_enrollment(p_enrollment_id UUID)
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
       AND en.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees() e);
    IF v_dono IS NULL THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
    RETURN v_dono;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_academy_portal_user_assert_enrollment(UUID) FROM PUBLIC, anon, authenticated;

-- ── 1. Quem sou eu (identidades ativas) ─────────────────────────────────
-- Escreve last_access_at: por isso NÃO é STABLE.

CREATE OR REPLACE FUNCTION public.academy_portal_user_my_access()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
    IF v_email = '' THEN RETURN '[]'::jsonb; END IF;

    UPDATE public.academy_portal_users
       SET last_access_at = NOW()
     WHERE email = v_email AND is_active;

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
         WHERE u.email = v_email AND u.is_active
    ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_my_access() TO authenticated;

-- ── 2. Minhas matrículas ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.academy_portal_user_list_enrollments()
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
     WHERE en.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees() e)
       AND en.status <> 'CANCELADO';
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_list_enrollments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_list_enrollments() TO authenticated;

-- ── 3. Conteúdo da matrícula (player) ───────────────────────────────────
-- Mesmo payload de academy_portal_get_content (20270850000008): tem_midia,
-- NUNCA storage_path — quem assina é a Edge Function academy-portal-media.

CREATE OR REPLACE FUNCTION public.academy_portal_user_get_content(p_enrollment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE en RECORD; v RECORD;
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);

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
REVOKE ALL ON FUNCTION public.academy_portal_user_get_content(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_get_content(UUID) TO authenticated;

-- ── 4. Ações (delegam ao motor; canal 'PORTAL') ─────────────────────────

CREATE OR REPLACE FUNCTION public.academy_portal_user_heartbeat(
    p_enrollment_id UUID, p_lesson_id UUID, p_posicao INTEGER, p_delta INTEGER,
    p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);
    RETURN public.fn_academy_heartbeat_internal(
        p_enrollment_id, p_lesson_id, p_posicao, p_delta, 'PORTAL', NULL, p_user_agent);
END; $$;
REVOKE ALL ON FUNCTION public.academy_portal_user_heartbeat(UUID,UUID,INTEGER,INTEGER,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_heartbeat(UUID,UUID,INTEGER,INTEGER,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_user_complete_lesson(p_enrollment_id UUID, p_lesson_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);
    RETURN public.fn_academy_complete_lesson_internal(p_enrollment_id, p_lesson_id, 'PORTAL');
END; $$;
REVOKE ALL ON FUNCTION public.academy_portal_user_complete_lesson(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_complete_lesson(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_user_start_attempt(p_enrollment_id UUID, p_assessment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);
    RETURN public.fn_academy_start_attempt_internal(p_enrollment_id, p_assessment_id, 'PORTAL');
END; $$;
REVOKE ALL ON FUNCTION public.academy_portal_user_start_attempt(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_start_attempt(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_user_submit_attempt(
    p_enrollment_id UUID, p_attempt_id UUID, p_answers JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);
    RETURN public.fn_academy_submit_attempt_internal(p_enrollment_id, p_attempt_id, p_answers, 'PORTAL');
END; $$;
REVOKE ALL ON FUNCTION public.academy_portal_user_submit_attempt(UUID,UUID,JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_submit_attempt(UUID,UUID,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_user_ack_version(p_enrollment_id UUID, p_user_agent TEXT DEFAULT NULL)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);
    RETURN public.fn_academy_ack_version_internal(p_enrollment_id, 'PORTAL', p_user_agent);
END; $$;
REVOKE ALL ON FUNCTION public.academy_portal_user_ack_version(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_ack_version(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_user_accept(p_enrollment_id UUID, p_user_agent TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);
    PERFORM public.fn_academy_accept_internal(p_enrollment_id, 'PORTAL', NULL, p_user_agent);
END; $$;
REVOKE ALL ON FUNCTION public.academy_portal_user_accept(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_accept(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_user_finalize(p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);
    RETURN public.fn_academy_finalize_internal(p_enrollment_id, 'PORTAL');
END; $$;
REVOKE ALL ON FUNCTION public.academy_portal_user_finalize(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_finalize(UUID) TO authenticated;

-- ── 5. Certificados ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.academy_portal_user_certificate(p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c RECORD;
BEGIN
    PERFORM public.fn_academy_portal_user_assert_enrollment(p_enrollment_id);
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
REVOKE ALL ON FUNCTION public.academy_portal_user_certificate(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_certificate(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_user_certificates()
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
     WHERE c.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees() e);
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_certificates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_certificates() TO authenticated;

-- ── 6. Histórico (registro legal: presencial + EAD) ─────────────────────

CREATE OR REPLACE FUNCTION public.academy_portal_user_history()
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
     WHERE et.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees() e);
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_history() TO authenticated;

-- ── 7. Catálogo com inscrição ───────────────────────────────────────────
-- Só curso ATIVO, com inscricao_aberta e com versão PUBLICADA, nas
-- organizações em que tenho identidade. `ja_matriculado` olha a versão
-- vigente: concluído na v1 e v2 publicada = pode se inscrever de novo.

CREATE OR REPLACE FUNCTION public.academy_portal_user_catalog()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH minhas AS (
        SELECT e.org_id, e.employee_id FROM public.fn_academy_portal_user_employees() e
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
REVOKE ALL ON FUNCTION public.academy_portal_user_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_catalog() TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_user_enroll(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    t       RECORD;
    v_ver   RECORD;
    v_emp   UUID;
    v_id    UUID;
BEGIN
    SELECT * INTO t FROM public.training_courses WHERE id = p_course_id;
    IF t.id IS NULL OR t.status <> 'ATIVO' OR NOT t.inscricao_aberta THEN
        RAISE EXCEPTION 'Este treinamento não está aberto para inscrição' USING ERRCODE = '42501';
    END IF;

    SELECT e.employee_id INTO v_emp
      FROM public.fn_academy_portal_user_employees() e
     WHERE e.org_id = t.org_id
     LIMIT 1;
    IF v_emp IS NULL THEN
        RAISE EXCEPTION 'Você não tem acesso à organização deste treinamento' USING ERRCODE = '42501';
    END IF;

    SELECT v.id, v.versao INTO v_ver
      FROM public.academy_course_versions v
     WHERE v.course_id = t.id AND v.status = 'PUBLICADA'
     ORDER BY v.versao DESC
     LIMIT 1;
    IF v_ver.id IS NULL THEN
        RAISE EXCEPTION 'Este treinamento ainda não tem conteúdo publicado' USING ERRCODE = 'P0002';
    END IF;

    -- Idempotente: já tenho matrícula viva nesta versão → devolve ela.
    SELECT en.id INTO v_id
      FROM public.academy_enrollments en
     WHERE en.employee_id = v_emp AND en.version_id = v_ver.id AND en.status <> 'CANCELADO';
    IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('enrollment_id', v_id, 'ja_existia', TRUE);
    END IF;

    INSERT INTO public.academy_enrollments (
        org_id, course_id, version_id, employee_id, origem, status, data_atribuicao, data_limite)
    VALUES (
        t.org_id, t.id, v_ver.id, v_emp, 'INSCRICAO', 'NAO_INICIADO', CURRENT_DATE,
        CASE WHEN t.inscricao_prazo_dias IS NOT NULL
             THEN CURRENT_DATE + t.inscricao_prazo_dias ELSE NULL END)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('enrollment_id', v_id, 'ja_existia', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_enroll(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_enroll(UUID) TO authenticated;

-- ── 8. Mídia: path só para quem é dono (usado pela Edge Function) ───────
-- Devolve o storage_path para a academy-portal-media assinar com service
-- role (a policy do bucket exige membro da org). Registra a evidência no
-- log, como o caminho por token faz — por isso NÃO é STABLE.

CREATE OR REPLACE FUNCTION public.academy_portal_user_media_path(
    p_lesson_id UUID DEFAULT NULL, p_material_id UUID DEFAULT NULL, p_certificate_id UUID DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
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
           AND c.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees() e);
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

    -- Matrícula viva de uma das minhas fichas na versão do recurso.
    SELECT en.id, en.employee_id INTO v_enroll, v_emp
      FROM public.academy_enrollments en
     WHERE en.version_id = v_version
       AND en.status NOT IN ('CANCELADO','EXPIRADO')
       AND en.employee_id IN (SELECT e.employee_id FROM public.fn_academy_portal_user_employees() e)
     ORDER BY en.created_at DESC
     LIMIT 1;
    IF v_enroll IS NULL THEN
        RAISE EXCEPTION 'Sem matrícula ativa neste treinamento' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.academy_access_logs (org_id, enrollment_id, lesson_id, employee_id, evento, canal, user_agent)
    VALUES (v_org, v_enroll, v_lesson, v_emp, v_evento, 'PORTAL', p_user_agent);

    RETURN jsonb_build_object('storage_path', v_path, 'org_id', v_org, 'enrollment_id', v_enroll);
END;
$$;
REVOKE ALL ON FUNCTION public.academy_portal_user_media_path(UUID,UUID,UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_user_media_path(UUID,UUID,UUID,TEXT) TO authenticated;

-- ── 9. Trava: função de portal que escreve não pode ser STABLE ──────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.proname
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('academy_portal_user_my_access','academy_portal_user_heartbeat',
                             'academy_portal_user_complete_lesson','academy_portal_user_start_attempt',
                             'academy_portal_user_submit_attempt','academy_portal_user_ack_version',
                             'academy_portal_user_accept','academy_portal_user_finalize',
                             'academy_portal_user_enroll','academy_portal_user_media_path')
           AND p.provolatile <> 'v'
    LOOP
        RAISE EXCEPTION 'Função % escreve e não pode ser STABLE/IMMUTABLE', r.proname;
    END LOOP;
END $$;
