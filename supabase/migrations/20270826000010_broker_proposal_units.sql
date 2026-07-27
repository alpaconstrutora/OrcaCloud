-- ═══════════════════════════════════════════════════════════════════════════
-- Proposta do Portal do Corretor com MÚLTIPLAS UNIDADES (cesta)
--
-- Até aqui `broker_portal_proposals` era 1 unidade por proposta: property_id
-- NOT NULL e unit_price/total_value/down_payment/monthly_* gravados no header
-- como valores DAQUELA unidade. Quem vende apto + vaga + box para o mesmo
-- comprador tinha que enviar 3 propostas, com 3 fluxos de pagamento, 3 links
-- e 3 PDFs — uma negociação fatiada que não corresponde ao que se assina.
--
-- Esta tabela é a lista de itens da proposta, no mesmo padrão header+itens de
-- commercial_deal_units e commercial_price_table_items.
--
-- REGRAS DA CESTA (decisão do usuário 2026-07-26):
--   • Só unidades do MESMO empreendimento (mesmo parent_id) — sales_plans é
--     por building_id, então cesta cross-prédio exigiria N planos/políticas.
--   • UM desconto e UM plano de pagamento para a cesta (fica no header).
--   • Rateio pro rata do preço de tabela, editável → allocated_value.
--
-- `broker_portal_proposals.property_id` NÃO é removido: continua sendo a
-- unidade PRINCIPAL, e é o que mantém funcionando sem alteração o
-- PropertyUnitMap, a edge function notify-broker-proposal, o funil do
-- salesDashboardService e broker_portal_commissions.unit_number/block.
--
-- Passa a valer no header: unit_price = SOMA dos preços de tabela;
-- total_value = soma após o desconto único. Para as linhas legadas (1 unidade)
-- isso já era verdade, então o backfill é consistente sem reescrever o header.
--
-- ⚠️ DDL com FK em tabela quente deadlocka neste banco. Mesma receita da
-- migration 20270825000020: cria a tabela SEM FK e adiciona cada constraint
-- depois, com lock_timeout curto. Idempotente e reexecutável.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Tabela (sem FK — nenhum lock em tabela quente aqui)
CREATE TABLE IF NOT EXISTS public.broker_portal_proposal_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL,
    property_id UUID NOT NULL,
    organization_id UUID,
    -- Preço de tabela da unidade NO MOMENTO do envio (snapshot, como o
    -- unit_price do header sempre foi).
    unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- Cota desta unidade no total_value da cesta. Nasce pro rata do unit_price
    -- e o corretor pode ajustar; a soma tem que fechar com o total.
    allocated_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Unicidade e índices
CREATE UNIQUE INDEX IF NOT EXISTS uq_proposal_units_proposal_property
    ON public.broker_portal_proposal_units(proposal_id, property_id);
CREATE INDEX IF NOT EXISTS idx_proposal_units_proposal
    ON public.broker_portal_proposal_units(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_units_property
    ON public.broker_portal_proposal_units(property_id);
CREATE INDEX IF NOT EXISTS idx_proposal_units_org
    ON public.broker_portal_proposal_units(organization_id);

-- 3. FKs — uma por vez, lock_timeout curto (< deadlock_timeout). Se o lock não
--    vier agora, a migration NÃO falha: a tabela funciona sem a FK e o ALTER
--    pode ser reexecutado. (A FK de property_id é o que permite o embed do
--    PostgREST resolver `units:broker_portal_proposal_units(...)`.)
DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'broker_proposal_units_proposal_fk'
    ) THEN
        ALTER TABLE public.broker_portal_proposal_units
            ADD CONSTRAINT broker_proposal_units_proposal_fk
            FOREIGN KEY (proposal_id) REFERENCES public.broker_portal_proposals(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK proposal_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'broker_proposal_units_property_fk'
    ) THEN
        ALTER TABLE public.broker_portal_proposal_units
            ADD CONSTRAINT broker_proposal_units_property_fk
            FOREIGN KEY (property_id) REFERENCES public.commercial_properties(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK property_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

-- 4. RLS — espelha as policies vigentes de broker_portal_proposals
--    (select: dono pelo e-mail OU membro da org; insert: idem, com is_org_member).
--    `anon` NÃO recebe grant: o caminho público é só via RPC SECURITY DEFINER.
ALTER TABLE public.broker_portal_proposal_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broker_proposal_units_select" ON public.broker_portal_proposal_units;
CREATE POLICY "broker_proposal_units_select" ON public.broker_portal_proposal_units
    FOR SELECT TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.broker_portal_proposals pr
             WHERE pr.id = broker_portal_proposal_units.proposal_id
               AND (
                   LOWER(pr.broker_email) = LOWER(auth.jwt()->>'email')
                   OR public.is_org_member(pr.organization_id)
               )
        )
        OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com')
    );

