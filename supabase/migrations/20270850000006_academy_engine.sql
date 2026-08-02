-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 7
-- Motor compartilhado pelos DOIS canais (app logado e portal por token).
--
-- Estas funções são INTERNAS: recebem o employee_id já validado pelo
-- chamador e não têm GRANT nenhum. Quem valida quem é você são os wrappers
-- (fn_academy_* para authenticated, academy_portal_* para anon por token).
--
-- Princípio: TODA decisão de progresso e conclusão acontece aqui, no
-- servidor. O cliente nunca decide se a aula foi concluída.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. RECALCULA O PROGRESSO DA MATRÍCULA ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_academy_recompute_progress(p_enrollment_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_version   UUID;
    v_total     INTEGER;
    v_ok        INTEGER;
    v_pct       NUMERIC(5,2);
    v_segundos  BIGINT;
BEGIN
    SELECT version_id INTO v_version FROM public.academy_enrollments WHERE id = p_enrollment_id;
    IF v_version IS NULL THEN RETURN 0; END IF;

    SELECT COUNT(*) INTO v_total
      FROM public.academy_lessons WHERE version_id = v_version AND obrigatoria;

    SELECT COUNT(*) INTO v_ok
      FROM public.academy_lesson_progress p
      JOIN public.academy_lessons l ON l.id = p.lesson_id
     WHERE p.enrollment_id = p_enrollment_id AND p.concluida AND l.obrigatoria;

    SELECT COALESCE(SUM(segundos_assistidos), 0) INTO v_segundos
      FROM public.academy_lesson_progress WHERE enrollment_id = p_enrollment_id;

    v_pct := CASE WHEN v_total = 0 THEN 0
                  ELSE ROUND((v_ok::numeric / v_total::numeric) * 100, 2) END;

    UPDATE public.academy_enrollments
       SET percentual_progresso = v_pct,
           segundos_assistidos  = v_segundos,
           status = CASE
               WHEN status IN ('CONCLUIDO','CANCELADO','EXPIRADO') THEN status
               WHEN v_pct > 0 THEN 'EM_ANDAMENTO'
               ELSE status END,
           data_inicio = COALESCE(data_inicio, CASE WHEN v_pct > 0 THEN NOW() END)
     WHERE id = p_enrollment_id;

    RETURN v_pct;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_recompute_progress(UUID) FROM PUBLIC, anon, authenticated;

-- ── 2. HEARTBEAT ────────────────────────────────────────────────────────
-- Onde a fraude de progresso morre. Três defesas, todas server-side:
--   a) clamp: cada chamada credita no máximo 60s;
--   b) rate limit: heartbeat com menos de 20s desde o anterior é descartado;
--   c) seek: com permite_avanco_rapido = FALSE, salto à frente não credita.

