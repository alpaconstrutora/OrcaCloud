-- Fix de segurança: 20270822000001_create_cost_centers_v2.sql revogou
-- get_next_cost_center_v2_code só de PUBLIC, mas o Supabase concede EXECUTE
-- diretamente a `anon`/`authenticated` via ALTER DEFAULT PRIVILEGES na criação
-- da função — revogar só de PUBLIC não bloqueia anon (mesmo padrão já visto
-- em fn_unit_cost_basis/fn_validate_sales_simulation). Confirmado por teste
-- real: chamada anônima retornou 200 "001" antes desta migration.
REVOKE ALL ON FUNCTION public.get_next_cost_center_v2_code(uuid) FROM anon;

-- Reafirma authenticated (idempotente, só por clareza — já concedido em 20270822000001).
GRANT EXECUTE ON FUNCTION public.get_next_cost_center_v2_code(uuid) TO authenticated;
