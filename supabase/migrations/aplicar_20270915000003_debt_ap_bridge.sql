-- ==========================================================================
-- Gestão de Dívidas · Ponte com o Contas a Pagar + correção da DRE
-- Date: 2026-08-29
-- Tabelas novas: debt_component_accounts, debt_events
-- Funções alteradas: fn_dre_summary, fn_dre_spe_summary, fn_dre_projects_summary
-- Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
-- ==========================================================================
-- CONTEXTO
-- Decisão do usuário (2026-08-29): a parcela de financiamento chega ao Contas
-- a Pagar **decomposta**, uma linha por componente, cada uma com sua categoria
-- do plano de contas — e não como um título único.
--
-- 🔴 ESSA DECISÃO TEM UM EFEITO COLATERAL QUE ESTA MIGRATION CORRIGE.
--
-- `fn_dre_summary` calcula `= Resultado Líquido` como "tudo que não é
-- SEM_CLASSIFICACAO" (20270128000000, linhas 222-224). `financial_categories`
-- aceita `dre_group='PASSIVO'`/`'ATIVO'` desde a 20260628000004, mas NENHUMA
-- das funções de DRE foi atualizada para excluí-los — simplesmente não havia
-- lançamento de passivo no razão até agora.
--
-- Amortização de principal NÃO é despesa: é redução de passivo. Sem esta
-- correção, pagar uma parcela de R$ 10.000 (R$ 8.000 de principal + R$ 2.000
-- de juros) derrubaria o Resultado Líquido em R$ 10.000 em vez de R$ 2.000, e
-- o EBITDA da SPE junto. Três funções erravam, cada uma do seu jeito:
--
--   fn_dre_summary          `= Resultado Líquido`  → excluía só SEM_CLASSIFICACAO
--   fn_dre_spe_summary      `ebitda`               → NOT IN sem PASSIVO/ATIVO,
--                                                     então o principal entrava
--                                                     DENTRO do EBITDA
--                           `resultado_liquido`    → mesmo defeito do summary
--   fn_dre_projects_summary `margem`               → somava todo CREDIT−DEBIT
--
-- `custo` de fn_dre_projects_summary já estava certo por acidente feliz: filtra
-- por `nature IN ('COST','EXPENSE')`, e a categoria de amortização nasce
-- `nature='LIABILITY'`.
--
-- O que NÃO muda, de propósito:
--   · `fn_cash_flow` — amortização É saída de caixa, tem de aparecer;
--   · `fn_balancete` — balancete mostra movimento de passivo por definição;
--   · `fn_dre` — devolve linhas por grupo; quem agrega é a tela.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'debt_contracts') THEN
        RAISE EXCEPTION 'ABORTADO: debt_contracts nao existe (rode aplicar_20270915000001 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'financial_categories_dre_group_check') THEN
        RAISE EXCEPTION 'ABORTADO: financial_categories sem dre_group (rode 20260628000004 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'fn_dre_summary') THEN
        RAISE EXCEPTION 'ABORTADO: fn_dre_summary nao existe (rode 20270128000000 antes).';
    END IF;
END $$;

-- ==========================================================================
-- 1. Categorias financeiras dos componentes da parcela
-- ==========================================================================
-- `financial_categories` é GLOBAL desde a 20260701000001: `organization_id` é
-- nullable, o UNIQUE é por `name` no sistema inteiro, e a policy de leitura é
-- `USING (true)` para authenticated. Então uma linha por componente basta —
-- criar uma por organização violaria o UNIQUE na segunda org.

INSERT INTO public.financial_categories (organization_id, name, dre_group, nature, sort_order)
VALUES
    -- 🔴 A única com dre_group='PASSIVO': redução de dívida, não despesa.
    (NULL, 'Amortização de Principal',                 'PASSIVO',    'LIABILITY', 90),
    (NULL, 'Juros sobre Empréstimos e Financiamentos', 'FINANCEIRO', 'EXPENSE',   91),
    (NULL, 'Correção Monetária de Dívida',             'FINANCEIRO', 'EXPENSE',   92),
    (NULL, 'IOF sobre Operações de Crédito',           'FINANCEIRO', 'EXPENSE',   93),
    (NULL, 'Seguros de Operação de Crédito',           'FINANCEIRO', 'EXPENSE',   94),
    (NULL, 'Tarifas Bancárias de Crédito',             'FINANCEIRO', 'EXPENSE',   95),
    (NULL, 'Multa e Juros de Mora',                    'FINANCEIRO', 'EXPENSE',   96)
