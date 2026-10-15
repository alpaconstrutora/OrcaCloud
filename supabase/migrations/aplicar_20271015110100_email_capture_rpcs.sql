-- Captura automática de boletos por e-mail — funções
--
-- Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 2.2).
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Depende de: aplicar_20271015110000_email_capture_tabelas.sql
--
-- 1. Senha de app da caixa monitorada, no Vault (uma por conta).
--    guardar / ler / apagar — SECURITY DEFINER (precisam do schema vault), e
--    por isso só service_role executa (as Edge Functions). Ninguém do front lê
--    a senha de volta: nem `authenticated`, nem o gestor.
--
-- 2. find_supplier_in_org_by_document — fornecedor pelo CPF/CNPJ só DENTRO de
--    uma organização, comparando só dígitos. Substitui o
--    `suppliers.document ILIKE '%dígitos%'` do boletoService, que não casava
--    documento mascarado e não filtrava organização.
--    ⚠️ Não é a `find_supplier_by_document` (20270716000002): aquela atravessa
--    organizações DE PROPÓSITO (bloqueio de CNPJ duplicado no cadastro).
--
-- REGRA #7
--   Pergunta 2: as três de Vault levam REVOKE de PUBLIC, anon E authenticated
--   (devolvem credencial — mesmo critério de fn_cron_secret) e conferem o papel
--   DENTRO delas. A de fornecedor é SECURITY INVOKER: roda sob a RLS de
--   suppliers e ainda recorta pela organização pedida.

SET lock_timeout = '3s';

-- Nas três funções de Vault, `coalesce(auth.role(), 'service_role')`: NULL é
-- sessão direta no banco (postgres, pg_cron) — nunca acontece via PostgREST,
-- onde todo JWT traz `role`. Qualquer papel que não seja service_role → 42501.

-- ─── 1a. guardar ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_capture_guardar_segredo(p_account uuid, p_senha text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_id   uuid;
    v_nome text := 'email_capture:' || p_account::text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'email_capture_guardar_segredo: só a Edge Function grava a senha'
            USING ERRCODE = '42501';
    END IF;
    IF p_senha IS NULL OR length(p_senha) = 0 THEN
        RAISE EXCEPTION 'senha vazia' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.email_capture_accounts WHERE id = p_account) THEN
        RAISE EXCEPTION 'conta % não existe', p_account USING ERRCODE = '23503';
    END IF;

    SELECT id INTO v_id FROM vault.secrets WHERE name = v_nome;
    IF v_id IS NULL THEN
        v_id := vault.create_secret(p_senha, v_nome, 'Senha de app IMAP da captura de boletos');
    ELSE
        PERFORM vault.update_secret(v_id, p_senha, v_nome, 'Senha de app IMAP da captura de boletos');
    END IF;

    UPDATE public.email_capture_accounts
       SET vault_secret_id = v_id, updated_at = NOW()
     WHERE id = p_account;
    RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.email_capture_guardar_segredo(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_capture_guardar_segredo(uuid, text) TO service_role;

-- ─── 1b. ler ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_capture_ler_segredo(p_account uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_senha text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'email_capture_ler_segredo: só a Edge Function lê a senha'
            USING ERRCODE = '42501';
    END IF;

    SELECT ds.decrypted_secret INTO v_senha
      FROM public.email_capture_accounts a
      JOIN vault.decrypted_secrets ds ON ds.id = a.vault_secret_id
     WHERE a.id = p_account;

    -- Falta = exceção, nunca NULL: NULL viraria LOGIN com senha vazia e um
    -- "senha errada" sem pista de que o problema é o Vault.
    IF v_senha IS NULL THEN
        RAISE EXCEPTION 'vault: conta % sem senha guardada — reconecte a caixa', p_account
            USING ERRCODE = 'P0002';
    END IF;
    RETURN v_senha;
END $$;

REVOKE EXECUTE ON FUNCTION public.email_capture_ler_segredo(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_capture_ler_segredo(uuid) TO service_role;

-- ─── 1c. apagar ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_capture_apagar_segredo(p_account uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'email_capture_apagar_segredo: só a Edge Function apaga a senha'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM vault.secrets WHERE name = 'email_capture:' || p_account::text;
    UPDATE public.email_capture_accounts
       SET vault_secret_id = NULL, updated_at = NOW()
     WHERE id = p_account;
END $$;

REVOKE EXECUTE ON FUNCTION public.email_capture_apagar_segredo(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_capture_apagar_segredo(uuid) TO service_role;

-- ─── 2. Fornecedor por documento, dentro da organização ──────────────────────
CREATE OR REPLACE FUNCTION public.find_supplier_in_org_by_document(p_organization_id uuid, p_document text)
RETURNS TABLE (id uuid, name text, document text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT s.id, s.name, s.document
      FROM public.suppliers s
     WHERE s.organization_id = p_organization_id
       AND length(regexp_replace(coalesce(p_document, ''), '\D', '', 'g')) IN (11, 14)
       AND regexp_replace(coalesce(s.document, ''), '\D', '', 'g')
         = regexp_replace(p_document, '\D', '', 'g')
     ORDER BY s.created_at, s.id;
$$;

REVOKE EXECUTE ON FUNCTION public.find_supplier_in_org_by_document(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.find_supplier_in_org_by_document(uuid, text) TO authenticated, service_role;

-- ─── 3. Verificação ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_pode bool;
BEGIN
    SELECT bool_or(has_function_privilege(r, f, 'EXECUTE'))
      INTO v_pode
      FROM unnest(ARRAY['anon', 'authenticated']) r,
           unnest(ARRAY['public.email_capture_guardar_segredo(uuid, text)',
                        'public.email_capture_ler_segredo(uuid)',
                        'public.email_capture_apagar_segredo(uuid)']) f;
    IF v_pode THEN
        RAISE EXCEPTION 'função de senha da captura executável por anon/authenticated';
    END IF;

    IF has_function_privilege('anon', 'public.find_supplier_in_org_by_document(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'find_supplier_in_org_by_document executável por anon';
    END IF;

    RAISE NOTICE 'OK: 3 funções de Vault só para service_role; busca de fornecedor por org para authenticated.';
END $$;
