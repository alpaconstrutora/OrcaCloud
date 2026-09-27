-- ============================================================================
-- Suprimentos › SOLICITAÇÕES DE COMPRA (26/09/2026)
--
-- Plano: docs/planos/2026-09-26-suprimentos-solicitacoes-compra.md
--
-- Até aqui não existia a entidade: PLANO_MODULO_PLANO_AQUISICOES.md:45 dizia
-- "Solicitação de Compra (SC) — não há entidade. O fluxo real é cotação →
-- pedido". A SC é o pedido interno da obra: aprovada pelas alçadas do motor
-- unificado (approvalService), vira Cotação ou Pedido, item a item.
--
-- Desenho que importa para quem mexer depois:
--
--   • NÃO existe coluna `status`. A aprovação vive em approval_status (do
--     motor), o atendimento é derivado dos itens (quotation_request_id /
--     purchase_order_id) e o cancelamento é cancelled_at. O status exibido é
--     calculado por `statusDaSolicitacao` (utils/solicitacaoCompra.ts). Uma
--     coluna de status seria um segundo lugar para a mesma verdade — e os dois
--     divergiriam no primeiro caminho que esquecesse de atualizá-la.
--
--   • A SC pendura na OBRA, e a organização é a DONA da obra: o trigger
--     `fn_purchase_requests_guard` recusa project_id de outra organização.
--     (O chamado de garantia já gravou obra de outra org — memória
--     project_warranty_project_id_cross_org.)
--
--   • Enviada (PENDENTE) ou aprovada (APROVADO), a SC fica TRAVADA: mudar
--     item ou cabeçalho depois de aprovar seria comprar o que ninguém aprovou.
--     A trava é daqui, não só da tela. O que continua livre é o que a
--     conversão e o cancelamento gravam.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Cabeçalho ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_requests (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id               UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
    number                   TEXT,
    title                    TEXT NOT NULL,
    justification            TEXT,
    need_date                DATE,
    priority                 TEXT NOT NULL DEFAULT 'normal'
                             CHECK (priority IN ('normal', 'urgente')),
    cost_center_id           UUID REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL,
    plano_de_contas_id       UUID REFERENCES public.plano_de_contas(id) ON DELETE SET NULL,
    requested_by             UUID DEFAULT auth.uid(),
    requested_by_name        TEXT,
    requested_by_email       TEXT,
    -- Σ quantidade × preço estimado dos itens não cancelados. Gravado pelo
    -- serviço junto com os itens; é o valor que resolve a faixa da alçada.
    estimated_total          NUMERIC(15, 2) NOT NULL DEFAULT 0,
    approval_status          TEXT NOT NULL DEFAULT 'RASCUNHO'
                             CHECK (approval_status IN ('RASCUNHO', 'PENDENTE', 'APROVADO', 'REJEITADO')),
    approval_chain           JSONB NOT NULL DEFAULT '[]'::jsonb,
    approval_required_levels INTEGER NOT NULL DEFAULT 1
                             CHECK (approval_required_levels IN (1, 2)),
    cancelled_at             TIMESTAMPTZ,
    cancel_reason            TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.purchase_requests IS
  'Solicitações de Compra (Suprimentos). Status exibido é DERIVADO (approval_status + itens + cancelled_at) — '
  'ver utils/solicitacaoCompra.ts. Plano: docs/planos/2026-09-26-suprimentos-solicitacoes-compra.md.';

CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_org_number_key
    ON public.purchase_requests(organization_id, number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_requests_org_idx
    ON public.purchase_requests(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_requests_project_idx
    ON public.purchase_requests(project_id);
CREATE INDEX IF NOT EXISTS purchase_requests_pendente_idx
    ON public.purchase_requests(organization_id) WHERE approval_status = 'PENDENTE' AND cancelled_at IS NULL;

-- ── 2. Itens ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_request_items (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id               UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
    -- Copiado do cabeçalho pelo trigger (a RLS do item não precisa de join).
    organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    position                 INTEGER NOT NULL DEFAULT 0,
    source                   TEXT NOT NULL DEFAULT 'avulso'
                             CHECK (source IN ('orcamento', 'avulso', 'almoxarifado', 'plano')),
    input_code               TEXT,
    description              TEXT NOT NULL,
    unit                     TEXT NOT NULL DEFAULT 'un',
    quantity                 NUMERIC(15, 4) NOT NULL CHECK (quantity > 0),
    estimated_unit_price     NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (estimated_unit_price >= 0),
    need_date                DATE,
    notes                    TEXT,
    -- Rastro da origem (só o da origem do item vem preenchido).
    stock_item_id            UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
    procurement_plan_item_id UUID REFERENCES public.procurement_plan_items(id) ON DELETE SET NULL,
    budget_ref               JSONB,
    -- Atendimento: preenchido na conversão.
    quotation_request_id     UUID REFERENCES public.quotation_requests(id) ON DELETE SET NULL,
    purchase_order_id        UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    cancelled_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.purchase_request_items IS
  'Itens da Solicitação de Compra. Atendido = quotation_request_id OU purchase_order_id preenchido.';

CREATE INDEX IF NOT EXISTS purchase_request_items_request_idx
    ON public.purchase_request_items(request_id, position);
CREATE INDEX IF NOT EXISTS purchase_request_items_plan_idx
    ON public.purchase_request_items(procurement_plan_item_id) WHERE procurement_plan_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_request_items_quotation_idx
    ON public.purchase_request_items(quotation_request_id) WHERE quotation_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_request_items_order_idx
    ON public.purchase_request_items(purchase_order_id) WHERE purchase_order_id IS NOT NULL;

-- ── 3. Guarda do cabeçalho: obra da MESMA organização + trava pós-envio ────
CREATE OR REPLACE FUNCTION public.fn_purchase_requests_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_project_org UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- §6.3 do guia: registro que já entrou no fluxo se cancela, não se apaga.
        IF OLD.approval_status <> 'RASCUNHO' THEN
            RAISE EXCEPTION 'Solicitação % já foi enviada para aprovação: cancele em vez de excluir.',
                COALESCE(OLD.number, OLD.id::text)
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        -- INVOKER de propósito: obra que o usuário não enxerga pela RLS também
        -- cai aqui (NOT FOUND), e é recusada do mesmo jeito.
        SELECT organization_id INTO v_project_org FROM public.projects WHERE id = NEW.project_id;
        IF v_project_org IS NULL OR v_project_org <> NEW.organization_id THEN
            RAISE EXCEPTION 'A obra da solicitação não pertence à organização da solicitação.'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := NOW();

        -- Trava: enviada ou aprovada, o CONTEÚDO não muda. Transições do motor
        -- (approval_*), cancelamento e number (renumerar não é conteúdo) passam.
        IF OLD.approval_status IN ('PENDENTE', 'APROVADO')
           AND NEW.approval_status = OLD.approval_status
           AND (NEW.project_id         IS DISTINCT FROM OLD.project_id
             OR NEW.title              IS DISTINCT FROM OLD.title
             OR NEW.justification      IS DISTINCT FROM OLD.justification
             OR NEW.need_date          IS DISTINCT FROM OLD.need_date
             OR NEW.priority           IS DISTINCT FROM OLD.priority
             OR NEW.cost_center_id     IS DISTINCT FROM OLD.cost_center_id
             OR NEW.plano_de_contas_id IS DISTINCT FROM OLD.plano_de_contas_id
             OR NEW.estimated_total    IS DISTINCT FROM OLD.estimated_total) THEN
            RAISE EXCEPTION 'Solicitação % está % e não pode ser alterada.',
                COALESCE(OLD.number, OLD.id::text),
                CASE OLD.approval_status WHEN 'PENDENTE' THEN 'em aprovação' ELSE 'aprovada' END
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_purchase_requests_guard() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_purchase_requests_guard ON public.purchase_requests;
CREATE TRIGGER trg_purchase_requests_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_requests
    FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_requests_guard();

-- ── 4. Guarda do item: organização do cabeçalho + trava pós-envio ──────────
CREATE OR REPLACE FUNCTION public.fn_purchase_request_items_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.request_id ELSE NEW.request_id END;
    v_org        UUID;
    v_status     TEXT;
BEGIN
    SELECT organization_id, approval_status INTO v_org, v_status
      FROM public.purchase_requests WHERE id = v_request_id;

    -- Cabeçalho já apagado = DELETE em cascata de uma SC em rascunho (a guarda
    -- do cabeçalho só deixa apagar rascunho). Nada a travar.
    IF NOT FOUND THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Solicitação % não encontrada.', v_request_id USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.organization_id := v_org;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.organization_id := v_org;
        NEW.updated_at := NOW();
    END IF;

    IF v_status IN ('PENDENTE', 'APROVADO') THEN
        IF TG_OP IN ('INSERT', 'DELETE')
           OR NEW.request_id            IS DISTINCT FROM OLD.request_id
           OR NEW.source                IS DISTINCT FROM OLD.source
           OR NEW.input_code            IS DISTINCT FROM OLD.input_code
           OR NEW.description           IS DISTINCT FROM OLD.description
           OR NEW.unit                  IS DISTINCT FROM OLD.unit
           OR NEW.quantity              IS DISTINCT FROM OLD.quantity
           OR NEW.estimated_unit_price  IS DISTINCT FROM OLD.estimated_unit_price THEN
            RAISE EXCEPTION 'A solicitação está % e os itens não podem ser alterados.',
                CASE v_status WHEN 'PENDENTE' THEN 'em aprovação' ELSE 'aprovada' END
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_purchase_request_items_guard() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_purchase_request_items_guard ON public.purchase_request_items;
CREATE TRIGGER trg_purchase_request_items_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_request_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_request_items_guard();

-- ── 5. RLS: membro da organização, sem perna solta de OR (REGRA #7) ───────
ALTER TABLE public.purchase_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_requests_org" ON public.purchase_requests;
CREATE POLICY "purchase_requests_org"
    ON public.purchase_requests
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "purchase_request_items_org" ON public.purchase_request_items;
CREATE POLICY "purchase_request_items_org"
    ON public.purchase_request_items
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.purchase_requests      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_request_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_requests      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_request_items TO authenticated;

-- ── 6. Numeração: novo doc_type na Nomenclatura ─────────────────────────────
-- CHECK recriado com a lista inteira (services/documentNumbering/types.ts).
ALTER TABLE public.document_numbering_settings
    DROP CONSTRAINT IF EXISTS document_numbering_settings_doc_type_check;
ALTER TABLE public.document_numbering_settings
    ADD CONSTRAINT document_numbering_settings_doc_type_check CHECK (doc_type IN (
        'PURCHASE_ORDER', 'QUOTATION', 'SUPPLY_CONTRACT',
        'SERVICE_CONTRACT', 'SERVICE_PROPOSAL', 'SERVICE_CRM_CONTRACT',
        'UNIT_SALE_CONTRACT', 'RENTAL_CONTRACT',
        'SALE_DEAL', 'RENTAL_DEAL', 'CONDO_RATEIO',
        'PURCHASE_REQUEST'
    ));
