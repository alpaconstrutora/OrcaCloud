-- Captura automática de boletos por e-mail — tabelas
--
-- Pedido do usuário em 15/10/2026: "avalie" o PRD
-- OPURA_PRD_Captura_Automatica_Boletos_v1.1.md; decisões e plano em
-- docs/planos/2026-10-15-captura-boletos-por-email.md (item 2.1).
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
--
-- Desenho
--   O conector de e-mail é um PRODUTOR DE UPLOADS para a tabela `boletos` que
--   já existe — não há segundo cadastro de boleto. Ele termina quando a linha em
--   `boletos` existe (origem = 'email'); revisão, fornecedor, aprovação, alçada,
--   pagamento e auditoria continuam sendo os do módulo Boletos a Pagar.
--
--   email_capture_accounts  caixa monitorada (IMAP + senha de app no Vault)
--   email_capture_senders   remetentes monitorados ("favoritos")
--   email_capture_messages  UMA LINHA POR ANEXO: é a fila do conector e a trilha
--                           título → boleto → mensagem de origem
--   boletos.origem / email_message_id / nosso_numero
--
-- REGRA #7
--   Pergunta 1 (policy): nenhuma perna de OR solta; tudo por
--   is_org_member/is_org_manager(organization_id). Nada para anon.
--     · contas: membro LÊ; gestor ALTERA só modo/data inicial/piloto/status.
--       Criar e apagar conta é da Edge Function `email-capture-accounts`
--       (service_role), porque exige testar o LOGIN e guardar a senha no Vault.
--     · remetentes: membro cadastra (a Caixa de Revisão tem "Adicionar aos
--       favoritos"), mas só GESTOR grava importacao = 'automatica' — é a
--       chave que deixa um boleto virar rascunho sem ninguém olhar.
--     · mensagens: membro só LÊ; quem escreve é a Edge Function.
--   Pergunta 2 (quem executa): a função de gatilho abaixo é SECURITY INVOKER.
--
-- Isolamento entre organizações
--   remetente → conta e mensagem → conta usam FK COMPOSTA (id, organization_id):
--   o banco recusa remetente da org A apontando para a caixa da org B. O
--   fornecedor do remetente é conferido por gatilho (suppliers não tem UNIQUE
--   (id, organization_id) e não vale mexer nela por isso).

SET lock_timeout = '3s';

-- ─── 1. Contas monitoradas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_capture_accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provedor         TEXT NOT NULL DEFAULT 'imap' CHECK (provedor IN ('imap')),
    host             TEXT NOT NULL DEFAULT 'imap.gmail.com',
    porta            INT  NOT NULL DEFAULT 993 CHECK (porta > 0 AND porta < 65536),
    usuario          TEXT NOT NULL,
    vault_secret_id  UUID,
    status           TEXT NOT NULL DEFAULT 'ativa'
                     CHECK (status IN ('ativa', 'pausada', 'reautenticar', 'desconectada')),
    modo             TEXT NOT NULL DEFAULT 'hibrido'
                     CHECK (modo IN ('favoritos', 'todos', 'hibrido')),
    data_inicial     DATE NOT NULL DEFAULT CURRENT_DATE,
    modo_piloto      BOOLEAN NOT NULL DEFAULT true,
    uid_validity     BIGINT,
    last_uid         BIGINT,
    last_sync_at     TIMESTAMPTZ,
    ultimo_erro      TEXT,
    created_by_email TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_capture_accounts_id_org_uq UNIQUE (id, organization_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS email_capture_accounts_org_usuario_uq
    ON public.email_capture_accounts (organization_id, lower(usuario));

COMMENT ON TABLE public.email_capture_accounts IS
    'Caixas de e-mail monitoradas pela captura de boletos. A senha (de app) mora no Vault: vault_secret_id. Criação/remoção só pela Edge Function email-capture-accounts.';
COMMENT ON COLUMN public.email_capture_accounts.modo_piloto IS
    'true = todo boleto capturado nasce em revisao, mesmo de remetente com importacao automatica.';
COMMENT ON COLUMN public.email_capture_accounts.last_uid IS
    'Checkpoint IMAP: maior UID já processado nesta uid_validity. uid_validity mudou → recomeça de data_inicial (a UNIQUE de email_capture_messages impede duplicar).';

-- ─── 2. Remetentes monitorados ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_capture_senders (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    account_id       UUID NOT NULL,
    supplier_id      UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    nome             TEXT,
    tipo             TEXT NOT NULL DEFAULT 'exato' CHECK (tipo IN ('exato', 'dominio')),
    email            TEXT,
    dominio          TEXT,
    palavras_chave   TEXT[] NOT NULL DEFAULT '{}',
    importacao       TEXT NOT NULL DEFAULT 'revisao' CHECK (importacao IN ('automatica', 'revisao')),
    exigir_dmarc     BOOLEAN NOT NULL DEFAULT true,
    ativo            BOOLEAN NOT NULL DEFAULT true,
    created_by_email TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_capture_senders_conta_fk FOREIGN KEY (account_id, organization_id)
        REFERENCES public.email_capture_accounts (id, organization_id) ON DELETE CASCADE,
    CONSTRAINT email_capture_senders_alvo_ck CHECK (
        (tipo = 'exato'   AND email   IS NOT NULL AND position('@' IN email) > 1) OR
        (tipo = 'dominio' AND dominio IS NOT NULL AND position('@' IN dominio) = 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS email_capture_senders_email_uq
    ON public.email_capture_senders (account_id, lower(email)) WHERE tipo = 'exato';
CREATE UNIQUE INDEX IF NOT EXISTS email_capture_senders_dominio_uq
    ON public.email_capture_senders (account_id, lower(dominio)) WHERE tipo = 'dominio';

COMMENT ON TABLE public.email_capture_senders IS
    'Remetentes monitorados. Favorito NÃO torna o boleto confiável: importação automática exige também DMARC, DV da linha, fornecedor casado na org e vencimento (utils/emailCaptureRegras.ts).';

-- Fornecedor do remetente tem de ser da MESMA organização.
CREATE OR REPLACE FUNCTION public.fn_email_capture_sender_fornecedor_da_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.suppliers s
         WHERE s.id = NEW.supplier_id AND s.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'Fornecedor % não pertence à organização do remetente.', NEW.supplier_id
            USING ERRCODE = '23503';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_capture_sender_fornecedor_da_org ON public.email_capture_senders;
CREATE TRIGGER trg_email_capture_sender_fornecedor_da_org
    BEFORE INSERT OR UPDATE ON public.email_capture_senders
    FOR EACH ROW EXECUTE FUNCTION public.fn_email_capture_sender_fornecedor_da_org();

-- ─── 3. Mensagens (uma linha por anexo) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_capture_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    account_id       UUID NOT NULL,
    uid_validity     BIGINT NOT NULL,
    uid              BIGINT NOT NULL,
    attachment_index INT    NOT NULL DEFAULT 0,
    message_id       TEXT,
    remetente        TEXT,
    assunto          TEXT,
    data_email       TIMESTAMPTZ,
    auth_results     JSONB,
    documento_nome   TEXT,
    sha256           TEXT,
    resultado        TEXT NOT NULL DEFAULT 'processando'
                     CHECK (resultado IN ('processando', 'criado', 'duplicado', 'ignorado', 'erro')),
    motivo           TEXT,
    boleto_id        UUID REFERENCES public.boletos(id) ON DELETE SET NULL,
    erro             TEXT,
    tentativas       INT NOT NULL DEFAULT 0,
    next_retry_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_capture_messages_conta_fk FOREIGN KEY (account_id, organization_id)
        REFERENCES public.email_capture_accounts (id, organization_id) ON DELETE CASCADE,
    CONSTRAINT email_capture_messages_anexo_uq UNIQUE (account_id, uid_validity, uid, attachment_index)
);

CREATE INDEX IF NOT EXISTS email_capture_messages_org_criado_idx
    ON public.email_capture_messages (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_capture_messages_retry_idx
    ON public.email_capture_messages (next_retry_at) WHERE resultado = 'erro';
CREATE INDEX IF NOT EXISTS email_capture_messages_boleto_idx
    ON public.email_capture_messages (boleto_id) WHERE boleto_id IS NOT NULL;

COMMENT ON TABLE public.email_capture_messages IS
    'Um anexo de e-mail processado pela captura: fila (resultado/tentativas/next_retry_at) e trilha (boleto_id). auth_results = SPF/DKIM/DMARC lidos do header Authentication-Results.';

-- ─── 4. boletos: de onde veio ─────────────────────────────────────────────────
ALTER TABLE public.boletos
    ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'upload',
    ADD COLUMN IF NOT EXISTS email_message_id UUID,
    ADD COLUMN IF NOT EXISTS nosso_numero TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boletos_origem_ck') THEN
        ALTER TABLE public.boletos
            ADD CONSTRAINT boletos_origem_ck CHECK (origem IN ('upload', 'email'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boletos_email_message_fk') THEN
        ALTER TABLE public.boletos
            ADD CONSTRAINT boletos_email_message_fk FOREIGN KEY (email_message_id)
            REFERENCES public.email_capture_messages(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.boletos.origem IS 'upload = enviado na tela; email = capturado pela caixa monitorada (email_message_id aponta a mensagem).';

-- ─── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.email_capture_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_capture_senders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_capture_messages ENABLE ROW LEVEL SECURITY;

-- Contas: membro lê; gestor altera colunas de configuração (GRANT por coluna abaixo).
DROP POLICY IF EXISTS email_capture_accounts_ler ON public.email_capture_accounts;
CREATE POLICY email_capture_accounts_ler ON public.email_capture_accounts
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS email_capture_accounts_gestor_altera ON public.email_capture_accounts;
CREATE POLICY email_capture_accounts_gestor_altera ON public.email_capture_accounts
    FOR UPDATE TO authenticated
    USING (public.is_org_manager(organization_id))
    WITH CHECK (public.is_org_manager(organization_id));

-- Remetentes: membro gerencia; importação automática só gestor.
DROP POLICY IF EXISTS email_capture_senders_ler ON public.email_capture_senders;
CREATE POLICY email_capture_senders_ler ON public.email_capture_senders
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS email_capture_senders_criar ON public.email_capture_senders;
CREATE POLICY email_capture_senders_criar ON public.email_capture_senders
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id)
                AND (importacao = 'revisao' OR public.is_org_manager(organization_id)));

DROP POLICY IF EXISTS email_capture_senders_alterar ON public.email_capture_senders;
CREATE POLICY email_capture_senders_alterar ON public.email_capture_senders
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id)
                AND (importacao = 'revisao' OR public.is_org_manager(organization_id)));

DROP POLICY IF EXISTS email_capture_senders_excluir ON public.email_capture_senders;
CREATE POLICY email_capture_senders_excluir ON public.email_capture_senders
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

-- Mensagens: só leitura para membros.
DROP POLICY IF EXISTS email_capture_messages_ler ON public.email_capture_messages;
CREATE POLICY email_capture_messages_ler ON public.email_capture_messages
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON TABLE public.email_capture_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_capture_senders  FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_capture_messages FROM anon, authenticated;

GRANT SELECT ON TABLE public.email_capture_accounts TO authenticated;
GRANT UPDATE (modo, data_inicial, modo_piloto, status, updated_at) ON TABLE public.email_capture_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_capture_senders TO authenticated;
GRANT SELECT ON TABLE public.email_capture_messages TO authenticated;

GRANT ALL ON TABLE public.email_capture_accounts TO service_role;
GRANT ALL ON TABLE public.email_capture_senders  TO service_role;
GRANT ALL ON TABLE public.email_capture_messages TO service_role;

-- ─── 6. Verificação ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sem_rls int;
    v_anon    bool;
BEGIN
    SELECT count(*) INTO v_sem_rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('email_capture_accounts', 'email_capture_senders', 'email_capture_messages')
       AND NOT c.relrowsecurity;
    IF v_sem_rls > 0 THEN
        RAISE EXCEPTION '% tabela(s) da captura sem RLS', v_sem_rls;
    END IF;

    SELECT bool_or(has_table_privilege('anon', t, 'SELECT'))
      INTO v_anon
      FROM unnest(ARRAY['public.email_capture_accounts', 'public.email_capture_senders', 'public.email_capture_messages']) t;
    IF v_anon THEN
        RAISE EXCEPTION 'anon lê tabela da captura de e-mail';
    END IF;

    IF has_table_privilege('authenticated', 'public.email_capture_accounts', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated não pode criar conta direto (é da Edge Function)';
    END IF;

    RAISE NOTICE 'OK: 3 tabelas da captura com RLS; boletos.origem/email_message_id/nosso_numero.';
END $$;
