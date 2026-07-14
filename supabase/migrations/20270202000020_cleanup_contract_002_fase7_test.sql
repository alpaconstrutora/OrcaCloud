-- Migration: correção pontual de dados — reverte teste da Fase 7
-- A verificação da Fase 7 (Ciclo de Vida & Encerramento) emitiu um termo de
-- Recebimento Provisório e registrou uma Avaliação de Desempenho de teste no
-- contrato "002 · Reparo Vazamento". Nenhum dos dois tem exclusão pela UI
-- (recebimento e avaliação são registros de auditoria, por design). Esta
-- migration remove só os registros de teste desse contrato específico.

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

  DELETE FROM public.contract_acceptances
  WHERE contract_id = v_contract_id AND kind = 'PROVISORIO';

  DELETE FROM public.contract_evaluations
  WHERE contract_id = v_contract_id AND period = '2026-07';
END $$;
