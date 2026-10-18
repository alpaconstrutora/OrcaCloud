-- Chaves PIX e dados bancários: só gestor altera, toda troca auditada, e o titular
-- da chave conferido na validação de saque.
--
-- Pedido do usuário em 18/10/2026, depois da análise de segurança da integração Asaas:
-- "de acordo com os 6 itens recomendados. e sim pode comecar pelos itens 1 e 2".
-- Plano: docs/planos/2026-10-18-asaas-seguranca-chaves-pix.md.
--
-- O risco: qualquer membro trocava a chave PIX de fornecedor (política ALL, mais
-- `organization_id IS NULL` e o e-mail `admin@admin.com`) ou de colaborador (ALL para
-- quem enxerga o colaborador), sem registro. Um membro trocava a chave pela dele, o
-- administrador pagava vendo o nome do cadastro, e a validação de saque aprovava porque
-- a chave conferia com o cadastro.
--
-- 1. Trava por GATILHO (não por política): olha o que mudou. A ficha do colaborador grava
--    pela RPC INVOKER `save_employee_bank_accounts`, que regrava todas as contas a cada
--    salvamento, e quem cuida do RH é membro. Membro segue salvando; criar, trocar ou
--    apagar chave/banco/agência/conta/titular/marca exige `is_org_manager` da organização
--    da linha. Servidor e cron (`auth.uid()` nulo) seguem livres. Trocar a principal e
--    desativar não são travados (não redirecionam pagamento).
-- 2. Auditoria `conta_bancaria_auditoria`: antes/depois dos campos sensíveis, autor pelo
--    e-mail do token.
-- 3. Política de `supplier_bank_accounts` sem `organization_id IS NULL` (0 linhas hoje) e
--    sem `admin@admin.com` (as outras 15 políticas com esse e-mail são o item 4).
-- 4. Titular: `titular_diferente_autorizado` nas contas (só gestor marca — vale a trava);
--    `supplier_payments.favorecido_documento_esperado` (documento da ENTIDADE, gravado no
--    disparo e nunca regravado — `beneficiary_document` é sobrescrito pelo titular que a
--    Asaas resolve) e a cópia da marca.
--
-- REGRA #7, pergunta 1 (policies): `supplier_bank_accounts` recriada só com
-- `is_org_member`; `conta_bancaria_auditoria` com RLS e SELECT só para gestor, sem
-- política de escrita (só o gatilho grava, SECURITY DEFINER). Grants de escrita da tabela
-- nova revogados de anon/authenticated.
-- REGRA #7, pergunta 2 (funções): `fn_conta_bancaria_protegida` é de gatilho, SECURITY
-- DEFINER (precisa gravar a auditoria, que não tem política de INSERT) com search_path
-- fixo; REVOKE EXECUTE de PUBLIC/anon/authenticated. `save_employee_bank_accounts`
-- continua INVOKER (sob a RLS de employees) com o mesmo GRANT de antes.

-- Colunas -----------------------------------------------------------------------
ALTER TABLE public.supplier_bank_accounts
    ADD COLUMN IF NOT EXISTS titular_diferente_autorizado boolean NOT NULL DEFAULT false;
ALTER TABLE public.employee_bank_accounts
    ADD COLUMN IF NOT EXISTS titular_diferente_autorizado boolean NOT NULL DEFAULT false;
ALTER TABLE public.supplier_payments
    ADD COLUMN IF NOT EXISTS favorecido_documento_esperado text,
    ADD COLUMN IF NOT EXISTS titular_diferente_autorizado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.supplier_bank_accounts.titular_diferente_autorizado IS
    'A chave PIX/conta está em nome de outra pessoa/empresa e isso foi autorizado por gestor. Sem a marca, a validação de saque recusa PIX cujo titular difere do fornecedor.';
COMMENT ON COLUMN public.employee_bank_accounts.titular_diferente_autorizado IS
    'A chave PIX/conta está em nome de outra pessoa e isso foi autorizado por gestor. Sem a marca, a validação de saque recusa PIX cujo titular difere do colaborador.';
COMMENT ON COLUMN public.supplier_payments.favorecido_documento_esperado IS
    'CPF/CNPJ da entidade (fornecedor, colaborador, sócio; no avulso, o digitado) no disparo. A validação de saque compara com o titular informado pela Asaas. Nunca regravado.';

