-- ==========================================================================
-- Gestão de Dívidas e Financiamentos · Núcleo
-- Date: 2026-08-29
-- Tabelas novas: debt_contracts, debt_schedules, debt_installments,
--                debt_disbursements, debt_allocations
-- Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
-- ==========================================================================
-- CONTEXTO
-- O ÒPURA não tinha NADA de dívida: zero tabelas, zero services, zero telas.
-- A dívida existia só como percentual de funding num estudo de viabilidade
-- (types/imovib.ts:393). Este é o cadastro do contrato financeiro e da
-- evolução da dívida; a liquidação continua no Financeiro.
--
-- POR QUE TABELA NOVA E NÃO `contracts` COM domain='FINANCIAMENTO':
--   1. `contracts.domain` é a fonte de verdade da DIREÇÃO DE CAIXA —
--      isReceivableContract() roteia CREDIT/DEBIT em 3 funções de sync que já
--      foram corrigidas em produção depois de um bug de R$ 188 mil. Domínio
--      novo mexe nesse roteamento.
--   2. `contracts.payment_schedule` é JSONB de {date,value}
--      (types/contracts.ts:161). Uma parcela de dívida tem 10 componentes.
--   3. `contracts` carrega medição, aditivo, retenção, BDI — semântica de
--      obra, não de crédito.
--
-- REGRA ARQUITETURAL DO PRD (item 4): três camadas separadas.
--   debt_schedules.kind='CONTRATUAL'  → nasce na v1 e NUNCA é reescrito
--   debt_schedules.kind='VIGENTE'     → renegociação cria versão nova
--   debt_events (migration ...000003) → o que de fato aconteceu
-- Renegociação nunca sobrescreve o contrato original.
--
-- DECISÕES DO USUÁRIO (2026-08-29, mesma sessão):
--   · Investidores/debêntures ficam FORA — continuam no Portal do Investidor.
--     Por isso as duas modalidades NÃO entram no CHECK de `modality`.
--   · Mútuo entre empresas do grupo gera ESPELHO automático — daí
--     `mirror_debt_contract_id` e `related_company_id`.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'companies') THEN
        RAISE EXCEPTION 'ABORTADO: companies nao existe (rode 20260526000002 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'suppliers') THEN
        RAISE EXCEPTION 'ABORTADO: suppliers nao existe (rode 20260214000002 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'is_org_member') THEN
        RAISE EXCEPTION 'ABORTADO: public.is_org_member() nao existe.';
    END IF;
END $$;

