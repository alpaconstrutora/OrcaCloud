-- ============================================================
-- Migration: aplicar_20270918000021_bi_report_schedules_criar_de_fato.sql
-- CORREÇÃO DE DRIFT — a tabela do agendador de BI nunca existiu
--
-- O CASO
-- `services/biReportService.ts` consulta `bi_report_schedules` em 5 lugares, e
-- `components/BIReportScheduler.tsx:59` chama `listSchedules` — a tela é
-- alcançável por `BIDashboard.tsx:479`. Só que a tabela NÃO EXISTE: a tela
-- estoura `42P01` em produção.
--
-- O que torna o caso interessante: a migration `20260603000000_bi_report_schedules.sql`
-- ESTÁ REGISTRADA em `supabase_migrations.schema_migrations` como aplicada. O
-- registro diz que rodou; o banco diz que não. É o drift que o CLAUDE.md
-- documenta, agora com um caso concreto — e a razão de a auditoria de 2026-09-01
-- ter lido a postura do banco remoto em vez das migrations.
--
-- NÃO CONFUNDIR COM `report_schedules`
-- São duas funcionalidades diferentes, não dois schemas da mesma:
--
--   BI Executivo | BIReportScheduler | biReportService     | bi_report_schedules | send-bi-report
--   Financeiro   | FinancialIntelligence | reportScheduleService | report_schedules | financial-report-notifier
--
-- O Financeiro está íntegro. Ao corrigir o `send-bi-report` na Fase 2 eu supus
-- que `bi_report_schedules` fosse nome errado e apontei a function para
-- `report_schedules` — errado: apontei a função do BI para a tabela do
-- Financeiro. Sem efeito prático (a outra tem 0 linhas e a validação também
-- aceita membros da organização), mas a referência volta ao certo junto com
-- esta migration.
--
-- POR QUE UMA MIGRATION NOVA, E NÃO REAPLICAR A DE JUNHO
-- Migration já registrada não se reexecuta nem se reescreve — mudar o texto de
-- algo marcado como aplicado só cria dúvida sobre o que o banco tem. Esta aqui
-- cria o objeto que falta e passa o conteúdo pelo crivo da REGRA OBRIGATÓRIA #7,
-- com duas diferenças em relação ao original de 2026-06-03:
--
--   1. a policy ganha `TO authenticated` (o original omitia, caindo em PUBLIC —
--      inofensivo aqui, porque a expressão é `is_org_member`, mas fora do padrão);
--   2. `calc_next_send_at` ganha o `REVOKE ... FROM PUBLIC, anon` que a Regra #7
--      exige de toda função nova.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bi_report_schedules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name              TEXT NOT NULL DEFAULT 'Relatório Executivo',
    frequency         TEXT NOT NULL DEFAULT 'weekly'
                          CHECK (frequency IN ('daily','weekly','monthly')),
    -- weekly: 0=dom…6=sab · monthly: dia do mês (1–28) · daily: ignorado
    day_of_week       SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    day_of_month      SMALLINT CHECK (day_of_month BETWEEN 1 AND 28),
    hour_utc          SMALLINT NOT NULL DEFAULT 7 CHECK (hour_utc BETWEEN 0 AND 23),
    recipients        TEXT[]  NOT NULL DEFAULT '{}',
    include_dre       BOOLEAN NOT NULL DEFAULT true,
    include_trend     BOOLEAN NOT NULL DEFAULT true,
    include_narrative BOOLEAN NOT NULL DEFAULT true,
    active            BOOLEAN NOT NULL DEFAULT true,
    last_sent_at      TIMESTAMPTZ,
    next_send_at      TIMESTAMPTZ,
    created_by        UUID REFERENCES auth.users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_report_schedules_org
    ON public.bi_report_schedules (org_id, active);

CREATE INDEX IF NOT EXISTS idx_bi_report_schedules_next
    ON public.bi_report_schedules (next_send_at) WHERE active = true;

ALTER TABLE public.bi_report_schedules ENABLE ROW LEVEL SECURITY;

-- `TO authenticated` explícito (o original omitia). A expressão já era correta:
-- recorte por organização, sem perna solta de OR.
DROP POLICY IF EXISTS bi_report_schedules_org ON public.bi_report_schedules;
CREATE POLICY bi_report_schedules_org ON public.bi_report_schedules
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_labor_updated_at') THEN
        DROP TRIGGER IF EXISTS trg_bi_schedules_updated_at ON public.bi_report_schedules;
        CREATE TRIGGER trg_bi_schedules_updated_at
            BEFORE UPDATE ON public.bi_report_schedules
            FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();
    END IF;
