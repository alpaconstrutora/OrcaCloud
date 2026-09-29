-- migration: aplicar_20270929000003_processos_f32_responsavel_grupo.sql
-- Módulo ÒPURA Processos — F3.2: responsável por Departamento ou Cargo.
-- Plano: docs/planos/2026-09-29-processos-f32-responsavel-por-grupo.md
--
-- Decisão do usuário (2026-09-29): quem pertence a cada departamento/cargo é
-- marcado EM PROCESSOS, sobre os membros com login — as fichas de RH
-- (`employees`) não servem hoje: 0 de 8 ligadas a login, 0 com departamento.
-- Os grupos são o catálogo que JÁ existe: `company_departments` e `org_roles`
-- (via `companies.org_id`). Nada de catálogo paralelo.
--
-- Idempotente. Aplicar com `npx supabase db query --linked -f <este arquivo>`.
-- NUNCA `supabase db push`.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Quem pertence a cada grupo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.process_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    group_type TEXT NOT NULL CHECK (group_type IN ('DEPARTMENT', 'ROLE')),
    -- company_departments.id ou org_roles.id — duas tabelas, então sem FK; o
    -- sweep e a tela só usam o vínculo junto com a org, e membro que sai da
    -- org deixa de receber (o sweep cruza com organization_members).
    group_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, group_type, group_id, user_id)
);

CREATE INDEX IF NOT EXISTS process_group_members_user_idx
    ON public.process_group_members (user_id);
CREATE INDEX IF NOT EXISTS process_group_members_group_idx
    ON public.process_group_members (group_type, group_id);

COMMENT ON TABLE public.process_group_members IS
    'Membros com login de cada departamento (company_departments) ou cargo (org_roles), para etapas de Processos atribuídas a grupo. Editado em Processos › Equipes.';

ALTER TABLE public.process_group_members ENABLE ROW LEVEL SECURITY;

-- Mesma policy das demais tabelas de Processos (F0). Uma perna só: não há
-- "OR alguma_coisa" que libere a linha sozinho (REGRA #7, pergunta 1).
DROP POLICY IF EXISTS "org_access_process_group_members" ON public.process_group_members;
CREATE POLICY "org_access_process_group_members" ON public.process_group_members
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.proc_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.proc_user_org_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Snapshot do responsável na etapa da instância
--    (como `condition` e `escalation_*`: mudar o template depois não muda a
--    instância em curso)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.process_instance_steps
    ADD COLUMN IF NOT EXISTS responsible_type TEXT,
    ADD COLUMN IF NOT EXISTS responsible_ref_id UUID;

ALTER TABLE public.process_instance_steps
    DROP CONSTRAINT IF EXISTS process_instance_steps_responsible_type_check;
ALTER TABLE public.process_instance_steps
    ADD CONSTRAINT process_instance_steps_responsible_type_check
    CHECK (responsible_type IN ('USER', 'DEPARTMENT', 'ROLE') OR responsible_type IS NULL);

CREATE INDEX IF NOT EXISTS process_instance_steps_group_idx
    ON public.process_instance_steps (responsible_ref_id)
    WHERE responsible_user_id IS NULL AND responsible_type IN ('DEPARTMENT', 'ROLE');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Sweep de SLA — reescrito a partir do ARQUIVO aplicar_20270929000002 (não
--    do banco). Única mudança: etapa de grupo sem ninguém assumido avisa CADA
--    membro do grupo que ainda é membro da organização. Sem membro no grupo,
--    cai na cadeia antiga (escalado → dono do template).
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

COMMIT;
