-- Migração SQL: ÒPURA Pro Escolha de Data de Serviço
-- Data: 11/06/2026

ALTER TABLE public.pro_servicos 
    ADD COLUMN IF NOT EXISTS data_agendamento TIMESTAMPTZ DEFAULT NULL;

-- Atualizar cache do Schema no Supabase
NOTIFY pgrst, 'reload schema';
