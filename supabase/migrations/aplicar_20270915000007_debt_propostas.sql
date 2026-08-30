-- ==========================================================================
-- Gestão de Dívidas · MVP 2 F2a — Propostas e comparação
-- Date: 2026-08-30
-- Altera: debt_contracts (+3 colunas), vw_debt_open_installments
-- Cria: fn_debt_proposal_comparison
-- Plano: docs/planos/2026-08-30-dividas-mvp2-simulador.md
-- ==========================================================================
-- CONTEXTO
-- Decisão do usuário (2026-08-30): a proposta de banco **é** um contrato ainda
-- não assinado — vive em `debt_contracts` com `status='EM_NEGOCIACAO'`, e não
-- numa tabela `debt_proposals` paralela. Ganha cronograma, CET e comparação de
-- graça, e "aceitar" é troca de status, sem redigitação e sem o risco de a
-- proposta aceita divergir do contrato assinado.
--
-- 🔴 O QUE ESSA DECISÃO QUEBRA — e esta migration conserta:
-- `vw_debt_open_installments` (aplicar_20270915000004) filtra
--     c.status NOT IN ('LIQUIDADO','CANCELADO')
-- ou seja, **EM_NEGOCIACAO conta como dívida**. Uma proposta com cronograma
-- gerado inflaria "Dívida total", "Serviço 12 meses" e o custo médio — o banco
-- que você ainda está cotando apareceria como dinheiro que você já deve.
-- Achado ao conferir a view ANTES de escrever a tela, não depois.
--
-- Como as propostas concorrentes se agrupam: `proposal_group`. Todas as
-- propostas para a MESMA necessidade compartilham o uuid; é o que permite
-- comparar lado a lado e, ao aceitar uma, cancelar as irmãs.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.views
                    WHERE table_schema = 'public' AND table_name = 'vw_debt_open_installments') THEN
        RAISE EXCEPTION 'ABORTADO: vw_debt_open_installments nao existe (rode aplicar_20270915000004 antes).';
    END IF;
END $$;

-- ==========================================================================
-- 1. Colunas de proposta
-- ==========================================================================

ALTER TABLE public.debt_contracts
    ADD COLUMN IF NOT EXISTS proposal_group  uuid,
    ADD COLUMN IF NOT EXISTS decided_at      date,
    ADD COLUMN IF NOT EXISTS decision_notes  text;

COMMENT ON COLUMN public.debt_contracts.proposal_group IS
    'Agrupa propostas CONCORRENTES para a mesma necessidade de credito. NULL '
    'em contrato que nao veio de cotacao. Aceitar uma proposta do grupo cancela '
    'as irmas.';
COMMENT ON COLUMN public.debt_contracts.decided_at IS
    'Data em que a proposta foi aceita ou recusada. Com decision_notes, e o '
    'registro de POR QUE o banco escolhido venceu — o PRD pede que a decisao '
    'nao seja so a menor taxa.';

CREATE INDEX IF NOT EXISTS idx_debt_contracts_proposal_group
    ON public.debt_contracts (proposal_group)
    WHERE proposal_group IS NOT NULL;

-- ==========================================================================
-- 2. 🔴 Proposta NÃO é dívida — tirar EM_NEGOCIACAO dos indicadores
-- ==========================================================================
-- Mesma lista de colunas e mesma ordem da versão de aplicar_20270915000004;
-- muda só o filtro de status.

CREATE OR REPLACE VIEW public.vw_debt_open_installments
WITH (security_invoker = on) AS
SELECT
    i.id                        AS installment_id,
    c.id                        AS debt_contract_id,
    c.organization_id,
    c.company_id,
    c.institution_supplier_id,
    c.modality,
    c.status                    AS contract_status,
    c.rate_type,
    c.index_name,
    c.nominal_rate,
    c.rate_period,
    c.final_due_date,
    i.seq,
    i.due_date,
    i.status                    AS installment_status,
    i.amortization,
    i.interest,
    i.monetary_correction,
    i.iof,
    i.insurance,
    i.fees,
    i.total,
    i.closing_balance,
    CASE WHEN c.rate_period = 'ANUAL'
         THEN (power(1 + c.nominal_rate / 100.0, 1.0 / 12.0) - 1) * 100
         ELSE c.nominal_rate
    END                         AS taxa_mensal_pct
