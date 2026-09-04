-- ============================================================================
-- notifications.organization_id nos crons de alerta legados
-- ============================================================================
--
-- Complemento de `20270919000001`, que criou a coluna e trocou a policy aberta
-- por um recorte de tenant. Os quatro crons abaixo já rodavam em produção e
-- continuavam gravando `organization_id NULL` — o que NÃO os quebra (a
-- notificação segue visível ao destinatário pela perna do e-mail da policy),
-- mas os deixa fora do recorte do seletor de organização do topo (REGRA #5).
--
-- ## O que mudou em cada função — e só isso
--
--   · a lista de colunas do INSERT ganhou `organization_id`;
--   · o VALUES/SELECT ganhou a organização que o laço já tinha em mão.
--
-- Exceção: `generate_academy_alerts` não trazia `en.org_id` no cursor de
-- matrículas (só o usava no WHERE), então a coluna entrou no SELECT. Sem isso
-- não haveria organização para gravar.
--
-- Nenhuma regra de negócio, janela de tempo ou dedup foi tocada.
--
-- ⚠️ **O corpo veio dos ARQUIVOS de migration, não de `pg_get_functiondef`.**
-- A primeira tentativa partiu do banco, e a saída do `supabase db query` chega
-- decodificada errado no Windows: regravá-la em UTF-8 corrompeu todo caractere
-- acentuado das funções ("prazo —" virou "prazo â€""), de forma irreversível a
-- partir do próprio banco. Esta migration é também o conserto disso. Ao
-- reescrever função existente, prefira sempre o arquivo à re-serialização do
-- banco — e confira acento depois de aplicar, porque nada quebra: só sai texto
-- errado para o usuário.
--
-- `CREATE OR REPLACE` preserva a ACL existente; os REVOKE do fim ficam porque
-- `__tests__/segurancaMigrations.test.ts` exige o par SECURITY DEFINER + REVOKE
-- no mesmo arquivo (REGRA #7), e porque contar com "a ACL já estava certa" é
-- exatamente o que a regra proíbe.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_maintenance_due_alerts(p_days_ahead INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_rec       RECORD;
    v_stage     TEXT;
    v_titulo    TEXT;
    v_corpo     TEXT;
    v_label     TEXT;
    v_criados   INTEGER := 0;
BEGIN
    FOR v_rec IN
        SELECT
            i.id, i.description, i.next_due_date,
            i.periodicity_value, i.periodicity_unit,
            i.alerted_for_due_date, i.alerted_stage,
            COALESCE(s.name, 'Sem sistema')  AS system_name,
            e.name                            AS empreendimento_name,
            e.organization_id                 AS organization_id
        FROM public.maintenance_plan_items i
        JOIN public.maintenance_plans p     ON p.id = i.plan_id
        JOIN public.empreendimentos    e    ON e.id = p.empreendimento_id
        LEFT JOIN public.building_systems s  ON s.id = i.building_system_id
        WHERE i.is_active
          AND i.next_due_date IS NOT NULL
          -- Só plano VIGENTE cobra. Rascunho é trabalho em andamento; alertar
          -- sobre ele treinaria o usuário a ignorar o alerta.
          AND p.status = 'VIGENTE'
          AND i.next_due_date <= CURRENT_DATE + p_days_ahead
    LOOP
        v_stage := CASE WHEN v_rec.next_due_date < CURRENT_DATE THEN 'VENCIDO' ELSE 'PROXIMO' END;

        -- Já avisado para ESTE vencimento e NESTE estágio.
        IF v_rec.alerted_for_due_date = v_rec.next_due_date
           AND v_rec.alerted_stage = v_stage THEN
            CONTINUE;
        END IF;

        v_label := TO_CHAR(v_rec.next_due_date, 'DD/MM/YYYY');

        IF v_stage = 'VENCIDO' THEN
            v_titulo := 'Manutenção VENCIDA — ' || v_rec.empreendimento_name;
            v_corpo  := v_rec.system_name || ': ' || v_rec.description
                     || '. Venceu em ' || v_label || ' ('
                     || (CURRENT_DATE - v_rec.next_due_date) || ' dias atrás).';
        ELSE
            v_titulo := 'Manutenção vence em breve — ' || v_rec.empreendimento_name;
            v_corpo  := v_rec.system_name || ': ' || v_rec.description
                     || '. Vence em ' || v_label || ' ('
                     || (v_rec.next_due_date - CURRENT_DATE) || ' dias).';
        END IF;

        -- Uma notificação por MEMBRO da organização. O síndico não entra aqui:
        -- ele ainda não tem login (o Portal do Condômino é F3), e inventar um
        -- envio para um canal que não existe seria alerta que ninguém recebe.
        INSERT INTO public.notifications (recipient_email, title, message, link, type, organization_id)
        SELECT DISTINCT m.email, v_titulo, v_corpo,
               -- O app NÃO tem roteamento por URL (nenhum react-router): a
               -- navegação é estado no AppRouter. Um link aqui não levaria a
               -- lugar nenhum, então fica nulo de propósito.
               NULL,
               'manutencao_vencimento', v_rec.organization_id
          FROM public.organization_members m
         WHERE m.organization_id = v_rec.organization_id
           AND m.email IS NOT NULL;

        UPDATE public.maintenance_plan_items
           SET alerted_for_due_date = v_rec.next_due_date,
               alerted_stage        = v_stage,
               updated_at           = NOW()
         WHERE id = v_rec.id;

        v_criados := v_criados + 1;
    END LOOP;

    RETURN v_criados;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_opura_docs_vencimento_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec         RECORD;
    v_member      RECORD;
    v_created     INTEGER := 0;
    v_target_date DATE := CURRENT_DATE;
    v_link        TEXT;
    v_msg         TEXT;
    v_title       TEXT;
BEGIN
    -- Percorre todos os documentos ativos com validade cadastrada
    FOR v_rec IN
        SELECT 
            d.id,
            d.nome,
            d.categoria,
            d.data_validade,
            d.alerta_dias_antecedencia,
            d.organization_id
        FROM public.opura_documents d
        WHERE d.data_validade IS NOT NULL
          AND d.status = 'ativo'
          -- O alerta dispara quando a data atual coincide com o vencimento menos a antecedência de alerta configurada
          AND (d.data_validade - COALESCE(d.alerta_dias_antecedencia, 30)) = v_target_date
    LOOP
        v_title := 'Validade de Documento: ' || v_rec.nome;
        v_msg := 'O documento "' || v_rec.nome || '" está próximo do vencimento em ' || 
                 TO_CHAR(v_rec.data_validade, 'DD/MM/YYYY') || ' (alerta de ' || 
                 v_rec.alerta_dias_antecedencia || ' dias de antecedência).';
        v_link := '#/documentos?tab=' || v_rec.categoria || '&docId=' || v_rec.id;

        -- Localiza os membros da organização correspondente para notificar
        FOR v_member IN 
            SELECT email 
            FROM public.organization_members 
            WHERE organization_id = v_rec.organization_id
              AND email IS NOT NULL
        LOOP
            -- Idempotência: não envia a mesma notificação se já foi disparada nas últimas 24h para esse usuário
            IF EXISTS (
                SELECT 1 FROM public.notifications
                WHERE recipient_email = v_member.email
                  AND type = 'vencimento_documento'
                  AND link = v_link
                  AND created_at > NOW() - INTERVAL '24 hours'
            ) THEN
                CONTINUE;
            END IF;

            -- Inserir na tabela de notificações do OrçaCloud
            INSERT INTO public.notifications (recipient_email, title, message, link, type, organization_id)
            VALUES (v_member.email, v_title, v_msg, v_link, 'vencimento_documento', v_rec.organization_id);

            v_created := v_created + 1;
        END LOOP;
    END LOOP;

    RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_supplier_warranty_alerts(p_days_ahead INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_rec     RECORD;
    v_stage   TEXT;
    v_titulo  TEXT;
    v_corpo   TEXT;
    v_label   TEXT;
    v_criados INTEGER := 0;
BEGIN
    FOR v_rec IN
        SELECT a.id, a.name, a.code, a.supplier_warranty_until,
               a.warranty_alerted_for, a.warranty_alerted_stage,
               COALESCE(s.name, 'Sem sistema') AS system_name,
               e.name                          AS empreendimento_name,
               e.organization_id               AS organization_id
        FROM public.opura_assets a
        JOIN public.empreendimentos e       ON e.id = a.empreendimento_id
        LEFT JOIN public.building_systems s  ON s.id = a.building_system_id
        WHERE a.empreendimento_id IS NOT NULL
          AND a.supplier_warranty_until IS NOT NULL
          -- Só edifício em operação cobra: alertar sobre garantia de prédio que
          -- ainda não é condomínio é ruído para quem não pode agir.
          AND e.status = 'EM_OPERACAO'
          AND a.supplier_warranty_until <= CURRENT_DATE + p_days_ahead
    LOOP
        v_stage := CASE WHEN v_rec.supplier_warranty_until < CURRENT_DATE THEN 'VENCIDA' ELSE 'PROXIMO' END;

        IF v_rec.warranty_alerted_for = v_rec.supplier_warranty_until
           AND v_rec.warranty_alerted_stage = v_stage THEN
            CONTINUE;
        END IF;

        v_label := TO_CHAR(v_rec.supplier_warranty_until, 'DD/MM/YYYY');

        IF v_stage = 'VENCIDA' THEN
            v_titulo := 'Garantia VENCIDA — ' || v_rec.empreendimento_name;
            v_corpo  := v_rec.name || ' (' || v_rec.code || ', ' || v_rec.system_name || '). '
                     || 'A garantia do fornecedor venceu em ' || v_label
                     || '. A partir daqui, o conserto é custo do condomínio.';
        ELSE
            v_titulo := 'Garantia do fornecedor vence em breve — ' || v_rec.empreendimento_name;
            v_corpo  := v_rec.name || ' (' || v_rec.code || ', ' || v_rec.system_name || '). '
                     || 'A garantia vence em ' || v_label || ' ('
                     || (v_rec.supplier_warranty_until - CURRENT_DATE) || ' dias). '
                     || 'Se há defeito conhecido, acione o fornecedor ANTES do prazo.';
        END IF;

        INSERT INTO public.notifications (recipient_email, title, message, link, type, organization_id)
        SELECT DISTINCT m.email, v_titulo, v_corpo, NULL, 'garantia_fornecedor', v_rec.organization_id
          FROM public.organization_members m
         WHERE m.organization_id = v_rec.organization_id
           AND m.email IS NOT NULL;

        UPDATE public.opura_assets
           SET warranty_alerted_for   = v_rec.supplier_warranty_until,
               warranty_alerted_stage = v_stage,
               updated_at             = NOW()
         WHERE id = v_rec.id;

        v_criados := v_criados + 1;
    END LOOP;

    RETURN v_criados;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.generate_academy_alerts(
    p_days_ahead INTEGER DEFAULT 7,
    p_org_id     UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expiradas   INTEGER := 0;
    v_notificadas INTEGER := 0;
    v_reciclagens INTEGER := 0;
    v_novas       INTEGER := 0;
    v_lote        INTEGER := 0;
    r             RECORD;
BEGIN
    -- Chamada da tela (org informada) exige ser membro. Chamada do cron
    -- (p_org_id NULL) roda sem sessão, como processo do sistema.
    IF p_org_id IS NOT NULL AND NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    UPDATE public.academy_enrollments
       SET status = 'EXPIRADO'
     WHERE data_limite IS NOT NULL
       AND data_limite < CURRENT_DATE
       AND status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_AVALIACAO')
       AND (p_org_id IS NULL OR org_id = p_org_id);
    GET DIAGNOSTICS v_expiradas = ROW_COUNT;

    FOR r IN
        SELECT a.id AS assignment_id, a.org_id, a.course_id, a.prazo_dias, a.data_limite,
               COALESCE(a.version_id, v.id) AS version_id
          FROM public.academy_assignments a
          JOIN public.academy_course_versions v
            ON v.course_id = a.course_id AND v.status = 'PUBLICADA'
         WHERE a.status = 'ATIVA'
           AND (p_org_id IS NULL OR a.org_id = p_org_id)
    LOOP
        INSERT INTO public.academy_enrollments (
            org_id, course_id, version_id, employee_id, assignment_id,
            origem, status, data_limite)
        SELECT r.org_id, r.course_id, r.version_id, t.employee_id, r.assignment_id,
               'ATRIBUICAO', 'NAO_INICIADO',
               COALESCE(r.data_limite, CURRENT_DATE + COALESCE(r.prazo_dias, 30))
          FROM public.fn_academy_resolve_assignment_internal(r.assignment_id) t
         WHERE NOT EXISTS (
                SELECT 1 FROM public.academy_enrollments en
                 WHERE en.employee_id = t.employee_id
                   AND en.version_id  = r.version_id
                   AND en.status <> 'CANCELADO');

        GET DIAGNOSTICS v_lote = ROW_COUNT;
        v_novas := v_novas + v_lote;
    END LOOP;

    INSERT INTO public.academy_enrollments (
        org_id, course_id, version_id, employee_id, origem, status, data_limite)
    SELECT DISTINCT ON (et.employee_id, v.id)
           et.org_id, et.course_id, v.id, et.employee_id,
           'RECICLAGEM', 'NAO_INICIADO', et.data_validade
      FROM public.employee_trainings et
      JOIN public.employees emp ON emp.id = et.employee_id AND emp.status = 'ATIVO'
      JOIN public.academy_course_versions v
        ON v.course_id = et.course_id AND v.status = 'PUBLICADA'
     WHERE et.data_validade IS NOT NULL
       AND et.data_validade BETWEEN CURRENT_DATE AND CURRENT_DATE + 45
       AND (p_org_id IS NULL OR et.org_id = p_org_id)
       AND EXISTS (
            SELECT 1 FROM public.academy_assignments a
             WHERE a.course_id = et.course_id AND a.status = 'ATIVA'
               AND a.reciclagem_automatica)
       AND NOT EXISTS (
            SELECT 1 FROM public.academy_enrollments en
             WHERE en.employee_id = et.employee_id
               AND en.version_id  = v.id
               AND en.status <> 'CANCELADO');
    GET DIAGNOSTICS v_reciclagens = ROW_COUNT;

    FOR r IN
        SELECT en.id, en.employee_id, en.data_limite, c.nome AS curso, emp.email, en.org_id
          FROM public.academy_enrollments en
          JOIN public.training_courses c  ON c.id  = en.course_id
          JOIN public.employees        emp ON emp.id = en.employee_id
         WHERE en.status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_AVALIACAO','EXPIRADO')
           AND en.data_limite IS NOT NULL
           AND en.data_limite BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE + p_days_ahead
           AND emp.email IS NOT NULL
           AND emp.status = 'ATIVO'
           AND (p_org_id IS NULL OR en.org_id = p_org_id)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications n
             WHERE n.recipient_email = r.email
               AND n.link = '/portal?treinamento=' || r.id::text
               AND n.created_at > NOW() - INTERVAL '7 days'
        ) THEN
            INSERT INTO public.notifications (recipient_email, title, message, link, type, organization_id)
            VALUES (
                r.email,
                CASE WHEN r.data_limite < CURRENT_DATE
                     THEN 'Treinamento em atraso'
                     ELSE 'Treinamento pendente' END,
                format('%s — prazo %s.', r.curso, to_char(r.data_limite, 'DD/MM/YYYY')),
                '/portal?treinamento=' || r.id::text,
                CASE WHEN r.data_limite < CURRENT_DATE THEN 'error' ELSE 'warning' END, r.org_id);
            v_notificadas := v_notificadas + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'expiradas',   v_expiradas,
        'novas',       v_novas,
        'reciclagens', v_reciclagens,
        'notificadas', v_notificadas);
END;
$$;

-- REGRA OBRIGATÓRIA #7 — o PostgreSQL concede EXECUTE a PUBLIC por padrão, e o
-- Supabase mantém default privilege para `anon`. Mesma postura das outras 61
-- RPCs internas (aplicar_20270916000001): anon fora, authenticated dentro.
REVOKE EXECUTE ON FUNCTION public.fn_maintenance_due_alerts(INTEGER)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_opura_docs_vencimento_alerts()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_supplier_warranty_alerts(INTEGER)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_academy_alerts(INTEGER, UUID) FROM PUBLIC, anon;
