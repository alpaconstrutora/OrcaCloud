-- ============================================================
-- Desligamento concluído NA CRIAÇÃO não desligava o colaborador
-- ============================================================
--
-- O gatilho `trg_finalize_termination` era só BEFORE UPDATE e agia só quando o
-- status ANTERIOR não era 'CONCLUIDO'. A tela (LaborTermination › Finalizar
-- num desligamento novo) grava o registro já como 'CONCLUIDO' no INSERT e
-- depois chama `finalizeTermination` (UPDATE status='CONCLUIDO'):
--   • no INSERT o gatilho não existia;
--   • no UPDATE seguinte OLD.status já é 'CONCLUIDO' → condição falsa.
-- Resultado: desligamento "Concluído" com o colaborador ainda ATIVO, sem data
-- de desligamento, e entrando nas folhas seguintes. Caso real (22/10/2026):
-- Clovis Mariano da Rosa, desligado em 31/05/2026, nas folhas de 06, 07 e
-- 09/2026 — acertado à parte, só ele.
--
-- Correção: o gatilho passa a rodar também no INSERT.

CREATE OR REPLACE FUNCTION public.finalize_termination()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.status = 'CONCLUIDO'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'CONCLUIDO') THEN

        -- 1. Desligar colaborador
        UPDATE public.employees
        SET
            status             = 'DESLIGADO',
            termination_date   = NEW.termination_date,
            termination_reason = NEW.tipo || COALESCE(' — ' || NEW.motivo, '')
        WHERE id = NEW.employee_id;

        -- 2. Devolver EPIs pendentes automaticamente
        UPDATE public.epi_deliveries
        SET
            is_returned  = TRUE,
            returned_at  = NEW.termination_date
        WHERE employee_id = NEW.employee_id
          AND is_returned  = FALSE;

        NEW.epis_devolvidos    := TRUE;
        NEW.acessos_bloqueados := TRUE;
    END IF;

    RETURN NEW;
END;
$$;

-- Função de gatilho: ninguém a chama diretamente (o gatilho não depende de
-- EXECUTE de quem grava).
REVOKE EXECUTE ON FUNCTION public.finalize_termination() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finalize_termination ON public.termination_records;
CREATE TRIGGER trg_finalize_termination
    BEFORE INSERT OR UPDATE ON public.termination_records
    FOR EACH ROW EXECUTE FUNCTION public.finalize_termination();
