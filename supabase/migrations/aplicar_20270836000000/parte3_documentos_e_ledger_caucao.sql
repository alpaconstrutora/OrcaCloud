-- ═════════════════════════════════════════════════════════════════════════════
-- Garantias Locatícias F1 — PARTE 3 de 5: checklist de documentos + ledger da caução
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar SOZINHA, depois da parte 2.

SET lock_timeout = '5s';

-- ── Checklist de documentos da garantia ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guarantee_documents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    guarantee_id     UUID NOT NULL REFERENCES public.contract_guarantees(id) ON DELETE CASCADE,
    -- Nulo = documento da garantia como um todo, não de um garantidor específico
    guarantor_id     UUID REFERENCES public.contract_guarantors(id) ON DELETE CASCADE,
    label            TEXT NOT NULL,
    is_required      BOOLEAN NOT NULL DEFAULT true,
    received         BOOLEAN NOT NULL DEFAULT false,
    received_at      DATE,
    valid_until      DATE,
    file_url         TEXT,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guarantee_documents_guarantee ON public.guarantee_documents (guarantee_id);
CREATE INDEX IF NOT EXISTS idx_guarantee_documents_org       ON public.guarantee_documents (organization_id);

ALTER TABLE public.guarantee_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_guarantee_documents" ON public.guarantee_documents;
CREATE POLICY "org_access_guarantee_documents" ON public.guarantee_documents
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_guarantee_documents_updated_at ON public.guarantee_documents;
CREATE TRIGGER trg_guarantee_documents_updated_at
    BEFORE UPDATE ON public.guarantee_documents
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── Ledger da caução em dinheiro (PASSIVO) ───────────────────────────────────
-- 🔴 REGRA CENTRAL:
-- Caução em dinheiro NÃO é receita de locação. É dinheiro de terceiro em poder
-- do locador, com obrigação de devolver (art. 38). Se entrasse em
-- `internal_transactions` como recebimento, inflaria a receita de locação no
-- DRE, no Scorecard e nos alertas de caixa — o mesmo estrago que o `project_id`
-- de projeto de sistema já causou (REGRA OBRIGATÓRIA #2).
--
-- Por isso o ciclo financeiro da caução vive NESTE ledger e deliberadamente NÃO
-- é sincronizado para `internal_transactions`.
--
-- Convenção de sinal: `amount` é o efeito sobre o SALDO DEVIDO AO LOCATÁRIO.
--   DEPOSITO   (+) locatário deposita                → saldo sobe
--   RENDIMENTO (+) rendimento da poupança            → saldo sobe (art. 38 §2º)
--   DEDUCAO    (−) débito compensado (dano, aluguel) → saldo desce
--   DEVOLUCAO  (−) devolvido ao locatário            → saldo desce
-- O CHECK trava o sinal por tipo — evita "devolução positiva", que
-- silenciosamente aumentaria a dívida com o locatário.
CREATE TABLE IF NOT EXISTS public.guarantee_deposit_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    guarantee_id     UUID NOT NULL REFERENCES public.contract_guarantees(id) ON DELETE CASCADE,
    event_type       TEXT NOT NULL CHECK (event_type IN
                        ('DEPOSITO', 'RENDIMENTO', 'DEDUCAO', 'DEVOLUCAO')),
    event_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    amount           DECIMAL(15,2) NOT NULL,
    description      TEXT,
    document_url     TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT guarantee_deposit_events_sinal_chk CHECK (
        (event_type IN ('DEPOSITO', 'RENDIMENTO') AND amount > 0) OR
        (event_type IN ('DEDUCAO', 'DEVOLUCAO')   AND amount < 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_guarantee_deposit_events_guarantee
    ON public.guarantee_deposit_events (guarantee_id, event_date);
CREATE INDEX IF NOT EXISTS idx_guarantee_deposit_events_org
    ON public.guarantee_deposit_events (organization_id);

ALTER TABLE public.guarantee_deposit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_guarantee_deposit_events" ON public.guarantee_deposit_events;
CREATE POLICY "org_access_guarantee_deposit_events" ON public.guarantee_deposit_events
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_guarantee_deposit_events_updated_at ON public.guarantee_deposit_events;
CREATE TRIGGER trg_guarantee_deposit_events_updated_at
    BEFORE UPDATE ON public.guarantee_deposit_events
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
