-- WhatsApp Cloud API: o token sai do navegador e vai para o servidor, POR ORGANIZAÇÃO
--
-- Achado F75 da varredura Claude Security de 15/11/2026
-- (plano: docs/planos/2026-11-18-seguranca-fase2-achados-restantes.md, PR I).
-- Decisão do usuário (18/11/2026): um token POR ORGANIZAÇÃO, no servidor.
--
-- ── O que fecha ─────────────────────────────────────────────────────────────
--
-- O token permanente de System User da Meta ficava em texto puro no
-- localStorage (`whatsapp_config`): sobrevivia ao "Sair", voltava preenchido no
-- formulário de Configurações (com botão de revelar) para o PRÓXIMO usuário do
-- navegador, valia para todas as organizações daquele navegador e podia vir
-- embutido no bundle público pelo fallback `VITE_WA_ACCESS_TOKEN`. Com ele,
-- qualquer um manda mensagem pelo número da empresa direto na Graph API.
--
-- Agora:
--   • whatsapp_cloud_config (1 linha por organização): phone_number_id, número
--     exibido, nome verificado e template — nada secreto. O token fica no Vault
--     (`whatsapp_cloud_token:<org>`); a tabela guarda só o id do segredo.
--   • Leitura: membro da organização (o cliente só precisa saber "configurado:
--     sim/não" + os campos acima). NENHUMA policy de escrita: grava só a Edge
--     Function `whatsapp-cloud` (service_role), depois de exigir gestor e de
--     TESTAR o token na Meta.
--   • Envio: a mesma Edge Function lê o token com service_role e exige que o
--     chamador seja membro da organização DO PEDIDO.
--   • public.whatsapp_config (provedor Evolution/Twilio da Comunicação do RH)
--     reavaliada: não é cofre (guarda só o NOME de um segredo em api_key_ref;
--     0 linhas em produção em 18/11/2026). Continua legível por membro, mas a
--     escrita passa a ser só de gestor — antes qualquer membro trocava a URL da
--     API e o webhook da integração da organização.
--
-- ── REGRA #7 ───────────────────────────────────────────────────────────────
--   Pergunta 1 (policy):
--     • whatsapp_cloud_config: UMA policy, de SELECT, por conjunto:
--       organization_id IN (SELECT minhas_orgs_membro()) — sem OR.
--     • whatsapp_config: SELECT por membro; INSERT/UPDATE/DELETE por gestor
--       (minhas_orgs_gestor()). Sem OR.
--   Pergunta 2 (função):
--     • whatsapp_cloud_guardar / whatsapp_cloud_ler_token / whatsapp_cloud_remover
--       — SECURITY DEFINER, Vault; SÓ service_role. REVOKE PUBLIC/anon/
--       authenticated; GRANT service_role; e o corpo recusa quem não é
--       service_role (auth.role()).
--     • fn_whatsapp_cloud_apaga_segredo — gatilho (apaga o segredo junto com a
--       linha, inclusive na cascata de organização excluída). REVOKE de todos.
--     • whatsapp_cloud_situacao — SECURITY INVOKER (a RLS recorta); REVOKE
--       PUBLIC/anon; GRANT authenticated.
--   Pergunta 3 (Edge Function): `whatsapp-cloud`, verify_jwt = true E gate no
--     código (exigirGestor / exigirMembro). Sem header → 401.
--
-- ── Ordem de publicação ────────────────────────────────────────────────────
--   1. ESTA migration:  npx supabase db query --linked -f <este arquivo>
--      (NUNCA db push). Não muda nada para o usuário: a tabela nasce vazia e o
--      front antigo não a conhece.
--   2. Edge Function:   npx supabase functions deploy whatsapp-cloud
--      (verify_jwt = true, registrado em supabase/config.toml).
--      Prova: curl sem header → 401.
--   3. Front (push em main). Só a partir daqui o token local é apagado no boot,
--      e o gestor de cada organização que usa o envio cadastra o token UMA vez
--      em Configurações › WhatsApp & Integrações (a tela avisa).
--
-- ── Como conferir depois de aplicar ────────────────────────────────────────
--   O bloco "Provas" no fim aborta a transação se algo não bater. De fora:
--     SELECT policyname, cmd FROM pg_policies
--      WHERE tablename IN ('whatsapp_cloud_config','whatsapp_config');
--     SELECT proname, proacl FROM pg_proc WHERE proname LIKE 'whatsapp_cloud%';
--   Esperado: whatsapp_cloud_config só com SELECT; as funções do Vault só com
--   service_role (e postgres) na ACL.

BEGIN;

-- ─── 1. Configuração por organização (nada secreto aqui) ───────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_cloud_config (
    organization_id      uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone_number_id      text NOT NULL CHECK (phone_number_id ~ '^[0-9]{5,30}$'),
    numero_exibicao      text,
    nome_verificado      text,
    template_pedido      text NOT NULL DEFAULT 'opura_pedido_enviado'
                              -- {1,512} não serve: o regex do Postgres limita repetição a 255.
                              CHECK (template_pedido ~ '^[a-z0-9_]+$' AND length(template_pedido) <= 512),
    vault_secret_id      uuid,
    token_atualizado_em  timestamptz,
    token_atualizado_por text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.whatsapp_cloud_config IS
    'WhatsApp Cloud API (Meta) por organização. O TOKEN fica no Vault (whatsapp_cloud_token:<org>), nunca aqui. '
    'Escrita só pela Edge Function whatsapp-cloud (service_role), depois de exigir gestor e testar o token na Meta.';
COMMENT ON COLUMN public.whatsapp_cloud_config.phone_number_id IS
    'Phone Number ID da Meta (identificador do número; não é segredo — sem o token não abre nada).';
COMMENT ON COLUMN public.whatsapp_cloud_config.template_pedido IS
    'Nome do template aprovado na conta WhatsApp Business DESTA organização para "pedido enviado".';
COMMENT ON COLUMN public.whatsapp_cloud_config.vault_secret_id IS
    'Id do segredo no Vault. Só service_role lê o valor (whatsapp_cloud_ler_token).';

ALTER TABLE public.whatsapp_cloud_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_cloud_config_select ON public.whatsapp_cloud_config;
CREATE POLICY whatsapp_cloud_config_select ON public.whatsapp_cloud_config
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));
-- TRUNCATE/REFERENCES/TRIGGER vêm dos grants padrão do Supabase e TRUNCATE passa
-- por cima da RLS: aqui o cliente só lê.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.whatsapp_cloud_config FROM anon, authenticated;
REVOKE ALL ON public.whatsapp_cloud_config FROM anon;
GRANT SELECT ON public.whatsapp_cloud_config TO authenticated;

