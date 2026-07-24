-- migration: 20270824000002_rental_price_tables.sql
-- Tabela de preços versionada para LOCAÇÕES — espelho de 20261231000007
-- (Venda de Ativos), mas com eixo de valor SEPARADO do preço de venda.
--
-- Venda usa commercial_properties.price / table_price. Locação passa a usar
-- commercial_properties.rental_price (coluna nova abaixo) — assim um imóvel
-- purpose='BOTH' pode ter preço de venda E valor de aluguel sem colisão
-- (precedente: empreendimento_units.rental_price, migration 20270815000003).
--
-- ⚠️ commercial_properties é tabela QUENTE — DDL com FK/AccessExclusiveLock
-- deadlocka contra o tráfego normal (lock_timeout < deadlock_timeout).
-- Por isso:
--   (1) o ADD COLUMN roda em PASSO SEPARADO, com lock_timeout curto (falha
--       rápido em vez de deadlockar) — reexecute até pegar a janela;
--   (2) as tabelas novas NÃO têm FK para commercial_properties (building_id/
--       property_id são UUID puro) — o cascade de exclusão é da aplicação,
--       como já é o padrão do projeto (ver commercial_properties_exclusao_fk).
-- Aplicar cada bloco separadamente no SQL Editor — NUNCA `supabase db push`.

-- ── PASSO 1 (rodar sozinho; se der lock_timeout, reexecutar até passar) ──
SET lock_timeout = '3s';
ALTER TABLE public.commercial_properties
    ADD COLUMN IF NOT EXISTS rental_price NUMERIC(15,2);
RESET lock_timeout;

-- ── PASSO 2 (tabelas/RPCs novas — sem FK para tabela quente) ──
CREATE TABLE IF NOT EXISTS public.rental_price_tables (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    building_id     UUID NOT NULL,  -- ref. lógica a commercial_properties (sem FK: tabela quente)
    version_label   TEXT NOT NULL,
    effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_price_tables_one_active
    ON public.rental_price_tables(building_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_rental_price_tables_building
    ON public.rental_price_tables(building_id);

CREATE TABLE IF NOT EXISTS public.rental_price_table_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_table_id UUID NOT NULL REFERENCES public.rental_price_tables(id) ON DELETE CASCADE,
    property_id    UUID NOT NULL,  -- ref. lógica a commercial_properties (sem FK: tabela quente)
    price          NUMERIC(15,2) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (price_table_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_rental_price_table_items_table
    ON public.rental_price_table_items(price_table_id);

ALTER TABLE public.rental_price_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_price_table_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_price_tables_select ON public.rental_price_tables;
DROP POLICY IF EXISTS rental_price_tables_insert ON public.rental_price_tables;
DROP POLICY IF EXISTS rental_price_tables_update ON public.rental_price_tables;
DROP POLICY IF EXISTS rental_price_tables_delete ON public.rental_price_tables;
CREATE POLICY rental_price_tables_select ON public.rental_price_tables FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY rental_price_tables_insert ON public.rental_price_tables FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY rental_price_tables_update ON public.rental_price_tables FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY rental_price_tables_delete ON public.rental_price_tables FOR DELETE USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS rental_price_table_items_select ON public.rental_price_table_items;
DROP POLICY IF EXISTS rental_price_table_items_insert ON public.rental_price_table_items;
DROP POLICY IF EXISTS rental_price_table_items_update ON public.rental_price_table_items;
DROP POLICY IF EXISTS rental_price_table_items_delete ON public.rental_price_table_items;
CREATE POLICY rental_price_table_items_select ON public.rental_price_table_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.rental_price_tables t WHERE t.id = price_table_id AND public.is_org_member(t.organization_id))
);
CREATE POLICY rental_price_table_items_insert ON public.rental_price_table_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.rental_price_tables t WHERE t.id = price_table_id AND public.is_org_member(t.organization_id))
);
CREATE POLICY rental_price_table_items_update ON public.rental_price_table_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.rental_price_tables t WHERE t.id = price_table_id AND public.is_org_member(t.organization_id))
);
CREATE POLICY rental_price_table_items_delete ON public.rental_price_table_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.rental_price_tables t WHERE t.id = price_table_id AND public.is_org_member(t.organization_id))
);

