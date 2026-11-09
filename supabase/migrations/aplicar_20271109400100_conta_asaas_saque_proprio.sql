-- Financeiro › Conta Asaas — transferir o saldo da Asaas para a conta bancária PRÓPRIA
--
-- Plano: docs/planos/2026-11-09-conta-asaas-tela-financeiro.md (PR 2)
-- Pedido do usuário (09/11/2026): "Transferir saldo p/ banco".
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar ANTES de publicar a Edge Function asaas-payment (ações saque_*).
--
-- O destino é OUTRA conta de pagamento da mesma organização, com chave PIX
-- cadastrada nela. A chave é o vetor de desvio (trocá-la pela de terceiro faria o
-- saque "para a conta própria" sair para outro lugar), então ela ganha a MESMA
-- proteção das chaves de fornecedor e colaborador (aplicar_20271018460000):
--   • só proprietário/administrador cria, troca ou apaga a chave (gatilho, olha o
--     que mudou — o resto do cadastro da conta segue como antes);
--   • toda troca vai para `conta_bancaria_auditoria` (é dela que sai a quarentena
--     de 24 h: quem alterou a chave não envia o saque);
--   • a validação de saque confere o titular pelo CNPJ da empresa dona da conta
--     (`supplier_payments.favorecido_documento_esperado`, gravado pela Edge).
--
-- `fn_conta_bancaria_protegida` é regravada a partir do ARQUIVO (a definição no
-- banco estava com os acentos corrompidos — "SÃ³ proprietÃ¡rio" — da aplicação de
-- 18/10); a lógica das duas tabelas existentes não muda, só entra o ramo de
-- `payment_accounts`.
--
-- REGRA #7, pergunta 1 (policies): nenhuma policy criada nem alterada.
-- REGRA #7, pergunta 2 (funções): `fn_conta_bancaria_protegida` continua de
-- gatilho, SECURITY DEFINER (grava a auditoria, que não tem política de INSERT),
-- search_path fixo, REVOKE EXECUTE de PUBLIC/anon/authenticated. Quem mais executa:
-- só os gatilhos das três tabelas.

-- Colunas -------------------------------------------------------------------------
ALTER TABLE public.payment_accounts
    ADD COLUMN IF NOT EXISTS pix_chave text,
    ADD COLUMN IF NOT EXISTS pix_tipo  text;

