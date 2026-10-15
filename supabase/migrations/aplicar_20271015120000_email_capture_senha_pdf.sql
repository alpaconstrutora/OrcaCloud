-- Captura de boletos por e-mail — senha dos PDFs por remetente monitorado
--
-- Pedido do usuário em 15/10/2026 ("Senha por remetente (maior): criar campo
-- para cadastro de senha"), depois que o 1º boleto lido da caixa real (Energisa,
-- "Reaviso Digital", boleto nº 1423) chegou num PDF criptografado e entrou sem
-- valor nem vencimento. Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (S3).
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Depende de: aplicar_20271015110000 e aplicar_20271015110100
--
-- Desenho
--   A senha mora no Vault, pelo NOME `email_capture_pdf:<id do remetente>` — nunca
--   em coluna, e nunca por um id gravável pelo usuário (se o remetente guardasse o
--   id do segredo, quem edita o remetente poderia apontá-lo para outro segredo do
--   cofre). Na tabela fica só `pdf_senha_atualizada_em` — "tem senha, desde quando":
--   é o que a tela mostra e o que dispara o reprocessamento dos boletos parados.
--
-- REGRA #7
--   Pergunta 1: senders deixa de ter INSERT/UPDATE de tabela inteira para
--   authenticated; volta por COLUNA, sem `pdf_senha_atualizada_em` (só a RPC grava).
--   Pergunta 2: definir — membro da org do remetente (checado DENTRO), REVOKE de
--   PUBLIC/anon; ler — só service_role (REVOKE de authenticated também, devolve
--   credencial); gatilho de exclusão — SECURITY DEFINER com REVOKE de todos.

SET lock_timeout = '3s';

-- ─── 1. Colunas ───────────────────────────────────────────────────────────────
ALTER TABLE public.email_capture_senders
    ADD COLUMN IF NOT EXISTS pdf_senha_atualizada_em TIMESTAMPTZ;

COMMENT ON COLUMN public.email_capture_senders.pdf_senha_atualizada_em IS
    'Quando a senha dos PDFs deste remetente foi gravada (NULL = sem senha). A senha está no Vault como email_capture_pdf:<id>; só a RPC email_capture_definir_senha_pdf grava esta coluna.';

ALTER TABLE public.email_capture_messages
    ADD COLUMN IF NOT EXISTS reprocessado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.email_capture_messages.reprocessado_em IS
    'Última tentativa de reabrir o PDF do boleto desta mensagem com as senhas cadastradas. Só tenta de novo quando uma senha de remetente da caixa muda depois disto.';

-- ─── 2. Grants por coluna em senders ─────────────────────────────────────────
REVOKE INSERT, UPDATE ON TABLE public.email_capture_senders FROM authenticated;
GRANT INSERT (organization_id, account_id, supplier_id, nome, tipo, email, dominio,
              palavras_chave, importacao, exigir_dmarc, ativo, created_by_email)
    ON TABLE public.email_capture_senders TO authenticated;
GRANT UPDATE (organization_id, account_id, supplier_id, nome, tipo, email, dominio,
              palavras_chave, importacao, exigir_dmarc, ativo, updated_at)
    ON TABLE public.email_capture_senders TO authenticated;

-- ─── 3. Definir / apagar a senha (membro da org do remetente) ────────────────
CREATE OR REPLACE FUNCTION public.email_capture_definir_senha_pdf(p_sender uuid, p_senha text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_org  uuid;
    v_id   uuid;
    v_nome text := 'email_capture_pdf:' || p_sender::text;
BEGIN
    SELECT organization_id INTO v_org FROM public.email_capture_senders WHERE id = p_sender;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'remetente % não existe', p_sender USING ERRCODE = '23503';
    END IF;
    IF coalesce(auth.role(), 'service_role') <> 'service_role' AND NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'sem acesso a este remetente' USING ERRCODE = '42501';
    END IF;

    -- Vazio = remover a senha.
    IF p_senha IS NULL OR btrim(p_senha) = '' THEN
        DELETE FROM vault.secrets WHERE name = v_nome;
        UPDATE public.email_capture_senders SET pdf_senha_atualizada_em = NULL WHERE id = p_sender;
        RETURN;
    END IF;

    SELECT id INTO v_id FROM vault.secrets WHERE name = v_nome;
    IF v_id IS NULL THEN
        PERFORM vault.create_secret(btrim(p_senha), v_nome, 'Senha dos PDFs de um remetente da captura de boletos');
    ELSE
        PERFORM vault.update_secret(v_id, btrim(p_senha), v_nome, 'Senha dos PDFs de um remetente da captura de boletos');
    END IF;
    UPDATE public.email_capture_senders SET pdf_senha_atualizada_em = NOW() WHERE id = p_sender;
END $$;

REVOKE EXECUTE ON FUNCTION public.email_capture_definir_senha_pdf(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.email_capture_definir_senha_pdf(uuid, text) TO authenticated, service_role;

-- ─── 4. Ler a senha (só a Edge Function) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_capture_ler_senha_pdf(p_sender uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_senha text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'email_capture_ler_senha_pdf: só a Edge Function lê a senha'
            USING ERRCODE = '42501';
    END IF;
    -- Sem senha é normal (NULL), ao contrário da senha da caixa.
    SELECT decrypted_secret INTO v_senha
      FROM vault.decrypted_secrets WHERE name = 'email_capture_pdf:' || p_sender::text;
    RETURN v_senha;
END $$;

REVOKE EXECUTE ON FUNCTION public.email_capture_ler_senha_pdf(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_capture_ler_senha_pdf(uuid) TO service_role;

-- ─── 5. Excluir o remetente leva a senha junto ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_email_capture_sender_apaga_senha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
BEGIN
    DELETE FROM vault.secrets WHERE name = 'email_capture_pdf:' || OLD.id::text;
    RETURN OLD;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_email_capture_sender_apaga_senha() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_email_capture_sender_apaga_senha ON public.email_capture_senders;
CREATE TRIGGER trg_email_capture_sender_apaga_senha
    AFTER DELETE ON public.email_capture_senders
    FOR EACH ROW EXECUTE FUNCTION public.fn_email_capture_sender_apaga_senha();

-- ─── 6. Verificação ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF has_function_privilege('authenticated', 'public.email_capture_ler_senha_pdf(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.email_capture_ler_senha_pdf(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'senha de PDF legível por anon/authenticated';
    END IF;
    IF has_function_privilege('anon', 'public.email_capture_definir_senha_pdf(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon pode gravar senha de PDF';
    END IF;
    IF has_column_privilege('authenticated', 'public.email_capture_senders', 'pdf_senha_atualizada_em', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.email_capture_senders', 'pdf_senha_atualizada_em', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated grava pdf_senha_atualizada_em direto';
    END IF;
    IF NOT has_column_privilege('authenticated', 'public.email_capture_senders', 'nome', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated perdeu o UPDATE do cadastro do remetente';
    END IF;
    RAISE NOTICE 'OK: senha de PDF por remetente no Vault; leitura só service_role.';
END $$;
