-- ═══════════════════════════════════════════════════════════════════════════
-- LIMPEZA DO PASSIVO — parcelas de negociação publicadas indevidamente
--
-- Até 2026-08-01, `commercialService.saveDeal` materializava o plano de
-- pagamento em Contas a Receber assim que o negócio saía de IN_NEGOTIATION.
-- Resultado: recebíveis de negócios que ainda eram só PROPOSTA/RESERVA.
-- A migration 20270849000000 criou a série única (`deal_installments`) e
-- marcou como `published_at` tudo que já estava legitimamente lançado.
-- Esta aqui remove o resto.
--
-- ⚠️ RODAR EM DUAS ETAPAS, SEPARADAS.
--    1. Execute SÓ a PARTE A. Leia os números. Se algo não fizer sentido, PARE.
--    2. Só então execute a PARTE B.
-- ⚠️ Requer que 20270849000000 já tenha sido aplicada (inclusive o passo 6.3,
--    que é o que impede este DELETE de apagar dinheiro real).
-- ⚠️ NUNCA `supabase db push`. SQL Editor, à mão.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE A — RELATÓRIO (não altera nada)
-- ───────────────────────────────────────────────────────────────────────────
--
-- O alvo NÃO é filtrado por `source_system = 'COMMERCIAL'` de propósito:
-- negócio com `linked_project_id` de obra real era materializado como
-- 'PROJECT', e o filtro deixaria esses órfãos para trás (mesma lição do
-- comentário em commercialFinanceService.deleteDealInstallments).

CREATE OR REPLACE VIEW public._vw_cleanup_commercial_alvo AS
SELECT it.id, it.organization_id, it.reference_id, it.amount,
       it.due_date, it.description, it.source_system, it.business_status
  FROM public.internal_transactions it
  LEFT JOIN public.deal_installments di
         ON di.organization_id = it.organization_id
        AND di.reference_id    = it.reference_id
 WHERE it.direction = 'CREDIT'
   -- ids gerados pelo antigo syncDealToFinance
   AND (it.reference_id LIKE 'tx-%-custom-p%'
     OR it.reference_id LIKE 'tx-%-dp'
     OR it.reference_id ~ '^tx-[0-9a-f-]{36}-p[0-9]+$')
   -- NUNCA toca em dinheiro que entrou
   AND it.status <> 'CONCILIATED'
   AND COALESCE(it.business_status, 'PREVISTO') NOT IN ('RECEBIDO', 'PAGO')
   -- NUNCA toca no que o novo modelo considera publicado de propósito
   AND (di.id IS NULL OR di.published_at IS NULL);

-- A.1 — resumo por organização
SELECT organization_id,
       count(*)        AS parcelas,
       sum(amount)     AS total,
       min(due_date)   AS venc_min,
       max(due_date)   AS venc_max
  FROM public._vw_cleanup_commercial_alvo
 GROUP BY organization_id
 ORDER BY total DESC;

-- A.2 — inspeção visual
SELECT * FROM public._vw_cleanup_commercial_alvo ORDER BY due_date LIMIT 50;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE B — DELETE (só depois de conferir a PARTE A)
-- ───────────────────────────────────────────────────────────────────────────
--
-- Backup em tabela real (`_bkp_*`), não TEMP: o SQL Editor não mantém sessão
-- entre execuções, então uma tabela temporária evaporaria antes de servir para
-- reverter qualquer coisa.

/*  ── descomente para executar ─────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public._bkp_cleanup_commercial_receivables
    AS SELECT * FROM public.internal_transactions WHERE false;

INSERT INTO public._bkp_cleanup_commercial_receivables
SELECT it.* FROM public.internal_transactions it
 WHERE it.id IN (SELECT id FROM public._vw_cleanup_commercial_alvo)
   AND NOT EXISTS (SELECT 1 FROM public._bkp_cleanup_commercial_receivables b
                    WHERE b.id = it.id);

DELETE FROM public.internal_transactions
 WHERE id IN (SELECT id FROM public._vw_cleanup_commercial_alvo);

COMMIT;

-- Reversão (enquanto o backup existir):
-- INSERT INTO public.internal_transactions
-- SELECT * FROM public._bkp_cleanup_commercial_receivables
--  ON CONFLICT (id) DO NOTHING;

    ─────────────────────────────────────────────────────────────────────── */

-- Limpeza da view auxiliar depois de concluído:
-- DROP VIEW IF EXISTS public._vw_cleanup_commercial_alvo;
