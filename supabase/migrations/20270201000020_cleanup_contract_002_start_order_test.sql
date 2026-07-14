-- Migration: correção pontual de dados — reverte teste da Fase 6
-- Durante a verificação da Fase 6 (Governança da Contratação), a Ordem de
-- Início foi emitida de verdade no contrato "002 · Reparo Vazamento" para
-- validar o gate de contractService.issueStartOrder(). Esta migration
-- devolve o contrato ao estado de pré-mobilização anterior ao teste,
-- sem tocar em nenhum outro registro.

DO $$
DECLARE
  v_contract_id UUID;
BEGIN
  SELECT id INTO v_contract_id
  FROM public.contracts
  WHERE number = '002' AND title = 'Reparo Vazamento';

  IF v_contract_id IS NULL THEN
    RAISE NOTICE 'Contrato 002/Reparo Vazamento não encontrado — nada a reverter.';
    RETURN;
  END IF;

  UPDATE public.contracts
  SET start_order_issued_at = NULL,
      start_order_authorized_by = NULL
  WHERE id = v_contract_id;

  UPDATE public.contract_precedent_conditions
  SET satisfied = false, satisfied_at = NULL
  WHERE contract_id = v_contract_id;
END $$;
