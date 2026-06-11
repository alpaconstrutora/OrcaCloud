-- Dimensões do terreno (frente, fundos, laterais, área total)
ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS terreno_frente numeric,
    ADD COLUMN IF NOT EXISTS terreno_fundos numeric,
    ADD COLUMN IF NOT EXISTS terreno_lateral_direita numeric,
    ADD COLUMN IF NOT EXISTS terreno_lateral_esquerda numeric,
    ADD COLUMN IF NOT EXISTS terreno_area numeric;
