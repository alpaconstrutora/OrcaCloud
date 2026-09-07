-- ==========================================================================
-- Portal de Crédito · Credit Room — núcleo
-- Date: 2026-09-07
-- Tabelas novas: credit_rooms, credit_room_versions, credit_room_members,
--                credit_room_requests, credit_room_comments,
--                credit_room_access_log
-- Plano: docs/planos/2026-09-07-portal-credito-credit-room.md
-- ==========================================================================
-- CONTEXTO
-- O Credit Room é uma CAMADA DE COMPARTILHAMENTO, não de cálculo. Dívida,
-- NOI, orçamento, vendas e documentos continuam nos módulos que já os têm
-- (debt_*, rental*, fn_opura_obra_kpis, empreendimento_*, opura_documents).
-- Aqui mora só o que não existia: a operação de crédito, o SNAPSHOT
-- versionado do que foi apresentado ao banco, quem pode ver, o que o banco
-- pediu e quem baixou o quê.
--
-- DECISÕES DO USUÁRIO (2026-09-07):
--   · Dono do room = organização da SPE TOMADORA. A holding é dado do
--     snapshot, não dona — é a ancoragem da RLS.
--   · O banco entra com LOGIN (Supabase Auth, MFA), não com token. É o
--     primeiro portal do sistema com esse modelo; por isso cada policy abaixo
--     tem o lado interno e o lado credor escritos SEPARADOS.
--   · Snapshot = agregados (JSON) + ids de versão de documento. Nunca cópia
--     de tabela operacional.
--
-- REGRAS DO PRD que viram constraint aqui:
--   R2  alteração posterior não destrói snapshot → credit_room_versions sem
--       privilégio de UPDATE/DELETE para `authenticated` + trigger.
--   R3  todo dado compartilhado tem data-base → versão carrega `data_base`.
--   R5  intervenção manual gera audit log → credit_room_access_log.
--
-- ⚠️ SEM FK para organizations/companies/empreendimentos/projects/
--    debt_contracts/suppliers: FK para tabela quente deadlocka (40P01, já
--    mordeu 4×). Integridade via RLS; nomes resolvidos no cliente.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'is_org_member') THEN
        RAISE EXCEPTION 'ABORTADO: public.is_org_member() nao existe.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
        RAISE EXCEPTION 'ABORTADO: public.update_updated_at_column() nao existe.';
    END IF;
END $$;

-- ==========================================================================
-- 1. credit_rooms — a operação de crédito
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.credit_rooms (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL,           -- SPE tomadora (sem FK, ver cabeçalho)
    seq                     integer,                 -- numeração por organização (trigger)
    code                    text,                    -- 'CR-00048' (trigger)
    name                    text NOT NULL,

    -- ── Vínculos (todos sem FK; proveniência resolvida no cliente) ─────────
    company_id              uuid,                    -- companies (SPE)
    empreendimento_id       uuid,                    -- empreendimentos
    project_id              uuid,                    -- projects (OBRA principal)
    debt_contract_id        uuid,                    -- debt_contracts (proposta/contrato)
    institution_supplier_id uuid,                    -- suppliers (banco), igual ao módulo Dívida
    institution_name        text,                    -- rótulo quando o banco não é fornecedor cadastrado

    -- ── Solicitação (PRD §46) ────────────────────────────────────────────
    requested_amount        numeric(15,2) NOT NULL DEFAULT 0 CHECK (requested_amount >= 0),
    purpose                 text,
    modality                text,
    term_months             integer CHECK (term_months IS NULL OR term_months > 0),
    grace_months            integer CHECK (grace_months IS NULL OR grace_months >= 0),

    -- ── R8: só fluxo ELEGÍVEL entra no DSCR. Quem decide é a operação. ─────
    -- {"noi": true, "receivables": false, "operating_cash": false}
    eligible_flows          jsonb NOT NULL DEFAULT '{"noi": true, "receivables": false, "operating_cash": false}'::jsonb,
    -- Garantias oferecidas com haircut (R9): [{kind, description, value, haircut_pct}]
    guarantees              jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Equity aportado/previsto (PRD §48) — informado, até existir origem no razão
    equity_committed        numeric(15,2) NOT NULL DEFAULT 0 CHECK (equity_committed >= 0),
    equity_contributed      numeric(15,2) NOT NULL DEFAULT 0 CHECK (equity_contributed >= 0),

    -- ── Estado (PRD §63) ─────────────────────────────────────────────────
    status                  text NOT NULL DEFAULT 'PREPARACAO' CHECK (status IN (
        'PREPARACAO', 'ENVIADA', 'EM_ANALISE', 'PENDENCIAS', 'COMITE',
        'APROVADA', 'RECUSADA', 'CONTRATACAO', 'ATIVA', 'QUITADA', 'CANCELADA'
    )),
    -- Versão que o banco vê. FK adicionada depois da tabela de versões.
    active_version_id       uuid,

    notes                   text,
    created_by              text,                    -- e-mail
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT credit_rooms_seq_por_org UNIQUE (organization_id, seq),
    CONSTRAINT credit_rooms_code_por_org UNIQUE (organization_id, code)
);

