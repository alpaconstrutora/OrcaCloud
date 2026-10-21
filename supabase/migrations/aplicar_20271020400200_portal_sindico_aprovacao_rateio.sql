-- ============================================================================
-- Portal do Síndico — F3: aprovação do rateio (prestação de contas)
--
-- Plano: docs/planos/2026-10-20-portal-do-sindico.md (F3).
-- Depende da F1/F2 (aplicar_20271020400000 / 400100).
--
-- Decisões do usuário (20/10/2026):
--  - a aprovação TRAVA o fechamento só quando o condomínio pede
--    (`empreendimentos.rateio_exige_aprovacao_sindico`, desligado por padrão —
--    o 010 e o 007 já operam sem ela);
--  - aprovar/devolver exige LOGIN (modo 'sessao' do resolver): o link sem senha
--    pode ser encaminhado, e aprovar é ato de prestação de contas.
--
-- A aprovação vale para o rateio COMO ESTAVA: `fn_rateio_assinatura` resume
-- valores por unidade e despesas, e o gatilho recusa fechar se o rateio mudou
-- depois de aprovado. A DESCRIÇÃO fica fora da assinatura de propósito:
-- `condominioRateioService.fechar()` congela as descrições logo antes do
-- UPDATE de status — com ela dentro, todo fechamento invalidaria a aprovação.
--
-- REGRA #7: REVOKE junto de cada função; autorização dentro das DEFINER.
-- ============================================================================

-- ── 1. Colunas da aprovação ─────────────────────────────────────────────────
ALTER TABLE public.condominio_rateios
    ADD COLUMN IF NOT EXISTS aprovacao_status text,
    ADD COLUMN IF NOT EXISTS aprovacao_em timestamptz,
    ADD COLUMN IF NOT EXISTS aprovacao_por_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS aprovacao_por_nome text,
    ADD COLUMN IF NOT EXISTS aprovacao_observacao text,
    ADD COLUMN IF NOT EXISTS aprovacao_assinatura text;

DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'condominio_rateios_aprovacao_status_check') THEN
        ALTER TABLE public.condominio_rateios
            ADD CONSTRAINT condominio_rateios_aprovacao_status_check
            CHECK (aprovacao_status IS NULL OR aprovacao_status IN ('APROVADO', 'DEVOLVIDO'));
    END IF;
END
$do$;

COMMENT ON COLUMN public.condominio_rateios.aprovacao_status IS
    'Decisão do síndico no Portal do Síndico: APROVADO | DEVOLVIDO; NULL = aguardando. Histórico em condominio_rateio_decisoes.';
COMMENT ON COLUMN public.condominio_rateios.aprovacao_assinatura IS
    'fn_rateio_assinatura no momento da decisão — se o rateio mudar depois, a aprovação fica desatualizada.';

ALTER TABLE public.empreendimentos
    ADD COLUMN IF NOT EXISTS rateio_exige_aprovacao_sindico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.empreendimentos.rateio_exige_aprovacao_sindico IS
    'Fechar rateio exige aprovação do síndico vigente (gatilho trg_rateio_exige_aprovacao). Desligado por padrão.';

-- ── 2. Trilha das decisões (prestação de contas não se sobrescreve) ────────
CREATE TABLE IF NOT EXISTS public.condominio_rateio_decisoes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rateio_id        uuid NOT NULL REFERENCES public.condominio_rateios(id) ON DELETE CASCADE,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    decisao          text NOT NULL CHECK (decisao IN ('APROVADO', 'DEVOLVIDO')),
    observacao       text,
    client_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
    nome             text,
    assinatura       text,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_condominio_rateio_decisoes_rateio ON public.condominio_rateio_decisoes (rateio_id, created_at);

