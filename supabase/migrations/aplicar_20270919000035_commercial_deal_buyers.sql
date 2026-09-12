-- ═══════════════════════════════════════════════════════════════════════════
-- Negociação comercial com MÚLTIPLOS COMPRADORES (Venda de Unidades)
--
-- Até aqui o eixo comercial era 1 negociação ↔ 1 comprador
-- (commercial_deals.client_id). Na prática um imóvel é comprado por casal,
-- sócios ou pai + filho sob UM contrato. Esta tabela é a lista de compradores
-- da negociação, no MESMO desenho de commercial_deal_units (20270825000020):
-- header + itens, com uma linha principal.
--
-- commercial_deals.client_id NÃO é removido: continua apontando para o comprador
-- PRINCIPAL, e é a chave de compatibilidade de todo o código que ainda lê a
-- coluna direta (contrato, tributos, workflow, listagens, Portal do Cliente,
-- assinatura eletrônica).
--
-- ⚠️ DDL com FK em tabela quente deadlocka neste banco (commercial_deals e
-- clients são quentes). Por isso: cria a tabela SEM FK e adiciona cada
-- constraint depois, com lock_timeout curto. Idempotente do começo ao fim.
--
-- Pedido: docs/planos/2026-09-12-vendas-multiplos-compradores.md
-- (nasceu como 000029; renomeada antes de ser aplicada, por colisão com blueprint_aprovacao)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Tabela (sem FK — nenhum lock em tabela quente aqui)
CREATE TABLE IF NOT EXISTS commercial_deal_buyers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL,
    client_id UUID NOT NULL,
    organization_id UUID,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Unicidade e índices
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_buyers_deal_client
    ON commercial_deal_buyers(deal_id, client_id);
CREATE INDEX IF NOT EXISTS idx_deal_buyers_deal ON commercial_deal_buyers(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_buyers_client ON commercial_deal_buyers(client_id);
CREATE INDEX IF NOT EXISTS idx_deal_buyers_org ON commercial_deal_buyers(organization_id);

-- 3. FKs — uma por vez, com lock_timeout curto (< deadlock_timeout).
--    Se não conseguir o lock agora, a migration NÃO falha: a tabela funciona
--    sem a FK e o ALTER pode ser reexecutado (é idempotente).
DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'commercial_deal_buyers_deal_fk'
    ) THEN
        ALTER TABLE commercial_deal_buyers
            ADD CONSTRAINT commercial_deal_buyers_deal_fk
            FOREIGN KEY (deal_id) REFERENCES commercial_deals(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK deal_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

-- Cliente excluído sai da negociação (mesma semântica de ON DELETE CASCADE das
-- unidades). O principal em commercial_deals.client_id segue a regra que a FK
-- daquela coluna já tinha — esta tabela não a altera.
DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'commercial_deal_buyers_client_fk'
    ) THEN
        ALTER TABLE commercial_deal_buyers
            ADD CONSTRAINT commercial_deal_buyers_client_fk
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK client_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

-- 4. RLS — somente `authenticated`; anon NÃO recebe grant.
--    REGRA #7, pergunta 1: cada perna do OR checa membership de organização —
--    a da própria linha ou a da negociação dona. Nenhuma perna libera sozinha
--    sem dizer de quem é o registro.
ALTER TABLE commercial_deal_buyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable access to organization members" ON commercial_deal_buyers;
CREATE POLICY "Enable access to organization members" ON commercial_deal_buyers
    FOR ALL TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM commercial_deals d
            WHERE d.id = commercial_deal_buyers.deal_id
              AND public.is_org_member(d.organization_id)
        )
    )
    WITH CHECK (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM commercial_deals d
            WHERE d.id = commercial_deal_buyers.deal_id
              AND public.is_org_member(d.organization_id)
        )
    );

REVOKE ALL ON commercial_deal_buyers FROM PUBLIC;
REVOKE ALL ON commercial_deal_buyers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON commercial_deal_buyers TO authenticated;

-- 5. Backfill — cada negociação existente com cliente vira 1 comprador principal.
INSERT INTO commercial_deal_buyers (deal_id, client_id, organization_id, is_primary)
SELECT d.id, d.client_id, d.organization_id, true
FROM commercial_deals d
WHERE d.client_id IS NOT NULL
ON CONFLICT (deal_id, client_id) DO NOTHING;

COMMENT ON TABLE commercial_deal_buyers IS
    'Compradores (ou locatários) de uma negociação comercial. '
    'A linha is_primary espelha commercial_deals.client_id, que continua sendo '
    'o comprador PRINCIPAL lido por contrato, tributos, workflow e portal.';