FROM public.debt_installments i
JOIN public.debt_schedules   s ON s.id = i.debt_schedule_id
                              AND s.kind = 'VIGENTE'
                              AND s.is_active
JOIN public.debt_contracts   c ON c.id = s.debt_contract_id
WHERE i.status NOT IN ('PAGA', 'CANCELADA')
  -- EM_NEGOCIACAO entrou aqui em 30/08: proposta em cotação tem cronograma
  -- simulado, mas NÃO é dinheiro devido. Sem isto, o banco que você ainda está
  -- cotando aparece na Dívida total.
  AND c.status NOT IN ('LIQUIDADO', 'CANCELADO', 'EM_NEGOCIACAO')
  AND c.mirror_role IS DISTINCT FROM 'CREDORA';

COMMENT ON VIEW public.vw_debt_open_installments IS
    'Parcelas em aberto do cronograma VIGENTE ativo. Exclui contrato liquidado, '
    'cancelado, EM NEGOCIACAO (proposta nao e divida) e a perna CREDORA do '
    'mutuo intercompany. Base unica dos KPIs de divida.';

REVOKE ALL ON public.vw_debt_open_installments FROM anon;
GRANT SELECT ON public.vw_debt_open_installments TO authenticated;

-- ==========================================================================
-- 3. fn_debt_proposal_comparison — as métricas do PRD item 5
-- ==========================================================================
-- Compara as propostas de um grupo pelo cronograma que cada uma gerou. O que a
-- função NÃO faz de propósito: eleger uma vencedora. O PRD é explícito — "a
-- recomendação não deve considerar apenas a menor taxa" —, então quem pondera
-- garantia, covenant, concentração bancária e pressão de caixa é a tela, com o
-- número de cada eixo à vista.

DROP FUNCTION IF EXISTS public.fn_debt_proposal_comparison(UUID);

