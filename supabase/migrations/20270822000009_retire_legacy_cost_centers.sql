-- Aposenta a tabela `cost_centers` antiga (flat, sem hierarquia real — era
-- exibida no menu com o rótulo errado "Plano de Contas"). Todas as FKs vivas
-- (contracts, boletos, invoices, fpa_budgets, bank_transactions,
-- internal_transactions) já foram re-apontadas para `cost_centers_v2` nas
-- migrations 20270822000003-000008. purchase_orders nunca teve FK rígida
-- (era `cost_center` texto livre — migration 20270822000002 criou
-- cost_center_id apontando direto para cost_centers_v2, não para esta).
--
-- Renomeia em vez de DROP — rede de segurança. Sem chamador vivo no app depois
-- desta migration: financialRegistryService.createCostCenter/updateCostCenter/
-- deleteCostCenter/upsertCostCenters e components/CostCenterImportModal.tsx
-- (import da aba antiga) foram removidos do código na mesma leva.
ALTER TABLE IF EXISTS public.cost_centers RENAME TO cost_centers_legacy;

COMMENT ON TABLE public.cost_centers_legacy IS
    'Legado — substituída por cost_centers_v2 em 2027-08-22. Mantida renomeada (não dropada) como rede de segurança; sem FK viva apontando para ela.';
