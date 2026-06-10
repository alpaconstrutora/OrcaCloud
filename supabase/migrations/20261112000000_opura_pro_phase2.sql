-- Migração SQL: ÒPURA Pro Automação & Recorrência (Fase 2)
-- Data: 08/06/2026

-- 1. Alterações na tabela de serviços para controle de recorrência
ALTER TABLE public.pro_servicos 
    ADD COLUMN IF NOT EXISTS recorrencia_meses INTEGER DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS proximo_agendamento TIMESTAMPTZ DEFAULT NULL;

-- 2. Alterações na tabela de configuração para templates e profissão
ALTER TABLE public.pro_config 
    ADD COLUMN IF NOT EXISTS profissao TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS templates_custom JSONB DEFAULT '[]'::JSONB;

-- 3. Atualizar cache do Schema no Supabase
NOTIFY pgrst, 'reload schema';
