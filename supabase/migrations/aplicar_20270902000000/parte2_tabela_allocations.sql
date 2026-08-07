-- ═════════════════════════════════════════════════════════════════════════════
-- OPEX por imóvel — PARTE 2 de 4: `property_expense_allocations`
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar DEPOIS da parte 1 terminar.
--
-- ── Por que uma tabela, e não só a coluna da parte 1 ─────────────────────────
-- Porque o rateio é OPCIONAL e por lançamento. Se o NOI tivesse de olhar ora
-- para `internal_transactions.property_id` (quando DIRECT), ora para uma conta
-- de rateio calculada na hora (quando PRORATED), existiriam DOIS caminhos de
-- leitura para o mesmo número — e dois caminhos é onde a divergência nasce
-- (foi exatamente o que aconteceu com os KPIs de patrimônio nesta mesma sessão,
-- que tinham cópias da fórmula em dois lugares e os mesmos dois erros).
--
-- Aqui o rateio é MATERIALIZADO: toda despesa de imóvel gera linha(s) nesta
-- tabela, e o modo só muda QUANTAS. O NOI sempre lê daqui, um caminho só.
--   DIRECT   → 1 linha, valor cheio.
--   PRORATED → N linhas, uma por unidade filha.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.property_expense_allocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- CASCADE: apagou o lançamento, some a apropriação. Rateio órfão viraria
    -- despesa fantasma no NOI, sem lançamento que a explique.
    transaction_id  UUID NOT NULL REFERENCES public.internal_transactions(id) ON DELETE CASCADE,
    property_id     UUID NOT NULL REFERENCES public.commercial_properties(id) ON DELETE CASCADE,

    amount          NUMERIC(15,2) NOT NULL,

    -- Como esta parcela foi determinada. `PRIVATE_AREA` guarda em `basis_value`
    -- a área usada, para a conta ser auditável depois — sem isso ninguém
    -- consegue reconstruir por que a unidade recebeu justamente este valor.
    basis           TEXT NOT NULL DEFAULT 'DIRECT'
                    CHECK (basis IN ('DIRECT', 'PRIVATE_AREA', 'EQUAL', 'MANUAL')),
    basis_value     NUMERIC(15,4),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Uma linha por (lançamento, imóvel): o rateio distribui ENTRE imóveis, e
    -- duas linhas para o mesmo par seriam dupla contagem no NOI.
    CONSTRAINT uq_prop_expense_alloc UNIQUE (transaction_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_prop_expense_alloc_property
    ON public.property_expense_allocations (property_id);

CREATE INDEX IF NOT EXISTS idx_prop_expense_alloc_transaction
    ON public.property_expense_allocations (transaction_id);

CREATE INDEX IF NOT EXISTS idx_prop_expense_alloc_org
    ON public.property_expense_allocations (organization_id);

ALTER TABLE public.property_expense_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_prop_expense_alloc" ON public.property_expense_allocations;
CREATE POLICY "org_access_prop_expense_alloc" ON public.property_expense_allocations
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON TABLE public.property_expense_allocations FROM anon;
REVOKE ALL ON TABLE public.property_expense_allocations FROM PUBLIC;

-- Só leitura pela API. A escrita passa pela RPC da parte 3, que é quem garante
-- o invariante `SUM(amount) = valor do lançamento`. Deixar INSERT livre aqui
-- permitiria um rateio que não fecha — e rateio que não fecha inventa ou some
-- com despesa no NOI consolidado, silenciosamente.
GRANT SELECT ON TABLE public.property_expense_allocations TO authenticated;

COMMENT ON TABLE public.property_expense_allocations IS
    'Apropriacao de despesa por imovel (DIRECT ou rateada). Fonte unica do NOI. Escrita so via fn_set_property_allocations.';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.property_expense_allocations;   -- 0 no início
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'property_expense_allocations';
-- Deve listar SOMENTE `authenticated`, e só SELECT.
