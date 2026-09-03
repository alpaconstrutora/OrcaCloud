-- "Regerar número" para o CÓDIGO da negociação (commercial_deals.code) —
-- Venda de Unidades (SALE_DEAL) e Locação (RENTAL_DEAL). Mesmo padrão de
-- 20270913000000_contract_number_history.sql (Suprimentos > Contratos).
-- Ver docs/planos/... (rodada 2026-08-31).
--
-- Uma ÚNICA migration cobre os dois doc_types: SALE_DEAL e RENTAL_DEAL vivem
-- na MESMA tabela `commercial_deals`, diferenciados só por `type`. Diferente
-- de Pedidos/Cotações/Rateio (tabelas diferentes), aqui não há necessidade de
-- duplicar tabela/RPC.
--
-- ⚠️ Não confundir com o "Regerar número" que já existe em DealModal.tsx desde
-- 2026-08-30 para o CONTRATO gerado a partir da negociação (contracts.number,
-- fn_contract_number_lock_reason/fn_regenerate_contract_number). Aqui é outro
-- número: o CÓDIGO da negociação em si (commercial_deals.code).
--
-- REGRA DE BLOQUEIO (decisão do usuário, 2026-08-31): já existe um contrato
-- vinculado a esta negociação (contracts.deal_id = commercial_deals.id — mesma
-- coluna que contractService.getContractByDealId já consulta). A negociação
-- "virou" outra coisa com número próprio; o código dela para de fazer sentido
-- mudar.
--
-- ⚠️ `commercial_deals` NÃO tem coluna `updated_at` (confirmado no schema real)
-- — o UPDATE abaixo não toca nela, diferente dos outros regens desta família.

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.commercial_deal_code_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,   -- sem FK (anti-deadlock, mesmo motivo de contract_number_history)
    deal_id         UUID NOT NULL,   -- sem FK
    old_code        TEXT,
    new_code        TEXT NOT NULL,
    changed_by      TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.commercial_deal_code_history IS
    'Histórico de "Regerar número" do código de negociações (SALE_DEAL/RENTAL_DEAL). Ver docs/planos/.';

CREATE INDEX IF NOT EXISTS idx_commercial_deal_code_history_deal
    ON public.commercial_deal_code_history(deal_id, changed_at DESC);

ALTER TABLE public.commercial_deal_code_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commercial_deal_code_history_select" ON public.commercial_deal_code_history
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.commercial_deal_code_history FROM PUBLIC;
REVOKE ALL ON public.commercial_deal_code_history FROM anon;
GRANT SELECT ON public.commercial_deal_code_history TO authenticated;

-- ═══ Motivo do bloqueio ═══
CREATE OR REPLACE FUNCTION public.fn_deal_code_lock_reason(p_deal_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_deal RECORD;
BEGIN
    SELECT d.id, d.organization_id
      INTO v_deal
      FROM public.commercial_deals d
     WHERE d.id = p_deal_id;

    IF NOT FOUND THEN
        RETURN 'Negociação não encontrada.';
    END IF;

    IF NOT public.is_org_member(v_deal.organization_id) THEN
        RETURN 'Sem acesso a esta negociação.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.contracts c WHERE c.deal_id = p_deal_id) THEN
        RETURN 'Esta negociação já gerou um contrato — o código não pode mais mudar.';
    END IF;

    RETURN NULL;
END;
$X$;

-- ═══ Regera de fato ═══
CREATE OR REPLACE FUNCTION public.fn_regenerate_deal_code(
    p_deal_id UUID,
    p_new_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_reason TEXT;
    v_old TEXT;
    v_org UUID;
BEGIN
    IF COALESCE(p_new_code, '') = '' THEN
        RAISE EXCEPTION 'Código novo não informado.' USING ERRCODE = '22023';
    END IF;

    v_reason := public.fn_deal_code_lock_reason(p_deal_id);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION '%', v_reason USING ERRCODE = '42501';
    END IF;

    SELECT code, organization_id INTO v_old, v_org
      FROM public.commercial_deals WHERE id = p_deal_id;

    -- Sem updated_at: coluna não existe em commercial_deals.
    UPDATE public.commercial_deals
       SET code = p_new_code
     WHERE id = p_deal_id;

    INSERT INTO public.commercial_deal_code_history
        (organization_id, deal_id, old_code, new_code, changed_by)
    VALUES (v_org, p_deal_id, v_old, p_new_code, auth.jwt() ->> 'email');

    RETURN p_new_code;
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_deal_code_lock_reason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_deal_code_lock_reason(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_deal_code_lock_reason(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_regenerate_deal_code(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_regenerate_deal_code(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_regenerate_deal_code(UUID, TEXT) TO authenticated;
