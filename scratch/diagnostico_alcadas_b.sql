-- DIAGNÓSTICO (a) vs (b) — o portão de aprovação é usado ou ignorado? SOMENTE LEITURA.
WITH r AS (
  -- Total de lançamentos
  SELECT 1 AS ord, 'Total internal_transactions' AS metrica, 'todos'::text AS detalhe,
         COUNT(*)::bigint AS qtd, NULL::numeric AS soma_valor
  FROM public.internal_transactions
  UNION ALL
  -- Distribuição por approval_status (todos)
  SELECT 2, 'Por approval_status', COALESCE(approval_status,'(null)'),
         COUNT(*)::bigint, ROUND(SUM(amount)::numeric,2)
  FROM public.internal_transactions
  GROUP BY approval_status
  UNION ALL
  -- Só as SAÍDAS (DEBIT) — lado coberto pela aprovação
  SELECT 3, 'Saídas (DEBIT) por approval_status', COALESCE(approval_status,'(null)'),
         COUNT(*)::bigint, ROUND(SUM(amount)::numeric,2)
  FROM public.internal_transactions
  WHERE direction='DEBIT'
  GROUP BY approval_status
  UNION ALL
  -- (b) prova do bypass: DEBIT já PAGAS/liquidadas que nunca foram APROVADAS
  SELECT 4, 'BYPASS: DEBIT liquidada e nunca aprovada', 'status<>APROVADO',
         COUNT(*)::bigint, ROUND(SUM(amount)::numeric,2)
  FROM public.internal_transactions
  WHERE direction='DEBIT'
    AND status IN ('PAID','SETTLED','LIQUIDADO','PAGO')
    AND COALESCE(approval_status,'RASCUNHO') <> 'APROVADO'
)
SELECT metrica, detalhe, qtd, soma_valor FROM r ORDER BY ord, qtd DESC;