COMMENT ON TABLE public.credit_rooms IS
    'Operacao de credito (Credit Room). Camada de compartilhamento: referencia '
    'divida, obra, empreendimento e documentos dos modulos donos; nao os copia. '
    'Dono = organizacao da SPE tomadora (decisao do usuario 2026-09-07).';
COMMENT ON COLUMN public.credit_rooms.eligible_flows IS
    'R8 do PRD: quais fluxos entram no DSCR desta operacao. O DSCR global do '
    'modulo Divida nao serve — cada banco aceita uma base diferente.';
COMMENT ON COLUMN public.credit_rooms.active_version_id IS
    'A versao congelada que o credor enxerga. NULL = nada compartilhado ainda.';

CREATE INDEX IF NOT EXISTS idx_credit_rooms_org_status
    ON public.credit_rooms (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_rooms_empreendimento
    ON public.credit_rooms (empreendimento_id) WHERE empreendimento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_rooms_debt
    ON public.credit_rooms (debt_contract_id) WHERE debt_contract_id IS NOT NULL;

-- Numeração por organização: seq/code preenchidos na inserção. A corrida entre
-- duas inserções simultâneas cai no UNIQUE (organization_id, seq) — o cliente
-- tenta de novo; nunca nasce número repetido.
CREATE OR REPLACE FUNCTION public.fn_credit_room_numerar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.seq IS NULL THEN
        SELECT COALESCE(MAX(seq), 0) + 1 INTO NEW.seq
          FROM public.credit_rooms
         WHERE organization_id = NEW.organization_id;
    END IF;
    IF NEW.code IS NULL OR NEW.code = '' THEN
        NEW.code := 'CR-' || lpad(NEW.seq::text, 5, '0');
    END IF;
    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_credit_room_numerar() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_credit_rooms_numerar ON public.credit_rooms;
CREATE TRIGGER trg_credit_rooms_numerar
    BEFORE INSERT ON public.credit_rooms
    FOR EACH ROW EXECUTE FUNCTION public.fn_credit_room_numerar();

-- ==========================================================================
-- 2. credit_room_versions — o snapshot (PRD §6–7). IMUTÁVEL.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.credit_room_versions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL,
    credit_room_id        uuid NOT NULL REFERENCES public.credit_rooms(id) ON DELETE CASCADE,
    version_no            integer NOT NULL CHECK (version_no > 0),
    label                 text,                      -- 'Proposta inicial', 'Comitê', 'Aditivo 01'
    -- R3: data-base do que foi apresentado. Cada bloco do snapshot repete a
    -- sua, porque dívida e vendas raramente têm a mesma posição.
    data_base             date NOT NULL DEFAULT CURRENT_DATE,
    -- Agregados congelados, por bloco: {divida, obra, vendas, portfolio,
    -- empreendimento, operacao}. Formato em utils/creditRoomSnapshot.ts.
    snapshot              jsonb NOT NULL,
    -- LTV/LTC/DSCR/equity/cobertura calculados SOBRE o snapshot, guardados
    -- para o portal não recalcular (e para provar depois o que foi mostrado).
    indicators            jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Versões exatas dos documentos que acompanhavam esta versão (R4).
    document_version_ids  uuid[] NOT NULL DEFAULT '{}'::uuid[],
    notes                 text,
    frozen_by             text,                      -- e-mail
    frozen_at             timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT credit_room_versions_numero_unico UNIQUE (credit_room_id, version_no)
);

