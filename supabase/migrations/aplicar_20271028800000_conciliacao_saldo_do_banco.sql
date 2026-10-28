-- Conciliação › Dashboard: o saldo que o BANCO informa, ao lado do que o app calcula
-- Plano: docs/planos/2026-10-28-conciliacao-dashboard-confianca.md (passo 2, itens 2.1 e 2.4)
--
-- O app já guardava o saldo do banco em dois lugares e nenhuma tela o mostrava:
--   · bank_statement_imports.ledger_balance/_date — saldo de fechamento do OFX (LEDGERBAL);
--   · payment_account_gateway.saldo/saldo_em      — saldo do Asaas pela API.
-- Em 28/10/2026: Itaú −39.048,13 em 14/09 (OFX) × R$ 10.850.187,26 calculado; Asaas 138,35 ×
-- 138,35. As contas Sicredi não têm nenhum dos dois — daí o terceiro caminho: o saldo que a
-- pessoa lê no extrato e digita (decisão do usuário, 28/10).
--
-- Regra: por conta, vale o saldo informado MAIS RECENTE com data ≤ "Posição em", venha de onde
-- vier; no mesmo dia, o digitado vence o OFX, que vence a API. Ao lado vai o calculado NAQUELA
-- data (saldo inicial + extrato até ela) — comparar com o calculado de hoje seria comparar
-- datas diferentes.

-- ── 1. Saldo digitado à mão ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_account_saldo_informado (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_account_id uuid NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
    -- Copiado da conta pelo gatilho abaixo; nunca vem do cliente.
    organization_id    uuid NOT NULL,
    data               date NOT NULL,
    saldo              numeric(15, 2) NOT NULL,
    created_by         uuid DEFAULT auth.uid(),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    -- Um saldo por conta e dia: digitar de novo o mesmo dia corrige, não acumula.
    UNIQUE (payment_account_id, data)
);

COMMENT ON TABLE public.payment_account_saldo_informado IS
  'Saldo que o extrato do banco mostra numa data, digitado por quem concilia (conta sem OFX/API). Lido por fn_reconciliation_dashboard.';

CREATE OR REPLACE FUNCTION public.fn_saldo_informado_org_da_conta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- A organização é a da conta. Quem não enxerga a conta (RLS de payment_accounts) recebe NULL
  -- aqui e o NOT NULL recusa a linha.
  SELECT pa.organization_id INTO NEW.organization_id
  FROM public.payment_accounts pa WHERE pa.id = NEW.payment_account_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

-- Função de gatilho: ninguém a chama direto, mas a regra é a mesma de toda função nova.
REVOKE EXECUTE ON FUNCTION public.fn_saldo_informado_org_da_conta() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_saldo_informado_org_da_conta ON public.payment_account_saldo_informado;
CREATE TRIGGER trg_saldo_informado_org_da_conta
  BEFORE INSERT OR UPDATE ON public.payment_account_saldo_informado
  FOR EACH ROW EXECUTE FUNCTION public.fn_saldo_informado_org_da_conta();

ALTER TABLE public.payment_account_saldo_informado ENABLE ROW LEVEL SECURITY;

-- Uma condição só, sem OR: membro da organização da conta.
DROP POLICY IF EXISTS saldo_informado_membro ON public.payment_account_saldo_informado;
CREATE POLICY saldo_informado_membro ON public.payment_account_saldo_informado
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.payment_account_saldo_informado FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_account_saldo_informado TO authenticated;

