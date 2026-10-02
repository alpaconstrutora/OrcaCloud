-- ============================================================================
-- Planta Inteligente — PRODUTO congelado em cada VERSÃO PUBLICADA (02/10/2026, M4)
--
-- Plano `docs/planos/2026-10-01-estudo-de-massa.md`, fase M4 (§22 do pedido:
-- "cada estudo deve poder ser salvo … registrar parâmetros, legislação,
-- indicadores, data, responsável"). O produto do Estudo de Massa mora FORA do
-- payload (`blueprint_study_produto`, uma linha viva por estudo); ao publicar,
-- o produto em uso é copiado para cá, amarrado ao snapshot. É o que permite:
--   - o envio ao Empreendimento usar o produto DA versão publicada, e não o que
--     alguém digitou depois (a M3 lia a linha viva);
--   - comparar versões antigas com o mix com que foram feitas.
-- Molde: `blueprint_snapshot_topografia` (…20270921000011). Imutável: só
-- INSERT e SELECT; some com o snapshot (CASCADE).
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_snapshot_produto (
    snapshot_id     UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    study_id        UUID NOT NULL,
    -- `Produto` inteiro (tipologias, mix, padrão, hipóteses do pavimento e financeiras).
    produto         JSONB NOT NULL,
    -- Sem FK para auth.users (deadlock em auth.users — ver aplicar_20270905000003).
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_snapshot_produto_snapshot_fk
      FOREIGN KEY (snapshot_id, organization_id)
      REFERENCES public.blueprint_snapshots(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blueprint_snapshot_produto_study
    ON public.blueprint_snapshot_produto(study_id);

COMMENT ON TABLE public.blueprint_snapshot_produto IS
  'Produto do Estudo de Massa em uso quando a versão do estudo foi publicada. Fora do hash do desenho; imutável.';

DROP TRIGGER IF EXISTS trg_blueprint_snapshot_produto_immutable ON public.blueprint_snapshot_produto;
CREATE TRIGGER trg_blueprint_snapshot_produto_immutable
    BEFORE UPDATE ON public.blueprint_snapshot_produto
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

ALTER TABLE public.blueprint_snapshot_produto ENABLE ROW LEVEL SECURITY;

-- Uma perna só em cada política, sem OR (REGRA #7, pergunta 1).
DROP POLICY IF EXISTS "blueprint_snapshot_produto_read" ON public.blueprint_snapshot_produto;
CREATE POLICY "blueprint_snapshot_produto_read" ON public.blueprint_snapshot_produto
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_snapshot_produto_insert" ON public.blueprint_snapshot_produto;
CREATE POLICY "blueprint_snapshot_produto_insert" ON public.blueprint_snapshot_produto
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_snapshot_produto FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.blueprint_snapshot_produto TO authenticated;

RESET lock_timeout;
