-- migration: 20261231000007_commercial_price_tables.sql
-- Fase 1 do PLANO_MODULO_VENDA_ATIVOS.md — tabela de preços versionada + reajuste em
-- massa para unidades comerciais (commercial_properties). `price`/`table_price` já
-- existiam na tabela (20260311200000) mas sempre espelhavam um só valor, sem histórico.
-- Aqui: 1 tabela por prédio pode estar 'active' por vez (índice único parcial);
-- versões antigas viram 'superseded' ao ativar uma nova.

CREATE TABLE IF NOT EXISTS public.commercial_price_tables (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    building_id     UUID NOT NULL REFERENCES public.commercial_properties(id) ON DELETE CASCADE,
    version_label   TEXT NOT NULL,
    effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_price_tables_one_active
    ON public.commercial_price_tables(building_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_commercial_price_tables_building
    ON public.commercial_price_tables(building_id);

CREATE TABLE IF NOT EXISTS public.commercial_price_table_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_table_id UUID NOT NULL REFERENCES public.commercial_price_tables(id) ON DELETE CASCADE,
    property_id    UUID NOT NULL REFERENCES public.commercial_properties(id) ON DELETE CASCADE,
    price          NUMERIC(15,2) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (price_table_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_price_table_items_table
    ON public.commercial_price_table_items(price_table_id);

ALTER TABLE public.commercial_price_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_price_table_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_price_tables_select ON public.commercial_price_tables;
DROP POLICY IF EXISTS commercial_price_tables_insert ON public.commercial_price_tables;
DROP POLICY IF EXISTS commercial_price_tables_update ON public.commercial_price_tables;
DROP POLICY IF EXISTS commercial_price_tables_delete ON public.commercial_price_tables;
CREATE POLICY commercial_price_tables_select ON public.commercial_price_tables FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY commercial_price_tables_insert ON public.commercial_price_tables FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY commercial_price_tables_update ON public.commercial_price_tables FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY commercial_price_tables_delete ON public.commercial_price_tables FOR DELETE USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS commercial_price_table_items_select ON public.commercial_price_table_items;
DROP POLICY IF EXISTS commercial_price_table_items_insert ON public.commercial_price_table_items;
DROP POLICY IF EXISTS commercial_price_table_items_update ON public.commercial_price_table_items;
DROP POLICY IF EXISTS commercial_price_table_items_delete ON public.commercial_price_table_items;
CREATE POLICY commercial_price_table_items_select ON public.commercial_price_table_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.commercial_price_tables t WHERE t.id = price_table_id AND public.is_org_member(t.organization_id))
);
CREATE POLICY commercial_price_table_items_insert ON public.commercial_price_table_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.commercial_price_tables t WHERE t.id = price_table_id AND public.is_org_member(t.organization_id))
);
CREATE POLICY commercial_price_table_items_update ON public.commercial_price_table_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.commercial_price_tables t WHERE t.id = price_table_id AND public.is_org_member(t.organization_id))
);
CREATE POLICY commercial_price_table_items_delete ON public.commercial_price_table_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.commercial_price_tables t WHERE t.id = price_table_id AND public.is_org_member(t.organization_id))
);

-- Ativa uma tabela de preços atomicamente: grava price/table_price em cada
-- commercial_properties vinculada, supersede a tabela ativa anterior do mesmo
-- prédio e marca esta como active. Tudo em uma transação (evita 2 ativas
-- simultâneas se algo falhar no meio de updates sequenciais via client).
CREATE OR REPLACE FUNCTION public.fn_activate_commercial_price_table(p_table_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_count INTEGER;
BEGIN
    SELECT * INTO v_table FROM public.commercial_price_tables WHERE id = p_table_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tabela de preços não encontrada.';
    END IF;
    IF NOT public.is_org_member(v_table.organization_id) THEN
        RAISE EXCEPTION 'Sem permissão para esta organização.';
    END IF;
    IF v_table.status = 'active' THEN
        RETURN json_build_object('properties_updated', 0, 'already_active', true);
    END IF;

    UPDATE public.commercial_properties cp
       SET price = i.price, table_price = i.price, updated_at = NOW()
      FROM public.commercial_price_table_items i
     WHERE i.price_table_id = p_table_id
       AND cp.id = i.property_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.commercial_price_tables
       SET status = 'superseded'
     WHERE building_id = v_table.building_id
       AND status = 'active';

    UPDATE public.commercial_price_tables
       SET status = 'active', activated_at = NOW()
     WHERE id = p_table_id;

    RETURN json_build_object('properties_updated', v_count, 'already_active', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_activate_commercial_price_table(UUID) TO authenticated;