DROP POLICY IF EXISTS "broker_proposal_units_insert" ON public.broker_portal_proposal_units;
CREATE POLICY "broker_proposal_units_insert" ON public.broker_portal_proposal_units
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_org_member(organization_id)
        AND EXISTS (
            SELECT 1 FROM public.broker_portal_proposals pr
             WHERE pr.id = broker_portal_proposal_units.proposal_id
               AND (
                   LOWER(pr.broker_email) = LOWER(auth.jwt()->>'email')
                   OR EXISTS (
                       SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = pr.organization_id
                          AND LOWER(om.email) = LOWER(auth.jwt()->>'email')
                   )
                   OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com')
               )
        )
    );

-- Update/Delete: o simulador reenvia a cesta inteira (delete + insert dos itens),
-- então as duas operações seguem a mesma regra do select.
DROP POLICY IF EXISTS "broker_proposal_units_update" ON public.broker_portal_proposal_units;
CREATE POLICY "broker_proposal_units_update" ON public.broker_portal_proposal_units
    FOR UPDATE TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.broker_portal_proposals pr
             WHERE pr.id = broker_portal_proposal_units.proposal_id
               AND LOWER(pr.broker_email) = LOWER(auth.jwt()->>'email')
        )
        OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com')
    );

DROP POLICY IF EXISTS "broker_proposal_units_delete" ON public.broker_portal_proposal_units;
CREATE POLICY "broker_proposal_units_delete" ON public.broker_portal_proposal_units
    FOR DELETE TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.broker_portal_proposals pr
             WHERE pr.id = broker_portal_proposal_units.proposal_id
               AND LOWER(pr.broker_email) = LOWER(auth.jwt()->>'email')
        )
        OR LOWER(auth.jwt()->>'email') = LOWER('admin@admin.com')
    );

REVOKE ALL ON public.broker_portal_proposal_units FROM PUBLIC;
REVOKE ALL ON public.broker_portal_proposal_units FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_portal_proposal_units TO authenticated;

-- 5. Backfill — cada proposta existente vira 1 item primário.
--    unit_price e allocated_value vêm do header (que, com 1 unidade, já é o
--    valor daquela unidade). A org vem da proposta.
INSERT INTO public.broker_portal_proposal_units
    (proposal_id, property_id, organization_id, unit_price, allocated_value, is_primary, sort_order)
SELECT pr.id,
       pr.property_id,
       pr.organization_id,
       COALESCE(pr.unit_price, pr.total_value, 0),
       COALESCE(pr.total_value, 0),
       true,
       0
FROM public.broker_portal_proposals pr
WHERE pr.property_id IS NOT NULL
ON CONFLICT (proposal_id, property_id) DO NOTHING;

COMMENT ON TABLE public.broker_portal_proposal_units IS
    'Unidades que compõem uma proposta do Portal do Corretor (cesta). Todas do mesmo '
    'empreendimento. A linha is_primary espelha broker_portal_proposals.property_id; '
    'o header carrega unit_price = SOMA das tabelas e total_value = soma após o desconto '
    'único da cesta. allocated_value é a cota pro rata (editável) de cada unidade.';
