-- ============================================================================
-- Pós-Obra & Garantia: varredura de SLA + aposentadoria do cron de Qualidade
-- OrçaCloud SaaS · aplicar_20270914000010
-- Plano: docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md
--
-- O QUE FALTAVA
--   `warranty_claims.sla_deadline` existe desde 2026-07-08 e o KPI "SLA
--   Vencidos" já conta os estourados — mas nada NUNCA disparou por causa deles.
--   O único cron de SLA do sistema era o de Qualidade, que roda sobre
--   `construction_conditions` — tabela que virou legado na consolidação de
--   2026-08-26. Ou seja: sobrou um cron trabalhando à toa a cada 6 minutos, e
--   o módulo vivo ficou sem nenhum.
--
-- POR QUE SQL PURO, E NÃO EDGE FUNCTION
--   O cron de Qualidade chama uma edge function por `net.http_post`, o que
--   exige a função publicada e dois segredos no vault. Neste repo já houve
--   edge function que nunca chegou a ser publicada e cujo cron ficou batendo
--   no vazio. Aqui não há nada para publicar: a varredura é uma função no
--   próprio banco, e o pg_cron a chama direto.
--
-- NÃO MUDA ESTADO DE CHAMADO. Só registra `SlaBreached` no log — a decisão
-- sobre o chamado estourado continua humana, como já era em Qualidade para
-- planos de ação.
--
-- APLICAÇÃO: SQL direto no editor. NUNCA `supabase db push`.
--   ⚠️ Não deixe trecho selecionado no editor — ele roda só a seleção.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. A varredura
--
--    SECURITY DEFINER porque o cron roda sem JWT: sem isso, `auth.jwt()` é
--    nulo, a policy de organização não casa com ninguém e a varredura não
--    enxergaria chamado nenhum. O dono da função é o dono das tabelas, que
--    não está sujeito à RLS.
--
--    "Estourado" usa EXATAMENTE o mesmo critério da tela
--    (WarrantyModule.tsx, ClaimRow): prazo no passado e estado fora de
--    ENCERRADO/FORA_GARANTIA. Se um dia a tela mudar o critério, este tem de
--    mudar junto — senão o KPI e o alerta discordam.
--
--    Idempotente: um `SlaBreached` por chamado POR PRAZO. Se a triagem
--    reagendar o `sla_deadline`, um novo estouro volta a notificar; enquanto o
--    prazo for o mesmo, não repete.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_warranty_sla_sweep()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inseridos INT := 0;
BEGIN
  WITH estourados AS (
    SELECT c.id, c.organization_id, c.sla_deadline, c.severity, c.version,
           c.sistema_descricao, c.state,
           (CURRENT_DATE - c.sla_deadline) AS dias_atraso
      FROM public.warranty_claims c
     WHERE c.sla_deadline IS NOT NULL
       AND c.sla_deadline < CURRENT_DATE
       AND c.state NOT IN ('ENCERRADO', 'FORA_GARANTIA')
       AND NOT EXISTS (
         SELECT 1
           FROM public.warranty_claim_events e
          WHERE e.claim_id   = c.id
            AND e.event_type = 'SlaBreached'
            AND e.payload->>'slaDeadline' = c.sla_deadline::TEXT
       )
  ), inseridos AS (
    INSERT INTO public.warranty_claim_events (
      organization_id, claim_id, event_type, payload, aggregate_version
    )
    SELECT
      x.organization_id, x.id, 'SlaBreached',
      jsonb_build_object(
        'slaDeadline', x.sla_deadline,
        'diasAtraso',  x.dias_atraso,
        'severity',    x.severity,
        'state',       x.state,
        'sistema',     x.sistema_descricao,
        'detectadoPor', 'fn_warranty_sla_sweep'
      ),
      x.version
      FROM estourados x
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridos FROM inseridos;

  RETURN jsonb_build_object(
    'slaBreached', v_inseridos,
    'executadoEm', now()
  );
END;
$$;

-- Ninguém precisa chamar isto pelo app; quem chama é o cron (dono do objeto).
REVOKE ALL ON FUNCTION public.fn_warranty_sla_sweep() FROM PUBLIC;

COMMENT ON FUNCTION public.fn_warranty_sla_sweep() IS
  'Emite SlaBreached em warranty_claim_events para chamados com prazo estourado. Idempotente por (claim, sla_deadline). Chamada pelo cron warranty-sla-sweep, diário.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Agendamento
--
--    DIÁRIO, não a cada 6 minutos: `sla_deadline` é DATE. Varrer de seis em
--    seis minutos um dado que só muda à meia-noite é 240 execuções por dia
--    para encontrar o que uma encontraria. 06:00 UTC ≈ 03:00 em Brasília.
-- ────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('warranty-sla-sweep')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'warranty-sla-sweep');

SELECT cron.schedule(
  'warranty-sla-sweep',
  '0 6 * * *',
  $$ SELECT public.fn_warranty_sla_sweep(); $$
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Aposentar o cron de Qualidade
--
--    `quality-sla-enforcement` roda a cada 6 minutos contra
--    `condition_contestations` e `condition_action_plans` — tabelas que a
--    consolidação de 2026-08-26 marcou como LEGADO e que o app não escreve
--    mais. Cada execução é uma chamada HTTP para uma edge function que não tem
--    mais o que fazer.
--
--    A edge function em si NÃO é removida: fica publicada e ociosa. Se a
--    decisão for reativar contestação/escalonamento algum dia, reagendar é uma
--    linha.
-- ────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('quality-sla-enforcement')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quality-sla-enforcement');

COMMIT;

-- ############################################################################
-- CONFERÊNCIA
--
-- 1) Os jobs: esperado warranty-sla-sweep ativo, e NENHUMA linha de
--    quality-sla-enforcement.
-- 2) A varredura rodando agora: devolve quantos SlaBreached foram emitidos.
--    Rodar de novo em seguida deve devolver 0 — é a prova da idempotência.
-- ############################################################################

SELECT jobname, schedule, active FROM cron.job
 WHERE jobname IN ('warranty-sla-sweep', 'quality-sla-enforcement');

SELECT public.fn_warranty_sla_sweep() AS primeira_execucao;
SELECT public.fn_warranty_sla_sweep() AS segunda_execucao_deve_ser_zero;
