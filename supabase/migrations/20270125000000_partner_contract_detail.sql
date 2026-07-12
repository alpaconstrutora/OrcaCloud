-- ==========================================================================
-- Migration: detalhe de contrato (itens/aditivos/medições) no Portal do
-- Parceiro -- hoje só o resumo (contracts) é visível; a RLS destas 3
-- tabelas não tinha nenhuma policy para o parceiro, mesmo padrão do que
-- corrigiu contracts em 20270119000000_partner_contracts_rls.sql.
-- ==========================================================================

DROP POLICY IF EXISTS "contract_items_select_partner" ON public.contract_items;
CREATE POLICY "contract_items_select_partner" ON public.contract_items
  FOR SELECT TO authenticated
  USING (
    contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE c.supplier_id IN (
        SELECT pw.supplier_id FROM public.partner_workspaces pw
        JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
        WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
      )
    )
  );

DROP POLICY IF EXISTS "contract_addendums_select_partner" ON public.contract_addendums;
CREATE POLICY "contract_addendums_select_partner" ON public.contract_addendums
  FOR SELECT TO authenticated
  USING (
    contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE c.supplier_id IN (
        SELECT pw.supplier_id FROM public.partner_workspaces pw
        JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
        WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
      )
    )
  );

DROP POLICY IF EXISTS "contract_measurements_select_partner" ON public.contract_measurements;
CREATE POLICY "contract_measurements_select_partner" ON public.contract_measurements
  FOR SELECT TO authenticated
  USING (
    contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE c.supplier_id IN (
        SELECT pw.supplier_id FROM public.partner_workspaces pw
        JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
        WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
      )
    )
  );

-- ==========================================================================
-- RPC: detalhe completo do contrato via token (acesso por link)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_get_contract_detail(p_token TEXT, p_contract_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_supplier UUID;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT supplier_id INTO v_supplier FROM public.partner_workspaces WHERE id = v_ws;

    -- Confirma que o contrato pedido é de fato do fornecedor deste workspace
    IF NOT EXISTS (
        SELECT 1 FROM public.contracts c WHERE c.id = p_contract_id AND c.supplier_id = v_supplier
    ) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'items', COALESCE((
            SELECT jsonb_agg(row_to_json(i) ORDER BY i.created_at ASC)
            FROM public.contract_items i WHERE i.contract_id = p_contract_id
        ), '[]'::jsonb),
        'addendums', COALESCE((
            SELECT jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC)
            FROM public.contract_addendums a WHERE a.contract_id = p_contract_id
        ), '[]'::jsonb),
        'measurements', COALESCE((
            SELECT jsonb_agg(row_to_json(m) ORDER BY m.number DESC)
            FROM public.contract_measurements m WHERE m.contract_id = p_contract_id
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_contract_detail(TEXT, UUID) TO anon, authenticated;
