-- ============================================================================
-- Portal do Síndico › G2a: conta bancária e recebimentos do condomínio (24/10/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G2)
-- Pedido: "o sindico é o gerenciador / executor do condominio e ele precisa de
-- total acesso para edicao" — pelo portal (ele não é da construtora).
--
-- O síndico, LOGADO, passa a: cadastrar/editar/desativar a conta bancária (ou
-- caixa) do condomínio; dar baixa em recebível (cota, receita); desfazer uma
-- baixa (a pagar ou a receber) que ainda não foi casada com o extrato; lançar
-- receita avulsa. Mesmo molde das RPCs do Financeiro (#129): fn_sindico_operar
-- (login) + mandato + org própria; grava na fn_org_do_condominio; trava de mês
-- fechado chamada À MÃO (o gatilho não vale em SECURITY DEFINER); log em
-- sindico_financeiro_eventos.
--
-- Fica de fora (consciente): a costura com a Torre de processos
-- (`processService.triggerForFinancialTitle`) que a baixa do admin dispara no
-- navegador — a org do condomínio não tem processo configurado.
--
-- REGRA #7: REVOKE de PUBLIC/anon em toda função; autorização DENTRO.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS',
                    'CONTA_SALVAR', 'RECEBER', 'DESFAZER_BAIXA', 'LANCAR_RECEITA'));
ALTER TABLE public.sindico_financeiro_eventos
    ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

