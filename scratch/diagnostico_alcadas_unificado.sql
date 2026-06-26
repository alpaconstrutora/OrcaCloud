-- DIAGNÓSTICO alçadas — versão UNIFICADA (um só resultado). SOMENTE LEITURA.
WITH r AS (
  -- 1. Alçadas de governança cadastradas (total)
  SELECT 1 AS ord, '1. Alçadas cadastradas' AS secao, 'total'::text AS detalhe,
         COUNT(*)::bigint AS qtd, NULL::numeric AS valor, NULL::numeric AS valor_max
  FROM public.org_authority_limits
  UNION ALL
  -- 1. Quebra por fluxo + alvo
  SELECT 2, '1. Alçadas por fluxo/alvo',
         flow_type || ' / ' || CASE WHEN role_id IS NOT NULL THEN 'cargo'
                                    WHEN department_id IS NOT NULL THEN 'departamento'
                                    WHEN employee_id IS NOT NULL THEN 'pessoa' ELSE 'indefinido' END
         || ' (dupla: ' || COUNT(*) FILTER (WHERE requer_dupla_assinatura) || ')',
         COUNT(*)::bigint, MIN(limite_maximo)::numeric, MAX(limite_maximo)::numeric
  FROM public.org_authority_limits
  GROUP BY flow_type, CASE WHEN role_id IS NOT NULL THEN 'cargo'
                           WHEN department_id IS NOT NULL THEN 'departamento'
                           WHEN employee_id IS NOT NULL THEN 'pessoa' ELSE 'indefinido' END
  UNION ALL
  -- 1b. Empresas distintas com alçada
  SELECT 3, '1b. Empresas com alçada', 'distintas',
         COUNT(DISTINCT company_id)::bigint, NULL, NULL
  FROM public.org_authority_limits
  UNION ALL
  -- 2. Delegações por status
  SELECT 4, '2. Delegações', status,
         COUNT(*)::bigint, NULL, NULL
  FROM public.org_delegations GROUP BY status
  UNION ALL
  -- 3. Financeiro aprovado por níveis exigidos
  SELECT 5, '3. Financeiro aprovado', 'níveis exigidos = ' || COALESCE(approval_required_levels,1),
         COUNT(*)::bigint, ROUND(SUM(amount)::numeric,2), ROUND(MAX(amount)::numeric,2)
  FROM public.internal_transactions WHERE approval_status='APROVADO'
  GROUP BY COALESCE(approval_required_levels,1)
  UNION ALL
  -- 3b. Tx altas (>=50k) aprovadas com <=1 passo
  SELECT 6, '3b. Financeiro RISCO', 'tx >=50k com <=1 passo',
         COUNT(*)::bigint, ROUND(SUM(amount)::numeric,2), NULL
  FROM public.internal_transactions
  WHERE approval_status='APROVADO' AND amount>=50000
    AND COALESCE(jsonb_array_length(approval_chain),0)<=1
  UNION ALL
  -- 4. Contratos aprovados por níveis exigidos
  SELECT 7, '4. Contratos aprovados', 'níveis exigidos = ' || COALESCE(approval_required_levels,1),
         COUNT(*)::bigint, ROUND(SUM(current_value)::numeric,2), ROUND(MAX(current_value)::numeric,2)
  FROM public.contracts WHERE approval_status='APROVADO'
  GROUP BY COALESCE(approval_required_levels,1)
  UNION ALL
  -- 4b. Contratos altos (>=50k) aprovados com <=1 passo
  SELECT 8, '4b. Contratos RISCO', 'contrato >=50k com <=1 passo',
         COUNT(*)::bigint, ROUND(SUM(current_value)::numeric,2), NULL
  FROM public.contracts
  WHERE approval_status='APROVADO' AND current_value>=50000
    AND COALESCE(jsonb_array_length(approval_chain),0)<=1
  UNION ALL
  -- 5. Aprovadores distintos (financeiro)
  SELECT 9, '5. Quem aprova (financeiro)', COALESCE(step->>'approved_by','(vazio)'),
         COUNT(*)::bigint, NULL, NULL
  FROM public.internal_transactions t,
       LATERAL jsonb_array_elements(t.approval_chain) AS step
  WHERE step->>'action'='APROVADO'
  GROUP BY step->>'approved_by'
  UNION ALL
  -- 6. Compras aprovadas (boolean)
  SELECT 10, '6. Compras', 'is_financial_approved = true',
         COUNT(*)::bigint, NULL, NULL
  FROM public.purchase_orders WHERE is_financial_approved=true
)
SELECT secao, detalhe, qtd, valor, valor_max
FROM r
ORDER BY ord, qtd DESC;
