-- Conta de pagamento desativada desliga a Asaas dela
--
-- Pedido do usuário em 17/10/2026, logo depois do interruptor Ativa/Inativa
-- (20271017990000): "desativei uma conta, porem ainda continua bloqueado o uso
-- de outra conta".
--
-- O defeito: o interruptor grava `payment_accounts.is_active`, mas TODA a
-- lógica da Asaas lê só `payment_account_gateway.ativo` — a trava "uma conta
-- Asaas ativa por organização" (`asaas_conta_salvar` e a Edge Function
-- `asaas-conta`), a escolha da conta que paga (`fn_conta_asaas_da_org`) e o
-- cron do extrato. A "Asaas Sandbox" da Alpa ficou desativada no cadastro e
-- ATIVA para a Asaas: seguia pagando e travava o cadastro da chave na outra.
--
-- A correção é no banco, numa regra só, para valer em todos esses caminhos
-- sem repetir a condição em cada um:
--   1. desativar a conta (is_active true -> false) desliga a Asaas dela;
--   2. a Asaas não pode ser ligada numa conta desativada;
--   3. backfill das contas que já estão nesse estado.
-- Reativar a conta NÃO religa a Asaas sozinho: ela pode colidir com outra
-- conta Asaas ativa da mesma org, e o "ativo" da Asaas tem controle próprio
-- (Editar conta › Conta Asaas).
--
-- REGRA #7, pergunta 2: as duas funções são de gatilho; a do item 1 é
-- SECURITY DEFINER porque `payment_account_gateway` só tem policy de SELECT
-- (a escrita é sempre por função). O REVOKE vai junto. A autorização continua
-- na policy de UPDATE de `payment_accounts` (só gestor da org altera a conta),
-- que roda antes do gatilho.

-- 1. Desativar a conta desliga a Asaas dela ----------------------------------
CREATE OR REPLACE FUNCTION public.fn_payment_account_desativada_desliga_gateway()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.is_active = false AND OLD.is_active IS DISTINCT FROM false THEN
        UPDATE public.payment_account_gateway
           SET ativo = false, updated_at = now()
         WHERE payment_account_id = NEW.id
           AND ativo;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_payment_account_desativada_desliga_gateway() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payment_account_desativada_desliga_gateway ON public.payment_accounts;
CREATE TRIGGER trg_payment_account_desativada_desliga_gateway
    AFTER UPDATE OF is_active ON public.payment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_payment_account_desativada_desliga_gateway();

-- 2. Asaas não liga em conta desativada --------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gateway_exige_conta_ativa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.ativo AND EXISTS (
        SELECT 1 FROM public.payment_accounts
         WHERE id = NEW.payment_account_id AND is_active = false
    ) THEN
        RAISE EXCEPTION 'Esta conta de pagamento está desativada. Ative-a em Minha Organização › Contas de Pagamento antes de ligar a Asaas.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_gateway_exige_conta_ativa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gateway_exige_conta_ativa ON public.payment_account_gateway;
CREATE TRIGGER trg_gateway_exige_conta_ativa
    BEFORE INSERT OR UPDATE OF ativo ON public.payment_account_gateway
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_gateway_exige_conta_ativa();

-- 3. Backfill -----------------------------------------------------------------
-- Estado antes (17/10/2026): uma linha só — "Asaas Sandbox" (Alpa,
-- f92d05e3-37d8-4ae2-ab29-91f4aa2acc19), is_active=false e gateway ativo=true.
-- Para desfazer: reativar a conta no cadastro e ligar a Asaas na ficha dela.
UPDATE public.payment_account_gateway g
   SET ativo = false, updated_at = now()
  FROM public.payment_accounts pa
 WHERE pa.id = g.payment_account_id
   AND pa.is_active = false
   AND g.ativo;