ON CONFLICT (name) DO NOTHING;

-- ==========================================================================
-- 2. debt_component_accounts — o de-para componente → conta
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_component_accounts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL = padrão do sistema. Linha com organização sobrepõe o padrão, no
    -- mesmo modelo de `contract_index_values` (org NULL = série global).
    organization_id     uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    component           text NOT NULL CHECK (component IN (
        'AMORT', 'JUROS', 'CORRECAO', 'IOF', 'SEGURO', 'TARIFA', 'MORA'
    )),
    category_id         uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    plano_de_contas_id  uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.debt_component_accounts IS
    'De-para componente da parcela -> categoria financeira e plano de contas. '
    'Linha com organization_id NULL e o padrao do sistema; linha com org '
    'sobrepoe. E o que permite a decomposicao da parcela em N titulos no '
    'Contas a Pagar sem cada organizacao ter de reclassificar tudo a mao.';
COMMENT ON COLUMN public.debt_component_accounts.plano_de_contas_id IS
    'FK logica para plano_de_contas (sem constraint: o padrao do sistema, com '
    'organization_id NULL, nao tem plano de contas de organizacao nenhuma).';

-- Um componente não pode ter duas contas na mesma organização — seriam dois
-- destinos para a mesma linha, e qual valeria dependeria da ordem da consulta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_component_accounts_org
    ON public.debt_component_accounts (organization_id, component)
    WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_component_accounts_default
    ON public.debt_component_accounts (component)
    WHERE organization_id IS NULL;

-- Seed do padrão do sistema, ligado às categorias do bloco 1.
INSERT INTO public.debt_component_accounts (organization_id, component, category_id)
SELECT NULL, v.component, fc.id
  FROM (VALUES
        ('AMORT',    'Amortização de Principal'),
        ('JUROS',    'Juros sobre Empréstimos e Financiamentos'),
        ('CORRECAO', 'Correção Monetária de Dívida'),
        ('IOF',      'IOF sobre Operações de Crédito'),
        ('SEGURO',   'Seguros de Operação de Crédito'),
        ('TARIFA',   'Tarifas Bancárias de Crédito'),
        ('MORA',     'Multa e Juros de Mora')
       ) AS v(component, nome)
  JOIN public.financial_categories fc ON fc.name = v.nome
 WHERE NOT EXISTS (
        SELECT 1 FROM public.debt_component_accounts d
         WHERE d.organization_id IS NULL AND d.component = v.component);

ALTER TABLE public.debt_component_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS debt_component_accounts_read ON public.debt_component_accounts;
CREATE POLICY debt_component_accounts_read
    ON public.debt_component_accounts FOR SELECT TO authenticated
    -- O padrão do sistema (org NULL) é legível por todos, como as categorias
    -- que ele aponta. Já a sobreposição é da organização e só dela.
    USING (organization_id IS NULL OR public.is_org_member(organization_id));

DROP POLICY IF EXISTS debt_component_accounts_write ON public.debt_component_accounts;
CREATE POLICY debt_component_accounts_write
    ON public.debt_component_accounts FOR ALL TO authenticated
    -- Escrita só na própria organização: ninguém reescreve o padrão do sistema
    -- pela API e muda a classificação contábil de todos os clientes do SaaS.
    USING      (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));

REVOKE ALL ON public.debt_component_accounts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_component_accounts TO authenticated;

