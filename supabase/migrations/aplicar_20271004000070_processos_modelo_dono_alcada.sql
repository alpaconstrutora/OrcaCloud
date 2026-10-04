-- migration: aplicar_20271004000070_processos_modelo_dono_alcada.sql
-- Módulo ÒPURA Processos — editar modelo, dono obrigatório, alçada na aprovação.
-- Plano: docs/planos/2026-10-04-processos-modelo-dono-alcada.md
--
-- Três mudanças de banco, cada uma nascida de um achado medido em 04/10/2026:
--
--   1. `process_instance_steps.sla_hours` — o prazo da etapa vira cópia, como
--      já eram nome, tipo, condição, responsável e escalado. Antes,
--      `advanceToNextStep` lia o SLA do MODELO na hora de avançar: editar o
--      modelo mudaria o prazo de processo em curso. Agora o modelo pode ser
--      editado (antes não existia edição) sem tocar em processo nenhum.
--   2. FK `template_step_id` passa de RESTRICT para SET NULL — com a cópia
--      completa, a etapa da instância não depende mais do original, e remover
--      uma etapa do modelo não pode falhar por causa de processo antigo.
--   3. `fn_process_sla_sweep` ganha rede de segurança: ninguém avisado →
--      avisa donos/administradores da organização. Medido: 88 de 88 etapas
--      dos 24 modelos ativos sem responsável, escalado ou dono; o processo
--      2c8d805b venceu em 01/10 e o log registrou `notified = []`.
--
-- Idempotente. Aplicar com `npx supabase db query --linked -f <este arquivo>`.
-- NUNCA `supabase db push`.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Prazo da etapa copiado para a instância
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.process_instance_steps
    ADD COLUMN IF NOT EXISTS sla_hours NUMERIC;

COMMENT ON COLUMN public.process_instance_steps.sla_hours IS
    'Cópia do SLA (h) da etapa do modelo no início do processo. advanceToNextStep calcula due_at a partir DESTA coluna — editar o modelo não muda processo em curso.';

UPDATE public.process_instance_steps s
   SET sla_hours = ts.sla_hours
  FROM public.process_template_steps ts
 WHERE ts.id = s.template_step_id
   AND s.sla_hours IS NULL
   AND ts.sla_hours IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Etapa do modelo pode ser removida mesmo já usada por processo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.process_instance_steps
    ALTER COLUMN template_step_id DROP NOT NULL;
ALTER TABLE public.process_instance_steps
    DROP CONSTRAINT IF EXISTS process_instance_steps_template_step_id_fkey;
ALTER TABLE public.process_instance_steps
    ADD CONSTRAINT process_instance_steps_template_step_id_fkey
    FOREIGN KEY (template_step_id) REFERENCES public.process_template_steps(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Sweep de SLA — reescrito a partir do ARQUIVO aplicar_20270929000003 (não
--    do banco: a re-serialização no Windows corrompe acentos). Única mudança:
--    o bloco "Rede de segurança" depois da cadeia da F3.
-- ─────────────────────────────────────────────────────────────────────────────
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
                        'opura-processos', 'process_sla', false, r.organization_id);
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
                VALUES (v_email, v_titulo, v_msg, 'opura-processos', 'process_sla', false, r.organization_id);
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
                        'opura-processos', 'process_sla', false, r.organization_id);
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
                    'opura-processos', 'process_sla', false, r.organization_id);
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

-- CREATE OR REPLACE preserva a ACL, mas a REGRA #7 pede o REVOKE na mesma
-- migration de toda função SECURITY DEFINER — e ele é idempotente.
REVOKE ALL ON FUNCTION public.fn_process_sla_sweep() FROM PUBLIC, anon, authenticated;

-- Rearma o aviso das etapas que venceram sem ninguém avisado, para o próximo
-- ciclo do cron (de hora em hora) usar a rede de segurança.
UPDATE public.process_instance_steps s
   SET overdue_notified_at = NULL
 WHERE s.status = 'EM_ANDAMENTO'
   AND s.overdue_notified_at IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM public.process_audit_logs l
        WHERE l.action = 'STEP_OVERDUE'
          AND l.metadata->>'step_id' = s.id::text
          AND l.metadata->'notified' = '[]'::jsonb
   )
   AND NOT EXISTS (
       SELECT 1 FROM public.process_audit_logs l
        WHERE l.action = 'STEP_OVERDUE'
          AND l.metadata->>'step_id' = s.id::text
          AND l.metadata->'notified' <> '[]'::jsonb
   );

COMMIT;
