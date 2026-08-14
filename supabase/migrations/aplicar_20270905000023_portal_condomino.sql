-- ============================================================================
-- Portal do Condômino — F3
-- Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
--
-- DECISÃO DO USUÁRIO (14/08/2026): "token agora, login depois". Entrega no
-- padrão dos outros 6 portais do app (todos por token em link público), mas
-- desenhado para que trocar por autenticação real NÃO exija migrar dado.
--
-- COMO ISSO É POSSÍVEL: a identidade do condômino não é o token — é a linha de
-- `condomino_portal_access`, que liga a PESSOA à UNIDADE. O token é apenas uma
-- credencial pendurada nela, e `auth_user_id` é a outra, reservada desde já.
-- No dia do login real, preenche-se `auth_user_id` e as RPCs passam a aceitar
-- sessão em vez de token; a linha de acesso, os chamados e as leituras de aviso
-- continuam apontando para o mesmo lugar. Se o token FOSSE a identidade (como
-- em `client_portal_tokens`, onde o token é a própria chave), essa troca
-- exigiria reescrever tudo que o referencia.
--
-- ⚠️ O QUE NÃO ENTRA: dado financeiro. É o que torna token frágil — link é
-- compartilhável e não tem senha. Quando o financeiro condominial entrar
-- (pós-portão), a autenticação real deixa de ser opcional.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — o acesso: a identidade, não a credencial ═════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.condomino_portal_access (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    /** A ocupação é o que dá direito de ver a unidade — não o cadastro de pessoa. */
    occupancy_id    UUID NOT NULL,
    unit_id         UUID NOT NULL,
    client_id       UUID NOT NULL,

    -- CREDENCIAL 1 (hoje): token em link público.
    token           TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    -- CREDENCIAL 2 (depois): conta do Supabase Auth. Reservada de propósito —
    -- é o campo que permite trocar de credencial sem migrar identidade.
    auth_user_id    UUID,

    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_condomino_access_token
    ON public.condomino_portal_access(token);
-- Um acesso por ocupação: duas linhas para a mesma pessoa na mesma unidade
-- seria dois links válidos para o mesmo direito, e revogar um não revogaria o outro.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_condomino_access_ocupacao
    ON public.condomino_portal_access(occupancy_id);
CREATE INDEX IF NOT EXISTS idx_condomino_access_unit
    ON public.condomino_portal_access(unit_id) WHERE is_active;

COMMENT ON TABLE public.condomino_portal_access IS
  'Direito de acesso de um condômino à sua unidade. A IDENTIDADE é esta linha; '
  'token e auth_user_id são credenciais penduradas nela. Trocar token por login '
  'real é preencher auth_user_id — nada aqui migra.';

-- ═══ BLOCO 2 — as FKs, sozinhas (tabelas quentes) ═══════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.condomino_portal_access
  DROP CONSTRAINT IF EXISTS condomino_access_occupancy_fk;
ALTER TABLE public.condomino_portal_access
  ADD CONSTRAINT condomino_access_occupancy_fk
  FOREIGN KEY (occupancy_id) REFERENCES public.unit_occupancies(id) ON DELETE CASCADE;

ALTER TABLE public.condomino_portal_access
  DROP CONSTRAINT IF EXISTS condomino_access_unit_fk;
ALTER TABLE public.condomino_portal_access
  ADD CONSTRAINT condomino_access_unit_fk
  FOREIGN KEY (unit_id) REFERENCES public.empreendimento_units(id) ON DELETE CASCADE;

-- ═══ BLOCO 3 — chamado sabe de qual unidade é ═══════════════════════════════
-- `client_requests` já existe e já tem categorias prediais; faltava a unidade.
-- Nulo nas linhas antigas de propósito: chamado de cliente de obra não tem unidade.
SET lock_timeout = '5s';

ALTER TABLE public.client_requests
  ADD COLUMN IF NOT EXISTS unit_id UUID;

CREATE INDEX IF NOT EXISTS idx_client_requests_unit
    ON public.client_requests(unit_id) WHERE unit_id IS NOT NULL;

COMMENT ON COLUMN public.client_requests.unit_id IS
  'Unidade do condomínio a que o chamado se refere. NULO = chamado de cliente '
  'de obra (o uso original da tabela), que não tem unidade.';

-- ═══ BLOCO 4 — mural de avisos ══════════════════════════════════════════════
-- Não existia nada disso: `communications` é de RH/obra e
-- `investor_announcements` é do investidor. Públicos diferentes, ciclos
-- diferentes — reusar qualquer um deles misturaria comunicado de obra com
-- aviso de síndico na mesma caixa.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.condominio_avisos (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id UUID NOT NULL,
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    titulo            TEXT NOT NULL,
    corpo             TEXT NOT NULL,
    categoria         TEXT NOT NULL DEFAULT 'AVISO'
                        CHECK (categoria IN ('AVISO','URGENTE','MANUTENCAO','ASSEMBLEIA','OBRA')),
    /** Nulo = sem prazo. Aviso vencido some do mural, mas continua no histórico. */
    valido_ate        DATE,
    publicado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publicado_por     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Confirmação de leitura por ACESSO, não por pessoa: a mesma pessoa pode ter
-- duas unidades, e ter lido o aviso numa não significa ter lido na outra.
CREATE TABLE IF NOT EXISTS public.condominio_aviso_leituras (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aviso_id   UUID NOT NULL REFERENCES public.condominio_avisos(id) ON DELETE CASCADE,
    access_id  UUID NOT NULL REFERENCES public.condomino_portal_access(id) ON DELETE CASCADE,
    lido_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_aviso_leitura
    ON public.condominio_aviso_leituras(aviso_id, access_id);
CREATE INDEX IF NOT EXISTS idx_avisos_empr
    ON public.condominio_avisos(empreendimento_id, publicado_em DESC);

-- ═══ BLOCO 5 — documentos do condomínio ═════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.condominio_documentos (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id UUID NOT NULL,
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    titulo            TEXT NOT NULL,
    categoria         TEXT NOT NULL DEFAULT 'OUTRO'
                        CHECK (categoria IN ('CONVENCAO','REGULAMENTO','ATA','MANUAL','LAUDO','SEGURO','OUTRO')),
    url               TEXT NOT NULL,
    descricao         TEXT,
    /** Falso = documento interno; só o admin vê. */
    visivel_portal    BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condominio_docs_empr
    ON public.condominio_documentos(empreendimento_id);

-- ═══ BLOCO 6 — FKs de avisos e documentos ═══════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.condominio_avisos
  DROP CONSTRAINT IF EXISTS condominio_avisos_empr_fk;
ALTER TABLE public.condominio_avisos
  ADD CONSTRAINT condominio_avisos_empr_fk
  FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id) ON DELETE CASCADE;

ALTER TABLE public.condominio_documentos
  DROP CONSTRAINT IF EXISTS condominio_docs_empr_fk;
ALTER TABLE public.condominio_documentos
  ADD CONSTRAINT condominio_docs_empr_fk
  FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id) ON DELETE CASCADE;

-- ═══ BLOCO 7 — updated_at ═══════════════════════════════════════════════════
SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS set_updated_at_condomino_access ON public.condomino_portal_access;
CREATE TRIGGER set_updated_at_condomino_access BEFORE UPDATE ON public.condomino_portal_access
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_condominio_avisos ON public.condominio_avisos;
CREATE TRIGGER set_updated_at_condominio_avisos BEFORE UPDATE ON public.condominio_avisos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_condominio_docs ON public.condominio_documentos;
CREATE TRIGGER set_updated_at_condominio_docs BEFORE UPDATE ON public.condominio_documentos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 8 — RLS do lado ADMIN ════════════════════════════════════════════
-- O portal NÃO usa estas policies: ele entra por RPC SECURITY DEFINER, que é o
-- padrão dos outros portais. Estas valem para o app autenticado.
-- Sem policy para `anon` em nenhuma das três.
SET lock_timeout = '5s';

ALTER TABLE public.condomino_portal_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_avisos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_documentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_aviso_leituras  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['condomino_portal_access','condominio_avisos','condominio_documentos']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_all', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))',
            t || '_org_all', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END LOOP;
END $$;

-- Leituras: sem organization_id próprio — o recorte vem do aviso.
DROP POLICY IF EXISTS "condominio_aviso_leituras_org_all" ON public.condominio_aviso_leituras;
CREATE POLICY "condominio_aviso_leituras_org_all" ON public.condominio_aviso_leituras
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.condominio_avisos a
                    WHERE a.id = aviso_id AND public.is_org_member(a.organization_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.condominio_avisos a
                    WHERE a.id = aviso_id AND public.is_org_member(a.organization_id)));
REVOKE ALL ON public.condominio_aviso_leituras FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.condominio_aviso_leituras TO authenticated;

-- ═══ BLOCO 9 — a porta do portal ════════════════════════════════════════════
-- SECURITY DEFINER com search_path fixo, como os outros portais. Devolve TUDO
-- numa chamada: o portal roda sem sessão, então cada ida ao banco é uma chance
-- a mais de vazar recorte errado.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.condomino_portal_get_data(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_acc   RECORD;
    v_out   JSONB;
BEGIN
    SELECT a.*, u.name AS unit_name, u.floor, u.private_area, u.typology,
           u.fracao_ideal_decimal, u.fracao_ideal_origem,
           t.name AS tower_name, e.id AS empreendimento_id, e.name AS condominio_name,
           e.condominio_cnpj, c.name AS client_name
      INTO v_acc
      FROM public.condomino_portal_access a
      JOIN public.empreendimento_units u  ON u.id = a.unit_id
      JOIN public.empreendimento_towers t ON t.id = u.tower_id
      JOIN public.empreendimentos e       ON e.id = t.empreendimento_id
      JOIN public.clients c               ON c.id = a.client_id
     WHERE a.token = p_token
       AND a.is_active
       AND a.expires_at > NOW();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    UPDATE public.condomino_portal_access SET last_used_at = NOW() WHERE id = v_acc.id;

    SELECT jsonb_build_object(
        'ok', true,
        'acesso', jsonb_build_object('id', v_acc.id, 'expiraEm', v_acc.expires_at),
        'condominio', jsonb_build_object(
            'nome', v_acc.condominio_name, 'cnpj', v_acc.condominio_cnpj),
        'unidade', jsonb_build_object(
            'id', v_acc.unit_id, 'nome', v_acc.unit_name, 'torre', v_acc.tower_name,
            'pavimento', v_acc.floor, 'areaPrivativa', v_acc.private_area,
            'tipologia', v_acc.typology,
            'fracaoIdeal', v_acc.fracao_ideal_decimal,
            'fracaoOrigem', v_acc.fracao_ideal_origem),
        'pessoa', jsonb_build_object('nome', v_acc.client_name),
        -- Quem mais consta na unidade. Só nome e papel: o portal não é lugar de
        -- expor documento nem contato de terceiro.
        'ocupacoes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('papel', o.role, 'nome', cl.name)
                             ORDER BY o.role)
              FROM public.unit_occupancies o
              JOIN public.clients cl ON cl.id = o.client_id
             WHERE o.unit_id = v_acc.unit_id AND o.ended_at IS NULL), '[]'::jsonb),
        'avisos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', av.id, 'titulo', av.titulo, 'corpo', av.corpo,
                       'categoria', av.categoria, 'publicadoEm', av.publicado_em,
                       'lido', EXISTS (SELECT 1 FROM public.condominio_aviso_leituras l
                                        WHERE l.aviso_id = av.id AND l.access_id = v_acc.id))
                       ORDER BY av.publicado_em DESC)
              FROM public.condominio_avisos av
             WHERE av.empreendimento_id = v_acc.empreendimento_id
               AND (av.valido_ate IS NULL OR av.valido_ate >= CURRENT_DATE)), '[]'::jsonb),
        'documentos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', d.id, 'titulo', d.titulo, 'categoria', d.categoria,
                       'url', d.url, 'descricao', d.descricao)
                       ORDER BY d.categoria, d.titulo)
              FROM public.condominio_documentos d
             WHERE d.empreendimento_id = v_acc.empreendimento_id
               AND d.visivel_portal), '[]'::jsonb),
        -- Chamados DA UNIDADE, não da pessoa: quem mora hoje precisa ver o
        -- vazamento aberto pelo morador anterior; e a pessoa com duas unidades
        -- não pode ver as duas listas misturadas.
        'chamados', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', r.id, 'titulo', r.title, 'descricao', r.description,
                       'categoria', r.category, 'prioridade', r.priority,
                       'status', r.status, 'abertoEm', r.opened_at,
                       'resolvidoEm', r.resolved_at)
                       ORDER BY r.opened_at DESC)
              FROM public.client_requests r
             WHERE r.unit_id = v_acc.unit_id), '[]'::jsonb)
    ) INTO v_out;

    RETURN v_out;
