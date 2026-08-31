-- "Regerar número" para Cotações de Suprimentos — mesmo padrão de
-- 20270913000000_contract_number_history.sql, aplicado a `quotation_requests`.
-- Ver docs/planos/2026-08-30-regerar-numero-outros-modulos.md.
--
-- ⚠️ `quotation_requests` NÃO tem coluna `organization_id` (confirmado no
-- schema real, 2026-08-30) — só `project_id`. A organização vem de
-- `projects.organization_id`, por isso as duas funções abaixo fazem JOIN em
-- `projects` em vez de ler a coluna direto (diferente do padrão de Contratos
-- e Pedidos, que têm `organization_id` na própria tabela).
--
-- REGRA DE BLOQUEIO (decisão do usuário, 2026-08-30): já existe resposta de
-- fornecedor (`quotation_responses.status IN ('Enviada','Selecionada','Recusada')`
-- para aquele `request_id`). Não usamos status da cotação (`Aberta`/`Em
-- Análise`/...) como trava: a cotação já fica visível no portal do fornecedor
-- assim que criada com fornecedores convidados, então "sair para fora" está
-- ligado à resposta do fornecedor, não a uma transição de status.

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.quotation_number_history (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL,   -- sem FK (anti-deadlock)
    quotation_request_id UUID NOT NULL,   -- sem FK
    old_number           TEXT,
    new_number           TEXT NOT NULL,
    changed_by           TEXT,
    changed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.quotation_number_history IS
    'Histórico de "Regerar número" de Cotações de Suprimentos. Ver docs/planos/2026-08-30-regerar-numero-outros-modulos.md.';

CREATE INDEX IF NOT EXISTS idx_quotation_number_history_request
    ON public.quotation_number_history(quotation_request_id, changed_at DESC);

ALTER TABLE public.quotation_number_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotation_number_history_select" ON public.quotation_number_history
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.quotation_number_history FROM PUBLIC;
REVOKE ALL ON public.quotation_number_history FROM anon;
GRANT SELECT ON public.quotation_number_history TO authenticated;

-- ═══ Motivo do bloqueio ═══
CREATE OR REPLACE FUNCTION public.fn_quotation_number_lock_reason(p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT p.organization_id INTO v_org_id
      FROM public.quotation_requests qr
      JOIN public.projects p ON p.id = qr.project_id
     WHERE qr.id = p_request_id;

    IF v_org_id IS NULL THEN
        RETURN 'Cotação não encontrada.';
    END IF;

    IF NOT public.is_org_member(v_org_id) THEN
        RETURN 'Sem acesso a esta cotação.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.quotation_responses r
        WHERE r.request_id = p_request_id
          AND r.status IN ('Enviada', 'Selecionada', 'Recusada')
    ) THEN
        RETURN 'Esta cotação já tem resposta de fornecedor — o número não pode mais mudar.';
    END IF;

    RETURN NULL;
END;
$X$;

-- ═══ Regera de fato ═══
CREATE OR REPLACE FUNCTION public.fn_regenerate_quotation_number(
    p_request_id UUID,
    p_new_number TEXT
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
    IF COALESCE(p_new_number, '') = '' THEN
        RAISE EXCEPTION 'Número novo não informado.' USING ERRCODE = '22023';
    END IF;

    v_reason := public.fn_quotation_number_lock_reason(p_request_id);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION '%', v_reason USING ERRCODE = '42501';
    END IF;

    SELECT qr.number, p.organization_id INTO v_old, v_org
      FROM public.quotation_requests qr
      JOIN public.projects p ON p.id = qr.project_id
     WHERE qr.id = p_request_id;

    UPDATE public.quotation_requests
       SET number = p_new_number, updated_at = NOW()
     WHERE id = p_request_id;

    INSERT INTO public.quotation_number_history
        (organization_id, quotation_request_id, old_number, new_number, changed_by)
    VALUES (v_org, p_request_id, v_old, p_new_number, auth.jwt() ->> 'email');

    RETURN p_new_number;
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_quotation_number_lock_reason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_quotation_number_lock_reason(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_quotation_number_lock_reason(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_regenerate_quotation_number(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_regenerate_quotation_number(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_regenerate_quotation_number(UUID, TEXT) TO authenticated;