-- ==========================================================================
-- 3. debt_events — a terceira camada do PRD item 4 (o que de fato aconteceu)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    debt_contract_id    uuid NOT NULL REFERENCES public.debt_contracts(id) ON DELETE CASCADE,
    -- ON DELETE SET NULL: renegociar troca o cronograma, e o evento que
    -- registra a renegociação não pode sumir junto com a versão substituída.
    debt_installment_id uuid REFERENCES public.debt_installments(id) ON DELETE SET NULL,
    event_type          text NOT NULL CHECK (event_type IN (
        'PAGAMENTO', 'PAGAMENTO_PARCIAL', 'AMORTIZACAO_EXTRAORDINARIA',
        'ANTECIPACAO', 'RENEGOCIACAO', 'RECLASSIFICACAO_ENCARGO',
        'DIVERGENCIA_BANCARIA', 'LIBERACAO', 'LIQUIDACAO'
    )),
    event_date          date NOT NULL,
    amount              numeric(15,2) NOT NULL DEFAULT 0,
    payload             jsonb,
    notes               text,
    created_by          uuid,
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.debt_events IS
    'Movimentacoes efetivamente realizadas — a 3a camada do PRD (contratual / '
    'vigente / realizado). Nunca reescrita: cada fato e uma linha nova, e e ela '
    'que sustenta o "comparativo entre proposta e execucao real".';