-- Ativa uma tabela de aluguéis atomicamente: grava rental_price (NÃO price/
-- table_price — esses são de venda) em cada commercial_properties vinculada,
-- supersede a ativa anterior do mesmo prédio e marca esta como active.
CREATE OR REPLACE FUNCTION public.fn_activate_rental_price_table(p_table_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_count INTEGER;
BEGIN
    SELECT * INTO v_table FROM public.rental_price_tables WHERE id = p_table_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tabela de aluguéis não encontrada.';
    END IF;
    IF NOT public.is_org_member(v_table.organization_id) THEN
        RAISE EXCEPTION 'Sem permissão para esta organização.';
    END IF;
    IF v_table.status = 'active' THEN
        RETURN json_build_object('properties_updated', 0, 'already_active', true);
    END IF;

    UPDATE public.commercial_properties cp
       SET rental_price = i.price, updated_at = NOW()
      FROM public.rental_price_table_items i
     WHERE i.price_table_id = p_table_id
       AND cp.id = i.property_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.rental_price_tables
       SET status = 'superseded'
     WHERE building_id = v_table.building_id
       AND status = 'active';

    UPDATE public.rental_price_tables
       SET status = 'active', activated_at = NOW()
     WHERE id = p_table_id;

    RETURN json_build_object('properties_updated', v_count, 'already_active', false);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_activate_rental_price_table(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_activate_rental_price_table(UUID) TO authenticated;

-- ==========================================================================
-- RPC anon: tabela de aluguéis vigente de um prédio, para o Portal do Corretor
-- via link (token), sem login. Espelho de fn_broker_portal_get_price_table
-- (20270819000007), lendo rental_price em vez de price.
-- Isolamento cross-tenant: org vem SEMPRE de v_tok.org_id.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_rental_price_table(p_token TEXT, p_building_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok   public.broker_portal_tokens;
    v_bldg  public.commercial_properties;
    v_table public.rental_price_tables;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bldg
    FROM public.commercial_properties
    WHERE id = p_building_id AND organization_id = v_tok.org_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_table
    FROM public.rental_price_tables
    WHERE building_id = p_building_id
      AND organization_id = v_tok.org_id
      AND status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', TRUE, 'table', NULL, 'items', '[]'::jsonb);
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'table', jsonb_build_object(
            'id', v_table.id,
            'version_label', v_table.version_label,
            'effective_date', v_table.effective_date,
            'status', v_table.status,
            'activated_at', v_table.activated_at
        ),
        'items', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', it.id,
                'price_table_id', it.price_table_id,
                'property_id', it.property_id,
                'price', it.price,
                'property_name', p.name,
                'current_price', p.rental_price,
                'property_status', p.status,
                'private_area', p.private_area,
                'bedrooms', COALESCE(NULLIF(p.bedrooms, 0), NULLIF((p.specs->>'bedrooms')::int, 0)),
                'bathrooms', COALESCE(NULLIF(p.bathrooms, 0), NULLIF((p.specs->>'bathrooms')::int, 0)),
                'parking_spaces', COALESCE(NULLIF(p.parking_spaces, 0), NULLIF((p.specs->>'parkingSpaces')::int, 0)),
                'floor', COALESCE(NULLIF(p.floor, 0), NULLIF((p.specs->>'floor')::int, 0)),
                'position_type', p.position_type
             ))
             FROM public.rental_price_table_items it
             JOIN public.commercial_properties p ON p.id = it.property_id
             WHERE it.price_table_id = v_table.id
               AND p.organization_id = v_tok.org_id),
            '[]'::jsonb
        )
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_rental_price_table(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_rental_price_table(TEXT, UUID) TO anon, authenticated;
