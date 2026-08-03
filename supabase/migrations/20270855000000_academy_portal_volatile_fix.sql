-- ============================================================
-- Academia ÒPURA — conserta as RPCs de leitura do Portal.
--
-- Sintoma: o colaborador abria o link do portal e a Academia não mostrava
-- treinamento nenhum, mesmo com matrícula existente e conteúdo publicado.
--
-- Causa: academy_portal_list_enrollments, academy_portal_get_content e
-- academy_portal_certificate foram declaradas STABLE, mas todas passam por
-- fn_academy_portal_employee, que faz UPDATE em portal_tokens para gravar
-- last_used_at. PostgreSQL não permite escrita dentro de função não-volátil:
-- a chamada morre com 0A000 ("UPDATE is not allowed in a non-volatile
-- function").
--
-- Sondagem com token INVÁLIDO não pegava o problema, porque a exceção de
-- token acontece antes do UPDATE — por isso passou despercebido.
--
-- Correção: as três passam a ser VOLATILE (o default). Elas de fato escrevem
-- — registrar o último acesso do colaborador é parte do rastro de auditoria,
-- não efeito colateral acidental.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. Lista de matrículas do colaborador ───────────────────────────────

CREATE OR REPLACE FUNCTION public.academy_portal_list_enrollments(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
-- VOLATILE (default): grava last_used_at via fn_academy_portal_employee.
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

-- ── 2. Conteúdo de uma matrícula ────────────────────────────────────────
-- Mantém tudo de 20270852000000, mudando apenas a volatilidade.

CREATE OR REPLACE FUNCTION public.academy_portal_get_content(p_token TEXT, p_enrollment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
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
            'ordem_obrigatoria', v.regra_ordem_obrigatoria,
            'ciencia_em', (SELECT MIN(l.created_at) FROM public.academy_access_logs l
                            WHERE l.enrollment_id = p_enrollment_id
                              AND l.evento = 'CIENCIA_VERSAO')),
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

-- ── 3. Certificado ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.academy_portal_certificate(p_token TEXT, p_enrollment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
END;
$$;

-- Grants preservados (anon é intencional: o recorte vem do token).
DO $$
DECLARE f TEXT;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.academy_portal_list_enrollments(TEXT)',
        'public.academy_portal_get_content(TEXT,UUID)',
        'public.academy_portal_certificate(TEXT,UUID)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f);
    END LOOP;
END $$;

-- Conferência: nenhuma das três pode voltar a ser STABLE/IMMUTABLE enquanto
-- passarem por fn_academy_portal_employee.
DO $$
DECLARE v_ruins TEXT;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO v_ruins
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('academy_portal_list_enrollments',
                         'academy_portal_get_content',
                         'academy_portal_certificate')
       AND p.provolatile <> 'v';

    IF v_ruins IS NOT NULL THEN
        RAISE EXCEPTION 'Ainda há RPC de portal não-volátil: %', v_ruins;
    END IF;
END $$;
