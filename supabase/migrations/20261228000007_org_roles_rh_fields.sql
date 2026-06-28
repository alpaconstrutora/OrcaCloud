-- migration: 20261228000007_org_roles_rh_fields.sql
-- Fase 4 — Gaps do PRD de Cargos & Funções que pertencem ao RH:
--   4a. Faixa salarial por cargo (salario_minimo / salario_maximo)
--   4b. Competências requeridas pelo cargo (competencias TEXT[])
--   4c. Trilha de carreira: próximo cargo na progressão (proximo_cargo_id)

ALTER TABLE public.org_roles
    ADD COLUMN IF NOT EXISTS salario_minimo   NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS salario_maximo   NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS competencias     TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS proximo_cargo_id UUID REFERENCES public.org_roles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_roles.salario_minimo   IS 'Piso da faixa salarial do cargo (R$).';
COMMENT ON COLUMN public.org_roles.salario_maximo   IS 'Teto da faixa salarial do cargo (R$).';
COMMENT ON COLUMN public.org_roles.competencias     IS 'Competências técnicas e comportamentais requeridas pelo cargo.';
COMMENT ON COLUMN public.org_roles.proximo_cargo_id IS 'Próximo cargo na trilha de carreira (promoção). Autoref dentro da mesma empresa.';

CREATE INDEX IF NOT EXISTS idx_org_roles_proximo_cargo
    ON public.org_roles(proximo_cargo_id) WHERE proximo_cargo_id IS NOT NULL;