CREATE FUNCTION public.fn_debt_proposal_comparison(p_proposal_group UUID)
RETURNS TABLE (
    debt_contract_id    UUID,
    contract_number     TEXT,
    instituicao         TEXT,
    status              TEXT,
    modality            TEXT,
    amortization_system TEXT,
    bruto_liberado      NUMERIC,
    liquido_recebido    NUMERIC,
    custos_na_liberacao NUMERIC,
    taxa_nominal        NUMERIC,
    taxa_mensal_pct     NUMERIC,
    index_name          TEXT,
    cet_anual           NUMERIC,
    carencia_meses      INT,
    n_parcelas          BIGINT,
    primeira_parcela    NUMERIC,
    maior_parcela       NUMERIC,
    total_juros         NUMERIC,
    total_encargos      NUMERIC,
    total_pago          NUMERIC,
    custo_total         NUMERIC,
    impacto_mensal_12m  NUMERIC,
    primeiro_vencimento DATE,
    ultimo_vencimento   DATE
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH prop AS (
        -- A RLS de debt_contracts recorta a organização; não repetir o filtro
        -- aqui evita uma segunda regra de acesso para manter em dia.
        SELECT c.*
          FROM public.debt_contracts c
         WHERE c.proposal_group = p_proposal_group
    ),
    parc AS (
        SELECT
            p.id AS cid,
            i.due_date,
            i.total,
            i.interest,
            i.monetary_correction + i.iof + i.insurance + i.fees AS encargos
          FROM prop p
          JOIN public.debt_schedules   s ON s.debt_contract_id = p.id
                                        AND s.kind = 'VIGENTE' AND s.is_active
          JOIN public.debt_installments i ON i.debt_schedule_id = s.id
         WHERE i.status <> 'CANCELADA'
    ),
    agg AS (
        SELECT
            parc.cid,
            COUNT(*)                                        AS n_parcelas,
            SUM(parc.total)                                 AS total_pago,
            SUM(parc.interest)                              AS total_juros,
            SUM(parc.encargos)                              AS total_encargos,
            MAX(parc.total)                                 AS maior_parcela,
            MIN(parc.due_date)                              AS primeiro_venc,
            MAX(parc.due_date)                              AS ultimo_venc,
            -- Pressão de caixa: o que sai por mês no primeiro ano. Duas
            -- propostas com o mesmo CET podem ter primeiros anos muito
            -- diferentes, e é o primeiro ano que aperta.
            SUM(parc.total) FILTER (
                WHERE parc.due_date <= (SELECT MIN(x.due_date) FROM parc x WHERE x.cid = parc.cid) + 365
            ) / 12.0                                        AS impacto_mensal_12m
        FROM parc
        GROUP BY parc.cid
    )
    SELECT
        p.id,
        p.contract_number,
        COALESCE(sup.name, '(sem instituição)'),
        p.status,
        p.modality,
        p.amortization_system,
        p.principal_released,
        p.net_received,
        p.retained_amount + p.fees + p.iof + p.insurance + p.notary_costs + p.other_costs,
        p.nominal_rate,
        CASE WHEN p.rate_period = 'ANUAL'
             THEN (power(1 + p.nominal_rate / 100.0, 1.0 / 12.0) - 1) * 100
             ELSE p.nominal_rate
        END,
        p.index_name,
        p.cet_annual,
        p.grace_principal_months,
        COALESCE(a.n_parcelas, 0),
        (SELECT x.total FROM parc x WHERE x.cid = p.id ORDER BY x.due_date LIMIT 1),
        COALESCE(a.maior_parcela, 0),
        COALESCE(a.total_juros, 0),
        COALESCE(a.total_encargos, 0),
        COALESCE(a.total_pago, 0),
        -- Custo total da operação: tudo que sai menos o que de fato entrou.
        -- Contra o LÍQUIDO, não contra o contratado — é a diferença que faz o
        -- CET ser maior que a taxa do contrato.
        COALESCE(a.total_pago, 0) - p.net_received,
        ROUND(COALESCE(a.impacto_mensal_12m, 0), 2),
        a.primeiro_venc,
        a.ultimo_venc
    FROM prop p
    LEFT JOIN agg a ON a.cid = p.id
    LEFT JOIN public.suppliers sup ON sup.id = p.institution_supplier_id
    ORDER BY p.cet_annual NULLS LAST, COALESCE(a.total_pago, 0);
$$;

COMMENT ON FUNCTION public.fn_debt_proposal_comparison(UUID) IS
    'Compara as propostas de um proposal_group pelas metricas do PRD item 5. '
    'NAO elege vencedora de proposito: o PRD manda pesar garantia, covenant, '
    'concentracao bancaria e pressao de caixa, nao so a menor taxa.';

-- ⚠️ REVOKE de anon EXPLÍCITO. `REVOKE ... FROM PUBLIC` sozinho não fecha: o
-- Supabase mantém ALTER DEFAULT PRIVILEGES concedendo EXECUTE a `anon`, e
-- revogar de PUBLIC não remove grant explícito de papel nomeado. Foi o defeito
-- que a aplicar_20270915000006 teve de consertar.
REVOKE ALL ON FUNCTION public.fn_debt_proposal_comparison(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_debt_proposal_comparison(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_debt_proposal_comparison(UUID) TO authenticated;

-- ==========================================================================
-- 4. Conferência
-- ==========================================================================
-- 4.a. 🔴 Proposta não entra na dívida:
--   Crie um contrato com status='EM_NEGOCIACAO', gere o cronograma e rode:
-- SELECT divida_total FROM public.fn_debt_position('<org>');
--    -> esperado: NÃO muda. Troque o status para 'CONTRATADO' e rode de novo:
--    -> esperado: sobe pelo principal da proposta.
--
-- 4.b. A função nova está fechada para anon (a lição da ...000006):
-- SELECT has_function_privilege('anon','public.fn_debt_proposal_comparison(uuid)','EXECUTE') AS anon_pode,
--        has_function_privilege('authenticated','public.fn_debt_proposal_comparison(uuid)','EXECUTE') AS auth_ok;
--    -> esperado: f / t
--
-- 4.c. Fumaça sem proposta nenhuma:
-- SELECT COUNT(*) FROM public.fn_debt_proposal_comparison(gen_random_uuid());
--    -> esperado: 0, sem erro
--
-- 4.d. A view não perdeu coluna nem o security_invoker:
-- SELECT COUNT(*) FROM information_schema.columns
--  WHERE table_name='vw_debt_open_installments';
--    -> esperado: 24
-- SELECT reloptions FROM pg_class WHERE relname='vw_debt_open_installments';
--    -> esperado: {security_invoker=on}
-- ==========================================================================
-- FIM: aplicar_20270915000007_debt_propostas.sql
-- ==========================================================================
