-- ==========================================================================
-- Migration: broker_property_access — habilitação de corretor por empreendimento
-- Date: 2026-07-22
-- Description: vínculo N:N corretor↔prédio (commercial_properties tipo BUILDING),
-- controlando quais empreendimentos aparecem no Portal do Corretor para cada um.
-- Tabela nova, sem FK em tabela quente — DDL isolada.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.broker_property_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    broker_id UUID NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.commercial_properties(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(broker_id, property_id)
);

ALTER TABLE public.broker_property_access ENABLE ROW LEVEL SECURITY;

-- Escopo por organização via commercial_properties.organization_id (a tabela
-- não guarda organization_id própria, para evitar drift entre as duas colunas).
CREATE POLICY "broker_property_access_select" ON public.broker_property_access
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.commercial_properties p
            WHERE p.id = property_id AND public.is_org_member(p.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

CREATE POLICY "broker_property_access_manage" ON public.broker_property_access
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.commercial_properties p
            WHERE p.id = property_id AND public.is_org_member(p.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.commercial_properties p
            WHERE p.id = property_id AND public.is_org_member(p.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

CREATE INDEX IF NOT EXISTS broker_property_access_broker_idx ON public.broker_property_access(broker_id);
CREATE INDEX IF NOT EXISTS broker_property_access_property_idx ON public.broker_property_access(property_id);