-- ==========================================================================
-- 1. debt_contracts — o contrato financeiro
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_contracts (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- ── Identificação (PRD item 3) ────────────────────────────────────────
    -- O tomador é a empresa/SPE/holding. companies.tipo já distingue
    -- 'holding' e 'spe' desde 20260526000002 — não criar taxonomia paralela.
    company_id               uuid REFERENCES public.companies(id) ON DELETE RESTRICT,

    -- A separação que o PRD pede (item 2) porque afeta contabilidade,
    -- governança, tributação e consolidação do grupo.
    counterparty_kind        text NOT NULL DEFAULT 'INSTITUICAO_FINANCEIRA'
        CHECK (counterparty_kind IN ('INSTITUICAO_FINANCEIRA', 'PARTE_RELACIONADA', 'TERCEIRO')),
    -- A instituição financeira mora em `suppliers` de propósito: é o que dá
    -- `internal_transactions.supplier_id` de graça no Contas a Pagar, sem um
    -- segundo cadastro de contraparte para manter em dia.
    institution_supplier_id  uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    institution_branch       text,
    -- Mútuo com empresa do grupo: a outra ponta.
    related_company_id       uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
    -- O espelho passivo↔ativo do mútuo intercompany. Auto-FK: os dois lados
    -- apontam um para o outro. ON DELETE SET NULL para apagar uma ponta não
    -- levar a outra junto.
    mirror_debt_contract_id  uuid REFERENCES public.debt_contracts(id) ON DELETE SET NULL,

    contract_number          text,
    -- DIVIDA_INVESTIDORES e DEBENTURES ficaram FORA por decisão do usuário
    -- (2026-08-29): continuam no Portal do Investidor, que já tem aporte e
    -- remuneração. Este módulo só consolida o saldo delas em leitura.
    modality                 text NOT NULL DEFAULT 'OUTRO' CHECK (modality IN (
        'CAPITAL_GIRO', 'CONTA_GARANTIDA', 'CREDITO_ROTATIVO',
        'ANTECIPACAO_RECEBIVEIS', 'EMPRESTIMO_COM_GARANTIA',
        'FINANCIAMENTO_IMOBILIARIO', 'FINANCIAMENTO_PRODUCAO', 'PLANO_EMPRESARIO',
        'FINANCIAMENTO_MAQUINAS_EQUIPAMENTOS', 'FINAME_BNDES',
        'FINANCIAMENTO_VEICULOS', 'CREDITO_ENERGIA_SOLAR', 'CCB',
        'LEASING', 'CONSORCIO', 'MUTUO_GRUPO', 'MUTUO_SOCIOS', 'OUTRO'
    )),
    purpose                  text,
    signed_at                date,
    released_at              date,
    first_due_date           date,
    final_due_date           date,
    owner_user_id            uuid,
    status                   text NOT NULL DEFAULT 'CONTRATADO' CHECK (status IN (
        'EM_NEGOCIACAO', 'CONTRATADO', 'LIBERADO', 'EM_CARENCIA', 'ADIMPLENTE',
        'INADIMPLENTE', 'RENEGOCIADO', 'LIQUIDADO', 'CANCELADO'
    )),

    -- ── Valores (PRD item 3) ──────────────────────────────────────────────
    -- Contratado ≠ liberado: conta garantida e financiamento à produção são
    -- liberados aos poucos, e o cronograma se calcula sobre o LIBERADO.
    principal_contracted     numeric(15,2) NOT NULL DEFAULT 0 CHECK (principal_contracted >= 0),
    principal_released       numeric(15,2) NOT NULL DEFAULT 0 CHECK (principal_released >= 0),
    retained_amount          numeric(15,2) NOT NULL DEFAULT 0 CHECK (retained_amount >= 0),
    fees                     numeric(15,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
    iof                      numeric(15,2) NOT NULL DEFAULT 0 CHECK (iof >= 0),
    insurance                numeric(15,2) NOT NULL DEFAULT 0 CHECK (insurance >= 0),
    notary_costs             numeric(15,2) NOT NULL DEFAULT 0 CHECK (notary_costs >= 0),
    other_costs              numeric(15,2) NOT NULL DEFAULT 0 CHECK (other_costs >= 0),
    net_received             numeric(15,2) NOT NULL DEFAULT 0 CHECK (net_received >= 0),

    -- ── Condições financeiras (PRD item 3) ────────────────────────────────
    rate_type                text NOT NULL DEFAULT 'FIXA' CHECK (rate_type IN ('FIXA', 'VARIAVEL')),
    nominal_rate             numeric(12,6) NOT NULL DEFAULT 0 CHECK (nominal_rate >= 0),
    rate_period              text NOT NULL DEFAULT 'MENSAL' CHECK (rate_period IN ('MENSAL', 'ANUAL')),
    -- Casa com contract_index_values.index_name, que a ...000002 estende com
    -- CDI/SELIC/TR. Sem FK: o índice pode não ter série cadastrada ainda.
    index_name               text,
    index_pct                numeric(9,4) CHECK (index_pct IS NULL OR index_pct >= 0),
    spread                   numeric(12,6) CHECK (spread IS NULL OR spread >= 0),
    cet_annual               numeric(12,6),
    grace_principal_months   integer NOT NULL DEFAULT 0 CHECK (grace_principal_months >= 0),
    grace_interest_months    integer NOT NULL DEFAULT 0 CHECK (grace_interest_months >= 0),
    capitalize_interest      boolean NOT NULL DEFAULT false,
    installment_period       text NOT NULL DEFAULT 'MENSAL' CHECK (installment_period IN (
        'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICA', 'IRREGULAR'
    )),
    installment_count        integer CHECK (installment_count IS NULL OR installment_count > 0),
    late_fine_pct            numeric(9,4) NOT NULL DEFAULT 2 CHECK (late_fine_pct >= 0),
    late_interest_month_pct  numeric(9,4) NOT NULL DEFAULT 1 CHECK (late_interest_month_pct >= 0),

    amortization_system      text NOT NULL DEFAULT 'PRICE' CHECK (amortization_system IN (
        'SAC', 'PRICE', 'SACRE', 'AMERICANO', 'BULLET', 'MANUAL', 'IRREGULAR'
    )),

    notes                    text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    -- Sem contraparte de nenhum tipo o contrato não tem credor — e o título
    -- em Contas a Pagar nasceria sem quem receber.
    CONSTRAINT debt_contracts_contraparte_obrigatoria CHECK (
        institution_supplier_id IS NOT NULL OR related_company_id IS NOT NULL
    ),
    -- Liberado nunca passa do contratado (exceto conta garantida/rotativo,
    -- que reciclam limite — por isso a exceção explícita e não um CHECK cego).
    CONSTRAINT debt_contracts_liberado_ate_contratado CHECK (
        modality IN ('CONTA_GARANTIDA', 'CREDITO_ROTATIVO')
        OR principal_released <= principal_contracted
    )
);

COMMENT ON TABLE public.debt_contracts IS
    'Contrato financeiro (emprestimo, financiamento, mutuo). Fonte do '
    'cronograma; o Contas a Pagar recebe os titulos. Investidores/debentures '
    'ficam no Portal do Investidor por decisao do usuario em 2026-08-29.';
COMMENT ON COLUMN public.debt_contracts.principal_released IS
    'Base de calculo do cronograma. Contratado e liberado divergem em conta '
    'garantida e financiamento a producao (liberacoes parciais).';
COMMENT ON COLUMN public.debt_contracts.mirror_debt_contract_id IS
    'Espelho do mutuo intercompany: o passivo na devedora aponta para o '
    'credito na credora e vice-versa. Na consolidacao do grupo os dois se '
    'eliminam.';
COMMENT ON COLUMN public.debt_contracts.institution_supplier_id IS
    'A instituicao financeira e um `suppliers` de proposito: e o que preenche '
    'internal_transactions.supplier_id no Contas a Pagar sem cadastro dobrado.';
COMMENT ON COLUMN public.debt_contracts.nominal_rate IS
    'Taxa em PERCENTUAL (5.5 = 5,5%), na periodicidade de rate_period. O motor '
    'converte para decimal antes de calcular.';

CREATE INDEX IF NOT EXISTS idx_debt_contracts_org
    ON public.debt_contracts (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_debt_contracts_company
    ON public.debt_contracts (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debt_contracts_institution
    ON public.debt_contracts (institution_supplier_id) WHERE institution_supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debt_contracts_mirror
    ON public.debt_contracts (mirror_debt_contract_id) WHERE mirror_debt_contract_id IS NOT NULL;
-- Número de contrato repetido na mesma instituição é quase sempre digitação
-- duplicada. COALESCE porque UNIQUE não compara NULLs entre si.
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_contracts_numero
    ON public.debt_contracts (
        organization_id,
        COALESCE(institution_supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
        contract_number
    ) WHERE contract_number IS NOT NULL AND contract_number <> '';

-- ==========================================================================
-- 2. debt_schedules — as camadas CONTRATUAL e VIGENTE
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_schedules (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    debt_contract_id  uuid NOT NULL REFERENCES public.debt_contracts(id) ON DELETE CASCADE,
    -- CONTRATUAL nasce na v1 junto com o contrato e NUNCA é reescrito — é o
    -- que permite comparar "proposta x execução real" (PRD item 4).
    kind              text NOT NULL CHECK (kind IN ('CONTRATUAL', 'VIGENTE')),
    version           integer NOT NULL DEFAULT 1 CHECK (version > 0),
    supersedes_id     uuid REFERENCES public.debt_schedules(id) ON DELETE SET NULL,
    reason            text,
    is_active         boolean NOT NULL DEFAULT true,
    -- Fotografia dos parâmetros usados no cálculo desta versão. Sem isso, uma
    -- edição posterior no contrato torna o cronograma antigo irreproduzível.
    params_snapshot   jsonb,
    generated_at      timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.debt_schedules IS
    'Versoes de cronograma. kind=CONTRATUAL e imutavel (o original); '
    'kind=VIGENTE ganha versao nova a cada renegociacao, encadeada por '
    'supersedes_id. Renegociacao NUNCA sobrescreve o contrato original.';
COMMENT ON COLUMN public.debt_schedules.params_snapshot IS
    'Parametros do contrato no momento da geracao (taxa, sistema, carencia, '
    'indexador). Torna o cronograma reproduzivel mesmo apos edicao do contrato.';

-- Só um cronograma ativo por camada. Duas VIGENTEs ativas fariam o saldo
-- devedor depender de qual a consulta pegou primeiro.
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_schedules_ativo
    ON public.debt_schedules (debt_contract_id, kind) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_debt_schedules_contrato
    ON public.debt_schedules (debt_contract_id, kind, version DESC);

-- ==========================================================================
-- 3. debt_installments — a memória de cálculo (PRD item 4)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_installments (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    debt_schedule_id      uuid NOT NULL REFERENCES public.debt_schedules(id) ON DELETE CASCADE,
    seq                   integer NOT NULL CHECK (seq > 0),
    due_date              date NOT NULL,
    competencia_date      date,

    opening_balance       numeric(15,2) NOT NULL DEFAULT 0,
    amortization          numeric(15,2) NOT NULL DEFAULT 0,
    interest              numeric(15,2) NOT NULL DEFAULT 0,
    monetary_correction   numeric(15,2) NOT NULL DEFAULT 0,
    iof                   numeric(15,2) NOT NULL DEFAULT 0,
    insurance             numeric(15,2) NOT NULL DEFAULT 0,
    fees                  numeric(15,2) NOT NULL DEFAULT 0,
    late_fine             numeric(15,2) NOT NULL DEFAULT 0,
    late_interest         numeric(15,2) NOT NULL DEFAULT 0,
    total                 numeric(15,2) NOT NULL DEFAULT 0,
    closing_balance       numeric(15,2) NOT NULL DEFAULT 0,

    paid_amount           numeric(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    paid_at               date,

    -- As 10 situações do PRD item 6.
    status                text NOT NULL DEFAULT 'PREVISTA' CHECK (status IN (
        'PREVISTA', 'PROVISIONADA', 'A_VENCER', 'EM_APROVACAO', 'PAGA',
        'PARCIALMENTE_PAGA', 'VENCIDA', 'RENEGOCIADA', 'ANTECIPADA', 'CANCELADA'
    )),
    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT debt_installments_seq_unica UNIQUE (debt_schedule_id, seq)
);

COMMENT ON TABLE public.debt_installments IS
    'Memoria de calculo parcela a parcela. Cada componente e uma coluna porque '
    'o Contas a Pagar recebe UMA LINHA POR COMPONENTE (decisao do usuario '
    '2026-08-29) e a DRE precisa separar juros de amortizacao de principal.';
COMMENT ON COLUMN public.debt_installments.amortization IS
    'Reducao efetiva do principal. NAO e despesa — e movimento de passivo. '
    'Vai para o razao com categoria dre_group=PASSIVO (ver ...000003).';
COMMENT ON COLUMN public.debt_installments.closing_balance IS
    'Principal remanescente apos a parcela. Na ultima parcela deve ser 0 '
    '(tolerancia de 1 centavo pelo arredondamento).';

CREATE INDEX IF NOT EXISTS idx_debt_installments_schedule
    ON public.debt_installments (debt_schedule_id, seq);
CREATE INDEX IF NOT EXISTS idx_debt_installments_venc
    ON public.debt_installments (organization_id, due_date, status);

-- ==========================================================================
-- 4. debt_disbursements — liberações totais e parciais (PRD item 3)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_disbursements (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    debt_contract_id    uuid NOT NULL REFERENCES public.debt_contracts(id) ON DELETE CASCADE,
    disbursed_at        date NOT NULL,
    gross_amount        numeric(15,2) NOT NULL CHECK (gross_amount > 0),
    retained_amount     numeric(15,2) NOT NULL DEFAULT 0 CHECK (retained_amount >= 0),
    fees                numeric(15,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
    iof                 numeric(15,2) NOT NULL DEFAULT 0 CHECK (iof >= 0),
    insurance           numeric(15,2) NOT NULL DEFAULT 0 CHECK (insurance >= 0),
    notary_costs        numeric(15,2) NOT NULL DEFAULT 0 CHECK (notary_costs >= 0),
    other_costs         numeric(15,2) NOT NULL DEFAULT 0 CHECK (other_costs >= 0),
    net_amount          numeric(15,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
    -- Convivem tres conceitos de conta no sistema (payment_accounts,
    -- bank_accounts, company_bank_accounts). A liberacao aponta para
    -- payment_accounts, que e a que `internal_transactions` ja referencia.
    payment_account_id  uuid,
    document_url        text,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.debt_disbursements IS
    'Liberacoes do credito, totais ou parciais. A soma das liberacoes alimenta '
    'debt_contracts.principal_released, que e a base do cronograma.';
COMMENT ON COLUMN public.debt_disbursements.payment_account_id IS
    'FK logica para payment_accounts (sem constraint: a conta pode ser de uma '
    'empresa cadastrada em company_bank_accounts e ainda nao espelhada).';

CREATE INDEX IF NOT EXISTS idx_debt_disbursements_contrato
    ON public.debt_disbursements (debt_contract_id, disbursed_at);

-- ==========================================================================
-- 5. debt_allocations — destinação e rateio (PRD item 7)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_allocations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    debt_contract_id    uuid NOT NULL REFERENCES public.debt_contracts(id) ON DELETE CASCADE,
    -- Polimorfico de proposito: sao 8 tabelas destino diferentes e uma FK por
    -- tipo obrigaria 8 colunas quase sempre nulas. A integridade e conferida
    -- na leitura (join por target_kind), nao por constraint.
    target_kind         text NOT NULL CHECK (target_kind IN (
        'COMPANY', 'PROJECT', 'EMPREENDIMENTO', 'COST_CENTER',
        'ASSET', 'PROPERTY', 'UNIT', 'BANK_ACCOUNT'
    )),
    target_id           uuid NOT NULL,
    percent             numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT debt_allocations_destino_unico UNIQUE (debt_contract_id, target_kind, target_id)
);

COMMENT ON TABLE public.debt_allocations IS
    'Rateio da divida entre destinos (PRD item 7). E o que permite medir a '
    'divida e o custo financeiro real de cada obra ou empreendimento.';
COMMENT ON COLUMN public.debt_allocations.target_id IS
    'Id na tabela indicada por target_kind: companies, projects, '
    'empreendimentos, cost_centers_v2, opura_assets, commercial_properties, '
    'empreendimento_units, payment_accounts. Sem FK — ver comentario da coluna '
    'target_kind.';

CREATE INDEX IF NOT EXISTS idx_debt_allocations_contrato
    ON public.debt_allocations (debt_contract_id);
CREATE INDEX IF NOT EXISTS idx_debt_allocations_destino
    ON public.debt_allocations (target_kind, target_id);

-- Trava de soma = 100 por contrato, DIFERIDA até o COMMIT.
-- Diferida porque a tela salva o rateio em bloco: apagar as linhas antigas e
-- inserir as novas passa por estados intermediários que somam 40% ou 160%.
-- Uma trava imediata rejeitaria a primeira instrução de uma transação válida.
-- Rateio VAZIO é permitido — a destinação é opcional (PRD item 7 diz "poderá").
CREATE OR REPLACE FUNCTION public.fn_debt_allocations_soma_100()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_contrato uuid := COALESCE(NEW.debt_contract_id, OLD.debt_contract_id);
    v_total    numeric(9,2);
BEGIN
    SELECT COALESCE(SUM(percent), 0) INTO v_total
      FROM public.debt_allocations
     WHERE debt_contract_id = v_contrato;

    IF v_total <> 0 AND v_total <> 100 THEN
        RAISE EXCEPTION
            'Rateio do contrato % soma %%% — precisa somar 100%% ou ficar vazio.',
            v_contrato, v_total
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.fn_debt_allocations_soma_100() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_debt_allocations_soma_100 ON public.debt_allocations;
CREATE CONSTRAINT TRIGGER trg_debt_allocations_soma_100
    AFTER INSERT OR UPDATE OR DELETE ON public.debt_allocations
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.fn_debt_allocations_soma_100();

-- ==========================================================================
-- 6. updated_at automático
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.fn_debt_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_debt_touch() FROM PUBLIC;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['debt_contracts', 'debt_installments',
                             'debt_disbursements', 'debt_allocations']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON public.%1$s;', t);
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$s '
            'FOR EACH ROW EXECUTE FUNCTION public.fn_debt_touch();', t);
    END LOOP;
END $$;

-- ==========================================================================
-- 7. RLS
-- ==========================================================================

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['debt_contracts', 'debt_schedules', 'debt_installments',
                             'debt_disbursements', 'debt_allocations']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_org_all', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
            'USING (public.is_org_member(organization_id)) '
            'WITH CHECK (public.is_org_member(organization_id));', t || '_org_all', t);

        -- REVOKE de anon explícito: o Supabase concede SELECT a `anon` via
        -- ALTER DEFAULT PRIVILEGES, então revogar de PUBLIC sozinho não fecha.
        EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    END LOOP;
END $$;

-- ==========================================================================
-- 8. Conferência
-- ==========================================================================
-- 8.a. As 5 tabelas existem e estão com RLS ligada:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname LIKE 'debt\_%' ORDER BY relname;
--    -> esperado: 5 linhas, relrowsecurity = t em todas
--
-- 8.b. As policies estão no lugar:
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--  WHERE tablename LIKE 'debt\_%' ORDER BY tablename;
--    -> esperado: 5 linhas, {authenticated} | ALL
--
-- 8.c. anon não lê (rodar com a anon key, FORA do SQL Editor):
--   GET /rest/v1/debt_contracts?select=id  -> [] ou 401, nunca dados
--
-- 8.d. A trava de rateio funciona (deve falhar no COMMIT, não antes):
-- BEGIN;
--   INSERT INTO public.debt_allocations
--     (organization_id, debt_contract_id, target_kind, target_id, percent)
--   VALUES ('<org>', '<contrato>', 'PROJECT', '<obra>', 40);
-- COMMIT;   -> esperado: ERRO "Rateio do contrato ... soma 40% ..."
--
-- 8.e. Contratos com rateio fora de 100 (relatório para a tela):
-- SELECT debt_contract_id, SUM(percent) AS total
--   FROM public.debt_allocations GROUP BY 1 HAVING SUM(percent) <> 100;
--    -> esperado: vazio
--
-- 8.f. Um só cronograma ativo por camada:
-- SELECT debt_contract_id, kind, COUNT(*) FROM public.debt_schedules
--  WHERE is_active GROUP BY 1, 2 HAVING COUNT(*) > 1;
--    -> esperado: vazio
-- ==========================================================================
-- FIM: aplicar_20270915000001_debt_core.sql
-- ==========================================================================
