-- ==========================================================================
-- Financeiro · Contas de Pagamento · "atende também outras organizações"
-- Date: 2026-09-15
-- Tabelas: public.payment_accounts (+1 coluna), public.payment_account_organizations (nova)
-- ==========================================================================
-- REGRA DE PRODUTO (usuário, 2026-09-15):
--   "uma conta deve estar cadastrada a uma organização de fato. porém existe a
--    possibilidade de haver por exemplo pagamento de fornecedores de outra
--    organização, neste caso deve haver a possibilidade de o usuário cadastrar
--    aquela conta para atender também outras organizações e todas as organizações"
--
-- Então: a conta continua com UMA organização dona (organization_id — nada muda
-- aí). Opcionalmente ela ATENDE outras: uma lista de organizações
-- (payment_account_organizations) ou todas as do usuário
-- (serves_all_organizations). Quando atende, o extrato dela pode ser classificado
-- com centro de custo / plano de contas / obra / fornecedor / cliente dessas orgs.
--
-- Isto substitui o comportamento implícito que existia no Extrato ("se a org
-- da conta não tem centro de custo, lista os de TODAS as orgs"), que já
-- produziu 13 + 175 movimentos apontando para centro de custo de outra org sem
-- ninguém ter decidido isso.
--
-- RLS (REGRA #7 — cada perna do OR, sozinha, basta?):
--   SELECT: membro da org ATENDIDA (precisa saber que a conta a atende) OU membro
--           da org DONA (vê a configuração da própria conta). Ambas legítimas.
--   INSERT/UPDATE/DELETE: só gestor da org DONA da conta. Quem é atendido não
--           configura a conta de outrem.
-- Sem função nova. Sem policy anon. REVOKE explícito de anon/PUBLIC na tabela nova.
-- IDEMPOTENTE.
-- ==========================================================================
SET lock_timeout = '5s';

ALTER TABLE public.payment_accounts
    ADD COLUMN IF NOT EXISTS serves_all_organizations BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payment_accounts.serves_all_organizations IS
    'Conta atende TODAS as organizações do usuário (além da dona). Falso = só a dona + payment_account_organizations.';

CREATE TABLE IF NOT EXISTS public.payment_account_organizations (
    payment_account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
    organization_id    UUID NOT NULL REFERENCES public.organizations(id)     ON DELETE CASCADE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (payment_account_id, organization_id)
);

COMMENT ON TABLE public.payment_account_organizations IS
    'Organizações ADICIONAIS que uma conta de pagamento atende (a dona é payment_accounts.organization_id).';

CREATE INDEX IF NOT EXISTS idx_payment_account_organizations_org
    ON public.payment_account_organizations (organization_id);

ALTER TABLE public.payment_account_organizations ENABLE ROW LEVEL SECURITY;

-- ALTER DEFAULT PRIVILEGES do Supabase concede tudo a authenticated na criação;
-- fica só o que a tela usa (a linha é o par conta×org: sem UPDATE, muda-se apagando e inserindo).
REVOKE ALL ON public.payment_account_organizations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.payment_account_organizations TO authenticated;

DROP POLICY IF EXISTS "pao_select_member" ON public.payment_account_organizations;
CREATE POLICY "pao_select_member" ON public.payment_account_organizations
    FOR SELECT TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.payment_accounts pa
            WHERE pa.id = payment_account_organizations.payment_account_id
              AND public.is_org_member(pa.organization_id)
        )
    );

DROP POLICY IF EXISTS "pao_insert_owner_manager" ON public.payment_account_organizations;
CREATE POLICY "pao_insert_owner_manager" ON public.payment_account_organizations
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.payment_accounts pa
            WHERE pa.id = payment_account_organizations.payment_account_id
              AND public.is_org_manager(pa.organization_id)
        )
    );

DROP POLICY IF EXISTS "pao_delete_owner_manager" ON public.payment_account_organizations;
CREATE POLICY "pao_delete_owner_manager" ON public.payment_account_organizations
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.payment_accounts pa
            WHERE pa.id = payment_account_organizations.payment_account_id
              AND public.is_org_manager(pa.organization_id)
        )
    );
-- Sem UPDATE: a linha é só o par (conta, org) — muda-se apagando e inserindo.
