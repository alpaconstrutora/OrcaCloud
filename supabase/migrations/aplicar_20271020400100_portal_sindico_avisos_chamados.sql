-- ============================================================================
-- Portal do Síndico — F2: publicar avisos e tratar os chamados dos moradores
--
-- Plano: docs/planos/2026-10-20-portal-do-sindico.md (F2).
-- Depende da F1 (aplicar_20271020400000): fn_sindico_resolver/fn_sindico_predios.
--
-- Escrita do síndico = RPC SECURITY DEFINER no modo 'escrever' do resolver:
-- token ativo OU o próprio síndico logado — NUNCA membro da organização. A
-- equipe publica aviso pela aba Comunicação e trata chamado pelo admin; ela não
-- age em nome do síndico pela tela de prévia.
--
-- REGRA #7: REVOKE junto de cada função; autorização dentro delas.
-- ============================================================================

-- ── 1. Autoria do aviso ─────────────────────────────────────────────────────
-- `publicado_por` (texto livre) continua sendo o que o mural mostra; a coluna
-- nova diz QUEM, para o síndico só encerrar os avisos que ele publicou.
ALTER TABLE public.condominio_avisos
    ADD COLUMN IF NOT EXISTS publicado_por_sindico_client_id uuid
        REFERENCES public.clients(id) ON DELETE SET NULL;

