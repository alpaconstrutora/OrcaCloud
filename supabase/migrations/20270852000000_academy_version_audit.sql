-- ============================================================
-- Academia ÒPURA — auditoria de versão.
--
-- O banco já guardava publicada_por/publicada_em/arquivada_em, mas nada disso
-- aparecia na tela e o impacto da publicação (quantas reciclagens geradas) se
-- perdia — a função devolvia o número e ninguém o persistia.
--
-- Três lacunas fechadas aqui:
--   1. o impacto da publicação passa a ficar gravado na própria versão;
--   2. publicar uma versão que substitui outra exige dizer o que mudou;
--   3. a ciência do aluno sobre a mudança vira evento no log append-only.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. Impacto da publicação, gravado ───────────────────────────────────

ALTER TABLE public.academy_course_versions
    ADD COLUMN IF NOT EXISTS reciclagens_geradas INTEGER,
    ADD COLUMN IF NOT EXISTS migradas_geradas    INTEGER;

COMMENT ON COLUMN public.academy_course_versions.reciclagens_geradas IS
    'Quantas matrículas de reciclagem esta publicação criou. Gravado no ato — o número não pode ser recalculado depois, porque o quadro de pessoal muda.';

-- ── 2. Evento de ciência da versão ──────────────────────────────────────
-- O CHECK precisa ser recriado para aceitar o evento novo. Os valores já
-- existentes continuam todos válidos, então a revalidação não falha.

ALTER TABLE public.academy_access_logs
    DROP CONSTRAINT IF EXISTS academy_access_logs_evento_check;

ALTER TABLE public.academy_access_logs
    ADD CONSTRAINT academy_access_logs_evento_check
    CHECK (evento IN (
        'ABERTURA','HEARTBEAT','PAUSA','CONCLUSAO_AULA','DOWNLOAD_MATERIAL',
        'INICIO_AVALIACAO','ENVIO_AVALIACAO','ACEITE','EMISSAO_CERTIFICADO',
        'CIENCIA_VERSAO'));

-- ── 3. Publicar passa a exigir a descrição da mudança ───────────────────
-- Mesma função de 20270850000004, com duas diferenças: valida notas_versao
-- quando há versão anterior, e persiste o impacto.

