-- ════════════════════════════════════════════════════════════════════════════
-- fn_reconciliation_divergences: plano com os valores reais em TODA chamada (11/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Sintoma: a Central de Controle ("Bom dia") levava ~6 s para carregar. Medido:
-- fn_central_controle_bootstrap ~4,1 s no banco (pg_stat_statements, chamadas
-- reais), e o maior pedaço era ESTA função (1,5–2 s; também a tela de Conciliação).
--
-- Causa: era `LANGUAGE sql`, e o PG 17 planeja a consulta de função SQL sem os
-- valores dos parâmetros. `(p_organization_id IS NULL OR bt.organization_id =
-- p_organization_id)` e os demais filtros viram um plano GENÉRICO, ~3× mais lento.
--
-- O que NÃO resolve (medido, teste a seco desfeito): `plpgsql` com SQL estático —
-- as 5 primeiras chamadas da sessão saem rápidas (plano por valor) e a 6ª troca
-- para o genérico (1,7 s de novo); o pool do PostgREST reaproveita sessões, então
-- quase toda chamada real cairia no lento. `SET plan_cache_mode =
-- force_custom_plan` na função também não mudou o tempo.
--
-- O que resolve: `EXECUTE ... USING` — cada chamada planeja com os valores. Medido
-- intercalado, 8 rodadas, como `authenticated` (desenvolvedor@), Todas e Alpa:
--   atual 1,46–1,77 s  →  EXECUTE USING 0,43–0,56 s, estável depois da 5ª chamada;
--   `counts`, `value_mismatch` e `bank_without_internal` IGUAIS nas 8.
--
-- NADA MUDA NO RESULTADO: a consulta abaixo é a de
-- aplicar_20271029960000_conciliacao_conta_desativada_e_empresa.sql (cujo corpo bate
-- com o do banco — md5 conferido em 11/11/2026), com os parâmetros trocados por
-- $1..$5 e reindentada. Mesma assinatura, mesmo retorno, mesma ACL; quem chama
-- (Central, DivergencesPanel) não muda.
--
-- Aplicar: npx supabase db query --linked -f supabase/migrations/aplicar_20271111920000_divergencias_plano_por_chamada.sql
-- NUNCA `supabase db push` (CLAUDE.md da raiz).

CREATE OR REPLACE FUNCTION public.fn_reconciliation_divergences(
    p_organization_id uuid,
    p_as_of           date    DEFAULT CURRENT_DATE,
    p_aging_days      integer DEFAULT 5,
    p_value_tolerance numeric DEFAULT 50,
    p_limit           integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_saida jsonb;
BEGIN
  -- $1 = p_organization_id · $2 = p_as_of · $3 = p_aging_days
  -- $4 = p_value_tolerance · $5 = p_limit
  EXECUTE $q$
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
      WHERE ($1 IS NULL OR bt.organization_id = $1)
        AND bt.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
        AND bt.transaction_date <= $2
        AND pa.is_active IS NOT FALSE   -- conta desativada sai da Conciliação (29/10)
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
      WHERE ($1 IS NULL OR it.organization_id = $1)
        AND it.status = 'PENDING'
        AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
    ),
    -- Candidatos do par divergente: qualquer título pendente que a pessoa enxerga. Quem
    -- decide se ele vale para um extrato é a CONTA do extrato (bank_orgs, abaixo).
    internal_candidates AS (
      SELECT it.id, it.organization_id, it.transaction_date, it.amount, it.direction, it.description
      FROM public.internal_transactions it
      WHERE it.status = 'PENDING'
        AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
    ),
    -- Organizações que cada conta do extrato atende (dona + lista + "todas").
    conta_orgs AS (
      SELECT c.bank_account_id, o AS organization_id
      FROM (SELECT DISTINCT bank_account_id FROM bank_pending) c
      CROSS JOIN LATERAL public.fn_orgs_atendidas_pela_conta(c.bank_account_id) AS o
    ),
    -- Cada extrato × as orgs cujos títulos ele pode casar: a dele, e as da conta.
    bank_orgs AS (
      SELECT b.id AS bank_id, b.organization_id FROM bank_pending b
      UNION
      SELECT b.id, co.organization_id FROM bank_pending b JOIN conta_orgs co ON co.bank_account_id = b.bank_account_id
    ),
    -- Cada extrato vira 7 linhas (uma por dia da janela ±3) por org: o join abaixo é por
    -- IGUALDADE de (org, direção, data), que o hash join resolve sem varrer todos os pares.
    bank_window AS (
      SELECT b.*, bo.organization_id AS match_org, b.transaction_date + k AS match_date
      FROM bank_pending b
      JOIN bank_orgs bo ON bo.bank_id = b.id
      CROSS JOIN generate_series(-3, 3) AS k
    ),
    mismatch AS (
      SELECT DISTINCT ON (b.id)
             b.id AS bank_id, i.id AS internal_id, b.amount AS bank_amount, i.amount AS internal_amount,
             b.amount - i.amount AS difference, b.transaction_date AS bank_date, i.transaction_date AS internal_date,
             b.description AS bank_description, i.description AS internal_description, b.direction, b.account_name
      FROM bank_window b
      JOIN internal_candidates i
        ON i.organization_id = b.match_org   -- org do extrato, ou org que a conta atende
       AND i.direction = b.direction
       AND i.transaction_date = b.match_date
       AND abs(b.amount - i.amount) > 0
       AND abs(b.amount - i.amount) <= $4
      -- `i.id` desempata (+50 × −50 do mesmo extrato): antes a escolha era arbitrária e
      -- mudava de uma chamada para outra.
      ORDER BY b.id, abs(b.amount - i.amount) ASC, i.id
    )
    SELECT jsonb_build_object(
      'as_of', $2,
      'counts', jsonb_build_object(
          'bank_without_internal', (SELECT COUNT(*) FROM bank_pending b WHERE NOT EXISTS (SELECT 1 FROM mismatch x WHERE x.bank_id = b.id)),
          'internal_without_bank', (SELECT COUNT(*) FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= $2 - $3),
          'value_mismatch',        (SELECT COUNT(*) FROM mismatch)
      ),
      'bank_without_internal', COALESCE((
          SELECT jsonb_agg(row_to_json(t) ORDER BY t.transaction_date DESC) FROM (
            SELECT b.id, b.bank_account_id, b.account_name, b.transaction_date, b.amount, b.direction, b.description, b.category
            FROM bank_pending b WHERE NOT EXISTS (SELECT 1 FROM mismatch x WHERE x.bank_id = b.id)
            ORDER BY b.transaction_date DESC LIMIT $5) t), '[]'::jsonb),
      'internal_without_bank', COALESCE((
          SELECT jsonb_agg(row_to_json(t) ORDER BY t.ref_date ASC) FROM (
            SELECT i.id, i.transaction_date, i.due_date, COALESCE(i.due_date, i.transaction_date) AS ref_date,
                   ($2 - COALESCE(i.due_date, i.transaction_date)) AS days_overdue,
                   i.amount, i.direction, i.description, i.category, i.party_name, i.business_status, i.project_id
            FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= $2 - $3
            ORDER BY ref_date ASC LIMIT $5) t), '[]'::jsonb),
      'value_mismatch', COALESCE((
          SELECT jsonb_agg(row_to_json(t) ORDER BY abs(t.difference) DESC) FROM (
            SELECT * FROM mismatch ORDER BY abs(difference) DESC LIMIT $5) t), '[]'::jsonb)
    )
  $q$
  INTO v_saida
  USING p_organization_id, p_as_of, p_aging_days, p_value_tolerance, p_limit;
  RETURN v_saida;
END;
$function$;

-- REGRA #7: mesma ACL de aplicar_20270919000015 (sem PUBLIC, sem anon).
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) TO authenticated;

-- Conferência depois de aplicar (deve dizer plpgsql):
--   SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
--    WHERE p.proname = 'fn_reconciliation_divergences';
