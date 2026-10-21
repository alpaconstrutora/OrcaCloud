-- ============================================================================
-- Portal do Síndico — F1: acesso (link + login por e-mail) e leitura do prédio
--
-- Pedido de 20/10/2026: "Vamos implementar portal do sindico em [portais >
-- portal do condominio". Plano: docs/planos/2026-10-20-portal-do-sindico.md
--
-- O síndico já existia como DADO (`empreendimentos.sindico_client_id` +
-- mandato, aba Ficha), mas nenhuma função o lia: ele via o condomínio como
-- qualquer condômino, pelo recorte de OCUPAÇÃO. Aqui o recorte passa a ser o
-- PRÉDIO onde ele é síndico com mandato vigente.
--
-- Desenho:
--  - `fn_sindico_predios` é a ÚNICA regra de mandato. Ela é recalculada a cada
--    chamada: trocar o síndico na Ficha ou deixar o mandato vencer derruba o
--    acesso antigo sem ninguém revogar nada.
--  - `fn_sindico_resolver` é a ÚNICA porta de autorização. Três modos:
--      'ler'      token ativo | e-mail do JWT = clients.email | membro da org
--                 de um dos prédios (a prévia "Ver como o síndico" do admin);
--      'escrever' token ativo | e-mail do JWT — NUNCA membro: a equipe não
--                 publica nem responde em nome do síndico;
--      'sessao'   e-mail do JWT obrigatório (aprovar rateio — F3). O link
--                 sozinho não basta, porque link se encaminha.
--  - Token em tabela própria: é credencial mais forte que a do Portal do
--    Cliente (vê o prédio inteiro, com contato dos condôminos).
--
-- REGRA #7: toda função com REVOKE na mesma migration; autorização dentro das
-- SECURITY DEFINER. Aplicar com `db query -f` (nunca db push).
-- ============================================================================

