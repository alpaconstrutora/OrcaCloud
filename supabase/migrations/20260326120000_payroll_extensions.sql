-- 1. Extensões da Folha de Pagamento: Tipos e Subtipos
-- Adição de suporte a Férias, 13º e Rescisão

ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'mensal';
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS subtype TEXT; -- ex: '1_parcela', '2_parcela'

-- Campos de controle para eventos específicos
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS vacation_start DATE;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS vacation_end DATE;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS termination_reason TEXT;

-- 2. Histórico de Versões do Holerite (Opcional, mas recomendado para auditoria)
-- Por enquanto usaremos payroll_items e payroll_results como fonte da verdade literal.

-- 3. Atualização de Políticas RLS (Garantir que os novos campos não quebrem nada)
-- As políticas existentes já cobrem payroll_runs por org_id, então não é necessário alteração.

-- 4. Notificações e Comentários
COMMENT ON COLUMN public.payroll_runs.type IS 'Tipo da folha: mensal, ferias, decimo_terceiro, rescisao';
COMMENT ON COLUMN public.payroll_runs.subtype IS 'Subtipo da folha: 1_parcela, 2_parcela ou total';
