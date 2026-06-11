-- Trigger: zera alert_sent_at automaticamente quando alert_at é alterado.
-- Isso permite que o alerta dispare novamente se o usuário remarcar o lembrete,
-- enquanto tarefas concluídas (status = 'done') continuam sendo ignoradas pela Edge Function.

CREATE OR REPLACE FUNCTION reset_task_alert_sent_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.alert_at IS DISTINCT FROM OLD.alert_at THEN
    NEW.alert_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_task_alert_sent_at ON tasks;

CREATE TRIGGER trg_reset_task_alert_sent_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION reset_task_alert_sent_at();
