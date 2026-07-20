-- migration: 20270819000008_empreendimento_terreno_tipo_profundidade.sql
-- Completa os dados de Terreno do Empreendimento (terreno_area/frente/fundos já existiam
-- desde 20260611000003): faltavam Tipo de Terreno e Profundidade, exibidos na barra
-- "Adicionar Terreno" da aba Torres & Unidades. Mesmos 2 valores de terrain_type usados em
-- plant_terrains (Planta IA) — mantém o vocabulário consistente entre os dois módulos.

ALTER TABLE public.empreendimentos
    ADD COLUMN IF NOT EXISTS terreno_tipo TEXT
        CHECK (terreno_tipo IN ('Regular (Retangular)', 'Irregular (Geometria complexa)')),
    ADD COLUMN IF NOT EXISTS terreno_profundidade NUMERIC;

COMMENT ON COLUMN public.empreendimentos.terreno_tipo IS
    'Tipo de terreno: Regular (Retangular) ou Irregular (Geometria complexa)';
COMMENT ON COLUMN public.empreendimentos.terreno_profundidade IS
    'Profundidade do terreno em metros (frente → fundos)';

-- FIM: 20270819000008_empreendimento_terreno_tipo_profundidade.sql