CREATE INDEX IF NOT EXISTS idx_debt_events_contrato
    ON public.debt_events (debt_contract_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_debt_events_parcela
    ON public.debt_events (debt_installment_id) WHERE debt_installment_id IS NOT NULL;

ALTER TABLE public.debt_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS debt_events_org_all ON public.debt_events;
CREATE POLICY debt_events_org_all
    ON public.debt_events FOR ALL TO authenticated
    USING      (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.debt_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_events TO authenticated;

-- ==========================================================================
-- 3.b. Espelho do mútuo intercompany — qual perna é qual
-- ==========================================================================
-- A `aplicar_20270915000001` criou `mirror_debt_contract_id`, que liga as duas
-- pernas. Falta dizer QUAL delas é o passivo.
--
-- Investigação de 2026-08-29 (o plano mandava conferir antes de implementar):
-- **não existe gancho de eliminação no sistema.**
--   · `vw_intercompany_transactions` (20260705000001) lista apenas PEDIDOS DE
--     COMPRA entre empresas do grupo, via `suppliers.empresa_vinculada_id`.
--     Não toca `internal_transactions` e não elimina nada — é listagem.
--   · `vw_company_consolidated` é roll-up de contagens e receita contratada por
--     `empresa_consolidadora_id`. Também não elimina.
-- Sem um discriminador, consolidar o grupo somaria o mútuo duas vezes: uma como
-- dívida da devedora, outra como crédito da credora.
--
-- A coluna entra AQUI, e não na ...000001, de propósito: se aquela migration já
-- tiver sido aplicada, alterá-la seria mentir sobre o que rodou.

ALTER TABLE public.debt_contracts
    ADD COLUMN IF NOT EXISTS mirror_role text;

DO $$ BEGIN
    ALTER TABLE public.debt_contracts
        ADD CONSTRAINT debt_contracts_mirror_role_chk
        CHECK (mirror_role IS NULL OR mirror_role IN ('DEVEDORA', 'CREDORA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.debt_contracts.mirror_role IS
    'So para mutuo intercompany. DEVEDORA = a perna que deve (passivo, gera '
    'DEBIT no razao); CREDORA = a perna que tem a receber (ativo, gera CREDIT). '
    'NULL em contrato normal. Na consolidacao do grupo, descartar a perna '
    'CREDORA elimina a duplicidade — nenhuma view do sistema fazia isso.';

-- Só a perna DEVEDORA vira dívida na posição consolidada. O índice existe para
-- o filtro dessa consulta não varrer a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_debt_contracts_mirror_role
    ON public.debt_contracts (organization_id, mirror_role)
    WHERE mirror_role IS NOT NULL;

-- ==========================================================================
-- 4. fn_dre_summary — PASSIVO/ATIVO fora do Resultado Líquido
-- ==========================================================================
-- Assinatura e colunas de retorno INALTERADAS. Muda só o corpo:
--   · `= Resultado Líquido` passa a excluir PASSIVO e ATIVO;
--   · entra a linha memo `(o) Amortização de Principal`, para o número não
--     sumir da tela — ele importa, só não é resultado.

CREATE OR REPLACE FUNCTION public.fn_dre_summary(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_project_id      UUID DEFAULT NULL,
  p_regime          TEXT DEFAULT 'CAIXA'
)
RETURNS TABLE (
  linha           TEXT,
  valor_realizado NUMERIC,
  valor_previsto  NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
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

  RETURN QUERY
  WITH base AS (
    SELECT
      COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO') AS dre_group,
      it.direction,
      it.status,
      it.amount
    FROM public.internal_transactions it
    LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
    WHERE it.organization_id = ANY(v_targets)
      AND (
        CASE WHEN p_regime = 'COMPETENCIA'
             THEN COALESCE(it.competencia_date, it.transaction_date::date)
             ELSE it.transaction_date::date
        END
      ) BETWEEN p_date_from AND p_date_to
      AND it.status <> 'CANCELLED'
      AND (p_project_id IS NULL OR it.project_id = p_project_id)
  ),
  agg AS (
    SELECT
      dre_group,
      CASE WHEN p_regime = 'COMPETENCIA' THEN
        SUM(CASE WHEN direction='CREDIT' THEN  amount
                 WHEN direction='DEBIT'  THEN -amount ELSE 0 END)
      ELSE
        SUM(CASE WHEN direction='CREDIT' AND status='CONCILIATED' THEN  amount
                 WHEN direction='DEBIT'  AND status='CONCILIATED' THEN -amount ELSE 0 END)
      END AS realizado,
      SUM(CASE WHEN direction='CREDIT' AND status='PENDING' THEN  amount
               WHEN direction='DEBIT'  AND status='PENDING' THEN -amount ELSE 0 END) AS previsto
    FROM base GROUP BY dre_group
  )
  SELECT 'Receita Bruta' AS linha,
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA' THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Deduções',
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '= Receita Líquida',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Custos Diretos',
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '= Lucro Bruto',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Despesas Operacionais',
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '= EBITDA',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Resultado Financeiro',
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Impostos sobre Resultado',
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(+/-) Resultado Não Operacional',
    COALESCE(SUM(CASE WHEN dre_group='NAO_OPERACIONAL' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='NAO_OPERACIONAL' THEN previsto  ELSE 0 END),0)
  FROM agg
  -- 🔴 AQUI: PASSIVO e ATIVO fora. Amortização de principal reduz dívida, não
  -- resultado. Antes, uma parcela de financiamento derrubava o lucro pelo
  -- valor cheio da parcela.
  UNION ALL SELECT '= Resultado Líquido',
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO') THEN previsto  ELSE 0 END),0)
  FROM agg
  -- Linha memo: sai do resultado, mas não some da tela. É saída de caixa real
  -- e quem lê a DRE precisa vê-la para conciliar com o fluxo.
  UNION ALL SELECT '(o) Amortização de Principal',
    COALESCE(SUM(CASE WHEN dre_group IN ('PASSIVO','ATIVO') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('PASSIVO','ATIVO') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(!) Sem Classificação',
    COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN previsto  ELSE 0 END),0)
  FROM agg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre_summary(UUID, DATE, DATE, UUID, TEXT) TO authenticated;

-- ==========================================================================
-- 5. fn_dre_spe_summary — PASSIVO/ATIVO fora do EBITDA e do Resultado
-- ==========================================================================
-- Aqui o defeito era pior que no summary: o `NOT IN` do EBITDA listava só
-- FINANCEIRO/IMPOSTOS/NAO_OPERACIONAL/SEM_CLASSIFICACAO, então a amortização
-- de principal entrava DENTRO do EBITDA — o indicador que existe justamente
-- para medir resultado ANTES de qualquer efeito de dívida.

CREATE OR REPLACE FUNCTION public.fn_dre_spe_summary(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_regime          TEXT DEFAULT 'CAIXA'
)
RETURNS TABLE (
  empresa_id             UUID,
  empresa_nome           TEXT,
  receita_bruta          NUMERIC,
  deducoes               NUMERIC,
  receita_liquida        NUMERIC,
  custos_diretos         NUMERIC,
  lucro_bruto            NUMERIC,
  despesas_operacionais  NUMERIC,
  ebitda                 NUMERIC,
  resultado_financeiro   NUMERIC,
  impostos               NUMERIC,
  resultado_liquido      NUMERIC,
  n_transacoes           BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
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

  RETURN QUERY
  WITH txs AS (
    SELECT
      p.empresa_id,
      COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO') AS dre_group,
      it.direction,
      it.status,
      it.amount
    FROM public.internal_transactions it
    LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
    JOIN public.projects p ON p.id = it.project_id
    WHERE it.organization_id = ANY(v_targets)
      AND p.empresa_id IS NOT NULL
      AND it.status <> 'CANCELLED'
      AND (
        CASE WHEN p_regime = 'COMPETENCIA'
             THEN COALESCE(it.competencia_date, it.transaction_date::date)
             ELSE it.transaction_date::date
        END
      ) BETWEEN p_date_from AND p_date_to
  ),
  agg AS (
    SELECT
      empresa_id,
      dre_group,
      CASE WHEN p_regime = 'COMPETENCIA' THEN
        SUM(CASE WHEN direction='CREDIT' THEN  amount WHEN direction='DEBIT' THEN -amount ELSE 0 END)
      ELSE
        SUM(CASE WHEN direction='CREDIT' AND status='CONCILIATED' THEN  amount
                 WHEN direction='DEBIT'  AND status='CONCILIATED' THEN -amount ELSE 0 END)
      END AS net,
      COUNT(*) AS n
    FROM txs
    GROUP BY empresa_id, dre_group
  )
  SELECT
    a.empresa_id,
    COALESCE(c.nome_fantasia, c.razao_social, a.empresa_id::text) AS empresa_nome,
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA'       THEN net  ELSE 0 END),0) AS receita_bruta,
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES'            THEN -net ELSE 0 END),0) AS deducoes,
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES')
                      THEN net ELSE 0 END),0) AS receita_liquida,
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -net ELSE 0 END),0) AS custos_diretos,
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO')
                      THEN net ELSE 0 END),0) AS lucro_bruto,
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -net ELSE 0 END),0) AS despesas_operacionais,
    -- 🔴 PASSIVO/ATIVO entram no NOT IN: amortização de principal não é item
    -- operacional e não pode inflar (nem deprimir) o EBITDA.
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('FINANCEIRO','IMPOSTOS','NAO_OPERACIONAL','SEM_CLASSIFICACAO','PASSIVO','ATIVO')
                      THEN net ELSE 0 END),0) AS ebitda,
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO'      THEN -net ELSE 0 END),0) AS resultado_financeiro,
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS'        THEN -net ELSE 0 END),0) AS impostos,
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO') THEN net ELSE 0 END),0) AS resultado_liquido,
    SUM(a.n) AS n_transacoes
  FROM agg a
  LEFT JOIN public.companies c ON c.id = a.empresa_id
  GROUP BY a.empresa_id, c.nome_fantasia, c.razao_social
  ORDER BY receita_bruta DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre_spe_summary(UUID, DATE, DATE, TEXT) TO authenticated;

