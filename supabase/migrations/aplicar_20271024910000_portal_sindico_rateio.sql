-- ============================================================================
-- Portal do Síndico › G1: o síndico monta, fecha e cobra o rateio (24/10/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G1)
-- Pedido: "o sindico é o gerenciador / executor do condominio e ele precisa de
-- total acesso para edicao" — só pelo portal (ele não é da construtora).
--
-- A lógica do admin roda no NAVEGADOR (condominioRateioService.previa/salvar/
-- fechar, condominioCobrancaService.previa/gerarRecebiveis) e grava com a RLS
-- de membro. O síndico não é membro: aqui tudo vira função no banco, e o
-- servidor RECALCULA — valor vindo do navegador nunca é gravado.
--
-- REGRA #7: toda função nova com REVOKE de PUBLIC/anon; autorização DENTRO
-- (fn_sindico_resolver/fn_sindico_operar + mandato + org própria).
-- ============================================================================

-- ── 1. Colunas e log ─────────────────────────────────────────────────────────
ALTER TABLE public.condominio_rateios
    ADD COLUMN IF NOT EXISTS criado_por_sindico_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.condominio_rateios.criado_por_sindico_client_id IS
    'Rateio montado pelo síndico no Portal do Síndico (G1, 24/10/2026).';

ALTER TABLE public.sindico_financeiro_eventos
    ADD COLUMN IF NOT EXISTS rateio_id uuid REFERENCES public.condominio_rateios(id) ON DELETE SET NULL;
ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS'));