COMMENT ON TABLE public.credit_room_versions IS
    'Snapshot versionado da operacao (PRD §6-7). Imutavel: `authenticated` nao '
    'tem UPDATE/DELETE e a trigger recusa mesmo assim. Congelar de novo = versao nova.';

CREATE INDEX IF NOT EXISTS idx_credit_room_versions_room
    ON public.credit_room_versions (credit_room_id, version_no DESC);

-- FK tardia: credit_rooms.active_version_id → versões (tabela nova, sem risco
-- de lock em tabela quente).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_rooms_active_version_fk') THEN
        ALTER TABLE public.credit_rooms
            ADD CONSTRAINT credit_rooms_active_version_fk
            FOREIGN KEY (active_version_id) REFERENCES public.credit_room_versions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- R2 em trigger: nem UPDATE nem DELETE por usuário da aplicação. O
-- `current_user <> 'authenticated'` deixa postgres/service_role corrigirem
-- dado à mão, com registro fora da aplicação.
CREATE OR REPLACE FUNCTION public.fn_credit_room_version_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    RAISE EXCEPTION
        'Versao % do Credit Room e imutavel (R2). Congele uma versao nova ou cancele a operacao.',
        OLD.version_no
        USING ERRCODE = 'check_violation';
END $$;

REVOKE ALL ON FUNCTION public.fn_credit_room_version_imutavel() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_credit_room_versions_imutavel ON public.credit_room_versions;
CREATE TRIGGER trg_credit_room_versions_imutavel
    BEFORE UPDATE OR DELETE ON public.credit_room_versions
    FOR EACH ROW EXECUTE FUNCTION public.fn_credit_room_version_imutavel();

-- ==========================================================================
-- 3. credit_room_members — quem entra (PRD §83, §86)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.credit_room_members (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL,
    credit_room_id   uuid NOT NULL REFERENCES public.credit_rooms(id) ON DELETE CASCADE,
    -- O convite é por e-mail; user_id é preenchido no primeiro acesso
    -- (fn_credit_room_touch_member). Até lá a RLS casa pelo e-mail do JWT.
    email            text NOT NULL,
    user_id          uuid,
    name             text,
    institution      text,                           -- 'Banco ABC', 'Fundo XYZ'
    side             text NOT NULL CHECK (side IN ('TOMADOR', 'CREDOR')),
    -- {"view": true, "download": true, "comment": true, "request": true}
    permissions      jsonb NOT NULL DEFAULT '{"view": true, "download": true, "comment": true, "request": true}'::jsonb,
    invited_by       text,
    invited_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz,
    revoked_at       timestamptz,
    revoked_by       text,
    last_access_at   timestamptz,

    CONSTRAINT credit_room_members_email_minusculo CHECK (email = lower(email))
);

COMMENT ON TABLE public.credit_room_members IS
    'Participantes do Credit Room. side=CREDOR e o usuario externo do banco: '
    'entra com login proprio e so enxerga o que a RLS deste modulo libera. '
    'Revogar = revoked_at; expirar = expires_at (PRD §86).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_room_members_email
    ON public.credit_room_members (credit_room_id, email);
CREATE INDEX IF NOT EXISTS idx_credit_room_members_user
    ON public.credit_room_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_room_members_email
    ON public.credit_room_members (email);

