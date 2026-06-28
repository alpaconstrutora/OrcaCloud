-- migration: 20261228000008_fix_contracts_vendas_types.sql
-- 1. Adiciona 'Compra e Venda' ao check de contract_type (domínio VENDAS).
-- 2. Garante existência da função get_next_contract_number(TEXT, TEXT) com 2 args
--    (a variante com p_direction pode não estar no banco remoto).

-- ─── 1. Expande o check constraint de contract_type ──────────────────────────
-- A constraint pode ter nome diferente dependendo da versão do banco; usamos
-- DROP/ADD defensivo via IF EXISTS para evitar erro caso já exista.

ALTER TABLE public.contracts
    DROP CONSTRAINT IF EXISTS contracts_contract_type_check;

ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_contract_type_check CHECK (
        contract_type IN (
            'Empreitada Global', 'Empreitada Parcial', 'Preço Fechado', 'Preço Unitário',
            'Contrato por Medição', 'Contrato Recorrente', 'Manutenção', 'Prestação de Serviços',
            'Instalação', 'Reforma', 'Administração', 'Subempreitada', 'Outros',
            'Compra e Venda'
        )
    );

-- ─── 2. Recria get_next_contract_number com 2 args ───────────────────────────
-- Garante que a versão com p_direction exista (pode não ter sido aplicada no remoto).
CREATE OR REPLACE FUNCTION public.get_next_contract_number(p_org_id TEXT, p_direction TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INT;
  v_next TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('contract_number_' || p_org_id || '_' || COALESCE(p_direction, 'NULL')));

  SELECT COALESCE(MAX(
      CASE WHEN number ~ '^\d+$' THEN CAST(number AS INTEGER) ELSE 0 END
  ), 0)
    INTO v_max
    FROM public.contracts
   WHERE organization_id = p_org_id
     AND number IS NOT NULL
     AND (
        (p_direction = 'OUTGOING' AND direction = 'OUTGOING')
        OR (p_direction <> 'OUTGOING' AND (direction IS NULL OR direction = 'INCOMING'))
     );

  v_next := LPAD((v_max + 1)::TEXT, 3, '0');
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_contract_number(TEXT, TEXT) TO authenticated;