-- ── 0. Conta que atende o condomínio — sem a checagem de MEMBRO ─────────────
-- `fn_orgs_atendidas_pela_conta` devolve VAZIO quando quem chama
-- (authenticated/anon) não é membro da org dona da conta — e o síndico nunca
-- é. Achado na prova da G2a (24/10): para o síndico real, a lista de contas do
-- formulário vinha sempre vazia e toda baixa com conta era recusada ("Conta de
-- pagamento não atende este condomínio"); a prova do #129 rodou como dono do
-- banco e não viu. Aqui a mesma regra para org de condomínio (a dona, ou
-- vínculo explícito em payment_account_organizations; o ramo "atende todas"
-- já exclui condomínio desde 21/10), para quem JÁ autorizou o síndico.
CREATE OR REPLACE FUNCTION public.fn_sindico_conta_atende(p_conta uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.payment_accounts pa
         WHERE pa.id = p_conta
           AND (pa.organization_id = p_org
                OR EXISTS (SELECT 1 FROM public.payment_account_organizations pao
                            WHERE pao.payment_account_id = pa.id AND pao.organization_id = p_org)));
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_conta_atende(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 1. Contas bancárias do condomínio ────────────────────────────────────────
-- Leitura (link, login, prévia): só condomínio com org própria — no 007 antigo
-- a lista seria a da construtora inteira (o vazamento de 24/10).
CREATE OR REPLACE FUNCTION public.sindico_portal_contas(p_token text, p_client_id uuid, p_empreendimento_id uuid)
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
    IF public.fn_sindico_motivo_nao_opera(p_empreendimento_id) IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'contas', '[]'::jsonb);
    END IF;
    RETURN jsonb_build_object('ok', true, 'contas', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'id', pa.id, 'codigo', pa.code, 'nome', pa.name, 'tipo', pa.kind, 'banco', pa.bank,
            'agencia', pa.branch, 'numero', pa.account_number, 'descricao', pa.description,
            'saldoInicial', pa.opening_balance, 'saldoInicialEm', pa.opening_balance_date,
            'ativa', pa.is_active,
            'emUso', EXISTS (SELECT 1 FROM public.internal_transactions t WHERE t.payment_account_id = pa.id)
        ) ORDER BY pa.is_active DESC, pa.code NULLS LAST, pa.name)
          FROM public.payment_accounts pa
         WHERE pa.organization_id = public.fn_org_do_condominio(p_empreendimento_id)), '[]'::jsonb));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_contas(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sindico_portal_contas(text, uuid, uuid) TO anon, authenticated;

-- Criar (p_conta_id NULL) ou editar. Conta de gateway (Asaas) não é editada
-- aqui: ela nasce e muda pela configuração do Asaas.
CREATE OR REPLACE FUNCTION public.sindico_portal_salvar_conta(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_conta_id uuid, p_dados jsonb)
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
    v_atual  public.payment_accounts;
    v_id     uuid;
    v_tipo   text := coalesce(nullif(btrim(coalesce(p_dados ->> 'tipo', '')), ''), 'banco');
    v_conta  text := nullif(left(btrim(coalesce(p_dados ->> 'nome', '')), 120), '');
    v_saldo  numeric;
    v_desde  date;
    v_ativa  boolean := coalesce((p_dados ->> 'ativa')::boolean, true);
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
        RETURN jsonb_build_object('ok', false, 'motivo', 'Dados da conta inválidos.');
    END IF;
    IF v_conta IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Dê um nome à conta.'); END IF;
    IF v_tipo NOT IN ('banco', 'caixa') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Tipo de conta inválido (banco ou caixa).');
    END IF;
    BEGIN
        v_saldo := coalesce(nullif(p_dados ->> 'saldoInicial', '')::numeric, 0);
        v_desde := nullif(p_dados ->> 'saldoInicialEm', '')::date;
    EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Saldo inicial ou data inválidos.');
    END;
    IF v_saldo <> 0 AND v_desde IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a data do saldo inicial.');
    END IF;

    IF p_conta_id IS NOT NULL THEN
        SELECT * INTO v_atual FROM public.payment_accounts WHERE id = p_conta_id AND organization_id = v_org FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Conta não encontrada neste condomínio.');
        END IF;
        IF v_atual.kind = 'gateway' THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'A conta do Asaas muda pela configuração do Asaas, não por aqui.');
        END IF;
        UPDATE public.payment_accounts
           SET name = v_conta, kind = v_tipo,
               bank = nullif(left(btrim(coalesce(p_dados ->> 'banco', '')), 80), ''),
               branch = nullif(left(btrim(coalesce(p_dados ->> 'agencia', '')), 20), ''),
               account_number = nullif(left(btrim(coalesce(p_dados ->> 'numero', '')), 30), ''),
               description = nullif(left(btrim(coalesce(p_dados ->> 'descricao', '')), 300), ''),
               opening_balance = v_saldo, opening_balance_date = v_desde, is_active = v_ativa
         WHERE id = p_conta_id
        RETURNING id INTO v_id;
    ELSE
        INSERT INTO public.payment_accounts (
            organization_id, empresa_id, code, name, kind, bank, branch, account_number, description,
            opening_balance, opening_balance_date, is_active, serves_all_organizations)
        VALUES (
            v_org, (SELECT c.id FROM public.companies c WHERE c.org_id = v_org AND c.is_headquarters LIMIT 1),
            public.get_next_payment_account_code(v_org), v_conta, v_tipo,
            nullif(left(btrim(coalesce(p_dados ->> 'banco', '')), 80), ''),
            nullif(left(btrim(coalesce(p_dados ->> 'agencia', '')), 20), ''),
            nullif(left(btrim(coalesce(p_dados ->> 'numero', '')), 30), ''),
            nullif(left(btrim(coalesce(p_dados ->> 'descricao', '')), 300), ''),
            v_saldo, v_desde, v_ativa, false)
        RETURNING id INTO v_id;
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, payment_account_id, antes, depois)
    SELECT v_org, p_empreendimento_id, v_cli, v_nome, 'CONTA_SALVAR', v_id,
           CASE WHEN v_atual.id IS NULL THEN NULL ELSE to_jsonb(v_atual) END, to_jsonb(pa)
      FROM public.payment_accounts pa WHERE pa.id = v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_salvar_conta(text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_salvar_conta(text, uuid, uuid, uuid, jsonb) TO authenticated;

-- ── 2. Receber (baixa de recebível: cota, receita) ──────────────────────────
-- Espelho de `receivableService.darBaixa` (RECEBIDO + CONCILIATED + data e
-- forma), mais a conta onde o dinheiro entrou.
CREATE OR REPLACE FUNCTION public.sindico_portal_receber_titulo(
    p_token text, p_client_id uuid, p_titulo_id uuid, p_data date, p_forma text DEFAULT NULL, p_conta uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_emp    uuid;
    v_org    uuid;
    v_recusa text;
    v_t      public.internal_transactions;
    v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';

    v_emp := public.fn_sindico_condominio_do_titulo(p_titulo_id, v_cli);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Título não encontrado nos seus condomínios.');
    END IF;
    v_recusa := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;
    v_org := public.fn_org_do_condominio(v_emp);

    SELECT * INTO v_t FROM public.internal_transactions WHERE id = p_titulo_id FOR UPDATE;
    IF v_t.organization_id <> v_org THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título está em outra organização e só a administradora dá baixa.');
    END IF;
    IF v_t.direction <> 'CREDIT' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só títulos a receber são recebidos por aqui.');
    END IF;
    IF v_t.status = 'CANCELLED' OR coalesce(v_t.business_status, '') = 'CANCELADO' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título está cancelado.');
    END IF;
    IF v_t.status = 'CONCILIATED' OR coalesce(v_t.business_status, '') IN ('PAGO', 'RECEBIDO') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título já está recebido.');
    END IF;
    v_recusa := public.fn_sindico_titulo_em_asaas(p_titulo_id);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;
    IF p_data IS NULL OR p_data > v_hoje THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a data do recebimento (não pode ser futura).');
    END IF;
    IF p_forma IS NOT NULL AND p_forma NOT IN ('PIX', 'BOLETO', 'TED', 'DOC', 'DINHEIRO', 'CHEQUE', 'PERMUTA') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Forma de pagamento inválida.');
    END IF;
    IF p_conta IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.payment_accounts pa
         WHERE pa.id = p_conta AND coalesce(pa.is_active, true)
           AND public.fn_sindico_conta_atende(pa.id, v_org)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Conta não atende este condomínio.');
    END IF;
    IF public.fn_period_is_closed(v_org, v_t.transaction_date) THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            format('O mês %s está fechado no Fechamento Mensal.', to_char(v_t.transaction_date, 'MM/YYYY')));
    END IF;

    UPDATE public.internal_transactions
       SET business_status = 'RECEBIDO', status = 'CONCILIATED', payment_date = p_data,
           payment_type = coalesce(p_forma, payment_type),
           payment_account_id = coalesce(p_conta, payment_account_id),
           updated_at = now()
     WHERE id = p_titulo_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, antes, depois)
    VALUES (v_org, v_emp, v_cli, v_nome, 'RECEBER', p_titulo_id,
            jsonb_build_object('status', v_t.status, 'business_status', v_t.business_status),
            jsonb_build_object('payment_date', p_data, 'payment_type', p_forma, 'payment_account_id', p_conta));

    RETURN jsonb_build_object('ok', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_receber_titulo(text, uuid, uuid, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_receber_titulo(text, uuid, uuid, date, text, uuid) TO authenticated;

-- ── 3. Desfazer a baixa (pagar ou receber) ──────────────────────────────────
-- Espelho de `receivableService.updateStatus(id, 'PREVISTO')`: status e data
-- voltam. Recusa a baixa já casada com o EXTRATO (desfazer aqui deixaria a
-- conciliação apontando para título em aberto) e a do Asaas.
CREATE OR REPLACE FUNCTION public.sindico_portal_desfazer_baixa(
    p_token text, p_client_id uuid, p_titulo_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_emp    uuid;
    v_org    uuid;
    v_recusa text;
    v_t      public.internal_transactions;
    v_txt    text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';

    v_emp := public.fn_sindico_condominio_do_titulo(p_titulo_id, v_cli);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Título não encontrado nos seus condomínios.');
    END IF;
    v_recusa := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;
    v_org := public.fn_org_do_condominio(v_emp);
    IF v_txt IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Diga por que a baixa está sendo desfeita.');
    END IF;

    SELECT * INTO v_t FROM public.internal_transactions WHERE id = p_titulo_id FOR UPDATE;
    IF v_t.organization_id <> v_org THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título está em outra organização e só a administradora mexe nele.');
    END IF;
    IF NOT (v_t.status = 'CONCILIATED' OR coalesce(v_t.business_status, '') IN ('PAGO', 'RECEBIDO')) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título não tem baixa para desfazer.');
    END IF;
    IF EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = p_titulo_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'Esta baixa já foi casada com o extrato do banco. Desfaça a conciliação antes (fale com a administradora).');
    END IF;
    v_recusa := public.fn_sindico_titulo_em_asaas(p_titulo_id);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;
    IF public.fn_period_is_closed(v_org, v_t.transaction_date)
       OR (v_t.payment_date IS NOT NULL AND public.fn_period_is_closed(v_org, v_t.payment_date)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O mês deste título ou do pagamento está fechado no Fechamento Mensal.');
    END IF;

    UPDATE public.internal_transactions
       SET business_status = 'PREVISTO', status = 'PENDING', payment_date = NULL, updated_at = now()
     WHERE id = p_titulo_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, antes, depois)
    VALUES (v_org, v_emp, v_cli, v_nome, 'DESFAZER_BAIXA', p_titulo_id,
            jsonb_build_object('status', v_t.status, 'business_status', v_t.business_status, 'payment_date', v_t.payment_date),
            jsonb_build_object('motivo', v_txt));

    RETURN jsonb_build_object('ok', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_desfazer_baixa(text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_desfazer_baixa(text, uuid, uuid, text) TO authenticated;

-- ── 4. Receita avulsa ────────────────────────────────────────────────────────
-- Mesma validação de linha do lançamento a pagar (centro de custo do
-- condomínio, conta financeira, plano, conta de pagamento, mês fechado).
-- Quem paga: um ocupante do condomínio (client_id) ou um nome livre.
CREATE OR REPLACE FUNCTION public.sindico_portal_lancar_receber(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_linha jsonb,
    p_ja_recebido boolean DEFAULT false, p_data_recebimento date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r       jsonb;
    v_cli     uuid;
    v_nome    text;
    v_org     uuid;
    v_motivo  text;
    v_hoje    date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_pagador uuid := nullif(p_linha ->> 'client_id', '')::uuid;
    v_parte   text;
    v_cat     text;
    v_id      uuid;
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
    IF jsonb_typeof(p_linha) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Dados da receita inválidos.');
    END IF;

    v_motivo := public.fn_sindico_validar_linha(p_linha - 'supplier_id', p_empreendimento_id, v_org);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;

    IF v_pagador IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.unit_occupancies o
              JOIN public.empreendimento_units un ON un.id = o.unit_id
              JOIN public.empreendimento_towers tw ON tw.id = un.tower_id
             WHERE tw.empreendimento_id = p_empreendimento_id AND o.client_id = v_pagador) THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Quem paga precisa ser ocupante deste condomínio.');
        END IF;
        SELECT c.name INTO v_parte FROM public.clients c WHERE c.id = v_pagador;
    ELSE
        v_parte := nullif(left(btrim(coalesce(p_linha ->> 'party_name', '')), 200), '');
    END IF;
    IF v_parte IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe quem paga.');
    END IF;

    IF p_ja_recebido THEN
        IF p_data_recebimento IS NULL OR p_data_recebimento > v_hoje THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a data do recebimento (não pode ser futura).');
        END IF;
        IF public.fn_period_is_closed(v_org, p_data_recebimento) THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'O mês do recebimento está fechado no Fechamento Mensal.');
        END IF;
    END IF;

    SELECT fc.name INTO v_cat FROM public.financial_categories fc WHERE fc.id = (p_linha ->> 'category_id')::uuid;
    INSERT INTO public.internal_transactions (
        organization_id, source_system, direction, reference_id,
        transaction_date, due_date, competencia_date, amount, description,
        party_id, party_type, party_name, entity_name,
        cost_center_id, plano_de_contas_id, category_id, category,
        payment_type, payment_account_id, installment_type,
        status, business_status, approval_status, payment_date,
        created_by, lancado_por_sindico_client_id
    ) VALUES (
        v_org, 'MANUAL', 'CREDIT', gen_random_uuid()::text || ':p1',
        (p_linha ->> 'due_date')::date, (p_linha ->> 'due_date')::date,
        coalesce(nullif(p_linha ->> 'competencia_date', '')::date, date_trunc('month', (p_linha ->> 'due_date')::date)::date),
        round((p_linha ->> 'amount')::numeric, 2), btrim(p_linha ->> 'description'),
        v_pagador, 'CLIENT', v_parte, v_parte,
        (p_linha ->> 'cost_center_id')::uuid, nullif(p_linha ->> 'plano_de_contas_id', '')::uuid,
        (p_linha ->> 'category_id')::uuid, v_cat,
        nullif(p_linha ->> 'payment_type', ''), nullif(p_linha ->> 'payment_account_id', '')::uuid, 'UNICA',
        CASE WHEN p_ja_recebido THEN 'CONCILIATED' ELSE 'PENDING' END,
        CASE WHEN p_ja_recebido THEN 'RECEBIDO' ELSE 'PREVISTO' END,
        'APROVADO', CASE WHEN p_ja_recebido THEN p_data_recebimento END,
        auth.uid(), v_cli
    ) RETURNING id INTO v_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, depois)
    SELECT v_org, p_empreendimento_id, v_cli, v_nome, 'LANCAR_RECEITA', t.id, to_jsonb(t)
      FROM public.internal_transactions t WHERE t.id = v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_lancar_receber(text, uuid, uuid, jsonb, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_lancar_receber(text, uuid, uuid, jsonb, boolean, date) TO authenticated;

-- ── 5. Leitura do financeiro: + `conciliadoExtrato` por título ──────────────
-- Corpo copiado do BANCO (pg_get_functiondef, 24/10/2026, md5 4ab4553e…) com
-- DUAS trocas: o campo novo (para o botão "Desfazer" dizer o motivo antes) e a
-- lista de contas por `fn_sindico_conta_atende` (seção 0).

CREATE OR REPLACE FUNCTION public.sindico_portal_financeiro(p_token text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_competencia date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r    jsonb;
    v_cli  uuid;
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_ini  date;
    v_fim  date;
    v_condominios jsonb;
    v_titulos     jsonb;
BEGIN
    -- VOLATILE de propósito: o resolver grava `last_used_at` no token.
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;

    v_ini := date_trunc('month', coalesce(p_competencia, v_hoje))::date;
    v_fim := (v_ini + interval '1 month')::date;

    SELECT coalesce(jsonb_agg(c ORDER BY c ->> 'nome'), '[]'::jsonb) INTO v_condominios
      FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'nome', e.name,
            'codigo', e.code,
            'podeOperar', public.fn_sindico_motivo_nao_opera(e.id) IS NULL,
            'motivoNaoOpera', public.fn_sindico_motivo_nao_opera(e.id),
            'centros', coalesce((
                SELECT jsonb_agg(jsonb_build_object('id', cc.id, 'code', cc.code, 'name', cc.name, 'parentId', cc.parent_id) ORDER BY cc.code)
                  FROM public.cost_centers_v2 cc WHERE cc.empreendimento_id = e.id), '[]'::jsonb),
            -- Cadastros SÓ para condomínio com organização própria: o 007 (ainda na
            -- org da construtora) receberia os fornecedores e contas da construtora
            -- inteira — e ele não grava nada pelo portal mesmo.
            'categorias', CASE WHEN e.condominio_org_id IS NULL THEN '[]'::jsonb ELSE coalesce((
                SELECT jsonb_agg(jsonb_build_object('id', fc.id, 'name', fc.name, 'parentId', fc.parent_id, 'nature', fc.nature)
                                 ORDER BY fc.sort_order NULLS LAST, fc.name)
                  FROM public.financial_categories fc
                 WHERE fc.organization_id IS NULL OR fc.organization_id = public.fn_org_do_condominio(e.id)), '[]'::jsonb) END,
            'planos', CASE WHEN e.condominio_org_id IS NULL THEN '[]'::jsonb ELSE coalesce((
                SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'code', pc.code, 'name', pc.name) ORDER BY pc.code)
                  FROM public.plano_de_contas pc WHERE pc.organization_id = public.fn_org_do_condominio(e.id)), '[]'::jsonb) END,
            'contas', CASE WHEN e.condominio_org_id IS NULL THEN '[]'::jsonb ELSE coalesce((
                SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'name', pa.name, 'bank', pa.bank) ORDER BY pa.name)
                  FROM public.payment_accounts pa
                 WHERE coalesce(pa.is_active, true)
                   AND public.fn_sindico_conta_atende(pa.id, public.fn_org_do_condominio(e.id))), '[]'::jsonb) END,
            'fornecedores', CASE WHEN e.condominio_org_id IS NULL THEN '[]'::jsonb ELSE coalesce((
                SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'nickname', s.nickname,
                                                    'document', s.document, 'category', s.category) ORDER BY s.name)
                  FROM public.suppliers s
                 WHERE s.organization_id = public.fn_org_do_condominio(e.id)
                    OR EXISTS (SELECT 1 FROM public.supplier_org_shares sh
                                WHERE sh.supplier_id = s.id AND sh.target_org_id = public.fn_org_do_condominio(e.id))), '[]'::jsonb) END
        ) AS c
          FROM public.empreendimentos e
         WHERE e.id IN (SELECT public.fn_sindico_predios(v_cli))
      ) q;

    SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'vencimento', x ->> 'id'), '[]'::jsonb) INTO v_titulos
      FROM (
        SELECT jsonb_build_object(
            'id', t.id,
            'condominioId', cc.empreendimento_id,
            'direcao', t.direction,
            'origem', t.source_system,
            'descricao', t.description,
            'credor', coalesce(s.name, nullif(t.party_name, ''), nullif(t.entity_name, '')),
            'supplierId', t.supplier_id,
            'vencimento', coalesce(t.due_date, t.transaction_date),
            'competencia', t.competencia_date,
            'valor', t.amount,
            'status', t.status,
            'businessStatus', t.business_status,
            'approvalStatus', t.approval_status,
            'pagoEm', t.payment_date,
            'formaPagamento', t.payment_type,
            'contaId', t.payment_account_id,
            'centroId', t.cost_center_id,
            'categoriaId', t.category_id,
            'categoria', t.category,
            'planoId', t.plano_de_contas_id,
            'lancadoPeloSindico', t.lancado_por_sindico_client_id IS NOT NULL,
            'travaAsaas', public.fn_sindico_titulo_em_asaas(t.id),
            -- G2a: baixa já casada com o extrato não se desfaz pelo portal.
            'conciliadoExtrato', EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = t.id)
        ) AS x
          FROM public.internal_transactions t
          JOIN public.cost_centers_v2 cc ON cc.id = t.cost_center_id
          LEFT JOIN public.suppliers s ON s.id = t.supplier_id
         WHERE cc.empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli))
           AND coalesce(t.entry_type, 'PRINCIPAL') = 'PRINCIPAL'
           AND (
                (coalesce(t.due_date, t.transaction_date) >= v_ini AND coalesce(t.due_date, t.transaction_date) < v_fim)
             OR (t.payment_date >= v_ini AND t.payment_date < v_fim)
             -- Em aberto e vencido antes do mês: a conta atrasada não some ao virar o mês.
             OR (coalesce(t.due_date, t.transaction_date) < v_ini
                 AND t.status NOT IN ('CONCILIATED', 'CANCELLED')
                 AND coalesce(t.business_status, '') NOT IN ('PAGO', 'RECEBIDO', 'CANCELADO'))
           )
      ) q;

    RETURN jsonb_build_object(
        'ok', true,
        'competencia', v_ini,
        'hoje', v_hoje,
        'condominios', v_condominios,
        'titulos', v_titulos);
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_financeiro(text, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sindico_portal_financeiro(text, uuid, date) TO anon, authenticated;

-- ── 6. As duas que checavam a conta pela função com o gate de membro ────────
-- Corpos copiados do BANCO (24/10/2026; md5 027d3473… e ff62c339…), UMA troca
-- em cada: `fn_sindico_conta_atende` no lugar de `fn_orgs_atendidas_pela_conta`.
CREATE OR REPLACE FUNCTION public.fn_sindico_validar_linha(p_linha jsonb, p_empreendimento_id uuid, p_org uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_valor numeric;
    v_venc  date;
BEGIN
    IF nullif(btrim(coalesce(p_linha ->> 'description', '')), '') IS NULL THEN
        RETURN 'Informe a descrição.';
    END IF;
    BEGIN
        v_valor := (p_linha ->> 'amount')::numeric;
        v_venc  := (p_linha ->> 'due_date')::date;
    EXCEPTION WHEN others THEN
        RETURN 'Valor ou vencimento inválido.';
    END;
    IF v_valor IS NULL OR v_valor < 0.01 THEN RETURN 'Informe um valor maior que zero.'; END IF;
    IF v_venc IS NULL THEN RETURN 'Informe o vencimento.'; END IF;
    IF v_venc > DATE '9999-12-31' OR v_venc < DATE '2000-01-01' THEN RETURN 'Vencimento fora do intervalo aceito.'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cost_centers_v2 cc
                    WHERE cc.id = nullif(p_linha ->> 'cost_center_id', '')::uuid
                      AND cc.empreendimento_id = p_empreendimento_id) THEN
        RETURN 'Escolha um centro de custo deste condomínio.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.financial_categories fc
                    WHERE fc.id = nullif(p_linha ->> 'category_id', '')::uuid
                      AND (fc.organization_id IS NULL OR fc.organization_id = p_org)) THEN
        RETURN 'Escolha a conta financeira.';
    END IF;
    IF nullif(p_linha ->> 'plano_de_contas_id', '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.plano_de_contas pc
         WHERE pc.id = (p_linha ->> 'plano_de_contas_id')::uuid AND pc.organization_id = p_org) THEN
        RETURN 'Plano de contas fora deste condomínio.';
    END IF;
    IF nullif(p_linha ->> 'supplier_id', '') IS NOT NULL
       AND NOT public.fn_sindico_fornecedor_visivel((p_linha ->> 'supplier_id')::uuid, p_org) THEN
        RETURN 'Fornecedor não cadastrado neste condomínio.';
    END IF;
    IF nullif(p_linha ->> 'payment_account_id', '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.payment_accounts pa
         WHERE pa.id = (p_linha ->> 'payment_account_id')::uuid AND coalesce(pa.is_active, true)
           AND public.fn_sindico_conta_atende(pa.id, p_org)) THEN
        RETURN 'Conta de pagamento não atende este condomínio.';
    END IF;
    IF nullif(p_linha ->> 'payment_type', '') IS NOT NULL
       AND (p_linha ->> 'payment_type') NOT IN ('PIX', 'BOLETO', 'TED', 'DOC', 'DINHEIRO', 'CHEQUE', 'PERMUTA') THEN
        RETURN 'Forma de pagamento inválida.';
    END IF;
    IF public.fn_period_is_closed(p_org, v_venc) THEN
        RETURN format('O mês %s está fechado no Fechamento Mensal.', to_char(v_venc, 'MM/YYYY'));
    END IF;
    RETURN NULL;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_validar_linha(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sindico_portal_baixar_titulo(p_token text, p_client_id uuid, p_titulo_id uuid, p_data date, p_forma text DEFAULT NULL::text, p_conta uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_emp    uuid;
    v_org    uuid;
    v_recusa text;
    v_t      public.internal_transactions;
    v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';

    v_emp := public.fn_sindico_condominio_do_titulo(p_titulo_id, v_cli);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Título não encontrado nos seus condomínios.');
    END IF;
    v_recusa := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;
    v_org := public.fn_org_do_condominio(v_emp);

    SELECT * INTO v_t FROM public.internal_transactions WHERE id = p_titulo_id FOR UPDATE;
    IF v_t.organization_id <> v_org THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título está em outra organização e só a administradora dá baixa.');
    END IF;
    IF v_t.direction <> 'DEBIT' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Só títulos a pagar recebem baixa pelo portal.');
    END IF;
    IF v_t.status = 'CANCELLED' OR coalesce(v_t.business_status, '') = 'CANCELADO' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título está cancelado.');
    END IF;
    IF v_t.status = 'CONCILIATED' OR coalesce(v_t.business_status, '') IN ('PAGO', 'RECEBIDO') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título já está pago.');
    END IF;
    IF v_t.approval_status = 'PENDENTE' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título aguarda aprovação na alçada e só pode ser pago depois dela.');
    END IF;
    v_recusa := public.fn_sindico_titulo_em_asaas(p_titulo_id);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;
    IF p_data IS NULL OR p_data > v_hoje THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a data do pagamento (não pode ser futura).');
    END IF;
    IF p_forma IS NOT NULL AND p_forma NOT IN ('PIX', 'BOLETO', 'TED', 'DOC', 'DINHEIRO', 'CHEQUE', 'PERMUTA') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Forma de pagamento inválida.');
    END IF;
    IF p_conta IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.payment_accounts pa
         WHERE pa.id = p_conta AND coalesce(pa.is_active, true)
           AND public.fn_sindico_conta_atende(pa.id, v_org)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Conta de pagamento não atende este condomínio.');
    END IF;
    IF public.fn_period_is_closed(v_org, v_t.transaction_date) THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            format('O mês %s está fechado no Fechamento Mensal.', to_char(v_t.transaction_date, 'MM/YYYY')));
    END IF;

    UPDATE public.internal_transactions
       SET business_status = 'PAGO', status = 'CONCILIATED', payment_date = p_data,
           payment_type = coalesce(p_forma, payment_type),
           payment_account_id = coalesce(p_conta, payment_account_id),
           updated_at = now()
     WHERE id = p_titulo_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, antes, depois)
    VALUES (v_org, v_emp, v_cli, v_nome, 'BAIXAR', p_titulo_id,
            jsonb_build_object('status', v_t.status, 'business_status', v_t.business_status),
            jsonb_build_object('payment_date', p_data, 'payment_type', p_forma, 'payment_account_id', p_conta));

    RETURN jsonb_build_object('ok', true);
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_baixar_titulo(text, uuid, uuid, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_baixar_titulo(text, uuid, uuid, date, text, uuid) TO authenticated;
