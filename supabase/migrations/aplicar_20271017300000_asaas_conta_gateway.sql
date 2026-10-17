-- Integração Asaas — Fase 2: a conta Asaas vira Conta de Pagamento da organização
--
-- Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (itens 2.1–2.3).
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar ANTES de publicar as Edge Functions asaas-conta / asaas-charge /
-- asaas-payment / asaas-status-sync / asaas-webhook desta fase.
--
-- O que muda:
--   • payment_accounts.kind ('banco' | 'caixa' | 'gateway').
--   • payment_account_gateway (1:1): ambiente, chave no Vault, tetos, piloto,
--     cursor do extrato, último saldo/erro. Tetos e piloto são HIPÓTESES
--     editáveis na tela (Minha Organização › Contas), não constantes.
--   • client_charges / supplier_payments ganham payment_account_id: a conta
--     Asaas por onde o dinheiro passou — a baixa grava essa conta no título.
--
-- REGRA #7
--   Pergunta 1 (policy): payment_account_gateway tem UMA policy, de SELECT:
--     EXISTS (payment_accounts pa WHERE pa.id = … AND is_org_member(pa.organization_id))
--     — sem OR; só membro da org DONA lê. Nenhuma policy de escrita: INSERT/
--     UPDATE/DELETE só pelas funções abaixo (e service_role).
--   Pergunta 2 (função):
--     • asaas_conta_salvar — SECURITY DEFINER; chamada pela tela; dentro dela
--       exige is_org_manager(dona). REVOKE PUBLIC/anon; GRANT authenticated.
--     • asaas_conta_guardar_chave / asaas_conta_ler_chave — SECURITY DEFINER,
--       Vault; SÓ service_role (a Edge asaas-conta testa a chave na Asaas
--       antes de guardar). REVOKE PUBLIC/anon/authenticated; GRANT service_role;
--       e o corpo recusa quem não é service_role (auth.role()).
--     • fn_conta_asaas_da_org — SECURITY INVOKER (a RLS de payment_accounts
--       recorta o que o chamador vê); REVOKE PUBLIC/anon; GRANT authenticated,
--       service_role.

BEGIN;

-- ─── 1. Tipo da conta ──────────────────────────────────────────────────────
ALTER TABLE public.payment_accounts
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'banco';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_accounts_kind_check') THEN
        ALTER TABLE public.payment_accounts
            ADD CONSTRAINT payment_accounts_kind_check CHECK (kind IN ('banco', 'caixa', 'gateway'));
    END IF;
END $$;
COMMENT ON COLUMN public.payment_accounts.kind IS
    'banco | caixa | gateway. gateway = conta numa intermediadora (Asaas) — config em payment_account_gateway.';

-- ─── 2. Configuração da conta Asaas ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_account_gateway (
    payment_account_id       uuid PRIMARY KEY REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
    provider                 text NOT NULL DEFAULT 'asaas' CHECK (provider IN ('asaas')),
    env                      text NOT NULL DEFAULT 'sandbox' CHECK (env IN ('sandbox', 'production')),
    ativo                    boolean NOT NULL DEFAULT true,
    vault_secret_id          uuid,
    chave_atualizada_em      timestamptz,
    piloto                   boolean NOT NULL DEFAULT true,
    teto_por_pagamento       numeric(15,2) NOT NULL DEFAULT 500  CHECK (teto_por_pagamento >= 0),
    teto_por_dia             numeric(15,2) NOT NULL DEFAULT 2000 CHECK (teto_por_dia >= 0),
    teto_avulso              numeric(15,2) NOT NULL DEFAULT 200  CHECK (teto_avulso >= 0),
    extrato_desde            date NOT NULL DEFAULT current_date,
    extrato_sincronizado_ate date,
    saldo                    numeric(15,2),
    saldo_em                 timestamptz,
    ultimo_erro              text,
    ultimo_erro_em           timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.payment_account_gateway IS
    'Conta Asaas (1:1 com payment_accounts kind=gateway). Escrita só por asaas_conta_salvar (tela) e pela Edge asaas-conta (chave, saldo, extrato).';
COMMENT ON COLUMN public.payment_account_gateway.piloto IS
    'Piloto: só a org DONA da conta paga por ela (Fase 4). Hipótese editável.';
COMMENT ON COLUMN public.payment_account_gateway.extrato_desde IS
    'Primeiro dia importado do extrato da Asaas. Antes disso o caixa já está conciliado pelo banco — não reimportar.';

ALTER TABLE public.payment_account_gateway ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pag_select ON public.payment_account_gateway;
CREATE POLICY pag_select ON public.payment_account_gateway
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.payment_accounts pa
         WHERE pa.id = payment_account_gateway.payment_account_id
           AND public.is_org_member(pa.organization_id)
    ));
-- TRUNCATE/REFERENCES/TRIGGER vêm dos grants padrão do Supabase; TRUNCATE
-- passa por cima da RLS. Aqui só leitura (achado na prova pós-aplicação).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.payment_account_gateway FROM anon, authenticated;
REVOKE ALL ON public.payment_account_gateway FROM anon;
GRANT SELECT ON public.payment_account_gateway TO authenticated;

