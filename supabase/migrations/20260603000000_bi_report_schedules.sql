-- ============================================================
-- BI: Agendamento de relatórios executivos
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bi_report_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT 'Relatório Executivo',
    frequency       TEXT NOT NULL DEFAULT 'weekly'
                        CHECK (frequency IN ('daily','weekly','monthly')),
    -- Para weekly: 0=dom…6=sab. Para monthly: dia do mês (1–28).
    -- Para daily: ignorado.
    day_of_week     SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    day_of_month    SMALLINT CHECK (day_of_month BETWEEN 1 AND 28),
    hour_utc        SMALLINT NOT NULL DEFAULT 7 CHECK (hour_utc BETWEEN 0 AND 23),
    recipients      TEXT[]   NOT NULL DEFAULT '{}',   -- emails destinatários
    include_dre     BOOLEAN  NOT NULL DEFAULT true,
    include_trend   BOOLEAN  NOT NULL DEFAULT true,
    include_narrative BOOLEAN NOT NULL DEFAULT true,
    active          BOOLEAN  NOT NULL DEFAULT true,
    last_sent_at    TIMESTAMPTZ,
    next_send_at    TIMESTAMPTZ,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_report_schedules_org
    ON public.bi_report_schedules(org_id, active);

CREATE INDEX IF NOT EXISTS idx_bi_report_schedules_next
    ON public.bi_report_schedules(next_send_at)
    WHERE active = true;

ALTER TABLE public.bi_report_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bi_report_schedules_org ON public.bi_report_schedules;
CREATE POLICY bi_report_schedules_org ON public.bi_report_schedules
    FOR ALL USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

-- Trigger updated_at (reusa função existente do módulo labor)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_labor_updated_at') THEN
        DROP TRIGGER IF EXISTS trg_bi_schedules_updated_at ON public.bi_report_schedules;
        CREATE TRIGGER trg_bi_schedules_updated_at
            BEFORE UPDATE ON public.bi_report_schedules
            FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();
    END IF;
END $$;

-- ── Função de cálculo de next_send_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calc_next_send_at(
    p_frequency    TEXT,
    p_day_of_week  SMALLINT,
    p_day_of_month SMALLINT,
    p_hour_utc     SMALLINT,
    p_from         TIMESTAMPTZ DEFAULT NOW()
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_next TIMESTAMPTZ;
    v_day  DATE;
BEGIN
    CASE p_frequency
    WHEN 'daily' THEN
        v_next := date_trunc('hour', p_from) + make_interval(hours => p_hour_utc)
                  - make_interval(hours => extract(hour FROM p_from)::int);
        -- Se já passou hoje, avança 1 dia
        IF v_next <= p_from THEN
            v_next := v_next + INTERVAL '1 day';
        END IF;

    WHEN 'weekly' THEN
        v_day := DATE(p_from);
        -- Encontra o próximo dia da semana (0=dom…6=sab)
        FOR i IN 0..6 LOOP
            IF extract(dow FROM v_day + i) = p_day_of_week THEN
                v_next := (v_day + i)::TIMESTAMPTZ + make_interval(hours => p_hour_utc);
                EXIT;
            END IF;
        END LOOP;
        IF v_next <= p_from THEN v_next := v_next + INTERVAL '7 days'; END IF;

    WHEN 'monthly' THEN
        v_day := DATE(date_trunc('month', p_from)) + (p_day_of_month - 1);
        v_next := v_day::TIMESTAMPTZ + make_interval(hours => p_hour_utc);
        IF v_next <= p_from THEN
            v_next := v_next + INTERVAL '1 month';
        END IF;

    ELSE
        v_next := p_from + INTERVAL '1 day';
    END CASE;

    RETURN v_next;
END $$;

-- ── pg_cron: verifica schedules devidos a cada hora ──────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-bi-report-check') THEN
        PERFORM cron.unschedule('hourly-bi-report-check');
    END IF;
END $$;

-- O cron atualiza next_send_at e marca last_sent_at;
-- o envio real é feito pela Edge Function send-bi-report, chamada pelo client.
-- Aqui apenas marcamos os schedules "devidos" num campo needs_send (computed).
-- Abordagem: a checagem do next_send_at <= NOW() é feita pelo biReportService
-- no client ao carregar a tela (pull model simples, sem push server).
-- Para ambientes com volume, substituir por net.http_post à Edge Function.

-- Atualiza next_send_at de schedules que já foram enviados (last_sent_at recém atualizado)
SELECT cron.schedule(
    'hourly-bi-report-check',
    '0 * * * *',
    $$
    UPDATE public.bi_report_schedules
    SET next_send_at = public.calc_next_send_at(frequency, day_of_week, day_of_month, hour_utc)
    WHERE active = true
      AND (next_send_at IS NULL OR last_sent_at IS NOT NULL AND last_sent_at >= next_send_at - INTERVAL '5 minutes');
    $$
);
