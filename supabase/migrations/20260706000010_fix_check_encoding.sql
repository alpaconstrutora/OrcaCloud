-- Migration: Corrige CHECK constraints com encoding corrompido (Latin-1 salvo como UTF-8)
-- Date: 2026-07-06
-- Problema: arquivos de migration foram salvos em Latin-1; PostgreSQL interpretou como UTF-8
--   causando valores como 'SeparaÃ§Ã£o' em vez de 'Separação'.
--   Resultado: qualquer INSERT do frontend (UTF-8 correto) era REJEITADO pelo CHECK.
-- Tabelas afetadas: purchase_orders, quotation_requests, contracts, contract_measurements

-- 1. purchase_orders.status
--    Versão final consolidada inclui 'Em Negociação' (adicionado em 20260216000006)
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'Rascunho', 'Enviado', 'Em Negociação', 'Confirmado',
    'Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência', 'Cancelado'
  ));

-- 2. quotation_requests.status
ALTER TABLE public.quotation_requests DROP CONSTRAINT IF EXISTS quotation_requests_status_check;
ALTER TABLE public.quotation_requests ADD CONSTRAINT quotation_requests_status_check
  CHECK (status IN ('Aberta', 'Em Análise', 'Concluída', 'Cancelada'));

-- 3. contracts.contract_type
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_contract_type_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_contract_type_check
  CHECK (contract_type IN (
    'Empreitada Global', 'Preço Unitário', 'Administração', 'Subempreitada', 'Outros'
  ));

-- 4. contracts.nature
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_nature_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_nature_check
  CHECK (nature IN ('Fornecimento', 'Serviço', 'Mão de Obra', 'Locação', 'Outros'));

-- 5. contract_measurements.status
ALTER TABLE public.contract_measurements DROP CONSTRAINT IF EXISTS contract_measurements_status_check;
ALTER TABLE public.contract_measurements ADD CONSTRAINT contract_measurements_status_check
  CHECK (status IN ('Pendente', 'Em Análise', 'Processada', 'Paga', 'Cancelada'));
