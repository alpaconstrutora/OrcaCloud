-- ============================================================================
-- Planta Inteligente — topografia do estudo (curvas de nível)
--
-- Cada linha é UMA VERSÃO gerada: a grade de cotas, as curvas, as estatísticas
-- e a proveniência inteira (fonte, dataset, resolução, referência vertical,
-- algoritmo, hashes). É o §12.2 do PRD "Mapas Topográficos", reduzido ao que a
-- Planta Inteligente usa — ver docs/planos/2026-09-10-planta-inteligente-topografia.md
-- e a reconciliação de 30/08 (DR-01, DR-02, DR-05).
--
-- ─── POR QUE NÃO VAI NO PAYLOAD CANÔNICO ───────────────────────────────────
-- A cota do terreno é dado do MUNDO, não geometria do desenho. Gravá-la no
-- snapshot faria o hash da planta mudar porque alguém amostrou um DEM — e
-- publicar deixaria de ser idempotente. Mesma razão de
-- `blueprint_study_urban_context` e dos underlays.
--
-- ─── POR QUE VERSÃO É IMUTÁVEL NO SCHEMA ────────────────────────────────────
-- RN-005 do PRD: geometria + insumo + parâmetros + algoritmo, uma vez gerados,
-- não mudam — uma nova execução é uma nova versão. Aqui isso não é regra de
-- tela: `authenticated` NÃO recebe UPDATE. Quem quer outra curva gera outra
-- linha; quem errou apaga a linha.
--
-- ─── POR QUE A GRADE É JSONB E NÃO TABELA DE PONTOS ─────────────────────────
-- Nenhuma tela consulta ponto por ponto (E-05 da reconciliação). O teto de
-- 10.000 nós por versão (utils/blueprintTopografia.ts) mantém a linha em
-- dezenas de KB. Tabela de pontos entra no dia em que houver consulta espacial.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). O histórico de
--    schema_migrations está furado desde 20270208* — NUNCA `supabase db push`.
-- ⚠️ Tabela NOVA, nenhuma quente: não pega lock em nada em uso.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_topografia (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,

    -- Sequencial por estudo. A tela mostra "v3"; o hash é o que se confere.
    versao          INTEGER NOT NULL CHECK (versao > 0),

    -- Proveniência da FONTE (RF-007), copiada para a linha: se o registro de
    -- fontes mudar amanhã, a versão de hoje continua dizendo de onde veio.
    fonte_codigo        TEXT NOT NULL,
    fonte_nome          TEXT NOT NULL,
    dataset_versao      TEXT,
    resolucao_fonte_m   NUMERIC CHECK (resolucao_fonte_m IS NULL OR resolucao_fonte_m > 0),
    referencia_vertical TEXT,
    classe_qualidade    TEXT NOT NULL
        CHECK (classe_qualidade IN ('PRELIMINAR_REMOTO', 'LEVANTAMENTO_IMPORTADO')),

    -- A grade: { origem:{x,y}, espacamentoMm, colunas, linhas, cotasM:[…] }.
    -- Posição em mm do desenho; cota em METRO, absoluta, no referencial da fonte.
    grade           JSONB NOT NULL,
    equidistancia_m NUMERIC NOT NULL CHECK (equidistancia_m > 0),

    -- Curvas já recortadas no lote: [{ cotaM, mestra, fechada, pontos:[{x,y}] }].
    curvas          JSONB NOT NULL DEFAULT '[]'::jsonb,
    estatisticas    JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- O que entrou: pontos cotados (quando a fonte é o levantamento), o anel do
    -- lote no momento da geração e a georreferência usada. Sem isto o hash de
    -- entrada não seria conferível.
    pontos_cotados  JSONB NOT NULL DEFAULT '[]'::jsonb,
    anel            JSONB NOT NULL,
    georreferencia  JSONB,

    algoritmo_nome   TEXT NOT NULL,
    algoritmo_versao TEXT NOT NULL,
    hash_entrada     TEXT NOT NULL,
    hash_resultado   TEXT NOT NULL,
    avisos           JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- UUID de auth.users, NUNCA e-mail (DR-05). Sem FK, como todo o módulo
    -- (ver aplicar_20270905000004_blueprint_drop_auth_users_fk.sql).
    created_by      UUID DEFAULT auth.uid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- FK COMPOSTO, como todos os filhos do módulo: impossível, no schema,
    -- pendurar a topografia de uma organização num estudo de outra.
    CONSTRAINT blueprint_study_topografia_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,

    CONSTRAINT blueprint_study_topografia_versao_key UNIQUE (study_id, versao)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_topografia_study
    ON public.blueprint_study_topografia(study_id);

COMMENT ON TABLE public.blueprint_study_topografia IS
  'Versões de topografia (grade de cotas + curvas de nível) de um estudo de '
  'Planta Inteligente, com proveniência e hashes. Fora do payload canônico: cota '
  'do terreno é dado do mundo, não geometria. Imutável: sem UPDATE para authenticated.';

COMMENT ON COLUMN public.blueprint_study_topografia.grade IS
  '{ origem:{x,y} mm, espacamentoMm, colunas, linhas, cotasM:[número|null] } — '
  'null é nodata; cota em metro, absoluta, no referencial vertical da fonte.';

COMMENT ON COLUMN public.blueprint_study_topografia.classe_qualidade IS
  'RF-020: PRELIMINAR_REMOTO (DEM público) ou LEVANTAMENTO_IMPORTADO (pontos '
  'cotados digitados). Nenhuma das duas é levantamento validado.';

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Camada AUTHENTICATED explícita: `GRANT authenticated` sozinho não impede anon.
ALTER TABLE public.blueprint_study_topografia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_topografia_org"
    ON public.blueprint_study_topografia;
CREATE POLICY "blueprint_study_topografia_org"
    ON public.blueprint_study_topografia
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- ⚠️ `FROM PUBLIC` sozinho NÃO basta: os privilégios padrão do Supabase concedem
-- ALL a `anon` e `authenticated` em toda tabela nova (ALTER DEFAULT PRIVILEGES),
-- e isso é grant DIRETO nos papéis, não em PUBLIC. Medido em 10/09/2026: sem as
-- duas linhas abaixo a tabela nasceu com UPDATE para authenticated e 7
-- privilégios para anon.
REVOKE ALL ON public.blueprint_study_topografia FROM PUBLIC, anon, authenticated;
-- Sem UPDATE de propósito: versão gerada é imutável (RN-005).
GRANT SELECT, INSERT, DELETE
    ON public.blueprint_study_topografia TO authenticated;

RESET lock_timeout;
