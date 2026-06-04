-- ============================================================
-- Balancete Gerencial — fn_balancete
-- Retorna cada categoria com seus créditos, débitos e saldo
-- líquido para um período, filtrável por obra.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_balancete(
  p_organization_id UUID,
  p_date_from        DATE,
  p_date_to          DATE,
  p_project_id       UUID DEFAULT NULL
)
RETURNS TABLE (
  category_id    UUID,
  category_name  TEXT,
  dre_group      TEXT,
  nature         TEXT,
  sort_order     INT,
  creditos       NUMERIC,
  debitos        NUMERIC,
  saldo_liquido  NUMERIC,
  n_transacoes   BIGINT
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    fc.id                                                            AS category_id,
    COALESCE(fc.name, it.category, '(Sem Categoria)')               AS category_name,
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')                     AS dre_group,
    COALESCE(fc.nature,    'EXPENSE')                               AS nature,
    COALESCE(fc.sort_order, 99)                                     AS sort_order,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE 0 END), 0) AS creditos,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  THEN it.amount ELSE 0 END), 0) AS debitos,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN  it.amount
                      WHEN it.direction = 'DEBIT'  THEN -it.amount
                      ELSE 0 END), 0)                               AS saldo_liquido,
    COUNT(*)                                                         AS n_transacoes
  FROM public.internal_transactions it
  LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
  WHERE it.organization_id = p_organization_id
    AND it.status != 'CANCELLED'
    AND it.transaction_date::date BETWEEN p_date_from AND p_date_to
    AND (p_project_id IS NULL OR it.project_id = p_project_id)
  GROUP BY
    fc.id,
    COALESCE(fc.name, it.category, '(Sem Categoria)'),
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO'),
    COALESCE(fc.nature,    'EXPENSE'),
    COALESCE(fc.sort_order, 99)
  ORDER BY
    COALESCE(fc.sort_order, 99),
    COALESCE(fc.name, it.category)
$$;

GRANT EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID) TO authenticated;