END;
$fn$;

REVOKE ALL ON FUNCTION public.condomino_portal_get_data(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomino_portal_get_data(TEXT) TO anon, authenticated;

-- ═══ BLOCO 10 — ações do condômino ══════════════════════════════════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.condomino_portal_abrir_chamado(
    p_token TEXT, p_titulo TEXT, p_descricao TEXT, p_categoria TEXT, p_prioridade TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_acc RECORD; v_id UUID;
BEGIN
    SELECT * INTO v_acc FROM public.condomino_portal_access
     WHERE token = p_token AND is_active AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;
    IF COALESCE(TRIM(p_titulo), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Descreva o assunto do chamado.');
    END IF;

    INSERT INTO public.client_requests
        (organization_id, client_id, unit_id, title, description, category, priority)
    VALUES (v_acc.organization_id, v_acc.client_id, v_acc.unit_id,
            TRIM(p_titulo), p_descricao,
            COALESCE(NULLIF(TRIM(p_categoria), ''), 'Geral'),
            COALESCE(NULLIF(TRIM(p_prioridade), ''), 'Média'))
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.condomino_portal_abrir_chamado(TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomino_portal_abrir_chamado(TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.condomino_portal_marcar_lido(p_token TEXT, p_aviso_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_acc RECORD;
BEGIN
    SELECT * INTO v_acc FROM public.condomino_portal_access
     WHERE token = p_token AND is_active AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    INSERT INTO public.condominio_aviso_leituras (aviso_id, access_id)
    VALUES (p_aviso_id, v_acc.id)
    ON CONFLICT (aviso_id, access_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.condomino_portal_marcar_lido(TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomino_portal_marcar_lido(TEXT,UUID) TO anon, authenticated;

-- ═══ BLOCO 11 — conferência ═════════════════════════════════════════════════
-- Rodar sozinho.
-- Esperado: tabelas=4, com_rls=4, anon_policies=0, rpcs=3, unit_id_chamado=1

SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'
     AND tablename IN ('condomino_portal_access','condominio_avisos','condominio_documentos','condominio_aviso_leituras'))  AS tabelas,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity
     AND tablename IN ('condomino_portal_access','condominio_avisos','condominio_documentos','condominio_aviso_leituras'))  AS com_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND 'anon' = ANY(roles)
     AND tablename IN ('condomino_portal_access','condominio_avisos','condominio_documentos','condominio_aviso_leituras'))  AS anon_policies,
  (SELECT count(*) FROM pg_proc WHERE proname IN
     ('condomino_portal_get_data','condomino_portal_abrir_chamado','condomino_portal_marcar_lido'))                          AS rpcs,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_requests' AND column_name='unit_id')                                  AS unit_id_chamado;
