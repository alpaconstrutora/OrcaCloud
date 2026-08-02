-- ═══════════════════════════════════════════════════════════════════════════
-- ESVAZIA O VAULT COMERCIAL — a fonte que ressuscitava as parcelas
--
-- O QUE ACONTECEU (01/08/2026, reportado pelo usuário):
-- depois da limpeza da 20270849000001, as parcelas de proposta VOLTARAM para o
-- Contas a Receber. A causa não foi o caminho que já estava blindado
-- (`syncDealToFinance`, com o guard `hasRows`), e sim outro:
--
--   BankReconciliation.tsx varre TODOS os projetos da organização e chama
--   `financialSyncService.syncFinancialData(project)` direto — sem passar pelo
--   guard. Essa função lê `projects.settings.financialInfo.installments` e faz
--   upsert em `internal_transactions`. Como o JSONB do vault "Gestão Comercial"
--   nunca foi esvaziado, cada abertura da Conciliação Bancária reinseria tudo.
--
-- A correção tem duas metades, e as DUAS são necessárias:
--   1. CÓDIGO: `financialSyncService` não materializa mais parcelas quando o
--      projeto é o vault comercial (`isVault`). Já commitado.
--   2. DADO: esta migration esvazia o array. Sem ela o JSONB continua sendo uma
--      bomba armada para a próxima tela que chamar aquela função.
--
-- As parcelas NÃO se perdem: a fonte da verdade é `deal_installments` desde a
-- 20270849000000, e o backfill de lá já as copiou. O vault vira histórico.
--
-- ⚠️ NUNCA `supabase db push`. SQL Editor, à mão, em ordem.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Backup do settings inteiro, antes de qualquer coisa ─────────────────
CREATE TABLE IF NOT EXISTS public._bkp_commercial_vault_settings (
    project_id UUID,
    name TEXT,
    settings JSONB,
    backed_up_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public._bkp_commercial_vault_settings (project_id, name, settings)
SELECT p.id, p.name, p.settings
  FROM public.projects p
 WHERE p.name = 'Gestão Comercial'
   AND NOT EXISTS (SELECT 1 FROM public._bkp_commercial_vault_settings b
                    WHERE b.project_id = p.id);

-- ── 2. Conferência ANTES (quantas parcelas o vault ainda carrega) ──────────
SELECT p.id,
       p.settings->>'organizationId' AS org,
       jsonb_array_length(COALESCE(p.settings->'financialInfo'->'installments', '[]'::jsonb)) AS parcelas_no_vault
  FROM public.projects p
 WHERE p.name = 'Gestão Comercial'
 ORDER BY parcelas_no_vault DESC;

-- ── 3. Esvazia SÓ o array de parcelas ──────────────────────────────────────
-- `transactions` (lançamentos manuais do vault) e o resto de `settings` ficam
-- intactos: o alvo é exclusivamente o que reaparecia em Contas a Receber.
UPDATE public.projects p
   SET settings = jsonb_set(
           p.settings,
           '{financialInfo,installments}',
           '[]'::jsonb,
           true)
 WHERE p.name = 'Gestão Comercial'
   AND jsonb_array_length(COALESCE(p.settings->'financialInfo'->'installments', '[]'::jsonb)) > 0;

-- ── 4. Remove de novo o que a ressurreição trouxe de volta ─────────────────
-- Mesma CTE da 20270849000001 (a view continua existindo). Idempotente, e as
-- travas de segurança são as mesmas: nunca toca em CONCILIATED/RECEBIDO/PAGO,
-- nunca toca no que está publicado de propósito em `deal_installments`.
INSERT INTO public._bkp_cleanup_commercial_receivables
SELECT it.* FROM public.internal_transactions it
 WHERE it.id IN (SELECT id FROM public._vw_cleanup_commercial_alvo)
   AND NOT EXISTS (SELECT 1 FROM public._bkp_cleanup_commercial_receivables b
                    WHERE b.id = it.id);

DELETE FROM public.internal_transactions
 WHERE id IN (SELECT id FROM public._vw_cleanup_commercial_alvo);

-- ── 5. Conferência DEPOIS (esperado: tudo zero) ────────────────────────────
SELECT (SELECT COALESCE(sum(jsonb_array_length(COALESCE(p.settings->'financialInfo'->'installments', '[]'::jsonb))), 0)
          FROM public.projects p WHERE p.name = 'Gestão Comercial')   AS parcelas_no_vault,
       (SELECT count(*) FROM public._vw_cleanup_commercial_alvo)      AS alvo_restante,
       (SELECT count(*) FROM public.deal_installments)                AS serie_unica,
       (SELECT count(*) FROM public.deal_installments
         WHERE published_at IS NOT NULL)                              AS publicadas;
