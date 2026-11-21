-- Fase 7.3 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md (decisão D7)
--
-- Distrato = cancelamento de uma VENDA (negociação em Contrato, Assinatura ou
-- Concluído). Até aqui o cancelamento apagava essa informação: status virava
-- CANCELLED e não dava para distinguir um distrato de uma proposta desistida.
-- Agora a etapa de onde a negociação foi cancelada fica guardada, e a data do
-- cancelamento é garantida no banco (antes só o app a preenchia).
--
-- A análise de vendas mantém a venda no mês original (bruto) e lança o distrato
-- negativo no mês do cancelamento (lib/salesAnalysis.ts, foiDistrato).
--
-- Pergunta 1 (REGRA #7): sem policy.
-- Pergunta 2: a função do gatilho não é chamável por ninguém (REVOKE de todos).
--
-- Reversão: DROP TRIGGER trg_commercial_deal_cancelamento ON commercial_deals;
-- DROP FUNCTION fn_commercial_deal_cancelamento(); ALTER TABLE commercial_deals DROP COLUMN cancelled_from_status;

ALTER TABLE public.commercial_deals
    ADD COLUMN IF NOT EXISTS cancelled_from_status text;

COMMENT ON COLUMN public.commercial_deals.cancelled_from_status IS
    'Etapa em que a negociação estava quando foi cancelada (CONTRATO/ASSINATURA/COMPLETED = distrato). Gravada pelo gatilho.';

CREATE OR REPLACE FUNCTION public.fn_commercial_deal_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
        NEW.cancelled_from_status := OLD.status;
        NEW.cancellation_date := COALESCE(NEW.cancellation_date, now());
    ELSIF NEW.status IS DISTINCT FROM 'CANCELLED' AND OLD.status = 'CANCELLED' THEN
        -- Reaberta: deixa de ser distrato.
        NEW.cancelled_from_status := NULL;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_commercial_deal_cancelamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commercial_deal_cancelamento ON public.commercial_deals;
CREATE TRIGGER trg_commercial_deal_cancelamento
    BEFORE UPDATE OF status ON public.commercial_deals
    FOR EACH ROW EXECUTE FUNCTION public.fn_commercial_deal_cancelamento();
