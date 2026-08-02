-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 5
-- Versionamento: rascunho, publicação e arquivamento.
--
-- REGRA CENTRAL: publicar NÃO altera o passado, só cria futuro.
-- As matrículas, o progresso, as tentativas e os certificados da versão
-- antiga permanecem intactos — é essa imutabilidade que preserva a evidência.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. RASCUNHO (clone estrutural da versão vigente) ────────────────────
-- Chamada quando o RH clica "Montar conteúdo". Criar a v1 lazily evita um
-- backfill de milhares de linhas vazias numa tabela quente.

CREATE OR REPLACE FUNCTION public.fn_academy_ensure_draft_version(p_course_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org       UUID;
    v_draft     UUID;
    v_publicada UUID;
    v_next      INTEGER;
    v_new       UUID;
    v_mod       RECORD;
    v_new_mod   UUID;
    v_les       RECORD;
    v_new_les   UUID;
    v_q         RECORD;
    v_new_q     UUID;
    v_asm       RECORD;
    v_new_asm   UUID;
    v_qmap      JSONB := '{}'::jsonb;
    v_lmap      JSONB := '{}'::jsonb;
    v_mmap      JSONB := '{}'::jsonb;
BEGIN
    SELECT c.org_id INTO v_org FROM public.training_courses c WHERE c.id = p_course_id;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Treinamento não encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    -- Já existe rascunho? devolve.
    SELECT v.id INTO v_draft FROM public.academy_course_versions v
     WHERE v.course_id = p_course_id AND v.status = 'RASCUNHO';
    IF v_draft IS NOT NULL THEN
        RETURN v_draft;
    END IF;

    SELECT v.id INTO v_publicada FROM public.academy_course_versions v
     WHERE v.course_id = p_course_id AND v.status = 'PUBLICADA';

    SELECT COALESCE(MAX(v.versao), 0) + 1 INTO v_next
      FROM public.academy_course_versions v WHERE v.course_id = p_course_id;

    IF v_publicada IS NULL THEN
        -- Primeira versão: nasce vazia com as regras padrão.
        INSERT INTO public.academy_course_versions (org_id, course_id, versao, status)
        VALUES (v_org, p_course_id, v_next, 'RASCUNHO')
        RETURNING id INTO v_new;
        RETURN v_new;
    END IF;

    -- Clone estrutural da versão vigente, herdando as regras de conclusão.
    INSERT INTO public.academy_course_versions (
        org_id, course_id, versao, status, titulo_versao,
        carga_horaria_ead, validade_meses_override,
        regra_percentual_minimo, regra_nota_minima, regra_exige_aceite,
        regra_texto_aceite, regra_ordem_obrigatoria, regra_tentativas_max,
        exige_reciclagem, migrar_em_andamento)
    SELECT v.org_id, v.course_id, v_next, 'RASCUNHO', v.titulo_versao,
           v.carga_horaria_ead, v.validade_meses_override,
           v.regra_percentual_minimo, v.regra_nota_minima, v.regra_exige_aceite,
           v.regra_texto_aceite, v.regra_ordem_obrigatoria, v.regra_tentativas_max,
           v.exige_reciclagem, v.migrar_em_andamento
      FROM public.academy_course_versions v WHERE v.id = v_publicada
    RETURNING id INTO v_new;

    -- Módulos → aulas. Os arquivos de mídia NÃO são copiados: storage_path é
    -- reaproveitado (mesmo objeto no bucket). Consequência: só se pode apagar
    -- um objeto quando nenhuma lesson/material referenciar aquele path.
    FOR v_mod IN
        SELECT * FROM public.academy_modules WHERE version_id = v_publicada ORDER BY ordem
    LOOP
        INSERT INTO public.academy_modules (org_id, version_id, titulo, descricao, ordem, obrigatorio)
        VALUES (v_org, v_new, v_mod.titulo, v_mod.descricao, v_mod.ordem, v_mod.obrigatorio)
        RETURNING id INTO v_new_mod;
        v_mmap := v_mmap || jsonb_build_object(v_mod.id::text, v_new_mod::text);

        FOR v_les IN
            SELECT * FROM public.academy_lessons WHERE module_id = v_mod.id ORDER BY ordem
        LOOP
            INSERT INTO public.academy_lessons (
                org_id, module_id, version_id, titulo, descricao, ordem, tipo,
                storage_path, video_url, conteudo_html, duracao_segundos,
                tempo_minimo_segundos, percentual_minimo_override, obrigatoria,
                permite_avanco_rapido)
            VALUES (v_org, v_new_mod, v_new, v_les.titulo, v_les.descricao, v_les.ordem, v_les.tipo,
                    v_les.storage_path, v_les.video_url, v_les.conteudo_html, v_les.duracao_segundos,
                    v_les.tempo_minimo_segundos, v_les.percentual_minimo_override, v_les.obrigatoria,
                    v_les.permite_avanco_rapido)
            RETURNING id INTO v_new_les;
            v_lmap := v_lmap || jsonb_build_object(v_les.id::text, v_new_les::text);
        END LOOP;
    END LOOP;

    -- Materiais (reapontando módulo/aula pelos mapas).
    INSERT INTO public.academy_materials (
        org_id, version_id, module_id, lesson_id, titulo, tipo,
        storage_path, url, mime_type, tamanho_bytes, ordem, exige_download)
    SELECT v_org, v_new,
           (v_mmap ->> m.module_id::text)::uuid,
           (v_lmap ->> m.lesson_id::text)::uuid,
           m.titulo, m.tipo, m.storage_path, m.url, m.mime_type,
           m.tamanho_bytes, m.ordem, m.exige_download
      FROM public.academy_materials m
     WHERE m.version_id = v_publicada;

    -- Questões + opções.
    FOR v_q IN SELECT * FROM public.academy_questions WHERE version_id = v_publicada ORDER BY ordem
    LOOP
        INSERT INTO public.academy_questions (
            org_id, version_id, module_id, enunciado, tipo, explicacao, peso, ordem, ativa)
        VALUES (v_org, v_new, (v_mmap ->> v_q.module_id::text)::uuid,
                v_q.enunciado, v_q.tipo, v_q.explicacao, v_q.peso, v_q.ordem, v_q.ativa)
        RETURNING id INTO v_new_q;
        v_qmap := v_qmap || jsonb_build_object(v_q.id::text, v_new_q::text);

        INSERT INTO public.academy_question_options (org_id, question_id, texto, correta, ordem)
        SELECT v_org, v_new_q, o.texto, o.correta, o.ordem
          FROM public.academy_question_options o WHERE o.question_id = v_q.id;
    END LOOP;

    -- Provas + vínculo com o banco de questões.
    FOR v_asm IN SELECT * FROM public.academy_assessments WHERE version_id = v_publicada
    LOOP
        INSERT INTO public.academy_assessments (
            org_id, version_id, module_id, titulo, tipo, nota_minima, qtd_questoes,
            embaralhar_questoes, embaralhar_opcoes, tentativas_max,
            tempo_limite_minutos, mostrar_gabarito, ativa)
        VALUES (v_org, v_new, (v_mmap ->> v_asm.module_id::text)::uuid,
                v_asm.titulo, v_asm.tipo, v_asm.nota_minima, v_asm.qtd_questoes,
                v_asm.embaralhar_questoes, v_asm.embaralhar_opcoes, v_asm.tentativas_max,
                v_asm.tempo_limite_minutos, v_asm.mostrar_gabarito, v_asm.ativa)
        RETURNING id INTO v_new_asm;

        INSERT INTO public.academy_assessment_questions (org_id, assessment_id, question_id, ordem)
        SELECT v_org, v_new_asm, (v_qmap ->> aq.question_id::text)::uuid, aq.ordem
          FROM public.academy_assessment_questions aq
         WHERE aq.assessment_id = v_asm.id
           AND v_qmap ? aq.question_id::text;
    END LOOP;

    RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_ensure_draft_version(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_ensure_draft_version(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_ensure_draft_version(UUID) TO authenticated;

-- ── 2. PUBLICAR ─────────────────────────────────────────────────────────

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

    -- Validação de conteúdo mínimo.
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

    -- Arquiva a anterior ANTES de publicar a nova (índice único parcial).
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

        -- Reciclagem: quem CONCLUIU a versão arquivada e segue ativo ganha
        -- uma matrícula nova na versão vigente. A matrícula antiga NÃO é
        -- tocada — só recebe um ponteiro para frente.
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

        -- Em andamento: por padrão cancela e recria na nova versão. Concluir
        -- conteúdo revogado não faz sentido para NR.
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

-- ── 3. ARQUIVAR (tirar de circulação sem substituta) ────────────────────

CREATE OR REPLACE FUNCTION public.fn_academy_archive_version(p_version_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID;
BEGIN
    SELECT org_id INTO v_org FROM public.academy_course_versions WHERE id = p_version_id;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Versão não encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    UPDATE public.academy_course_versions
       SET status = 'ARQUIVADA', arquivada_em = NOW()
     WHERE id = p_version_id AND status <> 'ARQUIVADA';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_archive_version(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_archive_version(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_archive_version(UUID) TO authenticated;

-- ── 4. PRÉVIA DO IMPACTO DA PUBLICAÇÃO ──────────────────────────────────
-- Alimenta o bloco de contexto do useConfirm ("vai gerar N reciclagens").

CREATE OR REPLACE FUNCTION public.fn_academy_publish_preview(p_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v          RECORD;
    v_anterior UUID;
BEGIN
    SELECT * INTO v FROM public.academy_course_versions WHERE id = p_version_id;
    IF v.id IS NULL OR NOT public.is_org_member(v.org_id) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_anterior FROM public.academy_course_versions
     WHERE course_id = v.course_id AND status = 'PUBLICADA';

    RETURN jsonb_build_object(
        'versao',  v.versao,
        'modulos', (SELECT COUNT(*) FROM public.academy_modules WHERE version_id = p_version_id),
        'aulas',   (SELECT COUNT(*) FROM public.academy_lessons WHERE version_id = p_version_id),
        'provas',  (SELECT COUNT(*) FROM public.academy_assessments WHERE version_id = p_version_id AND ativa),
        'reciclagens', CASE WHEN v_anterior IS NULL OR NOT v.exige_reciclagem THEN 0 ELSE (
            SELECT COUNT(*) FROM public.academy_enrollments e
             JOIN public.employees emp ON emp.id = e.employee_id
             WHERE e.version_id = v_anterior AND e.status = 'CONCLUIDO' AND emp.status = 'ATIVO') END,
        'em_andamento', CASE WHEN v_anterior IS NULL THEN 0 ELSE (
            SELECT COUNT(*) FROM public.academy_enrollments e
             WHERE e.version_id = v_anterior
               AND e.status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_AVALIACAO')) END,
        'migrar_em_andamento', v.migrar_em_andamento
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_publish_preview(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academy_publish_preview(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_publish_preview(UUID) TO authenticated;