-- ── 2. Dashboard (por conta) ────────────────────────────────────────────────
-- Igual a aplicar_20271028300000_conciliacao_status_unico.sql, mais o saldo do banco por conta:
-- saldo_banco, saldo_banco_data, saldo_banco_origem ('MANUAL' | 'OFX' | 'ASAAS'),
-- calculado_na_data_banco e pendentes_apos_data_banco (impacto de "recomeçar no saldo do banco").
CREATE OR REPLACE FUNCTION public.fn_reconciliation_dashboard(
  p_organization_id uuid,
  p_as_of           date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  v_result  JSONB;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  WITH accts AS (
    SELECT pa.id, pa.name, pa.bank,
           COALESCE(pa.opening_balance, 0)                      AS opening_balance,
           pa.opening_balance_date                              AS opening_balance_date,
           COALESCE(pa.opening_balance_date, DATE '1900-01-01') AS opening_date
    FROM public.payment_accounts pa
    WHERE pa.organization_id = ANY(v_targets)
  ),
  tx AS (
    SELECT bt.bank_account_id, bt.status, bt.category, bt.direction, bt.amount, bt.description_normalized,
           bt.transaction_date,
           CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END AS signed
    FROM public.bank_transactions bt
    JOIN accts a ON a.id = bt.bank_account_id
    WHERE bt.transaction_date <= p_as_of
      AND bt.transaction_date >= a.opening_date
      AND bt.status <> 'IGNORED'
  ),
  informado AS (
    -- O saldo do banco mais recente até a data pedida, de qualquer origem.
    SELECT DISTINCT ON (s.conta) s.conta, s.saldo, s.data, s.origem
    FROM (
      SELECT si.payment_account_id AS conta, si.saldo, si.data, 'MANUAL' AS origem, 0 AS prioridade
      FROM public.payment_account_saldo_informado si
      JOIN accts a ON a.id = si.payment_account_id
      WHERE si.data <= p_as_of
      UNION ALL
      SELECT i.bank_account_id, i.ledger_balance, i.ledger_balance_date, 'OFX', 1
      FROM public.bank_statement_imports i
      JOIN accts a ON a.id = i.bank_account_id
      WHERE i.ledger_balance IS NOT NULL AND i.ledger_balance_date IS NOT NULL
        AND i.ledger_balance_date <= p_as_of
      UNION ALL
      SELECT g.payment_account_id, g.saldo, (g.saldo_em AT TIME ZONE 'America/Sao_Paulo')::date, 'ASAAS', 2
      FROM public.payment_account_gateway g
      JOIN accts a ON a.id = g.payment_account_id
      WHERE g.saldo IS NOT NULL AND g.saldo_em IS NOT NULL
        AND (g.saldo_em AT TIME ZONE 'America/Sao_Paulo')::date <= p_as_of
    ) s
    ORDER BY s.conta, s.data DESC, s.prioridade
  ),
  per_account AS (
    SELECT a.id, a.name, a.bank, a.opening_balance, a.opening_balance_date,
           a.opening_balance + COALESCE(SUM(t.signed), 0)                                             AS bank_balance,
           a.opening_balance
             + COALESCE(SUM(t.signed) FILTER (WHERE public.fn_bank_tx_conciliado(t.status)), 0)       AS reconciled_balance,
           COALESCE(SUM(t.amount)  FILTER (WHERE public.fn_bank_tx_pendente(t.status)), 0)            AS pending_value,
           COALESCE(COUNT(*)       FILTER (WHERE public.fn_bank_tx_pendente(t.status)), 0)            AS pending_count,
           COALESCE(COUNT(*)       FILTER (WHERE public.fn_bank_tx_pendente(t.status)
                                                AND t.category IS NULL), 0)                           AS unclassified_count,
           COALESCE(COUNT(*)       FILTER (WHERE t.status = 'TRANSFER'), 0)                           AS transfer_count,
           inf.saldo  AS saldo_banco,
           inf.data   AS saldo_banco_data,
           inf.origem AS saldo_banco_origem,
           CASE WHEN inf.data IS NULL THEN NULL
                ELSE a.opening_balance + COALESCE(SUM(t.signed) FILTER (WHERE t.transaction_date <= inf.data), 0)
           END                                                                                        AS calculado_na_data_banco,
           CASE WHEN inf.data IS NULL THEN NULL
                ELSE COALESCE(COUNT(*) FILTER (WHERE public.fn_bank_tx_pendente(t.status)
                                                 AND t.transaction_date > inf.data), 0)
           END                                                                                        AS pendentes_apos_data_banco
    FROM accts a
    LEFT JOIN tx t ON t.bank_account_id = a.id
    LEFT JOIN informado inf ON inf.conta = a.id
    GROUP BY a.id, a.name, a.bank, a.opening_balance, a.opening_balance_date, inf.saldo, inf.data, inf.origem
  ),
  ledger AS (
    -- DOIS números, não um. `baixado` é qualquer origem (webhook, boleto, sync);
    -- `conferido` é só o que passou pelo extrato. Comparar o extrato com o primeiro
    -- era comparar coisas diferentes, e a diferença nunca fechava.
    SELECT COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END)
                    FILTER (WHERE it.status = 'CONCILIATED'), 0)                        AS baixado_net,
           COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END)
                    FILTER (WHERE it.bank_reconciled_at IS NOT NULL), 0)                AS conferido_net,
           COUNT(*) FILTER (WHERE it.status = 'CONCILIATED')                            AS baixado_count,
           COUNT(*) FILTER (WHERE it.bank_reconciled_at IS NOT NULL)                    AS conferido_count
    FROM public.internal_transactions it
    WHERE it.organization_id = ANY(v_targets) AND it.transaction_date <= p_as_of
  ),
  fees AS (
    SELECT COALESCE(SUM(t.amount), 0) AS fees_value, COUNT(*) AS fees_count
    FROM tx t
    WHERE public.fn_bank_tx_pendente(t.status)
      AND t.category IS NULL AND t.direction = 'DEBIT'
      AND t.description_normalized ~ '(TARIFA|TAXA|CESTA|MANUTENCAO|PACOTE|IOF|ANUIDADE)'
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'accounts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'account_id', pa.id, 'account_name', pa.name, 'bank_name', pa.bank,
            'opening_balance', pa.opening_balance, 'opening_balance_date', pa.opening_balance_date,
            'bank_balance', pa.bank_balance,
            'reconciled_balance', pa.reconciled_balance,
            'difference', pa.bank_balance - pa.reconciled_balance,
            'pending_value', pa.pending_value, 'pending_count', pa.pending_count,
            'unclassified_count', pa.unclassified_count, 'transfer_count', pa.transfer_count,
            'saldo_banco', pa.saldo_banco, 'saldo_banco_data', pa.saldo_banco_data,
            'saldo_banco_origem', pa.saldo_banco_origem,
            'calculado_na_data_banco', pa.calculado_na_data_banco,
            'pendentes_apos_data_banco', pa.pendentes_apos_data_banco
          ) ORDER BY pa.name)
        FROM per_account pa), '[]'::jsonb),
    'totals', (
        SELECT jsonb_build_object(
            'opening_balance',    COALESCE(SUM(opening_balance), 0),
            'bank_balance',       COALESCE(SUM(bank_balance), 0),
            'reconciled_balance', COALESCE(SUM(reconciled_balance), 0),
            'difference',         COALESCE(SUM(bank_balance - reconciled_balance), 0),
            'pending_value',      COALESCE(SUM(pending_value), 0),
            'pending_count',      COALESCE(SUM(pending_count), 0),
            'unclassified_count', COALESCE(SUM(unclassified_count), 0),
            'transfer_count',     COALESCE(SUM(transfer_count), 0)
          )
        FROM per_account),
    'system_balance', (
        SELECT (SELECT COALESCE(SUM(opening_balance), 0) FROM per_account) + l.baixado_net FROM ledger l),
    'ledger', (
        SELECT jsonb_build_object(
            'baixado_net',      l.baixado_net,
            'baixado_count',    l.baixado_count,
            'conferido_net',    l.conferido_net,
            'conferido_count',  l.conferido_count,
            'so_baixado_count', l.baixado_count - l.conferido_count
          ) FROM ledger l),
    'fees', (SELECT jsonb_build_object('value', fees_value, 'count', fees_count) FROM fees)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) TO authenticated;
