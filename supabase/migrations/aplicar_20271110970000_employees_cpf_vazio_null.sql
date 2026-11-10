-- Colaborador sem CPF: texto vazio vira NULL no BANCO (pedido de 10/11/2026).
-- Plano: docs/planos/2026-11-10-colaborador-sem-cpf.md
-- Nasceu como aplicar_20271110950000; renomeada por colisão com
-- aplicar_20271110950000_investidor_compartilhado. JÁ APLICADA no remoto em 10/11/2026.
--
-- idx_employees_cpf_unique (org_id, cpf) WHERE cpf IS NOT NULL só ignora NULL.
-- Gravado como '' (ou só a máscara), o 2º colaborador sem CPF da mesma org batia
-- em "duplicate key". O front já grava NULL (laborService, PR #317), mas duas
-- funções SQL inserem em employees sem passar por ele:
--   - contratação do ATS            (20260528000010_sprint11_ats.sql)
--   - usuário do portal de treinos  (aplicar_20271015000100_academy_portal_users.sql)
-- O gatilho cobre essas e qualquer caminho futuro. CPF com dígito fica como veio.
--
-- Gatilhos existentes em employees (lidos em 10/11/2026): só
-- trg_employees_updated_at dispara num UPDATE de cpf — a limpeza abaixo não
-- mexe em folha, histórico salarial nem centro de custo.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_employees_cpf_vazio_null()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.cpf IS NOT NULL AND regexp_replace(NEW.cpf, '\D', '', 'g') = '' THEN
        NEW.cpf := NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- REGRA #7: função de gatilho não é RPC.
REVOKE EXECUTE ON FUNCTION public.fn_employees_cpf_vazio_null() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_employees_cpf_vazio_null ON public.employees;
CREATE TRIGGER trg_employees_cpf_vazio_null
    BEFORE INSERT OR UPDATE OF cpf ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.fn_employees_cpf_vazio_null();

-- Registros já gravados sem dígito (1 em 10/11/2026: Josmar, org 926cf626…).
UPDATE public.employees
   SET cpf = NULL
 WHERE cpf IS NOT NULL
   AND regexp_replace(cpf, '\D', '', 'g') = '';

COMMIT;
