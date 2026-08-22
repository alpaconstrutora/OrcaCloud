-- ============================================================================
-- Planta Inteligente — contexto urbanístico do estudo
--
-- Guarda QUAL zona do Mapa Regulatório se aplica a este estudo de blueprint e
-- quais números dela estão em vigor no desenho (recuos, T.O., C.A., gabarito,
-- permeabilidade).
--
-- ─── POR QUE NÃO VAI NO PAYLOAD CANÔNICO ───────────────────────────────────
-- Recuo e limite de zona são parâmetro urbanístico do MUNICÍPIO, não geometria
-- do desenho. Gravá-los no snapshot faria o hash da planta mudar porque alguém
-- digitou um recuo — e publicar deixaria de ser idempotente. O que É do desenho
-- (qual lado é a frente) já vive em `Boundary.papel`, dentro do payload.
-- Ver o comentário em components/blueprint/BlueprintEditor.tsx.
--
-- ─── POR QUE UMA TABELA, E NÃO COLUNAS EM blueprint_studies ────────────────
-- São 11 colunas de um assunto só, opcionais, que só existem quando alguém liga
-- o estudo ao Mapa Regulatório. Penduradas no estudo, ficariam nulas na maioria
-- das linhas e obrigariam todo SELECT do módulo a carregá-las.
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor. O histórico de schema_migrations está furado
--    desde 20270208* — NUNCA `supabase db push`.
-- ⚠️ Tabela NOVA, nenhuma quente: não pega lock em nada em uso.
-- ⚠️ Prefixo 20270914000000 escolhido à frente do bloco 20270913*, onde outra
--    frente estava trabalhando — ver __tests__/migrationsPrefixo.test.ts.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_urban_context (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,

    -- De onde os números vieram. SEM FK, de propósito: `empreendimento_id` segue
    -- o mesmo padrão anti-deadlock de `empreendimento_regulatory_zones`, e a
    -- zona pode ser apagada na aba do empreendimento sem que este estudo deva
    -- sumir junto — ele só passa a mostrar a origem como perdida.
    empreendimento_id   UUID,
    regulatory_zone_id  UUID,

    -- Cópia do rótulo da zona ("ZR-2 · Zona Residencial 2"). Existe para a tela
    -- continuar legível quando a zona de origem for apagada ou renomeada: sem
    -- isto, o estudo mostraria um UUID órfão ou nada.
    zona_rotulo     TEXT,
    lei_referencia  TEXT,

    -- Recuos em MILÍMETRO INTEIRO — a unidade do kernel geométrico. A lei fala
    -- em metros; a conversão acontece na borda (utils/regulatoryValue.ts).
    recuo_frente_mm           INTEGER CHECK (recuo_frente_mm           IS NULL OR recuo_frente_mm           >= 0),
    recuo_fundos_mm           INTEGER CHECK (recuo_fundos_mm           IS NULL OR recuo_fundos_mm           >= 0),
    recuo_lateral_direita_mm  INTEGER CHECK (recuo_lateral_direita_mm  IS NULL OR recuo_lateral_direita_mm  >= 0),
    recuo_lateral_esquerda_mm INTEGER CHECK (recuo_lateral_esquerda_mm IS NULL OR recuo_lateral_esquerda_mm >= 0),

    -- Taxas em PORCENTAGEM (80 = 80%), nunca fração. A base guarda as duas
    -- formas ('0,8' e '80') e a normalização acontece na leitura; aqui já chega
    -- resolvido, para não repetir a ambiguidade no banco.
    taxa_ocupacao_max        NUMERIC CHECK (taxa_ocupacao_max        IS NULL OR taxa_ocupacao_max        >= 0),
    taxa_permeabilidade_min  NUMERIC CHECK (taxa_permeabilidade_min  IS NULL OR taxa_permeabilidade_min  >= 0),
    coeficiente_max          NUMERIC CHECK (coeficiente_max          IS NULL OR coeficiente_max          >= 0),
    gabarito_altura_max_m    NUMERIC CHECK (gabarito_altura_max_m    IS NULL OR gabarito_altura_max_m    >= 0),
    gabarito_pavimentos      INTEGER CHECK (gabarito_pavimentos      IS NULL OR gabarito_pavimentos      >= 0),

    -- Por campo: 'ZONA' (veio da lei) ou 'MANUAL' (o usuário digitou por cima).
    -- É o que sustenta o rótulo "ajustado à mão" na tela — sem isto, um número
    -- corrigido pelo usuário seria reapresentado como se fosse a lei.
    origem_valores  JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Quando a zona foi aplicada. Base da detecção de deriva: se a zona de
    -- origem foi editada depois disto, a tela oferece reaplicar.
    aplicado_em     TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- FK COMPOSTO, como todos os filhos do módulo: torna impossível, no nível do
    -- schema, pendurar o contexto de uma organização num estudo de outra.
    CONSTRAINT blueprint_study_urban_context_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,

    -- Um lote por estudo é escopo declarado do módulo (gleba multi-lote está
    -- fora). Um contexto urbanístico por estudo acompanha.
    CONSTRAINT blueprint_study_urban_context_study_key UNIQUE (study_id)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_urban_context_study
    ON public.blueprint_study_urban_context(study_id);

COMMENT ON TABLE public.blueprint_study_urban_context IS
  'Zona do Mapa Regulatório aplicada a um estudo de Planta Inteligente, com os '
  'valores em vigor. Fora do payload canônico de propósito: parâmetro urbanístico '
  'não é geometria e não pode mudar o hash do desenho.';

COMMENT ON COLUMN public.blueprint_study_urban_context.origem_valores IS
  'Por campo: ZONA (veio da lei) ou MANUAL (digitado por cima). Sustenta o '
  'rótulo "ajustado à mão".';

-- ─── Trigger de updated_at (a função já existe desde 20270905000000) ────────
DROP TRIGGER IF EXISTS trg_blueprint_urban_context_updated
    ON public.blueprint_study_urban_context;
CREATE TRIGGER trg_blueprint_urban_context_updated
    BEFORE UPDATE ON public.blueprint_study_urban_context
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Camada AUTHENTICATED explícita: `GRANT authenticated` sozinho não impede anon.
ALTER TABLE public.blueprint_study_urban_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_urban_context_org"
    ON public.blueprint_study_urban_context;
CREATE POLICY "blueprint_study_urban_context_org"
    ON public.blueprint_study_urban_context
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_urban_context FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.blueprint_study_urban_context TO authenticated;

RESET lock_timeout;
