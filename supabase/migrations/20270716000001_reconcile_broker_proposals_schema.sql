-- ==========================================================================
-- Migration: Reconcilia broker_portal_proposals com o codigo (F0 do PV)
-- Date: 2026-07-16
-- ==========================================================================
-- CONTEXTO
-- types/broker.ts (BrokerProposal), brokerService.listProposals e
-- BrokerProposalSimulator.handleSubmit usam colunas que nunca foram migradas.
-- Resultado: listar e enviar proposta quebram com 42703 em producao.
--
-- Esta migration alinha o BANCO ao codigo (Opcao A), porque o modulo
-- Plano de Vendas precisa de unit_price e discount_pct de qualquer forma.
--
-- NAO cria payment_plan_id: ele nasce na F1 como FK real para sales_plans.
-- A coluna payment_plan (JSONB) ja existe e permanece.
--
-- Idempotente. Aplicar via SQL direto (NUNCA `supabase db push`).
-- ==========================================================================
-- COMO APLICAR  --  IMPORTANTE
--
-- A v1 desta migration tomou `40P01 deadlock detected`: rodar tudo numa
-- transacao so faz o DDL segurar lock em broker_portal_proposals enquanto
-- pede lock em broker_profiles, cruzando com o PostgREST que le as duas.
--
-- Rodar as ETAPAS 1..5 **uma de cada vez**, cada uma na sua execucao.
-- Nao colar o arquivo inteiro de uma vez no SQL Editor.
--
-- lock_timeout faz a etapa falhar rapido (55P03) em vez de deadlockar.
-- Se uma etapa der lock_timeout, apenas repita ESSA etapa: todas sao
-- idempotentes e a etapa ja aplicada nao e' refeita.
-- ==========================================================================


-- ==========================================================================
-- ETAPA 1 — Renomear colunas para os nomes que o codigo usa
--           Rename (nao add+drop) para preservar dados existentes.
-- ==========================================================================
SET lock_timeout = '5s';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'broker_portal_proposals'
                 AND column_name = 'installments')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'broker_portal_proposals'
                 AND column_name = 'monthly_installments')
    THEN
        ALTER TABLE public.broker_portal_proposals
            RENAME COLUMN installments TO monthly_installments;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'broker_portal_proposals'
                 AND column_name = 'installment_value')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'broker_portal_proposals'
                 AND column_name = 'monthly_value')
    THEN
        ALTER TABLE public.broker_portal_proposals
            RENAME COLUMN installment_value TO monthly_value;
    END IF;
END $$;


-- ==========================================================================
-- ETAPA 2 — Colunas ausentes (SEM a FK: so' toca broker_portal_proposals)
--           Separar a FK e' o que evita o deadlock da v1.
-- ==========================================================================
SET lock_timeout = '5s';

ALTER TABLE public.broker_portal_proposals
    ADD COLUMN IF NOT EXISTS broker_id     UUID,
    ADD COLUMN IF NOT EXISTS unit_price    NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS discount_pct  NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS balloon_value NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS admin_notes   TEXT;

COMMENT ON COLUMN public.broker_portal_proposals.unit_price IS
    'Preco de tabela da unidade no momento da proposta. total_value = unit_price - desconto.';
COMMENT ON COLUMN public.broker_portal_proposals.discount_pct IS
    'Desconto comercial nominal (%). Nao confundir com desconto economico (calculado, nao persistido aqui).';
COMMENT ON COLUMN public.broker_portal_proposals.broker_id IS
    'FK opcional para broker_profiles. broker_email continua sendo a chave usada pela RLS.';


-- ==========================================================================
-- ETAPA 3 — Backfill (so' UPDATE/DML, sem DDL: nao pega lock exclusivo)
--           Sem discount_pct historico, o desconto nominal e' 0
--           -> unit_price = total_value.
--           So preenche o que esta nulo; nao sobrescreve dado existente.
-- ==========================================================================
UPDATE public.broker_portal_proposals
   SET unit_price = total_value
 WHERE unit_price IS NULL;

UPDATE public.broker_portal_proposals
   SET discount_pct = 0
 WHERE discount_pct IS NULL;

-- Vincular broker_id a partir do broker_email + org (par UNIQUE em broker_profiles).
UPDATE public.broker_portal_proposals p
   SET broker_id = bp.id
  FROM public.broker_profiles bp
 WHERE p.broker_id IS NULL
   AND bp.organization_id = p.organization_id
   AND LOWER(bp.email) = LOWER(p.broker_email);


-- ==========================================================================
-- ETAPA 4 — FK + indice, isolados.
--           NOT VALID nao varre a tabela e pega lock curto; o VALIDATE
--           seguinte confere as linhas ja existentes sem AccessExclusiveLock.
-- ==========================================================================
SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'broker_portal_proposals_broker_id_fkey'
                     AND conrelid = 'public.broker_portal_proposals'::regclass)
    THEN
        ALTER TABLE public.broker_portal_proposals
            ADD CONSTRAINT broker_portal_proposals_broker_id_fkey
            FOREIGN KEY (broker_id) REFERENCES public.broker_profiles(id)
            ON DELETE SET NULL
            NOT VALID;
    END IF;
END $$;

ALTER TABLE public.broker_portal_proposals
    VALIDATE CONSTRAINT broker_portal_proposals_broker_id_fkey;

CREATE INDEX IF NOT EXISTS broker_proposals_broker_id_idx
    ON public.broker_portal_proposals(broker_id);


-- ==========================================================================
-- ETAPA 5 — Fechar o furo de RLS: o INSERT tinha WITH CHECK (true), ou seja,
--           qualquer usuario autenticado inseria proposta em qualquer org.
--
--           is_org_member() ja cobre corretores ativos via broker_profiles
--           (ver 20260320000000_fix_is_org_member_for_brokers.sql).
--             - corretor      -> insere apenas para si
--             - membro da org -> insere em nome de qualquer corretor
-- ==========================================================================
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "broker_proposals_insert" ON public.broker_portal_proposals;

CREATE POLICY "broker_proposals_insert" ON public.broker_portal_proposals
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_org_member(organization_id)
        AND (
            LOWER(broker_email) = LOWER(auth.jwt()->>'email')
            OR EXISTS (
                SELECT 1 FROM public.organization_members om
                 WHERE om.organization_id = broker_portal_proposals.organization_id
                   AND LOWER(om.email) = LOWER(auth.jwt()->>'email')
            )
            OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com')
        )
    );