ALTER TABLE public.condominio_rateio_decisoes ENABLE ROW LEVEL SECURITY;
-- Só leitura para a equipe; quem grava é a RPC do síndico (DEFINER).
DROP POLICY IF EXISTS condominio_rateio_decisoes_membro_le ON public.condominio_rateio_decisoes;
CREATE POLICY condominio_rateio_decisoes_membro_le ON public.condominio_rateio_decisoes
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- ── 3. Assinatura do rateio (INVOKER: a RLS de quem chama vale) ────────────
CREATE OR REPLACE FUNCTION public.fn_rateio_assinatura(p_rateio_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT md5(
        coalesce((SELECT string_agg(coalesce(it.unit_id::text, '-') || ':' || it.valor::text, ',' ORDER BY it.unit_id, it.valor)
                    FROM public.condominio_rateio_itens it WHERE it.rateio_id = p_rateio_id), '')
        || '|' ||
        coalesce((SELECT string_agg(d.id::text || ':' || d.valor::text, ',' ORDER BY d.id)
                    FROM public.condominio_rateio_despesas d WHERE d.rateio_id = p_rateio_id), '')
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_rateio_assinatura(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_rateio_assinatura(uuid) TO authenticated;

-- Para a equipe saber, na lista, se a aprovação ainda vale (RLS de quem chama).
CREATE OR REPLACE FUNCTION public.fn_rateio_aprovacao_desatualizada(p_ids uuid[])
RETURNS TABLE (rateio_id uuid, desatualizada boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT r.id, r.aprovacao_assinatura IS NOT NULL AND r.aprovacao_assinatura <> public.fn_rateio_assinatura(r.id)
      FROM public.condominio_rateios r
     WHERE r.id = ANY (p_ids);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_rateio_aprovacao_desatualizada(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_rateio_aprovacao_desatualizada(uuid[]) TO authenticated;

-- ── 4. Gatilho: fechar exige aprovação (quando o condomínio pede) ──────────
-- Espelho TS (para o botão dizer o motivo antes): utils/aprovacaoRateio.ts.
CREATE OR REPLACE FUNCTION public.fn_rateio_exige_aprovacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_e public.empreendimentos;
BEGIN
    SELECT * INTO v_e FROM public.empreendimentos WHERE id = NEW.empreendimento_id;
    IF NOT coalesce(v_e.rateio_exige_aprovacao_sindico, false) THEN
        RETURN NEW;
    END IF;
    IF v_e.sindico_client_id IS NULL
       OR NOT (v_e.id IN (SELECT public.fn_sindico_predios(v_e.sindico_client_id))) THEN
        RAISE EXCEPTION 'Este condomínio exige a aprovação do síndico, mas não há síndico com mandato vigente. Defina o síndico na Ficha ou desligue a exigência.'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.aprovacao_status IS DISTINCT FROM 'APROVADO' THEN
        RAISE EXCEPTION 'O síndico ainda não aprovou este rateio (Portal do Síndico › Prestação de contas).'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.aprovacao_por_client_id IS DISTINCT FROM v_e.sindico_client_id THEN
        RAISE EXCEPTION 'A aprovação é do síndico anterior: peça a aprovação do síndico atual.'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.aprovacao_assinatura IS DISTINCT FROM public.fn_rateio_assinatura(NEW.id) THEN
        RAISE EXCEPTION 'O rateio mudou depois da aprovação do síndico: peça uma nova aprovação.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_rateio_exige_aprovacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rateio_exige_aprovacao ON public.condominio_rateios;
CREATE TRIGGER trg_rateio_exige_aprovacao
    BEFORE UPDATE OF status ON public.condominio_rateios
    FOR EACH ROW
    WHEN (NEW.status = 'FECHADO' AND OLD.status IS DISTINCT FROM 'FECHADO')
    EXECUTE FUNCTION public.fn_rateio_exige_aprovacao();

-- ── 5. Payload com a aprovação ──────────────────────────────────────────────
-- Corpo da F2 (aplicar_20271020400100) + as seções marcadas "(F3)".
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
                'mandatoFim', e.sindico_mandato_fim,
                -- (F3) fechar rateio exige a aprovação do síndico?
                'exigeAprovacao', e.rateio_exige_aprovacao_sindico)
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
                -- (F3) A decisão do síndico sobre este rateio. `desatualizada` =
                -- o rateio mudou depois da decisão (a assinatura não bate).
                'aprovacao', jsonb_build_object(
                    'status', r.aprovacao_status,
                    'em', r.aprovacao_em,
                    'porNome', r.aprovacao_por_nome,
                    'observacao', r.aprovacao_observacao,
                    'desatualizada', r.aprovacao_assinatura IS NOT NULL
                                     AND r.aprovacao_assinatura <> public.fn_rateio_assinatura(r.id)),
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

-- ── 6. Aprovar / devolver (só com LOGIN) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_decidir_rateio(
    p_token text, p_client_id uuid, p_rateio_id uuid, p_decisao text, p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r    jsonb;
    v_cli  uuid;
    v_nome text;
    v_rat  public.condominio_rateios;
    v_obs  text := nullif(btrim(coalesce(p_observacao, '')), '');
    v_ass  text;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'sessao');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := coalesce(v_r ->> 'nome', '');

    SELECT * INTO v_rat FROM public.condominio_rateios
     WHERE id = p_rateio_id
       AND empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli));
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Rateio não encontrado nos seus condomínios.');
    END IF;
    IF v_rat.status <> 'RASCUNHO' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só rateio em aberto (rascunho) pode ser aprovado ou devolvido.');
    END IF;
    IF p_decisao NOT IN ('APROVADO', 'DEVOLVIDO') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Decisão inválida.');
    END IF;
    IF p_decisao = 'DEVOLVIDO' AND v_obs IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Ao devolver, diga o que precisa ser revisto.');
    END IF;

    v_ass := public.fn_rateio_assinatura(v_rat.id);

    UPDATE public.condominio_rateios
       SET aprovacao_status = p_decisao, aprovacao_em = now(),
           aprovacao_por_client_id = v_cli, aprovacao_por_nome = v_nome,
           aprovacao_observacao = v_obs, aprovacao_assinatura = v_ass
     WHERE id = v_rat.id;

    INSERT INTO public.condominio_rateio_decisoes
        (rateio_id, organization_id, decisao, observacao, client_id, nome, assinatura)
    VALUES
        (v_rat.id, v_rat.organization_id, p_decisao, v_obs, v_cli, v_nome, v_ass);

    RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_decidir_rateio(text, uuid, uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_decidir_rateio(text, uuid, uuid, text, text) TO anon, authenticated;

-- ── Contadores de conferência (rodar depois de aplicar) ─────────────────────
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_name = 'condominio_rateios' AND column_name LIKE 'aprovacao_%') AS colunas,  -- 6
--   (SELECT count(*) FROM information_schema.columns WHERE table_name = 'empreendimentos' AND column_name = 'rateio_exige_aprovacao_sindico') AS exige, -- 1
--   (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_rateio_exige_aprovacao') AS gatilho,                                                           -- 1
--   (SELECT count(*) FROM empreendimentos WHERE rateio_exige_aprovacao_sindico) AS ligados;                                                             -- 0