-- ─── 2. Linha apagada → segredo apagado (inclusive na cascata da organização) ──
CREATE OR REPLACE FUNCTION public.fn_whatsapp_cloud_apaga_segredo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $fn$
BEGIN
    IF OLD.vault_secret_id IS NOT NULL THEN
        DELETE FROM vault.secrets WHERE id = OLD.vault_secret_id;
    END IF;
    RETURN OLD;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_whatsapp_cloud_apaga_segredo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_whatsapp_cloud_config_apaga_segredo ON public.whatsapp_cloud_config;
CREATE TRIGGER trg_whatsapp_cloud_config_apaga_segredo
    AFTER DELETE ON public.whatsapp_cloud_config
    FOR EACH ROW EXECUTE FUNCTION public.fn_whatsapp_cloud_apaga_segredo();

-- ─── 3. Guardar (só a Edge Function, depois de testar o token na Meta) ──────
-- p_token NULL/vazio = mantém o token já guardado (troca só número/template).
CREATE OR REPLACE FUNCTION public.whatsapp_cloud_guardar(
    p_org              uuid,
    p_phone_number_id  text,
    p_token            text,
    p_template         text,
    p_numero_exibicao  text,
    p_nome_verificado  text,
    p_por              text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $fn$
DECLARE
    v_id    uuid;
    v_nome  text := 'whatsapp_cloud_token:' || p_org::text;
    v_token text := nullif(btrim(coalesce(p_token, '')), '');
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_cloud_guardar: só a Edge Function grava o token (depois de testá-lo na Meta)'
            USING ERRCODE = '42501';
    END IF;
    IF p_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org) THEN
        RAISE EXCEPTION 'organização inexistente' USING ERRCODE = '23503';
    END IF;
    IF coalesce(p_phone_number_id, '') !~ '^[0-9]{5,30}$' THEN
        RAISE EXCEPTION 'Phone Number ID inválido (só dígitos)' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p_template, '') !~ '^[a-z0-9_]+$' OR length(p_template) > 512 THEN
        RAISE EXCEPTION 'nome de template inválido (minúsculas, dígitos e _)' USING ERRCODE = '22023';
    END IF;

    SELECT vault_secret_id INTO v_id FROM public.whatsapp_cloud_config WHERE organization_id = p_org;

    IF v_token IS NULL THEN
        IF v_id IS NULL THEN
            RAISE EXCEPTION 'informe o token: esta organização ainda não tem token guardado' USING ERRCODE = '22023';
        END IF;
    ELSE
        IF v_id IS NULL THEN
            SELECT id INTO v_id FROM vault.secrets WHERE name = v_nome;
        END IF;
        IF v_id IS NULL THEN
            v_id := vault.create_secret(v_token, v_nome, 'Token do WhatsApp Cloud API da organização');
        ELSE
            PERFORM vault.update_secret(v_id, v_token, v_nome, 'Token do WhatsApp Cloud API da organização');
        END IF;
    END IF;

    INSERT INTO public.whatsapp_cloud_config AS c
        (organization_id, phone_number_id, numero_exibicao, nome_verificado, template_pedido,
         vault_secret_id, token_atualizado_em, token_atualizado_por)
    VALUES
        (p_org, p_phone_number_id, p_numero_exibicao, p_nome_verificado, p_template,
         v_id, now(), p_por)
    ON CONFLICT (organization_id) DO UPDATE SET
        phone_number_id      = EXCLUDED.phone_number_id,
        numero_exibicao      = EXCLUDED.numero_exibicao,
        nome_verificado      = EXCLUDED.nome_verificado,
        template_pedido      = EXCLUDED.template_pedido,
        vault_secret_id      = EXCLUDED.vault_secret_id,
        token_atualizado_em  = CASE WHEN v_token IS NULL THEN c.token_atualizado_em ELSE now() END,
        token_atualizado_por = CASE WHEN v_token IS NULL THEN c.token_atualizado_por ELSE p_por END,
        updated_at           = now();
