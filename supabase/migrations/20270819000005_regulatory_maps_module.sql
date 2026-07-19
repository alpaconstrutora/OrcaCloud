-- migration: 20270819000005_regulatory_maps_module.sql
--
-- Módulo "Mapa Regulatório" (cadastro) — cada cidade tem seu próprio mapa regulatório
-- definido pela prefeitura (macroáreas, zonas, C.A., taxa de ocupação, gabarito etc.).
-- Até aqui esse dado só existia digitado à mão, empreendimento por empreendimento, em
-- empreendimento_regulatory_zones (migration 20270218000002). Isso obrigava o usuário a
-- retranscrever a mesma lei municipal toda vez que abria um novo empreendimento na mesma
-- cidade. Este módulo cadastra o mapa UMA VEZ por cidade; o empreendimento apenas seleciona
-- e importa (copia) as zonas aplicáveis — não é um vínculo vivo, é ponto de partida editável
-- (mesma filosofia de "pin" usada no SINAPI versionado).
--
-- Escopo: por organização (organization_id), igual ao restante do módulo Empreendimentos —
-- NÃO é dado global compartilhado entre tenants como master_cities/SINAPI, porque aqui quem
-- digita a lei municipal é o próprio usuário (sem curadoria central).
--
-- regulatory_maps.city_id referencia master_cities (tabela estável, sem histórico de ALTER
-- TABLE frequente) — FK direta é segura aqui, diferente do padrão "sem FK" usado nas tabelas
-- filhas de empreendimentos (que evita lock contention nas ALTERs frequentes de empreendimentos).

CREATE TABLE IF NOT EXISTS public.regulatory_maps (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    city_id           UUID NOT NULL REFERENCES public.master_cities(id) ON DELETE RESTRICT,
    name              TEXT NOT NULL,
    lei_referencia    TEXT,
    status            TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'RASCUNHO', 'ARQUIVADO')),
    observacoes       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regulatory_maps_org  ON public.regulatory_maps (organization_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_maps_city ON public.regulatory_maps (city_id);

DROP TRIGGER IF EXISTS trg_regulatory_maps_updated_at ON public.regulatory_maps;
CREATE TRIGGER trg_regulatory_maps_updated_at
    BEFORE UPDATE ON public.regulatory_maps
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.regulatory_maps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_regulatory_maps" ON public.regulatory_maps;
CREATE POLICY "org_access_regulatory_maps" ON public.regulatory_maps
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.empr_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.empr_user_org_ids()));

-- Zonas do mapa — mesmos 21 campos de empreendimento_regulatory_zones (migration
-- 20270218000002), agora presos ao mapa da cidade em vez de a um empreendimento específico.
CREATE TABLE IF NOT EXISTS public.regulatory_map_zones (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regulatory_map_id           UUID NOT NULL REFERENCES public.regulatory_maps(id) ON DELETE CASCADE,
    organization_id             UUID NOT NULL,          -- p/ RLS direta, sem join
    macroarea                   TEXT,
    zona                        TEXT,
    ca_minimo                   TEXT,
    ca_basico                   TEXT,
    ca_maximo                   TEXT,
    taxa_ocupacao_maxima        TEXT,
    taxa_permeabilidade_minima  TEXT,
    gabarito_altura_maxima      TEXT,
    uso_permitido               TEXT,
    recuo_frente                TEXT,
    recuo_fundos                TEXT,
    recuo_lateral_direita       TEXT,
    recuo_lateral_esquerda      TEXT,
    gabarito_pavimentos         TEXT,
    regra_vagas                 TEXT,
    vagas_por_unidade           TEXT,
    area_minima_unidade         TEXT,
    lei_referencia              TEXT,
    documento_fonte             TEXT,
    nivel_confianca             TEXT,
    observacoes                 TEXT,
    sort_order                  INTEGER NOT NULL DEFAULT 0,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regulatory_map_zones_map ON public.regulatory_map_zones (regulatory_map_id);

DROP TRIGGER IF EXISTS trg_regulatory_map_zones_updated_at ON public.regulatory_map_zones;
CREATE TRIGGER trg_regulatory_map_zones_updated_at
    BEFORE UPDATE ON public.regulatory_map_zones
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.regulatory_map_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_regulatory_map_zones" ON public.regulatory_map_zones;
CREATE POLICY "org_access_regulatory_map_zones" ON public.regulatory_map_zones
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.empr_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.empr_user_org_ids()));

COMMENT ON TABLE public.regulatory_maps IS 'Cadastro de mapas regulatórios por cidade (Incorporação). Um mapa por cidade/legislação; empreendimentos importam (copiam) zonas dele para empreendimento_regulatory_zones.';
COMMENT ON TABLE public.regulatory_map_zones IS 'Zonas urbanísticas de um mapa regulatório cadastrado (macroárea/zona/C.A./gabarito/recuos/vagas). Mesmo shape de empreendimento_regulatory_zones.';
