-- ============================================================================
-- Portal do Síndico aberto PELO APP: a administradora opera, não só olha (25/10/2026)
--
-- Pedido: "nao faz o menor sentido bloquear o portal do condominio na visão do
-- app. Deve ter a mesma funcionalidade da visão do sindico."
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (item
-- "Administradora opera pelo portal").
--
-- Antes: em Portais › Portal do Condomínio › "Ver como o síndico" o portal era
-- uma prévia SÓ DE LEITURA — `fn_sindico_resolver` aceitava o membro da
-- organização apenas no modo 'ler'; gravar exigia o e-mail do síndico no JWT.
--
-- Agora:
--   • modo novo 'operar' (o de `fn_sindico_operar`, que todas as RPCs de
--     lançar/pagar/receber/rateio/conta/extrato usam): aceita o síndico logado
--     OU, sem token, o membro da organização de um dos prédios dele;
--   • 'escrever' (avisos e chamados) aceita o mesmo membro;
--   • 'sessao' (aprovar/devolver rateio) continua SÓ do síndico — é a decisão
--     dele sobre o que a administração preparou, e "Fechar" pela administradora
--     não carimba a aprovação dele (num condomínio que exige aprovação, só
--     fecha o rateio que ele já aprovou);
--   • o recorte é POR CONDOMÍNIO: `fn_sindico_motivo_nao_opera` (que toda RPC
--     de escrita chama com o condomínio do registro) recusa quem não é o
--     síndico nem membro da org daquele condomínio — o síndico de dois prédios
--     de administradoras diferentes não abre um para a outra;
--   • autoria: o resolver devolve `como` ('sindico' | 'link' | 'administradora')
--     e, para a administradora, `nome` = "Fulano (administradora)" — é o que vai
--     para `sindico_financeiro_eventos.nome`; a coluna nova `operado_por_user_id`
--     guarda quem gravou; as marcas "lançado pelo síndico"
--     (`lancado_por_sindico_client_id`, `criado_por_sindico_client_id`) só ficam
--     quando quem grava é mesmo o síndico (gatilho).
--
-- REGRA #7: REVOKE de PUBLIC/anon em toda função nova; autorização DENTRO.
-- Reverter: recriar as funções da migration aplicar_20271025100000 e
-- anteriores (resolver/operar/motivo: aplicar_20271024400000 e
-- aplicar_20271024920000) e dropar os 2 gatilhos + 4 funções novas.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos
    ADD COLUMN IF NOT EXISTS operado_por_user_id uuid DEFAULT auth.uid();

