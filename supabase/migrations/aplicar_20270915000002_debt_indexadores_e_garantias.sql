-- ==========================================================================
-- Gestão de Dívidas e Financiamentos · Indexadores e Garantias
-- Date: 2026-08-29
-- Altera: contract_index_values, contract_guarantees
-- Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
-- ==========================================================================
-- CONTEXTO
-- Duas peças que JÁ EXISTEM cobrem quase todo o requisito de indexador e de
-- garantia do módulo de dívida. Esta migration as ESTENDE em vez de criar
-- estruturas paralelas:
--
--   · `contract_index_values` (20261102000007) já guarda séries mensais com
--     INCC/INCC-M/IPCA/IGP-M/CUB e seed 2025-2026. Falta CDI, SELIC e TR —
--     os indexadores de dívida bancária. É um CHECK a estender.
--
--   · `contract_guarantees` (20270130000010 + aplicar_20270836000000/parte1..6)
--     já tem apólice, vigência, versionamento (supersedes_id), registro em
--     cartório, checklist de documentos (`guarantee_documents`), garantidores
--     (`contract_guarantors`) e o ledger de caução
--     (`guarantee_deposit_events`). Faltava poder pendurar a garantia numa
--     DÍVIDA em vez de num contrato de obra/locação, e as modalidades de
--     garantia real do PRD item 8.
--
-- As três tabelas filhas penduram em contract_guarantees(id), não em
-- contracts(id) — então generalizar só a tabela-mãe já leva as três junto.
--
-- DESVIO DO PLANO, deliberado: o plano listava
-- 'CESSAO_FIDUCIARIA_RECEBIVEIS' como kind novo. `CESSAO_FIDUCIARIA` já existe
-- (parte1) e é a mesma figura jurídica — dois códigos para a mesma coisa
-- quebrariam qualquer relatório por modalidade. Fica só o que já existe.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'contract_index_values') THEN
        RAISE EXCEPTION 'ABORTADO: contract_index_values nao existe (rode 20261102000007 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'contract_guarantees') THEN
        RAISE EXCEPTION 'ABORTADO: contract_guarantees nao existe (rode 20270130000010 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'contract_guarantees'
                      AND column_name = 'scope') THEN
        RAISE EXCEPTION 'ABORTADO: contract_guarantees.scope nao existe (rode aplicar_20270836000000/parte1 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'debt_contracts') THEN
        RAISE EXCEPTION 'ABORTADO: debt_contracts nao existe (rode aplicar_20270915000001 antes).';
    END IF;
END $$;

-- ==========================================================================
-- 1. Indexadores de dívida bancária
-- ==========================================================================

ALTER TABLE public.contract_index_values
    DROP CONSTRAINT IF EXISTS contract_index_values_index_name_check;

ALTER TABLE public.contract_index_values
    ADD CONSTRAINT contract_index_values_index_name_check CHECK (index_name IN (
        'INCC', 'INCC-M', 'IPCA', 'IGP-M', 'CUB',
        'CDI', 'SELIC', 'TR',
        'OUTROS'
    ));

COMMENT ON COLUMN public.contract_index_values.value IS
    'Para INCC/IPCA/IGP-M/CUB: numero-indice ou variacao do mes, como ja era. '
    'Para CDI/SELIC/TR: o FATOR MENSAL ACUMULADO do mes de referencia — NAO a '
    'taxa a.a. divulgada. Converter na entrada, nunca no calculo: o motor de '
    'amortizacao trata toda serie do mesmo jeito.';

-- ==========================================================================
-- 2. Garantias: generalizar o dono (contrato de obra/locação OU dívida)
-- ==========================================================================

-- `contract_id` nasceu NOT NULL. Uma garantia de financiamento não tem
-- contrato de obra — o dono passa a ser um dos dois, nunca os dois.
ALTER TABLE public.contract_guarantees
    ALTER COLUMN contract_id DROP NOT NULL;

ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS debt_contract_id UUID
        REFERENCES public.debt_contracts(id) ON DELETE CASCADE;

