-- ============================================================
-- Cron: alerta diário de contratos de LOCAÇÃO chegando ao fim da vigência.
--
-- Locação nunca avisava que estava acabando: os alertas de vencimento do
-- ContractsDashboard excluíam `is_recurring`, e não havia job nenhum. Aqui a
-- antecedência é por contrato (`contracts.renewal_notice_days`), com fallback
-- no parâmetro da função (60 dias).
--
-- Cria uma TAREFA por membro da org (idempotente por uq_tasks_source_open) e
-- uma NOTIFICAÇÃO por e-mail de membro (dedup manual: `notifications` não tem
-- chave única). Contrato já renovado (com contrato-filho) não alerta.
--
-- Modelo: 20260602000001_tasks_payment_cron.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_rental_renewal_alerts(p_days_ahead INTEGER DEFAULT 60)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today   DATE    := CURRENT_DATE;
    v_c       RECORD;
    v_member  RECORD;
    v_created INTEGER := 0;
    v_days    INTEGER;
    v_label   TEXT;
    v_link    TEXT;
BEGIN
    FOR v_c IN
        SELECT c.id, c.number, c.title, c.end_date, c.organization_id
        FROM public.contracts c
        WHERE c.domain       = 'LOCACAO'
          AND c.is_recurring IS TRUE
          AND c.status       IN ('Ativo', 'Assinado')
          AND c.end_date     IS NOT NULL
          -- Inclui os vencidos há pouco: contrato que passou do fim sem renovar
          -- é o caso MAIS urgente, não pode sumir do alerta.
          AND c.end_date    >= v_today - 30
          AND c.end_date    <= v_today + COALESCE(c.renewal_notice_days, p_days_ahead)
          AND NOT EXISTS (
              SELECT 1 FROM public.contracts f WHERE f.parent_contract_id = c.id
          )
    LOOP
        v_days  := v_c.end_date - v_today;
        v_label := CASE WHEN v_days < 0
                        THEN 'venceu há ' || abs(v_days) || ' dia(s)'
                        ELSE 'vence em ' || v_days || ' dia(s)' END;
        v_link  := '/rentals?tab=renewals&contract=' || v_c.id;

        FOR v_member IN
            SELECT om.user_id, om.email
            FROM public.organization_members om
            WHERE om.organization_id = v_c.organization_id
        LOOP
            IF v_member.user_id IS NOT NULL THEN
                PERFORM public.create_task(
                    p_user_id       := v_member.user_id,
                    p_org_id        := v_c.organization_id,
                    p_title         := 'Renovar locação: ' || v_c.number,
                    p_due           := (v_c.end_date::TEXT || 'T12:00:00Z')::TIMESTAMPTZ,
                    p_source_module := 'comercial',
                    p_source_ref    := jsonb_build_object(
                                           'type',  'contract_renewal',
                                           'id',    v_c.id,
                                           'route', 'rentals'
                                       ),
                    p_priority      := CASE WHEN v_days <= 30 THEN 1 ELSE 2 END,
                    p_description   := COALESCE(v_c.title, 'Contrato de locação')
                                       || ' — ' || v_label
                                       || ' (fim da vigência em ' || v_c.end_date::TEXT || ')'
                );
                v_created := v_created + 1;
            END IF;

            IF v_member.email IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.notifications n
                WHERE n.recipient_email = v_member.email
                  AND n.link            = v_link
                  AND n.created_at      > now() - INTERVAL '7 days'
            ) THEN
                INSERT INTO public.notifications (recipient_email, title, message, link, type)
                VALUES (
                    v_member.email,
                    'Contrato de locação ' || v_c.number || ' ' || v_label,
                    COALESCE(v_c.title, 'Locação') || ' — término em '
                        || to_char(v_c.end_date, 'DD/MM/YYYY')
                        || '. Abra Locações > Renovações para renovar com reajuste.',
                    v_link,
                    'rental_renewal'
                );
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $$;

COMMENT ON FUNCTION public.generate_rental_renewal_alerts IS
    'Alerta diário de locações chegando ao fim da vigência (respeita contracts.renewal_notice_days). '
    'Idempotente: tarefas por uq_tasks_source_open, notificações por NOT EXISTS de 7 dias. '
    'Contrato já renovado (com filho em parent_contract_id) não alerta.';

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-rental-renewal-alerts') THEN
        PERFORM cron.unschedule('daily-rental-renewal-alerts');
    END IF;
END $$;

SELECT cron.schedule(
    'daily-rental-renewal-alerts',
    '30 7 * * *',   -- 30 min depois do cron de contas a pagar, para não competir
    $$ SELECT public.generate_rental_renewal_alerts(60); $$
);
