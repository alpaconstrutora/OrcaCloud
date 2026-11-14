-- Captura de boletos por e-mail — HORA da varredura diária, escolhida por caixa
--
-- Plano: docs/planos/2026-11-13-boletos-a-pagar-dez-pedidos.md (pedido de 14/11/2026,
-- "1. Não vi o campo para ajustar hora").
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Continua aplicar_20271113100000_email_capture_busca_diaria.sql (que fixava 03:00).
--
-- `busca_diaria_hora`: hora de Brasília (0–23) em que a varredura dos últimos 30 dias é
-- criada; NULL = varredura desligada nesta caixa. Padrão 3 (o horário de antes).
-- O agendador passa a rodar de hora em hora e só cria a busca nas caixas cuja hora é a atual.
-- Quem altera: o gestor da organização (policy email_capture_accounts_gestor_altera, como
-- modo/piloto) — GRANT por coluna, igual às outras colunas editáveis.

ALTER TABLE public.email_capture_accounts
    ADD COLUMN IF NOT EXISTS busca_diaria_hora smallint DEFAULT 3;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_accounts_busca_diaria_hora_ck') THEN
        ALTER TABLE public.email_capture_accounts
            ADD CONSTRAINT email_capture_accounts_busca_diaria_hora_ck
            CHECK (busca_diaria_hora IS NULL OR busca_diaria_hora BETWEEN 0 AND 23);
    END IF;
END $$;

GRANT UPDATE (busca_diaria_hora) ON public.email_capture_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_email_capture_busca_diaria()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
    v_hoje  date := v_agora::date;
    v_hora  integer := extract(hour FROM v_agora)::integer;
    v_criadas integer;
BEGIN
    -- Uma busca ativa por caixa (índice email_capture_buscas_uma_ativa_uq): quem já tem
    -- busca rodando (manual ou de remetente novo) fica de fora hoje.
    INSERT INTO public.email_capture_buscas
        (organization_id, account_id, data_de, data_ate, status, pedida_por, remetentes)
    SELECT a.organization_id, a.id, v_hoje - 30, v_hoje, 'pendente', 'Varredura diária (automática)', NULL
      FROM public.email_capture_accounts a
     WHERE a.status = 'ativa'
       AND a.busca_diaria_hora = v_hora
       AND NOT EXISTS (
           SELECT 1 FROM public.email_capture_buscas b
            WHERE b.account_id = a.id AND b.status IN ('pendente', 'em_andamento'))
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_criadas = ROW_COUNT;
    RETURN v_criadas;
END;
$$;

-- Só o agendador (postgres) chama. PostgreSQL concede EXECUTE a PUBLIC por padrão (REGRA #7).
REVOKE EXECUTE ON FUNCTION public.fn_email_capture_busca_diaria() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('email-capture-busca-diaria')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-capture-busca-diaria');

-- Minuto 0 de cada hora (Brasília está a horas inteiras do UTC): a função escolhe as caixas.
SELECT cron.schedule(
    'email-capture-busca-diaria',
    '0 * * * *',
    $cron$ SELECT public.fn_email_capture_busca_diaria(); $cron$
);
