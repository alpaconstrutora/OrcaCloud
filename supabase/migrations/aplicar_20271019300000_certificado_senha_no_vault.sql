-- ============================================================================
-- Senha do certificado digital A1 no Vault
-- Plano: docs/planos/2026-10-18-nfe-captura-automatica-sefaz.md, item 1.2
-- ============================================================================
--
-- A senha do .pfx abre a chave privada da empresa. Ela trafega uma vez, do
-- formulário para a Edge Function `fiscal-certificado`, que confere a senha
-- abrindo o arquivo e só então a guarda aqui. Nunca volta ao navegador e não
-- fica em coluna nenhuma: `companies` guarda só o id do segredo.
--
-- Molde: email_capture_guardar_segredo / _ler_ / _apagar_
-- (aplicar_20271015110100_email_capture_rpcs.sql).
--
-- REGRA #7, pergunta 2: as três funções são SECURITY DEFINER e executáveis só
-- por service_role. O REVOKE vai junto, e cada função ainda confere
-- auth.role() por dentro, porque GRANT é privilégio de chamada, não regra.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS certificado_vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS certificado_cnpj            text;

COMMENT ON COLUMN public.companies.certificado_vault_secret_id IS
  'Id do segredo no Vault com a senha do .pfx. Gravado só por fiscal_cert_guardar_senha.';
COMMENT ON COLUMN public.companies.certificado_cnpj IS
  'CNPJ lido de dentro do certificado (só dígitos) pela Edge Function fiscal-certificado.';

-- ─── guardar ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fiscal_cert_guardar_senha(p_company uuid, p_senha text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_id   uuid;
    v_nome text := 'fiscal_cert:' || p_company::text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'fiscal_cert_guardar_senha: só a Edge Function grava a senha'
            USING ERRCODE = '42501';
    END IF;
    IF p_senha IS NULL OR length(p_senha) = 0 THEN
        RAISE EXCEPTION 'senha vazia' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company) THEN
        RAISE EXCEPTION 'empresa % não existe', p_company USING ERRCODE = '23503';
    END IF;

    SELECT id INTO v_id FROM vault.secrets WHERE name = v_nome;
    IF v_id IS NULL THEN
        v_id := vault.create_secret(p_senha, v_nome, 'Senha do certificado digital A1 da empresa');
    ELSE
        PERFORM vault.update_secret(v_id, p_senha, v_nome, 'Senha do certificado digital A1 da empresa');
    END IF;

    UPDATE public.companies SET certificado_vault_secret_id = v_id WHERE id = p_company;
    RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fiscal_cert_guardar_senha(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fiscal_cert_guardar_senha(uuid, text) TO service_role;

-- ─── ler ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fiscal_cert_ler_senha(p_company uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_senha text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'fiscal_cert_ler_senha: só o serviço lê a senha'
            USING ERRCODE = '42501';
    END IF;

    SELECT ds.decrypted_secret INTO v_senha
      FROM public.companies c
      JOIN vault.decrypted_secrets ds ON ds.id = c.certificado_vault_secret_id
     WHERE c.id = p_company;

    -- Falta = exceção, nunca NULL: NULL viraria tentativa de abrir o .pfx com
    -- senha vazia e um "senha errada" sem pista de que o problema é o Vault.
    IF v_senha IS NULL THEN
        RAISE EXCEPTION 'vault: empresa % sem senha de certificado — envie o certificado de novo', p_company
            USING ERRCODE = 'P0002';
    END IF;
    RETURN v_senha;
END $$;

REVOKE EXECUTE ON FUNCTION public.fiscal_cert_ler_senha(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fiscal_cert_ler_senha(uuid) TO service_role;

-- ─── apagar ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fiscal_cert_apagar_senha(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'fiscal_cert_apagar_senha: só o serviço apaga a senha'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM vault.secrets WHERE name = 'fiscal_cert:' || p_company::text;
    UPDATE public.companies SET certificado_vault_secret_id = NULL WHERE id = p_company;
END $$;

REVOKE EXECUTE ON FUNCTION public.fiscal_cert_apagar_senha(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fiscal_cert_apagar_senha(uuid) TO service_role;

-- ─── trava: só o serviço muda o vínculo com o cofre e o CNPJ lido ───────────
-- `companies` é editável pelo formulário da empresa. Sem esta trava, quem pode
-- editar a empresa poderia apontar certificado_vault_secret_id para o segredo
-- de OUTRA empresa, ou declarar um certificado_cnpj que o arquivo não tem.
-- Erro explícito, não desfazer em silêncio: o formulário não envia estas
-- colunas, então só uma escrita indevida bate aqui.
CREATE OR REPLACE FUNCTION public.trg_companies_certificado_so_servico()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF coalesce(auth.role(), 'service_role') = 'service_role' THEN
        RETURN NEW;
    END IF;
    IF NEW.certificado_vault_secret_id IS DISTINCT FROM OLD.certificado_vault_secret_id
       OR NEW.certificado_cnpj IS DISTINCT FROM OLD.certificado_cnpj THEN
        RAISE EXCEPTION 'O certificado digital só é gravado pelo envio do certificado (fiscal-certificado).'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_companies_certificado_so_servico ON public.companies;
CREATE TRIGGER trg_companies_certificado_so_servico
    BEFORE UPDATE OF certificado_vault_secret_id, certificado_cnpj ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.trg_companies_certificado_so_servico();

REVOKE EXECUTE ON FUNCTION public.trg_companies_certificado_so_servico() FROM PUBLIC, anon, authenticated;
