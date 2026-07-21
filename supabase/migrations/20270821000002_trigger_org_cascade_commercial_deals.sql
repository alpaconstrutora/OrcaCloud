-- ==========================================================================
-- TRAVA DE ORGANIZAÇÃO EM CASCATA (2/3) — commercial_deals
-- Date: 2026-07-21
-- ==========================================================================
-- Regra: uma negociação NUNCA pode ter organização diferente do imóvel
-- (property_id). A camada de app já força isso (commercialService.saveDeal deriva
-- a org do imóvel); esta trigger é a rede de segurança. Decisão do usuário:
-- BLOQUEAR com erro.
--
-- ⚠️ APLICAR MANUALMENTE, NUNCA `supabase db push`. commercial_deals é lida pelo
-- app; use a mesma defesa de lock. Rode a Fase 2 (limpeza) ANTES. Idempotente.
-- SE DER `55P03 lock_timeout`: tabela ocupada, feche as abas e repita.
-- ==========================================================================

SET lock_timeout = '800ms';

CREATE OR REPLACE FUNCTION public.fn_org_cascade_commercial_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  prop_org uuid;
BEGIN
  IF NEW.property_id IS NOT NULL THEN
    SELECT organization_id INTO prop_org
    FROM   public.commercial_properties
    WHERE  id = NEW.property_id;

    IF prop_org IS NOT NULL
       AND NEW.organization_id IS DISTINCT FROM prop_org THEN
      RAISE EXCEPTION
        'Organização em cascata: a negociação (org %) não pode ter organização diferente do imóvel (org %).',
        NEW.organization_id, prop_org
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_org_cascade_commercial_deal() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_org_cascade_commercial_deal ON public.commercial_deals;

CREATE TRIGGER trg_org_cascade_commercial_deal
  BEFORE INSERT OR UPDATE OF organization_id, property_id ON public.commercial_deals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_org_cascade_commercial_deal();

-- ==========================================================================
-- FIM: 20270821000002_trigger_org_cascade_commercial_deals.sql
-- ==========================================================================
