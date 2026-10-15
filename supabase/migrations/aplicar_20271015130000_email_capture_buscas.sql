-- Captura de boletos por e-mail — busca retroativa por período
--
-- Pedido do usuário em 15/10/2026: "atualmente o app busca por email somente do
-- dia ou consigo buscar por data especifica ou periodo especifico?" → "sim" para
-- a ação "Buscar período". Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (P1).
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
--
-- Desenho
--   Uma busca lê os e-mails de um intervalo [data_de, data_ate] UMA vez, por
--   partes (a Edge Function tem tempo limitado): `cursor_uid` guarda até onde
--   foi. Ela NÃO mexe no `last_uid` da caixa — a leitura automática segue
--   igual. Duplicidade continua barrada pelos mesmos lugares: a UNIQUE do anexo
--   em email_capture_messages e o hash/linha digitável em boletos.
--   Uma busca ativa (pendente/em andamento) por caixa, no máximo.
--
-- REGRA #7
--   Pergunta 1: membro da org LÊ; criar, avançar e cancelar é da Edge Function
--   (service_role), que confere o membro antes. Nada para anon.
--   Pergunta 2: sem funções novas.

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.email_capture_buscas (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL,
    account_id            UUID NOT NULL,
    data_de               DATE NOT NULL,
    data_ate              DATE NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada', 'erro')),
    uid_validity          BIGINT,
    cursor_uid            BIGINT NOT NULL DEFAULT 0,
    total_mensagens       INT,
    mensagens_processadas INT NOT NULL DEFAULT 0,
    criados               INT NOT NULL DEFAULT 0,
    duplicados            INT NOT NULL DEFAULT 0,
    ignorados             INT NOT NULL DEFAULT 0,
    erros                 INT NOT NULL DEFAULT 0,
    ultimo_erro           TEXT,
    pedida_por            TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concluida_em          TIMESTAMPTZ,
    CONSTRAINT email_capture_buscas_periodo_ck CHECK (data_de <= data_ate),
    CONSTRAINT email_capture_buscas_conta_fk FOREIGN KEY (account_id, organization_id)
        REFERENCES public.email_capture_accounts (id, organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS email_capture_buscas_uma_ativa_uq
    ON public.email_capture_buscas (account_id) WHERE status IN ('pendente', 'em_andamento');
CREATE INDEX IF NOT EXISTS email_capture_buscas_org_idx
    ON public.email_capture_buscas (organization_id, created_at DESC);

COMMENT ON TABLE public.email_capture_buscas IS
    'Busca retroativa de e-mails por período numa caixa da captura de boletos. Avança por partes (cursor_uid); não altera o last_uid da caixa. Criada/avançada só pela Edge Function email-capture-sync.';

ALTER TABLE public.email_capture_buscas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_capture_buscas_ler ON public.email_capture_buscas;
CREATE POLICY email_capture_buscas_ler ON public.email_capture_buscas
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON TABLE public.email_capture_buscas FROM anon, authenticated;
GRANT SELECT ON TABLE public.email_capture_buscas TO authenticated;
GRANT ALL ON TABLE public.email_capture_buscas TO service_role;

DO $$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_capture_buscas'::regclass) THEN
        RAISE EXCEPTION 'email_capture_buscas sem RLS';
    END IF;
    IF has_table_privilege('anon', 'public.email_capture_buscas', 'SELECT')
       OR has_table_privilege('authenticated', 'public.email_capture_buscas', 'INSERT')
       OR has_table_privilege('authenticated', 'public.email_capture_buscas', 'UPDATE') THEN
        RAISE EXCEPTION 'privilégio indevido em email_capture_buscas';
    END IF;
    RAISE NOTICE 'OK: email_capture_buscas com RLS; membro só lê.';
END $$;
