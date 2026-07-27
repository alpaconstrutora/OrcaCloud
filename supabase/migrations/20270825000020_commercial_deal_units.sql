-- ═══════════════════════════════════════════════════════════════════════════
-- Contrato comercial com MÚLTIPLAS UNIDADES (Locações + Vendas)
--
-- Até aqui o eixo comercial era 1 negociação ↔ 1 unidade (commercial_deals.property_id).
-- Na prática um inquilino aluga apartamento + vaga + box sob UM contrato, e uma
-- empresa aluga N salas no mesmo edifício. Esta tabela é a lista de itens do
-- contrato, no mesmo padrão header+itens de contracts/contract_items.
--
-- commercial_deals.property_id NÃO é removido: continua apontando para a unidade
-- PRINCIPAL, e é a chave de compatibilidade de todo o código legado (Dashboard,
-- Portal do Corretor, BI, Espelho) que ainda lê a coluna direta.
--
-- ⚠️ DDL com FK em tabela quente deadlocka neste banco (commercial_properties e
-- commercial_deals são quentes). Por isso: cria a tabela SEM FK e adiciona cada
-- constraint depois, com lock_timeout curto. Idempotente do começo ao fim.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Tabela (sem FK — nenhum lock em tabela quente aqui)
CREATE TABLE IF NOT EXISTS commercial_deal_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL,
    property_id UUID NOT NULL,
    organization_id UUID,
    value NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Unicidade e índices
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_units_deal_property
    ON commercial_deal_units(deal_id, property_id);
CREATE INDEX IF NOT EXISTS idx_deal_units_deal ON commercial_deal_units(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_units_property ON commercial_deal_units(property_id);
CREATE INDEX IF NOT EXISTS idx_deal_units_org ON commercial_deal_units(organization_id);

-- 3. FKs — uma por vez, com lock_timeout curto (< deadlock_timeout).
--    Se não conseguir o lock agora, a migration NÃO falha: a tabela funciona
--    sem a FK e o ALTER pode ser reexecutado (é idempotente).
DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'commercial_deal_units_deal_fk'
    ) THEN
        ALTER TABLE commercial_deal_units
            ADD CONSTRAINT commercial_deal_units_deal_fk
            FOREIGN KEY (deal_id) REFERENCES commercial_deals(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK deal_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'commercial_deal_units_property_fk'
    ) THEN
        ALTER TABLE commercial_deal_units
            ADD CONSTRAINT commercial_deal_units_property_fk
            FOREIGN KEY (property_id) REFERENCES commercial_properties(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK property_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

-- 4. RLS — mesmo padrão de commercial_properties/commercial_deals.
--    Somente `authenticated`; anon NÃO recebe grant.
ALTER TABLE commercial_deal_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable access to organization members" ON commercial_deal_units;
CREATE POLICY "Enable access to organization members" ON commercial_deal_units
    FOR ALL TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM commercial_properties p
            WHERE p.id = commercial_deal_units.property_id
              AND public.is_org_member(p.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    )
    WITH CHECK (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM commercial_properties p
            WHERE p.id = commercial_deal_units.property_id
              AND public.is_org_member(p.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

REVOKE ALL ON commercial_deal_units FROM PUBLIC;
REVOKE ALL ON commercial_deal_units FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON commercial_deal_units TO authenticated;

-- 5. Backfill — cada negociação existente vira 1 item primário.
--    A org vem da property (fonte de verdade usada por saveDeal), com fallback no deal.
INSERT INTO commercial_deal_units (deal_id, property_id, organization_id, value, is_primary)
SELECT d.id,
       d.property_id,
       COALESCE(p.organization_id, d.organization_id),
       COALESCE(d.value, 0),
       true
FROM commercial_deals d
LEFT JOIN commercial_properties p ON p.id = d.property_id
WHERE d.property_id IS NOT NULL
ON CONFLICT (deal_id, property_id) DO NOTHING;

COMMENT ON TABLE commercial_deal_units IS
    'Unidades que compõem uma negociação/contrato comercial (venda ou locação). '
    'A linha is_primary espelha commercial_deals.property_id; commercial_deals.value '
    'é a SOMA dos value desta tabela.';