CREATE OR REPLACE FUNCTION public.fn_academy_publish_version(p_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v          RECORD;
    v_anterior UUID;
    v_prazo    INTEGER;
    v_recicl   INTEGER := 0;
    v_migrad   INTEGER := 0;
BEGIN
    SELECT * INTO v FROM public.academy_course_versions WHERE id = p_version_id;
    IF v.id IS NULL THEN
        RAISE EXCEPTION 'Versão não encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.is_org_member(v.org_id) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
    IF v.status <> 'RASCUNHO' THEN
        RAISE EXCEPTION 'Só é possível publicar uma versão em rascunho' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.academy_modules WHERE version_id = p_version_id) THEN
        RAISE EXCEPTION 'A versão precisa de pelo menos um módulo' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.academy_lessons WHERE version_id = p_version_id) THEN
        RAISE EXCEPTION 'A versão precisa de pelo menos uma aula' USING ERRCODE = '22023';
    END IF;
    IF v.regra_nota_minima IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.academy_assessments a
         WHERE a.version_id = p_version_id AND a.ativa
           AND EXISTS (SELECT 1 FROM public.academy_assessment_questions aq
                        WHERE aq.assessment_id = a.id)
    ) THEN
        RAISE EXCEPTION 'A versão exige nota mínima, então precisa de uma avaliação ativa com questões'
            USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_anterior FROM public.academy_course_versions
     WHERE course_id = v.course_id AND status = 'PUBLICADA';

    -- Substituir conteúdo vigente sem registrar o motivo torna a evidência
    -- inauditável: anos depois ninguém sabe por que a v1 deixou de valer.
    -- Na primeira versão não se exige, porque não há o que ter mudado.
    IF v_anterior IS NOT NULL
       AND COALESCE(TRIM(v.notas_versao), '') = '' THEN
        RAISE EXCEPTION 'Descreva o que mudou nesta versão antes de publicar'
            USING ERRCODE = '22023';
    END IF;

    IF v_anterior IS NOT NULL THEN
        UPDATE public.academy_course_versions
           SET status = 'ARQUIVADA', arquivada_em = NOW()
         WHERE id = v_anterior;
    END IF;

    UPDATE public.academy_course_versions
       SET status = 'PUBLICADA', publicada_em = NOW(), publicada_por = auth.uid()
     WHERE id = p_version_id;

    IF v_anterior IS NOT NULL THEN
        v_prazo := 30;

        IF v.exige_reciclagem THEN
            WITH alvo AS (
                SELECT e.id AS enroll_id, e.employee_id, e.assignment_id
                  FROM public.academy_enrollments e
                  JOIN public.employees emp ON emp.id = e.employee_id
                 WHERE e.version_id = v_anterior
                   AND e.status = 'CONCLUIDO'
                   AND emp.status = 'ATIVO'
                   AND NOT EXISTS (
                        SELECT 1 FROM public.academy_enrollments n
                         WHERE n.employee_id = e.employee_id
                           AND n.version_id = p_version_id
                           AND n.status <> 'CANCELADO')
            ), nova AS (
                INSERT INTO public.academy_enrollments (
                    org_id, course_id, version_id, employee_id, assignment_id,
                    origem, status, data_limite)
                SELECT v.org_id, v.course_id, p_version_id, a.employee_id, a.assignment_id,
                       'RECICLAGEM', 'NAO_INICIADO',
                       CURRENT_DATE + COALESCE(
                           (SELECT asg.prazo_dias FROM public.academy_assignments asg
                             WHERE asg.id = a.assignment_id), v_prazo)
                  FROM alvo a
                RETURNING id, employee_id
            )
            UPDATE public.academy_enrollments old
               SET substituida_por_id = n.id
              FROM nova n
             WHERE old.version_id = v_anterior
               AND old.employee_id = n.employee_id
               AND old.status = 'CONCLUIDO';

            GET DIAGNOSTICS v_recicl = ROW_COUNT;
        END IF;

        IF v.migrar_em_andamento THEN
            WITH pend AS (
                UPDATE public.academy_enrollments e
                   SET status = 'CANCELADO',
                       cancelamento_motivo = 'Conteúdo substituído pela versão ' || v.versao
                 WHERE e.version_id = v_anterior
                   AND e.status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_AVALIACAO')
                RETURNING e.employee_id, e.assignment_id, e.data_limite
            )
            INSERT INTO public.academy_enrollments (
                org_id, course_id, version_id, employee_id, assignment_id,
                origem, status, data_limite)
            SELECT v.org_id, v.course_id, p_version_id, p.employee_id, p.assignment_id,
                   'ATRIBUICAO', 'NAO_INICIADO', p.data_limite
              FROM pend p
             WHERE NOT EXISTS (
                    SELECT 1 FROM public.academy_enrollments n
                     WHERE n.employee_id = p.employee_id
                       AND n.version_id = p_version_id
                       AND n.status <> 'CANCELADO');

            GET DIAGNOSTICS v_migrad = ROW_COUNT;
        END IF;
    END IF;

    -- Grava o impacto NA VERSÃO: o quadro de pessoal muda, então este número
    -- não teria como ser recalculado depois.
    UPDATE public.academy_course_versions
       SET reciclagens_geradas = v_recicl,
           migradas_geradas    = v_migrad
     WHERE id = p_version_id;

    RETURN jsonb_build_object(
        'version_id',   p_version_id,
        'versao',       v.versao,
        'arquivada',    v_anterior,
        'reciclagens',  v_recicl,
        'migradas',     v_migrad
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_publish_version(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_publish_version(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_publish_version(UUID) TO authenticated;

-- ── 4. Ciência do aluno sobre a mudança de versão ───────────────────────

CREATE OR REPLACE FUNCTION public.fn_academy_ack_version_internal(
    p_enrollment_id UUID, p_canal TEXT, p_user_agent TEXT DEFAULT NULL
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e       RECORD;
    v_ja    TIMESTAMPTZ;
BEGIN
    SELECT * INTO e FROM public.academy_enrollments WHERE id = p_enrollment_id;
    IF e.id IS NULL THEN
        RAISE EXCEPTION 'Matrícula não encontrada' USING ERRCODE = 'P0002';
    END IF;

    -- Idempotente: a primeira ciência é a que vale como evidência.
    SELECT MIN(created_at) INTO v_ja
      FROM public.academy_access_logs
     WHERE enrollment_id = p_enrollment_id AND evento = 'CIENCIA_VERSAO';
    IF v_ja IS NOT NULL THEN
        RETURN v_ja;
    END IF;

    INSERT INTO public.academy_access_logs (
        org_id, enrollment_id, employee_id, evento, canal, user_agent)
    VALUES (e.org_id, p_enrollment_id, e.employee_id, 'CIENCIA_VERSAO', p_canal, p_user_agent);

    RETURN NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_ack_version_internal(UUID,TEXT,TEXT)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.academy_ack_version(
    p_enrollment_id UUID, p_user_agent TEXT DEFAULT NULL
) RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_assert_member(p_enrollment_id);
    RETURN public.fn_academy_ack_version_internal(p_enrollment_id, 'APP', p_user_agent);
END; $$;
REVOKE ALL ON FUNCTION public.academy_ack_version(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academy_ack_version(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.academy_ack_version(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_portal_ack_version(
    p_token TEXT, p_enrollment_id UUID, p_user_agent TEXT DEFAULT NULL
) RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_portal_assert_enrollment(p_token, p_enrollment_id);
    RETURN public.fn_academy_ack_version_internal(p_enrollment_id, 'PORTAL', p_user_agent);
END; $$;
REVOKE ALL ON FUNCTION public.academy_portal_ack_version(TEXT,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academy_portal_ack_version(TEXT,UUID,TEXT) TO anon, authenticated;

-- ── 5. O conteúdo passa a informar se a ciência já foi dada ─────────────
-- Mesma função de 20270850000008, acrescentando versao.ciencia_em.

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

REVOKE ALL ON FUNCTION public.academy_portal_get_content(TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academy_portal_get_content(TEXT,UUID) TO anon, authenticated;

-- ── 6. Histórico de versões para a tela de auditoria ────────────────────
-- Resolve publicada_por (auth.uid()) em nome legível — sem isso a tela
-- mostraria um UUID, que não serve como evidência para ninguém.

CREATE OR REPLACE FUNCTION public.fn_academy_version_history(p_course_id UUID)
RETURNS TABLE (
    id UUID, versao INTEGER, status TEXT, titulo_versao TEXT, notas_versao TEXT,
    publicada_em TIMESTAMPTZ, publicada_por_nome TEXT, arquivada_em TIMESTAMPTZ,
    reciclagens_geradas INTEGER, migradas_geradas INTEGER,
    modulos BIGINT, aulas BIGINT, matriculas BIGINT, concluidas BIGINT, criada_em TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID;
BEGIN
    SELECT c.org_id INTO v_org FROM public.training_courses c WHERE c.id = p_course_id;
    IF v_org IS NULL OR NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT v.id, v.versao, v.status, v.titulo_versao, v.notas_versao,
               v.publicada_em,
               COALESCE(
                   (SELECT m.name FROM public.organization_members m
                     WHERE m.user_id = v.publicada_por AND m.organization_id = v.org_id
                     LIMIT 1),
                   (SELECT m.email FROM public.organization_members m
                     WHERE m.user_id = v.publicada_por LIMIT 1)
               ) AS publicada_por_nome,
               v.arquivada_em, v.reciclagens_geradas, v.migradas_geradas,
               (SELECT COUNT(*) FROM public.academy_modules mo WHERE mo.version_id = v.id),
               (SELECT COUNT(*) FROM public.academy_lessons le WHERE le.version_id = v.id),
               (SELECT COUNT(*) FROM public.academy_enrollments en
                 WHERE en.version_id = v.id AND en.status <> 'CANCELADO'),
               (SELECT COUNT(*) FROM public.academy_enrollments en
                 WHERE en.version_id = v.id AND en.status = 'CONCLUIDO'),
               v.created_at
          FROM public.academy_course_versions v
         WHERE v.course_id = p_course_id
         ORDER BY v.versao DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_version_history(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_version_history(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_version_history(UUID) TO authenticated;
