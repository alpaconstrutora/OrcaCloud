-- Integração Asaas — Fase 4, passo 1: histórico de cada pagamento de saída
--
-- Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 4).
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar ANTES de publicar a asaas-payment que grava cancelled_by_email.
--
-- Por GATILHO, não pela Edge: assim nenhuma mudança de supplier_payments fica
-- sem registro — disparo (asaas-payment), conclusão/falha/estorno (webhook e
-- asaas-status-sync), cancelamento. Modelo: boletos_auditoria, MENOS o defeito
-- dela — `boleto_id ON DELETE CASCADE` apagava o histórico junto com o boleto.
-- Aqui não há FK: o histórico sobrevive ao pagamento.
--
-- Autor de cada linha:
--   • sessão com usuário (JWT)           → e-mail do JWT
--   • criação pela Edge (service_role)   → created_by_email
--   • disparo (APPROVED → PENDING/SCHEDULED/FAILED pela Edge) → approved_by_email
--   • cancelamento pela tela             → cancelled_by_email (gravado pela Edge)
--   • o resto (webhook/polling)          → 'Asaas'
--
-- REGRA #7
--   Pergunta 1 (policy): uma policy, SELECT, `is_org_member(organization_id)` —
--   sem OR. Nenhuma policy de escrita: só o gatilho grava.
--   Pergunta 2 (função): fn_supplier_payments_auditoria — SECURITY DEFINER
--   (grava numa tabela sem policy de escrita); é função de GATILHO, ninguém a
--   chama direto. REVOKE EXECUTE de PUBLIC/anon/authenticated.

BEGIN;

ALTER TABLE public.supplier_payments
    ADD COLUMN IF NOT EXISTS cancelled_by_email text,
    ADD COLUMN IF NOT EXISTS cancelled_at       timestamptz;
COMMENT ON COLUMN public.supplier_payments.cancelled_by_email IS
    'Quem cancelou pela tela (gravado pela Edge asaas-payment). Nulo em cancelamento vindo da Asaas.';

CREATE TABLE IF NOT EXISTS public.supplier_payments_auditoria (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_payment_id uuid NOT NULL,
    organization_id     uuid NOT NULL,
    acao                text NOT NULL CHECK (acao IN ('criado', 'status', 'atualizado', 'excluido')),
    status_antes        text,
    status_depois       text,
    valor               numeric(15,2),
    autor               text NOT NULL,
    detalhe             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.supplier_payments_auditoria IS
    'Histórico imutável dos pagamentos de saída pela Asaas (boleto e PIX). Escrito só pelo gatilho; sem FK de propósito.';
CREATE INDEX IF NOT EXISTS idx_sp_auditoria_pagamento ON public.supplier_payments_auditoria (supplier_payment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sp_auditoria_org ON public.supplier_payments_auditoria (organization_id, created_at);

ALTER TABLE public.supplier_payments_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spa_select ON public.supplier_payments_auditoria;
CREATE POLICY spa_select ON public.supplier_payments_auditoria
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.supplier_payments_auditoria FROM anon, authenticated;
REVOKE ALL ON public.supplier_payments_auditoria FROM anon;
GRANT SELECT ON public.supplier_payments_auditoria TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_supplier_payments_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_jwt   text := nullif(current_setting('request.jwt.claims', true), '');
    v_email text;
    v_autor text;
    v_acao  text;
    r       public.supplier_payments%ROWTYPE;
BEGIN
    IF v_jwt IS NOT NULL THEN
        v_email := nullif(v_jwt::jsonb ->> 'email', '');
    END IF;
    r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

    IF TG_OP = 'INSERT' THEN
        v_acao  := 'criado';
        v_autor := coalesce(v_email, NEW.created_by_email, 'sistema');
    ELSIF TG_OP = 'DELETE' THEN
        v_acao  := 'excluido';
        v_autor := coalesce(v_email, 'sistema');
    ELSE
        -- Só registra o que importa: status, motivo, ids da Asaas, taxa,
        -- comprovante, autorização por token. Toque de updated_at não vira linha.
        IF NEW.status IS NOT DISTINCT FROM OLD.status
           AND NEW.failure_reason IS NOT DISTINCT FROM OLD.failure_reason
           AND NEW.asaas_bill_id IS NOT DISTINCT FROM OLD.asaas_bill_id
           AND NEW.asaas_transfer_id IS NOT DISTINCT FROM OLD.asaas_transfer_id
           AND NEW.fee IS NOT DISTINCT FROM OLD.fee
           AND NEW.receipt_url IS NOT DISTINCT FROM OLD.receipt_url
           AND NEW.asaas_authorized IS NOT DISTINCT FROM OLD.asaas_authorized THEN
            RETURN NEW;
        END IF;
        v_acao := CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status' ELSE 'atualizado' END;
        v_autor := coalesce(
            v_email,
            CASE WHEN NEW.status = 'CANCELLED' AND NEW.cancelled_by_email IS NOT NULL
                       AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN NEW.cancelled_by_email END,
            CASE WHEN OLD.status = 'APPROVED' AND NEW.status IN ('PENDING', 'SCHEDULED', 'FAILED')
                  THEN NEW.approved_by_email END,
            'Asaas'
        );
    END IF;

    INSERT INTO public.supplier_payments_auditoria
        (supplier_payment_id, organization_id, acao, status_antes, status_depois, valor, autor, detalhe)
    VALUES (
        r.id, r.organization_id, v_acao,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END,
        r.value, v_autor,
        jsonb_strip_nulls(jsonb_build_object(
            'tipo', r.payment_type,
            'transaction_id', r.transaction_id,
            'boleto_id', r.boleto_id,
            'asaas_bill_id', r.asaas_bill_id,
            'asaas_transfer_id', r.asaas_transfer_id,
            'favorecido', r.beneficiary_name,
            'favorecido_origem', r.favorecido_origem,
            'pix_key_type', r.pix_key_type,
            'agendado_para', r.scheduled_date,
            'taxa', r.fee,
            'motivo', r.failure_reason,
            'comprovante', r.receipt_url,
            'aguardando_token', CASE WHEN r.asaas_authorized = false THEN true END,
            'conta', r.payment_account_id
        ))
    );
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_supplier_payments_auditoria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supplier_payments_auditoria ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payments_auditoria
    AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
    FOR EACH ROW EXECUTE FUNCTION public.fn_supplier_payments_auditoria();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_supplier_payments_auditoria') THEN
        RAISE EXCEPTION 'gatilho de auditoria não criado';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'supplier_payments_auditoria' AND cmd <> 'SELECT') THEN
        RAISE EXCEPTION 'supplier_payments_auditoria tem policy de escrita';
    END IF;
    RAISE NOTICE 'OK: histórico de pagamentos Asaas ligado.';
END $$;

COMMIT;
