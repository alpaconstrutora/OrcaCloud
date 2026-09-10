-- Boletos a Pagar: campo de texto livre "Descrição" (pedido de 2026-09-10).
-- Distinto de `observacoes` (nota interna, vai para invoices.notes): a descrição
-- identifica o que é o boleto e passa a alimentar `internal_transactions.description`
-- do título gerado na aprovação (antes: só o nome do beneficiário).
-- Idempotente. Aplicar com: npx supabase db query --linked -f <este arquivo>

ALTER TABLE public.boletos
    ADD COLUMN IF NOT EXISTS descricao text;

COMMENT ON COLUMN public.boletos.descricao IS 'Descrição livre do boleto (o que está sendo pago); vira description do título em Contas a Pagar';