-- ==========================================================================
-- 4. Funções de acesso (usadas pelas policies)
-- ==========================================================================
-- SECURITY DEFINER de propósito: a policy de credit_room_members não pode
-- consultar credit_room_members (recursão), e o credor não pode ler
-- credit_rooms pela org. Cada função responde UMA pergunta e nada mais.

-- "O chamador é participante ATIVO deste room?" (qualquer lado)
CREATE OR REPLACE FUNCTION public.is_credit_room_member(p_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.credit_room_members m
         WHERE m.credit_room_id = p_room
           AND m.revoked_at IS NULL
           AND (m.expires_at IS NULL OR m.expires_at > now())
           AND (
                 (m.user_id IS NOT NULL AND m.user_id = auth.uid())
              OR (m.email = lower(COALESCE(auth.jwt() ->> 'email', '')))
           )
    );
$$;

REVOKE ALL ON FUNCTION public.is_credit_room_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_credit_room_member(uuid) TO authenticated;

-- "O chamador é do LADO INTERNO (membro da org dona) deste room?"
CREATE OR REPLACE FUNCTION public.fn_credit_room_is_internal(p_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.credit_rooms r
         WHERE r.id = p_room
           AND public.is_org_member(r.organization_id)
    );
$$;

REVOKE ALL ON FUNCTION public.fn_credit_room_is_internal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_credit_room_is_internal(uuid) TO authenticated;

