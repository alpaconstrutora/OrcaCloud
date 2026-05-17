-- ============================================================
-- AUDITORIA E VALIDAÇÃO AUTOMÁTICA DA FOLHA
-- ============================================================

-- Adiciona coluna para armazenar os resultados da auditoria (logs de divergência)
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS validation_logs JSONB DEFAULT '[]'::jsonb;

-- Comentário explicativo
COMMENT ON COLUMN public.payroll_runs.validation_logs IS 'Armazena inconsistências detectadas pelo motor de validação (auditoria)';
