-- ==========================================================================
-- Migration: fn_unit_cost_basis (F2 do PV — Rentabilidade gerencial)
-- Date: 2026-07-18
-- ==========================================================================
-- CONTEXTO
-- F2 do Plano de Vendas: mostrar rentabilidade (VPL da proposta × custo da
-- unidade × margem) ao GESTOR. Regra de ouro do PRD: o corretor NUNCA pode ver
-- custo nem margem. O enforcement fica AQUI (no banco), não só na UI — uma tela
-- some, uma RPC exposta não.
--
-- Fonte de custo: `empreendimento_units.construction_cost_sqm` × área da unidade.
-- A unidade de venda (commercial_properties) liga-se à unidade do empreendimento
-- por `empreendimento_units.commercial_property_id`.
--
-- Gate do corretor: is_org_member cobre corretores ativos (eles são membros da
-- org via broker_profiles), então a RPC precisa de um segundo passo: recusar se
-- o e-mail do chamador estiver em broker_profiles daquela org.
--
-- Espelha o padrão de fn_validate_sales_simulation (20270717000000): plpgsql,
-- SECURITY DEFINER, retorna jsonb (evita a armadilha 42702 de RETURNS TABLE).
-- REVOKE PUBLIC obrigatório: GRANT authenticated sozinho não bloqueia anon.
-- Aplicar MANUALMENTE no Supabase. NUNCA `supabase db push`.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.fn_unit_cost_basis(p_property_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org       UUID;
    v_email     TEXT := auth.jwt()->>'email';
    v_cost_sqm  NUMERIC;
    v_area      NUMERIC;
    v_cost      NUMERIC;
BEGIN
    SELECT organization_id INTO v_org
      FROM public.commercial_properties
     WHERE id = p_property_id;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Imóvel não encontrado.';
    END IF;

    IF NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'Sem permissão para esta organização.';
    END IF;

    -- GATE: corretor NUNCA vê custo/margem. is_org_member passou (corretor é
    -- membro); este segundo passo é o que barra o corretor especificamente.
    IF v_email IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.broker_profiles
         WHERE organization_id = v_org
           AND lower(email) = lower(v_email)
    ) THEN
        RAISE EXCEPTION 'Custo e margem não são visíveis para corretores.';
    END IF;

    -- Custo/m² vem da unidade do empreendimento vinculada a esta unidade de venda.
    SELECT eu.construction_cost_sqm,
           COALESCE(eu.total_area, eu.private_area)
      INTO v_cost_sqm, v_area
      FROM public.empreendimento_units eu
     WHERE eu.commercial_property_id = p_property_id
     LIMIT 1;

    -- Sem custo cadastrado (unidade não vinculada ao empreendimento, ou custo/m²
    -- em branco): retorna has_cost=false em vez de fabricar número.
    IF v_cost_sqm IS NULL OR v_cost_sqm = 0 OR v_area IS NULL OR v_area = 0 THEN
        RETURN jsonb_build_object(
            'has_cost',     false,
            'cost_basis',   NULL,
            'cost_per_sqm', v_cost_sqm,
            'area_sqm',     v_area,
            'source',       'empreendimento_unit'
        );
    END IF;

    v_cost := round(v_cost_sqm * v_area, 2);

    RETURN jsonb_build_object(
        'has_cost',     true,
        'cost_basis',   v_cost,
        'cost_per_sqm', v_cost_sqm,
        'area_sqm',     v_area,
        'source',       'empreendimento_unit'
    );
END;
$$;

-- REVOKE PUBLIC (inclui anon) antes de liberar só a authenticated.
REVOKE ALL ON FUNCTION public.fn_unit_cost_basis(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_unit_cost_basis(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_unit_cost_basis(UUID) TO authenticated;