-- "O chamador pode LER este room?" = interno OU participante ativo.
CREATE OR REPLACE FUNCTION public.fn_credit_room_access(p_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.fn_credit_room_is_internal(p_room) OR public.is_credit_room_member(p_room);
$$;

REVOKE ALL ON FUNCTION public.fn_credit_room_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_credit_room_access(uuid) TO authenticated;

-- Primeiro acesso do credor: liga o user_id ao convite feito por e-mail e
-- marca last_access_at. É a única escrita que o credor faz em members, e é
-- restrita à PRÓPRIA linha pelo e-mail do JWT — não recebe e-mail por
-- parâmetro.
CREATE OR REPLACE FUNCTION public.fn_credit_room_touch_member(p_room uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
    v_n     integer;
BEGIN
    IF auth.uid() IS NULL OR v_email = '' THEN
        RETURN false;
    END IF;
    UPDATE public.credit_room_members
       SET user_id = COALESCE(user_id, auth.uid()),
           last_access_at = now()
     WHERE credit_room_id = p_room
       AND email = v_email
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now());
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n > 0;
END $$;

REVOKE ALL ON FUNCTION public.fn_credit_room_touch_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_credit_room_touch_member(uuid) TO authenticated;

-- Lista os rooms em que o chamador é participante ativo — o "home" do credor.
-- Devolve só o que o portal precisa para montar a lista; o resto vem pelas
-- policies das tabelas.
CREATE OR REPLACE FUNCTION public.fn_my_credit_rooms()
RETURNS TABLE (
    credit_room_id uuid,
    side           text,
    permissions    jsonb,
    expires_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT m.credit_room_id, m.side, m.permissions, m.expires_at
      FROM public.credit_room_members m
     WHERE m.revoked_at IS NULL
       AND (m.expires_at IS NULL OR m.expires_at > now())
       AND (
             (m.user_id IS NOT NULL AND m.user_id = auth.uid())
          OR (m.email = lower(COALESCE(auth.jwt() ->> 'email', '')))
       );
$$;

REVOKE ALL ON FUNCTION public.fn_my_credit_rooms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_my_credit_rooms() TO authenticated;

-- ==========================================================================
-- 5. credit_room_requests — request list (PRD §59)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.credit_room_requests (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL,
    credit_room_id   uuid NOT NULL REFERENCES public.credit_rooms(id) ON DELETE CASCADE,
    title            text NOT NULL,
    description      text,
    -- Quem pediu. O banco pede documento; o tomador pede posicionamento.
    from_side        text NOT NULL CHECK (from_side IN ('TOMADOR', 'CREDOR')),
    assignee_email   text,
    due_at           date,
    priority         text NOT NULL DEFAULT 'MEDIA' CHECK (priority IN ('BAIXA', 'MEDIA', 'ALTA')),
    status           text NOT NULL DEFAULT 'ABERTA' CHECK (status IN (
        'ABERTA', 'EM_PREPARACAO', 'RESPONDIDA', 'EM_ANALISE', 'ACEITA', 'REJEITADA'
    )),
    -- Documento do GED que responde a solicitação (sem FK: GED é outro módulo).
    answer_document_id uuid,
    created_by       text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_room_requests IS
    'Request list da due diligence (PRD §59): o que o banco pediu, quem '
    'responde, prazo e status. Substitui o e-mail "envie a matricula atualizada".';

CREATE INDEX IF NOT EXISTS idx_credit_room_requests_room
    ON public.credit_room_requests (credit_room_id, status);

-- ==========================================================================
-- 6. credit_room_comments — interno × compartilhado (PRD §61)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.credit_room_comments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL,
    credit_room_id   uuid NOT NULL REFERENCES public.credit_rooms(id) ON DELETE CASCADE,
    request_id       uuid REFERENCES public.credit_room_requests(id) ON DELETE CASCADE,
    -- INTERNO nunca sai da empresa. É a policy de SELECT que garante, não a UI.
    visibility       text NOT NULL DEFAULT 'COMPARTILHADO' CHECK (visibility IN ('INTERNO', 'COMPARTILHADO')),
    author_email     text NOT NULL,
    author_side      text NOT NULL CHECK (author_side IN ('TOMADOR', 'CREDOR')),
    body             text NOT NULL CHECK (length(body) > 0),
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_room_comments_room
    ON public.credit_room_comments (credit_room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_room_comments_request
    ON public.credit_room_comments (request_id) WHERE request_id IS NOT NULL;

-- ==========================================================================
-- 7. credit_room_access_log — auditoria (PRD §88–89)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.credit_room_access_log (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL,
    credit_room_id   uuid NOT NULL REFERENCES public.credit_rooms(id) ON DELETE CASCADE,
    actor_user_id    uuid,
    actor_email      text NOT NULL,
    actor_side       text CHECK (actor_side IS NULL OR actor_side IN ('TOMADOR', 'CREDOR')),
    action           text NOT NULL CHECK (action IN (
        'LOGIN', 'VIEW', 'DOWNLOAD', 'COMMENT', 'REQUEST', 'SHARE', 'UNSHARE',
        'FREEZE', 'INVITE', 'REVOKE', 'EXPORT', 'STATUS'
    )),
    resource_type    text,                            -- 'version' | 'document' | 'request' | 'tab'
    resource_id      text,
    metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- IP e user-agent só quando a escrita passa pela Edge Function (download).
    ip               text,
    user_agent       text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_room_access_log IS
    'Trilha do Credit Room (PRD §89). Somente INSERT pela aplicacao; leitura so '
    'do lado interno — o banco nao ve quem mais olhou.';

CREATE INDEX IF NOT EXISTS idx_credit_room_access_log_room
    ON public.credit_room_access_log (credit_room_id, created_at DESC);

-- ==========================================================================
-- 8. updated_at
-- ==========================================================================

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['credit_rooms', 'credit_room_requests']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;', t);
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s '
            'FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
    END LOOP;
END $$;

-- ==========================================================================
-- 9. RLS — lado interno e lado credor, SEPARADOS
-- ==========================================================================
-- REGRA #7, Pergunta 1: nenhuma perna de OR abaixo basta sozinha para liberar
-- linha de outro tenant. `is_org_member` recorta a org; `is_credit_room_member`
-- recorta o room em que o chamador foi convidado e ainda está ativo.

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['credit_rooms', 'credit_room_versions', 'credit_room_members',
                             'credit_room_requests', 'credit_room_comments', 'credit_room_access_log']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        -- REVOKE explícito de TODOS, inclusive `authenticated`: o ALTER DEFAULT
        -- PRIVILEGES do Supabase concede ALL a authenticated/anon em tabela
        -- nova. Medido no ensaio de 07/09: sem esta linha, credit_room_versions
        -- nascia com UPDATE/DELETE para authenticated — a trigger seguraria,
        -- mas a segunda trava (privilégio) não existiria. Os GRANTs abaixo
        -- devolvem só o que cada tabela precisa.
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, PUBLIC, authenticated;', t);
    END LOOP;
END $$;

-- 9.1 credit_rooms ─────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_rooms TO authenticated;

DROP POLICY IF EXISTS credit_rooms_select ON public.credit_rooms;
CREATE POLICY credit_rooms_select ON public.credit_rooms
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_credit_room_member(id));

DROP POLICY IF EXISTS credit_rooms_insert ON public.credit_rooms;
CREATE POLICY credit_rooms_insert ON public.credit_rooms
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS credit_rooms_update ON public.credit_rooms;
CREATE POLICY credit_rooms_update ON public.credit_rooms
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS credit_rooms_delete ON public.credit_rooms;
CREATE POLICY credit_rooms_delete ON public.credit_rooms
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

-- 9.2 credit_room_versions — sem UPDATE/DELETE para ninguém da aplicação ─────
GRANT SELECT, INSERT ON public.credit_room_versions TO authenticated;

DROP POLICY IF EXISTS credit_room_versions_select ON public.credit_room_versions;
CREATE POLICY credit_room_versions_select ON public.credit_room_versions
    FOR SELECT TO authenticated
    USING (public.fn_credit_room_access(credit_room_id));

DROP POLICY IF EXISTS credit_room_versions_insert ON public.credit_room_versions;
CREATE POLICY credit_room_versions_insert ON public.credit_room_versions
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_org_member(organization_id)
        AND public.fn_credit_room_is_internal(credit_room_id)
    );

-- 9.3 credit_room_members ───────────────────────────────────────────────────
-- O credor vê SÓ a própria linha (para saber permissões e validade). Quem
-- convida, revoga e lista é o lado interno.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_room_members TO authenticated;

DROP POLICY IF EXISTS credit_room_members_select ON public.credit_room_members;
CREATE POLICY credit_room_members_select ON public.credit_room_members
    FOR SELECT TO authenticated
    USING (
        public.fn_credit_room_is_internal(credit_room_id)
        OR (user_id IS NOT NULL AND user_id = auth.uid())
        OR email = lower(COALESCE(auth.jwt() ->> 'email', ''))
    );

DROP POLICY IF EXISTS credit_room_members_write ON public.credit_room_members;
CREATE POLICY credit_room_members_write ON public.credit_room_members
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) AND public.fn_credit_room_is_internal(credit_room_id))
    WITH CHECK (public.is_org_member(organization_id) AND public.fn_credit_room_is_internal(credit_room_id));

-- 9.4 credit_room_requests — os dois lados leem, abrem e movem status ───────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_room_requests TO authenticated;

DROP POLICY IF EXISTS credit_room_requests_select ON public.credit_room_requests;
CREATE POLICY credit_room_requests_select ON public.credit_room_requests
    FOR SELECT TO authenticated
    USING (public.fn_credit_room_access(credit_room_id));

DROP POLICY IF EXISTS credit_room_requests_insert ON public.credit_room_requests;
CREATE POLICY credit_room_requests_insert ON public.credit_room_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        public.fn_credit_room_access(credit_room_id)
        AND created_by = lower(COALESCE(auth.jwt() ->> 'email', ''))
    );

