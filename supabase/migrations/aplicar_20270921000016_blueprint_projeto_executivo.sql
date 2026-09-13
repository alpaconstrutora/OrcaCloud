-- ============================================================================
-- Planta Inteligente — topografia fase 17: PROJETO EXECUTIVO com ART.
--
-- Uma linha por emissão. Enquanto `status = 'RASCUNHO'` o responsável e a
-- sondagem podem ser editados (UPDATE/DELETE permitidos, uma por estudo);
-- ao EMITIR, a linha vira imutável (trigger bloqueia UPDATE, policy bloqueia
-- DELETE) e guarda o hash da base (topografia + premissas + sondagem), as
-- verificações e o memorial como estavam — mudou a base, a tela diz que a
-- emissão não vale para o que está na tela.
--
-- O software não emite projeto: registra a emissão do responsável técnico.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Tabela NOVA, nenhuma quente.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_projeto_executivo (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id           UUID NOT NULL,
    organization_id    UUID NOT NULL,
    status             TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'EMITIDO')),
    -- {nome, titulo, conselho CREA|CAU, registro, artNumero, artData}
    responsavel        JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- {furos, nsptMedio, tipoDeSolo, nivelDagua{informado, encontrado, profundidadeM}, laudo}
    sondagem           JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Preenchidos na emissão:
    topografia_id      UUID REFERENCES public.blueprint_study_topografia(id) ON DELETE SET NULL,
    topografia_versao  INTEGER,
    topografia_hash    TEXT,
    hash_da_base       TEXT,
    verificacoes       JSONB NOT NULL DEFAULT '[]'::jsonb,
    memorial           TEXT,
    emitido_em         TIMESTAMPTZ,
    -- Sem FK para auth.users (deadlock em auth.users — ver aplicar_20270905000003).
    created_by         UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_projeto_executivo_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE
);

-- Um rascunho por estudo; emitidos, quantos forem (histórico).
CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_projeto_executivo_rascunho
    ON public.blueprint_study_projeto_executivo(study_id) WHERE status = 'RASCUNHO';
CREATE INDEX IF NOT EXISTS idx_blueprint_projeto_executivo_study
    ON public.blueprint_study_projeto_executivo(study_id);

COMMENT ON TABLE public.blueprint_study_projeto_executivo IS
  'Emissão do projeto executivo (terraplenagem, drenagem, contenção) por responsável técnico com ART/RRT. RASCUNHO editável; EMITIDO imutável, amarrado ao hash da base.';

DROP TRIGGER IF EXISTS trg_blueprint_projeto_executivo_updated ON public.blueprint_study_projeto_executivo;
CREATE TRIGGER trg_blueprint_projeto_executivo_updated
    BEFORE UPDATE ON public.blueprint_study_projeto_executivo
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

-- Emitido não muda: nem status, nem responsável, nem memorial.
DROP TRIGGER IF EXISTS trg_blueprint_projeto_executivo_immutable ON public.blueprint_study_projeto_executivo;
CREATE TRIGGER trg_blueprint_projeto_executivo_immutable
    BEFORE UPDATE ON public.blueprint_study_projeto_executivo
    FOR EACH ROW WHEN (OLD.status = 'EMITIDO')
    EXECUTE FUNCTION public.fn_blueprint_block_mutation();

ALTER TABLE public.blueprint_study_projeto_executivo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_projeto_executivo_read" ON public.blueprint_study_projeto_executivo;
CREATE POLICY "blueprint_projeto_executivo_read" ON public.blueprint_study_projeto_executivo
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_projeto_executivo_insert" ON public.blueprint_study_projeto_executivo;
CREATE POLICY "blueprint_projeto_executivo_insert" ON public.blueprint_study_projeto_executivo
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

-- Só o rascunho se edita (a emissão é o UPDATE que muda o status para EMITIDO).
DROP POLICY IF EXISTS "blueprint_projeto_executivo_update" ON public.blueprint_study_projeto_executivo;
CREATE POLICY "blueprint_projeto_executivo_update" ON public.blueprint_study_projeto_executivo
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id) AND status = 'RASCUNHO')
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_projeto_executivo_delete" ON public.blueprint_study_projeto_executivo;
CREATE POLICY "blueprint_projeto_executivo_delete" ON public.blueprint_study_projeto_executivo
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id) AND status = 'RASCUNHO');

-- Privilégios padrão do Supabase dão ALL a anon/authenticated: tira tudo e
-- devolve só o que a tabela precisa (lição de aplicar_20270921000005).
REVOKE ALL ON public.blueprint_study_projeto_executivo FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_projeto_executivo TO authenticated;

RESET lock_timeout;