-- ==========================================================================
-- 6. fn_dre_projects_summary — margem da obra sem a amortização
-- ==========================================================================
-- `custo` já estava certo (filtra `nature IN ('COST','EXPENSE')`, e a categoria
-- de amortização é `LIABILITY`). `margem` somava todo CREDIT−DEBIT conciliado,
-- então a parcela de um financiamento alocado à obra derrubaria a margem dela
-- pelo principal — o dinheiro que a obra recebeu de volta como caixa.

CREATE OR REPLACE FUNCTION public.fn_dre_projects_summary(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE
)
RETURNS TABLE (
  project_id      UUID,
  project_name    TEXT,
  receita         NUMERIC,
  custo           NUMERIC,
  margem          NUMERIC,
  receita_prev    NUMERIC,
  custo_prev      NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
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

  RETURN QUERY
  SELECT
    p.id, p.name,
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0) AS receita,
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0) AS custo,
    -- 🔴 Movimento patrimonial fora da margem: a amortização não é custo da
    -- obra, e a liberação do financiamento não é receita dela.
    COALESCE(SUM(CASE WHEN it.status = 'CONCILIATED'
                       AND COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') NOT IN ('PASSIVO','ATIVO')
                      THEN CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END
                      ELSE 0 END), 0) AS margem,
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS receita_prev,
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS custo_prev
  FROM public.projects p
  JOIN public.internal_transactions it ON it.project_id = p.id
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id
    OR (it.category_id IS NULL
        AND fc.organization_id = it.organization_id
        AND lower(fc.name) = lower(it.category))
  WHERE it.organization_id = ANY(v_targets)
    AND it.transaction_date BETWEEN p_date_from AND p_date_to
    AND it.status <> 'CANCELLED'
    AND p.name <> 'Gestão Comercial'
    AND COALESCE(p.settings->>'classification', 'OBRA') NOT IN ('ORCAMENTO','PLANEJAMENTO','DIARIO')
  GROUP BY p.id, p.name
  HAVING SUM(it.amount) <> 0
  ORDER BY receita DESC, custo DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre_projects_summary(UUID, DATE, DATE) TO authenticated;