END;
$fn$;
REVOKE ALL ON FUNCTION public.whatsapp_cloud_guardar(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_cloud_guardar(uuid, text, text, text, text, text, text) TO service_role;

-- ─── 4. Ler o token (só as Edge Functions) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.whatsapp_cloud_ler_token(p_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $fn$
DECLARE
    v_token text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_cloud_ler_token: só as Edge Functions leem o token' USING ERRCODE = '42501';
    END IF;
    SELECT ds.decrypted_secret INTO v_token
      FROM public.whatsapp_cloud_config c
      JOIN vault.decrypted_secrets ds ON ds.id = c.vault_secret_id
     WHERE c.organization_id = p_org;
    -- Falta = exceção, nunca NULL: NULL viraria chamada sem token e um 401 da
    -- Meta sem pista de que o problema é o cadastro.
    IF v_token IS NULL THEN
        RAISE EXCEPTION 'organização % sem token do WhatsApp guardado — cadastre em Configurações › WhatsApp & Integrações', p_org
            USING ERRCODE = 'P0002';
    END IF;
    RETURN v_token;
END;
$fn$;
REVOKE ALL ON FUNCTION public.whatsapp_cloud_ler_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_cloud_ler_token(uuid) TO service_role;

-- ─── 5. Remover (só a Edge Function, depois de exigir gestor) ───────────────
CREATE OR REPLACE FUNCTION public.whatsapp_cloud_remover(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $fn$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_cloud_remover: só a Edge Function remove o token' USING ERRCODE = '42501';
    END IF;
    -- O gatilho apaga o segredo apontado pela linha; o DELETE por nome cobre um
    -- segredo órfão de uma tentativa interrompida.
    DELETE FROM public.whatsapp_cloud_config WHERE organization_id = p_org;
    DELETE FROM vault.secrets WHERE name = 'whatsapp_cloud_token:' || p_org::text;
END;
$fn$;
REVOKE ALL ON FUNCTION public.whatsapp_cloud_remover(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_cloud_remover(uuid) TO service_role;

-- ─── 6. O que a tela precisa saber — sem o token ───────────────────────────
-- Uma linha por organização de que o chamador é membro. `pode_configurar` é a
-- mesma regra que a Edge Function aplica (proprietário/administrador).
CREATE OR REPLACE FUNCTION public.whatsapp_cloud_situacao()
RETURNS TABLE (
    organization_id      uuid,
    configurado          boolean,
    phone_number_id      text,
    numero_exibicao      text,
    nome_verificado      text,
    template_pedido      text,
    token_atualizado_em  timestamptz,
    token_atualizado_por text,
    pode_configurar      boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
    SELECT m.org,
           (c.vault_secret_id IS NOT NULL),
           c.phone_number_id,
           c.numero_exibicao,
           c.nome_verificado,
           c.template_pedido,
           c.token_atualizado_em,
           c.token_atualizado_por,
           (m.org IN (SELECT public.minhas_orgs_gestor()))
      FROM (SELECT DISTINCT o AS org FROM public.minhas_orgs_membro() AS o) m
      LEFT JOIN public.whatsapp_cloud_config c ON c.organization_id = m.org;
$fn$;
REVOKE ALL ON FUNCTION public.whatsapp_cloud_situacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_cloud_situacao() TO authenticated;

-- ─── 7. whatsapp_config (Comunicação do RH): leitura de membro, escrita de gestor ──
-- Não é cofre e não vira cofre: api_key_ref é o NOME de um segredo. O que muda
-- é quem grava — a URL da API e o webhook decidem para onde as mensagens da
-- organização vão, e isso é decisão de proprietário/administrador.
DROP POLICY IF EXISTS "wpp_config_org" ON public.whatsapp_config;
DROP POLICY IF EXISTS wpp_config_select ON public.whatsapp_config;
DROP POLICY IF EXISTS wpp_config_insert_gestor ON public.whatsapp_config;
DROP POLICY IF EXISTS wpp_config_update_gestor ON public.whatsapp_config;
DROP POLICY IF EXISTS wpp_config_delete_gestor ON public.whatsapp_config;

CREATE POLICY wpp_config_select ON public.whatsapp_config
    FOR SELECT TO authenticated
    USING (org_id IN (SELECT public.minhas_orgs_membro()));
CREATE POLICY wpp_config_insert_gestor ON public.whatsapp_config
    FOR INSERT TO authenticated
    WITH CHECK (org_id IN (SELECT public.minhas_orgs_gestor()));
CREATE POLICY wpp_config_update_gestor ON public.whatsapp_config
    FOR UPDATE TO authenticated
    USING (org_id IN (SELECT public.minhas_orgs_gestor()))
    WITH CHECK (org_id IN (SELECT public.minhas_orgs_gestor()));
CREATE POLICY wpp_config_delete_gestor ON public.whatsapp_config
    FOR DELETE TO authenticated
    USING (org_id IN (SELECT public.minhas_orgs_gestor()));

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.whatsapp_config FROM anon, authenticated;
REVOKE ALL ON public.whatsapp_config FROM anon;

COMMENT ON COLUMN public.whatsapp_config.api_key_ref IS
    'Só o NOME/ID de um segredo guardado fora daqui — nunca a chave. Tabela legível por todo membro da organização.';

-- ─── Provas ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_acl text;
    v_fn  text;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY['whatsapp_cloud_guardar', 'whatsapp_cloud_ler_token', 'whatsapp_cloud_remover', 'fn_whatsapp_cloud_apaga_segredo'] LOOP
        SELECT proacl::text INTO v_acl FROM pg_proc WHERE proname = v_fn AND pronamespace = 'public'::regnamespace;
        IF v_acl IS NULL OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%anon=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
            RAISE EXCEPTION '% executável por quem não é service_role: %', v_fn, v_acl;
        END IF;
    END LOOP;

    SELECT proacl::text INTO v_acl FROM pg_proc WHERE proname = 'whatsapp_cloud_situacao' AND pronamespace = 'public'::regnamespace;
    IF v_acl IS NULL OR v_acl LIKE '%anon=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
        RAISE EXCEPTION 'whatsapp_cloud_situacao executável por anon/PUBLIC: %', v_acl;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_cloud_config' AND cmd <> 'SELECT') THEN
        RAISE EXCEPTION 'whatsapp_cloud_config tem policy de escrita';
    END IF;
    IF has_table_privilege('authenticated', 'public.whatsapp_cloud_config', 'INSERT')
       OR has_table_privilege('authenticated', 'public.whatsapp_cloud_config', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.whatsapp_cloud_config', 'DELETE')
       OR has_table_privilege('authenticated', 'public.whatsapp_cloud_config', 'TRUNCATE')
       OR has_table_privilege('anon', 'public.whatsapp_cloud_config', 'SELECT') THEN
        RAISE EXCEPTION 'whatsapp_cloud_config com privilégio de escrita para o cliente (ou leitura para anon)';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_config' AND policyname = 'wpp_config_org') THEN
        RAISE EXCEPTION 'whatsapp_config ainda tem a policy FOR ALL de qualquer membro';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_config' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                 AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%minhas_orgs_gestor%') THEN
        RAISE EXCEPTION 'whatsapp_config tem policy de escrita que não exige gestor';
    END IF;

    RAISE NOTICE 'OK: WhatsApp Cloud API — token por organização no Vault; whatsapp_config com escrita só de gestor.';
END $$;

COMMIT;
