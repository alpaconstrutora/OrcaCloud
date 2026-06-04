-- Fase 4.1 do Investor OS: geração automática de relatório mensal
-- Função SQL pura — sem Edge Function — que gera registros em investor_reports
-- e dispara um investor_announcements por organização.
-- Cron: todo dia 1º do mês às 06:00 UTC.
-- Date: 2026-06-04

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Função principal ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_monthly_investor_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org RECORD;
    v_month_label text;
    v_report_id uuid;
    v_report_name text;
BEGIN
    v_month_label := to_char(now() - interval '1 month', 'MM/YYYY');
    v_report_name := 'Relatório Mensal — ' || v_month_label;

    -- Para cada organização que possui ao menos 1 projeto vinculado a um investidor
    FOR v_org IN
        SELECT DISTINCT p.settings->>'organizationId' AS org_id
        FROM projects p
        WHERE p.investor_id IS NOT NULL
          AND (p.settings->>'organizationId') IS NOT NULL
          AND (p.settings->>'organizationId') ~ '^[0-9a-f-]{36}$'
          AND (p.settings->>'organizationId')::uuid IN (SELECT id FROM organizations)
    LOOP
        -- Criar o registro do relatório
        INSERT INTO investor_reports (
            organization_id,
            name,
            type,
            category,
            report_date,
            created_at
        ) VALUES (
            v_org.org_id::uuid,
            v_report_name,
            'PDF',
            'relatorio',
            to_char(now() - interval '1 month', 'DD/MM/YYYY'),
            now()
        )
        RETURNING id INTO v_report_id;

        -- Criar o comunicado automático
        INSERT INTO investor_announcements (
            organization_id,
            title,
            body,
            type,
            published_at,
            requires_acknowledgment,
            created_at
        ) VALUES (
            v_org.org_id::uuid,
            v_report_name || ' disponível',
            'O relatório de evolução física, financeira e comparativo previsto × realizado referente a ' ||
            v_month_label || ' está disponível na seção Documentos do seu portal.',
            'comunicado',
            now(),
            false,
            now()
        );
    END LOOP;
END;
$$;

-- ─── Cron: 1º de cada mês às 06:00 UTC ───────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-investor-report') THEN
        PERFORM cron.unschedule('monthly-investor-report');
    END IF;
END $$;

SELECT cron.schedule(
    'monthly-investor-report',
    '0 6 1 * *',
    $$ SELECT public.generate_monthly_investor_reports(); $$
);

-- ─── RPC para trigger manual (admin) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_monthly_investor_report()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.generate_monthly_investor_reports();
    RETURN json_build_object('success', true, 'generated_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_monthly_investor_report() TO authenticated;
