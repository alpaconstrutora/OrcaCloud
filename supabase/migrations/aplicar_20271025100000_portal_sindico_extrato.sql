-- ============================================================================
-- Portal do Síndico › G2b: extrato e conciliação da conta do condomínio (25/10/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G2b)
-- Pedido: "o sindico é o gerenciador / executor do condominio e ele precisa de
-- total acesso para edicao" — pelo portal (ele não é da construtora).
--
-- O admin lê o arquivo, tira duplicados e casa NO NAVEGADOR, com a RLS de
-- membro. As funções de casar/desfazer/ignorar (`fn_reconcile_match`,
-- `_unmatch`, `_ignore`, `_unignore`) são SECURITY INVOKER e sem checagem
-- própria: aqui elas são chamadas POR DENTRO de RPCs que autorizam o síndico
-- (login + mandato + org própria) e conferem que o movimento e o título são da
-- org do condomínio. A lógica é a do admin (título conciliado com a conta
-- real, boleto pago, auditoria) — não é duplicada.
--
-- Importar: o arquivo é lido no navegador do síndico (o mesmo
-- `parseStatementFile` do admin); o banco RECALCULA sentido, valor, ordinal e
-- `fingerprint` (sha256 do mesmo texto canônico de
-- `bankReconciliationService.fingerprintCanonical`) e a duplicidade entre
-- formatos (`separarGemeasDeOutroFormato`, um arquivo por vez). A trava de mês
-- fechado do extrato (`trg_block_period_bank_tx`) não vale em SECURITY DEFINER:
-- é chamada à mão, como nas RPCs de título.
--
-- REGRA #7: REVOKE de PUBLIC/anon em toda função; autorização DENTRO.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS',
                    'CONTA_SALVAR', 'RECEBER', 'DESFAZER_BAIXA', 'LANCAR_RECEITA',
                    'EXTRATO_IMPORTAR', 'EXTRATO_CONCILIAR', 'EXTRATO_DESFAZER', 'EXTRATO_IGNORAR',
                    'EXTRATO_RESTAURAR', 'EXTRATO_LANCAR'));
ALTER TABLE public.sindico_financeiro_eventos
    ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