DROP POLICY IF EXISTS credit_room_requests_update ON public.credit_room_requests;
CREATE POLICY credit_room_requests_update ON public.credit_room_requests
    FOR UPDATE TO authenticated
    USING (public.fn_credit_room_access(credit_room_id))
    WITH CHECK (public.fn_credit_room_access(credit_room_id));

DROP POLICY IF EXISTS credit_room_requests_delete ON public.credit_room_requests;
CREATE POLICY credit_room_requests_delete ON public.credit_room_requests
    FOR DELETE TO authenticated
    USING (public.fn_credit_room_is_internal(credit_room_id));

-- 9.5 credit_room_comments — INTERNO nunca chega ao credor ──────────────────
GRANT SELECT, INSERT, DELETE ON public.credit_room_comments TO authenticated;

DROP POLICY IF EXISTS credit_room_comments_select ON public.credit_room_comments;
CREATE POLICY credit_room_comments_select ON public.credit_room_comments
    FOR SELECT TO authenticated
    USING (
        public.fn_credit_room_is_internal(credit_room_id)
        OR (visibility = 'COMPARTILHADO' AND public.is_credit_room_member(credit_room_id))
    );

DROP POLICY IF EXISTS credit_room_comments_insert ON public.credit_room_comments;
CREATE POLICY credit_room_comments_insert ON public.credit_room_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_email = lower(COALESCE(auth.jwt() ->> 'email', ''))
        AND (
            public.fn_credit_room_is_internal(credit_room_id)
            OR (visibility = 'COMPARTILHADO' AND public.is_credit_room_member(credit_room_id))
        )
    );

