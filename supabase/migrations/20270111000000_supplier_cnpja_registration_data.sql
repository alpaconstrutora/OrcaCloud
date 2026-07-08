-- Amplia o cadastro de fornecedores com os dados da Receita Federal/Simples/
-- Cadastro de Contribuintes trazidos pela consulta CNPJa (open.cnpja.com).
-- Aplique no Supabase Dashboard → SQL Editor.

ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS cnpj_status              text,
    ADD COLUMN IF NOT EXISTS cnpj_status_date          date,
    ADD COLUMN IF NOT EXISTS cnpj_updated_at           timestamptz,
    ADD COLUMN IF NOT EXISTS cnpj_founded_at           date,
    ADD COLUMN IF NOT EXISTS cnpj_legal_nature         text,
    ADD COLUMN IF NOT EXISTS cnpj_company_size         text,
    ADD COLUMN IF NOT EXISTS cnpj_main_activity_code   text,
    ADD COLUMN IF NOT EXISTS cnpj_main_activity_text   text,
    ADD COLUMN IF NOT EXISTS cnpj_side_activities      jsonb,
    ADD COLUMN IF NOT EXISTS cnpj_partners             jsonb,
    ADD COLUMN IF NOT EXISTS cnpj_simples_optant       boolean,
    ADD COLUMN IF NOT EXISTS cnpj_simples_since        date,
    ADD COLUMN IF NOT EXISTS cnpj_simei_optant         boolean,
    ADD COLUMN IF NOT EXISTS cnpj_simei_since          date,
    ADD COLUMN IF NOT EXISTS cnpj_state_registrations  jsonb;

COMMENT ON COLUMN public.suppliers.cnpj_side_activities IS 'Array [{code, text}] de CNAEs secundários (CNPJa).';
COMMENT ON COLUMN public.suppliers.cnpj_partners IS 'Array [{name, role, since}] do QSA (CNPJa).';
COMMENT ON COLUMN public.suppliers.cnpj_state_registrations IS 'Array [{number, state, enabled, status}] de inscrições estaduais (CNPJa).';
