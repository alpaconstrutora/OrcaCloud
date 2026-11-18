-- ============================================================================
-- Portal do Síndico › anexo do título sem travessia de caminho (18/11/2026)
--
-- O QUE FECHA — achado F54 da varredura de segurança de 15/11/2026
-- (CLAUDE-SECURITY-20261115-005039/patches/F54.md).
--
-- O síndico logado grava `internal_transactions.documento_path` por
-- `sindico_portal_lancar_pagar` e `sindico_portal_editar_titulo`. As duas só
-- conferiam `NOT LIKE '<org>/sindico/%'` e `LIKE '%..%'` — e `%2e%2e` passa
-- nas duas. Depois, a Edge `sindico-portal-financeiro` (ação `abrir`) e a
-- `client-portal-rateio-comprovantes` (o PDF do rateio do condômino) entregam
-- esse caminho a `createSignedUrl` com a service_role. O parser de URL do
-- `fetch` lê `%2e%2e` como `..` e resolve o segmento: o pedido
-- `/object/sign/financeiro-anexos/<org>/sindico/%2e%2e/%2e%2e/%2e%2e/<bucket>/<x>`
-- vira `/object/sign/<bucket>/<x>`, e o síndico recebe URL assinada de
-- QUALQUER arquivo de QUALQUER bucket cujo caminho conheça.
--
-- O QUE MUDA AQUI
--  1. `public.fn_caminho_sem_travessia(text)` — a regra de
--     `supabase/functions/_shared/caminhoSemTravessia.ts`, em SQL, linha a
--     linha (é a mesma expressão que `partner_portal_create_request` já usa,
--     aplicar_20271116905700). `true` quando nenhum segmento `.`/`..` sobra no
--     caminho, lido de dois jeitos:
--      (a) como o parser de URL lê o que vem depois de `/object/sign/<bucket>/`:
--          corta espaço/controle do fim, descarta tab/LF/CR, para no primeiro
--          `?`/`#`, `\` vira `/`, `%2e` vira `.` e `%2f`/`%5c` viram `/`;
--      (b) cru: descarta tab/LF/CR, corta espaço/controle do fim, `%2e` vira
--          `.`, sem cortar em `?`/`#`.
--     `#`, `?`, `\`, espaço e acento sozinhos continuam aceitos. NULL e '' dão
--     `false` (como no TS).
--  2. As duas RPCs do síndico passam a recusar também o caminho que a função
--     acima recusa — com a MESMA resposta de antes ('Anexo inválido.'). O resto
--     de cada função é a definição ATUAL de produção (pg_get_functiondef em
--     18/11/2026), sem outra mudança.
--
-- O caminho que a Edge grava no upload do síndico
-- (`<org>/sindico/<uuid>/<epoch>-<nome saneado [A-Za-z0-9._-]>`) continua
-- passando. Conferido em produção (18/11/2026, leitura): dos 1.912 caminhos
-- gravados nas tabelas que os assinadores leem (internal_transactions,
-- boletos, opura_document_versions, contract_document_versions,
-- condominio_documentos, financial_receipts, invoices,
-- purchase_order_documents, raw_documents, partner_requests, academy_*),
-- NENHUM é recusado por esta regra.
--
-- LINHAS JÁ GRAVADAS não são alteradas. Quem as pega é a mesma regra no lado
-- da Edge: `caminhoSemTravessia` roda antes de toda assinatura/download com a
-- service_role de caminho gravado (inclusive nas duas functions acima) — o
-- banco recusa na gravação; a Edge recusa na assinatura o que já estava lá.
-- Mudar uma é mudar as três (TS, esta função, partner_portal_create_request).
--
-- ORDEM: independente do código. Pode ir antes ou depois do merge e da
-- publicação das Edge Functions; o recomendado é ANTES (fecha a gravação
-- nova enquanto as functions ainda não foram publicadas).
--
-- REGRA #7: as três funções são SECURITY DEFINER com
-- `SET search_path = public, pg_temp`. A auxiliar não é chamável por ninguém
-- de fora (só pelas RPCs, que rodam como o dono, postgres). As duas RPCs
-- mantêm a ACL de produção (authenticated e service_role; sem anon) e ganham
-- o REVOKE explícito de PUBLIC/anon que a trava exige.
--
-- Idempotente. Aplicar com:
--   npx supabase db query --linked -f <este arquivo>      (nunca db push)
--
-- COMO CONFERIR (depois de aplicar, leitura):
--   npx supabase db query --linked -o table "SELECT public.fn_caminho_sem_travessia('o/sindico/%2e%2e/%2e%2e/boletos/x.pdf') AS travessia, public.fn_caminho_sem_travessia('o/sindico/0b6f0c0e-0000-4000-8000-000000000000/1731900000000-Nota-1.pdf') AS legitimo"
--     → travessia = f, legitimo = t
--   npx supabase db query --linked -o table "SELECT p.proname, p.prosrc LIKE '%fn_caminho_sem_travessia%' AS com_guarda, p.proacl FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('sindico_portal_lancar_pagar','sindico_portal_editar_titulo','fn_caminho_sem_travessia')"
--     → as duas RPCs com_guarda = t; nenhuma ACL com anon nem `=X/` (PUBLIC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_caminho_sem_travessia(p_caminho text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    WITH fim AS (
        -- Espaço e controles C0 (chr(1)..chr(32)) que o parser de URL corta do
        -- fim. chr(0) não cabe em `text` no PostgreSQL.
        SELECT string_agg(chr(g.i), '' ORDER BY g.i) AS c FROM generate_series(1, 32) AS g(i)
    )
    SELECT coalesce(p_caminho, '') <> ''
       -- (a) como o parser de URL lê
       AND NOT (string_to_array(
               replace(replace(replace(replace(replace(replace(replace(
                   split_part(split_part(translate(rtrim(p_caminho, fim.c), E'\t\n\r', ''), '?', 1), '#', 1),
                   chr(92), '/'),
                   '%2e', '.'), '%2E', '.'),
                   '%2f', '/'), '%2F', '/'),
                   '%5c', '/'), '%5C', '/'),
               '/') && ARRAY['.', '..']::text[])
       -- (b) cru
       AND NOT (string_to_array(
               replace(replace(rtrim(translate(p_caminho, E'\t\n\r', ''), fim.c), '%2e', '.'), '%2E', '.'),
               '/') && ARRAY['.', '..']::text[])
      FROM fim
$fn$;

REVOKE ALL ON FUNCTION public.fn_caminho_sem_travessia(text) FROM PUBLIC, anon, authenticated;

-- ── sindico_portal_lancar_pagar — definição de produção + a guarda ─────────────

CREATE OR REPLACE FUNCTION public.sindico_portal_lancar_pagar(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_parcelas jsonb, p_documento jsonb DEFAULT NULL::jsonb, p_ja_pago boolean DEFAULT false, p_data_pagamento date DEFAULT NULL::date)
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
    v_n      int;
    v_i      int := 0;
    v_l      jsonb;
    v_grupo  uuid := gen_random_uuid();
    v_doc_path text := nullif(btrim(coalesce(p_documento ->> 'path', '')), '');
    v_doc_nome text := nullif(btrim(coalesce(p_documento ->> 'nome', '')), '');
    v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_id     uuid;
    v_ids    uuid[] := '{}';
    v_cat    text;
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

    IF jsonb_typeof(p_parcelas) <> 'array' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Parcelas inválidas.');
    END IF;
    v_n := jsonb_array_length(p_parcelas);
    IF v_n < 1 OR v_n > 120 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'De 1 a 120 parcelas.');
    END IF;
    -- `%2e%2e` (e as demais grafias de `.`/`..`) passava no LIKE e, na URL
    -- assinada pela service_role, saía da pasta e do bucket (F54, 18/11/2026).
    IF v_doc_path IS NOT NULL AND (v_doc_path NOT LIKE v_org::text || '/sindico/%' OR v_doc_path LIKE '%..%'
                                   OR NOT public.fn_caminho_sem_travessia(v_doc_path)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Anexo inválido.');
    END IF;
    IF p_ja_pago THEN
        IF v_n > 1 THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Pagamento já feito vale para uma parcela só.');
        END IF;
        IF p_data_pagamento IS NULL OR p_data_pagamento > v_hoje THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a data do pagamento (não pode ser futura).');
        END IF;
        IF nullif(p_parcelas -> 0 ->> 'payment_account_id', '') IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a conta de onde o dinheiro saiu.');
        END IF;
        IF public.fn_period_is_closed(v_org, p_data_pagamento) THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'O mês do pagamento está fechado no Fechamento Mensal.');
        END IF;
    END IF;

    FOR v_l IN SELECT value FROM jsonb_array_elements(p_parcelas) LOOP
        v_motivo := public.fn_sindico_validar_linha(v_l, p_empreendimento_id, v_org);
        IF v_motivo IS NOT NULL THEN
            RETURN jsonb_build_object('ok', false, 'motivo',
                CASE WHEN v_n > 1 THEN format('Parcela %s: %s', v_i + 1, v_motivo) ELSE v_motivo END);
        END IF;
        v_i := v_i + 1;
    END LOOP;

    v_i := 0;
    FOR v_l IN SELECT value FROM jsonb_array_elements(p_parcelas) LOOP
        v_i := v_i + 1;
        SELECT fc.name INTO v_cat FROM public.financial_categories fc WHERE fc.id = (v_l ->> 'category_id')::uuid;
        INSERT INTO public.internal_transactions (
            organization_id, source_system, direction, reference_id,
            transaction_date, due_date, competencia_date, amount, description,
            supplier_id, party_name, entity_name, party_type,
            cost_center_id, plano_de_contas_id, category_id, category,
            payment_type, payment_account_id, installment_type,
            status, business_status, approval_status,
            documento_path, documento_nome, created_by, lancado_por_sindico_client_id
        ) VALUES (
            v_org, 'MANUAL', 'DEBIT', v_grupo::text || ':p' || v_i,
            (v_l ->> 'due_date')::date, (v_l ->> 'due_date')::date,
            coalesce(nullif(v_l ->> 'competencia_date', '')::date, date_trunc('month', (v_l ->> 'due_date')::date)::date),
            round((v_l ->> 'amount')::numeric, 2), btrim(v_l ->> 'description'),
            nullif(v_l ->> 'supplier_id', '')::uuid,
            nullif(btrim(coalesce(v_l ->> 'party_name', '')), ''), nullif(btrim(coalesce(v_l ->> 'party_name', '')), ''), 'SUPPLIER',
            (v_l ->> 'cost_center_id')::uuid, nullif(v_l ->> 'plano_de_contas_id', '')::uuid,
            (v_l ->> 'category_id')::uuid, v_cat,
            nullif(v_l ->> 'payment_type', ''), nullif(v_l ->> 'payment_account_id', '')::uuid,
            CASE WHEN coalesce(v_l ->> 'installment_type', '') ~ '^[A-Z_]{3,20}$' THEN v_l ->> 'installment_type'
                 WHEN v_n > 1 THEN 'MENSAL' ELSE 'UNICA' END,
            'PENDING', 'PREVISTO', 'APROVADO',
            v_doc_path, CASE WHEN v_doc_path IS NULL THEN NULL ELSE coalesce(v_doc_nome, 'Documento') END,
            auth.uid(), v_cli
        ) RETURNING id INTO v_id;
        v_ids := v_ids || v_id;

        INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, depois)
        SELECT v_org, p_empreendimento_id, v_cli, v_nome, 'LANCAR', t.id, to_jsonb(t)
          FROM public.internal_transactions t WHERE t.id = v_id;
    END LOOP;

    IF p_ja_pago THEN
        UPDATE public.internal_transactions
           SET business_status = 'PAGO', status = 'CONCILIATED', payment_date = p_data_pagamento, updated_at = now()
         WHERE id = v_ids[1];
        INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, depois)
        VALUES (v_org, p_empreendimento_id, v_cli, v_nome, 'BAIXAR', v_ids[1],
                jsonb_build_object('payment_date', p_data_pagamento));
    END IF;

    RETURN jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.sindico_portal_lancar_pagar(text, uuid, uuid, jsonb, jsonb, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_lancar_pagar(text, uuid, uuid, jsonb, jsonb, boolean, date) TO authenticated, service_role;

-- ── sindico_portal_editar_titulo — definição de produção + a guarda ────────────

CREATE OR REPLACE FUNCTION public.sindico_portal_editar_titulo(p_token text, p_client_id uuid, p_titulo_id uuid, p_dados jsonb, p_documento jsonb DEFAULT NULL::jsonb, p_remover_documento boolean DEFAULT false)
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
    v_t      public.internal_transactions;
    v_antes  jsonb;
    v_venc   date;
    v_doc_path text := nullif(btrim(coalesce(p_documento ->> 'path', '')), '');
    v_doc_nome text := nullif(btrim(coalesce(p_documento ->> 'nome', '')), '');
    v_cat    text;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';

    v_emp := public.fn_sindico_condominio_do_titulo(p_titulo_id, v_cli);
    IF v_emp IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Título não encontrado nos seus condomínios.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(v_emp);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    v_org := public.fn_org_do_condominio(v_emp);

    SELECT * INTO v_t FROM public.internal_transactions WHERE id = p_titulo_id FOR UPDATE;
    IF v_t.organization_id <> v_org THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título está em outra organização e só a administradora altera.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_altera(v_t);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;

    v_motivo := public.fn_sindico_validar_linha(p_dados, v_emp, v_org);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    -- O mês ANTIGO também: tirar um título de um mês fechado mexe nele.
    IF public.fn_period_is_closed(v_org, v_t.transaction_date) THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            format('O mês %s está fechado no Fechamento Mensal.', to_char(v_t.transaction_date, 'MM/YYYY')));
    END IF;
    -- `%2e%2e` (e as demais grafias de `.`/`..`) passava no LIKE e, na URL
    -- assinada pela service_role, saía da pasta e do bucket (F54, 18/11/2026).
    IF v_doc_path IS NOT NULL AND (v_doc_path NOT LIKE v_org::text || '/sindico/%' OR v_doc_path LIKE '%..%'
                                   OR NOT public.fn_caminho_sem_travessia(v_doc_path)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Anexo inválido.');
    END IF;

    v_antes := to_jsonb(v_t);
    v_venc  := (p_dados ->> 'due_date')::date;
    SELECT fc.name INTO v_cat FROM public.financial_categories fc WHERE fc.id = (p_dados ->> 'category_id')::uuid;

    UPDATE public.internal_transactions SET
        transaction_date   = v_venc,
        due_date           = v_venc,
        competencia_date   = coalesce(nullif(p_dados ->> 'competencia_date', '')::date, date_trunc('month', v_venc)::date),
        amount             = round((p_dados ->> 'amount')::numeric, 2),
        description        = btrim(p_dados ->> 'description'),
        supplier_id        = nullif(p_dados ->> 'supplier_id', '')::uuid,
        party_name         = nullif(btrim(coalesce(p_dados ->> 'party_name', '')), ''),
        entity_name        = nullif(btrim(coalesce(p_dados ->> 'party_name', '')), ''),
        cost_center_id     = (p_dados ->> 'cost_center_id')::uuid,
        plano_de_contas_id = nullif(p_dados ->> 'plano_de_contas_id', '')::uuid,
        category_id        = (p_dados ->> 'category_id')::uuid,
        category           = v_cat,
        payment_type       = nullif(p_dados ->> 'payment_type', ''),
        payment_account_id = nullif(p_dados ->> 'payment_account_id', '')::uuid,
        documento_path     = CASE WHEN v_doc_path IS NOT NULL THEN v_doc_path
                                  WHEN p_remover_documento THEN NULL ELSE documento_path END,
        documento_nome     = CASE WHEN v_doc_path IS NOT NULL THEN coalesce(v_doc_nome, 'Documento')
                                  WHEN p_remover_documento THEN NULL ELSE documento_nome END,
        updated_at         = now()
     WHERE id = p_titulo_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, antes, depois)
    SELECT v_org, v_emp, v_cli, v_nome, 'EDITAR', t.id, v_antes, to_jsonb(t)
      FROM public.internal_transactions t WHERE t.id = p_titulo_id;

    RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.sindico_portal_editar_titulo(text, uuid, uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sindico_portal_editar_titulo(text, uuid, uuid, jsonb, jsonb, boolean) TO authenticated, service_role;
