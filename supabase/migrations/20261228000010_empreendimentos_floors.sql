-- migration: 20261228000010_empreendimentos_floors.sql
-- Frente B: pavimento como entidade de primeira classe (template + materialização).
-- empreendimento_floors: cadastra pavimento 1× com repeat_count; geração expande para os
-- andares reais. empreendimento_units ganha floor_id como FK opcional (unidades existentes
-- sem floor_id continuam válidas — retrocompatível).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela de pavimentos template
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empreendimento_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tower_id UUID NOT NULL REFERENCES public.empreendimento_towers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'TIPO'
        CHECK (tipo IN ('SUBSOLO','TERREO','MEZANINO','TIPO','COBERTURA','TECNICO','GARAGEM','OUTRO')),
    floor_number INTEGER NOT NULL DEFAULT 1, -- número do 1º andar deste template
    repeat_count INTEGER NOT NULL DEFAULT 1 CHECK (repeat_count > 0),
    units_per_floor INTEGER,                 -- NULL = herdar de empreendimento_towers.units_per_floor
    prefix TEXT,                             -- prefixo opcional: 'A' → A101, A102
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS empr_floors_tower_idx ON public.empreendimento_floors (tower_id);

DROP TRIGGER IF EXISTS update_empreendimento_floors_updated_at ON public.empreendimento_floors;
CREATE TRIGGER update_empreendimento_floors_updated_at
    BEFORE UPDATE ON public.empreendimento_floors
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FK opcional em empreendimento_units
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES public.empreendimento_floors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS empr_units_floor_idx ON public.empreendimento_units (floor_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS (reusa empr_user_org_ids() criada em migration 20261228000002)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.empreendimento_floors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_empr_floors" ON public.empreendimento_floors;
CREATE POLICY "org_access_empr_floors" ON public.empreendimento_floors
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.empreendimento_towers t
            JOIN public.empreendimentos e ON e.id = t.empreendimento_id
            WHERE t.id = empreendimento_floors.tower_id
            AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.empreendimento_towers t
            JOIN public.empreendimentos e ON e.id = t.empreendimento_id
            WHERE t.id = empreendimento_floors.tower_id
            AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    );