CREATE OR REPLACE FUNCTION public.fn_academy_heartbeat_internal(
    p_enrollment_id UUID,
    p_lesson_id     UUID,
    p_posicao       INTEGER,
    p_delta         INTEGER,
    p_canal         TEXT,
    p_ip            TEXT DEFAULT NULL,
    p_user_agent    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e          RECORD;
    l          RECORD;
    p          RECORD;
    v_delta    INTEGER;
    v_ultimo   TIMESTAMPTZ;
    v_maior    INTEGER;
    v_segundos INTEGER;
    v_pct      NUMERIC(5,2);
    v_base     INTEGER;
BEGIN
    SELECT * INTO e FROM public.academy_enrollments WHERE id = p_enrollment_id;
    IF e.id IS NULL OR e.status IN ('CANCELADO','EXPIRADO') THEN
        RAISE EXCEPTION 'Matrícula indisponível' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO l FROM public.academy_lessons WHERE id = p_lesson_id AND version_id = e.version_id;
    IF l.id IS NULL THEN
        RAISE EXCEPTION 'Aula não pertence a esta matrícula' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.academy_lesson_progress (
        org_id, enrollment_id, lesson_id, employee_id, primeira_visualizacao_em)
    VALUES (e.org_id, p_enrollment_id, p_lesson_id, e.employee_id, NOW())
    ON CONFLICT (enrollment_id, lesson_id) DO NOTHING;

    SELECT * INTO p FROM public.academy_lesson_progress
     WHERE enrollment_id = p_enrollment_id AND lesson_id = p_lesson_id;

    -- (a) clamp
    v_delta := LEAST(GREATEST(COALESCE(p_delta, 0), 0), 60);

    -- (b) rate limit: 20s é o piso real para um heartbeat de 30s com jitter
    SELECT MAX(created_at) INTO v_ultimo
      FROM public.academy_access_logs
     WHERE enrollment_id = p_enrollment_id AND lesson_id = p_lesson_id AND evento = 'HEARTBEAT';
    IF v_ultimo IS NOT NULL AND NOW() - v_ultimo < INTERVAL '20 seconds' THEN
        v_delta := 0;
    END IF;

    -- (c) seek à frente não credita quando o avanço rápido está bloqueado
    v_maior := GREATEST(p.maior_posicao_segundos, 0);
    IF NOT l.permite_avanco_rapido
       AND COALESCE(p_posicao, 0) > v_maior + v_delta + 5 THEN
        v_delta := 0;
    END IF;

    v_segundos := p.segundos_assistidos + v_delta;
    v_maior    := GREATEST(v_maior, LEAST(COALESCE(p_posicao, 0), v_segundos + 5));

    -- Base do percentual: a duração do vídeo, ou o tempo mínimo para
    -- material sem duração intrínseca (PDF/TEXTO/IMAGEM).
    v_base := COALESCE(NULLIF(l.duracao_segundos, 0), NULLIF(l.tempo_minimo_segundos, 0));
    v_pct  := CASE WHEN v_base IS NULL THEN 0
                   ELSE LEAST(ROUND((v_segundos::numeric / v_base::numeric) * 100, 2), 100) END;

    UPDATE public.academy_lesson_progress
       SET segundos_assistidos    = v_segundos,
           posicao_segundos       = COALESCE(p_posicao, posicao_segundos),
           maior_posicao_segundos = v_maior,
           percentual             = v_pct,
           ultima_visualizacao_em = NOW()
     WHERE id = p.id;

    INSERT INTO public.academy_access_logs (
        org_id, enrollment_id, lesson_id, employee_id, evento, canal,
        posicao_segundos, delta_segundos, ip, user_agent)
    VALUES (e.org_id, p_enrollment_id, p_lesson_id, e.employee_id, 'HEARTBEAT', p_canal,
            p_posicao, v_delta, p_ip, p_user_agent);

    PERFORM public.fn_academy_recompute_progress(p_enrollment_id);

    RETURN jsonb_build_object(
        'segundos_assistidos', v_segundos,
        'percentual',          v_pct,
        'creditado',           v_delta
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_heartbeat_internal(UUID,UUID,INTEGER,INTEGER,TEXT,TEXT,TEXT)
    FROM PUBLIC, anon, authenticated;

-- ── 3. CONCLUIR AULA — decisão exclusivamente do servidor ───────────────

CREATE OR REPLACE FUNCTION public.fn_academy_complete_lesson_internal(
    p_enrollment_id UUID,
    p_lesson_id     UUID,
    p_canal         TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e         RECORD;
    l         RECORD;
    v         RECORD;
    p         RECORD;
    v_minimo  INTEGER;
BEGIN
    SELECT * INTO e FROM public.academy_enrollments WHERE id = p_enrollment_id;
    IF e.id IS NULL OR e.status IN ('CANCELADO','EXPIRADO') THEN
        RAISE EXCEPTION 'Matrícula indisponível' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO l FROM public.academy_lessons WHERE id = p_lesson_id AND version_id = e.version_id;
    IF l.id IS NULL THEN
        RAISE EXCEPTION 'Aula não pertence a esta matrícula' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v FROM public.academy_course_versions WHERE id = e.version_id;

    SELECT * INTO p FROM public.academy_lesson_progress
     WHERE enrollment_id = p_enrollment_id AND lesson_id = p_lesson_id;
    IF p.id IS NULL THEN
        RETURN jsonb_build_object('concluida', FALSE, 'percentual', 0,
                                  'minimo', v.regra_percentual_minimo,
                                  'motivo', 'Aula ainda não foi iniciada.');
    END IF;

    -- Ordem obrigatória: a aula anterior precisa estar concluída.
    IF v.regra_ordem_obrigatoria AND EXISTS (
        SELECT 1
          FROM public.academy_lessons ant
          JOIN public.academy_modules m  ON m.id  = ant.module_id
          JOIN public.academy_modules ml ON ml.id = l.module_id
         WHERE ant.version_id = e.version_id
           AND ant.obrigatoria
           AND (m.ordem, ant.ordem) < (ml.ordem, l.ordem)
           AND NOT EXISTS (
                SELECT 1 FROM public.academy_lesson_progress pp
                 WHERE pp.enrollment_id = p_enrollment_id
                   AND pp.lesson_id = ant.id AND pp.concluida)
    ) THEN
        RETURN jsonb_build_object('concluida', FALSE, 'percentual', p.percentual,
                                  'minimo', v.regra_percentual_minimo,
                                  'motivo', 'Conclua a aula anterior primeiro.');
    END IF;

    v_minimo := COALESCE(l.percentual_minimo_override, v.regra_percentual_minimo);

    IF p.percentual < v_minimo THEN
        RETURN jsonb_build_object('concluida', FALSE, 'percentual', p.percentual,
                                  'minimo', v_minimo,
                                  'motivo', format('Faltam %s%% para concluir esta aula.',
                                                   ROUND(v_minimo - p.percentual, 0)));
    END IF;

    UPDATE public.academy_lesson_progress
       SET concluida = TRUE, concluida_em = COALESCE(concluida_em, NOW())
     WHERE id = p.id;

    INSERT INTO public.academy_access_logs (
        org_id, enrollment_id, lesson_id, employee_id, evento, canal)
    VALUES (e.org_id, p_enrollment_id, p_lesson_id, e.employee_id, 'CONCLUSAO_AULA', p_canal);

    RETURN jsonb_build_object('concluida', TRUE, 'percentual', p.percentual,
                              'minimo', v_minimo,
                              'progresso_matricula',
                              public.fn_academy_recompute_progress(p_enrollment_id));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_complete_lesson_internal(UUID,UUID,TEXT)
    FROM PUBLIC, anon, authenticated;

-- ── 4. INICIAR TENTATIVA ────────────────────────────────────────────────
-- Sorteia e CONGELA as questões. Devolve as opções SEM a coluna "correta".

CREATE OR REPLACE FUNCTION public.fn_academy_start_attempt_internal(
    p_enrollment_id UUID,
    p_assessment_id UUID,
    p_canal         TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e        RECORD;
    a        RECORD;
    att      RECORD;
    v_usadas INTEGER;
    v_qs     UUID[];
    v_result JSONB;
BEGIN
    SELECT * INTO e FROM public.academy_enrollments WHERE id = p_enrollment_id;
    IF e.id IS NULL OR e.status IN ('CANCELADO','EXPIRADO') THEN
        RAISE EXCEPTION 'Matrícula indisponível' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO a FROM public.academy_assessments
     WHERE id = p_assessment_id AND version_id = e.version_id AND ativa;
    IF a.id IS NULL THEN
        RAISE EXCEPTION 'Avaliação não pertence a esta matrícula' USING ERRCODE = '42501';
    END IF;

    -- Tentativa em andamento: retoma sem re-sortear.
    SELECT * INTO att FROM public.academy_attempts
     WHERE enrollment_id = p_enrollment_id AND assessment_id = p_assessment_id
       AND status = 'EM_ANDAMENTO'
     ORDER BY numero_tentativa DESC LIMIT 1;

    IF att.id IS NULL THEN
        SELECT COUNT(*) INTO v_usadas FROM public.academy_attempts
         WHERE enrollment_id = p_enrollment_id AND assessment_id = p_assessment_id
           AND status <> 'EM_ANDAMENTO';

        IF v_usadas >= a.tentativas_max THEN
            RAISE EXCEPTION 'Limite de % tentativas atingido', a.tentativas_max
                USING ERRCODE = '22023';
        END IF;

        SELECT ARRAY_AGG(q.id ORDER BY
                    CASE WHEN a.embaralhar_questoes THEN random() ELSE aq.ordem END)
          INTO v_qs
          FROM public.academy_assessment_questions aq
          JOIN public.academy_questions q ON q.id = aq.question_id AND q.ativa
         WHERE aq.assessment_id = p_assessment_id;

        IF v_qs IS NULL OR array_length(v_qs, 1) IS NULL THEN
            RAISE EXCEPTION 'Avaliação sem questões' USING ERRCODE = '22023';
        END IF;

        IF a.qtd_questoes IS NOT NULL AND a.qtd_questoes < array_length(v_qs, 1) THEN
            v_qs := v_qs[1:a.qtd_questoes];
        END IF;

        INSERT INTO public.academy_attempts (
            org_id, assessment_id, enrollment_id, employee_id,
            numero_tentativa, questoes_sorteadas, expira_em)
        VALUES (e.org_id, p_assessment_id, p_enrollment_id, e.employee_id,
                v_usadas + 1, v_qs,
                CASE WHEN a.tempo_limite_minutos IS NOT NULL
                     THEN NOW() + (a.tempo_limite_minutos || ' minutes')::INTERVAL END)
        RETURNING * INTO att;

        UPDATE public.academy_enrollments
           SET tentativas_usadas = v_usadas + 1,
               status = CASE WHEN status = 'CONCLUIDO' THEN status ELSE 'AGUARDANDO_AVALIACAO' END
         WHERE id = p_enrollment_id;

        INSERT INTO public.academy_access_logs (
            org_id, enrollment_id, employee_id, evento, canal)
        VALUES (e.org_id, p_enrollment_id, e.employee_id, 'INICIO_AVALIACAO', p_canal);
    END IF;

    -- Projeção SEM o gabarito. É aqui que o "correta" não vaza.
    SELECT jsonb_agg(item ORDER BY item->>'ordem') INTO v_result
      FROM (
        SELECT jsonb_build_object(
                   'id',        q.id,
                   'enunciado', q.enunciado,
                   'tipo',      q.tipo,
                   'ordem',     idx.ord,
                   'opcoes',    (
                       SELECT jsonb_agg(jsonb_build_object('id', o.id, 'texto', o.texto)
                              ORDER BY CASE WHEN a.embaralhar_opcoes THEN random() ELSE o.ordem END)
                         FROM public.academy_question_options o
                        WHERE o.question_id = q.id)
               ) AS item
          FROM unnest(att.questoes_sorteadas) WITH ORDINALITY AS idx(qid, ord)
          JOIN public.academy_questions q ON q.id = idx.qid
      ) s;

    RETURN jsonb_build_object(
        'attempt_id',       att.id,
        'numero_tentativa', att.numero_tentativa,
        'expira_em',        att.expira_em,
        'nota_minima',      a.nota_minima,
        'questoes',         COALESCE(v_result, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_start_attempt_internal(UUID,UUID,TEXT)
    FROM PUBLIC, anon, authenticated;

-- ── 5. ENVIAR TENTATIVA — correção 100% server-side ─────────────────────

CREATE OR REPLACE FUNCTION public.fn_academy_submit_attempt_internal(
    p_enrollment_id UUID,
    p_attempt_id    UUID,
    p_answers       JSONB,   -- [{"question_id":"...","option_ids":["..."]}]
    p_canal         TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    att        RECORD;
    a          RECORD;
    e          RECORD;
    ans        JSONB;
    v_qid      UUID;
    v_opts     UUID[];
    v_corretas UUID[];
    v_ok       BOOLEAN;
    v_peso     NUMERIC(5,2);
    v_pontos   NUMERIC(10,2) := 0;
    v_total    NUMERIC(10,2) := 0;
    v_acertos  INTEGER := 0;
    v_qtd      INTEGER := 0;
    v_nota     NUMERIC(5,2);
    v_aprovado BOOLEAN;
BEGIN
    SELECT * INTO att FROM public.academy_attempts
     WHERE id = p_attempt_id AND enrollment_id = p_enrollment_id;
    IF att.id IS NULL THEN
        RAISE EXCEPTION 'Tentativa não encontrada' USING ERRCODE = '42501';
    END IF;
    IF att.status <> 'EM_ANDAMENTO' THEN
        RAISE EXCEPTION 'Tentativa já enviada' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO a FROM public.academy_assessments WHERE id = att.assessment_id;
    SELECT * INTO e FROM public.academy_enrollments WHERE id = p_enrollment_id;

    IF att.expira_em IS NOT NULL AND NOW() > att.expira_em THEN
        UPDATE public.academy_attempts SET status = 'EXPIRADA', enviada_em = NOW()
         WHERE id = p_attempt_id;
        RETURN jsonb_build_object('status', 'EXPIRADA', 'nota', 0, 'aprovado', FALSE);
    END IF;

    FOR ans IN SELECT jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb))
    LOOP
        v_qid := (ans->>'question_id')::uuid;

        -- Só aceita questão que foi realmente sorteada nesta tentativa.
        CONTINUE WHEN NOT (v_qid = ANY (att.questoes_sorteadas));

        SELECT ARRAY(SELECT jsonb_array_elements_text(ans->'option_ids')::uuid) INTO v_opts;

        SELECT ARRAY_AGG(o.id ORDER BY o.id) INTO v_corretas
          FROM public.academy_question_options o
         WHERE o.question_id = v_qid AND o.correta;

        -- Acerto = conjunto escolhido idêntico ao conjunto correto.
        -- Cobre MULTIPLA_RESPOSTA sem crédito parcial (proposital: em NR,
        -- marcar uma resposta certa e uma errada não é meio acerto).
        v_ok := (
            SELECT COALESCE(ARRAY(SELECT unnest(v_opts) ORDER BY 1), '{}')
                 = COALESCE(ARRAY(SELECT unnest(v_corretas) ORDER BY 1), '{}')
        );

        SELECT peso INTO v_peso FROM public.academy_questions WHERE id = v_qid;
        v_total := v_total + COALESCE(v_peso, 1);
        v_qtd   := v_qtd + 1;
        IF v_ok THEN
            v_pontos  := v_pontos + COALESCE(v_peso, 1);
            v_acertos := v_acertos + 1;
        END IF;

        INSERT INTO public.academy_attempt_answers (
            org_id, attempt_id, question_id, option_ids, correta, pontos)
        VALUES (att.org_id, p_attempt_id, v_qid, v_opts, v_ok,
                CASE WHEN v_ok THEN COALESCE(v_peso, 1) ELSE 0 END)
        ON CONFLICT (attempt_id, question_id) DO UPDATE
            SET option_ids = EXCLUDED.option_ids,
                correta    = EXCLUDED.correta,
                pontos     = EXCLUDED.pontos;
    END LOOP;

    -- Questões não respondidas contam como erro no denominador.
    SELECT v_total + COALESCE(SUM(q.peso), 0) INTO v_total
      FROM public.academy_questions q
     WHERE q.id = ANY (att.questoes_sorteadas)
       AND NOT EXISTS (SELECT 1 FROM public.academy_attempt_answers aa
                        WHERE aa.attempt_id = p_attempt_id AND aa.question_id = q.id);

    v_nota := CASE WHEN v_total = 0 THEN 0
                   ELSE ROUND((v_pontos / v_total) * 10, 2) END;
    v_aprovado := v_nota >= a.nota_minima;

    UPDATE public.academy_attempts
       SET status = 'ENVIADA', enviada_em = NOW(), nota = v_nota,
           acertos = v_acertos, total = array_length(att.questoes_sorteadas, 1),
           aprovado = v_aprovado
     WHERE id = p_attempt_id;

    UPDATE public.academy_enrollments
       SET nota_final = GREATEST(COALESCE(nota_final, 0), v_nota),
           status = CASE
               WHEN status = 'CONCLUIDO' THEN status
               WHEN v_aprovado THEN 'AGUARDANDO_AVALIACAO'
               ELSE 'REPROVADO' END
     WHERE id = p_enrollment_id;

    INSERT INTO public.academy_access_logs (org_id, enrollment_id, employee_id, evento, canal)
    VALUES (att.org_id, p_enrollment_id, att.employee_id, 'ENVIO_AVALIACAO', p_canal);

    RETURN jsonb_build_object(
        'status',    'ENVIADA',
        'nota',      v_nota,
        'acertos',   v_acertos,
        'total',     array_length(att.questoes_sorteadas, 1),
        'aprovado',  v_aprovado,
        'nota_minima', a.nota_minima,
        'gabarito',  CASE WHEN a.mostrar_gabarito THEN (
            SELECT jsonb_agg(jsonb_build_object(
                       'question_id', aa.question_id,
                       'correta',     aa.correta,
                       'explicacao',  q.explicacao))
              FROM public.academy_attempt_answers aa
              JOIN public.academy_questions q ON q.id = aa.question_id
             WHERE aa.attempt_id = p_attempt_id) ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_submit_attempt_internal(UUID,UUID,JSONB,TEXT)
    FROM PUBLIC, anon, authenticated;

-- ── 6. ACEITE FORMAL ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_academy_accept_internal(
    p_enrollment_id UUID, p_canal TEXT, p_ip TEXT, p_user_agent TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE e RECORD;
BEGIN
    SELECT * INTO e FROM public.academy_enrollments WHERE id = p_enrollment_id;
    IF e.id IS NULL THEN
        RAISE EXCEPTION 'Matrícula não encontrada' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.academy_enrollments
       SET aceite_em = COALESCE(aceite_em, NOW()),
           aceite_ip = COALESCE(aceite_ip, p_ip),
           aceite_user_agent = COALESCE(aceite_user_agent, p_user_agent)
     WHERE id = p_enrollment_id;

    INSERT INTO public.academy_access_logs (
        org_id, enrollment_id, employee_id, evento, canal, ip, user_agent)
    VALUES (e.org_id, p_enrollment_id, e.employee_id, 'ACEITE', p_canal, p_ip, p_user_agent);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_accept_internal(UUID,TEXT,TEXT,TEXT)
    FROM PUBLIC, anon, authenticated;

-- ── 7. FINALIZAR — os 3 critérios + registro legal + certificado ────────

CREATE OR REPLACE FUNCTION public.fn_academy_finalize_internal(
    p_enrollment_id UUID, p_canal TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e        RECORD;
    v        RECORD;
    c        RECORD;
    v_pct    NUMERIC(5,2);
    v_carga  NUMERIC(6,1);
    v_et     UUID;
    v_cert   UUID;
    v_seq    INTEGER;
    v_numero TEXT;
    v_ano    INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    v_falta  TEXT[] := '{}';
BEGIN
    SELECT * INTO e FROM public.academy_enrollments WHERE id = p_enrollment_id;
    IF e.id IS NULL THEN
        RAISE EXCEPTION 'Matrícula não encontrada' USING ERRCODE = 'P0002';
    END IF;

    -- Idempotente: já concluída devolve o certificado existente.
    IF e.status = 'CONCLUIDO' THEN
        SELECT * INTO c FROM public.academy_certificates WHERE enrollment_id = p_enrollment_id;
        RETURN jsonb_build_object('concluido', TRUE, 'certificate_id', c.id,
                                  'numero', c.numero, 'codigo_validacao', c.codigo_validacao);
    END IF;

    SELECT * INTO v FROM public.academy_course_versions WHERE id = e.version_id;
    SELECT * INTO c FROM public.training_courses WHERE id = e.course_id;

    v_pct := public.fn_academy_recompute_progress(p_enrollment_id);

    -- Critério 1: percentual de conteúdo obrigatório concluído.
    IF v_pct < v.regra_percentual_minimo THEN
        v_falta := v_falta || format('conteúdo (%s%% de %s%%)',
                                     ROUND(v_pct, 0), v.regra_percentual_minimo);
    END IF;

    -- Critério 2: nota mínima.
    IF v.regra_nota_minima IS NOT NULL
       AND COALESCE(e.nota_final, -1) < v.regra_nota_minima THEN
        v_falta := v_falta || format('avaliação (nota mínima %s)', v.regra_nota_minima);
    END IF;

    -- Critério 3: aceite formal.
    IF v.regra_exige_aceite AND e.aceite_em IS NULL THEN
        v_falta := v_falta || 'aceite formal';
    END IF;

    IF array_length(v_falta, 1) IS NOT NULL THEN
        RETURN jsonb_build_object(
            'concluido', FALSE,
            'percentual', v_pct,
            'pendencias', to_jsonb(v_falta),
            'motivo', 'Pendente: ' || array_to_string(v_falta, ', '));
    END IF;

    v_carga := COALESCE(NULLIF(v.carga_horaria_ead, 0), c.carga_horaria);

    UPDATE public.academy_enrollments
       SET status = 'CONCLUIDO', data_conclusao = NOW()
     WHERE id = p_enrollment_id;

    -- Registro LEGAL. data_validade fica NULL DE PROPÓSITO: a trigger
    -- set_training_validade() (20260528000003) calcula a partir de
    -- training_courses.validade_meses. Passar valor explícito silencia o
    -- cálculo e o alerta de vencimento sai errado.
    INSERT INTO public.employee_trainings (
        org_id, employee_id, course_id, data_realizacao, instrutor, local,
        carga_horaria, nota, aprovado, status, origem, enrollment_id, version_id, observacoes)
    VALUES (e.org_id, e.employee_id, e.course_id, CURRENT_DATE, c.instrutor, 'Academia ÒPURA (EAD)',
            v_carga, e.nota_final, TRUE, 'ATIVO', 'ACADEMIA', p_enrollment_id, e.version_id,
            format('Concluído na versão %s do conteúdo.', v.versao))
    ON CONFLICT (enrollment_id) WHERE enrollment_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_et;

    IF v_et IS NULL THEN
        SELECT id INTO v_et FROM public.employee_trainings WHERE enrollment_id = p_enrollment_id;
    END IF;

    v_seq    := public.fn_next_academy_certificate_seq(e.org_id, v_ano);
    v_numero := format('CERT-%s-%s', v_ano, LPAD(v_seq::text, 5, '0'));

    INSERT INTO public.academy_certificates (
        org_id, enrollment_id, employee_id, course_id, version_id, numero,
        carga_horaria, nota_final, data_conclusao, data_validade)
    VALUES (e.org_id, p_enrollment_id, e.employee_id, e.course_id, e.version_id, v_numero,
            v_carga, e.nota_final, CURRENT_DATE,
            (SELECT data_validade FROM public.employee_trainings WHERE id = v_et))
    RETURNING id INTO v_cert;

    UPDATE public.academy_enrollments
       SET employee_training_id = v_et, certificate_id = v_cert
     WHERE id = p_enrollment_id;

    UPDATE public.employee_trainings
       SET academy_certificate_id = v_cert
     WHERE id = v_et;

    INSERT INTO public.academy_access_logs (org_id, enrollment_id, employee_id, evento, canal)
    VALUES (e.org_id, p_enrollment_id, e.employee_id, 'EMISSAO_CERTIFICADO', p_canal);

    SELECT * INTO c FROM public.academy_certificates WHERE id = v_cert;

    RETURN jsonb_build_object(
        'concluido',        TRUE,
        'certificate_id',   v_cert,
        'numero',           v_numero,
        'codigo_validacao', c.codigo_validacao,
        'employee_training_id', v_et);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_academy_finalize_internal(UUID,TEXT)
    FROM PUBLIC, anon, authenticated;

-- ── 8. WRAPPERS PARA O APP LOGADO ───────────────────────────────────────
-- Validam que quem chama é membro da org da matrícula.

CREATE OR REPLACE FUNCTION public.fn_academy_assert_member(p_enrollment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID;
BEGIN
    SELECT org_id INTO v_org FROM public.academy_enrollments WHERE id = p_enrollment_id;
    IF v_org IS NULL OR NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_academy_assert_member(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.academy_heartbeat(
    p_enrollment_id UUID, p_lesson_id UUID, p_posicao INTEGER, p_delta INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_assert_member(p_enrollment_id);
    RETURN public.fn_academy_heartbeat_internal(
        p_enrollment_id, p_lesson_id, p_posicao, p_delta, 'APP', NULL, NULL);
END; $$;
REVOKE ALL ON FUNCTION public.academy_heartbeat(UUID,UUID,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academy_heartbeat(UUID,UUID,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.academy_heartbeat(UUID,UUID,INTEGER,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_complete_lesson(p_enrollment_id UUID, p_lesson_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_assert_member(p_enrollment_id);
    RETURN public.fn_academy_complete_lesson_internal(p_enrollment_id, p_lesson_id, 'APP');
END; $$;
REVOKE ALL ON FUNCTION public.academy_complete_lesson(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academy_complete_lesson(UUID,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.academy_complete_lesson(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_start_attempt(p_enrollment_id UUID, p_assessment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_assert_member(p_enrollment_id);
    RETURN public.fn_academy_start_attempt_internal(p_enrollment_id, p_assessment_id, 'APP');
END; $$;
REVOKE ALL ON FUNCTION public.academy_start_attempt(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academy_start_attempt(UUID,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.academy_start_attempt(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_submit_attempt(
    p_enrollment_id UUID, p_attempt_id UUID, p_answers JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_assert_member(p_enrollment_id);
    RETURN public.fn_academy_submit_attempt_internal(p_enrollment_id, p_attempt_id, p_answers, 'APP');
END; $$;
REVOKE ALL ON FUNCTION public.academy_submit_attempt(UUID,UUID,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academy_submit_attempt(UUID,UUID,JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.academy_submit_attempt(UUID,UUID,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_accept(p_enrollment_id UUID, p_user_agent TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_assert_member(p_enrollment_id);
    PERFORM public.fn_academy_accept_internal(p_enrollment_id, 'APP', NULL, p_user_agent);
END; $$;
REVOKE ALL ON FUNCTION public.academy_accept(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academy_accept(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.academy_accept(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_finalize(p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM public.fn_academy_assert_member(p_enrollment_id);
    RETURN public.fn_academy_finalize_internal(p_enrollment_id, 'APP');
END; $$;
REVOKE ALL ON FUNCTION public.academy_finalize(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academy_finalize(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.academy_finalize(UUID) TO authenticated;
