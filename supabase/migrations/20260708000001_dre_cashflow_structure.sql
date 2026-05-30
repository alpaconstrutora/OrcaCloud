-- ============================================================
-- DRE + Fluxo de Caixa — Financeiro Consolidado
-- OrçaCloud SaaS · Migration 20260708000001
-- Estratégia: projeções (view/RPC) sobre internal_transactions
--             classificadas por financial_categories hierárquico
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ESTENDER financial_categories com hierarquia + DRE
--    (idempotente — Regra 10 das Regras de Ouro)
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS parent_id   UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dre_group   TEXT CHECK (dre_group IN (
    'RECEITA_BRUTA', 'DEDUCOES', 'CUSTO_OBRA', 'CUSTO_SERVICO',
    'DESPESA_ADM', 'DESPESA_COMERCIAL', 'FINANCEIRO',
    'IMPOSTOS', 'NAO_OPERACIONAL', 'SEM_CLASSIFICACAO'
  )),
  ADD COLUMN IF NOT EXISTS nature      TEXT CHECK (nature IN ('REVENUE', 'COST', 'EXPENSE')),
  ADD COLUMN IF NOT EXISTS sort_order  INT NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_financial_categories_parent
  ON public.financial_categories(parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_categories_dre_group
  ON public.financial_categories(dre_group)
  WHERE dre_group IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. SEED — Plano de Contas Padrão Construção Civil
--    (Apenas insere se não existir; preserva dados do cliente)
-- ────────────────────────────────────────────────────────────

INSERT INTO public.financial_categories (name, dre_group, nature, sort_order) VALUES
  -- Receitas
  ('Receita de Obra',              'RECEITA_BRUTA',      'REVENUE', 10),
  ('Receita de Serviços',          'RECEITA_BRUTA',      'REVENUE', 11),
  ('Receita de Locação',           'RECEITA_BRUTA',      'REVENUE', 12),
  ('Receita de Venda de Imóvel',   'RECEITA_BRUTA',      'REVENUE', 13),
  ('Outras Receitas',              'RECEITA_BRUTA',      'REVENUE', 19),
  -- Deduções
  ('Impostos s/ Receita (ISS/PIS/COFINS)', 'DEDUCOES',  'REVENUE', 20),
  ('Devoluções e Descontos',       'DEDUCOES',           'REVENUE', 21),
  -- Custos diretos
  ('Material de Construção',       'CUSTO_OBRA',         'COST',    30),
  ('Mão de Obra Direta',           'CUSTO_OBRA',         'COST',    31),
  ('Empreiteiros',                 'CUSTO_OBRA',         'COST',    32),
  ('Equipamentos e Locações',      'CUSTO_OBRA',         'COST',    33),
  ('Projetos e Consultoria Técnica','CUSTO_OBRA',        'COST',    34),
  ('Custos de Serviços Prestados', 'CUSTO_SERVICO',      'COST',    35),
  -- Despesas administrativas
  ('Pessoal e Folha',              'DESPESA_ADM',        'EXPENSE', 40),
  ('Encargos Sociais',             'DESPESA_ADM',        'EXPENSE', 41),
  ('Aluguel e Instalações',        'DESPESA_ADM',        'EXPENSE', 42),
  ('Software e TI',                'DESPESA_ADM',        'EXPENSE', 43),
  ('Despesas Gerais Administrativas','DESPESA_ADM',      'EXPENSE', 44),
  -- Despesas comerciais
  ('Comissões de Venda',           'DESPESA_COMERCIAL',  'EXPENSE', 50),
  ('Marketing e Publicidade',      'DESPESA_COMERCIAL',  'EXPENSE', 51),
  ('Eventos e Stands',             'DESPESA_COMERCIAL',  'EXPENSE', 52),
  -- Financeiro
  ('Juros e Taxas Bancárias',      'FINANCEIRO',         'EXPENSE', 60),
  ('Receita Financeira',           'FINANCEIRO',         'REVENUE', 61),
  ('Variação Cambial',             'FINANCEIRO',         'EXPENSE', 62),
  -- Impostos sobre resultado
  ('IRPJ / CSLL',                  'IMPOSTOS',           'EXPENSE', 70),
  -- Não operacional
  ('Venda de Ativos',              'NAO_OPERACIONAL',    'REVENUE', 80),
  ('Multas e Indenizações',        'NAO_OPERACIONAL',    'EXPENSE', 81),
  -- Não classificado
  ('Outros',                       'SEM_CLASSIFICACAO',  'EXPENSE', 99)
ON CONFLICT (name) DO UPDATE SET
  dre_group  = EXCLUDED.dre_group,
  nature     = EXCLUDED.nature,
  sort_order = EXCLUDED.sort_order;

-- ────────────────────────────────────────────────────────────
-- 3. BACKFILL — mapear categorias livres existentes para dre_group
--    (categorias não mapeadas ficam em SEM_CLASSIFICACAO)
-- ────────────────────────────────────────────────────────────

UPDATE public.financial_categories
  SET dre_group = 'SEM_CLASSIFICACAO', nature = 'EXPENSE', sort_order = 99
WHERE dre_group IS NULL;

-- ────────────────────────────────────────────────────────────
-- 4. ADICIONAR category_id em internal_transactions
--    (FK para financial_categories — backfill opcional)
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_txs_category
  ON public.internal_transactions(category_id)
  WHERE category_id IS NOT NULL;

-- Backfill: tenta linkar pelo nome da categoria existente em `category` (TEXT)
UPDATE public.internal_transactions it
SET category_id = fc.id
FROM public.financial_categories fc
WHERE it.category_id IS NULL
  AND it.category IS NOT NULL
  AND fc.name = it.category;

-- ────────────────────────────────────────────────────────────
-- 5. fn_dre — DRE por período
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_dre(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_empresa_id      UUID DEFAULT NULL    -- filtro opcional por empresa (companies)
)
RETURNS TABLE (
  dre_group         TEXT,
  nature            TEXT,
  sort_order        INT,
  category_name     TEXT,
  total_credit      NUMERIC,
  total_debit       NUMERIC,
  net               NUMERIC,    -- CREDIT - DEBIT (positivo = favorável)
  pending_credit    NUMERIC,
  pending_debit     NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')     AS dre_group,
    COALESCE(fc.nature, 'EXPENSE')                   AS nature,
    COALESCE(fc.sort_order, 99)                      AS sort_order,
    COALESCE(fc.name, it.category, 'Sem categoria')  AS category_name,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0) AS total_credit,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0) AS total_debit,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount
                      WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount ELSE 0 END), 0) AS net,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS pending_credit,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS pending_debit
  FROM public.internal_transactions it
  LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
  WHERE
    it.organization_id = p_organization_id
    AND it.transaction_date BETWEEN p_date_from AND p_date_to
    AND it.status <> 'CANCELLED'
    -- filtro de empresa: via source_system='PROJECT' + project.empresa_id (join opcional)
    -- simplificado: empresa_id NULL = todos
  GROUP BY 1, 2, 3, 4
  ORDER BY 3, 4;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. fn_dre_summary — Linhas mestre do DRE (para card executivo)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_dre_summary(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE
)
RETURNS TABLE (
  linha           TEXT,
  valor_realizado NUMERIC,
  valor_previsto  NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO') AS dre_group,
      COALESCE(fc.nature, 'EXPENSE')               AS nature,
      it.direction,
      it.status,
      it.amount
    FROM public.internal_transactions it
    LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
    WHERE it.organization_id = p_organization_id
      AND it.transaction_date BETWEEN p_date_from AND p_date_to
      AND it.status <> 'CANCELLED'
  ),
  agg AS (
    SELECT
      dre_group,
      SUM(CASE WHEN direction='CREDIT' AND status='CONCILIATED' THEN  amount
               WHEN direction='DEBIT'  AND status='CONCILIATED' THEN -amount ELSE 0 END) AS realizado,
      SUM(CASE WHEN direction='CREDIT' AND status='PENDING' THEN  amount
               WHEN direction='DEBIT'  AND status='PENDING' THEN -amount ELSE 0 END) AS previsto
    FROM base GROUP BY dre_group
  )
  SELECT 'Receita Bruta'           AS linha,
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA'       THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA'       THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Deduções',
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES'            THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES'            THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '= Receita Líquida',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Custos Diretos',
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '= Lucro Bruto',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO')
                      THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO')
                      THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Despesas Operacionais',
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '= EBITDA',
    COALESCE(SUM(CASE WHEN dre_group IN (
      'RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL'
    ) THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN (
      'RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL'
    ) THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Resultado Financeiro',
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Impostos sobre Resultado',
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '= Resultado Líquido',
    COALESCE(SUM(realizado),0),
    COALESCE(SUM(previsto),0)
  FROM agg;
$$;

-- ────────────────────────────────────────────────────────────
-- 7. fn_cash_flow — Fluxo de Caixa por período
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cash_flow(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_granularity     TEXT DEFAULT 'month'   -- 'day' | 'week' | 'month'
)
RETURNS TABLE (
  period_start    DATE,
  period_label    TEXT,
  credit_real     NUMERIC,   -- entradas conciliadas
  debit_real      NUMERIC,   -- saídas conciliadas
  saldo_real      NUMERIC,   -- crédito - débito (conciliado)
  credit_prev     NUMERIC,   -- entradas previstas (pending)
  debit_prev      NUMERIC,
  saldo_prev      NUMERIC,
  saldo_acumulado NUMERIC    -- acumulado realizado até este período
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH periods AS (
    SELECT
      generate_series(
        date_trunc(p_granularity, p_date_from::TIMESTAMPTZ),
        date_trunc(p_granularity, p_date_to::TIMESTAMPTZ),
        ('1 ' || p_granularity)::INTERVAL
      )::DATE AS period_start
  ),
  txs AS (
    SELECT
      date_trunc(p_granularity, transaction_date::TIMESTAMPTZ)::DATE AS period_start,
      direction,
      status,
      amount
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND transaction_date BETWEEN p_date_from AND p_date_to
      AND status <> 'CANCELLED'
  ),
  agg AS (
    SELECT
      p.period_start,
      COALESCE(SUM(CASE WHEN t.direction='CREDIT' AND t.status='CONCILIATED' THEN t.amount ELSE 0 END),0) AS cr,
      COALESCE(SUM(CASE WHEN t.direction='DEBIT'  AND t.status='CONCILIATED' THEN t.amount ELSE 0 END),0) AS dr,
      COALESCE(SUM(CASE WHEN t.direction='CREDIT' AND t.status='PENDING'     THEN t.amount ELSE 0 END),0) AS cp,
      COALESCE(SUM(CASE WHEN t.direction='DEBIT'  AND t.status='PENDING'     THEN t.amount ELSE 0 END),0) AS dp
    FROM periods p
    LEFT JOIN txs t ON t.period_start = p.period_start
    GROUP BY p.period_start
  )
  SELECT
    a.period_start,
    TO_CHAR(a.period_start, CASE p_granularity
      WHEN 'day'   THEN 'DD/MM/YYYY'
      WHEN 'week'  THEN 'WW/YYYY'
      ELSE              'MM/YYYY'
    END)                                              AS period_label,
    a.cr                                              AS credit_real,
    a.dr                                              AS debit_real,
    a.cr - a.dr                                       AS saldo_real,
    a.cp                                              AS credit_prev,
    a.dp                                              AS debit_prev,
    a.cp - a.dp                                       AS saldo_prev,
    SUM(a.cr - a.dr) OVER (ORDER BY a.period_start)  AS saldo_acumulado
  FROM agg a
  ORDER BY a.period_start;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20260708000001_dre_cashflow_structure.sql
-- ────────────────────────────────────────────────────────────