-- ── 2. O cálculo — porta fiel de condominioRateioService.previa ─────────────
-- Mesmas regras, na mesma ordem:
--  · despesa = DEBIT nos centros de custo do condomínio, por transaction_date
--    na competência (ou os títulos ESCOLHIDOS, como o `transactionIds` do
--    admin), fora as que já estão num rateio vivo;
--  · unidades na ordem do admin (torre sort_order, created_at; unidade floor,
--    sort_order) — a ordem decide o desempate do "maior resto";
--  · pagador = quem está no papel pedido; sem ele a cota fica SEM pagador e o
--    aviso nomeia quem está no outro papel;
--  · distribuição em centavos pelo maior resto (`distribuir`); FIXO não
--    distribui: cada unidade com peso paga o valor digitado.
-- Interna: sem EXECUTE para ninguém (as RPCs do portal chamam como dono).
CREATE OR REPLACE FUNCTION public.fn_rateio_calcular(
    p_emp uuid,
    p_competencia date,
    p_criterio text,
    p_pagador text DEFAULT 'RESPONSAVEL',
    p_grupo uuid[] DEFAULT '{}',
    p_valor_fixo numeric DEFAULT NULL,
    p_transacoes uuid[] DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_ini   date := date_trunc('month', p_competencia)::date;
    v_fim   date := (date_trunc('month', p_competencia) + interval '1 month')::date;
    v_ccs   uuid[];
    v_cc1   uuid;
    v_alvo  text := CASE WHEN p_pagador = 'PROPRIETARIO' THEN 'PROPRIETARIO' ELSE 'RESPONSAVEL_FINANCEIRO' END;
    v_rot   text := CASE WHEN p_pagador = 'PROPRIETARIO' THEN 'proprietário' ELSE 'responsável financeiro' END;
    v_total bigint;
    v_ja    int;
    v_desp  jsonb;
    v_itens jsonb;
    v_fixo  bigint := round(coalesce(p_valor_fixo, 0) * 100);
BEGIN
    IF p_criterio NOT IN ('FRACAO_IDEAL', 'IGUAL', 'AREA_PRIVATIVA', 'GRUPO', 'FIXO') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Critério de rateio inválido.');
    END IF;
    IF p_criterio = 'FIXO' AND v_fixo <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o valor fixo por unidade.');
    END IF;
    IF p_criterio = 'GRUPO' AND coalesce(array_length(p_grupo, 1), 0) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Escolha as unidades do grupo.');
    END IF;

    SELECT array_agg(id ORDER BY code, id), (array_agg(id ORDER BY code, id))[1]
      INTO v_ccs, v_cc1
      FROM public.cost_centers_v2 WHERE empreendimento_id = p_emp;
    IF v_ccs IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'Este condomínio não tem centro de custo — não há de onde tirar as despesas.');
    END IF;

    WITH tx AS (
        SELECT t.id, t.description, t.amount, t.transaction_date,
               coalesce(nullif(btrim(t.party_name), ''), nullif(btrim(t.entity_name), '')) AS parte,
               s.name AS fornecedor,
               EXISTS (SELECT 1 FROM public.condominio_rateio_despesas d
                         JOIN public.condominio_rateios r ON r.id = d.rateio_id
                        WHERE d.transaction_id = t.id AND r.status <> 'CANCELADO') AS ja
          FROM public.internal_transactions t
          LEFT JOIN public.suppliers s ON s.id = t.supplier_id
         WHERE t.cost_center_id = ANY (v_ccs)
           AND t.direction = 'DEBIT'
           AND CASE WHEN p_transacoes IS NOT NULL AND array_length(p_transacoes, 1) > 0
                    THEN t.id = ANY (p_transacoes)
                    ELSE t.transaction_date >= v_ini AND t.transaction_date < v_fim END
    )
    SELECT count(*) FILTER (WHERE ja),
           coalesce(sum(round(coalesce(amount, 0) * 100)) FILTER (WHERE NOT ja), 0),
           coalesce(jsonb_agg(jsonb_build_object(
               'transaction_id', id, 'descricao', description, 'parte', parte, 'fornecedor', fornecedor,
               'valor', round(coalesce(amount, 0), 2), 'data', transaction_date)
               ORDER BY transaction_date, id) FILTER (WHERE NOT ja), '[]'::jsonb)
      INTO v_ja, v_total, v_desp
      FROM tx;

    WITH u AS (
        SELECT un.id, tw.name AS torre, un.name, un.fracao_ideal_decimal AS fr, un.private_area AS pa,
               row_number() OVER (ORDER BY tw.sort_order NULLS LAST, tw.created_at, tw.id,
                                           un.floor NULLS LAST, un.sort_order NULLS LAST, un.id) AS idx
          FROM public.empreendimento_towers tw
          JOIN public.empreendimento_units un ON un.tower_id = tw.id
         WHERE tw.empreendimento_id = p_emp
    ), oc AS (
        SELECT DISTINCT ON (o.unit_id, o.role) o.unit_id, o.role, o.client_id
          FROM public.unit_occupancies o
         WHERE o.unit_id IN (SELECT id FROM u) AND o.ended_at IS NULL AND o.client_id IS NOT NULL
           AND o.role IN ('RESPONSAVEL_FINANCEIRO', 'PROPRIETARIO')
         ORDER BY o.unit_id, o.role, o.created_at DESC, o.id DESC
    ), b AS (
        SELECT u.*,
               CASE p_criterio
                   WHEN 'FRACAO_IDEAL'   THEN CASE WHEN u.fr > 0 THEN u.fr ELSE 0 END
                   WHEN 'AREA_PRIVATIVA' THEN CASE WHEN u.pa > 0 THEN u.pa ELSE 0 END
                   WHEN 'GRUPO'          THEN CASE WHEN u.id = ANY (p_grupo) THEN 1 ELSE 0 END
                   ELSE 1 END::numeric AS peso,
               CASE p_criterio
                   WHEN 'FRACAO_IDEAL'   THEN CASE WHEN u.fr > 0 THEN NULL ELSE 'Sem fração ideal cadastrada — fale com a administradora.' END
                   WHEN 'AREA_PRIVATIVA' THEN CASE WHEN u.pa > 0 THEN NULL ELSE 'Sem área privativa cadastrada.' END
                   WHEN 'GRUPO'          THEN CASE WHEN u.id = ANY (p_grupo) THEN NULL ELSE 'Fora do grupo selecionado.' END
                   ELSE NULL END AS aviso_criterio,
               alvo.client_id AS cli, outro.client_id AS outro
          FROM u
          LEFT JOIN oc alvo  ON alvo.unit_id = u.id AND alvo.role = v_alvo
          LEFT JOIN oc outro ON outro.unit_id = u.id AND outro.role <> v_alvo
    ), s AS (
        SELECT coalesce(sum(peso), 0) AS sp FROM b
    ), d AS (
        SELECT b.*, CASE WHEN s.sp > 0 THEN v_total * b.peso / s.sp ELSE 0 END AS bruto, s.sp
          FROM b, s
    ), r AS (
        SELECT d.*, floor(d.bruto)::bigint AS base, d.bruto - floor(d.bruto) AS frac,
               (v_total - sum(floor(d.bruto)) OVER ())::bigint AS resto,
               row_number() OVER (ORDER BY d.bruto - floor(d.bruto) DESC, d.idx) AS rk
          FROM d
    ), v AS (
        SELECT r.*,
               CASE WHEN p_criterio = 'FIXO' THEN CASE WHEN r.peso > 0 THEN v_fixo ELSE 0 END
                    WHEN r.sp <= 0 THEN 0
                    ELSE r.base + CASE WHEN r.rk <= r.resto THEN 1 ELSE 0 END END AS cent
          FROM r
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'unitId', v.id,
               'unitLabel', v.torre || ' · ' || v.name,
               'peso', v.peso,
               'valor', v.cent / 100.0,
               'clientId', v.cli,
               'clientNome', coalesce(cc.name, CASE WHEN v.cli IS NOT NULL THEN '—' ELSE 'Sem ' || v_rot END),
               'aviso', coalesce(v.aviso_criterio,
                   CASE WHEN v.cli IS NOT NULL THEN NULL
                        WHEN v.outro IS NOT NULL THEN format('Sem %s nesta unidade — quem consta é %s, em outro papel.',
                                                             v_rot, coalesce(co.name, 'outra pessoa'))
                        ELSE format('Ninguém definido como %s.', v_rot) END)
           ) ORDER BY v.idx), '[]'::jsonb)
      INTO v_itens
      FROM v
      LEFT JOIN public.clients cc ON cc.id = v.cli
      LEFT JOIN public.clients co ON co.id = v.outro;

    RETURN jsonb_build_object(
        'ok', true,
        'costCenterId', v_cc1,
        'despesas', v_desp,
        'totalDespesas', v_total / 100.0,
        'itens', v_itens,
        'totalRateado', (SELECT coalesce(sum((i ->> 'valor')::numeric), 0) FROM jsonb_array_elements(v_itens) i),
        'semDado', (SELECT count(*) FROM jsonb_array_elements(v_itens) i
                     WHERE (i ->> 'peso')::numeric = 0 AND p_criterio <> 'GRUPO'),
        'semResponsavel', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i ->> 'clientId' IS NULL),
        'jaRateadas', v_ja);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_rateio_calcular(uuid, date, text, text, uuid[], numeric, uuid[]) FROM PUBLIC, anon, authenticated;

