-- Módulo "Centro de Custo" (Minha Organização) — tabela nova e separada da
-- `cost_centers` antiga (ver project_registros_financeiros_todas_orgs_merge e
-- o item de menu que hoje aponta pra `cost_centers` rotulado erradamente como
-- "Plano de Contas"). Decisão com o usuário: tabela nova do zero, sem migrar
-- dados antigos — Comercial/Financeiro serão re-apontados para esta em
-- migrations separadas (20270822000003+), a antiga vira legado depois.
--
-- Hierarquia de 2 níveis via parent_id (não código pontilhado como a antiga):
--   parent_id IS NULL  → grupo        (ex: "Administrativo")
--   parent_id NOT NULL → centro de custo (ex: "Administrativo > RH")
-- Trigger abaixo bloqueia um 3º nível (subgrupo de subgrupo).

CREATE TABLE IF NOT EXISTS public.cost_centers_v2 (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    empresa_id      uuid REFERENCES public.companies(id) ON DELETE SET NULL,
    parent_id       uuid REFERENCES public.cost_centers_v2(id) ON DELETE CASCADE,
    code            text NOT NULL,
    name            text NOT NULL,
    description     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cost_centers_v2 IS
    'Centro de Custo (Minha Organização) — 2 níveis via parent_id (grupo/subgrupo). '
    'Substitui cost_centers (legado, sem hierarquia real) a partir de 2027-08-22.';

-- Código (001, 002...) único por organização — "não se repete" (pedido do usuário).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_centers_v2_org_code
    ON public.cost_centers_v2 (organization_id, code);

CREATE INDEX IF NOT EXISTS idx_cost_centers_v2_parent_id ON public.cost_centers_v2(parent_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_v2_organization_id ON public.cost_centers_v2(organization_id);

-- Trava de 2 níveis: um registro só pode ter parent_id apontando para um
-- registro que, ele mesmo, seja um GRUPO (parent_id IS NULL). Bloqueia
-- grupo > subgrupo > subgrupo.
CREATE OR REPLACE FUNCTION public.fn_cost_centers_v2_enforce_two_levels()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parent_has_parent boolean;
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        IF NEW.parent_id = NEW.id THEN
            RAISE EXCEPTION 'Centro de custo não pode ser pai de si mesmo';
        END IF;

        SELECT (parent_id IS NOT NULL) INTO v_parent_has_parent
        FROM public.cost_centers_v2
        WHERE id = NEW.parent_id;

        IF v_parent_has_parent IS NULL THEN
            RAISE EXCEPTION 'Grupo informado (parent_id) não existe';
        END IF;

        IF v_parent_has_parent THEN
            RAISE EXCEPTION 'Centro de custo só suporta 2 níveis (grupo > subgrupo) — o grupo informado já é um subgrupo';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cost_centers_v2_enforce_two_levels ON public.cost_centers_v2;
CREATE TRIGGER trg_cost_centers_v2_enforce_two_levels
    BEFORE INSERT OR UPDATE OF parent_id ON public.cost_centers_v2
    FOR EACH ROW EXECUTE FUNCTION public.fn_cost_centers_v2_enforce_two_levels();

-- Um grupo com filhos não pode virar subgrupo de outro grupo (evitaria um
-- 3º nível retroativo — ex: promover um filho para pai de um grupo que já tem filhos).
CREATE OR REPLACE FUNCTION public.fn_cost_centers_v2_block_parent_with_children()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.cost_centers_v2 WHERE parent_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Este grupo tem subgrupos vinculados — não pode virar subgrupo de outro grupo';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cost_centers_v2_block_parent_with_children ON public.cost_centers_v2;
CREATE TRIGGER trg_cost_centers_v2_block_parent_with_children
    BEFORE UPDATE OF parent_id ON public.cost_centers_v2
    FOR EACH ROW EXECUTE FUNCTION public.fn_cost_centers_v2_block_parent_with_children();

DROP TRIGGER IF EXISTS trg_cost_centers_v2_updated_at ON public.cost_centers_v2;
CREATE OR REPLACE FUNCTION public.fn_cost_centers_v2_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cost_centers_v2_updated_at
    BEFORE UPDATE ON public.cost_centers_v2
    FOR EACH ROW EXECUTE FUNCTION public.fn_cost_centers_v2_touch_updated_at();

-- RPC de código sequencial (001/002/003...), mesmo molde de
-- get_next_payment_account_code (20270112000000_add_entity_codes.sql).
CREATE OR REPLACE FUNCTION public.get_next_cost_center_v2_code(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_max_code int;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('cost_center_v2_code_' || p_org_id::text));

    SELECT COALESCE(MAX(CAST(code AS integer)), 0)
      INTO v_max_code
      FROM public.cost_centers_v2
     WHERE organization_id = p_org_id
       AND code ~ '^\d+$';

    RETURN LPAD((v_max_code + 1)::text, 3, '0');
END;
$$;

-- RPC nova = REVOKE PUBLIC (feedback_rpc_revoke_public_default) — GRANT to
-- authenticated sozinho não bloqueia anon; revogar explicitamente.
REVOKE ALL ON FUNCTION public.get_next_cost_center_v2_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_cost_center_v2_code(uuid) TO authenticated;

-- RLS — padrão atual (organization_members.email = auth.jwt()->>'email',
-- só authenticated, sem policy anon) — ver 20270208000007_purchase_orders_enable_rls.sql.
ALTER TABLE public.cost_centers_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_centers_v2_select_org" ON public.cost_centers_v2
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cost_centers_v2.organization_id
              AND om.email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY "cost_centers_v2_insert_org" ON public.cost_centers_v2
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cost_centers_v2.organization_id
              AND om.email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY "cost_centers_v2_update_org" ON public.cost_centers_v2
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cost_centers_v2.organization_id
              AND om.email = auth.jwt() ->> 'email'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cost_centers_v2.organization_id
              AND om.email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY "cost_centers_v2_delete_org" ON public.cost_centers_v2
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cost_centers_v2.organization_id
              AND om.email = auth.jwt() ->> 'email'
        )
    );
