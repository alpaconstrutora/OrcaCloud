-- Adiciona campo de alerta/lembrete nas tarefas
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS alert_at TIMESTAMPTZ;

COMMENT ON COLUMN tasks.alert_at IS 'Data/hora para disparo de alerta/lembrete da tarefa';