-- ── 2. Histórico do chamado ─────────────────────────────────────────────────
-- `client_requests.admin_notes` é UM campo, sobrescrito a cada edição: não
-- serve de conversa. Cada resposta ou troca de status vira um evento.
CREATE TABLE IF NOT EXISTS public.client_request_eventos (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id       uuid NOT NULL REFERENCES public.client_requests(id) ON DELETE CASCADE,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    autor_tipo       text NOT NULL CHECK (autor_tipo IN ('EQUIPE', 'SINDICO', 'MORADOR', 'SISTEMA')),
    autor_client_id  uuid REFERENCES public.clients(id) ON DELETE SET NULL,
    autor_nome       text,
    mensagem         text,
    status_anterior  text,
    status_novo      text,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_request_eventos_request ON public.client_request_eventos (request_id, created_at);

COMMENT ON TABLE public.client_request_eventos IS
    'Histórico de um chamado (client_requests): respostas e trocas de status, com o autor (equipe, síndico, morador). Portal do Síndico F2, 20/10/2026.';

ALTER TABLE public.client_request_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_request_eventos_membro_le ON public.client_request_eventos;
CREATE POLICY client_request_eventos_membro_le ON public.client_request_eventos
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS client_request_eventos_membro_grava ON public.client_request_eventos;
CREATE POLICY client_request_eventos_membro_grava ON public.client_request_eventos
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

-- ── 3. Payload do síndico com chamados (e a marca "meu" nos avisos) ─────────
-- Corpo da F1 (aplicar_20271020400000) + as duas seções marcadas "(F2)".
CREATE OR REPLACE FUNCTION public.fn_sindico_payload(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH predios AS (
        SELECT public.fn_sindico_predios(p_client_id) AS empreendimento_id
    ),
    unidades AS (
        SELECT u.id AS unit_id, u.name AS unit_name, u.floor, u.private_area,
               u.typology, u.fracao_ideal_decimal, u.fracao_ideal_origem,
               t.name AS tower_name,
               e.id AS empreendimento_id, e.code AS condominio_code,
               e.name AS condominio_name, e.condominio_cnpj
          FROM public.empreendimento_units  u
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
          JOIN public.empreendimentos       e ON e.id = t.empreendimento_id
         WHERE e.id IN (SELECT empreendimento_id FROM predios)
    )
    SELECT jsonb_build_object(
        'ok', true,
        'sindico', (SELECT jsonb_build_object('clientId', c.id, 'nome', c.name, 'email', c.email)
                      FROM public.clients c WHERE c.id = p_client_id),
        'condominios', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', e.id,
                'codigo', e.code,
                'nome', e.name,
                'cnpj', e.condominio_cnpj,
                'razaoSocial', e.condominio_razao_social,
                'cidade', e.endereco_city,
                'mandatoInicio', e.sindico_mandato_inicio,
                'mandatoFim', e.sindico_mandato_fim)
                ORDER BY e.name)
              FROM public.empreendimentos e
             WHERE e.id IN (SELECT empreendimento_id FROM predios)), '[]'::jsonb),
        'unidades', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unitId',        m.unit_id,
                'unidade',       m.unit_name,
                'torre',         m.tower_name,
                'pavimento',     m.floor,
                'tipologia',     m.typology,
                'areaPrivativa', m.private_area,
                'fracaoIdeal',   m.fracao_ideal_decimal,
                'fracaoOrigem',  m.fracao_ideal_origem,
                -- Os papéis do PRÓPRIO síndico nesta unidade (vazio quando ele
                -- não mora ali) — o formato é o de PortalUnidadeCondominio.
                'papeis', COALESCE((
                    SELECT to_jsonb(ARRAY_AGG(DISTINCT o1.role ORDER BY o1.role))
                      FROM public.unit_occupancies o1
                     WHERE o1.unit_id = m.unit_id AND o1.client_id = p_client_id
                       AND o1.ended_at IS NULL), '[]'::jsonb),
                'condominioId',   m.empreendimento_id,
                'condominioCode', m.condominio_code,
                'condominioNome', m.condominio_name,
                'condominioCnpj', m.condominio_cnpj,
                'ocupacoes', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                               'papel', o2.role, 'nome', c2.name, 'clientId', c2.id,
                               'email', c2.email, 'telefone', c2.phone,
                               'desde', o2.started_at)
                               ORDER BY o2.role, c2.name)
                      FROM public.unit_occupancies o2
                      JOIN public.clients c2 ON c2.id = o2.client_id
                     WHERE o2.unit_id = m.unit_id AND o2.ended_at IS NULL), '[]'::jsonb)
            ) ORDER BY m.condominio_name, m.tower_name, m.unit_name)
            FROM unidades m), '[]'::jsonb),
        'avisos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', av.id, 'titulo', av.titulo, 'corpo', av.corpo,
                'categoria', av.categoria, 'publicadoEm', av.publicado_em,
                'publicadoPor', av.publicado_por, 'validoAte', av.valido_ate,
                'vigente', av.valido_ate IS NULL
                           OR av.valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date,
                'condominioId', av.empreendimento_id,
                'condominioNome', e2.name,
                'leituras', (SELECT count(*) FROM public.condominio_aviso_leituras l
                              WHERE l.aviso_id = av.id),
                -- Publicado pelo próprio síndico (F2): só esses ele pode encerrar.
                'meu', av.publicado_por_sindico_client_id IS NOT DISTINCT FROM p_client_id,
                'lido', EXISTS (SELECT 1 FROM public.condominio_aviso_leituras l
                                 WHERE l.aviso_id = av.id AND l.client_id = p_client_id))
                ORDER BY av.publicado_em DESC)
              FROM public.condominio_avisos av
              JOIN public.empreendimentos e2 ON e2.id = av.empreendimento_id
             WHERE av.empreendimento_id IN (SELECT empreendimento_id FROM predios)), '[]'::jsonb),
        'documentos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', d.id, 'titulo', d.titulo, 'categoria', d.categoria,
                'url', d.url, 'descricao', d.descricao,
                'visivelPortal', d.visivel_portal,
                'condominioNome', e3.name)
                ORDER BY d.categoria, d.titulo)
              FROM public.condominio_documentos d
              JOIN public.empreendimentos e3 ON e3.id = d.empreendimento_id
             WHERE d.empreendimento_id IN (SELECT empreendimento_id FROM predios)), '[]'::jsonb),
        'manutencao', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', i.id,
                'descricao', i.description,
                'sistema', bs.name,
                'periodicidadeValor', i.periodicity_value,
                'periodicidadeUnidade', i.periodicity_unit,
                'ultimaExecucao', i.last_executed_at,
                'proximoVencimento', i.next_due_date,
                'responsavel', i.responsible_type,
                'condominioNome', e4.name)
                ORDER BY i.next_due_date NULLS LAST, i.description)
              FROM public.maintenance_plan_items i
              JOIN public.maintenance_plans p ON p.id = i.plan_id
              JOIN public.empreendimentos   e4 ON e4.id = p.empreendimento_id
              LEFT JOIN public.building_systems bs ON bs.id = i.building_system_id
             WHERE p.empreendimento_id IN (SELECT empreendimento_id FROM predios)
               AND p.status = 'VIGENTE'
               AND i.is_active), '[]'::jsonb),
        'ordens', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', o.id,
                'codigo', o.code,
                'descricao', o.description,
                'sistema', bs2.name,
                'tipo', o.type,
                'prioridade', o.priority,
                'situacao', o.status,
                'agendadaPara', o.scheduled_date,
                'executadaEm', o.executed_date,
                'custo', o.cost,
                'condominioNome', e5.name)
                ORDER BY COALESCE(o.executed_date, o.scheduled_date) DESC NULLS LAST)
              FROM public.maintenance_orders o
              JOIN public.empreendimentos e5 ON e5.id = o.empreendimento_id
              LEFT JOIN public.building_systems bs2 ON bs2.id = o.building_system_id
             WHERE o.empreendimento_id IN (SELECT empreendimento_id FROM predios)), '[]'::jsonb),
        'ativos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id,
                'nome', a.name,
                'codigo', a.code,
                'categoria', a.category,
                'subcategoria', a.subcategory,
                'marca', a.brand,
                'modelo', a.model,
                'numeroSerie', a.serial_number,
                'localizacao', a.location,
                'situacao', a.status,
                'sistema', bs3.name,
                'dataAquisicao', a.purchase_date,
                'valorAquisicao', a.purchase_value,
                'vidaUtilMeses', a.useful_life_months,
                'valorResidual', a.residual_value,
                'observacoes', a.notes,
                'imagemUrl', a.image_url,
                'garantiaAte', a.supplier_warranty_until,
                'condominioNome', e6.name)
                ORDER BY a.name)
              FROM public.opura_assets a
              JOIN public.empreendimentos e6 ON e6.id = a.empreendimento_id
              LEFT JOIN public.building_systems bs3 ON bs3.id = a.building_system_id
             WHERE a.empreendimento_id IN (SELECT empreendimento_id FROM predios)), '[]'::jsonb),
        -- ── Chamados dos moradores (F2) ─────────────────────────────────────
        -- Recorte pela UNIDADE do prédio, não pela pessoa: chamado é da unidade
        -- (decisão da 000023), e o síndico precisa ver o vazamento aberto pelo
        -- morador anterior. Chamado sem `unit_id` não entra — não há como saber
        -- de que prédio é.
        'chamados', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id,
                'titulo', r.title,
                'descricao', r.description,
                'categoria', r.category,
                'prioridade', r.priority,
                'status', r.status,
                'abertoEm', r.opened_at,
                'resolvidoEm', r.resolved_at,
                'notaDaEquipe', r.admin_notes,
                'unitId', r.unit_id,
                'unidade', u.name,
                'torre', tw.name,
                'morador', c.name,
                'moradorEmail', c.email,
                'moradorTelefone', c.phone,
                'condominioId', e.id,
                'condominioNome', e.name,
                'eventos', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                               'autorTipo', ev.autor_tipo, 'autorNome', ev.autor_nome,
                               'mensagem', ev.mensagem, 'statusAnterior', ev.status_anterior,
                               'statusNovo', ev.status_novo, 'criadoEm', ev.created_at)
                           ORDER BY ev.created_at)
                      FROM public.client_request_eventos ev
                     WHERE ev.request_id = r.id), '[]'::jsonb))
                ORDER BY (r.status IN ('Resolvido', 'Cancelado')), r.opened_at DESC, r.created_at DESC)
              FROM public.client_requests r
              JOIN public.empreendimento_units  u  ON u.id = r.unit_id
              JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
              JOIN public.empreendimentos       e  ON e.id = tw.empreendimento_id
              LEFT JOIN public.clients c ON c.id = r.client_id
             WHERE e.id IN (SELECT empreendimento_id FROM predios)), '[]'::jsonb),
        'rateios', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id,
                'numero', r.number,
                'competencia', r.competencia,
                'tipo', r.tipo,
                'criterio', r.criterio,
                'status', r.status,
                'totalDespesas', r.total_despesas,
                'totalRateado', r.total_rateado,
                'fechadoEm', r.fechado_em,
                'condominioId', r.empreendimento_id,
                'condominioNome', e7.name,
                'despesas', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                               'id', d2.id, 'descricao', d2.descricao, 'valor', d2.valor,
                               'fornecedorCadastrado', s2.name,
                               'fornecedorCru', COALESCE(t2.party_name, t2.entity_name))
                           ORDER BY d2.valor DESC)
                      FROM public.condominio_rateio_despesas d2
                      LEFT JOIN public.internal_transactions t2 ON t2.id = d2.transaction_id
                      LEFT JOIN public.suppliers s2 ON s2.id = t2.supplier_id
                     WHERE d2.rateio_id = r.id), '[]'::jsonb),
                'cotas', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                               'id', it.id,
                               'unitId', it.unit_id,
                               'unidade', u2.name,
                               'torre', tw2.name,
                               'pessoa', c3.name,
                               'peso', it.peso,
                               'valor', it.valor,
                               'ajusteManual', it.ajuste_manual,
                               'minha', it.client_id = p_client_id,
                               -- Situação do título da cota (inadimplência).
                               -- Sem `transaction_id` a cota ainda não foi
                               -- cobrada: a tela diz isso, não "em aberto".
                               -- "Pago" é decidido no cliente por
                               -- utils/situacaoDaCota.tituloEstaPago (status
                               -- CONCILIATED ou business_status RECEBIDO/PAGO),
                               -- a mesma regra de Contas a Receber.
                               'tituloStatus', tx.status,
                               'tituloNegocio', tx.business_status,
                               'vencimento', tx.due_date,
                               'pagoEm', tx.payment_date)
                           ORDER BY tw2.name, u2.name)
                      FROM public.condominio_rateio_itens it
                      LEFT JOIN public.empreendimento_units  u2  ON u2.id = it.unit_id
                      LEFT JOIN public.empreendimento_towers tw2 ON tw2.id = u2.tower_id
                      LEFT JOIN public.clients c3 ON c3.id = it.client_id
                      LEFT JOIN public.internal_transactions tx ON tx.id = it.transaction_id
                     WHERE it.rateio_id = r.id), '[]'::jsonb))
                ORDER BY r.competencia DESC, r.number DESC)
              FROM public.condominio_rateios r
              JOIN public.empreendimentos e7 ON e7.id = r.empreendimento_id
             WHERE r.empreendimento_id IN (SELECT empreendimento_id FROM predios)
               AND r.status <> 'CANCELADO'), '[]'::jsonb)
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_sindico_payload(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Publicar aviso ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_publicar_aviso(
    p_token text, p_client_id uuid, p_empreendimento_id uuid,
    p_titulo text, p_corpo text, p_categoria text, p_valido_ate date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r   jsonb;
    v_cli uuid;
    v_org uuid;
    v_id  uuid;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'escrever');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;

    IF NOT (p_empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli))) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Você não é síndico deste condomínio.');
    END IF;
    IF coalesce(btrim(p_titulo), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o título do aviso.');
    END IF;
    IF p_categoria NOT IN ('AVISO', 'URGENTE', 'MANUTENCAO', 'ASSEMBLEIA', 'OBRA') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Categoria inválida.');
    END IF;
    IF p_valido_ate IS NOT NULL AND p_valido_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'A validade não pode ser anterior a hoje.');
    END IF;

    SELECT organization_id INTO v_org FROM public.empreendimentos WHERE id = p_empreendimento_id;

    INSERT INTO public.condominio_avisos
        (empreendimento_id, organization_id, titulo, corpo, categoria, valido_ate,
         publicado_em, publicado_por, publicado_por_sindico_client_id)
    VALUES
        (p_empreendimento_id, v_org, btrim(p_titulo), nullif(btrim(coalesce(p_corpo, '')), ''), p_categoria, p_valido_ate,
         now(), 'Síndico — ' || coalesce(v_r ->> 'nome', ''), v_cli)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_publicar_aviso(text, uuid, uuid, text, text, text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_publicar_aviso(text, uuid, uuid, text, text, text, date) TO anon, authenticated;

-- ── 5. Encerrar aviso (só os dele; não apaga — as leituras ficam) ──────────
CREATE OR REPLACE FUNCTION public.sindico_portal_encerrar_aviso(p_token text, p_client_id uuid, p_aviso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r   jsonb;
    v_cli uuid;
    v_n   integer;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'escrever');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;

    UPDATE public.condominio_avisos
       SET valido_ate = (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1, updated_at = now()
     WHERE id = p_aviso_id
       AND publicado_por_sindico_client_id = v_cli
       AND empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só é possível encerrar avisos que você publicou.');
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_encerrar_aviso(text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_encerrar_aviso(text, uuid, uuid) TO anon, authenticated;

-- ── 6. Responder / mudar status de chamado ──────────────────────────────────
-- Não toca `admin_notes` (é da equipe). O morador fica sabendo pelo mesmo canal
-- que a equipe já usa (`client_portal_messages`, type status_update).
CREATE OR REPLACE FUNCTION public.sindico_portal_responder_chamado(
    p_token text, p_client_id uuid, p_request_id uuid, p_mensagem text, p_novo_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_req    public.client_requests;
    v_msg    text := nullif(btrim(coalesce(p_mensagem, '')), '');
    v_status text := nullif(btrim(coalesce(p_novo_status, '')), '');
    v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'escrever');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := 'Síndico — ' || coalesce(v_r ->> 'nome', '');

    SELECT r.* INTO v_req
      FROM public.client_requests r
      JOIN public.empreendimento_units  u  ON u.id = r.unit_id
      JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
     WHERE r.id = p_request_id
       AND tw.empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli));
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Chamado não encontrado nos seus condomínios.');
    END IF;

    IF v_status IS NOT NULL AND v_status NOT IN ('Aberto', 'Em Andamento', 'Aguardando', 'Resolvido', 'Cancelado') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Situação inválida.');
    END IF;
    IF v_status = v_req.status THEN v_status := NULL; END IF;
    IF v_msg IS NULL AND v_status IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Escreva uma resposta ou mude a situação.');
    END IF;

    IF v_status IS NOT NULL THEN
        UPDATE public.client_requests
           SET status = v_status,
               resolved_at = CASE WHEN v_status = 'Resolvido' THEN v_hoje ELSE NULL END,
               updated_at = now()
         WHERE id = v_req.id;
    END IF;

    INSERT INTO public.client_request_eventos
        (request_id, organization_id, autor_tipo, autor_client_id, autor_nome, mensagem, status_anterior, status_novo)
    VALUES
        (v_req.id, v_req.organization_id, 'SINDICO', v_cli, v_nome, v_msg,
         CASE WHEN v_status IS NOT NULL THEN v_req.status END, v_status);

    INSERT INTO public.client_portal_messages
        (organization_id, client_id, sender_name, type, title, body, reference_type, reference_id)
    VALUES
        (v_req.organization_id, v_req.client_id, v_nome, 'status_update',
         CASE WHEN v_status IS NOT NULL THEN 'Chamado atualizado: ' || v_status ELSE 'Resposta do síndico' END,
         'Seu chamado "' || v_req.title || '"'
           || CASE WHEN v_status IS NOT NULL THEN ' foi atualizado para: ' || v_status || '.' ELSE ' recebeu uma resposta.' END
           || CASE WHEN v_msg IS NOT NULL THEN chr(10) || chr(10) || v_msg ELSE '' END,
         'chamado', v_req.id);

    RETURN jsonb_build_object('ok', true, 'status', coalesce(v_status, v_req.status));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_responder_chamado(text, uuid, uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_responder_chamado(text, uuid, uuid, text, text) TO anon, authenticated;

-- ── Contadores de conferência (rodar depois de aplicar) ─────────────────────
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_name = 'condominio_avisos' AND column_name = 'publicado_por_sindico_client_id') AS coluna_aviso,   -- 1
--   (SELECT relrowsecurity FROM pg_class WHERE relname = 'client_request_eventos')                                                                            AS rls_eventos,    -- true
--   (SELECT count(*) FROM pg_proc WHERE proname IN ('sindico_portal_publicar_aviso','sindico_portal_encerrar_aviso','sindico_portal_responder_chamado'))       AS funcoes;        -- 3
