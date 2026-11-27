-- ============================================================================
-- Portal do Síndico › G3b: contratos recorrentes do condomínio (26/11/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G3)
-- Pronto quando: contrato criado pelo síndico gera as parcelas em Contas a pagar.
--
-- O app cria o contrato de fornecedor no navegador (ContractModal →
-- contractService.createContract) e gera a série em `syncRecurringToFinance`
-- (org sem obra: `internal_transactions` CONTRACT_RECURRING, DEBIT, PENDING /
-- PREVISTO, `reference_id` = '<contrato>-p<AAAA-MM-DD>'). O síndico não tem a
-- RLS de membro, então aqui é RPC — e a regra de datas vem para o banco:
--
--   `fn_contrato_vencimentos` = `firstRecurringDueDate` + `buildRecurringDueDates`
--   (âncora em início + prazo, primeiro `due_day` a partir dela, avança pela
--   periodicidade). Sem fim: até o 1º vencimento futuro + 11 ciclos (a janela de
--   `syncRecurringToFinance`). O dia de vencimento é limitado a 1–28 NO PORTAL:
--   de 29 a 31 o `setMonth` do JavaScript transborda (31/01 + 1 mês = 03/03) e a
--   série do app pula fevereiro — nesse intervalo as duas contas divergem; de 1 a
--   28 são idênticas (paridade provada com a função do app, 26/11).
--
-- Contrato nasce `Ativo` (o síndico é quem executa) na org do condomínio, com o
-- número da sequência SUPPLY_CONTRACT (máscara da org ou o padrão CSU-<emp>-0001
-- do catálogo do app). Título de org de condomínio não passa pela alçada
-- (`trg_titulo_nasce_na_alcada` isenta `fn_org_e_condominio`).
-- Encerrar: fim + `Encerrado`; parcela em aberto depois do fim é cancelada (a
-- paga fica; a de mês fechado fica e é contada).
--
-- REGRA #7: REVOKE de PUBLIC/anon em toda função; autorização DENTRO.
-- Reverter: DROP das 5 funções; coluna `contract_id` do histórico pode ficar.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos
    ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;
ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS',
                    'CONTA_SALVAR', 'RECEBER', 'DESFAZER_BAIXA', 'LANCAR_RECEITA',
                    'EXTRATO_IMPORTAR', 'EXTRATO_CONCILIAR', 'EXTRATO_DESFAZER', 'EXTRATO_IGNORAR',
                    'EXTRATO_RESTAURAR', 'EXTRATO_LANCAR',
                    'FORNECEDOR_EDITAR', 'FORNECEDOR_CONTA', 'CONTRATO_SALVAR', 'CONTRATO_ENCERRAR'));

-- ── 0. Vencimentos (a regra do app, para dia 1–28) ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_contrato_vencimentos(
    p_inicio date, p_dia integer, p_ciclo text, p_prazo integer, p_fim date, p_hoje date)
RETURNS SETOF date
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_passo integer := CASE p_ciclo WHEN 'Anual' THEN 12 WHEN 'Semestral' THEN 6 WHEN 'Trimestral' THEN 3
                                    WHEN 'Bimestral' THEN 2 ELSE 1 END;
    v_ref   date := p_inicio + greatest(coalesce(p_prazo, 0), 0);
    v_mes   date;          -- 1º dia do mês do vencimento corrente
    v_ate   date;
    v_d     date;
    v_i     integer := 0;
