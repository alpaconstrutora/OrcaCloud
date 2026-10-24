-- ============================================================================
-- Portal do Síndico › Financeiro do condomínio — consultar e operar (24/10/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md
-- Pedido: "O sindico sera o gestor do condomínio, entao no portal dele deve
-- estar disponivel o Financeiro relativo ao condomínio". Decisões: operar pelo
-- portal (lançar conta a pagar, dar baixa, cadastrar fornecedor, editar e
-- cancelar); gravar SÓ COM LOGIN (modo 'sessao'); sem alçada (o síndico é o
-- gestor — o título nasce APROVADO).
--
-- Recorte: os CENTROS DE CUSTO do condomínio (`cost_centers_v2.empreendimento_id`),
-- o mesmo de `condominioRateioService.listarLancamentos`. Grava na org que OPERA
-- o condomínio (`condominio_org_id`); condomínio ainda sem organização própria
-- (007) só consulta — gravar na org da construtora reabriria o vazamento que o
-- plano de 21/10 fechou.
--
-- ⚠️ Duas travas que NÃO valem sozinhas dentro de SECURITY DEFINER e por isso
-- são refeitas aqui, explicitamente:
--  - mês fechado: `trg_block_period_internal_tx` libera quando
--    current_user <> 'authenticated' → toda escrita chama `fn_period_is_closed`;
--  - pagamento Asaas em curso: a trava de edição mora no navegador
--    (`payableService.updateAvulso`) → `fn_sindico_titulo_em_asaas`.
-- A trava de competência fechada de Contas a Pagar
-- (`trg_payable_competencia_fechada_*`) continua valendo por conta própria.
--
-- Caminho de arquivo NÃO vai no payload (bucket privado): a Edge Function
-- `sindico-portal-financeiro` resolve código/documento com `resolverOrigens` e
-- assina no clique, autorizando por `sindico_portal_titulos_autorizados`.
--
-- REGRA #7: REVOKE literal junto de cada função; autorização DENTRO das DEFINER.
-- ============================================================================

-- ── Autoria e trilha ────────────────────────────────────────────────────────

ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS lancado_por_sindico_client_id uuid
        REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS lancado_por_sindico_client_id uuid
        REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.sindico_financeiro_eventos (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    empreendimento_id  uuid REFERENCES public.empreendimentos(id) ON DELETE SET NULL,
    client_id          uuid REFERENCES public.clients(id) ON DELETE SET NULL,
    nome               text,
    acao               text NOT NULL CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO')),
    transaction_id     uuid,
    supplier_id        uuid,
    antes              jsonb,
    depois             jsonb,
    criado_em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sindico_financeiro_eventos_org_idx ON public.sindico_financeiro_eventos (organization_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS sindico_financeiro_eventos_tx_idx ON public.sindico_financeiro_eventos (transaction_id);

ALTER TABLE public.sindico_financeiro_eventos ENABLE ROW LEVEL SECURITY;
-- Só leitura, para a equipe da org do condomínio. Escrita só pelas RPCs abaixo
-- (SECURITY DEFINER); sem policy de INSERT/UPDATE/DELETE = log imutável.
DROP POLICY IF EXISTS sindico_financeiro_eventos_select ON public.sindico_financeiro_eventos;
CREATE POLICY sindico_financeiro_eventos_select ON public.sindico_financeiro_eventos
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- ── Funções privadas ────────────────────────────────────────────────────────

-- A porta do 'sessao' com a frase certa para o financeiro (a do resolver fala
-- de aprovar rateio).
CREATE OR REPLACE FUNCTION public.fn_sindico_operar(p_token text, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_r jsonb := public.fn_sindico_resolver(p_token, p_client_id, 'sessao');
BEGIN
    IF NOT (v_r ->> 'ok')::boolean AND (v_r ->> 'motivo') LIKE 'Para aprovar ou devolver%' THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            'Para lançar, pagar ou cadastrar, entre no Portal do Síndico com seu e-mail e senha.');
    END IF;
    RETURN v_r;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_operar(text, uuid) FROM PUBLIC, anon, authenticated;

-- Por que o síndico NÃO opera este condomínio pelo portal (NULL = opera).
CREATE OR REPLACE FUNCTION public.fn_sindico_motivo_nao_opera(p_empreendimento_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT CASE
        WHEN e.id IS NULL THEN 'Condomínio não encontrado.'
        WHEN e.condominio_org_id IS NULL THEN
            'Este condomínio ainda opera na organização da construtora. Os lançamentos pelo portal ficam disponíveis quando ele tiver organização própria — fale com a administradora.'
        ELSE NULL
    END
    FROM (SELECT 1) x
    LEFT JOIN public.empreendimentos e ON e.id = p_empreendimento_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_motivo_nao_opera(uuid) FROM PUBLIC, anon, authenticated;

-- O condomínio (do síndico) a que um título pertence, pelo centro de custo.
-- NULL = o título não é de nenhum prédio dele.
CREATE OR REPLACE FUNCTION public.fn_sindico_condominio_do_titulo(p_transaction_id uuid, p_client_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT cc.empreendimento_id
      FROM public.internal_transactions t
      JOIN public.cost_centers_v2 cc ON cc.id = t.cost_center_id
     WHERE t.id = p_transaction_id
       AND cc.empreendimento_id IN (SELECT public.fn_sindico_predios(p_client_id))
     LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_condominio_do_titulo(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Pagamento pela Asaas em curso ou feito — mesmos estados de
-- STATUS_ASAAS_TRAVA_TITULO (services/payableService.ts).
CREATE OR REPLACE FUNCTION public.fn_sindico_titulo_em_asaas(p_transaction_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT CASE WHEN bool_or(sp.status = 'DONE') THEN 'Este título foi pago pela Asaas e não pode ser alterado.'
                WHEN count(*) > 0 THEN 'Este título tem pagamento pela Asaas em andamento.'
                ELSE NULL END
      FROM public.supplier_payments sp
     WHERE sp.transaction_id = p_transaction_id
       AND sp.status IN ('APPROVED', 'PENDING', 'SCHEDULED', 'DONE');
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_titulo_em_asaas(uuid) FROM PUBLIC, anon, authenticated;

-- Fornecedor visível para a org (regra da RLS de `suppliers`: dono ou compartilhado com ela).
CREATE OR REPLACE FUNCTION public.fn_sindico_fornecedor_visivel(p_supplier_id uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.suppliers s
         WHERE s.id = p_supplier_id
           AND (s.organization_id = p_org
                OR EXISTS (SELECT 1 FROM public.supplier_org_shares sh
                            WHERE sh.supplier_id = s.id AND sh.target_org_id = p_org)));
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_fornecedor_visivel(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Valida os campos de classificação/pagamento de UMA linha contra o condomínio
-- e a org. Devolve o motivo da recusa, ou NULL.
CREATE OR REPLACE FUNCTION public.fn_sindico_validar_linha(p_linha jsonb, p_empreendimento_id uuid, p_org uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
           AND p_org IN (SELECT public.fn_orgs_atendidas_pela_conta(pa.id))) THEN
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
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_validar_linha(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Leitura ─────────────────────────────────────────────────────────────────

-- O financeiro dos condomínios do síndico numa competência: os títulos (a pagar
-- e a receber) dos centros de custo do condomínio que vencem no mês, os pagos
-- no mês e os em aberto vencidos antes; e, por condomínio, os cadastros que o
-- formulário de lançamento usa. Modo 'ler' (link, login e prévia do admin).
CREATE OR REPLACE FUNCTION public.sindico_portal_financeiro(p_token text DEFAULT NULL, p_client_id uuid DEFAULT NULL, p_competencia date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
                   AND public.fn_org_do_condominio(e.id) IN (SELECT public.fn_orgs_atendidas_pela_conta(pa.id))), '[]'::jsonb) END,
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
            'travaAsaas', public.fn_sindico_titulo_em_asaas(t.id)
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
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_financeiro(text, uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_financeiro(text, uuid, date) TO anon, authenticated;

-- Quais destes títulos o chamador pode ver — a Edge `sindico-portal-financeiro`
-- autoriza por aqui antes de resolver código/arquivo e assinar (com a
-- credencial de QUEM CHAMOU; a service_role só assina).
CREATE OR REPLACE FUNCTION public.sindico_portal_titulos_autorizados(p_token text, p_client_id uuid, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_r   jsonb;
    v_cli uuid;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF coalesce(array_length(p_ids, 1), 0) > 500 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Títulos demais numa chamada.');
    END IF;
    RETURN jsonb_build_object('ok', true, 'ids', coalesce((
        SELECT jsonb_agg(t.id)
          FROM public.internal_transactions t
          JOIN public.cost_centers_v2 cc ON cc.id = t.cost_center_id
         WHERE t.id = ANY (p_ids)
           AND cc.empreendimento_id IN (SELECT public.fn_sindico_predios(v_cli))), '[]'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_titulos_autorizados(text, uuid, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_titulos_autorizados(text, uuid, uuid[]) TO anon, authenticated;

-- Pode enviar anexo para este condomínio? Devolve a org (a 1ª pasta do caminho).
CREATE OR REPLACE FUNCTION public.sindico_portal_autorizar_upload(p_token text, p_client_id uuid, p_empreendimento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_motivo text;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(p_empreendimento_id);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    RETURN jsonb_build_object('ok', true, 'org', public.fn_org_do_condominio(p_empreendimento_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_autorizar_upload(text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_autorizar_upload(text, uuid, uuid) TO authenticated;

-- ── Escritas (modo 'sessao') ────────────────────────────────────────────────

-- Lançar conta a pagar. `p_parcelas` = as linhas de `montarTitulosAvulsos`
-- (utils/pagamentoAvulso.ts): a divisão é do navegador, a validação é daqui.
-- O que é sensível (org, origem, direção, status, alçada, autor, referência)
-- é FORÇADO aqui — não se lê do corpo.
CREATE OR REPLACE FUNCTION public.sindico_portal_lancar_pagar(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_parcelas jsonb,
    p_documento jsonb DEFAULT NULL, p_ja_pago boolean DEFAULT false, p_data_pagamento date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
    IF v_doc_path IS NOT NULL AND (v_doc_path NOT LIKE v_org::text || '/sindico/%' OR v_doc_path LIKE '%..%') THEN
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
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_lancar_pagar(text, uuid, uuid, jsonb, jsonb, boolean, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_lancar_pagar(text, uuid, uuid, jsonb, jsonb, boolean, date) TO authenticated;

-- Regras comuns de editar/cancelar: título MANUAL do condomínio, em aberto,
-- sem Asaas. Devolve o motivo da recusa, ou NULL.
CREATE OR REPLACE FUNCTION public.fn_sindico_motivo_nao_altera(p_t public.internal_transactions)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT CASE
        WHEN p_t.direction <> 'DEBIT' THEN 'Só títulos a pagar são alterados pelo portal.'
        WHEN p_t.source_system = 'BOLETO' THEN 'Este título vem de um boleto: corrija o boleto com a administradora.'
        WHEN p_t.source_system LIKE 'CONTRACT%' THEN 'Este título vem de um contrato: corrija o contrato com a administradora.'
        WHEN p_t.source_system <> 'MANUAL' THEN 'Este título vem de outra origem e só a administradora altera.'
        WHEN p_t.status = 'CANCELLED' OR coalesce(p_t.business_status, '') = 'CANCELADO' THEN 'Este título já está cancelado.'
        WHEN p_t.status = 'CONCILIATED' OR coalesce(p_t.business_status, '') IN ('PAGO', 'RECEBIDO') THEN 'Este título já está pago.'
        ELSE public.fn_sindico_titulo_em_asaas(p_t.id)
    END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_motivo_nao_altera(public.internal_transactions) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sindico_portal_editar_titulo(
    p_token text, p_client_id uuid, p_titulo_id uuid, p_dados jsonb,
    p_documento jsonb DEFAULT NULL, p_remover_documento boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
    IF v_doc_path IS NOT NULL AND (v_doc_path NOT LIKE v_org::text || '/sindico/%' OR v_doc_path LIKE '%..%') THEN
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
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_editar_titulo(text, uuid, uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_editar_titulo(text, uuid, uuid, jsonb, jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.sindico_portal_cancelar_titulo(p_token text, p_client_id uuid, p_titulo_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_emp    uuid;
    v_org    uuid;
    v_recusa text;
    v_obs    text := nullif(btrim(coalesce(p_motivo, '')), '');
    v_t      public.internal_transactions;
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
    IF v_obs IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Diga por que o título está sendo cancelado.');
    END IF;

    SELECT * INTO v_t FROM public.internal_transactions WHERE id = p_titulo_id FOR UPDATE;
    IF v_t.organization_id <> v_org THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este título está em outra organização e só a administradora altera.');
    END IF;
    v_recusa := public.fn_sindico_motivo_nao_altera(v_t);
    IF v_recusa IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_recusa); END IF;
    IF public.fn_period_is_closed(v_org, v_t.transaction_date) THEN
        RETURN jsonb_build_object('ok', false, 'motivo',
            format('O mês %s está fechado no Fechamento Mensal.', to_char(v_t.transaction_date, 'MM/YYYY')));
    END IF;

    -- Cancelar nunca apaga: a linha fica, com o motivo no log.
    UPDATE public.internal_transactions
       SET status = 'CANCELLED', business_status = 'CANCELADO', updated_at = now()
     WHERE id = p_titulo_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, transaction_id, antes, depois)
    VALUES (v_org, v_emp, v_cli, v_nome, 'CANCELAR', p_titulo_id, to_jsonb(v_t), jsonb_build_object('motivo', v_obs));

    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_cancelar_titulo(text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_cancelar_titulo(text, uuid, uuid, text) TO authenticated;

-- Dar baixa num título a pagar do condomínio (qualquer origem). Espelho de
-- `payableService.darBaixa`: respeita a alçada pendente (`alcadaDaBaixa`).
CREATE OR REPLACE FUNCTION public.sindico_portal_baixar_titulo(
    p_token text, p_client_id uuid, p_titulo_id uuid, p_data date, p_forma text DEFAULT NULL, p_conta uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
           AND v_org IN (SELECT public.fn_orgs_atendidas_pela_conta(pa.id))) THEN
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
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_baixar_titulo(text, uuid, uuid, date, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_baixar_titulo(text, uuid, uuid, date, text, uuid) TO authenticated;

-- Cadastrar fornecedor na org do condomínio. CPF/CNPJ que já existe em
-- QUALQUER organização não duplica: o cadastro existente é compartilhado com o
-- condomínio (`supplier_org_shares`), como a migração do 010 fez com os 5.
CREATE OR REPLACE FUNCTION public.sindico_portal_salvar_fornecedor(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_org    uuid;
    v_motivo text;
    v_name   text := nullif(btrim(coalesce(p_dados ->> 'name', '')), '');
    v_doc    text := nullif(regexp_replace(coalesce(p_dados ->> 'document', ''), '\D', '', 'g'), '');
    v_email  text := nullif(lower(btrim(coalesce(p_dados ->> 'email', ''))), '');
    v_tipo   text;
    v_exist  public.suppliers;
    v_id     uuid;
    v_pix    text := nullif(btrim(coalesce(p_dados ->> 'pix_key', '')), '');
    v_pix_t  text := nullif(p_dados ->> 'pix_key_type', '');
    v_conta  text := nullif(btrim(coalesce(p_dados ->> 'account', '')), '');
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

    IF v_name IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o nome do fornecedor.'); END IF;
    IF v_doc IS NOT NULL AND length(v_doc) NOT IN (11, 14) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'CPF tem 11 dígitos e CNPJ tem 14.');
    END IF;
    v_tipo := CASE WHEN length(v_doc) = 11 THEN 'PF' WHEN length(v_doc) = 14 THEN 'PJ'
                   WHEN p_dados ->> 'type' IN ('PF', 'PJ') THEN p_dados ->> 'type' ELSE 'PJ' END;
    IF v_pix_t IS NOT NULL AND v_pix_t NOT IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Tipo de chave PIX inválido.');
    END IF;

    -- Mesmo critério de `find_supplier_by_document` (só dígitos, global).
    IF v_doc IS NOT NULL THEN
        SELECT * INTO v_exist FROM public.suppliers s
         WHERE regexp_replace(coalesce(s.document, ''), '\D', '', 'g') = v_doc
         ORDER BY (s.organization_id = v_org) DESC, s.created_at
         LIMIT 1;
        IF FOUND THEN
            IF NOT public.fn_sindico_fornecedor_visivel(v_exist.id, v_org) THEN
                INSERT INTO public.supplier_org_shares (supplier_id, target_org_id) VALUES (v_exist.id, v_org);
                INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, supplier_id, depois)
                VALUES (v_org, p_empreendimento_id, v_cli, v_nome, 'FORNECEDOR_COMPARTILHADO', v_exist.id,
                        jsonb_build_object('name', v_exist.name));
            END IF;
            RETURN jsonb_build_object('ok', true, 'id', v_exist.id, 'nome', v_exist.name, 'existente', true);
        END IF;
    END IF;

    -- `suppliers_email_key` é UNIQUE global: e-mail já usado → grava sem e-mail
    -- (mesma saída de `supplierService.addSupplier`).
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.suppliers WHERE lower(email) = v_email) THEN
        v_email := NULL;
    END IF;

    INSERT INTO public.suppliers (
        name, document, type, email, phone, contact_name, category,
        organization_id, code, is_shared, lancado_por_sindico_client_id
    ) VALUES (
        v_name, nullif(btrim(coalesce(p_dados ->> 'document', '')), ''), v_tipo, v_email,
        nullif(btrim(coalesce(p_dados ->> 'phone', '')), ''),
        nullif(btrim(coalesce(p_dados ->> 'contact_name', '')), ''),
        nullif(btrim(coalesce(p_dados ->> 'category', '')), ''),
        v_org, public.get_next_supplier_code(v_org), false, v_cli
    ) RETURNING id INTO v_id;

    IF v_pix IS NOT NULL OR v_conta IS NOT NULL THEN
        INSERT INTO public.supplier_bank_accounts (
            supplier_id, organization_id, bank_code, bank_name, agency, account, account_type,
            beneficiary_name, beneficiary_document, pix_key, pix_key_type, is_pix_primary, is_primary, status, created_by
        ) VALUES (
            v_id, v_org,
            nullif(btrim(coalesce(p_dados ->> 'bank_code', '')), ''), nullif(btrim(coalesce(p_dados ->> 'bank_name', '')), ''),
            nullif(btrim(coalesce(p_dados ->> 'agency', '')), ''), v_conta,
            -- NOT NULL na tabela, mesmo com só a chave PIX.
            CASE WHEN p_dados ->> 'account_type' IN ('corrente', 'poupanca', 'pagamento') THEN p_dados ->> 'account_type' ELSE 'corrente' END,
            v_name, v_doc, v_pix, v_pix_t, v_pix IS NOT NULL, true, 'ativo', auth.uid()
        );
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, supplier_id, depois)
    SELECT v_org, p_empreendimento_id, v_cli, v_nome, 'FORNECEDOR', s.id, to_jsonb(s)
      FROM public.suppliers s WHERE s.id = v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id, 'nome', v_name, 'existente', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_salvar_fornecedor(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_salvar_fornecedor(text, uuid, uuid, jsonb) TO authenticated;

-- ── Contadores de conferência (rodar depois de aplicar) ─────────────────────
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE column_name = 'lancado_por_sindico_client_id') AS colunas,   -- 2
--   (SELECT count(*) FROM pg_proc WHERE proname LIKE 'sindico_portal_%' AND proname IN (
--        'sindico_portal_financeiro','sindico_portal_titulos_autorizados','sindico_portal_autorizar_upload',
--        'sindico_portal_lancar_pagar','sindico_portal_editar_titulo','sindico_portal_cancelar_titulo',
--        'sindico_portal_baixar_titulo','sindico_portal_salvar_fornecedor')) AS rpcs,                                     -- 8
--   (SELECT relrowsecurity FROM pg_class WHERE relname = 'sindico_financeiro_eventos') AS rls;                           -- true
