-- ==========================================================================
-- Eliminar a rotina de avisos de renovação de contratos
-- Date: 2026-11-16
-- Plano: docs/planos/2026-11-16-eliminar-rotina-renovacao-contratos.md
-- ==========================================================================
-- Pedido do usuário (16/11/2026): "que coisa sem sentido essa rotina! Elimine isso!"
--
-- O QUE ERA
-- O job `daily-rental-renewal-alerts` (04:30 BRT) chamava
-- `generate_rental_renewal_alerts(60)`. Para cada contrato Ativo/Assinado de
-- Locação, Serviços ou Suprimentos com fim entre hoje−30 e hoje+60, sem
-- contrato-filho, criava UMA tarefa "Renovar contrato/locação: N" para CADA
-- membro da organização (agenda pessoal, sem responsável) e um aviso no
-- sininho a cada 7 dias. A tarefa só não duplicava enquanto a cópia da pessoa
-- estava aberta: concluir ou excluir fazia ela voltar no dia seguinte.
--
-- O QUE ESTA MIGRATION FAZ
-- 1. Desagenda o job (idempotente: só se ele existir).
-- 2. Remove a função. Nada mais a chama: nenhuma tela, serviço, teste ou outra
--    função do banco (conferido em 16/11/2026 com `git grep` no main e
--    `pg_proc.prosrc` no remoto). A renovação de LOCAÇÃO pela tela
--    (Comercial › Locações › Renovações) não depende dela.
--
-- O que já existia (10 tarefas "Renovar contrato" e 53 avisos
-- `contrato_vencimento`) foi apagado à parte, com backup — ver o plano.
--
-- ROLLBACK
-- Recriar a função a partir de `20270919000002_notificacoes_avisos_financeiros.sql`
-- (+ o REVOKE de anon de `aplicar_20270916000001`) e reagendar:
--   SELECT cron.schedule('daily-rental-renewal-alerts', '30 7 * * *',
--                        'SELECT public.generate_rental_renewal_alerts(60);');
-- ==========================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-rental-renewal-alerts') THEN
        PERFORM cron.unschedule('daily-rental-renewal-alerts');
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.generate_rental_renewal_alerts(integer);
