-- ============================================================================
-- Planta Inteligente — KITS DE INSERÇÃO por organização (F2 do plano
-- `2026-10-01-incendio-backlog-pos-roadmap.md`).
--
-- Um kit é "quando eu inserir ESTA peça, entram junto ESTAS outras": ex. o
-- hidrante com o extintor ao lado e a placa de cada um; a VGA com os dois
-- manômetros. O kit padrão do sistema (placa do equipamento; manômetros e
-- registro da VGA — `blueprintKitsIncendio.ts`) continua valendo; o da
-- organização SOMA a ele, com as peças nas posições RELATIVAS gravadas.
--
-- `itens` (JSONB): [{ "disciplina": "INCENDIO", "tipo": "EXTINTOR",
--   "dx": 600, "dy": 0, "cotaMm": 1600, "props": { "agenteExtintor": "PQS_ABC" } }]
--   dx/dy em mm a partir da peça principal, com a rotação dela em 0° (giram junto);
--   props: só campos que o `AddTerminal` aceita — quem valida é o kernel, ao inserir.
--
-- Nasceu como 20271001000050 e colidiu com `..._categorias_fora_da_conciliacao` (outra
-- frente); renomeada para 060 ANTES de ser aplicada — nunca rodou com o número antigo.
--
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA `db push`.
--    Idempotente (IF NOT EXISTS, DROP/CREATE POLICY).
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_kits_de_insercao (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    -- A peça principal que dispara o kit: disciplina + tipo classificado (tipoHidraulico/tipoEletrico).
    disciplina      TEXT NOT NULL,
    tipo            TEXT NOT NULL,
    itens           JSONB NOT NULL DEFAULT '[]'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_kit_nome_nao_vazio CHECK (length(trim(nome)) > 0),
    CONSTRAINT blueprint_kit_itens_lista CHECK (jsonb_typeof(itens) = 'array'),
    CONSTRAINT blueprint_kit_unico UNIQUE (organization_id, disciplina, tipo, nome)
);

-- ═══ BLOCO 2 — índice, gatilho e comentário ═════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_kit_org_tipo
    ON public.blueprint_kits_de_insercao(organization_id, disciplina, tipo) WHERE active;

DROP TRIGGER IF EXISTS trg_blueprint_kit_updated ON public.blueprint_kits_de_insercao;
CREATE TRIGGER trg_blueprint_kit_updated
    BEFORE UPDATE ON public.blueprint_kits_de_insercao
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

COMMENT ON TABLE public.blueprint_kits_de_insercao IS
  'Kits de inserção da organização: ao inserir a peça principal (disciplina + tipo), '
  'as peças do kit entram no mesmo lote, nas posições relativas gravadas.';

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_kits_de_insercao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_kit_org_read" ON public.blueprint_kits_de_insercao;
CREATE POLICY "blueprint_kit_org_read" ON public.blueprint_kits_de_insercao
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_kit_org_insert" ON public.blueprint_kits_de_insercao;
CREATE POLICY "blueprint_kit_org_insert" ON public.blueprint_kits_de_insercao
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_kit_org_update" ON public.blueprint_kits_de_insercao;
CREATE POLICY "blueprint_kit_org_update" ON public.blueprint_kits_de_insercao
    FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_kit_org_delete" ON public.blueprint_kits_de_insercao;
CREATE POLICY "blueprint_kit_org_delete" ON public.blueprint_kits_de_insercao
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_kits_de_insercao FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_kits_de_insercao TO authenticated;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Esperado: tabela=1, com_rls=1, policies=4, anon_grants=0
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='blueprint_kits_de_insercao')                 AS tabela,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='blueprint_kits_de_insercao' AND rowsecurity) AS com_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='blueprint_kits_de_insercao')                AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='blueprint_kits_de_insercao' AND grantee='anon')                         AS anon_grants;