-- ── 0. Auxiliares ────────────────────────────────────────────────────────────
-- Quem chama é o síndico deste cadastro (e-mail do JWT = e-mail do cliente)?
CREATE OR REPLACE FUNCTION public.fn_sindico_chamador_e_o_sindico(p_cli uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(auth.jwt() ->> 'email', '') <> ''
       AND EXISTS (SELECT 1 FROM public.clients c
                    WHERE c.id = p_cli AND c.email IS NOT NULL
                      AND lower(c.email) = lower(auth.jwt() ->> 'email'));
$$;

-- Quem chama é da administradora deste condomínio (org do empreendimento ou a
-- org própria do condomínio)? Mesma regra da leitura em `fn_sindico_resolver`.
CREATE OR REPLACE FUNCTION public.fn_sindico_administra(p_emp uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (SELECT 1 FROM public.empreendimentos e
                    WHERE e.id = p_emp
                      AND (public.is_org_member(e.organization_id)
                           OR (e.condominio_org_id IS NOT NULL AND public.is_org_member(e.condominio_org_id))));
$$;

-- Recorte por condomínio de quem está logado. Sem login (link) quem decide é o
-- resolver: lá o link não grava financeiro.
CREATE OR REPLACE FUNCTION public.fn_sindico_recusa_operador(p_emp uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN NULL
        WHEN e.sindico_client_id IS NOT NULL AND public.fn_sindico_chamador_e_o_sindico(e.sindico_client_id) THEN NULL
        WHEN public.fn_sindico_administra(e.id) THEN NULL
        ELSE 'Você não faz parte da administradora deste condomínio.'
    END
    FROM public.empreendimentos e WHERE e.id = p_emp;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sindico_chamador_e_o_sindico(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_administra(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_recusa_operador(uuid)     FROM PUBLIC, anon, authenticated;

-- ── 1. Resolver: modo 'operar' e a administradora ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sindico_resolver(p_token text, p_client_id uuid, p_modo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_email   text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_tok     public.sindico_portal_tokens;
    v_cli     public.clients;
    v_ehDono  boolean;
    v_comLink boolean := p_token IS NOT NULL AND p_token <> '';
    v_como    text;
    v_oper    text;
BEGIN
    IF p_modo NOT IN ('ler', 'escrever', 'operar', 'sessao') THEN
        RAISE EXCEPTION 'modo_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_comLink THEN
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
    -- Pelo link (sem ser o síndico logado) o financeiro não grava.
    IF p_modo = 'operar' AND v_comLink AND NOT v_ehDono THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'Para lançar, pagar ou cadastrar, entre no Portal do Síndico com seu e-mail e senha.');
    END IF;
    -- Sem token: o próprio síndico (e-mail do JWT) ou um membro da organização
    -- de um dos prédios dele — a administradora, pelo app. O recorte por
    -- condomínio é de `fn_sindico_motivo_nao_opera` / `fn_sindico_recusa_operador`.
    IF NOT v_comLink AND NOT v_ehDono THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.empreendimentos e
             WHERE e.id IN (SELECT public.fn_sindico_predios(v_cli.id))
               AND (public.is_org_member(e.organization_id)
                    OR (e.condominio_org_id IS NOT NULL AND public.is_org_member(e.condominio_org_id)))
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

    v_como := CASE WHEN v_ehDono THEN 'sindico' WHEN v_comLink THEN 'link' ELSE 'administradora' END;
    IF v_como = 'administradora' THEN
        SELECT coalesce(nullif(btrim(p.name), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                        u.email, auth.jwt() ->> 'email', 'Administradora')
          INTO v_oper
          FROM (SELECT 1) x
          LEFT JOIN auth.users u ON u.id = auth.uid()
          LEFT JOIN public.profiles p ON p.id = u.id;
    END IF;
    RETURN jsonb_build_object(
        'ok', true, 'client_id', v_cli.id, 'como', v_como,
        'sindico_nome', v_cli.name,
        'operador', v_oper,
        -- `nome` é o que cada RPC grava como autor no histórico.
        'nome', CASE WHEN v_como = 'administradora' THEN v_oper || ' (administradora)' ELSE v_cli.name END);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sindico_operar(p_token text, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_sindico_resolver(p_token, p_client_id, 'operar');
END;
$$;

-- ── 2. Recorte por condomínio em toda RPC de escrita ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sindico_motivo_nao_opera(p_empreendimento_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN e.id IS NULL THEN 'Condomínio não encontrado.'
        WHEN e.condominio_org_id IS NULL THEN
            'Este condomínio ainda opera na organização da construtora. Os lançamentos pelo portal ficam disponíveis quando ele tiver organização própria — fale com a administradora.'
        ELSE public.fn_sindico_recusa_operador(e.id)
    END
    FROM (SELECT 1) x
    LEFT JOIN public.empreendimentos e ON e.id = p_empreendimento_id;
$$;

-- ── 3. "Lançado pelo síndico" só quando é o síndico ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sindico_marca_so_do_sindico()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'condominio_rateios' THEN
        IF NEW.criado_por_sindico_client_id IS NOT NULL
           AND NOT public.fn_sindico_chamador_e_o_sindico(NEW.criado_por_sindico_client_id) THEN
            NEW.criado_por_sindico_client_id := NULL;
        END IF;
    ELSIF NEW.lancado_por_sindico_client_id IS NOT NULL
          AND NOT public.fn_sindico_chamador_e_o_sindico(NEW.lancado_por_sindico_client_id) THEN
        NEW.lancado_por_sindico_client_id := NULL;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_marca_so_do_sindico() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sindico_marca_titulo ON public.internal_transactions;
CREATE TRIGGER trg_sindico_marca_titulo BEFORE INSERT ON public.internal_transactions
    FOR EACH ROW WHEN (NEW.lancado_por_sindico_client_id IS NOT NULL)
    EXECUTE FUNCTION public.fn_sindico_marca_so_do_sindico();
DROP TRIGGER IF EXISTS trg_sindico_marca_fornecedor ON public.suppliers;
CREATE TRIGGER trg_sindico_marca_fornecedor BEFORE INSERT ON public.suppliers
    FOR EACH ROW WHEN (NEW.lancado_por_sindico_client_id IS NOT NULL)
    EXECUTE FUNCTION public.fn_sindico_marca_so_do_sindico();
DROP TRIGGER IF EXISTS trg_sindico_marca_rateio ON public.condominio_rateios;
CREATE TRIGGER trg_sindico_marca_rateio BEFORE INSERT ON public.condominio_rateios
    FOR EACH ROW WHEN (NEW.criado_por_sindico_client_id IS NOT NULL)
    EXECUTE FUNCTION public.fn_sindico_marca_so_do_sindico();

-- ── 4. Fechar rateio: a administradora não assina pelo síndico ──────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_rateio_fechar(p_token text, p_client_id uuid, p_rateio_id uuid, p_descricoes jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_admin  boolean;
    v_rat    public.condominio_rateios;
    v_e      public.empreendimentos;
    v_motivo text;
    v_num    text;
    v_ass    text;
    v_desc   jsonb := CASE WHEN jsonb_typeof(p_descricoes) = 'object' THEN p_descricoes ELSE '{}'::jsonb END;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli   := (v_r ->> 'client_id')::uuid;
    v_nome  := v_r ->> 'nome';
    v_admin := (v_r ->> 'como') = 'administradora';
    v_rat := public.fn_sindico_rateio(v_cli, p_rateio_id);
    IF v_rat.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Rateio não encontrado nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_rat.empreendimento_id);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    IF v_rat.status <> 'RASCUNHO' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só rateio em rascunho pode ser fechado.');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.condominio_rateio_itens WHERE rateio_id = v_rat.id AND valor > 0) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Rateio sem nenhuma cota — cancele e refaça.');
    END IF;
    -- A administradora fecha sem carimbar a aprovação; onde o condomínio exige a
    -- aprovação do síndico, só o rateio que ele já aprovou (e que não mudou).
    -- O gatilho `trg_rateio_exige_aprovacao` recusaria igual; aqui a frase sai limpa.
    IF v_admin THEN
        SELECT * INTO v_e FROM public.empreendimentos WHERE id = v_rat.empreendimento_id;
        IF coalesce(v_e.rateio_exige_aprovacao_sindico, false) AND NOT (
               v_rat.aprovacao_status = 'APROVADO'
           AND v_rat.aprovacao_por_client_id IS NOT DISTINCT FROM v_e.sindico_client_id
           AND v_rat.aprovacao_assinatura IS NOT DISTINCT FROM public.fn_rateio_assinatura(v_rat.id)) THEN
            RETURN jsonb_build_object('ok', false, 'motivo',
                'Este condomínio exige a aprovação do síndico: o rateio fecha quando ele aprovar, no portal dele.');
        END IF;
    END IF;

    UPDATE public.condominio_rateio_despesas d
       SET descricao = left(btrim(v_desc ->> d.transaction_id::text), 300)
     WHERE d.rateio_id = v_rat.id
       AND nullif(btrim(coalesce(v_desc ->> d.transaction_id::text, '')), '') IS NOT NULL
       AND left(btrim(v_desc ->> d.transaction_id::text), 300) IS DISTINCT FROM d.descricao;

    v_num := v_rat.number;
    IF v_num IS NULL THEN
        v_num := public.fn_sindico_numero_documento(
            v_rat.organization_id, 'CONDO_RATEIO',
            jsonb_strip_nulls(jsonb_build_object(
                'EMPREENDIMENTO', (SELECT nullif(btrim(code), '') FROM public.empreendimentos WHERE id = v_rat.empreendimento_id),
                'CENTRO_CUSTO',   (SELECT nullif(btrim(code), '') FROM public.cost_centers_v2 WHERE id = v_rat.cost_center_id),
                'ORGANIZACAO',    (SELECT nullif(btrim(code), '') FROM public.organizations WHERE id = v_rat.organization_id))),
            '["PREFIX","EMPREENDIMENTO"]'::jsonb, 'CTC');
    END IF;

    IF NOT v_admin THEN
        v_ass := public.fn_rateio_assinatura(v_rat.id);
        UPDATE public.condominio_rateios
           SET aprovacao_status = 'APROVADO', aprovacao_em = now(),
               aprovacao_por_client_id = v_cli, aprovacao_por_nome = v_nome,
               aprovacao_observacao = 'Fechado pelo síndico no Portal do Síndico.', aprovacao_assinatura = v_ass
         WHERE id = v_rat.id;
        INSERT INTO public.condominio_rateio_decisoes (rateio_id, organization_id, decisao, observacao, client_id, nome, assinatura)
        VALUES (v_rat.id, v_rat.organization_id, 'APROVADO', 'Fechado pelo síndico no Portal do Síndico.', v_cli, v_nome, v_ass);
    END IF;

    UPDATE public.condominio_rateios
       SET status = 'FECHADO', fechado_em = now(), number = v_num
     WHERE id = v_rat.id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, rateio_id, depois)
    VALUES (v_rat.organization_id, v_rat.empreendimento_id, v_cli, v_nome, 'RATEIO_FECHAR', v_rat.id,
            jsonb_build_object('numero', v_num));

    RETURN jsonb_build_object('ok', true, 'numero', v_num);
END;
$$;

-- ── 5. Avisos e chamados: autoria e recorte por condomínio ──────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_publicar_aviso(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_titulo text, p_corpo text, p_categoria text, p_valido_ate date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_org    uuid;
    v_id     uuid;
    v_recusa text;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'escrever');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;

    IF NOT (p_empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli))) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Você não é síndico deste condomínio.');
    END IF;
    v_recusa := public.fn_sindico_recusa_operador(p_empreendimento_id);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;
    IF coalesce(btrim(p_titulo), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o título do aviso.');
    END IF;
    IF p_categoria NOT IN ('AVISO', 'URGENTE', 'MANUTENCAO', 'ASSEMBLEIA', 'OBRA') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Categoria inválida.');
    END IF;
    IF p_valido_ate IS NOT NULL AND p_valido_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'A validade não pode ser anterior a hoje.');
    END IF;

    SELECT coalesce(condominio_org_id, organization_id) INTO v_org FROM public.empreendimentos WHERE id = p_empreendimento_id;

    INSERT INTO public.condominio_avisos
        (empreendimento_id, organization_id, titulo, corpo, categoria, valido_ate,
         publicado_em, publicado_por, publicado_por_sindico_client_id)
    VALUES
        (p_empreendimento_id, v_org, btrim(p_titulo), nullif(btrim(coalesce(p_corpo, '')), ''), p_categoria, p_valido_ate,
         now(),
         CASE WHEN (v_r ->> 'como') = 'administradora' THEN 'Administradora — ' || coalesce(v_r ->> 'operador', '')
              ELSE 'Síndico — ' || coalesce(v_r ->> 'nome', '') END,
         v_cli)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_encerrar_aviso(p_token text, p_client_id uuid, p_aviso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_emp    uuid;
    v_recusa text;
    v_n      integer;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'escrever');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;

    SELECT empreendimento_id INTO v_emp FROM public.condominio_avisos WHERE id = p_aviso_id;
    v_recusa := public.fn_sindico_recusa_operador(v_emp);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;

    UPDATE public.condominio_avisos
       SET valido_ate = (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1, updated_at = now()
     WHERE id = p_aviso_id
       AND publicado_por_sindico_client_id = v_cli
       AND empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só é possível encerrar avisos publicados pelo portal.');
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_responder_chamado(p_token text, p_client_id uuid, p_request_id uuid, p_mensagem text, p_novo_status text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_admin  boolean;
    v_nome   text;
    v_req    public.client_requests;
    v_emp    uuid;
    v_recusa text;
    v_msg    text := nullif(btrim(coalesce(p_mensagem, '')), '');
    v_status text := nullif(btrim(coalesce(p_novo_status, '')), '');
    v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'escrever');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli   := (v_r ->> 'client_id')::uuid;
    v_admin := (v_r ->> 'como') = 'administradora';
    v_nome  := CASE WHEN v_admin THEN 'Administradora — ' || coalesce(v_r ->> 'operador', '')
                    ELSE 'Síndico — ' || coalesce(v_r ->> 'nome', '') END;

    SELECT tw.empreendimento_id INTO v_emp
      FROM public.client_requests r
      JOIN public.empreendimento_units  u  ON u.id = r.unit_id
      JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
     WHERE r.id = p_request_id
       AND tw.empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli));
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Chamado não encontrado nos seus condomínios.');
    END IF;
    SELECT * INTO v_req FROM public.client_requests WHERE id = p_request_id;
    v_recusa := public.fn_sindico_recusa_operador(v_emp);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;

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
        (v_req.id, v_req.organization_id,
         CASE WHEN v_admin THEN 'EQUIPE' ELSE 'SINDICO' END,
         CASE WHEN v_admin THEN NULL ELSE v_cli END,
         v_nome, v_msg,
         CASE WHEN v_status IS NOT NULL THEN v_req.status END, v_status);

    INSERT INTO public.client_portal_messages
        (organization_id, client_id, sender_name, type, title, body, reference_type, reference_id)
    VALUES
        (v_req.organization_id, v_req.client_id, v_nome, 'status_update',
         CASE WHEN v_status IS NOT NULL THEN 'Chamado atualizado: ' || v_status
              WHEN v_admin THEN 'Resposta da administradora'
              ELSE 'Resposta do síndico' END,
         'Seu chamado "' || v_req.title || '"'
           || CASE WHEN v_status IS NOT NULL THEN ' foi atualizado para: ' || v_status || '.' ELSE ' recebeu uma resposta.' END
           || CASE WHEN v_msg IS NOT NULL THEN chr(10) || chr(10) || v_msg ELSE '' END,
         'chamado', v_req.id);

    RETURN jsonb_build_object('ok', true, 'status', coalesce(v_status, v_req.status));
END;
$$;

-- ── 6. Permissões (as MESMAS de antes, agora escritas aqui) ─────────────────
-- Internas: só por dentro das RPCs. As de aviso/chamado seguem abertas ao link
-- sem login (anon), como desde a origem (o token é a autorização).
REVOKE EXECUTE ON FUNCTION public.fn_sindico_resolver(text, uuid, text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_operar(text, uuid)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_motivo_nao_opera(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_rateio_fechar(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_rateio_fechar(text, uuid, uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_publicar_aviso(text, uuid, uuid, text, text, text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_publicar_aviso(text, uuid, uuid, text, text, text, date) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_encerrar_aviso(text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_encerrar_aviso(text, uuid, uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_responder_chamado(text, uuid, uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_responder_chamado(text, uuid, uuid, text, text) TO anon, authenticated;
