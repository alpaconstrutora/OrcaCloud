-- ============================================================================
-- Planta Inteligente — REFERÊNCIAS EXTERNAS no 3D, no ESTUDO (10/10/2026,
-- pendência da E10.4b do roadmap de climatização,
-- `docs/planos/2026-10-04-climatizacao-benchmark-altoqi-e-roadmap.md`).
--
--   `blueprint_study_referencias` — a lista de modelos IFC de outras
--   disciplinas desenhados no 3D da Planta só para coordenar (olho, opacidade,
--   deslocamento, cota, giro), uma linha por estudo, JSONB lido sem confiança
--   pelo cliente (`lerReferencias`). Até aqui a lista morava no navegador de
--   quem a montou; o usuário aprovou a tabela em 10/10/2026 para que todos que
--   abrem a Planta vejam as mesmas referências.
--
--   O arquivo IFC em si continua na biblioteca da organização (`digital_files`
--   + bucket privado `bim_files`) — aqui vai só o apontamento e a posição. Nada
--   disto entra no payload do desenho nem no hash da versão.
--
-- REGRA #7: sem função nova; a policy tem UMA perna (`is_org_member`), e a FK
--   composta (study_id, organization_id) amarra a organização à do estudo — não
--   dá para gravar a lista de um estudo sob a organização de outro.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: CREATE … IF NOT EXISTS, DROP/CREATE POLICY e TRIGGER.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_referencias (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `ReferenciaExterna[]` (utils/blueprintReferenciaExterna.ts).
    referencias     JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_referencias_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_referencias_study_key UNIQUE (study_id),
    CONSTRAINT blueprint_study_referencias_lista CHECK (jsonb_typeof(referencias) = 'array')
);

COMMENT ON TABLE public.blueprint_study_referencias IS
  'Modelos IFC externos (da biblioteca digital_files) desenhados como referência no 3D de um estudo de '
  'Planta Inteligente: arquivo, olho, opacidade e posição. Só coordenação — fora do payload do desenho e do hash.';

DROP TRIGGER IF EXISTS trg_blueprint_referencias_updated ON public.blueprint_study_referencias;
CREATE TRIGGER trg_blueprint_referencias_updated
    BEFORE UPDATE ON public.blueprint_study_referencias
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_referencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_referencias_org" ON public.blueprint_study_referencias;
CREATE POLICY "blueprint_study_referencias_org"
    ON public.blueprint_study_referencias
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_referencias FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_referencias TO authenticated;

RESET lock_timeout;
