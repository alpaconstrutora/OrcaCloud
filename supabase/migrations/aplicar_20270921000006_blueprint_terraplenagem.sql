-- ============================================================================
-- Planta Inteligente — premissa de terraplenagem do estudo (fase 2 da topografia)
--
-- UMA linha por estudo: em que base se apoia o platô (envelope construtivo ou
-- lote inteiro) e em que cota ele fica. Os VOLUMES de corte e aterro não são
-- gravados: são derivados, a cada abertura, da versão de topografia exibida ×
-- esta premissa (utils/blueprintTopografiaAnalises.ts). Gravar o volume seria
-- gravar uma resposta que muda quando a versão muda.
--
-- ─── POR QUE NÃO VAI NA VERSÃO DE TOPOGRAFIA ────────────────────────────────
-- `blueprint_study_topografia` é IMUTÁVEL (sem UPDATE): é o terreno medido. O
-- platô é decisão de PROJETO, muda dez vezes numa tarde, e vale para qualquer
-- versão do terreno. Mesma separação de `blueprint_study_urban_context`.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Tabela NOVA, nenhuma quente.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_terraplenagem (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,

    -- Onde o platô se apoia. ENVELOPE = o que sobra dos recuos; LOTE = o anel
    -- inteiro (estudo sem recuos, ou platô da gleba toda).
    base            TEXT NOT NULL DEFAULT 'ENVELOPE' CHECK (base IN ('ENVELOPE', 'LOTE')),
    -- Cota do platô, em METRO, no mesmo referencial da versão de topografia.
    -- NULL = usar a cota de equilíbrio (sugestão), que é recalculada na tela.
    cota_plato_m    NUMERIC,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_study_terraplenagem_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_terraplenagem_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_terraplenagem IS
  'Premissa de terraplenagem preliminar de um estudo de Planta Inteligente: base '
  'do platô e cota. Volumes são derivados na tela, nunca gravados.';

DROP TRIGGER IF EXISTS trg_blueprint_terraplenagem_updated
    ON public.blueprint_study_terraplenagem;
CREATE TRIGGER trg_blueprint_terraplenagem_updated
    BEFORE UPDATE ON public.blueprint_study_terraplenagem
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_terraplenagem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_terraplenagem_org"
    ON public.blueprint_study_terraplenagem;
CREATE POLICY "blueprint_study_terraplenagem_org"
    ON public.blueprint_study_terraplenagem
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- `FROM PUBLIC` sozinho não tira os privilégios padrão do Supabase (grant
-- direto em anon/authenticated) — medido em 10/09/2026 na tabela de topografia.
REVOKE ALL ON public.blueprint_study_terraplenagem FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.blueprint_study_terraplenagem TO authenticated;

RESET lock_timeout;
