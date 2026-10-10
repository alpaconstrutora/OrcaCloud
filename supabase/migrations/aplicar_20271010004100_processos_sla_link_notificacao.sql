-- Processos · notificações de SLA (cron `process-sla-sweep`): o link era `opura-processos` — sem a barra
-- inicial, o app não navegava ao clicar ("Ver Detalhes" não fazia nada). Passa a ser
-- `/opura-processos?instance=<id>`, que o app abre com o processo em foco (utils/linkNotificacao.ts →
-- ProcessosModule abre o detalhe da instância). Mesmo formato das notificações do GED (/opura-docs?docId=).
--
-- Corpo copiado do arquivo vigente (aplicar_20271004000070, igual ao banco em 10/10/2026); só mudam os 4 links.

CREATE OR REPLACE FUNCTION public.fn_process_sla_sweep()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_atrasadas INT := 0;
    v_escaladas INT := 0;
    r RECORD;
    g RECORD;
    v_destino UUID;
    v_email TEXT;
    v_avisados TEXT[];
    v_titulo TEXT;
    v_msg TEXT;
BEGIN
    -- ── 2a. Atraso ─────────────────────────────────────────────────────────
    FOR r IN
        SELECT s.id AS step_id, s.name AS step_name, s.due_at, s.responsible_user_id,
               s.responsible_type, s.responsible_ref_id,
               s.escalation_user_id, i.id AS instance_id, i.title, i.organization_id,
               i.status AS instance_status, t.owner_user_id
          FROM public.process_instance_steps s
          JOIN public.process_instances i ON i.id = s.process_instance_id
          JOIN public.process_templates t ON t.id = i.process_template_id
         WHERE s.status = 'EM_ANDAMENTO'
           AND s.due_at IS NOT NULL
           AND s.due_at < now()
           AND s.overdue_notified_at IS NULL
           AND i.status NOT IN ('CONCLUIDO', 'CANCELADO', 'BLOQUEADO')
    LOOP
        UPDATE public.process_instance_steps SET overdue_notified_at = now() WHERE id = r.step_id;
        UPDATE public.process_instances SET status = 'ATRASADO', updated_at = now()
         WHERE id = r.instance_id AND status NOT IN ('CONCLUIDO', 'CANCELADO', 'BLOQUEADO');

        v_titulo := format('Etapa atrasada: %s', r.step_name);
        v_msg := format('%s — venceu em %s.', r.title, to_char(r.due_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'));
        v_avisados := ARRAY[]::TEXT[];

        -- Etapa de grupo que ninguém assumiu: avisa cada membro do grupo que
        -- ainda é membro da org.
        IF r.responsible_user_id IS NULL AND r.responsible_type IN ('DEPARTMENT', 'ROLE') THEN
            FOR g IN
                SELECT DISTINCT m.email
                  FROM public.process_group_members gm
                  JOIN public.organization_members m
                    ON m.user_id = gm.user_id AND m.organization_id = gm.organization_id
                 WHERE gm.organization_id = r.organization_id
                   AND gm.group_type = r.responsible_type
                   AND gm.group_id = r.responsible_ref_id
                   AND m.email IS NOT NULL
            LOOP
                INSERT INTO public.notifications (recipient_email, title, message, link, type, is_read, organization_id)
                VALUES (g.email, v_titulo, v_msg || ' Etapa do seu grupo, ainda sem ninguém assumido.',
                        '/opura-processos?instance=' || r.instance_id, 'process_sla', false, r.organization_id);
                v_avisados := v_avisados || g.email;
            END LOOP;
        END IF;

        -- Pessoa (ou grupo vazio): a cadeia da F3.
        IF cardinality(v_avisados) = 0 THEN
            v_destino := COALESCE(r.responsible_user_id, r.escalation_user_id, r.owner_user_id);
            v_email := CASE WHEN v_destino IS NULL THEN NULL
                            ELSE public.fn_process_email_do_usuario(v_destino, r.organization_id) END;
            IF v_email IS NOT NULL THEN
                INSERT INTO public.notifications (recipient_email, title, message, link, type, is_read, organization_id)
                VALUES (v_email, v_titulo, v_msg, '/opura-processos?instance=' || r.instance_id, 'process_sla', false, r.organization_id);
                v_avisados := ARRAY[v_email];
            END IF;
        END IF;

        -- Rede de segurança (04/10/2026): ninguém avisado — etapa sem
        -- responsável, sem escalado e modelo sem dono — avisa os donos e
        -- administradores da organização. Antes, a etapa ficava ATRASADO em
        -- silêncio (medido: processo 2c8d805b, vencido em 01/10, 0 avisos).
        IF cardinality(v_avisados) = 0 THEN
            FOR g IN
                SELECT DISTINCT m.email
                  FROM public.organization_members m
                 WHERE m.organization_id = r.organization_id
                   AND m.role IN ('owner', 'admin')
                   AND m.email IS NOT NULL
            LOOP
                INSERT INTO public.notifications (recipient_email, title, message, link, type, is_read, organization_id)
                VALUES (g.email, v_titulo,
                        v_msg || ' A etapa não tem responsável nem escalado, e o modelo não tem dono: você recebe por administrar a organização. Defina um dono em Processos › Templates.',
                        '/opura-processos?instance=' || r.instance_id, 'process_sla', false, r.organization_id);
                v_avisados := v_avisados || g.email;
            END LOOP;
        END IF;

        INSERT INTO public.process_audit_logs (process_instance_id, user_id, action, old_value, new_value, metadata)
        VALUES (r.instance_id, NULL, 'STEP_OVERDUE', to_jsonb(r.instance_status), to_jsonb('ATRASADO'::text),
                jsonb_build_object('step_id', r.step_id, 'due_at', r.due_at, 'notified', to_jsonb(v_avisados),
                                   'responsible_type', r.responsible_type, 'detectadoPor', 'fn_process_sla_sweep'));

        v_atrasadas := v_atrasadas + 1;
    END LOOP;

    -- ── 2b. Escalonamento (inalterado desde a F3) ──────────────────────────
    FOR r IN
        SELECT s.id AS step_id, s.name AS step_name, s.due_at, s.escalation_user_id, s.escalation_after_hours,
               i.id AS instance_id, i.title, i.organization_id
          FROM public.process_instance_steps s
          JOIN public.process_instances i ON i.id = s.process_instance_id
         WHERE s.status = 'EM_ANDAMENTO'
           AND s.due_at IS NOT NULL
           AND s.escalation_user_id IS NOT NULL
           AND s.escalated_at IS NULL
           AND s.due_at + (COALESCE(s.escalation_after_hours, 0) * interval '1 hour') < now()
           AND i.status NOT IN ('CONCLUIDO', 'CANCELADO', 'BLOQUEADO')
    LOOP
        UPDATE public.process_instance_steps SET escalated_at = now() WHERE id = r.step_id;

        v_email := public.fn_process_email_do_usuario(r.escalation_user_id, r.organization_id);
        IF v_email IS NOT NULL THEN
            INSERT INTO public.notifications (recipient_email, title, message, link, type, is_read, organization_id)
            VALUES (v_email, format('Escalonado para você: %s', r.step_name),
                    format('%s — etapa vencida em %s sem conclusão. Abra Processos para assumir.', r.title,
                           to_char(r.due_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
                    '/opura-processos?instance=' || r.instance_id, 'process_sla', false, r.organization_id);
        END IF;

        INSERT INTO public.process_audit_logs (process_instance_id, user_id, action, metadata)
        VALUES (r.instance_id, NULL, 'STEP_ESCALATED',
                jsonb_build_object('step_id', r.step_id, 'escalation_user_id', r.escalation_user_id,
                                   'after_hours', r.escalation_after_hours, 'notified', v_email, 'detectadoPor', 'fn_process_sla_sweep'));

        v_escaladas := v_escaladas + 1;
    END LOOP;

    RETURN jsonb_build_object('atrasadas', v_atrasadas, 'escaladas', v_escaladas, 'executadoEm', now());
END;
$$;

REVOKE ALL ON FUNCTION public.fn_process_sla_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_process_sla_sweep() TO service_role;

-- Notificações já gravadas com o link sem barra (4 em 10/10/2026): não guardam qual processo era, então
-- passam a abrir a tela de Processos. O app também aceita o formato antigo, por garantia.
UPDATE public.notifications SET link = '/opura-processos' WHERE link = 'opura-processos';