BEGIN
    IF p_inicio IS NULL OR p_dia IS NULL OR p_dia < 1 OR p_dia > 28 THEN RETURN; END IF;
    v_mes := date_trunc('month', v_ref)::date;
    IF v_mes + (p_dia - 1) < v_ref THEN
        v_mes := (v_mes + make_interval(months => v_passo))::date;
    END IF;
    IF p_fim IS NOT NULL THEN
        v_ate := p_fim;
    ELSE
        -- 1º vencimento futuro + 11 ciclos (syncRecurringToFinance).
        v_d := v_mes;
        WHILE v_d + (p_dia - 1) <= p_hoje LOOP
            v_d := (v_d + make_interval(months => v_passo))::date;
        END LOOP;
        v_ate := (v_d + make_interval(months => 11 * v_passo))::date + (p_dia - 1);
    END IF;
    LOOP
        v_d := (v_mes + make_interval(months => v_i * v_passo))::date + (p_dia - 1);
        EXIT WHEN v_d > v_ate OR v_i >= 1200;
        RETURN NEXT v_d;
        v_i := v_i + 1;
    END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_contrato_vencimentos(date, integer, text, integer, date, date) FROM PUBLIC, anon, authenticated;

-- Dados do contrato do portal validados. NULL = ok.
CREATE OR REPLACE FUNCTION public.fn_sindico_motivo_contrato(p_dados jsonb, p_emp uuid, p_org uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ini   date;
    v_fim   date;
    v_valor numeric;
    v_dia   integer;
BEGIN
    IF nullif(btrim(coalesce(p_dados ->> 'title', '')), '') IS NULL THEN RETURN 'Informe o objeto do contrato.'; END IF;
    IF nullif(p_dados ->> 'supplier_id', '') IS NULL THEN RETURN 'Escolha o fornecedor.'; END IF;
    IF NOT public.fn_sindico_fornecedor_visivel((p_dados ->> 'supplier_id')::uuid, p_org) THEN
        RETURN 'Fornecedor não cadastrado neste condomínio.';
    END IF;
    BEGIN
        v_ini   := (p_dados ->> 'start_date')::date;
        v_fim   := nullif(p_dados ->> 'end_date', '')::date;
        v_valor := (p_dados ->> 'value')::numeric;
        v_dia   := (p_dados ->> 'due_day')::integer;
    EXCEPTION WHEN others THEN
        RETURN 'Data, valor ou dia de vencimento inválido.';
    END;
    IF v_valor IS NULL OR v_valor < 0.01 THEN RETURN 'Informe o valor da parcela.'; END IF;
    IF v_ini IS NULL THEN RETURN 'Informe o início do contrato.'; END IF;
    IF v_fim IS NOT NULL AND v_fim < v_ini THEN RETURN 'O fim não pode ser antes do início.'; END IF;
    IF v_dia IS NULL OR v_dia < 1 OR v_dia > 28 THEN RETURN 'Dia de vencimento de 1 a 28.'; END IF;
    IF coalesce(p_dados ->> 'billing_cycle', 'Mensal') NOT IN ('Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual') THEN
        RETURN 'Periodicidade inválida.';
    END IF;
    -- Centro de custo, conta financeira e plano: a mesma checagem do lançamento.
    RETURN public.fn_sindico_validar_linha(jsonb_build_object(
        'description', p_dados ->> 'title', 'amount', v_valor, 'due_date', v_ini,
        'cost_center_id', p_dados ->> 'cost_center_id', 'category_id', p_dados ->> 'category_id',
        'plano_de_contas_id', p_dados ->> 'plano_de_contas_id'), p_emp, p_org);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_motivo_contrato(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 1. Ler ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_contratos(p_token text, p_client_id uuid, p_empreendimento_id uuid)
RETURNS jsonb
-- Não STABLE: o resolver grava `last_used_at` do link (leitura só-leitura falharia).
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r   jsonb;
    v_cli uuid;
    v_org uuid;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    IF public.fn_sindico_motivo_nao_opera(p_empreendimento_id) IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'contratos', '[]'::jsonb);
    END IF;
    v_org := public.fn_org_do_condominio(p_empreendimento_id);

    RETURN jsonb_build_object('ok', true, 'contratos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'id', c.id, 'numero', c.number, 'objeto', c.title, 'status', c.status,
            'fornecedorId', c.supplier_id, 'fornecedor', s.name,
            'valor', c.current_value, 'recorrente', coalesce(c.is_recurring, false),
            'periodicidade', c.billing_cycle, 'diaVencimento', c.due_day,
            'inicio', c.start_date, 'fim', c.end_date,
            'centroId', c.cost_center_id, 'categoriaId', c.category_id,
            'parcelas', p.total, 'pagas', p.pagas, 'emAberto', p.abertas,
            'proximoVencimento', p.proximo
        ) ORDER BY (c.status IN ('Encerrado', 'Cancelado', 'Concluído')), c.start_date DESC)
          FROM public.contracts c
          LEFT JOIN public.suppliers s ON s.id = c.supplier_id
          CROSS JOIN LATERAL (
              SELECT count(*) AS total,
                     count(*) FILTER (WHERE t.status = 'CONCILIATED' OR coalesce(t.business_status, '') = 'PAGO') AS pagas,
                     count(*) FILTER (WHERE t.status NOT IN ('CANCELLED', 'CONCILIATED')
                                        AND coalesce(t.business_status, '') NOT IN ('PAGO', 'CANCELADO')) AS abertas,
                     min(t.due_date) FILTER (WHERE t.status NOT IN ('CANCELLED', 'CONCILIATED')
                                               AND coalesce(t.business_status, '') NOT IN ('PAGO', 'CANCELADO')) AS proximo
                FROM public.internal_transactions t
               WHERE t.organization_id = v_org AND t.contract_id = c.id AND t.direction = 'DEBIT'
          ) p
         WHERE c.organization_id = v_org AND c.domain IN ('SUPRIMENTOS', 'SERVICOS')), '[]'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_contratos(text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_contratos(text, uuid, uuid) TO anon, authenticated;

-- ── 2. Prévia das parcelas (o que salvar vai gerar) ──────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_contrato_previa(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_dados jsonb)
RETURNS jsonb
-- Não STABLE: o resolver grava `last_used_at` do link (leitura só-leitura falharia).
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r    jsonb;
    v_cli  uuid;
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_ini  date;
    v_fim  date;
    v_dia  integer;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    BEGIN
        v_ini := (p_dados ->> 'start_date')::date;
        v_fim := nullif(p_dados ->> 'end_date', '')::date;
        v_dia := (p_dados ->> 'due_day')::integer;
    EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('ok', true, 'vencimentos', '[]'::jsonb, 'vencidas', 0);
    END;
    RETURN (SELECT jsonb_build_object('ok', true,
                'vencimentos', coalesce(jsonb_agg(d ORDER BY d), '[]'::jsonb),
                'vencidas', count(*) FILTER (WHERE d < v_hoje))
              FROM public.fn_contrato_vencimentos(v_ini, v_dia, coalesce(p_dados ->> 'billing_cycle', 'Mensal'), 0, v_fim, v_hoje) d);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_contrato_previa(text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_contrato_previa(text, uuid, uuid, jsonb) TO anon, authenticated;

-- ── 3. Criar o contrato e gerar a série ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_contrato_salvar(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_org    uuid;
    v_motivo text;
    v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_ini    date;
    v_fim    date;
    v_dia    integer;
    v_ciclo  text := coalesce(p_dados ->> 'billing_cycle', 'Mensal');
    v_valor  numeric;
    v_sup    public.suppliers;
    v_cat    public.financial_categories;
    v_num    text;
    v_id     uuid;
    v_tipo   text;
    v_d      date;
    v_n      integer := 0;
    v_meses  text[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
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
    v_org := public.fn_org_do_condominio(p_empreendimento_id);
    IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Dados do contrato inválidos.');
    END IF;
    v_motivo := public.fn_sindico_motivo_contrato(p_dados, p_empreendimento_id, v_org);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;

    v_ini   := (p_dados ->> 'start_date')::date;
    v_fim   := nullif(p_dados ->> 'end_date', '')::date;
    v_dia   := (p_dados ->> 'due_day')::integer;
    v_valor := round((p_dados ->> 'value')::numeric, 2);
    SELECT * INTO v_sup FROM public.suppliers WHERE id = (p_dados ->> 'supplier_id')::uuid;
    SELECT * INTO v_cat FROM public.financial_categories WHERE id = (p_dados ->> 'category_id')::uuid;
    v_tipo := CASE v_ciclo WHEN 'Anual' THEN 'ANUAL' WHEN 'Semestral' THEN 'SEMESTRAL' WHEN 'Trimestral' THEN 'TRIMESTRAL'
                           WHEN 'Bimestral' THEN 'BIMESTRAL' ELSE 'MENSAL' END;

    -- Parcela em mês fechado não nasce (a trava não vale aqui dentro).
    SELECT d INTO v_d FROM public.fn_contrato_vencimentos(v_ini, v_dia, v_ciclo, 0, v_fim, v_hoje) d
     WHERE public.fn_period_is_closed(v_org, d) ORDER BY d LIMIT 1;
    IF v_d IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            format('A parcela de %s cairia num mês fechado no Fechamento Mensal — comece o contrato depois.', to_char(v_d, 'MM/YYYY')));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fn_contrato_vencimentos(v_ini, v_dia, v_ciclo, 0, v_fim, v_hoje)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Nenhum vencimento entre o início e o fim — confira as datas.');
    END IF;

    v_num := public.fn_sindico_numero_documento(
        v_org, 'SUPPLY_CONTRACT',
        jsonb_strip_nulls(jsonb_build_object(
            'EMPREENDIMENTO', (SELECT nullif(btrim(code), '') FROM public.empreendimentos WHERE id = p_empreendimento_id),
            'CENTRO_CUSTO',   (SELECT nullif(btrim(code), '') FROM public.cost_centers_v2 WHERE id = (p_dados ->> 'cost_center_id')::uuid),
            'FORNECEDOR',     nullif(btrim(coalesce(v_sup.code, '')), ''),
            'ORGANIZACAO',    (SELECT nullif(btrim(code), '') FROM public.organizations WHERE id = v_org))),
        '["PREFIX","EMPREENDIMENTO","OBRA"]'::jsonb, 'CSU');

    INSERT INTO public.contracts (
        organization_id, number, title, description, status, domain, direction, nature, contract_type,
        supplier_id, start_date, end_date, is_recurring, billing_cycle, due_day, payment_days,
        original_value, current_value, installment_value_mode, payment_term_type, payment_installments,
        payment_method, cost_center_id, category_id, plano_de_contas_id
    ) VALUES (
        v_org, v_num, btrim(p_dados ->> 'title'), nullif(btrim(coalesce(p_dados ->> 'description', '')), ''),
        'Ativo', 'SUPRIMENTOS', 'INCOMING', 'Serviço', 'Outros',
        v_sup.id, v_ini, v_fim, true, v_ciclo, v_dia, 0,
        v_valor, v_valor, 'FIXO', 'Parcelado', 1,
        nullif(p_dados ->> 'payment_method', ''), (p_dados ->> 'cost_center_id')::uuid, v_cat.id,
        nullif(p_dados ->> 'plano_de_contas_id', '')::uuid
    ) RETURNING id INTO v_id;

    -- A série: as mesmas colunas de syncRecurringToFinance (org sem obra).
    FOR v_d IN SELECT d FROM public.fn_contrato_vencimentos(v_ini, v_dia, v_ciclo, 0, v_fim, v_hoje) d ORDER BY d LOOP
        v_n := v_n + 1;
        INSERT INTO public.internal_transactions (
            organization_id, source_system, contract_id, reference_id, project_id,
            transaction_date, due_date, amount, direction, description,
            category, category_id, entity_name, supplier_id, party_id, party_type, party_name,
            status, business_status, installment_type, cost_center_id, plano_de_contas_id,
            created_by, lancado_por_sindico_client_id
        ) VALUES (
            v_org, 'CONTRACT_RECURRING', v_id, v_id::text || '-p' || to_char(v_d, 'YYYY-MM-DD'), NULL,
            v_d, v_d, v_valor, 'DEBIT',
            format('Fatura Contrato %s (%s) - %s de %s', v_num, v_n, v_meses[extract(month FROM v_d)::int], extract(year FROM v_d)::int),
            v_cat.name, v_cat.id, v_sup.name, v_sup.id, NULL, 'SUPPLIER', v_sup.name,
            'PENDING', 'PREVISTO', v_tipo, (p_dados ->> 'cost_center_id')::uuid, nullif(p_dados ->> 'plano_de_contas_id', '')::uuid,
            auth.uid(), v_cli
        );
    END LOOP;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, supplier_id, contract_id, depois)
    VALUES (v_org, p_empreendimento_id, v_cli, v_nome, 'CONTRATO_SALVAR', v_sup.id, v_id,
            jsonb_build_object('numero', v_num, 'parcelas', v_n, 'valor', v_valor, 'inicio', v_ini, 'fim', v_fim,
                               'periodicidade', v_ciclo, 'dia', v_dia));

    RETURN jsonb_build_object('ok', true, 'id', v_id, 'numero', v_num, 'parcelas', v_n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_contrato_salvar(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_contrato_salvar(text, uuid, uuid, jsonb) TO authenticated;

-- ── 4. Encerrar ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_contrato_encerrar(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_contrato_id uuid, p_fim date, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r         jsonb;
    v_cli       uuid;
    v_nome      text;
    v_org       uuid;
    v_motivo    text;
    v_obs       text := nullif(btrim(coalesce(p_motivo, '')), '');
    v_c         public.contracts;
    v_t         record;
    v_canc      integer := 0;
    v_mantidas  integer := 0;
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
    v_org := public.fn_org_do_condominio(p_empreendimento_id);

    SELECT * INTO v_c FROM public.contracts WHERE id = p_contrato_id AND organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Contrato não encontrado neste condomínio.'); END IF;
    IF v_c.status IN ('Encerrado', 'Cancelado', 'Concluído') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este contrato já está encerrado.');
    END IF;
    IF v_obs IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Diga o motivo do encerramento.'); END IF;
    IF p_fim IS NULL OR p_fim < v_c.start_date THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'A data de encerramento não pode ser antes do início do contrato.');
    END IF;

    FOR v_t IN
        SELECT t.id, t.due_date, t.transaction_date FROM public.internal_transactions t
         WHERE t.organization_id = v_org AND t.contract_id = v_c.id AND t.direction = 'DEBIT'
           AND coalesce(t.due_date, t.transaction_date) > p_fim
           AND t.status NOT IN ('CANCELLED', 'CONCILIATED')
           AND coalesce(t.business_status, '') NOT IN ('PAGO', 'CANCELADO')
         FOR UPDATE
    LOOP
        IF public.fn_period_is_closed(v_org, v_t.transaction_date) THEN
            v_mantidas := v_mantidas + 1;
            CONTINUE;
        END IF;
        UPDATE public.internal_transactions
           SET status = 'CANCELLED', business_status = 'CANCELADO', updated_at = now()
         WHERE id = v_t.id;
        v_canc := v_canc + 1;
    END LOOP;

    UPDATE public.contracts SET end_date = p_fim, status = 'Encerrado', updated_at = now() WHERE id = v_c.id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, supplier_id, contract_id, antes, depois)
    VALUES (v_org, p_empreendimento_id, v_cli, v_nome, 'CONTRATO_ENCERRAR', v_c.supplier_id, v_c.id,
            jsonb_build_object('status', v_c.status, 'fim', v_c.end_date),
            jsonb_build_object('fim', p_fim, 'motivo', v_obs, 'parcelasCanceladas', v_canc, 'parcelasMantidas', v_mantidas));

    RETURN jsonb_build_object('ok', true, 'canceladas', v_canc, 'mantidas', v_mantidas);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_contrato_encerrar(text, uuid, uuid, uuid, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_contrato_encerrar(text, uuid, uuid, uuid, date, text) TO authenticated;
