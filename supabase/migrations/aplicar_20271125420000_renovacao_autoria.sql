-- Renovações › Histórico (pedido de 25/11/2026): quem renovou e quem cancelou.
--
-- Até aqui o aditivo de prorrogação não guardava autor (`requested_by` vazio
-- nos 5 aditivos do banco) nem quando/quem o cancelou — no CTL-006 a troca do
-- AD-002 pelo AD-003 (15:51) não aparecia em lugar nenhum. Mesmo desenho de
-- contract_reajustes.criado_por / desfeito_em / desfeito_por.
--
-- Idempotente. Não preenche o passado: autor e cancelamento antigos ficam NULL
-- ("—" na tela) — inventar a partir de updated_at seria afirmar sem prova.

BEGIN;

-- 1) Autor: o e-mail de quem grava, quando o app não manda outro valor.
ALTER TABLE public.contract_addendums
    ALTER COLUMN requested_by SET DEFAULT (auth.jwt() ->> 'email');

-- 2) Cancelamento: quando e por quem.
ALTER TABLE public.contract_addendums
    ADD COLUMN IF NOT EXISTS cancelado_em  timestamptz,
    ADD COLUMN IF NOT EXISTS cancelado_por text;

-- 3) Marca no banco (não no app): vale para Excluir, Editar (= substituir) e
--    para quem cancelar pela aba Aditivos — nenhum caminho esquece.
--    SECURITY INVOKER (padrão): só preenche colunas da própria linha que o
--    UPDATE já podia alterar; a RLS de contract_addendums continua decidindo.
CREATE OR REPLACE FUNCTION public.fn_contract_addendums_marca_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'Cancelado' AND OLD.status IS DISTINCT FROM 'Cancelado' THEN
        NEW.cancelado_em  := now();
        NEW.cancelado_por := auth.jwt() ->> 'email';
    END IF;
    RETURN NEW;
END;
$$;

-- REGRA #7, pergunta 2: função de gatilho não é RPC — ninguém a executa direto.
REVOKE EXECUTE ON FUNCTION public.fn_contract_addendums_marca_cancelamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contract_addendums_marca_cancelamento ON public.contract_addendums;
CREATE TRIGGER trg_contract_addendums_marca_cancelamento
    BEFORE UPDATE OF status ON public.contract_addendums
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_contract_addendums_marca_cancelamento();

COMMIT;