-- Auditoria ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conta_bancaria_auditoria (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    tabela          text NOT NULL,
    registro_id     uuid NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    entidade_id     uuid,
    acao            text NOT NULL CHECK (acao IN ('criada', 'alterada', 'excluida')),
    antes           jsonb,
    depois          jsonb,
    autor           text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conta_bancaria_auditoria_registro ON public.conta_bancaria_auditoria (registro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conta_bancaria_auditoria_org ON public.conta_bancaria_auditoria (organization_id, created_at DESC);

ALTER TABLE public.conta_bancaria_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cba_select ON public.conta_bancaria_auditoria;
CREATE POLICY cba_select ON public.conta_bancaria_auditoria
    FOR SELECT TO authenticated
    USING (organization_id IS NOT NULL AND public.is_org_manager(organization_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.conta_bancaria_auditoria FROM anon, authenticated;
REVOKE ALL ON public.conta_bancaria_auditoria FROM anon;
GRANT SELECT ON public.conta_bancaria_auditoria TO authenticated;

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
    ELSE
        v_org := NULLIF(v_linha->>'org_id', '')::uuid;
        v_entidade := NULLIF(v_linha->>'employee_id', '')::uuid;
    END IF;

    v_alvo := COALESCE(v_depois, v_antes);
    v_tem_dado := COALESCE(v_alvo->>'pix_key', '') <> '' OR COALESCE(v_alvo->>'account', '') <> ''
               OR COALESCE(v_alvo->>'agency', '') <> '';

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

DROP TRIGGER IF EXISTS trg_sba_protegida_antes ON public.supplier_bank_accounts;
CREATE TRIGGER trg_sba_protegida_antes BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_conta_bancaria_protegida();
DROP TRIGGER IF EXISTS trg_sba_protegida_depois ON public.supplier_bank_accounts;
CREATE TRIGGER trg_sba_protegida_depois AFTER INSERT OR UPDATE OR DELETE ON public.supplier_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_conta_bancaria_protegida();

DROP TRIGGER IF EXISTS trg_eba_protegida_antes ON public.employee_bank_accounts;
CREATE TRIGGER trg_eba_protegida_antes BEFORE INSERT OR UPDATE OR DELETE ON public.employee_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_conta_bancaria_protegida();
DROP TRIGGER IF EXISTS trg_eba_protegida_depois ON public.employee_bank_accounts;
CREATE TRIGGER trg_eba_protegida_depois AFTER INSERT OR UPDATE OR DELETE ON public.employee_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_conta_bancaria_protegida();

-- Política de supplier_bank_accounts sem as brechas -------------------------------
DROP POLICY IF EXISTS "sba_authenticated_view" ON public.supplier_bank_accounts;
CREATE POLICY "sba_authenticated_view" ON public.supplier_bank_accounts
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "sba_authenticated_manage" ON public.supplier_bank_accounts;
CREATE POLICY "sba_authenticated_manage" ON public.supplier_bank_accounts
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- RPC da ficha do colaborador grava a marca ----------------------------------------
-- Regravada a partir da definição do banco em 18/10/2026; só muda a marca.
CREATE OR REPLACE FUNCTION public.save_employee_bank_accounts(p_employee_id uuid, p_accounts jsonb)
 RETURNS SETOF employee_bank_accounts
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org         UUID;
    v_acc         JSONB;
    v_ord         BIGINT;
    v_primary_ord BIGINT;
    v_id          UUID;
    v_keep        UUID[] := ARRAY[]::UUID[];
BEGIN
    -- Sob a RLS de employees (INVOKER): colaborador invisÃ­vel = sem permissÃ£o.
    SELECT e.org_id INTO v_org FROM public.employees e WHERE e.id = p_employee_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Colaborador nÃ£o encontrado ou sem permissÃ£o.' USING ERRCODE = '42501';
    END IF;

    IF p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'array' THEN
        RAISE EXCEPTION 'p_accounts deve ser uma lista.' USING ERRCODE = '22023';
    END IF;

    -- SÃ³ contam as linhas com algum dado (a mesma condiÃ§Ã£o nas duas consultas).
    SELECT COALESCE(
               min(t.ord) FILTER (WHERE COALESCE((t.acc->>'is_primary')::BOOLEAN, false)),
               min(t.ord))
      INTO v_primary_ord
      FROM jsonb_array_elements(p_accounts) WITH ORDINALITY AS t(acc, ord)
     WHERE COALESCE(NULLIF(btrim(t.acc->>'bank_code'), ''), NULLIF(btrim(t.acc->>'bank_name'), ''),
                    NULLIF(btrim(t.acc->>'agency'), ''), NULLIF(btrim(t.acc->>'account'), ''),
                    NULLIF(btrim(t.acc->>'pix_key'), '')) IS NOT NULL;

    -- Zera a principal antes de regravar: o Ã­ndice Ãºnico parcial nÃ£o pode ver
    -- duas principais no meio da troca.
    UPDATE public.employee_bank_accounts SET is_primary = false
     WHERE employee_id = p_employee_id AND is_primary;

    FOR v_ord, v_acc IN
        SELECT t.ord, t.acc
          FROM jsonb_array_elements(p_accounts) WITH ORDINALITY AS t(acc, ord)
         WHERE COALESCE(NULLIF(btrim(t.acc->>'bank_code'), ''), NULLIF(btrim(t.acc->>'bank_name'), ''),
                        NULLIF(btrim(t.acc->>'agency'), ''), NULLIF(btrim(t.acc->>'account'), ''),
                        NULLIF(btrim(t.acc->>'pix_key'), '')) IS NOT NULL
         ORDER BY t.ord
    LOOP
        v_id := NULL;
        IF (v_acc->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.employee_bank_accounts SET
                bank_code    = NULLIF(btrim(v_acc->>'bank_code'), ''),
                bank_name    = NULLIF(btrim(v_acc->>'bank_name'), ''),
                agency       = NULLIF(btrim(v_acc->>'agency'), ''),
                account      = NULLIF(btrim(v_acc->>'account'), ''),
                account_type = COALESCE(NULLIF(v_acc->>'account_type', ''), 'corrente'),
                pix_key      = NULLIF(btrim(v_acc->>'pix_key'), ''),
                pix_key_type = NULLIF(v_acc->>'pix_key_type', ''),
                holder_name  = NULLIF(btrim(v_acc->>'holder_name'), ''),
                -- Ausente no JSON (cliente antigo) = mantém; não zera sem querer.
                titular_diferente_autorizado = CASE WHEN v_acc ? 'titular_diferente_autorizado'
                    THEN COALESCE((v_acc->>'titular_diferente_autorizado')::BOOLEAN, false)
                    ELSE titular_diferente_autorizado END,
                is_primary   = (v_ord = v_primary_ord),
                updated_at   = NOW()
             WHERE id = (v_acc->>'id')::UUID AND employee_id = p_employee_id
            RETURNING id INTO v_id;
        END IF;

        IF v_id IS NULL THEN
            INSERT INTO public.employee_bank_accounts
                (employee_id, org_id, bank_code, bank_name, agency, account, account_type,
                 pix_key, pix_key_type, holder_name, titular_diferente_autorizado, is_primary)
            VALUES
                (p_employee_id, v_org,
                 NULLIF(btrim(v_acc->>'bank_code'), ''), NULLIF(btrim(v_acc->>'bank_name'), ''),
                 NULLIF(btrim(v_acc->>'agency'), ''), NULLIF(btrim(v_acc->>'account'), ''),
                 COALESCE(NULLIF(v_acc->>'account_type', ''), 'corrente'),
                 NULLIF(btrim(v_acc->>'pix_key'), ''), NULLIF(v_acc->>'pix_key_type', ''),
                 NULLIF(btrim(v_acc->>'holder_name'), ''),
                 COALESCE((v_acc->>'titular_diferente_autorizado')::BOOLEAN, false),
                 (v_ord = v_primary_ord))
            RETURNING id INTO v_id;
        END IF;

        v_keep := v_keep || v_id;
    END LOOP;

    DELETE FROM public.employee_bank_accounts
     WHERE employee_id = p_employee_id AND NOT (id = ANY (v_keep));

    RETURN QUERY
        SELECT b.* FROM public.employee_bank_accounts b
         WHERE b.employee_id = p_employee_id
         ORDER BY b.is_primary DESC, b.created_at, b.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_employee_bank_accounts(UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_employee_bank_accounts(UUID, JSONB) TO authenticated;