DROP POLICY IF EXISTS credit_room_comments_delete ON public.credit_room_comments;
CREATE POLICY credit_room_comments_delete ON public.credit_room_comments
    FOR DELETE TO authenticated
    USING (public.fn_credit_room_is_internal(credit_room_id));

-- 9.6 credit_room_access_log — todos escrevem a própria linha; só interno lê ─
GRANT SELECT, INSERT ON public.credit_room_access_log TO authenticated;

DROP POLICY IF EXISTS credit_room_access_log_select ON public.credit_room_access_log;
CREATE POLICY credit_room_access_log_select ON public.credit_room_access_log
    FOR SELECT TO authenticated
    USING (public.fn_credit_room_is_internal(credit_room_id));

DROP POLICY IF EXISTS credit_room_access_log_insert ON public.credit_room_access_log;
CREATE POLICY credit_room_access_log_insert ON public.credit_room_access_log
    FOR INSERT TO authenticated
    WITH CHECK (
        public.fn_credit_room_access(credit_room_id)
        AND actor_email = lower(COALESCE(auth.jwt() ->> 'email', ''))
    );

-- ==========================================================================
-- 10. Conferência
-- ==========================================================================
-- 10.a. As 6 tabelas existem com RLS ligada:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname LIKE 'credit\_room%' ORDER BY relname;
--    -> 6 linhas, relrowsecurity = t
--
-- 10.b. Ninguém da aplicação tem UPDATE/DELETE na tabela de versões:
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'credit_room_versions' ORDER BY 1, 2;
--    -> authenticated: INSERT, SELECT apenas; nada para anon
--
-- 10.c. As funções DEFINER não são executáveis por anon/PUBLIC:
-- SELECT proname, proacl FROM pg_proc
--  WHERE proname IN ('is_credit_room_member','fn_credit_room_is_internal',
--                    'fn_credit_room_access','fn_credit_room_touch_member','fn_my_credit_rooms');
--    -> proacl sem `=X/` (PUBLIC) e sem `anon=`
--
-- 10.d. Sonda de fora, com a chave publicável (scripts/check-rls-postura.sh, 9):
--   GET /rest/v1/credit_rooms?select=id  -> 401 ou [], nunca linha
--
-- 10.e. Imutabilidade (como usuário authenticated, via PostgREST):
--   PATCH /rest/v1/credit_room_versions?id=eq.<v>  -> 42501 (sem privilégio)
--
-- 10.f. Numeração: dois INSERTs na mesma org -> CR-00001, CR-00002
-- ==========================================================================
-- FIM: aplicar_20270920000001_credit_rooms.sql
-- ==========================================================================