-- ── 3. Cotas de um rateio FECHADO: quem paga e o que impede cobrar ──────────
-- Porta de condominioCobrancaService.previa. O pagador NÃO recalcula o rateio
-- (as cotas estão travadas): só decide PARA QUEM cada cota vai.
CREATE OR REPLACE FUNCTION public.fn_rateio_cotas(p_rateio_id uuid, p_pagador text DEFAULT 'RESPONSAVEL')
 RETURNS TABLE (item_id uuid, unit_id uuid, unit_label text, valor numeric, client_id uuid,
                client_nome text, client_documento text, transaction_id uuid, bloqueio text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH p AS (
        SELECT CASE WHEN p_pagador = 'PROPRIETARIO' THEN 'PROPRIETARIO' ELSE 'RESPONSAVEL_FINANCEIRO' END AS alvo,
               CASE WHEN p_pagador = 'PROPRIETARIO' THEN 'proprietário' ELSE 'responsável financeiro' END AS rot
    ), oc AS (
        SELECT DISTINCT ON (o.unit_id, o.role) o.unit_id, o.role, o.client_id
          FROM public.unit_occupancies o
         WHERE o.unit_id IN (SELECT i.unit_id FROM public.condominio_rateio_itens i WHERE i.rateio_id = p_rateio_id)
           AND o.ended_at IS NULL AND o.client_id IS NOT NULL
           AND o.role IN ('RESPONSAVEL_FINANCEIRO', 'PROPRIETARIO')
         ORDER BY o.unit_id, o.role, o.created_at DESC, o.id DESC
    )
    SELECT i.id, i.unit_id,
           coalesce(nullif(tw.name, '') || ' · ' || un.name, un.name, '—'),
           i.valor, alvo.client_id, coalesce(ca.name, 'Sem ' || p.rot), nullif(btrim(ca.document), ''),
           i.transaction_id,
           CASE WHEN i.transaction_id IS NOT NULL THEN 'Cota já gerada — o recebível existe.'
                WHEN i.valor <= 0 THEN 'Cota zerada — nada a cobrar.'
                WHEN alvo.client_id IS NULL AND outro.client_id IS NOT NULL
                    THEN format('Sem %s nesta unidade. Quem consta é %s, em outro papel.', p.rot, coalesce(co.name, 'outra pessoa'))
                WHEN alvo.client_id IS NULL THEN format('Sem %s definido. Peça o cadastro à administradora.', p.rot)
                WHEN nullif(btrim(ca.document), '') IS NULL THEN 'Sem CPF/CNPJ cadastrado. O Asaas exige documento para emitir.'
           END
      FROM public.condominio_rateio_itens i
      CROSS JOIN p
      LEFT JOIN public.empreendimento_units un ON un.id = i.unit_id
      LEFT JOIN public.empreendimento_towers tw ON tw.id = un.tower_id
      LEFT JOIN oc alvo  ON alvo.unit_id = i.unit_id AND alvo.role = p.alvo
      LEFT JOIN oc outro ON outro.unit_id = i.unit_id AND outro.role <> p.alvo
      LEFT JOIN public.clients ca ON ca.id = alvo.client_id
      LEFT JOIN public.clients co ON co.id = outro.client_id
     WHERE i.rateio_id = p_rateio_id
     ORDER BY 3;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_rateio_cotas(uuid, text) FROM PUBLIC, anon, authenticated;

-- Rateio dentro do mandato de quem chama (id NULL quando não é).
CREATE OR REPLACE FUNCTION public.fn_sindico_rateio(p_cli uuid, p_rateio_id uuid)
 RETURNS public.condominio_rateios
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT r.* FROM public.condominio_rateios r
     WHERE r.id = p_rateio_id AND r.empreendimento_id IN (SELECT public.fn_sindico_predios(p_cli));
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_rateio(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Número de documento para quem NÃO é membro da org (o síndico). Mesma conta de
-- `fn_generate_document_number` (configuração da org, escopo pelos slots, mesmo
-- contador, mesma formatação), sem a checagem de membro de
-- `fn_next_document_seq` — quem chama já autorizou (login + mandato + org do
-- condomínio). Interna: sem EXECUTE para ninguém.
CREATE OR REPLACE FUNCTION public.fn_sindico_numero_documento(
    p_org_id uuid, p_doc_type text, p_values jsonb, p_default_slots jsonb, p_default_prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_slots JSONB;
    v_prefix TEXT;
    v_separator TEXT;
    v_padding SMALLINT;
    v_token TEXT;
    v_scope_parts TEXT[] := '{}';
    v_seq INTEGER;
BEGIN
    SELECT slots, prefix, separator, seq_padding
      INTO v_slots, v_prefix, v_separator, v_padding
      FROM public.document_numbering_settings
     WHERE organization_id = p_org_id AND doc_type = p_doc_type;
    IF NOT FOUND THEN
        v_slots := p_default_slots; v_prefix := p_default_prefix; v_separator := '-'; v_padding := 4;
    END IF;
    FOR v_token IN SELECT jsonb_array_elements_text(v_slots) LOOP
        IF v_token NOT IN ('EMPTY', 'PREFIX') AND COALESCE(p_values ->> v_token, '') <> '' THEN
            v_scope_parts := v_scope_parts || (p_values ->> v_token);
        END IF;
    END LOOP;
    INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
    VALUES (p_org_id, p_doc_type, array_to_string(v_scope_parts, '|'), 1, now())
    ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
        SET last_seq = public.document_number_counters.last_seq + 1, updated_at = now()
    RETURNING last_seq INTO v_seq;
    RETURN public.fn_format_document_number(v_slots, p_values, v_prefix, v_separator, v_seq, v_padding);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_numero_documento(uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;

-- ── 4. Prévia (leitura: link, login e prévia do admin) ───────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_rateio_previa(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_competencia date, p_criterio text,
    p_pagador text DEFAULT 'RESPONSAVEL', p_grupo uuid[] DEFAULT '{}', p_valor_fixo numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r   jsonb;
    v_cli uuid;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    IF p_competencia IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a competência.');
    END IF;
    RETURN public.fn_rateio_calcular(p_empreendimento_id, p_competencia, p_criterio, p_pagador, p_grupo, p_valor_fixo, NULL);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_rateio_previa(text, uuid, uuid, date, text, text, uuid[], numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sindico_portal_rateio_previa(text, uuid, uuid, date, text, text, uuid[], numeric) TO anon, authenticated;

-- ── 5. Salvar como rascunho (recalcula; nada do navegador vira valor) ────────
-- `p_descricoes` = { transaction_id: rótulo } — o texto PODADO que o portal
-- mostra (`rotuloDeDespesa`, a mesma poda do admin). Só vale para ids da
-- própria prévia; o resto é ignorado.
CREATE OR REPLACE FUNCTION public.sindico_portal_rateio_salvar(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_competencia date, p_tipo text, p_criterio text,
    p_pagador text DEFAULT 'RESPONSAVEL', p_grupo uuid[] DEFAULT '{}', p_valor_fixo numeric DEFAULT NULL,
    p_descricoes jsonb DEFAULT '{}', p_observacoes text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_org    uuid;
    v_motivo text;
    v_comp   date := date_trunc('month', p_competencia)::date;
    v_c      jsonb;
    v_id     uuid;
    v_ex     public.condominio_rateios;
    v_desc   jsonb := CASE WHEN jsonb_typeof(p_descricoes) = 'object' THEN p_descricoes ELSE '{}'::jsonb END;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(p_empreendimento_id);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    IF v_comp IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a competência.'); END IF;
    IF p_tipo IS NULL OR p_tipo NOT IN ('ORDINARIO', 'EXTRAORDINARIO') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Tipo de rateio inválido.');
    END IF;

    SELECT * INTO v_ex FROM public.condominio_rateios
     WHERE empreendimento_id = p_empreendimento_id AND competencia = v_comp AND tipo = p_tipo AND status <> 'CANCELADO'
     LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', format(
            'Já existe um rateio %s de %s (%s). Cancele o anterior antes de refazer.',
            CASE p_tipo WHEN 'ORDINARIO' THEN 'ordinário' ELSE 'extraordinário' END,
            to_char(v_comp, 'MM/YYYY'), CASE v_ex.status WHEN 'FECHADO' THEN 'fechado' ELSE 'em rascunho' END));
    END IF;

    v_c := public.fn_rateio_calcular(p_empreendimento_id, v_comp, p_criterio, p_pagador, p_grupo, p_valor_fixo, NULL);
    IF NOT (v_c ->> 'ok')::boolean THEN RETURN v_c; END IF;
    IF jsonb_array_length(v_c -> 'despesas') = 0 AND p_criterio <> 'FIXO' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Não há despesa nesta competência para ratear.');
    END IF;
    IF (v_c ->> 'totalRateado')::numeric <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Nenhuma unidade ficou com cota — confira o critério.');
    END IF;
    v_org := public.fn_org_do_condominio(p_empreendimento_id);

    INSERT INTO public.condominio_rateios (
        empreendimento_id, organization_id, cost_center_id, competencia, tipo, criterio, status,
        total_despesas, total_rateado, observacoes, criado_por_sindico_client_id)
    VALUES (
        p_empreendimento_id, v_org, (v_c ->> 'costCenterId')::uuid, v_comp, p_tipo, p_criterio, 'RASCUNHO',
        (v_c ->> 'totalDespesas')::numeric, (v_c ->> 'totalRateado')::numeric,
        nullif(left(btrim(coalesce(p_observacoes, '')), 1000), ''), v_cli)
    RETURNING id INTO v_id;

    -- Só as unidades que entraram (mesma regra do admin).
    INSERT INTO public.condominio_rateio_itens (rateio_id, organization_id, unit_id, peso, valor, client_id)
    SELECT v_id, v_org, (i ->> 'unitId')::uuid, (i ->> 'peso')::numeric, (i ->> 'valor')::numeric,
           nullif(i ->> 'clientId', '')::uuid
      FROM jsonb_array_elements(v_c -> 'itens') i
     WHERE (i ->> 'valor')::numeric > 0;

    INSERT INTO public.condominio_rateio_despesas (rateio_id, transaction_id, descricao, valor)
    SELECT v_id, (d ->> 'transaction_id')::uuid,
           coalesce(nullif(left(btrim(coalesce(v_desc ->> (d ->> 'transaction_id'), '')), 300), ''),
                    nullif(btrim(coalesce(d ->> 'descricao', '')), ''), 'Despesa sem descrição'),
           (d ->> 'valor')::numeric
      FROM jsonb_array_elements(v_c -> 'despesas') d;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, rateio_id, depois)
    VALUES (v_org, p_empreendimento_id, v_cli, v_nome, 'RATEIO_SALVAR', v_id, jsonb_build_object(
        'competencia', v_comp, 'tipo', p_tipo, 'criterio', p_criterio, 'pagador', p_pagador,
        'totalDespesas', v_c -> 'totalDespesas', 'totalRateado', v_c -> 'totalRateado'));

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_rateio_salvar(text, uuid, uuid, date, text, text, text, uuid[], numeric, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_rateio_salvar(text, uuid, uuid, date, text, text, text, uuid[], numeric, jsonb, text) TO authenticated;

-- ── 6. Fechar ─────────────────────────────────────────────────────────────────
-- Congela as descrições (como `congelarDescricoes`), numera como o admin
-- (CONDO_RATEIO com EMPREENDIMENTO/CENTRO_CUSTO/ORGANIZACAO) e, como quem fecha
-- é o próprio síndico, grava a aprovação dele antes de mudar o status — a
-- trava `trg_rateio_exige_aprovacao` confere justamente isso.
CREATE OR REPLACE FUNCTION public.sindico_portal_rateio_fechar(
    p_token text, p_client_id uuid, p_rateio_id uuid, p_descricoes jsonb DEFAULT '{}')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_rat    public.condominio_rateios;
    v_motivo text;
    v_num    text;
    v_ass    text;
    v_desc   jsonb := CASE WHEN jsonb_typeof(p_descricoes) = 'object' THEN p_descricoes ELSE '{}'::jsonb END;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
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

    v_ass := public.fn_rateio_assinatura(v_rat.id);
    UPDATE public.condominio_rateios
       SET aprovacao_status = 'APROVADO', aprovacao_em = now(),
           aprovacao_por_client_id = v_cli, aprovacao_por_nome = v_nome,
           aprovacao_observacao = 'Fechado pelo síndico no Portal do Síndico.', aprovacao_assinatura = v_ass
     WHERE id = v_rat.id;
    INSERT INTO public.condominio_rateio_decisoes (rateio_id, organization_id, decisao, observacao, client_id, nome, assinatura)
    VALUES (v_rat.id, v_rat.organization_id, 'APROVADO', 'Fechado pelo síndico no Portal do Síndico.', v_cli, v_nome, v_ass);

    UPDATE public.condominio_rateios
       SET status = 'FECHADO', fechado_em = now(), number = v_num
     WHERE id = v_rat.id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, rateio_id, depois)
    VALUES (v_rat.organization_id, v_rat.empreendimento_id, v_cli, v_nome, 'RATEIO_FECHAR', v_rat.id,
            jsonb_build_object('numero', v_num));

    RETURN jsonb_build_object('ok', true, 'numero', v_num);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_rateio_fechar(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_rateio_fechar(text, uuid, uuid, jsonb) TO authenticated;

-- ── 7. Cancelar ───────────────────────────────────────────────────────────────
-- Rascunho, ou fechado SEM cota gerada. Com recebível na rua, cancelar o rateio
-- deixaria cobrança viva sem a prestação de contas que a explica.
CREATE OR REPLACE FUNCTION public.sindico_portal_rateio_cancelar(
    p_token text, p_client_id uuid, p_rateio_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_rat    public.condominio_rateios;
    v_motivo text;
    v_txt    text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
    v_rat := public.fn_sindico_rateio(v_cli, p_rateio_id);
    IF v_rat.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Rateio não encontrado nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_rat.empreendimento_id);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    IF v_txt IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Diga por que o rateio está sendo cancelado.');
    END IF;
    IF v_rat.status = 'CANCELADO' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este rateio já está cancelado.');
    END IF;
    IF EXISTS (SELECT 1 FROM public.condominio_rateio_itens WHERE rateio_id = v_rat.id AND transaction_id IS NOT NULL) THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'As cotas deste rateio já viraram cobrança. Para refazer, peça à administradora o cancelamento das cotas.');
    END IF;

    UPDATE public.condominio_rateios
       SET status = 'CANCELADO',
           observacoes = concat_ws(E'\n', nullif(observacoes, ''),
               format('Cancelado pelo síndico (%s) em %s: %s', v_nome,
                      to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'), v_txt))
     WHERE id = v_rat.id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, rateio_id, antes, depois)
    VALUES (v_rat.organization_id, v_rat.empreendimento_id, v_cli, v_nome, 'RATEIO_CANCELAR', v_rat.id,
            jsonb_build_object('status', v_rat.status), jsonb_build_object('motivo', v_txt));

    RETURN jsonb_build_object('ok', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_rateio_cancelar(text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_rateio_cancelar(text, uuid, uuid, text) TO authenticated;

-- ── 8. Cotas: prévia (leitura) e geração dos recebíveis ──────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_rateio_cotas(
    p_token text, p_client_id uuid, p_rateio_id uuid, p_pagador text DEFAULT 'RESPONSAVEL')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r   jsonb;
    v_cli uuid;
    v_rat public.condominio_rateios;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    v_rat := public.fn_sindico_rateio(v_cli, p_rateio_id);
    IF v_rat.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Rateio não encontrado nos seus condomínios.');
    END IF;
    RETURN jsonb_build_object('ok', true, 'cotas', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'itemId', c.item_id, 'unitLabel', c.unit_label, 'valor', c.valor, 'clientNome', c.client_nome,
            'gerada', c.transaction_id IS NOT NULL, 'bloqueio', c.bloqueio) ORDER BY c.unit_label)
          FROM public.fn_rateio_cotas(v_rat.id, p_pagador) c), '[]'::jsonb));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_rateio_cotas(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sindico_portal_rateio_cotas(text, uuid, uuid, text) TO anon, authenticated;

-- Porta de gerarRecebiveis: mesmo `reference_id` ({item}-p{vencimento}), mesma
-- descrição, CREDIT sem obra (REGRA #2). Cada cota num sub-bloco: falhar uma
-- não deixa as outras sem recebível, e a falha volta NOMEADA.
CREATE OR REPLACE FUNCTION public.sindico_portal_rateio_gerar_cotas(
    p_token text, p_client_id uuid, p_rateio_id uuid, p_vencimento date, p_pagador text DEFAULT 'RESPONSAVEL')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r       jsonb;
    v_cli     uuid;
    v_nome    text;
    v_rat     public.condominio_rateios;
    v_motivo  text;
    v_c       record;
    v_tx      uuid;
    v_criados int := 0;
    v_pulados int := 0;
    v_falhas  jsonb := '[]'::jsonb;
    v_rot     text;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
    v_rat := public.fn_sindico_rateio(v_cli, p_rateio_id);
    IF v_rat.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Rateio não encontrado nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_rat.empreendimento_id);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    IF v_rat.status <> 'FECHADO' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só rateio fechado vira cobrança — feche antes de gerar.');
    END IF;
    IF p_vencimento IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o vencimento das cotas.');
    END IF;
    -- A trava de mês fechado não vale dentro de SECURITY DEFINER: chamada à mão.
    IF public.fn_period_is_closed(v_rat.organization_id, p_vencimento) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O mês do vencimento está fechado no Fechamento Mensal.');
    END IF;

    v_rot := format('Cota condominial %s %s',
                    CASE WHEN v_rat.tipo = 'EXTRAORDINARIO' THEN 'extraordinária' ELSE 'ordinária' END,
                    to_char(v_rat.competencia, 'MM/YYYY'));

    FOR v_c IN SELECT * FROM public.fn_rateio_cotas(v_rat.id, p_pagador) LOOP
        IF v_c.bloqueio IS NOT NULL THEN
            IF v_c.transaction_id IS NULL THEN v_pulados := v_pulados + 1; END IF;
            CONTINUE;
        END IF;
        BEGIN
            INSERT INTO public.internal_transactions (
                organization_id, source_system, reference_id, project_id, cost_center_id,
                transaction_date, due_date, amount, direction, description,
                entity_name, party_id, party_type, party_name, status, business_status,
                created_by, lancado_por_sindico_client_id)
            VALUES (
                v_rat.organization_id, 'CONDOMINIO_RATEIO', v_c.item_id::text || '-p' || to_char(p_vencimento, 'YYYY-MM-DD'),
                NULL, v_rat.cost_center_id,
                p_vencimento, p_vencimento, v_c.valor, 'CREDIT', v_rot || ' — ' || v_c.unit_label,
                v_c.client_nome, v_c.client_id, 'CLIENT', v_c.client_nome, 'PENDING', 'PREVISTO',
                auth.uid(), v_cli)
            RETURNING id INTO v_tx;
            UPDATE public.condominio_rateio_itens SET transaction_id = v_tx WHERE id = v_c.item_id;
            v_criados := v_criados + 1;
        EXCEPTION WHEN OTHERS THEN
            v_falhas := v_falhas || jsonb_build_object('unitLabel', v_c.unit_label, 'motivo', SQLERRM);
        END;
    END LOOP;

    IF v_criados > 0 THEN
        UPDATE public.condominio_rateios SET cobranca_gerada_em = now() WHERE id = v_rat.id;
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, rateio_id, depois)
    VALUES (v_rat.organization_id, v_rat.empreendimento_id, v_cli, v_nome, 'RATEIO_COTAS', v_rat.id,
            jsonb_build_object('vencimento', p_vencimento, 'pagador', p_pagador,
                               'criados', v_criados, 'pulados', v_pulados, 'falhas', v_falhas));

    RETURN jsonb_build_object('ok', true, 'criados', v_criados, 'pulados', v_pulados, 'falhas', v_falhas);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_rateio_gerar_cotas(text, uuid, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_rateio_gerar_cotas(text, uuid, uuid, date, text) TO authenticated;
