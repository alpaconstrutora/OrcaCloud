-- ============================================================================
-- Portal do Síndico › G6: moradores (ocupações) e acesso ao portal (26/11/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G6)
-- Pronto quando: síndico cadastra um morador e envia o acesso ao portal.
--
-- O app (OcupacoesTab) grava `unit_occupancies` direto e concede o acesso com o
-- LINK do Portal do Cliente (`condominioAcessoService.conceder`). O síndico não é
-- membro e é EXTERNO: o link do Portal do Cliente é um por pessoa e abre TUDO o
-- que ela tem com a organização (contratos, cobranças) — os moradores do 007 e do
-- 010 são cadastros da construtora. Entregar esse link ao síndico vazaria isso.
-- Por isso o acesso pelo portal é só o CONVITE POR E-MAIL (`portal-invite-user`,
-- o mesmo do app): o link vai para o e-mail do morador e nunca volta para quem
-- convidou. As RPCs:
--   • `sindico_portal_moradores` (ler): unidades com as ocupações (vigentes e
--     encerradas), contato e situação do acesso (convidado em, aba Condomínio);
--   • `sindico_portal_morador_salvar`: ocupação nova numa unidade do condomínio —
--     cadastro existente (morador de alguma unidade do prédio, ou da org do
--     condomínio) ou NOVO na org do condomínio (o mesmo CPF/e-mail entre esses é
--     reaproveitado, não duplica). A org da ocupação vem do gatilho
--     `fn_unit_occupancies_org`;
--   • `sindico_portal_morador_encerrar`: data de saída (encerrar ≠ excluir);
--   • `sindico_portal_morador_contato`: e-mail e telefone de quem MORA no prédio —
--     o que falta para convidar (ex.: os 8 proprietários do Bella Vista, sem e-mail);
--   • `sindico_portal_morador_autorizar_convite`: a Edge `portal-invite-user` chama
--     com a credencial de quem chamou ANTES de gerar o link: ocupante VIGENTE deste
--     condomínio, com e-mail; liga a aba Condomínio (preservando as outras) e
--     devolve a organização do token.
-- Escrita: `fn_sindico_escrita_no_predio` (síndico logado ou a administradora pelo
-- app, recorte por condomínio). REGRA #7: REVOKE de PUBLIC/anon; autorização DENTRO.
-- Reverter: DROP das funções; o CHECK de ações volta à lista de …950300.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS',
                    'CONTA_SALVAR', 'RECEBER', 'DESFAZER_BAIXA', 'LANCAR_RECEITA',
                    'EXTRATO_IMPORTAR', 'EXTRATO_CONCILIAR', 'EXTRATO_DESFAZER', 'EXTRATO_IGNORAR',
                    'EXTRATO_RESTAURAR', 'EXTRATO_LANCAR',
                    'FORNECEDOR_EDITAR', 'FORNECEDOR_CONTA', 'CONTRATO_SALVAR', 'CONTRATO_ENCERRAR',
                    'OS_SALVAR', 'OS_CONCLUIR', 'OS_CANCELAR', 'PLANO_ITEM_SALVAR', 'PLANO_ITEM_REMOVER',
                    'ATIVO_SALVAR', 'ATIVO_REMOVER',
                    'DOCUMENTO_ENVIAR', 'DOCUMENTO_VISIBILIDADE', 'DOCUMENTO_REMOVER',
                    'MORADOR_SALVAR', 'MORADOR_ENCERRAR', 'MORADOR_CONTATO', 'MORADOR_CONVITE'));

