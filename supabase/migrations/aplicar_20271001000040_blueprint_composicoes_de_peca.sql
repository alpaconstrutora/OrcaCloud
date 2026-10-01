-- ============================================================================
-- Planta Inteligente — COMPOSIÇÃO POR PEÇA (E9.2 do roadmap de incêndio,
-- 01/10/2026; fecha também o backlog do hidrossanitário — caixa sifonada =
-- caixa + grelha + prolongamento).
--
-- Uma peça de instalação (disciplina + tipo + especificação opcional) vira N
-- itens do catálogo (SINAPI ou base própria), cada um com a quantidade POR
-- PEÇA. Ex.: hidrante simples = abrigo + válvula angular + 2 mangueiras +
-- esguicho + adaptador + chave storz + placa.
--
-- Configuração da ORGANIZAÇÃO (como `blueprint_element_types` e o de-para): o
-- orçamento expande as peças do quantitativo SEM código próprio. A peça com
-- código continua com a sua linha (a decisão da instância vence).
--
-- ⚠️ APLICAR À MÃO:
--    npx supabase db query --linked -f supabase/migrations/aplicar_20271001000040_blueprint_composicoes_de_peca.sql
--    NUNCA `supabase db push`. Idempotente (IF NOT EXISTS, DROP/CREATE POLICY).
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_composicoes_de_peca (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- A peça: a disciplina da rede (INCENDIO, AGUA_FRIA, ESGOTO…) e o tipo
    -- classificado (`tipoHidraulico`/`tipoEletrico`, ex.: HIDRANTE_SIMPLES).
    disciplina      TEXT NOT NULL,
    tipo            TEXT NOT NULL,
    -- quant-1.24.0: a especificação da peça ("PQS_ABC · 4 kg", "S12"). NULL =
    -- vale para qualquer especificação; a específica vence a genérica.
    especificacao   TEXT,

    -- [{ "codigo": "…", "quantidade": 2, "descricao": "Mangueira 1½\" 15 m" }]
    -- Quantidade POR PEÇA (> 0). Não se valida o código aqui: o orçamento
    -- confere no catálogo e mostra a divergência.
    itens           JSONB NOT NULL DEFAULT '[]'::jsonb,

    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_composicao_tipo_nao_vazio CHECK (length(trim(tipo)) > 0 AND length(trim(disciplina)) > 0),
    CONSTRAINT blueprint_composicao_itens_lista CHECK (jsonb_typeof(itens) = 'array')
);

-- Uma composição por (organização, disciplina, tipo, especificação) — a NULL conta como uma.
CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_composicao_peca
    ON public.blueprint_composicoes_de_peca (organization_id, disciplina, tipo, COALESCE(especificacao, ''));

-- ═══ BLOCO 2 — índice, gatilho e comentários ════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_composicao_org
    ON public.blueprint_composicoes_de_peca(organization_id) WHERE active;

DROP TRIGGER IF EXISTS trg_blueprint_composicao_updated ON public.blueprint_composicoes_de_peca;
CREATE TRIGGER trg_blueprint_composicao_updated
    BEFORE UPDATE ON public.blueprint_composicoes_de_peca
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

COMMENT ON TABLE public.blueprint_composicoes_de_peca IS
  'Composição de uma peça de instalação em itens do catálogo (por organização): '
  'o orçamento da Planta Inteligente expande as peças sem código próprio em uma '
  'linha por item, com a quantidade por peça × o número de peças.';

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_composicoes_de_peca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_composicao_org_read" ON public.blueprint_composicoes_de_peca;
CREATE POLICY "blueprint_composicao_org_read" ON public.blueprint_composicoes_de_peca
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_composicao_org_insert" ON public.blueprint_composicoes_de_peca;
CREATE POLICY "blueprint_composicao_org_insert" ON public.blueprint_composicoes_de_peca
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_composicao_org_update" ON public.blueprint_composicoes_de_peca;
CREATE POLICY "blueprint_composicao_org_update" ON public.blueprint_composicoes_de_peca
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_composicao_org_delete" ON public.blueprint_composicoes_de_peca;
CREATE POLICY "blueprint_composicao_org_delete" ON public.blueprint_composicoes_de_peca
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_composicoes_de_peca FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_composicoes_de_peca TO authenticated;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Esperado: tabela=1, com_rls=1, policies=4, anon_grants=0
SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_composicoes_de_peca')                 AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_composicoes_de_peca' AND rowsecurity) AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='blueprint_composicoes_de_peca')                 AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='blueprint_composicoes_de_peca'
      AND grantee='anon')                                                                    AS anon_grants;
