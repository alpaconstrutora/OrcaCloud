-- ==========================================================================
-- Migration: UnificaÃ§Ã£o de Estoque (Portal do Corretor + Compras)
-- Date: 2026-03-10
-- Description: Remove broker_portal_units e integra com commercial_properties
-- ==========================================================================

-- 1. Limpeza: Remover a tabela redundante
DROP TABLE IF EXISTS public.broker_portal_units CASCADE;

-- 2. Expandir commercial_properties com campos especÃ­ficos do portal
ALTER TABLE public.commercial_properties 
    ADD COLUMN IF NOT EXISTS block TEXT,
    ADD COLUMN IF NOT EXISTS floor INTEGER,
    ADD COLUMN IF NOT EXISTS number TEXT,
    ADD COLUMN IF NOT EXISTS typology TEXT,
    ADD COLUMN IF NOT EXISTS sun_position TEXT,
    ADD COLUMN IF NOT EXISTS current_price NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS bedrooms INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bathrooms INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS parking_spaces INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS private_area NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS total_area NUMERIC(10,2);

-- 3. Atualizar FKs e Renomear Colunas para alinhar com a nova tipagem
-- Renomear unit_id para property_id (BrokerProposal e BrokerReservation)
ALTER TABLE public.broker_portal_proposals 
    RENAME COLUMN unit_id TO property_id;

ALTER TABLE public.broker_portal_reservations 
    RENAME COLUMN unit_id TO property_id;

-- Recriar as Constraints com os novos nomes
ALTER TABLE public.broker_portal_proposals 
    DROP CONSTRAINT IF EXISTS broker_portal_proposals_unit_id_fkey,
    ADD CONSTRAINT broker_portal_proposals_property_id_fkey 
        FOREIGN KEY (property_id) REFERENCES public.commercial_properties(id) ON DELETE RESTRICT;

ALTER TABLE public.broker_portal_reservations 
    DROP CONSTRAINT IF EXISTS broker_portal_reservations_unit_id_fkey,
    ADD CONSTRAINT broker_portal_reservations_property_id_fkey 
        FOREIGN KEY (property_id) REFERENCES public.commercial_properties(id) ON DELETE CASCADE;

-- 4. Adicionar Ã­ndices para busca rÃ¡pida (Mapa de Unidades)
CREATE INDEX IF NOT EXISTS idx_properties_project_block ON public.commercial_properties(project_id, block);
CREATE INDEX IF NOT EXISTS idx_properties_number ON public.commercial_properties(number);

-- 5. Atualizar Realtime (com check para evitar erro de duplicidade)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'commercial_properties'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_properties;
    END IF;
END $$;