-- O cadastro é de quem mora (ou morou) em alguma unidade deste condomínio?
CREATE OR REPLACE FUNCTION public.fn_sindico_e_morador_do_predio(p_client uuid, p_emp uuid, p_so_vigente boolean)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.unit_occupancies o
          JOIN public.empreendimento_units u ON u.id = o.unit_id
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
         WHERE o.client_id = p_client AND t.empreendimento_id = p_emp
           AND (NOT p_so_vigente OR o.ended_at IS NULL OR o.ended_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date));
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_e_morador_do_predio(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── 1. Ler ───────────────────────────────────────────────────────────────────
-- Não STABLE: o resolvedor grava `last_used_at` do link.
CREATE OR REPLACE FUNCTION public.sindico_portal_moradores(p_token text, p_client_id uuid, p_empreendimento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r    jsonb;
    v_cli  uuid;
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    RETURN jsonb_build_object('ok', true,
        'motivoNaoOpera', public.fn_sindico_motivo_nao_opera(p_empreendimento_id),
        'unidades', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'unitId', u.id, 'unidade', u.name, 'torre', t.name,
            'ocupacoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', o.id, 'papel', o.role, 'desde', o.started_at, 'ate', o.ended_at,
                'vigente', o.ended_at IS NULL OR o.ended_at >= v_hoje,
                'clientId', c.id, 'nome', c.name, 'email', c.email, 'telefone', c.phone,
                'convidadoEm', c.portal_invited_at,
                'abaCondominio', jsonb_typeof(c.portal_tabs) IS DISTINCT FROM 'array' OR c.portal_tabs ? 'condominio'
            ) ORDER BY (o.ended_at IS NOT NULL AND o.ended_at < v_hoje), o.role, c.name)
              FROM public.unit_occupancies o JOIN public.clients c ON c.id = o.client_id
             WHERE o.unit_id = u.id), '[]'::jsonb)
        ) ORDER BY t.name, u.name)
          FROM public.empreendimento_units u
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
         WHERE t.empreendimento_id = p_empreendimento_id), '[]'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_moradores(text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_moradores(text, uuid, uuid) TO anon, authenticated;

-- ── 2. Ocupação nova ─────────────────────────────────────────────────────────
-- p_dados: { unitId, papel, desde, clientId? , novo?: { nome, email, telefone, documento } }
CREATE OR REPLACE FUNCTION public.sindico_portal_morador_salvar(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a      jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_org    uuid;
    v_org_e  uuid;
    v_unit   uuid := nullif(p_dados ->> 'unitId', '')::uuid;
    v_papel  text := coalesce(nullif(p_dados ->> 'papel', ''), 'MORADOR');
    v_desde  date;
    v_pessoa uuid := nullif(p_dados ->> 'clientId', '')::uuid;
    v_novo   jsonb := p_dados -> 'novo';
    v_nome   text;
    v_email  text;
    v_doc    text;
    v_id     uuid;
    v_reuso  boolean := false;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    v_org := (v_a ->> 'org')::uuid;
    SELECT organization_id INTO v_org_e FROM public.empreendimentos WHERE id = p_empreendimento_id;
    BEGIN
        v_desde := coalesce(nullif(p_dados ->> 'desde', '')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Data de entrada inválida.');
    END;
    IF v_unit IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.empreendimento_units u JOIN public.empreendimento_towers t ON t.id = u.tower_id
         WHERE u.id = v_unit AND t.empreendimento_id = p_empreendimento_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Escolha uma unidade deste condomínio.');
    END IF;
    IF v_papel NOT IN ('PROPRIETARIO', 'INQUILINO', 'MORADOR', 'RESPONSAVEL_FINANCEIRO') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Papel inválido.');
    END IF;

    IF v_pessoa IS NOT NULL THEN
        -- Cadastro existente: só quem já mora/morou no prédio ou é da org do condomínio.
        IF NOT (public.fn_sindico_e_morador_do_predio(v_pessoa, p_empreendimento_id, false)
                OR EXISTS (SELECT 1 FROM public.clients WHERE id = v_pessoa AND organization_id = v_org)) THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Cadastro não encontrado neste condomínio.');
        END IF;
    ELSE
        v_nome  := nullif(btrim(coalesce(v_novo ->> 'nome', '')), '');
        v_email := nullif(lower(btrim(coalesce(v_novo ->> 'email', ''))), '');
        v_doc   := nullif(regexp_replace(coalesce(v_novo ->> 'documento', ''), '\D', '', 'g'), '');
        IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o nome do morador.'); END IF;
        IF v_doc IS NOT NULL AND length(v_doc) NOT IN (11, 14) THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'CPF tem 11 dígitos e CNPJ tem 14.');
        END IF;
        IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'E-mail inválido.');
        END IF;
        -- O mesmo CPF/CNPJ ou e-mail entre os cadastros que o condomínio já conhece
        -- (moradores do prédio, a org do condomínio e a do empreendimento) não duplica.
        SELECT c.id INTO v_pessoa FROM public.clients c
         WHERE (c.organization_id IN (v_org, v_org_e) OR public.fn_sindico_e_morador_do_predio(c.id, p_empreendimento_id, false))
           AND ((v_doc IS NOT NULL AND regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_doc)
                OR (v_doc IS NULL AND v_email IS NOT NULL AND lower(c.email) = v_email))
         ORDER BY (c.organization_id = v_org) DESC, c.created_at
         LIMIT 1;
        IF v_pessoa IS NOT NULL THEN
            v_reuso := true;
        ELSE
            INSERT INTO public.clients (name, email, phone, document, type, category, organization_id)
            VALUES (v_nome, v_email, nullif(btrim(coalesce(v_novo ->> 'telefone', '')), ''),
                    nullif(btrim(coalesce(v_novo ->> 'documento', '')), ''),
                    CASE WHEN length(v_doc) = 14 THEN 'PJ' ELSE 'PF' END, 'Condomínio', v_org)
            RETURNING id INTO v_pessoa;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM public.unit_occupancies WHERE unit_id = v_unit AND client_id = v_pessoa AND role = v_papel AND ended_at IS NULL) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Esta pessoa já está nesta unidade com este papel.');
    END IF;
    IF v_papel = 'RESPONSAVEL_FINANCEIRO' AND EXISTS (
        SELECT 1 FROM public.unit_occupancies WHERE unit_id = v_unit AND role = 'RESPONSAVEL_FINANCEIRO' AND ended_at IS NULL) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'A unidade já tem responsável financeiro — encerre o atual antes.');
    END IF;

    INSERT INTO public.unit_occupancies (unit_id, client_id, role, started_at)
    VALUES (v_unit, v_pessoa, v_papel, v_desde)
    RETURNING id INTO v_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, depois)
    VALUES (v_org, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'MORADOR_SALVAR', v_id,
            jsonb_build_object('unidade', v_unit, 'pessoa', v_pessoa, 'papel', v_papel, 'desde', v_desde, 'reaproveitado', v_reuso));
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'clientId', v_pessoa, 'reaproveitado', v_reuso);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_morador_salvar(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_morador_salvar(text, uuid, uuid, jsonb) TO authenticated;

-- ── 3. Encerrar (saída) ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_morador_encerrar(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_ocupacao uuid, p_data date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_antes public.unit_occupancies;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    SELECT o.* INTO v_antes FROM public.unit_occupancies o
      JOIN public.empreendimento_units u ON u.id = o.unit_id
      JOIN public.empreendimento_towers t ON t.id = u.tower_id
     WHERE o.id = p_ocupacao AND t.empreendimento_id = p_empreendimento_id
       FOR UPDATE OF o;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Ocupação não encontrada neste condomínio.'); END IF;
    IF v_antes.ended_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Esta ocupação já está encerrada.'); END IF;
    IF p_data IS NULL OR p_data < v_antes.started_at THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'A saída não pode ser antes da entrada.');
    END IF;
    UPDATE public.unit_occupancies SET ended_at = p_data WHERE id = p_ocupacao;
    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes, depois)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'MORADOR_ENCERRAR', p_ocupacao,
            to_jsonb(v_antes), jsonb_build_object('ate', p_data));
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_morador_encerrar(text, uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_morador_encerrar(text, uuid, uuid, uuid, date) TO authenticated;

-- ── 4. Contato (e-mail e telefone) de quem mora no prédio ───────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_morador_contato(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_pessoa uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_antes public.clients;
    v_email text := nullif(lower(btrim(coalesce(p_dados ->> 'email', ''))), '');
    v_tel   text := nullif(btrim(coalesce(p_dados ->> 'telefone', '')), '');
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    IF NOT public.fn_sindico_e_morador_do_predio(p_pessoa, p_empreendimento_id, true) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só o contato de quem mora no condomínio muda por aqui.');
    END IF;
    IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'E-mail inválido.');
    END IF;
    SELECT * INTO v_antes FROM public.clients WHERE id = p_pessoa FOR UPDATE;
    UPDATE public.clients SET email = v_email, phone = v_tel WHERE id = p_pessoa;
    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes, depois)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'MORADOR_CONTATO', p_pessoa,
            jsonb_build_object('email', v_antes.email, 'telefone', v_antes.phone), jsonb_build_object('email', v_email, 'telefone', v_tel));
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_morador_contato(text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_morador_contato(text, uuid, uuid, uuid, jsonb) TO authenticated;

-- ── 5. Autorizar o convite (chamada pela Edge `portal-invite-user`) ─────────
CREATE OR REPLACE FUNCTION public.sindico_portal_morador_autorizar_convite(
    p_token text, p_client_id uuid, p_empreendimento uuid, p_pessoa uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento);
    v_c public.clients;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    IF NOT public.fn_sindico_e_morador_do_predio(p_pessoa, p_empreendimento, true) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só quem mora no condomínio recebe o convite por aqui.');
    END IF;
    SELECT * INTO v_c FROM public.clients WHERE id = p_pessoa FOR UPDATE;
    IF nullif(btrim(coalesce(v_c.email, '')), '') IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O morador não tem e-mail. Preencha o e-mail antes de convidar.');
    END IF;
    -- Liga a aba Condomínio PRESERVANDO as outras (`condominioAcessoService.conceder`).
    -- NULL = preset por categoria, que já inclui a aba para quem mora: fica como está.
    IF jsonb_typeof(v_c.portal_tabs) = 'array' AND NOT (v_c.portal_tabs ? 'condominio') THEN
        UPDATE public.clients SET portal_tabs = portal_tabs || '["condominio"]'::jsonb WHERE id = p_pessoa;
    END IF;
    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, depois)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'MORADOR_CONVITE', p_pessoa,
            jsonb_build_object('email', v_c.email));
    -- O token do Portal do Cliente é da org DO CADASTRO (como o app: client_portal_generate_token).
    RETURN jsonb_build_object('ok', true, 'org', coalesce(v_c.organization_id, (v_a ->> 'org')::uuid));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_morador_autorizar_convite(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_morador_autorizar_convite(text, uuid, uuid, uuid) TO authenticated;
