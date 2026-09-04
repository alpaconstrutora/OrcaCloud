-- ⚠️ JÁ APLICADA NO BANCO REMOTO em 04/09/2026, sob o nome
-- `aplicar_20270918000027_client_empreendimentos.sql`. O prefixo 27 colidiu com
-- `aplicar_20270918000027_portal_cliente_dados_da_unidade.sql`, de outra frente,
-- que chegou primeiro — quem chega depois é quem move (__tests__/migrationsPrefixo).
-- NÃO rode este arquivo de novo às cegas: a tabela e a policy já existem. Ele é
-- idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS), então reexecutar não
-- quebra, mas conferir antes é mais barato que descobrir depois.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Vínculo direto Cliente ↔ Empreendimento (N:N)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Até aqui, a coluna "Empreendimento Vinculado" de Meus Clientes era DERIVADA:
-- `projects.settings.clientId` (obra) → empreendimento-pai. Isso só cobre o
-- cliente que tem obra própria; não havia como dizer "este cliente é do
-- Empreendimento X" sem passar por uma obra.
--
-- Esta tabela é o vínculo explícito, pedido em 04/09/2026. Ela NÃO substitui o
-- derivado — a tela soma os dois e deduplica por id do empreendimento.
--
-- ── Sobre a FK para `empreendimentos` ─────────────────────────────────────
-- O módulo Empreendimentos evita FK para as colunas de obra/estudo porque DDL
-- nele já deadlockou (ver 20270719000000). Aqui a referência é no sentido
-- oposto (tabela nova → empreendimentos), então tentamos criar a FK com
-- `lock_timeout` curto; se o lock não vier, seguimos sem ela e a UI trata id
-- órfão (mesmo contrato de `empreendimentoLinksService`, que marca `missing`).

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_empreendimentos (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    empreendimento_id uuid NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_client_empreendimento UNIQUE (client_id, empreendimento_id)
);

CREATE INDEX IF NOT EXISTS idx_client_empreendimentos_client
    ON public.client_empreendimentos (client_id);
CREATE INDEX IF NOT EXISTS idx_client_empreendimentos_empreendimento
    ON public.client_empreendimentos (empreendimento_id);

COMMENT ON TABLE public.client_empreendimentos IS
    'Vínculo explícito Cliente ↔ Empreendimento (Minha Organização > Meus Clientes). Complementa o vínculo derivado via obra (projects.settings.clientId), não o substitui.';

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Uma perna só, de propósito (CLAUDE.md REGRA #7, pergunta 1): a linha é
-- visível/gravável apenas por quem é membro da organização DONA do
-- empreendimento. Mesmo molde de `org_access_empr_towers`.
ALTER TABLE public.client_empreendimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_empreendimentos_org_access ON public.client_empreendimentos;
CREATE POLICY client_empreendimentos_org_access
    ON public.client_empreendimentos
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = client_empreendimentos.empreendimento_id
              AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = client_empreendimentos.empreendimento_id
              AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    );

-- A chave anon vai no bundle do frontend: nada aqui pode ser alcançável com ela.
REVOKE ALL ON public.client_empreendimentos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_empreendimentos TO authenticated;

COMMIT;

-- FK para `empreendimentos` fora da transação principal: se o lock não vier em
-- 5s, a tabela continua utilizável sem a FK (id órfão tratado na leitura).
DO $$
BEGIN
    SET LOCAL lock_timeout = '5s';
    ALTER TABLE public.client_empreendimentos
        ADD CONSTRAINT fk_client_empreendimentos_empreendimento
        FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN lock_not_available THEN
        RAISE NOTICE 'FK para empreendimentos não criada (lock indisponível) — seguindo sem ela.';
END $$;
