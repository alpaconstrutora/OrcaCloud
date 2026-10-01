-- ════════════════════════════════════════════════════════════════════════════
-- Conciliação: incluir (ou não) extratos sem credor/cliente.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.
--
-- Pedido (01/10/2026): "no drawer Regras de classificação: incluir checkbox com: Incluir
-- lançamentos do extrato sem credor/cliente definido." Decisão do usuário: vale para a
-- conciliação (Central), por organização, padrão MARCADO (incluir — nada muda até desligar).
-- Plano: docs/planos/2026-10-01-conciliacao-extrato-sem-contraparte.md
--
-- 1. reconciliation_settings.include_without_counterparty (padrão true).
-- 2. fn_reconciliation_divergences: com a opção desligada, `bank_pending` ignora extrato
--    sem `counterparty_name`. O resto é idêntico a aplicar_20271001000050 (conferido em
--    produção em 01/10/2026).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.reconciliation_settings
    ADD COLUMN IF NOT EXISTS include_without_counterparty boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.reconciliation_settings.include_without_counterparty IS
    'false = extrato sem credor/cliente (counterparty_name vazio) fica fora da conciliação (sugestões, agrupamentos, divergências, Pendentes).';

CREATE OR REPLACE FUNCTION public.fn_reconciliation_divergences(
    p_organization_id uuid,
    p_as_of           date    DEFAULT CURRENT_DATE,
    p_aging_days      integer DEFAULT 5,
    p_value_tolerance numeric DEFAULT 50,
    p_limit           integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH
-- Categorias que cada organização tirou da conciliação (painel Regras da Central),
-- já normalizadas: sem acento, sem caixa, sem espaço nas pontas.
excluded AS (
  SELECT rs.organization_id, lower(public.unaccent(btrim(c))) AS cat
  FROM public.reconciliation_settings rs
  CROSS JOIN LATERAL unnest(rs.excluded_categories) AS c
),
-- Organizações que desligaram "Incluir lançamentos do extrato sem credor/cliente definido".
sem_contraparte_fora AS (
  SELECT rs.organization_id FROM public.reconciliation_settings rs
  WHERE NOT rs.include_without_counterparty
),
bank_pending AS (
  SELECT bt.id, bt.organization_id, bt.bank_account_id, bt.transaction_date, bt.amount, bt.direction,
         COALESCE(bt.description_normalized, bt.description_raw) AS description,
         bt.category, pa.name AS account_name
  FROM public.bank_transactions bt
  JOIN public.payment_accounts pa ON pa.id = bt.bank_account_id
  WHERE (p_organization_id IS NULL OR bt.organization_id = p_organization_id)
    AND bt.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
    AND bt.transaction_date <= p_as_of
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = bt.id)
    -- Extrato de categoria excluída não é divergência. Sem categoria nunca é excluído.
    AND NOT EXISTS (SELECT 1 FROM excluded e
                    WHERE e.organization_id = bt.organization_id
                      AND e.cat = lower(public.unaccent(btrim(bt.category))))
    -- Extrato sem credor/cliente, quando a organização desligou a inclusão.
    AND NOT (NULLIF(btrim(bt.counterparty_name), '') IS NULL
             AND EXISTS (SELECT 1 FROM sem_contraparte_fora s WHERE s.organization_id = bt.organization_id))
),
internal_pending AS (
  SELECT it.id, it.organization_id, it.transaction_date, it.due_date, it.amount, it.direction,
         it.description, it.category, it.party_name, it.business_status, it.project_id
  FROM public.internal_transactions it
  WHERE (p_organization_id IS NULL OR it.organization_id = p_organization_id)
    AND it.status = 'PENDING'
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
),
-- Cada extrato vira 7 linhas (uma por dia da janela ±3): o join abaixo é por
-- IGUALDADE de (direção, data), que o hash join resolve sem varrer todos os pares.
bank_window AS (
  SELECT b.*, b.transaction_date + k AS match_date
  FROM bank_pending b
  CROSS JOIN generate_series(-3, 3) AS k
),
mismatch AS (
  SELECT DISTINCT ON (b.id)
         b.id AS bank_id, i.id AS internal_id, b.amount AS bank_amount, i.amount AS internal_amount,
         b.amount - i.amount AS difference, b.transaction_date AS bank_date, i.transaction_date AS internal_date,
         b.description AS bank_description, i.description AS internal_description, b.direction, b.account_name
  FROM bank_window b
  JOIN internal_pending i
    ON i.organization_id = b.organization_id   -- "Todas": nunca casa entre organizações
   AND i.direction = b.direction
   AND i.transaction_date = b.match_date
   AND abs(b.amount - i.amount) > 0
   AND abs(b.amount - i.amount) <= p_value_tolerance
  -- `i.id` desempata (+50 × −50 do mesmo extrato): antes a escolha era arbitrária e
  -- mudava de uma chamada para outra.
  ORDER BY b.id, abs(b.amount - i.amount) ASC, i.id
)
SELECT jsonb_build_object(
  'as_of', p_as_of,
  'counts', jsonb_build_object(
      'bank_without_internal', (SELECT COUNT(*) FROM bank_pending b WHERE NOT EXISTS (SELECT 1 FROM mismatch x WHERE x.bank_id = b.id)),
      'internal_without_bank', (SELECT COUNT(*) FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days),
      'value_mismatch',        (SELECT COUNT(*) FROM mismatch)
  ),
  'bank_without_internal', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.transaction_date DESC) FROM (
        SELECT b.id, b.bank_account_id, b.account_name, b.transaction_date, b.amount, b.direction, b.description, b.category
        FROM bank_pending b WHERE NOT EXISTS (SELECT 1 FROM mismatch x WHERE x.bank_id = b.id)
        ORDER BY b.transaction_date DESC LIMIT p_limit) t), '[]'::jsonb),
  'internal_without_bank', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.ref_date ASC) FROM (
        SELECT i.id, i.transaction_date, i.due_date, COALESCE(i.due_date, i.transaction_date) AS ref_date,
               (p_as_of - COALESCE(i.due_date, i.transaction_date)) AS days_overdue,
               i.amount, i.direction, i.description, i.category, i.party_name, i.business_status, i.project_id
        FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days
        ORDER BY ref_date ASC LIMIT p_limit) t), '[]'::jsonb),
  'value_mismatch', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY abs(t.difference) DESC) FROM (
        SELECT * FROM mismatch ORDER BY abs(difference) DESC LIMIT p_limit) t), '[]'::jsonb)
);
$function$;

-- REGRA #7: mesma ACL de aplicar_20270919000015 (sem PUBLIC, sem anon).
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) TO authenticated;