ALTER TABLE public.payment_accounts DROP CONSTRAINT IF EXISTS payment_accounts_pix_tipo_check;
ALTER TABLE public.payment_accounts ADD CONSTRAINT payment_accounts_pix_tipo_check
    CHECK (pix_tipo IS NULL OR pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'));

COMMENT ON COLUMN public.payment_accounts.pix_chave IS
    'Chave PIX desta conta bancária própria — destino da transferência do saldo da conta Asaas. Só gestor altera (fn_conta_bancaria_protegida); trocas em conta_bancaria_auditoria.';
COMMENT ON COLUMN public.payment_accounts.pix_tipo IS
    'Tipo da chave PIX (mesmo vocabulário de supplier_payments.pix_key_type).';

ALTER TABLE public.supplier_payments
    ADD COLUMN IF NOT EXISTS destino_payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.supplier_payments.destino_payment_account_id IS
    'Saque para conta própria (favorecido_origem = conta_propria): a conta de pagamento que recebe. Sem título.';

ALTER TABLE public.supplier_payments DROP CONSTRAINT IF EXISTS supplier_payments_favorecido_origem_check;
ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_favorecido_origem_check
    CHECK (favorecido_origem IS NULL OR favorecido_origem IN ('fornecedor', 'colaborador', 'socio', 'avulso', 'conta_propria'));

-- Gatilho: trava (BEFORE) e auditoria (AFTER) -----------------------------------
CREATE OR REPLACE FUNCTION public.fn_conta_bancaria_protegida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_campos   text[];
    v_linha    jsonb;
    v_antes    jsonb;
    v_depois   jsonb;
    v_org      uuid;
    v_entidade uuid;
    v_alvo     jsonb;
    v_tem_dado boolean;
BEGIN
    IF TG_TABLE_NAME = 'supplier_bank_accounts' THEN
        v_campos := ARRAY['bank_code','bank_name','agency','agency_digit','account','account_digit','account_type',
                          'beneficiary_name','beneficiary_document','pix_key','pix_key_type','titular_diferente_autorizado'];
    ELSIF TG_TABLE_NAME = 'payment_accounts' THEN
        -- Só a chave: banco/agência/conta da conta própria não direcionam dinheiro.
        v_campos := ARRAY['pix_chave','pix_tipo'];
    ELSE
        v_campos := ARRAY['bank_code','bank_name','agency','account','account_type',
                          'pix_key','pix_key_type','holder_name','titular_diferente_autorizado'];
    END IF;

    IF TG_OP <> 'INSERT' THEN
        SELECT jsonb_object_agg(e.k, e.v) INTO v_antes FROM jsonb_each(to_jsonb(OLD)) AS e(k, v) WHERE e.k = ANY (v_campos);
    END IF;
    IF TG_OP <> 'DELETE' THEN
        SELECT jsonb_object_agg(e.k, e.v) INTO v_depois FROM jsonb_each(to_jsonb(NEW)) AS e(k, v) WHERE e.k = ANY (v_campos);
    END IF;

    -- Nada sensível mudou (ex.: trocar a principal, desativar, observação): passa e não audita.
    IF TG_OP = 'UPDATE' AND v_antes IS NOT DISTINCT FROM v_depois THEN
        RETURN CASE WHEN TG_WHEN = 'BEFORE' THEN NEW ELSE NULL END;
    END IF;

    v_linha := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    IF TG_TABLE_NAME = 'supplier_bank_accounts' THEN
        v_org := NULLIF(v_linha->>'organization_id', '')::uuid;
        v_entidade := NULLIF(v_linha->>'supplier_id', '')::uuid;
    ELSIF TG_TABLE_NAME = 'payment_accounts' THEN
        v_org := NULLIF(v_linha->>'organization_id', '')::uuid;
        v_entidade := NULL;
    ELSE
        v_org := NULLIF(v_linha->>'org_id', '')::uuid;
        v_entidade := NULLIF(v_linha->>'employee_id', '')::uuid;
    END IF;

    v_alvo := COALESCE(v_depois, v_antes);
    v_tem_dado := COALESCE(v_alvo->>'pix_key', '') <> '' OR COALESCE(v_alvo->>'account', '') <> ''
               OR COALESCE(v_alvo->>'agency', '') <> '' OR COALESCE(v_alvo->>'pix_chave', '') <> '';

    -- Conta de pagamento criada ou apagada SEM chave: não é dado bancário a proteger
    -- nem a auditar (o cadastro de contas segue como sempre foi).
    IF TG_TABLE_NAME = 'payment_accounts' AND TG_OP <> 'UPDATE' AND NOT v_tem_dado THEN
        RETURN CASE WHEN TG_WHEN = 'BEFORE' THEN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END ELSE NULL END;
    END IF;

    IF TG_WHEN = 'BEFORE' THEN
        IF auth.uid() IS NOT NULL
           AND (TG_OP = 'UPDATE' OR v_tem_dado)
           AND NOT public.is_org_manager(v_org) THEN
            RAISE EXCEPTION 'Só proprietário ou administrador da organização altera chave PIX ou dados bancários (proteção contra desvio de pagamento).'
                USING ERRCODE = '42501';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    INSERT INTO public.conta_bancaria_auditoria (tabela, registro_id, organization_id, entidade_id, acao, antes, depois, autor)
    VALUES (TG_TABLE_NAME, (v_linha->>'id')::uuid, v_org, v_entidade,
            CASE TG_OP WHEN 'INSERT' THEN 'criada' WHEN 'UPDATE' THEN 'alterada' ELSE 'excluida' END,
            v_antes, v_depois, COALESCE(auth.jwt()->>'email', 'sistema'));
    RETURN NULL;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_conta_bancaria_protegida() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pa_chave_protegida_antes ON public.payment_accounts;
CREATE TRIGGER trg_pa_chave_protegida_antes BEFORE INSERT OR UPDATE OR DELETE ON public.payment_accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_conta_bancaria_protegida();
DROP TRIGGER IF EXISTS trg_pa_chave_protegida_depois ON public.payment_accounts;
CREATE TRIGGER trg_pa_chave_protegida_depois AFTER INSERT OR UPDATE OR DELETE ON public.payment_accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_conta_bancaria_protegida();