-- ==========================================================================
-- 7. Conferência
-- ==========================================================================
-- 7.a. As 7 categorias existem, e SÓ a de amortização é PASSIVO:
-- SELECT name, dre_group, nature FROM public.financial_categories
--  WHERE name IN ('Amortização de Principal','Juros sobre Empréstimos e Financiamentos',
--                 'Correção Monetária de Dívida','IOF sobre Operações de Crédito',
--                 'Seguros de Operação de Crédito','Tarifas Bancárias de Crédito',
--                 'Multa e Juros de Mora')
--  ORDER BY sort_order;
--    -> esperado: 7 linhas; 'Amortização de Principal' = PASSIVO/LIABILITY,
--       as outras 6 = FINANCEIRO/EXPENSE
--
-- 7.b. O de-para padrão está completo e ligado:
-- SELECT d.component, fc.name FROM public.debt_component_accounts d
--   LEFT JOIN public.financial_categories fc ON fc.id = d.category_id
--  WHERE d.organization_id IS NULL ORDER BY d.component;
--    -> esperado: 7 linhas, nenhuma com fc.name NULL
--
-- 7.c. RLS ligada nas duas tabelas novas:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('debt_component_accounts','debt_events');
--    -> esperado: t nas duas
--
-- 7.d. anon não lê (rodar com a anon key, FORA do SQL Editor):
--   GET /rest/v1/debt_events?select=id  -> [] ou 401, nunca dados
--
-- 7.e. 🔴 A CORREÇÃO DA DRE — a conferência que importa.
--   Rodar ANTES de gerar qualquer parcela de dívida e guardar o número:
-- SELECT linha, valor_realizado FROM public.fn_dre_summary(
--   '<org>', date_trunc('year', now())::date, now()::date, NULL, 'CAIXA')
--  WHERE linha IN ('= Resultado Líquido','= EBITDA','(o) Amortização de Principal');
--   Depois de lançar uma parcela decomposta e conciliá-la, rodar de novo:
--    -> '= Resultado Líquido' cai SÓ pelos componentes de encargo
--       (juros + correção + IOF + seguro + tarifa), NUNCA pela amortização;
--    -> '(o) Amortização de Principal' mostra o principal pago;
--    -> '= EBITDA' não se move (nenhum componente é operacional).
--
-- 7.e2. O espelho do mútuo não conta duas vezes:
-- SELECT mirror_role, COUNT(*), SUM(principal_released)
--   FROM public.debt_contracts
--  WHERE mirror_debt_contract_id IS NOT NULL GROUP BY 1;
--    -> esperado: DEVEDORA e CREDORA com a MESMA contagem e o MESMO total.
--       A posição consolidada do grupo soma só a perna DEVEDORA.
-- Toda perna espelhada tem par, e o par aponta de volta:
-- SELECT a.id FROM public.debt_contracts a
--   LEFT JOIN public.debt_contracts b ON b.id = a.mirror_debt_contract_id
--  WHERE a.mirror_debt_contract_id IS NOT NULL
--    AND (b.id IS NULL OR b.mirror_debt_contract_id IS DISTINCT FROM a.id);
--    -> esperado: vazio (nenhum espelho órfão ou meio ligado)
--
-- 7.f. Nenhuma outra função de DRE ficou para trás:
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname LIKE 'fn_dre%'
--    AND pg_get_functiondef(p.oid) LIKE '%SEM_CLASSIFICACAO%'
--    AND pg_get_functiondef(p.oid) NOT LIKE '%PASSIVO%';
--    -> esperado: vazio (fn_dre não entra: devolve linhas por grupo, quem
--       agrega é a tela)
-- ==========================================================================
-- FIM: aplicar_20270915000003_debt_ap_bridge.sql
-- ==========================================================================