-- ── 1. Token do portal ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sindico_portal_tokens (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_id     uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
    token         text NOT NULL UNIQUE,
    expires_at    timestamptz NOT NULL DEFAULT now() + interval '90 days',
    is_active     boolean NOT NULL DEFAULT true,
    last_used_at  timestamptz,
    convidado_em  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sindico_portal_tokens IS
    'Acesso ao Portal do Síndico (/portal-sindico). Um por pessoa (clients), serve a todos os prédios onde ela é síndica com mandato vigente — a vigência é conferida a cada chamada por fn_sindico_predios, não aqui.';
COMMENT ON COLUMN public.sindico_portal_tokens.convidado_em IS
    'Último convite por e-mail (Edge Function portal-invite-user, portal = sindico).';

ALTER TABLE public.sindico_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Só leitura, e só gestor: escrita é exclusiva das RPCs abaixo e da Edge de
-- convite (service_role). Sem policy para anon.
DROP POLICY IF EXISTS sindico_portal_tokens_gestor_le ON public.sindico_portal_tokens;
CREATE POLICY sindico_portal_tokens_gestor_le ON public.sindico_portal_tokens
    FOR SELECT TO authenticated
    USING (public.is_org_manager(org_id));

-- ── 2. A regra de mandato (privada) ─────────────────────────────────────────
-- Início vazio = vigente desde sempre; fim vazio = sem prazo. "Hoje" no fuso de
-- Brasília: CURRENT_DATE é UTC e venceria o mandato às 21h da véspera.
CREATE OR REPLACE FUNCTION public.fn_sindico_predios(p_client_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT e.id
      FROM public.empreendimentos e
     WHERE e.sindico_client_id = p_client_id
       AND e.status = 'EM_OPERACAO'
       AND (e.sindico_mandato_inicio IS NULL
            OR e.sindico_mandato_inicio <= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
       AND (e.sindico_mandato_fim IS NULL
            OR e.sindico_mandato_fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_sindico_predios(uuid) FROM PUBLIC, anon, authenticated;
-- A Edge de convite confere a vigência com a MESMA regra antes de emitir.
GRANT  EXECUTE ON FUNCTION public.fn_sindico_predios(uuid) TO service_role;

-- ── 3. A porta de autorização (privada) ─────────────────────────────────────
-- Devolve { ok: true, client_id } ou { ok: false, motivo }.
CREATE OR REPLACE FUNCTION public.fn_sindico_resolver(p_token text, p_client_id uuid, p_modo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_email   text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_tok     public.sindico_portal_tokens;
    v_cli     public.clients;
    v_ehDono  boolean;
BEGIN
    IF p_modo NOT IN ('ler', 'escrever', 'sessao') THEN
        RAISE EXCEPTION 'modo_invalido' USING ERRCODE = '22023';
    END IF;

    IF p_token IS NOT NULL AND p_token <> '' THEN
        SELECT * INTO v_tok FROM public.sindico_portal_tokens
         WHERE token = p_token AND is_active AND expires_at > now();
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
        END IF;
        SELECT * INTO v_cli FROM public.clients WHERE id = v_tok.client_id;
    ELSIF p_client_id IS NOT NULL THEN
        IF auth.uid() IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Não autenticado.');
        END IF;
        SELECT * INTO v_cli FROM public.clients WHERE id = p_client_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Cadastro não encontrado.');
        END IF;
    ELSE
        RETURN jsonb_build_object('ok', false, 'motivo', 'Acesso não informado.');
    END IF;

    v_ehDono := v_email <> '' AND v_cli.email IS NOT NULL AND lower(v_cli.email) = v_email;

    IF p_modo = 'sessao' AND NOT v_ehDono THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'Para aprovar ou devolver, entre no Portal do Síndico com seu e-mail e senha.');
    END IF;

    -- Sem token: só o próprio síndico (e-mail do JWT) ou, para LER, um membro
    -- da organização de um dos prédios dele (a prévia do admin).
    IF p_token IS NULL OR p_token = '' THEN
        IF NOT v_ehDono AND NOT (
            p_modo = 'ler' AND EXISTS (
                SELECT 1 FROM public.empreendimentos e
                 WHERE e.id IN (SELECT public.fn_sindico_predios(v_cli.id))
                   AND public.is_org_member(e.organization_id))
        ) THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para ver este cadastro.');
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.fn_sindico_predios(v_cli.id)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'Seu mandato de síndico não está vigente em nenhum condomínio. Fale com a administradora.');
    END IF;

    IF v_tok.id IS NOT NULL THEN
        UPDATE public.sindico_portal_tokens SET last_used_at = now() WHERE id = v_tok.id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'client_id', v_cli.id, 'nome', v_cli.name);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_sindico_resolver(text, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── 4. Payload (privada) ────────────────────────────────────────────────────
-- Mesmas seções e o mesmo formato de `fn_condominio_payload_for_client`
-- (aplicar_20271012000020, conferida idêntica ao banco em 20/10/2026), para a
-- casca reusar os painéis da aba Condomínio do Portal do Cliente. Diferenças,
-- todas decididas pelo usuário em 20/10/2026:
--  - recorte = prédios onde é síndico (não onde ocupa);
--  - TODAS as unidades, e os ocupantes com e-mail e telefone;
--  - avisos com histórico (vencidos inclusive) e contagem de leituras;
--  - documentos internos (visivel_portal = false) também, com a marca;
--  - ordens de serviço COM custo;
--  - cotas com a situação do título (pago, em aberto, vencido).
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

-- ── 5. Leitura pública do portal (link OU login OU prévia do admin) ─────────
CREATE OR REPLACE FUNCTION public.sindico_portal_dados(p_token text DEFAULT NULL, p_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r jsonb;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN
        RETURN v_r;
    END IF;
    RETURN public.fn_sindico_payload((v_r ->> 'client_id')::uuid);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_dados(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_dados(text, uuid) TO anon, authenticated;

-- ── 6. Admin: estado do acesso do síndico de um condomínio ──────────────────
-- Membro lê o estado; o TOKEN só vai para gestor (é a mesma régua da policy).
CREATE OR REPLACE FUNCTION public.sindico_portal_estado(p_empreendimento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_e     public.empreendimentos;
    v_cli   public.clients;
    v_tok   public.sindico_portal_tokens;
    v_gestor boolean;
BEGIN
    SELECT * INTO v_e FROM public.empreendimentos WHERE id = p_empreendimento_id;
    IF NOT FOUND OR NOT public.is_org_member(v_e.organization_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio não encontrado.');
    END IF;
    v_gestor := public.is_org_manager(v_e.organization_id);

    IF v_e.sindico_client_id IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'sindico', NULL, 'podeGerir', v_gestor);
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = v_e.sindico_client_id;
    SELECT * INTO v_tok FROM public.sindico_portal_tokens WHERE client_id = v_e.sindico_client_id;

    RETURN jsonb_build_object(
        'ok', true,
        'podeGerir', v_gestor,
        'sindico', jsonb_build_object(
            'clientId', v_cli.id, 'nome', v_cli.name, 'email', v_cli.email, 'telefone', v_cli.phone,
            'mandatoInicio', v_e.sindico_mandato_inicio, 'mandatoFim', v_e.sindico_mandato_fim,
            'vigente', p_empreendimento_id IN (SELECT public.fn_sindico_predios(v_e.sindico_client_id))),
        'acesso', CASE WHEN v_tok.id IS NULL THEN NULL ELSE jsonb_build_object(
            'ativo', v_tok.is_active,
            'expiraEm', v_tok.expires_at,
            'ultimoUso', v_tok.last_used_at,
            'convidadoEm', v_tok.convidado_em,
            'token', CASE WHEN v_gestor THEN v_tok.token END) END);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_estado(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_estado(uuid) TO authenticated;

-- ── 7. Admin: gerar (ou reaproveitar) o link ────────────────────────────────
-- `p_renovar = false` devolve o token vivo se houver (Copiar link);
-- `true` troca o token e invalida o link anterior (Gerar novo link).
CREATE OR REPLACE FUNCTION public.sindico_portal_gerar_token(p_empreendimento_id uuid, p_renovar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_e   public.empreendimentos;
    v_tok public.sindico_portal_tokens;
BEGIN
    SELECT * INTO v_e FROM public.empreendimentos WHERE id = p_empreendimento_id;
    IF NOT FOUND OR NOT public.is_org_manager(v_e.organization_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só gestor da organização gera o acesso do síndico.');
    END IF;
    IF v_e.sindico_client_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Defina o síndico na Ficha do condomínio.');
    END IF;
    IF NOT (p_empreendimento_id IN (SELECT public.fn_sindico_predios(v_e.sindico_client_id))) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O mandato do síndico não está vigente (confira as datas na Ficha).');
    END IF;

    SELECT * INTO v_tok FROM public.sindico_portal_tokens WHERE client_id = v_e.sindico_client_id;

    IF v_tok.id IS NOT NULL AND v_tok.is_active AND v_tok.expires_at > now() AND NOT p_renovar THEN
        RETURN jsonb_build_object('ok', true, 'token', v_tok.token, 'expiraEm', v_tok.expires_at);
    END IF;

    INSERT INTO public.sindico_portal_tokens (org_id, client_id, token)
    VALUES (v_e.organization_id, v_e.sindico_client_id, gen_random_uuid()::text)
    ON CONFLICT (client_id) DO UPDATE
       SET token = EXCLUDED.token, is_active = true,
           expires_at = now() + interval '90 days', last_used_at = NULL
    RETURNING * INTO v_tok;

    RETURN jsonb_build_object('ok', true, 'token', v_tok.token, 'expiraEm', v_tok.expires_at);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_gerar_token(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_gerar_token(uuid, boolean) TO authenticated;

-- ── 8. Admin: revogar ───────────────────────────────────────────────────────
-- Desliga o link E o login por e-mail (sindico_portal_token_para_mim respeita).
CREATE OR REPLACE FUNCTION public.sindico_portal_revogar_token(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tok public.sindico_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.sindico_portal_tokens WHERE client_id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este síndico não tem acesso gerado.');
    END IF;
    IF NOT public.is_org_manager(v_tok.org_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só gestor da organização revoga o acesso do síndico.');
    END IF;
    UPDATE public.sindico_portal_tokens SET is_active = false WHERE id = v_tok.id;
    RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_revogar_token(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_revogar_token(uuid) TO authenticated;

-- ── 9. Login por e-mail: o token do PRÓPRIO síndico ─────────────────────────
-- Molde: portal_token_para_mim (aplicar_20271016000100). Função própria em vez
-- de estender aquela: o critério de escolha é outro (vale o cadastro que É
-- síndico vigente) e há uma situação a mais, 'sem_mandato'.
--   'ok' | 'nao_cadastrado' | 'sem_mandato' | 'revogado'
CREATE OR REPLACE FUNCTION public.sindico_portal_token_para_mim()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_id     uuid;
    v_nome   text;
    v_token  text;
    v_ativo  boolean;
    v_expira timestamptz;
    v_tem    boolean;
    v_org    uuid;
BEGIN
    IF v_email = '' THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT c.id, c.name, t.token, t.is_active, t.expires_at,
           EXISTS (SELECT 1 FROM public.fn_sindico_predios(c.id))
      INTO v_id, v_nome, v_token, v_ativo, v_expira, v_tem
      FROM public.clients c
      LEFT JOIN public.sindico_portal_tokens t ON t.client_id = c.id
     WHERE lower(c.email) = v_email
     ORDER BY EXISTS (SELECT 1 FROM public.fn_sindico_predios(c.id)) DESC,
              (t.is_active IS TRUE) DESC, c.created_at DESC NULLS LAST
     LIMIT 1;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('situacao', 'nao_cadastrado');
    END IF;
    IF NOT v_tem THEN
        RETURN jsonb_build_object('situacao', 'sem_mandato', 'nome', v_nome);
    END IF;
    IF v_token IS NOT NULL AND v_ativo IS FALSE THEN
        RETURN jsonb_build_object('situacao', 'revogado', 'nome', v_nome);
    END IF;

    IF v_token IS NOT NULL AND v_expira < now() THEN
        v_token := gen_random_uuid()::text;
        UPDATE public.sindico_portal_tokens
           SET token = v_token, expires_at = now() + interval '90 days', last_used_at = NULL
         WHERE client_id = v_id;
    END IF;

    IF v_token IS NULL THEN
        SELECT e.organization_id INTO v_org
          FROM public.empreendimentos e
         WHERE e.id IN (SELECT public.fn_sindico_predios(v_id))
         ORDER BY e.name LIMIT 1;
        v_token := gen_random_uuid()::text;
        INSERT INTO public.sindico_portal_tokens (org_id, client_id, token) VALUES (v_org, v_id, v_token);
    END IF;

    RETURN jsonb_build_object('situacao', 'ok', 'token', v_token, 'nome', v_nome);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sindico_portal_token_para_mim() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_token_para_mim() TO authenticated;

-- ── Contadores de conferência (rodar depois de aplicar) ─────────────────────
-- SELECT
--   (SELECT count(*) FROM pg_tables WHERE tablename = 'sindico_portal_tokens')                           AS tabela,
--   (SELECT relrowsecurity FROM pg_class WHERE relname = 'sindico_portal_tokens')                        AS rls,
--   (SELECT count(*) FROM pg_proc WHERE proname IN ('fn_sindico_predios','fn_sindico_resolver','fn_sindico_payload',
--       'sindico_portal_dados','sindico_portal_estado','sindico_portal_gerar_token','sindico_portal_revogar_token',
--       'sindico_portal_token_para_mim'))                                                                  AS funcoes,  -- 8
--   has_function_privilege('anon', 'public.sindico_portal_gerar_token(uuid,boolean)', 'EXECUTE')        AS anon_gera, -- false
--   has_function_privilege('anon', 'public.fn_sindico_payload(uuid)', 'EXECUTE')                        AS anon_payload, -- false
--   has_function_privilege('anon', 'public.sindico_portal_dados(text,uuid)', 'EXECUTE')                 AS anon_dados; -- true
