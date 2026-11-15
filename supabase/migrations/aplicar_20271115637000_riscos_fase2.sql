-- Módulo ÒPURA Riscos — Fase 2 (15/11/2026): ocorrências, vínculos, alçada, sugestão por obra e sinais.
-- Plano: docs/planos/2026-11-13-modulo-riscos.md (F2.1–F2.5). Depende de aplicar_20271114637000/639000/641000.
--
-- • Sem FK para tabelas quentes (projects, contracts, purchase_orders, opura_documents…): id externo como
--   texto, validado no app — mesma regra da Fase 1 (deadlock 40P01 em REFERENCES contra o app ativo).
-- • RLS por conjunto (`organization_id IN (SELECT minhas_orgs_membro())`); REVOKE nomeando anon. Desde
--   aplicar_20271115463000 o padrão do schema já não concede TRUNCATE a usuário.
-- • Alçada: `fn_alcada_trava_passo` e `fn_alcada_aprovadores` são reescritas a partir da definição VIGENTE no
--   banco (pg_get_functiondef em 15/11/2026), acrescentando só `project_risks` / 'project_risk'.

-- ─────────────────────────────────────────────────────────────────────────────
-- F2.1 Ocorrências
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.risk_events (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID NOT NULL,
    project_risk_id          UUID REFERENCES public.project_risks(id) ON DELETE RESTRICT,
    project_id               UUID,
    tipo                     TEXT NOT NULL CHECK (tipo IN ('quase_acidente','acidente','nao_conformidade','dano','sinistro','atraso','perda','oportunidade_realizada','outro')),
    data_ocorrencia          DATE NOT NULL,
    titulo                   TEXT NOT NULL CHECK (btrim(titulo) <> ''),
    descricao                TEXT,
    causa_raiz               TEXT,
    -- Um valor por ocorrência, mesmo afetando várias dimensões: nunca multiplica (seção 8 da especificação).
    impacto_financeiro       NUMERIC(16,2) CHECK (impacto_financeiro IS NULL OR impacto_financeiro >= 0),
    atraso_dias              INTEGER CHECK (atraso_dias IS NULL OR atraso_dias >= 0),
    dimensoes                TEXT[] NOT NULL DEFAULT '{}',
    acoes_corretivas         TEXT,
    licoes_aprendidas        TEXT,
    evidencia_url            TEXT,
    evidencia_document_id    UUID,
    materializa              BOOLEAN NOT NULL DEFAULT false,
    -- Avaliação vigente no momento da materialização (CA08): o histórico de avaliações é append-only.
    avaliacao_referencia_id  UUID REFERENCES public.risk_evaluations(id) ON DELETE RESTRICT,
    status                   TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_tratamento','encerrada')),
    created_by               UUID DEFAULT auth.uid(),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT risk_events_dimensoes_ck CHECK (dimensoes <@ ARRAY['financeira','prazo','seguranca','qualidade','juridica','ambiental','reputacional','operacional']::TEXT[]),
    CONSTRAINT risk_events_materializa_ck CHECK (NOT materializa OR project_risk_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_risk_events_risk ON public.risk_events (project_risk_id, data_ocorrencia DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_org  ON public.risk_events (organization_id, data_ocorrencia DESC);

CREATE OR REPLACE FUNCTION public.risk_events_preparar()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.materializa AND NEW.project_risk_id IS NOT NULL AND NEW.avaliacao_referencia_id IS NULL THEN
        SELECT e.id INTO NEW.avaliacao_referencia_id
          FROM public.risk_evaluations e
         WHERE e.project_risk_id = NEW.project_risk_id
         ORDER BY e.avaliado_em DESC LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_risk_events_preparar ON public.risk_events;
CREATE TRIGGER trg_risk_events_preparar BEFORE INSERT ON public.risk_events
    FOR EACH ROW EXECUTE FUNCTION public.risk_events_preparar();

CREATE OR REPLACE FUNCTION public.risk_events_materializar()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.materializa AND NEW.project_risk_id IS NOT NULL THEN
        UPDATE public.project_risks SET status = 'materializado'
         WHERE id = NEW.project_risk_id AND status NOT IN ('materializado','encerrado');
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_risk_events_materializar ON public.risk_events;
CREATE TRIGGER trg_risk_events_materializar AFTER INSERT ON public.risk_events
    FOR EACH ROW EXECUTE FUNCTION public.risk_events_materializar();

DROP TRIGGER IF EXISTS trg_risk_events_updated_at ON public.risk_events;
CREATE TRIGGER trg_risk_events_updated_at BEFORE UPDATE ON public.risk_events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auditoria: ocorrência e vínculo ganham tipo próprio; materializar ganha ação própria; aprovar/reprovar também.
ALTER TABLE public.risk_audit_logs DROP CONSTRAINT IF EXISTS risk_audit_logs_entity_type_check;
ALTER TABLE public.risk_audit_logs ADD CONSTRAINT risk_audit_logs_entity_type_check
    CHECK (entity_type IN ('risk','evaluation','action','catalog','config','event','link'));
ALTER TABLE public.risk_audit_logs DROP CONSTRAINT IF EXISTS risk_audit_logs_action_check;
ALTER TABLE public.risk_audit_logs ADD CONSTRAINT risk_audit_logs_action_check
    CHECK (action IN ('create','update','delete','evaluate','close','reopen','link','unlink','materialize','submit','approve','reject'));

-- ─────────────────────────────────────────────────────────────────────────────
-- F2.2 Vínculos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.risk_links (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    project_risk_id  UUID NOT NULL REFERENCES public.project_risks(id) ON DELETE CASCADE,
    modulo           TEXT NOT NULL CHECK (modulo IN ('cronograma','contrato','pedido_compra','nao_conformidade','documento')),
    -- Id do sistema de origem (CA10). Cronograma: id da linha do orçamento/cronograma (texto);
    -- os demais: uuid da tabela de origem.
    external_id      TEXT NOT NULL CHECK (btrim(external_id) <> ''),
    -- Cronograma: {"planningProjectId": "<uuid do projeto PLANEJAMENTO>"}.
    external_ref     JSONB NOT NULL DEFAULT '{}'::jsonb,
    external_label   TEXT,
    created_by       UUID DEFAULT auth.uid(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT risk_links_unico UNIQUE (project_risk_id, modulo, external_id),
    CONSTRAINT risk_links_cronograma_ref_ck CHECK (modulo <> 'cronograma' OR (external_ref ->> 'planningProjectId') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_risk_links_org ON public.risk_links (organization_id, modulo);

-- ─────────────────────────────────────────────────────────────────────────────
-- F2.4 Perfil da obra para sugestão (último escolhido no assistente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.risk_project_profiles (
    project_id       UUID PRIMARY KEY,
    organization_id  UUID NOT NULL,
    tipologia        TEXT CHECK (tipologia IS NULL OR tipologia IN ('residencial','comercial','galpao_industrial','loteamento','reforma','obra_publica')),
    condicoes        TEXT[] NOT NULL DEFAULT '{}',
    updated_by       UUID DEFAULT auth.uid(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_risk_project_profiles_updated_at ON public.risk_project_profiles;
CREATE TRIGGER trg_risk_project_profiles_updated_at BEFORE UPDATE ON public.risk_project_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- F2.3 Alçada no risco
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL = não foi enviado (só risco crítico ou aceito exige; a tela decide e mostra o motivo).
ALTER TABLE public.project_risks ADD COLUMN IF NOT EXISTS approval_status TEXT
    CHECK (approval_status IS NULL OR approval_status IN ('RASCUNHO','PENDENTE','APROVADO','REJEITADO'));
ALTER TABLE public.project_risks ADD COLUMN IF NOT EXISTS approval_chain JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.project_risks ADD COLUMN IF NOT EXISTS approval_required_levels INTEGER;
CREATE INDEX IF NOT EXISTS idx_project_risks_aprovacao ON public.project_risks (organization_id, approval_status)
    WHERE approval_status = 'PENDENTE';

ALTER TABLE public.approval_approvers DROP CONSTRAINT IF EXISTS approval_approvers_entity_type_check;
ALTER TABLE public.approval_approvers ADD CONSTRAINT approval_approvers_entity_type_check
    CHECK (entity_type IN ('blueprint_snapshot','doc_gen_documento','purchase_request','process_step','project_risk'));

CREATE OR REPLACE FUNCTION public.fn_alcada_aprovadores(p_org uuid, p_entity text, p_valor numeric, p_nivel integer)
 RETURNS TABLE(user_id uuid, nome text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
    SELECT a.user_id,
           COALESCE(NULLIF(btrim(om.name), ''), NULLIF(btrim(pf.name), ''), om.email, a.user_id::text),
           om.email
      FROM public.approval_approvers a
      LEFT JOIN public.organization_members om
             ON om.organization_id = a.organization_id AND om.user_id = a.user_id
      LEFT JOIN public.profiles pf ON pf.id = a.user_id
     WHERE a.organization_id = p_org
       AND a.level = p_nivel
       -- SECURITY DEFINER: só responde a quem é da org (ou superadmin, ou o
       -- próprio banco — gatilho/rotina sem JWT).
       AND (auth.uid() IS NULL OR public.is_org_member(p_org) OR public.is_superadmin())
       AND CASE
             WHEN p_entity IN ('blueprint_snapshot', 'doc_gen_documento', 'purchase_request', 'process_step', 'project_risk')
               THEN a.entity_type = p_entity
             ELSE a.faixa_id = (
                 SELECT c.id
                   FROM public.financial_approval_config c
                  WHERE c.organization_id = p_org
                    AND c.is_active
                    AND COALESCE(p_valor, 0) >= c.faixa_min
                    AND (c.faixa_max IS NULL OR COALESCE(p_valor, 0) < c.faixa_max)
                  ORDER BY c.faixa_min DESC
                  LIMIT 1)
           END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_alcada_trava_passo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_novo   jsonb;
    v_antigo jsonb;
    v_passo  jsonb;
    v_linha  jsonb;
    v_org    uuid;
    v_entity text;
    v_valor  numeric;
    v_nivel  integer;
    v_quem   text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_novo   := CASE WHEN jsonb_typeof(NEW.approval_chain) = 'array' THEN NEW.approval_chain ELSE '[]'::jsonb END;
    v_antigo := CASE WHEN jsonb_typeof(OLD.approval_chain) = 'array' THEN OLD.approval_chain ELSE '[]'::jsonb END;
    IF jsonb_array_length(v_novo) <= jsonb_array_length(v_antigo) THEN
        RETURN NEW;
    END IF;

    v_passo := v_novo -> (jsonb_array_length(v_novo) - 1);
    IF COALESCE(v_passo ->> 'action', '') NOT IN ('APROVADO', 'REJEITADO')
       OR v_antigo @> jsonb_build_array(v_passo) THEN
        RETURN NEW;
    END IF;

    IF lower(btrim(COALESCE(v_passo ->> 'approved_by', ''))) <> lower(COALESCE(auth.jwt() ->> 'email', '')) THEN
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: a aprovação tem de ser registrada em nome de quem está logado.'
            USING ERRCODE = 'P0001';
    END IF;

    v_linha := to_jsonb(NEW);
    v_org   := (v_linha ->> 'organization_id')::uuid;
    CASE TG_TABLE_NAME
        WHEN 'internal_transactions' THEN
            IF v_linha ->> 'darf_id' IS NOT NULL THEN
                -- DARF: a faixa é a do TOTAL da guia, não a do título-membro.
                v_entity := 'darf';
                SELECT vd.total INTO v_valor FROM public.vw_darfs vd WHERE vd.id = (v_linha ->> 'darf_id')::uuid;
            ELSE
                v_entity := 'transaction';
                v_valor  := (v_linha ->> 'amount')::numeric;
            END IF;
        WHEN 'contracts' THEN
            v_entity := 'contract';
            v_valor  := (v_linha ->> 'current_value')::numeric;
        WHEN 'purchase_orders' THEN
            -- Mesma conta de utils/pedidoItemValor.totalEfetivoDoPedido
            -- (item a item: quotedTotal ?? total ?? 0).
            v_entity := 'purchase_order';
            SELECT COALESCE(sum(COALESCE((i ->> 'quotedTotal')::numeric, (i ->> 'total')::numeric, 0)), 0)
              INTO v_valor
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_linha -> 'items') = 'array'
                                             THEN v_linha -> 'items' ELSE '[]'::jsonb END) i;
        WHEN 'process_instance_steps' THEN
            v_entity := 'process_step';
            v_valor  := 0;
            SELECT pi.organization_id INTO v_org
              FROM public.process_instances pi WHERE pi.id = (v_linha ->> 'process_instance_id')::uuid;
        WHEN 'blueprint_snapshots' THEN
            v_entity := 'blueprint_snapshot';
            v_valor  := 0;
        WHEN 'purchase_requests' THEN
            v_entity := 'purchase_request';
            v_valor  := (v_linha ->> 'estimated_total')::numeric;
        WHEN 'doc_gen_documentos' THEN
            v_entity := 'doc_gen_documento';
            v_valor  := 0;
        WHEN 'project_risks' THEN
            -- Módulo Riscos (F2.3, 15/11/2026): sem valor; aprovadores por tipo.
            v_entity := 'project_risk';
            v_valor  := 0;
        ELSE
            RETURN NEW;
    END CASE;

    IF v_org IS NULL THEN
        RETURN NEW;
    END IF;

    v_nivel := CASE WHEN v_passo ->> 'action' = 'APROVADO'
                    THEN COALESCE((v_passo ->> 'level')::integer, 1)
                    ELSE public.fn_alcada_proximo_nivel(v_antigo) END;

    IF NOT public.fn_alcada_pode_aprovar(v_org, v_entity, v_valor, v_nivel) THEN
        SELECT string_agg(a.nome, ', ' ORDER BY a.nome) INTO v_quem
          FROM public.fn_alcada_aprovadores(v_org, v_entity, v_valor, v_nivel) a;
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: o nível % deste item é aprovado por %.', v_nivel, v_quem
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_zz_alcada_trava_passo ON public.project_risks;
CREATE TRIGGER trg_zz_alcada_trava_passo BEFORE UPDATE OF approval_chain ON public.project_risks
    FOR EACH ROW EXECUTE FUNCTION public.fn_alcada_trava_passo();

-- ─────────────────────────────────────────────────────────────────────────────
-- F2.5 Sinais pelos vínculos (SECURITY INVOKER: a RLS de cada tabela de origem vale para o usuário)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_risk_sinais(p_org UUID DEFAULT NULL)
RETURNS TABLE (project_risk_id UUID, link_id UUID, modulo TEXT, external_label TEXT, sinal TEXT, gravidade TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
    WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
    links AS (
        SELECT l.* FROM public.risk_links l
         WHERE (p_org IS NULL OR l.organization_id = p_org)
    ),
    uuidok AS (
        SELECT l.*, l.external_id::uuid AS ext_uuid FROM links l
         WHERE l.modulo <> 'cronograma'
           AND l.external_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    -- Cronograma: mesma regra de utils/planejamentoIndicadores (atrasada = fim < hoje e % < 100).
    SELECT l.project_risk_id, l.id, l.modulo, l.external_label,
           CASE WHEN left(COALESCE(t.e ->> 'earlyFinish', t.e ->> 'endDate'), 10) < to_char((SELECT d FROM hoje), 'YYYY-MM-DD')
                THEN 'Tarefa do cronograma atrasada'
                ELSE 'Tarefa do caminho crítico em aberto' END,
           CASE WHEN left(COALESCE(t.e ->> 'earlyFinish', t.e ->> 'endDate'), 10) < to_char((SELECT d FROM hoje), 'YYYY-MM-DD')
                THEN 'alta' ELSE 'media' END
      FROM links l
      JOIN public.projects p
        ON l.modulo = 'cronograma'
       AND (l.external_ref ->> 'planningProjectId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND p.id = (l.external_ref ->> 'planningProjectId')::uuid
      CROSS JOIN LATERAL (
          SELECT e FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(p.settings -> 'schedule' -> 'itemSchedules') = 'array'
                          THEN p.settings -> 'schedule' -> 'itemSchedules' ELSE '[]'::jsonb END) e
           WHERE e ->> 'id' = l.external_id
           LIMIT 1) t
     WHERE COALESCE(NULLIF(t.e ->> 'manualRealPct', '')::numeric, 0) < 100
       AND COALESCE((t.e ->> 'inactive')::boolean, false) = false
       AND (left(COALESCE(t.e ->> 'earlyFinish', t.e ->> 'endDate'), 10) < to_char((SELECT d FROM hoje), 'YYYY-MM-DD')
            OR COALESCE((t.e ->> 'isCritical')::boolean, false))
    UNION ALL
    SELECT u.project_risk_id, u.id, u.modulo, u.external_label,
           CASE WHEN c.end_date < (SELECT d FROM hoje) THEN 'Contrato vencido'
                ELSE 'Contrato vence em ' || (c.end_date - (SELECT d FROM hoje)) || ' dia(s)' END,
           CASE WHEN c.end_date < (SELECT d FROM hoje) THEN 'alta' ELSE 'media' END
      FROM uuidok u JOIN public.contracts c ON u.modulo = 'contrato' AND c.id = u.ext_uuid
     WHERE c.end_date IS NOT NULL
       AND c.status NOT IN ('Encerrado','Cancelado','Concluído')
       AND c.end_date <= (SELECT d FROM hoje) + 30
    UNION ALL
    SELECT u.project_risk_id, u.id, u.modulo, u.external_label,
           'Pedido com entrega atrasada (previsto ' || to_char(po.delivery_date::date, 'DD/MM/YYYY') || ')', 'alta'
      FROM uuidok u JOIN public.purchase_orders po ON u.modulo = 'pedido_compra' AND po.id = u.ext_uuid
     WHERE po.delivery_date IS NOT NULL AND po.actual_delivery_date IS NULL
       AND po.status NOT IN ('Entregue','Recebido','Cancelado')
       AND po.delivery_date::date < (SELECT d FROM hoje)
    UNION ALL
    SELECT u.project_risk_id, u.id, u.modulo, u.external_label,
           CASE WHEN nc.due_date IS NOT NULL AND nc.due_date::date < (SELECT d FROM hoje) THEN 'Não conformidade vencida'
                ELSE 'Não conformidade grave em aberto' END,
           'alta'
      FROM uuidok u JOIN public.non_conformances nc ON u.modulo = 'nao_conformidade' AND nc.id = u.ext_uuid
     WHERE nc.status <> 'closed'
       AND ((nc.due_date IS NOT NULL AND nc.due_date::date < (SELECT d FROM hoje)) OR nc.severity = 'major')
    UNION ALL
    SELECT u.project_risk_id, u.id, u.modulo, u.external_label,
           CASE WHEN d.data_validade < (SELECT d FROM hoje) THEN 'Documento vencido'
                ELSE 'Documento vence em ' || (d.data_validade - (SELECT d FROM hoje)) || ' dia(s)' END,
           CASE WHEN d.data_validade < (SELECT d FROM hoje) THEN 'alta' ELSE 'media' END
      FROM uuidok u JOIN public.opura_documents d ON u.modulo = 'documento' AND d.id = u.ext_uuid
     WHERE d.data_validade IS NOT NULL
       AND COALESCE(d.categoria, '') <> 'normas'
       AND COALESCE(d.status, '') <> 'arquivado'
       AND d.data_validade <= (SELECT d FROM hoje) + COALESCE(d.alerta_dias_antecedencia, 30);
$$;

CREATE OR REPLACE FUNCTION public.fn_risk_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_hoje     DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_rec      RECORD;
    v_email    TEXT;
    v_created  INTEGER := 0;
BEGIN
    FOR v_rec IN
        -- 1. Ação vencida: um aviso para o responsável e outro para o dono (se for outra pessoa).
        SELECT 'risco_acao_vencida'::TEXT AS tipo, r.organization_id, r.id AS risk_id, u.user_id,
               'Ação de risco vencida: ' || r.codigo AS titulo,
               '"' || left(a.descricao, 120) || '" (' || r.titulo || ') venceu em ' ||
                   to_char(a.prazo, 'DD/MM/YYYY') || '.' AS mensagem
          FROM public.risk_actions a
          JOIN public.project_risks r ON r.id = a.project_risk_id
          CROSS JOIN LATERAL (SELECT DISTINCT x AS user_id
                                FROM unnest(ARRAY[a.responsavel_user_id, r.owner_user_id]) AS x) u
         WHERE a.status IN ('planejada','em_andamento')
           AND a.prazo < v_hoje
           AND r.status NOT IN ('materializado','encerrado')
        UNION ALL
        -- 2. Revisão vencida.
        SELECT 'risco_revisao_vencida', r.organization_id, r.id, r.owner_user_id,
               'Revisão de risco vencida: ' || r.codigo,
               '"' || r.titulo || '" deveria ter sido revisado em ' || to_char(r.proxima_revisao, 'DD/MM/YYYY') || '.'
          FROM public.project_risks r
         WHERE r.status NOT IN ('materializado','encerrado')
           AND r.proxima_revisao < v_hoje
        UNION ALL
        -- 3. Crítico sem plano.
        SELECT 'risco_critico_sem_plano', r.organization_id, r.id, r.owner_user_id,
               'Risco crítico sem plano de ação: ' || r.codigo,
               '"' || r.titulo || '" é crítico' ||
                   CASE WHEN r.gatilho_critico THEN ' (gatilho: ' || COALESCE(r.gatilho_motivo, 'segurança/estabilidade/legal') || ')'
                        ELSE ' (pontuação ' || COALESCE(r.residual_pontuacao, r.inerente_pontuacao) || ')' END ||
                   ' e não tem nenhuma ação de tratamento.'
          FROM public.project_risks r
          LEFT JOIN public.risk_matrix_config m ON m.organization_id = r.organization_id
         WHERE r.status NOT IN ('materializado','encerrado')
           AND (r.gatilho_critico
                OR COALESCE(r.residual_pontuacao, r.inerente_pontuacao, 0) >= COALESCE(m.limite_critico, 20))
           AND NOT EXISTS (SELECT 1 FROM public.risk_actions a
                            WHERE a.project_risk_id = r.id AND a.status <> 'cancelada')
        UNION ALL
        -- 5. Sinal num objeto vinculado (F2.5, 15/11/2026): um aviso por risco/dia, com o sinal mais grave.
        SELECT x.tipo, x.organization_id, x.risk_id, x.user_id, x.titulo, x.mensagem FROM (
            SELECT DISTINCT ON (r.id) 'risco_sinal_vinculo'::TEXT AS tipo, r.organization_id, r.id AS risk_id,
                   r.owner_user_id AS user_id,
                   'Sinal no risco ' || r.codigo || ': ' || s.sinal AS titulo,
                   '"' || r.titulo || '" — ' || s.sinal || ' (' || COALESCE(s.external_label, s.modulo) || ').' AS mensagem
              FROM public.fn_risk_sinais(NULL) s
              JOIN public.project_risks r ON r.id = s.project_risk_id
             WHERE r.status NOT IN ('materializado','encerrado')
             ORDER BY r.id, (s.gravidade = 'alta') DESC) x
    LOOP
        SELECT COALESCE(
                   (SELECT om.email FROM public.organization_members om
                     WHERE om.organization_id = v_rec.organization_id AND om.user_id = v_rec.user_id
                       AND om.email IS NOT NULL LIMIT 1),
                   (SELECT au.email FROM auth.users au WHERE au.id = v_rec.user_id))
          INTO v_email;
        CONTINUE WHEN v_email IS NULL;

        IF EXISTS (
            SELECT 1 FROM public.notifications n
             WHERE lower(n.recipient_email) = lower(v_email)
               AND n.type = v_rec.tipo
               AND n.link = '/riscos?riskId=' || v_rec.risk_id
               AND (n.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE = v_hoje
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.notifications (recipient_email, title, message, link, type, organization_id)
        VALUES (v_email, v_rec.titulo, v_rec.mensagem, '/riscos?riskId=' || v_rec.risk_id, v_rec.tipo, v_rec.organization_id);
        v_created := v_created + 1;
    END LOOP;

    RETURN v_created;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS, grants e REVOKE
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.risk_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_links            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_project_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS risk_events_org ON public.risk_events;
CREATE POLICY risk_events_org ON public.risk_events FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()))
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));
DROP POLICY IF EXISTS risk_links_org ON public.risk_links;
CREATE POLICY risk_links_org ON public.risk_links FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()))
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));
DROP POLICY IF EXISTS risk_project_profiles_org ON public.risk_project_profiles;
CREATE POLICY risk_project_profiles_org ON public.risk_project_profiles FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()))
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

REVOKE ALL ON TABLE public.risk_events           FROM anon;
REVOKE ALL ON TABLE public.risk_events           FROM PUBLIC;
REVOKE ALL ON TABLE public.risk_links            FROM anon;
REVOKE ALL ON TABLE public.risk_links            FROM PUBLIC;
REVOKE ALL ON TABLE public.risk_project_profiles FROM anon;
REVOKE ALL ON TABLE public.risk_project_profiles FROM PUBLIC;
REVOKE TRUNCATE ON TABLE public.risk_events, public.risk_links, public.risk_project_profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.risk_events           TO authenticated;
GRANT SELECT, INSERT, DELETE         ON TABLE public.risk_links            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.risk_project_profiles TO authenticated;
REVOKE UPDATE ON TABLE public.risk_links FROM authenticated;

REVOKE ALL ON FUNCTION public.risk_events_preparar()     FROM anon;
REVOKE ALL ON FUNCTION public.risk_events_preparar()     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.risk_events_materializar() FROM anon;
REVOKE ALL ON FUNCTION public.risk_events_materializar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_risk_sinais(UUID)       FROM anon;
REVOKE ALL ON FUNCTION public.fn_risk_sinais(UUID)       FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_risk_sinais(UUID)    TO authenticated;
-- fn_alcada_aprovadores / fn_alcada_trava_passo: mantêm os grants que já tinham (CREATE OR REPLACE não mexe);
-- reafirma o fechamento para anon (REGRA #7) sem mudar o resto.
REVOKE ALL ON FUNCTION public.fn_alcada_aprovadores(uuid, text, numeric, integer) FROM anon;
REVOKE ALL ON FUNCTION public.fn_alcada_aprovadores(uuid, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_alcada_aprovadores(uuid, text, numeric, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_alcada_trava_passo() FROM anon;
REVOKE ALL ON FUNCTION public.fn_alcada_trava_passo() FROM PUBLIC;
-- fn_risk_alerts: só o cron (recriada acima com o ramo novo).
REVOKE ALL ON FUNCTION public.fn_risk_alerts() FROM anon;
REVOKE ALL ON FUNCTION public.fn_risk_alerts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_risk_alerts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_risk_alerts() TO service_role;
