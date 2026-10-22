-- ============================================================
-- Editar um desligamento JÁ CONCLUÍDO atualiza o cadastro do colaborador
-- ============================================================
--
-- Pedido de 22/10/2026 (RH › Desligamentos, "incluir botão editar"): o usuário
-- escolheu que o desligamento concluído seja editável por inteiro, com o
-- cadastro do colaborador acompanhando.
--
-- Até aqui `finalize_termination` só agia na PASSAGEM para 'CONCLUIDO'
-- (migration 20271022300000): copia data, tipo e motivo para `employees` e
-- devolve os EPIs. Depois disso o gatilho não roda mais — corrigir a data de
-- um desligamento concluído deixaria `employees.termination_date` com a data
-- antiga, e é ela que a folha usa (`participaDaFolha`, por data).
--
-- Agora, num UPDATE de concluído para concluído que muda data, tipo ou motivo,
-- o gatilho reescreve `termination_date` e `termination_reason` do colaborador.
-- O status (DESLIGADO) e os EPIs já devolvidos não são tocados.
--
-- ⚠️ Folhas já processadas não se refazem sozinhas: a data nova vale a partir
-- do próximo reprocessamento (que tira/inclui pelo `participaDaFolha`).

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

    ELSIF TG_OP = 'UPDATE'
       AND NEW.status = 'CONCLUIDO'
       AND OLD.status = 'CONCLUIDO'
       AND (NEW.termination_date IS DISTINCT FROM OLD.termination_date
            OR NEW.tipo          IS DISTINCT FROM OLD.tipo
            OR NEW.motivo        IS DISTINCT FROM OLD.motivo) THEN

        -- 3. Desligamento concluído editado: o cadastro acompanha a correção
        UPDATE public.employees
        SET
            termination_date   = NEW.termination_date,
            termination_reason = NEW.tipo || COALESCE(' — ' || NEW.motivo, '')
        WHERE id = NEW.employee_id;
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