DO $$ BEGIN
    ALTER TABLE public.contract_guarantees
        ADD CONSTRAINT contract_guarantees_dono_unico CHECK (
            (contract_id IS NOT NULL AND debt_contract_id IS NULL)
         OR (contract_id IS NULL AND debt_contract_id IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.contract_guarantees.debt_contract_id IS
    'Dono alternativo: garantia de um contrato de divida. Exatamente um entre '
    'contract_id e debt_contract_id e preenchido (constraint '
    'contract_guarantees_dono_unico).';

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_debt
    ON public.contract_guarantees (debt_contract_id) WHERE debt_contract_id IS NOT NULL;

-- ── scope: a garantia de dívida é um terceiro universo ─────────────────────
-- A trava do art. 43 da Lei 8.245/91 (parte4) só vale para scope='LOCACAO',
-- então 'DIVIDA' não colide com ela.
ALTER TABLE public.contract_guarantees
    DROP CONSTRAINT IF EXISTS contract_guarantees_scope_chk;

ALTER TABLE public.contract_guarantees
    ADD CONSTRAINT contract_guarantees_scope_chk CHECK (scope IN ('OBRA', 'LOCACAO', 'DIVIDA'));

-- ==========================================================================
-- 3. Garantias: modalidades de garantia real (PRD item 8)
-- ==========================================================================

ALTER TABLE public.contract_guarantees
    DROP CONSTRAINT IF EXISTS contract_guarantees_kind_check;

ALTER TABLE public.contract_guarantees
    ADD CONSTRAINT contract_guarantees_kind_check CHECK (kind IN (
        -- já existentes (obra + locação) — nenhum removido
        'RC_GERAL', 'RC_PROFISSIONAL', 'SEGURO_GARANTIA', 'FIANCA',
        'CAUCAO', 'EQUIPAMENTOS', 'AMBIENTAL', 'GARANTIA_ADIANTAMENTO',
        'SEM_GARANTIA', 'SEGURO_FIANCA', 'CESSAO_FIDUCIARIA',
        -- novos: bem dado em garantia
        'IMOVEL', 'TERRENO', 'UNIDADE_IMOBILIARIA', 'RECEBIVEIS',
        'APLICACAO_FINANCEIRA', 'VEICULO', 'MAQUINA_EQUIPAMENTO',
        -- novos: figura jurídica
        'AVAL', 'ALIENACAO_FIDUCIARIA', 'HIPOTECA', 'PENHOR', 'GARANTIA_CRUZADA'
    ));

-- ==========================================================================
-- 4. Garantias: controles do PRD item 8
-- ==========================================================================

ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS market_value           DECIMAL(15,2),
    ADD COLUMN IF NOT EXISTS accepted_value         DECIMAL(15,2),
    ADD COLUMN IF NOT EXISTS committed_pct          NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS owner_party            TEXT,
    ADD COLUMN IF NOT EXISTS ltv                    NUMERIC(7,2),
    ADD COLUMN IF NOT EXISTS valuation_date         DATE,
    ADD COLUMN IF NOT EXISTS valuation_valid_until  DATE,
    ADD COLUMN IF NOT EXISTS asset_id               UUID
        REFERENCES public.opura_assets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS released_at            DATE;

DO $$ BEGIN
    ALTER TABLE public.contract_guarantees
        ADD CONSTRAINT contract_guarantees_committed_pct_chk
        CHECK (committed_pct IS NULL OR (committed_pct >= 0 AND committed_pct <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.contract_guarantees.market_value IS
    'Valor de mercado do bem. Diverge de accepted_value: o banco costuma '
    'aceitar 60-80% do mercado.';
COMMENT ON COLUMN public.contract_guarantees.accepted_value IS
    'Valor aceito pela instituicao como garantia. E o denominador do LTV.';
COMMENT ON COLUMN public.contract_guarantees.ltv IS
    'Loan-to-value em PERCENTUAL: saldo devedor / accepted_value * 100. '
    'Calculado e gravado pelo servico, nao coluna gerada — o saldo devedor '
    'muda a cada parcela e nao vale recalcular a garantia inteira por isso.';
COMMENT ON COLUMN public.contract_guarantees.asset_id IS
    'Bem do modulo Gestao de Bens (opura_assets) dado em garantia. Permite o '
    'alerta do PRD item 8: mesmo ativo oferecido em mais de uma operacao.';
COMMENT ON COLUMN public.contract_guarantees.released_at IS
    'Data da liberacao da garantia pela instituicao. Preenchida = o bem voltou '
    'a ficar disponivel para outra operacao.';

-- Suporte ao alerta de ativo oferecido em duas operações: sem este índice a
-- checagem varre a tabela inteira a cada abertura da tela de garantias.
CREATE INDEX IF NOT EXISTS idx_contract_guarantees_asset
    ON public.contract_guarantees (asset_id)
    WHERE asset_id IS NOT NULL AND released_at IS NULL;

-- ==========================================================================
-- 5. Conferência
-- ==========================================================================
-- 5.a. Os indexadores novos entram:
-- INSERT INTO public.contract_index_values
--   (organization_id, index_name, reference_month, value, source)
-- VALUES ('<org>', 'CDI', date_trunc('month', now())::date, 1.0092, 'Manual');
--    -> esperado: sucesso. Depois: DELETE dessa linha de teste.
--
-- 5.b. As garantias antigas continuam válidas (nenhuma violou o dono único):
-- SELECT COUNT(*) FROM public.contract_guarantees
--  WHERE contract_id IS NULL AND debt_contract_id IS NULL;
--    -> esperado: 0
--
-- 5.c. A constraint de dono único está ativa:
-- SELECT conname, convalidated FROM pg_constraint
--  WHERE conrelid = 'public.contract_guarantees'::regclass
--    AND conname = 'contract_guarantees_dono_unico';
--    -> esperado: 1 linha, convalidated = t
--
-- 5.d. Nenhuma garantia existente perdeu o kind (o CHECK novo é superconjunto):
-- SELECT kind, COUNT(*) FROM public.contract_guarantees GROUP BY 1 ORDER BY 2 DESC;
--    -> esperado: roda sem erro; os kinds antigos continuam presentes
--
-- 5.e. Ativo oferecido em mais de uma operação viva (o alerta do PRD item 8):
-- SELECT asset_id, COUNT(*) AS operacoes
--   FROM public.contract_guarantees
--  WHERE asset_id IS NOT NULL AND released_at IS NULL AND is_active
--  GROUP BY 1 HAVING COUNT(*) > 1;
--    -> esperado hoje: vazio (ainda nao ha garantia de divida cadastrada)
--
-- 5.f. A tela de Contratos continua lendo garantia de contrato:
--   Abrir um contrato com garantia em components/ContractGuaranteeModal.tsx
--   -> a apólice tem de aparecer igual a antes.
-- ==========================================================================
-- FIM: aplicar_20270915000002_debt_indexadores_e_garantias.sql
-- ==========================================================================