-- ── 0. Auxiliares internos ───────────────────────────────────────────────────
-- Condomínio dono da conta, se ela é de um condomínio COM org própria do
-- mandato do síndico; senão NULL.
CREATE OR REPLACE FUNCTION public.fn_sindico_condominio_da_conta(p_cli uuid, p_conta uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT e.id
      FROM public.payment_accounts pa
      JOIN public.empreendimentos e ON e.condominio_org_id = pa.organization_id
     WHERE pa.id = p_conta
       AND e.id IN (SELECT public.fn_sindico_predios(p_cli))
     LIMIT 1;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_condominio_da_conta(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Título do condomínio (org própria + centro de custo dele) que pode receber
-- vínculo com o extrato: mesmo sentido, não cancelado, sem vínculo.
CREATE OR REPLACE FUNCTION public.fn_sindico_titulo_conciliavel(p_emp uuid, p_titulo uuid, p_direcao text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN t.id IS NULL THEN 'Título não encontrado neste condomínio.'
        WHEN t.organization_id IS DISTINCT FROM public.fn_org_do_condominio(p_emp) THEN 'Este título está em outra organização e só a administradora concilia.'
        WHEN t.direction <> p_direcao THEN 'O movimento e o título têm sentidos diferentes (entrada × saída).'
        WHEN t.status = 'CANCELLED' OR coalesce(t.business_status, '') = 'CANCELADO' THEN 'Título cancelado não se concilia.'
        WHEN EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = t.id)
            THEN 'Este título já está conciliado com outro movimento do extrato.'
        ELSE NULL END
      FROM (SELECT 1) x
      LEFT JOIN public.internal_transactions t
        ON t.id = p_titulo
       AND t.cost_center_id IN (SELECT cc.id FROM public.cost_centers_v2 cc WHERE cc.empreendimento_id = p_emp);
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_titulo_conciliavel(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── 1. Leitura do extrato de uma conta (link, login e prévia) ───────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_extrato(
    p_token text, p_client_id uuid, p_conta_id uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r    jsonb;
    v_cli  uuid;
    v_emp  uuid;
    v_org  uuid;
    v_ccs  uuid[];
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    v_emp := public.fn_sindico_condominio_da_conta(v_cli, p_conta_id);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Conta não encontrada nos seus condomínios.');
    END IF;
    IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Período inválido.');
    END IF;
    v_org := public.fn_org_do_condominio(v_emp);
    SELECT array_agg(id) INTO v_ccs FROM public.cost_centers_v2 WHERE empreendimento_id = v_emp;

    RETURN jsonb_build_object(
        'ok', true,
        'condominioId', v_emp,
        'linhas', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'data', b.transaction_date, 'valor', b.amount, 'direcao', b.direction,
                'descricao', b.description_raw, 'status', b.status,
                'vinculos', coalesce((
                    SELECT jsonb_agg(jsonb_build_object(
                        'matchId', m.id, 'tituloId', t.id, 'descricao', t.description, 'valor', t.amount,
                        'vencimento', coalesce(t.due_date, t.transaction_date),
                        'credor', coalesce(s.name, nullif(t.party_name, ''), nullif(t.entity_name, ''))) ORDER BY m.created_at)
                      FROM public.reconciliation_matches m
                      JOIN public.internal_transactions t ON t.id = m.internal_transaction_id
                      LEFT JOIN public.suppliers s ON s.id = t.supplier_id
                     WHERE m.bank_transaction_id = b.id), '[]'::jsonb),
                -- Quantos títulos casam pelo valor exato (±10 dias) — a "sugestão" do portal.
                'candidatosExatos', CASE WHEN b.status IN ('MATCHED', 'IGNORED', 'TRANSFER') THEN 0 ELSE (
                    SELECT count(*) FROM public.internal_transactions t
                     WHERE t.organization_id = v_org AND t.cost_center_id = ANY (v_ccs)
                       AND t.direction = b.direction AND abs(t.amount - b.amount) <= 0.01
                       AND t.status <> 'CANCELLED' AND coalesce(t.business_status, '') <> 'CANCELADO'
                       AND coalesce(t.entry_type, 'PRINCIPAL') = 'PRINCIPAL'
                       AND abs(coalesce(t.payment_date, t.due_date, t.transaction_date) - b.transaction_date) <= 10
                       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = t.id)
                ) END
            ) ORDER BY b.transaction_date, b.created_at, b.id)
              FROM public.bank_transactions b
             WHERE b.bank_account_id = p_conta_id AND b.organization_id = v_org
               AND b.transaction_date BETWEEN p_inicio AND p_fim), '[]'::jsonb),
        'importacoes', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'arquivo', i.file_name, 'formato', i.format, 'em', i.created_at, 'lidas', i.lines_read,
                'inseridas', i.lines_inserted, 'repetidas', i.lines_duplicated,
                'inicio', i.period_start, 'fim', i.period_end, 'saldoBanco', i.ledger_balance, 'saldoEm', i.ledger_balance_date)
                ORDER BY i.created_at DESC)
              FROM (SELECT * FROM public.bank_statement_imports
                     WHERE bank_account_id = p_conta_id ORDER BY created_at DESC LIMIT 5) i), '[]'::jsonb),
        'temMovimento', EXISTS (SELECT 1 FROM public.bank_transactions WHERE bank_account_id = p_conta_id));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_extrato(text, uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sindico_portal_extrato(text, uuid, uuid, date, date) TO anon, authenticated;

-- ── 2. Importar um arquivo de extrato ────────────────────────────────────────
-- `p_linhas` = [{data, valor (negativo = saída), memo, descricao, fitid,
-- normalizada}] na ORDEM do arquivo. `p_arquivo` = {nome, formato, acctId,
-- saldo, saldoEm, inicio, fim, lidas, descartadas}.
CREATE OR REPLACE FUNCTION public.sindico_portal_extrato_importar(
    p_token text, p_client_id uuid, p_conta_id uuid, p_arquivo jsonb, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r        jsonb;
    v_cli      uuid;
    v_nome     text;
    v_emp      uuid;
    v_org      uuid;
    v_motivo   text;
    v_conta    public.payment_accounts;
    v_n        int;
    v_fechados text;
    v_inseridas int := 0;
    v_ja       int := 0;
    v_gemeas   int := 0;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
    v_emp := public.fn_sindico_condominio_da_conta(v_cli, p_conta_id);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Conta não encontrada nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    v_org := public.fn_org_do_condominio(v_emp);
    SELECT * INTO v_conta FROM public.payment_accounts WHERE id = p_conta_id;
    IF NOT coalesce(v_conta.is_active, true) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Esta conta está desativada. Reative-a antes de importar.');
    END IF;
    IF v_conta.kind = 'gateway' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O extrato do Asaas chega pela integração, não por arquivo.');
    END IF;
    IF jsonb_typeof(p_linhas) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Arquivo sem movimentos.');
    END IF;
    v_n := jsonb_array_length(p_linhas);
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'O arquivo não tem movimentos.'); END IF;
    IF v_n > 5000 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Arquivo grande demais (mais de 5.000 movimentos).'); END IF;
    -- Mesma exigência do admin: sem o ponto de partida, todo saldo é soma desde zero.
    IF v_conta.opening_balance_date IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.bank_transactions WHERE bank_account_id = p_conta_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', format(
            'A conta "%s" ainda não tem saldo inicial. Informe o saldo e a data de partida em Contas bancárias › Editar antes de importar.', v_conta.name));
    END IF;

    -- As linhas como o admin as grava (toNormalizedRows), recalculadas aqui.
    -- DROP antes: duas importações na mesma transação acharíam a tabela da anterior.
    DROP TABLE IF EXISTS _ext;
    CREATE TEMP TABLE _ext ON COMMIT DROP AS
    WITH bruto AS (
        SELECT ord, (l ->> 'data')::date AS d, (l ->> 'valor')::numeric AS v,
               btrim(coalesce(nullif(l ->> 'memo', ''), nullif(l ->> 'descricao', ''), 'Sem descrição')) AS descr,
               nullif(btrim(coalesce(l ->> 'fitid', '')), '') AS fitid,
               nullif(btrim(coalesce(l ->> 'normalizada', '')), '') AS normalizada
          FROM jsonb_array_elements(p_linhas) WITH ORDINALITY AS a(l, ord)
    ), base AS (
        SELECT ord, d, abs(v) AS valor, CASE WHEN v < 0 THEN 'DEBIT' ELSE 'CREDIT' END AS dir, descr, fitid, normalizada
          FROM bruto
    ), ordenado AS (
        SELECT b.*, row_number() OVER (PARTITION BY d, round(valor, 2), dir, descr ORDER BY ord) AS ordinal
          FROM base b
    )
    SELECT o.*, encode(sha256(convert_to(
               p_conta_id::text || '|' || o.d::text || '|' || round(o.valor, 2)::text || '|' || o.dir || '|' || o.descr || '|' || o.ordinal,
               'UTF8')), 'hex') AS fp,
           o.d::text || '|' || round(o.valor, 2)::text || '|' || o.dir AS chave
      FROM ordenado o;

    IF EXISTS (SELECT 1 FROM _ext WHERE d IS NULL OR valor IS NULL OR valor = 0) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Há movimento sem data ou sem valor no arquivo.');
    END IF;
    SELECT string_agg(DISTINCT to_char(d, 'MM/YYYY'), ', ') INTO v_fechados
      FROM _ext WHERE public.fn_period_is_closed(v_org, d);
    IF v_fechados IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', format(
            'O arquivo tem movimentos em mês fechado no Fechamento Mensal (%s). Nada foi importado.', v_fechados));
    END IF;

    -- Duplicidade em duas camadas (utils/extratoDuplicidade.ts, um arquivo):
    -- 1) a mesma linha já gravada (fingerprint ou FITID);
    -- 2) o mesmo movimento em OUTRO formato: por data+valor+sentido, entram só as
    --    que passam do que o banco já tem (as com FITID primeiro).
    WITH existentes AS (
        SELECT bt.fingerprint, nullif(btrim(coalesce(bt.external_id, '')), '') AS ext,
               bt.transaction_date::text || '|' || round(bt.amount, 2)::text || '|' || bt.direction AS chave
          FROM public.bank_transactions bt
         WHERE bt.bank_account_id = p_conta_id
           AND bt.transaction_date BETWEEN (SELECT min(d) FROM _ext) AND (SELECT max(d) FROM _ext)
    ), marcadas AS (
        SELECT e.*, (EXISTS (SELECT 1 FROM existentes x WHERE x.fingerprint = e.fp)
                     OR (e.fitid IS NOT NULL AND EXISTS (SELECT 1 FROM existentes x WHERE x.ext = e.fitid))) AS ja
          FROM _ext e
    ), candidatas AS (
        SELECT m.*, row_number() OVER (PARTITION BY m.chave ORDER BY (m.fitid IS NULL), m.ord) AS pos,
               (SELECT count(*) FROM _ext e2 WHERE e2.chave = m.chave) AS no_arquivo,
               (SELECT count(*) FROM existentes x WHERE x.chave = m.chave) AS no_banco
          FROM marcadas m WHERE NOT m.ja
    )
    SELECT (SELECT count(*) FROM marcadas WHERE ja),
           (SELECT count(*) FROM candidatas WHERE pos > greatest(0, no_arquivo - no_banco))
      INTO v_ja, v_gemeas;

    WITH existentes AS (
        SELECT bt.fingerprint, nullif(btrim(coalesce(bt.external_id, '')), '') AS ext,
               bt.transaction_date::text || '|' || round(bt.amount, 2)::text || '|' || bt.direction AS chave
          FROM public.bank_transactions bt
         WHERE bt.bank_account_id = p_conta_id
           AND bt.transaction_date BETWEEN (SELECT min(d) FROM _ext) AND (SELECT max(d) FROM _ext)
    ), marcadas AS (
        SELECT e.*, (EXISTS (SELECT 1 FROM existentes x WHERE x.fingerprint = e.fp)
                     OR (e.fitid IS NOT NULL AND EXISTS (SELECT 1 FROM existentes x WHERE x.ext = e.fitid))) AS ja
          FROM _ext e
    ), candidatas AS (
        SELECT m.*, row_number() OVER (PARTITION BY m.chave ORDER BY (m.fitid IS NULL), m.ord) AS pos,
               (SELECT count(*) FROM _ext e2 WHERE e2.chave = m.chave) AS no_arquivo,
               (SELECT count(*) FROM existentes x WHERE x.chave = m.chave) AS no_banco
          FROM marcadas m WHERE NOT m.ja
    ), ins AS (
        INSERT INTO public.bank_transactions (
            organization_id, bank_account_id, external_id, transaction_date, amount, direction,
            description_raw, description_normalized, status, fingerprint)
        SELECT v_org, p_conta_id, c.fitid, c.d, round(c.valor, 2), c.dir, c.descr,
               coalesce(c.normalizada, lower(c.descr)), 'NORMALIZED', c.fp
          FROM candidatas c
         WHERE c.pos <= greatest(0, c.no_arquivo - c.no_banco)
         ORDER BY c.ord
        ON CONFLICT DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_inseridas FROM ins;

    INSERT INTO public.bank_statement_imports (
        organization_id, bank_account_id, file_name, format, acct_id, ledger_balance, ledger_balance_date,
        period_start, period_end, lines_read, lines_inserted, lines_duplicated, lines_skipped, created_by)
    VALUES (
        v_org, p_conta_id, left(coalesce(nullif(btrim(p_arquivo ->> 'nome'), ''), 'extrato'), 200),
        left(coalesce(nullif(btrim(p_arquivo ->> 'formato'), ''), 'desconhecido'), 20),
        nullif(btrim(coalesce(p_arquivo ->> 'acctId', '')), ''),
        nullif(p_arquivo ->> 'saldo', '')::numeric, nullif(p_arquivo ->> 'saldoEm', '')::date,
        nullif(p_arquivo ->> 'inicio', '')::date, nullif(p_arquivo ->> 'fim', '')::date,
        v_n, v_inseridas, v_n - v_inseridas, coalesce(nullif(p_arquivo ->> 'descartadas', '')::int, 0), auth.uid());

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, payment_account_id, depois)
    VALUES (v_org, v_emp, v_cli, v_nome, 'EXTRATO_IMPORTAR', p_conta_id, jsonb_build_object(
        'arquivo', p_arquivo ->> 'nome', 'lidas', v_n, 'inseridas', v_inseridas, 'jaExistiam', v_ja, 'outroFormato', v_gemeas));

    RETURN jsonb_build_object('ok', true, 'inseridas', v_inseridas, 'jaExistiam', v_ja, 'outroFormato', v_gemeas, 'lidas', v_n);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_extrato_importar(text, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_extrato_importar(text, uuid, uuid, jsonb, jsonb) TO authenticated;

-- ── 3. Candidatos de um movimento (leitura) ─────────────────────────────────
-- Títulos do condomínio no mesmo sentido, sem vínculo, não cancelados, até
-- 60 dias de distância: primeiro os de valor exato, depois por diferença de
-- valor e de data. Não é o motor do admin — o condomínio tem pouco volume.
CREATE OR REPLACE FUNCTION public.sindico_portal_extrato_candidatos(p_token text, p_client_id uuid, p_bank_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_r   jsonb;
    v_cli uuid;
    v_emp uuid;
    v_org uuid;
    b     public.bank_transactions;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    SELECT * INTO b FROM public.bank_transactions WHERE id = p_bank_id;
    v_emp := public.fn_sindico_condominio_da_conta(v_cli, b.bank_account_id);
    IF b.id IS NULL OR v_emp IS NULL OR b.organization_id IS DISTINCT FROM public.fn_org_do_condominio(v_emp) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Movimento não encontrado nos seus condomínios.');
    END IF;
    v_org := public.fn_org_do_condominio(v_emp);
    RETURN jsonb_build_object('ok', true, 'candidatos', coalesce((
        SELECT jsonb_agg(x ORDER BY (x ->> 'exato')::boolean DESC, (x ->> 'difValor')::numeric, (x ->> 'difDias')::int)
          FROM (
            SELECT jsonb_build_object(
                'id', t.id, 'descricao', t.description,
                'credor', coalesce(s.name, nullif(t.party_name, ''), nullif(t.entity_name, '')),
                'valor', t.amount, 'vencimento', coalesce(t.due_date, t.transaction_date), 'pagoEm', t.payment_date,
                'situacao', CASE WHEN t.status = 'CONCILIATED' OR coalesce(t.business_status, '') IN ('PAGO', 'RECEBIDO') THEN 'BAIXADO' ELSE 'ABERTO' END,
                'exato', abs(t.amount - b.amount) <= 0.01,
                'difValor', round(abs(t.amount - b.amount), 2),
                'difDias', abs(coalesce(t.payment_date, t.due_date, t.transaction_date) - b.transaction_date)) AS x
              FROM public.internal_transactions t
              LEFT JOIN public.suppliers s ON s.id = t.supplier_id
             WHERE t.organization_id = v_org
               AND t.cost_center_id IN (SELECT cc.id FROM public.cost_centers_v2 cc WHERE cc.empreendimento_id = v_emp)
               AND t.direction = b.direction
               AND t.status <> 'CANCELLED' AND coalesce(t.business_status, '') <> 'CANCELADO'
               AND coalesce(t.entry_type, 'PRINCIPAL') = 'PRINCIPAL'
               AND abs(coalesce(t.payment_date, t.due_date, t.transaction_date) - b.transaction_date) <= 60
               AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = t.id)
             ORDER BY abs(t.amount - b.amount), abs(coalesce(t.payment_date, t.due_date, t.transaction_date) - b.transaction_date)
             LIMIT 40) q), '[]'::jsonb));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_extrato_candidatos(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sindico_portal_extrato_candidatos(text, uuid, uuid) TO anon, authenticated;

-- Movimento do extrato que o síndico (já autorizado) pode mexer: condomínio dele,
-- org própria. Devolve o condomínio, ou NULL com o motivo em p_motivo.
CREATE OR REPLACE FUNCTION public.fn_sindico_movimento(p_cli uuid, p_bank_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT e.id
      FROM public.bank_transactions b
      JOIN public.payment_accounts pa ON pa.id = b.bank_account_id
      JOIN public.empreendimentos e ON e.condominio_org_id = pa.organization_id AND e.condominio_org_id = b.organization_id
     WHERE b.id = p_bank_id AND e.id IN (SELECT public.fn_sindico_predios(p_cli))
     LIMIT 1;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_movimento(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Conciliar (casar movimento ↔ título) ─────────────────────────────────
-- Valor diferente (juros, multa, desconto) só com a categoria do ajuste: o
-- `p_adjustment_category` do admin cria o título da diferença já conciliado.
CREATE OR REPLACE FUNCTION public.sindico_portal_extrato_conciliar(
    p_token text, p_client_id uuid, p_bank_id uuid, p_titulo_id uuid, p_categoria_ajuste text DEFAULT NULL)
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
    v_motivo text;
    b        public.bank_transactions;
    t        public.internal_transactions;
    v_aj     text := nullif(left(btrim(coalesce(p_categoria_ajuste, '')), 120), '');
    v_res    jsonb;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
    v_emp := public.fn_sindico_movimento(v_cli, p_bank_id);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Movimento não encontrado nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    v_org := public.fn_org_do_condominio(v_emp);
    SELECT * INTO b FROM public.bank_transactions WHERE id = p_bank_id;
    IF b.status = 'IGNORED' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este movimento está ignorado. Restaure-o antes de conciliar.');
    END IF;
    IF b.status = 'TRANSFER' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este movimento é transferência entre contas e só a administradora mexe nele.');
    END IF;
    -- O admin aceita N títulos num movimento ("Vincular em grupo"); o portal, um por vez.
    IF b.status = 'MATCHED' OR EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = b.id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este movimento já está conciliado. Desfaça o vínculo antes de trocar o título.');
    END IF;
    v_motivo := public.fn_sindico_titulo_conciliavel(v_emp, p_titulo_id, b.direction);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    SELECT * INTO t FROM public.internal_transactions WHERE id = p_titulo_id;
    IF abs(t.amount - b.amount) > 0.01 AND v_aj IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', format(
            'Valores diferentes: extrato R$ %s, título R$ %s. Escolha como lançar a diferença (juros, multa, desconto).',
            replace(to_char(b.amount, 'FM999999999990.00'), '.', ','), replace(to_char(t.amount, 'FM999999999990.00'), '.', ',')));
    END IF;
    IF public.fn_period_is_closed(v_org, b.transaction_date) OR public.fn_period_is_closed(v_org, t.transaction_date) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O mês do movimento ou do título está fechado no Fechamento Mensal.');
    END IF;

    v_res := public.fn_reconcile_match(p_bank_id, p_titulo_id, 'MANUAL', 100,
                                       CASE WHEN abs(t.amount - b.amount) > 0.01 THEN v_aj END);

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, bank_transaction_id, payment_account_id, depois)
    VALUES (v_org, v_emp, v_cli, v_nome, 'EXTRATO_CONCILIAR', p_titulo_id, p_bank_id, b.bank_account_id, v_res);

    RETURN jsonb_build_object('ok', true) || v_res;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_extrato_conciliar(text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_extrato_conciliar(text, uuid, uuid, uuid, text) TO authenticated;

-- ── 5. Desfazer um vínculo ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_extrato_desfazer(p_token text, p_client_id uuid, p_match_id uuid)
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
    v_motivo text;
    m        public.reconciliation_matches;
    b        public.bank_transactions;
    t        public.internal_transactions;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
    SELECT * INTO m FROM public.reconciliation_matches WHERE id = p_match_id;
    v_emp := CASE WHEN m.id IS NULL THEN NULL ELSE public.fn_sindico_movimento(v_cli, m.bank_transaction_id) END;
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Vínculo não encontrado nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    v_org := public.fn_org_do_condominio(v_emp);
    SELECT * INTO b FROM public.bank_transactions WHERE id = m.bank_transaction_id;
    SELECT * INTO t FROM public.internal_transactions WHERE id = m.internal_transaction_id;
    IF t.organization_id IS DISTINCT FROM v_org THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O título deste vínculo está em outra organização e só a administradora desfaz.');
    END IF;
    IF public.fn_period_is_closed(v_org, b.transaction_date) OR public.fn_period_is_closed(v_org, t.transaction_date) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O mês do movimento ou do título está fechado no Fechamento Mensal.');
    END IF;

    PERFORM public.fn_reconcile_unmatch(p_match_id);

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, bank_transaction_id, payment_account_id)
    VALUES (v_org, v_emp, v_cli, v_nome, 'EXTRATO_DESFAZER', t.id, b.id, b.bank_account_id);
    RETURN jsonb_build_object('ok', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_extrato_desfazer(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_extrato_desfazer(text, uuid, uuid) TO authenticated;

-- ── 6. Ignorar / restaurar ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_extrato_ignorar(
    p_token text, p_client_id uuid, p_bank_id uuid, p_motivo text, p_restaurar boolean DEFAULT false)
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
    v_motivo text;
    b        public.bank_transactions;
    v_txt    text := nullif(left(btrim(coalesce(p_motivo, '')), 300), '');
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
    v_emp := public.fn_sindico_movimento(v_cli, p_bank_id);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Movimento não encontrado nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    v_org := public.fn_org_do_condominio(v_emp);
    SELECT * INTO b FROM public.bank_transactions WHERE id = p_bank_id;
    IF public.fn_period_is_closed(v_org, b.transaction_date) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O mês deste movimento está fechado no Fechamento Mensal.');
    END IF;

    IF p_restaurar THEN
        IF b.status <> 'IGNORED' THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Este movimento não está ignorado.');
        END IF;
        PERFORM public.fn_reconcile_unignore(ARRAY[p_bank_id]);
    ELSE
        IF b.status = 'MATCHED' THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Este movimento está conciliado — desfaça o vínculo antes de ignorar.');
        END IF;
        IF b.status = 'IGNORED' THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Este movimento já está ignorado.');
        END IF;
        IF v_txt IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Diga por que este movimento fica de fora (ex.: transferência entre contas do condomínio).');
        END IF;
        PERFORM public.fn_reconcile_ignore(ARRAY[p_bank_id], v_txt);
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, bank_transaction_id, payment_account_id, depois)
    VALUES (v_org, v_emp, v_cli, v_nome, CASE WHEN p_restaurar THEN 'EXTRATO_RESTAURAR' ELSE 'EXTRATO_IGNORAR' END,
            b.id, b.bank_account_id, jsonb_build_object('motivo', v_txt));
    RETURN jsonb_build_object('ok', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_extrato_ignorar(text, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_extrato_ignorar(text, uuid, uuid, text, boolean) TO authenticated;

-- ── 7. Lançar a partir do movimento e conciliar (tarifa, receita sem título) ─
-- O título nasce com o valor, a data e o sentido DO EXTRATO (nada disso vem do
-- navegador) e é casado na mesma transação.
CREATE OR REPLACE FUNCTION public.sindico_portal_extrato_lancar(
    p_token text, p_client_id uuid, p_bank_id uuid, p_linha jsonb)
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
    v_motivo text;
    b        public.bank_transactions;
    v_linha  jsonb;
    v_cat    text;
    v_id     uuid;
    v_parte  text;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';
    v_emp := public.fn_sindico_movimento(v_cli, p_bank_id);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Movimento não encontrado nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    v_org := public.fn_org_do_condominio(v_emp);
    SELECT * INTO b FROM public.bank_transactions WHERE id = p_bank_id;
    IF b.status IN ('MATCHED', 'IGNORED', 'TRANSFER') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este movimento já está conciliado, ignorado ou é transferência.');
    END IF;
    IF jsonb_typeof(p_linha) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Dados do lançamento inválidos.');
    END IF;

    -- Valor, data e sentido são os do extrato.
    v_linha := (p_linha - 'amount' - 'due_date' - 'payment_account_id')
               || jsonb_build_object('amount', b.amount, 'due_date', b.transaction_date, 'payment_account_id', b.bank_account_id);
    IF b.direction = 'CREDIT' THEN v_linha := v_linha - 'supplier_id'; END IF;
    v_motivo := public.fn_sindico_validar_linha(v_linha, v_emp, v_org);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;

    v_parte := nullif(left(btrim(coalesce(p_linha ->> 'party_name', '')), 200), '');
    SELECT fc.name INTO v_cat FROM public.financial_categories fc WHERE fc.id = (v_linha ->> 'category_id')::uuid;
    INSERT INTO public.internal_transactions (
        organization_id, source_system, direction, reference_id,
        transaction_date, due_date, competencia_date, amount, description,
        supplier_id, party_name, entity_name, party_type,
        cost_center_id, plano_de_contas_id, category_id, category,
        payment_account_id, installment_type, status, business_status, approval_status,
        created_by, lancado_por_sindico_client_id
    ) VALUES (
        v_org, 'MANUAL', b.direction, gen_random_uuid()::text || ':p1',
        b.transaction_date, b.transaction_date, date_trunc('month', b.transaction_date)::date, b.amount,
        btrim(v_linha ->> 'description'),
        CASE WHEN b.direction = 'DEBIT' THEN nullif(v_linha ->> 'supplier_id', '')::uuid END,
        v_parte, v_parte, CASE WHEN b.direction = 'DEBIT' THEN 'SUPPLIER' ELSE 'CLIENT' END,
        (v_linha ->> 'cost_center_id')::uuid, nullif(v_linha ->> 'plano_de_contas_id', '')::uuid,
        (v_linha ->> 'category_id')::uuid, v_cat,
        b.bank_account_id, 'UNICA', 'PENDING',
        CASE WHEN b.direction = 'DEBIT' THEN 'PAGO' ELSE 'RECEBIDO' END, 'APROVADO',
        auth.uid(), v_cli
    ) RETURNING id INTO v_id;

    PERFORM public.fn_reconcile_match(p_bank_id, v_id, 'MANUAL', 100, NULL);

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, bank_transaction_id, payment_account_id, depois)
    SELECT v_org, v_emp, v_cli, v_nome, 'EXTRATO_LANCAR', t.id, b.id, b.bank_account_id, to_jsonb(t)
      FROM public.internal_transactions t WHERE t.id = v_id;
    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_extrato_lancar(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_extrato_lancar(text, uuid, uuid, jsonb) TO authenticated;
