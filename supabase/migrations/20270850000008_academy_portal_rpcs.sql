-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 9
-- RPCs do Portal do Colaborador (anon, recorte por token).
--
-- ⚠️ NÃO replicar o padrão legado: portal_get_trainings(p_employee_id) e
--    irmãs recebem o UUID do colaborador cru e são grantadas a anon —
--    quem enumerar UUID lê os dados de qualquer um. Aqui TODA função
--    recebe p_token e deriva o employee_id no servidor.
--
-- Nenhuma tabela academy_* tem grant para anon. Tudo passa por aqui.
-- ============================================================

SET lock_timeout = '5s';

-- ── Helper: token → colaborador. SEM grant (só chamável de dentro). ─────

CREATE OR REPLACE FUNCTION public.fn_academy_portal_employee(p_token TEXT)
RETURNS TABLE (employee_id UUID, org_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE t RECORD;
BEGIN
    SELECT pt.employee_id, pt.org_id INTO t
      FROM public.portal_tokens pt
     WHERE pt.token = p_token
       AND pt.is_active
       AND pt.expires_at > NOW();

    IF t.employee_id IS NULL THEN
        RAISE EXCEPTION 'Token inválido ou expirado' USING ERRCODE = '42501';
    END IF;

    UPDATE public.portal_tokens SET last_used_at = NOW() WHERE token = p_token;

    employee_id := t.employee_id;
    org_id      := t.org_id;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_portal_employee(TEXT) FROM PUBLIC, anon, authenticated;

-- Valida token E que a matrícula pertence àquele colaborador.
CREATE OR REPLACE FUNCTION public.fn_academy_portal_assert_enrollment(
    p_token TEXT, p_enrollment_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_emp UUID; v_dono UUID;
BEGIN
    SELECT e.employee_id INTO v_emp FROM public.fn_academy_portal_employee(p_token) e;
    SELECT en.employee_id INTO v_dono FROM public.academy_enrollments en WHERE en.id = p_enrollment_id;

    IF v_dono IS NULL OR v_dono <> v_emp THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
    RETURN v_emp;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_academy_portal_assert_enrollment(TEXT,UUID) FROM PUBLIC, anon, authenticated;

-- ── 1. MINHAS MATRÍCULAS ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.academy_portal_list_enrollments(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_emp UUID;
BEGIN
    SELECT e.employee_id INTO v_emp FROM public.fn_academy_portal_employee(p_token) e;

    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'id',              en.id,
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
                   en.data_limite NULLS LAST)
          FROM public.academy_enrollments en
          JOIN public.training_courses c ON c.id = en.course_id
          JOIN public.academy_course_versions v ON v.id = en.version_id
         WHERE en.employee_id = v_emp AND en.status <> 'CANCELADO'
    ), '[]'::jsonb);
END;
$$;

-- ── 2. CONTEÚDO DE UMA MATRÍCULA ────────────────────────────────────────
-- Devolve tem_midia, NUNCA o storage_path. O path só existe no servidor;
-- quem assina é a Edge Function academy-portal-media.

CREATE OR REPLACE FUNCTION public.academy_portal_get_content(p_token TEXT, p_enrollment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE en RECORD; v RECORD;
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);

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

-- ── 3. AÇÕES ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.academy_portal_heartbeat(
    p_token TEXT, p_enrollment_id UUID, p_lesson_id UUID,
    p_posicao INTEGER, p_delta INTEGER, p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);
    RETURN public.fn_academy_heartbeat_internal(
        p_enrollment_id, p_lesson_id, p_posicao, p_delta, 'PORTAL', NULL, p_user_agent);
END; $$;

CREATE OR REPLACE FUNCTION public.academy_portal_complete_lesson(
    p_token TEXT, p_enrollment_id UUID, p_lesson_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);
    RETURN public.fn_academy_complete_lesson_internal(p_enrollment_id, p_lesson_id, 'PORTAL');
END; $$;

CREATE OR REPLACE FUNCTION public.academy_portal_start_attempt(
    p_token TEXT, p_enrollment_id UUID, p_assessment_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);
    RETURN public.fn_academy_start_attempt_internal(p_enrollment_id, p_assessment_id, 'PORTAL');
END; $$;

CREATE OR REPLACE FUNCTION public.academy_portal_submit_attempt(
    p_token TEXT, p_enrollment_id UUID, p_attempt_id UUID, p_answers JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);
    RETURN public.fn_academy_submit_attempt_internal(p_enrollment_id, p_attempt_id, p_answers, 'PORTAL');
END; $$;

CREATE OR REPLACE FUNCTION public.academy_portal_accept(
    p_token TEXT, p_enrollment_id UUID, p_user_agent TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);
    PERFORM public.fn_academy_accept_internal(p_enrollment_id, 'PORTAL', NULL, p_user_agent);
END; $$;

CREATE OR REPLACE FUNCTION public.academy_portal_finalize(p_token TEXT, p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);
    RETURN public.fn_academy_finalize_internal(p_enrollment_id, 'PORTAL');
END; $$;

CREATE OR REPLACE FUNCTION public.academy_portal_certificate(p_token TEXT, p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c RECORD;
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);
    SELECT * INTO c FROM public.academy_certificates WHERE enrollment_id = p_enrollment_id;
    IF c.id IS NULL THEN
        RETURN jsonb_build_object('exists', FALSE);
    END IF;
    RETURN jsonb_build_object(
        'exists', TRUE, 'id', c.id, 'numero', c.numero,
        'codigo_validacao', c.codigo_validacao, 'emitido_em', c.emitido_em,
        'carga_horaria', c.carga_horaria, 'data_conclusao', c.data_conclusao,
        'data_validade', c.data_validade, 'tem_pdf', (c.storage_path IS NOT NULL));
END; $$;

-- ── 4. GRANTS ───────────────────────────────────────────────────────────
-- anon é DE PROPÓSITO nestas: o recorte multi-tenant vem do token, não de
-- auth.uid(). É a exceção documentada à regra de fechar anon.

DO $$
DECLARE f TEXT;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.academy_portal_list_enrollments(TEXT)',
        'public.academy_portal_get_content(TEXT,UUID)',
        'public.academy_portal_heartbeat(TEXT,UUID,UUID,INTEGER,INTEGER,TEXT)',
        'public.academy_portal_complete_lesson(TEXT,UUID,UUID)',
        'public.academy_portal_start_attempt(TEXT,UUID,UUID)',
        'public.academy_portal_submit_attempt(TEXT,UUID,UUID,JSONB)',
        'public.academy_portal_accept(TEXT,UUID,TEXT)',
        'public.academy_portal_finalize(TEXT,UUID)',
        'public.academy_portal_certificate(TEXT,UUID)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f);
    END LOOP;
END $$;
