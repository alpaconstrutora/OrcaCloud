-- migration: aplicar_20270929000002_processos_f3_sla_escalonamento.sql (nasceu como 20270929000001; renomeada ANTES de aplicar por colisão de prefixo com outra frente)
-- Módulo ÒPURA Processos — F3 restante: escalonamento por SLA vencido e
-- bloqueio. Plano: docs/planos/2026-09-29-processos-f3-escalonamento-sla.md
--
-- Molde: fn_warranty_sla_sweep (aplicar_20270914000010) — sweep SQL puro em
-- pg_cron, SECURITY DEFINER, idempotente por marca no próprio registro. Sem
-- Edge Function, sem HTTP, sem segredo: tudo que o sweep precisa mora no banco.
--
-- Idempotente. Aplicar com `npx supabase db query --linked -f <este arquivo>`.
-- NUNCA `supabase db push`.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colunas
-- ─────────────────────────────────────────────────────────────────────────────

-- Configuração de escalonamento vive na etapa do TEMPLATE…
ALTER TABLE public.process_template_steps
    ADD COLUMN IF NOT EXISTS escalation_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS escalation_after_hours NUMERIC;

COMMENT ON COLUMN public.process_template_steps.escalation_user_id IS
    'Quem é avisado quando a etapa passa do prazo + escalation_after_hours. NULL = sem escalonamento. Copiado para a etapa da instância ao iniciar.';
COMMENT ON COLUMN public.process_template_steps.escalation_after_hours IS
    'Horas DEPOIS do vencimento (due_at) para escalar. 0 = escala no primeiro sweep após vencer.';

-- …e é COPIADA para a etapa da instância (snapshot, como `condition`), que
-- ainda guarda as duas marcas de idempotência do sweep.
ALTER TABLE public.process_instance_steps
    ADD COLUMN IF NOT EXISTS escalation_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS escalation_after_hours NUMERIC,
    ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.process_instance_steps.overdue_notified_at IS
    'Marca do sweep: aviso de atraso já emitido para esta etapa (idempotência).';
COMMENT ON COLUMN public.process_instance_steps.escalated_at IS
    'Marca do sweep: escalonamento já emitido para esta etapa (idempotência).';

-- Bloqueio manual com motivo; o status anterior volta ao desbloquear.
ALTER TABLE public.process_instances
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
    ADD COLUMN IF NOT EXISTS status_before_block TEXT;

-- Índice para o sweep: só etapas em andamento com prazo.
CREATE INDEX IF NOT EXISTS process_instance_steps_sla_idx
    ON public.process_instance_steps (due_at)
    WHERE status = 'EM_ANDAMENTO' AND due_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A varredura
--
--    SECURITY DEFINER porque o cron roda sem JWT (mesma razão da Garantia).
--    E-mail do destinatário: organization_members.user_id → email; se o
--    membro não tem user_id preenchido (convite por e-mail — ver memória
--    "RLS user_id × e-mail"), cai em auth.users.email.
--
--    Destinatário do AVISO DE ATRASO, nesta ordem: responsável da etapa →
--    escalado da etapa → owner_user_id do template. Sem nenhum dos três, marca
--    a etapa mesmo assim (a instância vira ATRASADO, que a Torre e o Kanban
--    mostram) e não emite notificação.
--
--    Instância BLOQUEADO fica de fora: parada declarada não conta SLA.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_process_email_do_usuario(p_user_id UUID, p_organization_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT m.email FROM public.organization_members m
          WHERE m.user_id = p_user_id AND m.organization_id = p_organization_id LIMIT 1),
        (SELECT u.email::text FROM auth.users u WHERE u.id = p_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.fn_process_email_do_usuario(UUID, UUID) FROM PUBLIC, anon, authenticated;

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
    v_destino UUID;
    v_email TEXT;
    v_titulo TEXT;
BEGIN
    -- ── 2a. Atraso ─────────────────────────────────────────────────────────
    FOR r IN
        SELECT s.id AS step_id, s.name AS step_name, s.due_at, s.responsible_user_id,
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

        v_destino := COALESCE(r.responsible_user_id, r.escalation_user_id, r.owner_user_id);
        v_email := CASE WHEN v_destino IS NULL THEN NULL
                        ELSE public.fn_process_email_do_usuario(v_destino, r.organization_id) END;
        v_titulo := format('Etapa atrasada: %s', r.step_name);

        IF v_email IS NOT NULL THEN
            INSERT INTO public.notifications (recipient_email, title, message, link, type, is_read, organization_id)
            VALUES (v_email, v_titulo,
                    format('%s — venceu em %s.', r.title, to_char(r.due_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
                    'opura-processos', 'process_sla', false, r.organization_id);
        END IF;

        INSERT INTO public.process_audit_logs (process_instance_id, user_id, action, old_value, new_value, metadata)
        VALUES (r.instance_id, NULL, 'STEP_OVERDUE', to_jsonb(r.instance_status), to_jsonb('ATRASADO'::text),
                jsonb_build_object('step_id', r.step_id, 'due_at', r.due_at, 'notified', v_email, 'detectadoPor', 'fn_process_sla_sweep'));

        v_atrasadas := v_atrasadas + 1;
    END LOOP;

    -- ── 2b. Escalonamento ──────────────────────────────────────────────────
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

-- Ninguém chama isto pelo app; quem chama é o cron (dono do objeto). REGRA #7.
REVOKE ALL ON FUNCTION public.fn_process_sla_sweep() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_process_sla_sweep() IS
    'Marca etapas vencidas (instância ATRASADO, aviso ao responsável) e escala as que passaram de due_at + escalation_after_hours. Idempotente por overdue_notified_at/escalated_at. Cron process-sla-sweep, de hora em hora.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Agendamento — de hora em hora (SLA é em horas; diário atrasaria o aviso
--    em até 23 h; por minuto não muda nada, o sweep só avisa).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('process-sla-sweep')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-sla-sweep');

SELECT cron.schedule(
    'process-sla-sweep',
    '5 * * * *',
    $$ SELECT public.fn_process_sla_sweep(); $$
);

COMMIT;
