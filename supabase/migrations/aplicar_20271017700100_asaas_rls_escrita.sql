-- Integração Asaas — Fase 4, passo 2: escrita em pagamentos/cobranças só pelo servidor
--
-- Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 4).
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
--
-- Quem grava supplier_payments e client_charges é SEMPRE uma Edge Function
-- (service_role), que já exige owner/admin no disparo e aplica o portão
-- (alçada, tetos, piloto, competência). Nenhuma tela grava direto — conferido
-- em 17/10/2026: as três leituras do front (supplierPaymentService.list /
-- byTransactions, boletoService.desfazerLancamento) são SELECT.
--
-- Mas a RLS de supplier_payments ainda deixava QUALQUER membro da organização
-- inserir (com status AWAITING_APPROVAL) e alterar (enquanto AWAITING/APPROVED)
-- direto pela API REST — uma porta aberta ao lado do portão. E os grants
-- padrão do Supabase davam TRUNCATE (que ignora a RLS) para authenticated.
--
-- REGRA #7
--   Pergunta 1 (policy): REMOVE as duas policies de escrita de
--   supplier_payments; ficam só as de SELECT (membro da org). client_charges
--   já não tinha policy de escrita (DELETE saiu na Fase 1).
--   Pergunta 2 (função): nenhuma função criada.

BEGIN;

DROP POLICY IF EXISTS supplier_payments_insert ON public.supplier_payments;
DROP POLICY IF EXISTS supplier_payments_update ON public.supplier_payments;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.supplier_payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.client_charges    FROM anon, authenticated;
REVOKE ALL ON public.supplier_payments FROM anon;
REVOKE ALL ON public.client_charges    FROM anon;
GRANT SELECT ON public.supplier_payments TO authenticated;
GRANT SELECT ON public.client_charges    TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE tablename IN ('supplier_payments', 'client_charges') AND cmd <> 'SELECT') THEN
        RAISE EXCEPTION 'ainda há policy de escrita em supplier_payments/client_charges';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
                WHERE table_name IN ('supplier_payments', 'client_charges')
                  AND grantee IN ('anon', 'authenticated') AND privilege_type <> 'SELECT') THEN
        RAISE EXCEPTION 'ainda há grant de escrita para anon/authenticated';
    END IF;
    RAISE NOTICE 'OK: pagamentos e cobranças Asaas só gravam pelo servidor.';
END $$;

COMMIT;