END $$;

-- ── Cálculo do próximo envio ────────────────────────────────────────────────
-- STABLE, não IMMUTABLE: o original declarava IMMUTABLE tendo `NOW()` como
-- default de parâmetro. Não quebra no uso atual (o cron passa os argumentos
-- explicitamente), mas IMMUTABLE autoriza o planejador a cachear resultado de
-- algo que depende do relógio. STABLE descreve a verdade.
CREATE OR REPLACE FUNCTION public.calc_next_send_at(
    p_frequency    TEXT,
    p_day_of_week  SMALLINT,
    p_day_of_month SMALLINT,
    p_hour_utc     SMALLINT,
    p_from         TIMESTAMPTZ DEFAULT NOW()
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_next TIMESTAMPTZ;
    v_day  DATE;
BEGIN
    CASE p_frequency
    WHEN 'daily' THEN
        v_next := date_trunc('hour', p_from) + make_interval(hours => p_hour_utc)
                  - make_interval(hours => extract(hour FROM p_from)::int);
        IF v_next <= p_from THEN v_next := v_next + INTERVAL '1 day'; END IF;

    WHEN 'weekly' THEN
        v_day := DATE(p_from);
        FOR i IN 0..6 LOOP
            IF extract(dow FROM v_day + i) = p_day_of_week THEN
                v_next := (v_day + i)::TIMESTAMPTZ + make_interval(hours => p_hour_utc);
                EXIT;
            END IF;
        END LOOP;
        IF v_next <= p_from THEN v_next := v_next + INTERVAL '7 days'; END IF;

    WHEN 'monthly' THEN
        v_day  := DATE(date_trunc('month', p_from)) + (p_day_of_month - 1);
        v_next := v_day::TIMESTAMPTZ + make_interval(hours => p_hour_utc);
        IF v_next <= p_from THEN v_next := v_next + INTERVAL '1 month'; END IF;

    ELSE
        v_next := p_from + INTERVAL '1 day';
    END CASE;

    RETURN v_next;
END $$;

-- REGRA OBRIGATÓRIA #7 — toda função nova leva o REVOKE junto, literal.
-- Esta é SECURITY INVOKER e só faz aritmética de data (não toca em tabela),
-- então a exposição seria inofensiva. O REVOKE vai assim mesmo: a regra não
-- admite exceção "porque essa aqui é inocente" — é justamente a exceção que
-- deixa a próxima passar.
REVOKE EXECUTE ON FUNCTION public.calc_next_send_at(TEXT, SMALLINT, SMALLINT, SMALLINT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.calc_next_send_at(TEXT, SMALLINT, SMALLINT, SMALLINT, TIMESTAMPTZ) TO authenticated;

-- ── Cron horário que recalcula o próximo envio ──────────────────────────────
-- UPDATE puro, sem net.http_post: não depende de segredo e não tem como cair no
-- 401 silencioso do C4-02. O envio em si é disparado pelo client.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-bi-report-check') THEN
        PERFORM cron.unschedule('hourly-bi-report-check');
    END IF;
END $$;

SELECT cron.schedule(
    'hourly-bi-report-check',
    '0 * * * *',
    $$
    UPDATE public.bi_report_schedules
       SET next_send_at = public.calc_next_send_at(frequency, day_of_week, day_of_month, hour_utc)
     WHERE active = true
       AND (next_send_at IS NULL
            OR (last_sent_at IS NOT NULL AND last_sent_at >= next_send_at - INTERVAL '5 minutes'));
    $$
);

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_existe boolean;
    v_frouxa int;
    v_anon boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = 'bi_report_schedules')
      INTO v_existe;
    IF NOT v_existe THEN
        RAISE EXCEPTION 'bi_report_schedules continua sem existir';
    END IF;

    SELECT count(*) INTO v_frouxa
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'bi_report_schedules'
       AND (qual = 'true' OR with_check = 'true');
    IF v_frouxa > 0 THEN
        RAISE EXCEPTION 'bi_report_schedules com % policy(ies) sem condicao', v_frouxa;
    END IF;

    SELECT has_function_privilege('anon', 'public.calc_next_send_at(text,smallint,smallint,smallint,timestamptz)', 'EXECUTE')
      INTO v_anon;
    IF v_anon THEN
        RAISE EXCEPTION 'calc_next_send_at continua executavel por anon';
    END IF;

    RAISE NOTICE 'OK: bi_report_schedules criada, recortada por organizacao, funcao fora do alcance de anon.';
END $$;
