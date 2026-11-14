-- Captura de boletos por e-mail — varredura diária automática (Buscas por período)
--
-- Plano: docs/planos/2026-11-13-boletos-a-pagar-dez-pedidos.md (item 1).
-- Pedido do usuário (13/11/2026): "Buscas por período: automático" → decisão: "Os dois"
-- (remetente novo dispara a busca dele + varredura diária agendada).
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
--
-- O usuário criava à mão, a cada uma ou duas semanas, uma busca "últimos 30 dias" (26/10,
-- 29/10, 12/11). Aqui o banco cria essa busca sozinho, todo dia às 03:00 (Brasília), em
-- cada caixa ATIVA que não tenha busca em andamento. Quem PROCESSA é o agendamento de
-- 15 em 15 minutos que já existe (`email-capture-sync`, modo 'agendado' → continuarBusca):
-- esta migration não chama Edge Function nem HTTP — só insere a linha `pendente`.
-- Duplicidade segue barrada como na busca manual: e-mail já lido é pulado, PDF/linha
-- digitável repetidos viram "Duplicado" no histórico, sem boleto novo.
--
-- Janela de 30 dias = `DIAS_BUSCA_AUTOMATICA` em services/emailCaptureService.ts.

CREATE OR REPLACE FUNCTION public.fn_email_capture_busca_diaria()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_criadas integer;
BEGIN
    -- Uma busca ativa por caixa (índice email_capture_buscas_uma_ativa_uq): quem já tem
    -- busca rodando (manual ou de remetente novo) fica de fora hoje.
    INSERT INTO public.email_capture_buscas
        (organization_id, account_id, data_de, data_ate, status, pedida_por, remetentes)
    SELECT a.organization_id, a.id, v_hoje - 30, v_hoje, 'pendente', 'Varredura diária (automática)', NULL
      FROM public.email_capture_accounts a
     WHERE a.status = 'ativa'
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

-- 06:00 UTC = 03:00 em Brasília: fora do horário de uso; o ciclo de 15 min termina a busca
-- antes de o expediente começar.
SELECT cron.schedule(
    'email-capture-busca-diaria',
    '0 6 * * *',
    $cron$ SELECT public.fn_email_capture_busca_diaria(); $cron$
);
