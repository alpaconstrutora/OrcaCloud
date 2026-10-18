-- Registro das decisões da validação de saque (Asaas → asaas-saque-validacao)
--
-- Pedido do usuário em 18/10/2026, depois da conferência da documentação oficial
-- (docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks): "mantenha
-- logs das decisões" e "monitore falhas no endpoint". Até aqui a decisão só ia para
-- o log da Edge Function, que dura poucos dias e não é consultável pelo app.
-- Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md.
--
-- Uma linha por pergunta da Asaas: tipo, id da Asaas, valor, aprovado/recusado,
-- motivo, se o registro foi achado pela busca de reserva, e o pagamento ligado.
-- Pergunta de operação que o OrçaCloud não disparou fica sem organização (só o
-- service_role vê) — é justamente o rastro de tentativa estranha.
--
-- REGRA #7, pergunta 1 (policies): RLS ligada; SELECT só para gestor da organização
-- do pagamento (`is_org_manager`). Nenhuma policy de escrita: só a Edge Function
-- (service_role) grava. INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER revogados
-- de anon/authenticated (tabela nova herda esses grants no Supabase).
-- REGRA #7, pergunta 2 (funções): nenhuma função nova.
-- FKs SEM cascade de apagar: o registro sobrevive ao pagamento e à organização
-- (ON DELETE SET NULL), como a auditoria de pagamentos.

CREATE TABLE IF NOT EXISTS public.asaas_saque_decisoes (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at           timestamptz NOT NULL DEFAULT now(),
    organization_id      uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    supplier_payment_id  uuid REFERENCES public.supplier_payments(id) ON DELETE SET NULL,
    tipo                 text NOT NULL,
    asaas_id             text,
    valor                numeric(14,2),
    decisao              text NOT NULL CHECK (decisao IN ('APPROVED', 'REFUSED')),
    motivo               text,
    via_reserva          boolean NOT NULL DEFAULT false,
    favorecido_documento text,
    payload              jsonb
);

CREATE INDEX IF NOT EXISTS idx_asaas_saque_decisoes_criado ON public.asaas_saque_decisoes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asaas_saque_decisoes_pagamento ON public.asaas_saque_decisoes (supplier_payment_id);
CREATE INDEX IF NOT EXISTS idx_asaas_saque_decisoes_org ON public.asaas_saque_decisoes (organization_id, created_at DESC);

ALTER TABLE public.asaas_saque_decisoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asd_select ON public.asaas_saque_decisoes;
CREATE POLICY asd_select ON public.asaas_saque_decisoes
    FOR SELECT TO authenticated
    USING (organization_id IS NOT NULL AND public.is_org_manager(organization_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.asaas_saque_decisoes FROM anon, authenticated;
REVOKE ALL ON public.asaas_saque_decisoes FROM anon;
GRANT SELECT ON public.asaas_saque_decisoes TO authenticated;