-- ─── 3. Por qual conta Asaas o dinheiro passou ─────────────────────────────
ALTER TABLE public.client_charges
    ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_payments
    ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.client_charges.payment_account_id IS
    'Conta Asaas (payment_accounts kind=gateway) que emitiu a cobrança. NULL = emitida pela chave global antiga.';
COMMENT ON COLUMN public.supplier_payments.payment_account_id IS
    'Conta Asaas (payment_accounts kind=gateway) de onde o pagamento saiu. NULL = chave global antiga.';

-- O id do cliente na Asaas é POR CONTA Asaas: o `asaas_customer_id` cacheado
-- pela chave global (sandbox, 06/2026) não existe numa conta nova, e emitir
-- com ele falharia ("customer inválido"). Cache por conta; chave = id da
-- conta de pagamento, ou 'global:<env>' para a chave de reserva. A coluna
-- antiga segue lida só como reserva da chave global.
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS asaas_customer_ids jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.clients.asaas_customer_ids IS
    'Id do cliente em cada conta Asaas: { "<payment_account_id>" | "global:<env>": "cus_…" }. Gravado pela asaas-charge.';

-- ─── 4. Qual é a conta Asaas desta organização ─────────────────────────────
-- Dona primeiro; depois uma que a ATENDE ("Atende também"). Duas candidatas
-- no mesmo nível = erro explícito: escolher uma em silêncio mandaria dinheiro
-- pela conta errada.
CREATE OR REPLACE FUNCTION public.fn_conta_asaas_da_org(p_org uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_ids uuid[];
BEGIN
    IF p_org IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT array_agg(g.payment_account_id) INTO v_ids
      FROM public.payment_account_gateway g
      JOIN public.payment_accounts pa ON pa.id = g.payment_account_id
     WHERE g.ativo AND g.provider = 'asaas' AND pa.organization_id = p_org;
    IF array_length(v_ids, 1) = 1 THEN RETURN v_ids[1]; END IF;
    IF array_length(v_ids, 1) > 1 THEN
        RAISE EXCEPTION 'A organização tem % contas Asaas ativas — desative as que não usa em Minha Organização › Contas.', array_length(v_ids, 1)
            USING ERRCODE = 'P0001';
    END IF;

    SELECT array_agg(g.payment_account_id) INTO v_ids
      FROM public.payment_account_gateway g
     WHERE g.ativo AND g.provider = 'asaas'
       AND public.fn_conta_atende_org(g.payment_account_id, p_org);
    IF array_length(v_ids, 1) = 1 THEN RETURN v_ids[1]; END IF;
    IF array_length(v_ids, 1) > 1 THEN
        RAISE EXCEPTION 'Mais de uma conta Asaas atende esta organização — deixe só uma com "Atende também".'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_conta_asaas_da_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conta_asaas_da_org(uuid) TO authenticated, service_role;

-- ─── 5. Configuração pela tela (gestor da dona) ────────────────────────────
CREATE OR REPLACE FUNCTION public.asaas_conta_salvar(
    p_payment_account_id uuid,
    p_ativo              boolean,
    p_piloto             boolean,
    p_teto_por_pagamento numeric,
    p_teto_por_dia       numeric,
    p_teto_avulso        numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_dona uuid;
BEGIN
    SELECT organization_id INTO v_dona FROM public.payment_accounts WHERE id = p_payment_account_id;
    IF v_dona IS NULL THEN
        RAISE EXCEPTION 'Conta de pagamento não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.is_org_manager(v_dona) THEN
        RAISE EXCEPTION 'Só proprietário ou administrador da organização configura a conta Asaas.' USING ERRCODE = '42501';
    END IF;
    IF p_teto_por_pagamento < 0 OR p_teto_por_dia < 0 OR p_teto_avulso < 0 THEN
        RAISE EXCEPTION 'Tetos não podem ser negativos.' USING ERRCODE = '22023';
    END IF;
    IF p_ativo AND EXISTS (
        SELECT 1 FROM public.payment_account_gateway g
          JOIN public.payment_accounts pa ON pa.id = g.payment_account_id
         WHERE pa.organization_id = v_dona AND g.ativo AND g.provider = 'asaas'
           AND g.payment_account_id <> p_payment_account_id
    ) THEN
        RAISE EXCEPTION 'Esta organização já tem outra conta Asaas ativa. Desative-a antes.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.payment_account_gateway AS g
        (payment_account_id, ativo, piloto, teto_por_pagamento, teto_por_dia, teto_avulso)
    VALUES
        (p_payment_account_id, p_ativo, p_piloto, p_teto_por_pagamento, p_teto_por_dia, p_teto_avulso)
    ON CONFLICT (payment_account_id) DO UPDATE SET
        ativo = EXCLUDED.ativo,
        piloto = EXCLUDED.piloto,
        teto_por_pagamento = EXCLUDED.teto_por_pagamento,
        teto_por_dia = EXCLUDED.teto_por_dia,
        teto_avulso = EXCLUDED.teto_avulso,
        updated_at = now();

    UPDATE public.payment_accounts SET kind = 'gateway' WHERE id = p_payment_account_id AND kind <> 'gateway';

    -- Com conta Asaas própria, o repasse Asaas → banco é TRANSFERÊNCIA entre
    -- contas da organização (débito no extrato Asaas + crédito no banco), e o
    -- pareamento do motor só enxerga linhas não confirmadas. A regra semeada
    -- em 20261119000004 confirmava o crédito sozinho e deixava o débito da
    -- Asaas solto para sempre. Desliga (não apaga) só na org dona.
    IF p_ativo THEN
        UPDATE public.reconciliation_rules
           SET is_active = false
         WHERE organization_id = v_dona
           AND name = 'Repasse Gateway (Asaas)'
           AND is_active;
    END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.asaas_conta_salvar(uuid, boolean, boolean, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asaas_conta_salvar(uuid, boolean, boolean, numeric, numeric, numeric) TO authenticated;

-- ─── 6. Chave de API no Vault (só a Edge asaas-conta) ──────────────────────
CREATE OR REPLACE FUNCTION public.asaas_conta_guardar_chave(p_payment_account_id uuid, p_env text, p_chave text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $fn$
DECLARE
    v_id   uuid;
    v_nome text := 'asaas_api_key:' || p_payment_account_id::text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'asaas_conta_guardar_chave: só a Edge Function grava a chave (depois de testá-la na Asaas)'
            USING ERRCODE = '42501';
    END IF;
    IF p_chave IS NULL OR length(btrim(p_chave)) = 0 THEN
        RAISE EXCEPTION 'chave vazia' USING ERRCODE = '22023';
    END IF;
    IF p_env NOT IN ('sandbox', 'production') THEN
        RAISE EXCEPTION 'ambiente inválido: %', p_env USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.payment_account_gateway WHERE payment_account_id = p_payment_account_id) THEN
        RAISE EXCEPTION 'conta Asaas % não configurada — salve a configuração antes da chave', p_payment_account_id USING ERRCODE = '23503';
    END IF;

    SELECT id INTO v_id FROM vault.secrets WHERE name = v_nome;
    IF v_id IS NULL THEN
        v_id := vault.create_secret(btrim(p_chave), v_nome, 'Chave de API da conta Asaas');
    ELSE
        PERFORM vault.update_secret(v_id, btrim(p_chave), v_nome, 'Chave de API da conta Asaas');
    END IF;

    UPDATE public.payment_account_gateway
       SET vault_secret_id = v_id,
           env = p_env,
           chave_atualizada_em = now(),
           ultimo_erro = NULL,
           ultimo_erro_em = NULL,
           updated_at = now()
     WHERE payment_account_id = p_payment_account_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.asaas_conta_guardar_chave(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_conta_guardar_chave(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.asaas_conta_ler_chave(p_payment_account_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $fn$
DECLARE
    v_chave text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'asaas_conta_ler_chave: só as Edge Functions leem a chave' USING ERRCODE = '42501';
    END IF;
    SELECT ds.decrypted_secret INTO v_chave
      FROM public.payment_account_gateway g
      JOIN vault.decrypted_secrets ds ON ds.id = g.vault_secret_id
     WHERE g.payment_account_id = p_payment_account_id;
    -- Falta = exceção, nunca NULL: NULL viraria chamada sem chave e um 401 da
    -- Asaas sem pista de que o problema é o cadastro.
    IF v_chave IS NULL THEN
        RAISE EXCEPTION 'conta Asaas % sem chave de API guardada — cadastre em Minha Organização › Contas', p_payment_account_id
            USING ERRCODE = 'P0002';
    END IF;
    RETURN v_chave;
END;
$fn$;
REVOKE ALL ON FUNCTION public.asaas_conta_ler_chave(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_conta_ler_chave(uuid) TO service_role;

-- ─── Provas ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_acl text;
BEGIN
    SELECT proacl::text INTO v_acl FROM pg_proc WHERE proname = 'asaas_conta_ler_chave';
    IF v_acl LIKE '%authenticated=%' OR v_acl LIKE '%anon=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
        RAISE EXCEPTION 'asaas_conta_ler_chave executável por quem não é service_role: %', v_acl;
    END IF;
    SELECT proacl::text INTO v_acl FROM pg_proc WHERE proname = 'asaas_conta_salvar';
    IF v_acl LIKE '%anon=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
        RAISE EXCEPTION 'asaas_conta_salvar executável por anon/PUBLIC: %', v_acl;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_account_gateway' AND cmd <> 'SELECT') THEN
        RAISE EXCEPTION 'payment_account_gateway tem policy de escrita';
    END IF;
    RAISE NOTICE 'OK: Asaas Fase 2 — conta gateway, Vault e funções aplicados.';
END $$;

COMMIT;
