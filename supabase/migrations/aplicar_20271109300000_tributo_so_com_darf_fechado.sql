-- Tributo só chega a Contas a Pagar depois do DARF FECHADO (pedido de 09/11/2026).
-- Plano: docs/planos/2026-11-09-tributo-em-contas-a-pagar-so-com-darf-fechado.md
--
-- "Fechado" = enviado para aprovação. Montar o DARF é rascunho; enviar fecha e o
-- trava (sem desagrupar, sem mudar vencimento/multa/juros) até aprovar ou rejeitar.
-- O DARF não tem mais mínimo de tributos. FGTS continua avulso (guia própria).
--
-- O corte em Contas a Pagar é na TELA (utils/darf.soOsDeContasAPagar), não em
-- vw_payables: DRE, fluxo de caixa e projeções continuam contando o tributo, e a
-- composição do DARF em rascunho lê a view.
--
-- Funções reescritas a partir da definição VIVA (pg_get_functiondef lido como UTF-8
-- em 09/11/2026; corpo idêntico ao de aplicar_20271021300000, aplicar_20271026400000
-- e aplicar_20271026600000). Assinaturas iguais: CREATE OR REPLACE, sem DROP.
-- REGRA #7: ACL reafirmada após cada função.

BEGIN;

-- ── M1. Membro de DARF não entra na alçada sozinho: quem é aprovado é o DARF ──
CREATE OR REPLACE FUNCTION public.fn_titulo_nasce_na_alcada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    m record;
    v_niveis integer;
BEGIN
    IF COALESCE(NEW.status, 'PENDING') <> 'PENDING'
       OR COALESCE(NEW.business_status, '') IN ('RETIDO', 'CANCELADO', 'PAGO')
       OR COALESCE(NEW.source_system, '') IN ('ASAAS_FEE', 'DARF')
       OR COALESCE(NEW.entry_type, 'PRINCIPAL') = 'CONTRA'
       OR COALESCE(NEW.approval_status, 'RASCUNHO') <> 'RASCUNHO'
       -- 09/11/2026: tributo agrupado segue o DARF (fn_darf_enviar_aprovacao).
       -- Sem isto, o RASCUNHO que fn_darf_criar grava voltaria a PENDENTE pelo
       -- gatilho de UPDATE, e o DARF nasceria "aguardando aprovação".
       OR NEW.darf_id IS NOT NULL
       OR public.fn_org_e_condominio(NEW.organization_id) THEN
        RETURN NEW;
    END IF;

    -- Mesmo título recriado pelo sync, mesmo valor, nos últimos 30 dias → continua aprovado.
    IF TG_OP = 'INSERT' AND NEW.reference_id IS NOT NULL AND NEW.source_system IS NOT NULL THEN
        SELECT * INTO m
          FROM public.titulo_aprovacao_memoria mm
         WHERE mm.organization_id = NEW.organization_id
           AND mm.source_system = NEW.source_system
           AND mm.reference_id = NEW.reference_id
           AND mm.entry_type = COALESCE(NEW.entry_type, 'PRINCIPAL')
           AND mm.amount = NEW.amount
           AND mm.apagado_em > now() - interval '30 days'
         ORDER BY mm.apagado_em DESC
         LIMIT 1;
        IF FOUND THEN
            NEW.approval_status          := 'APROVADO';
            NEW.approval_chain           := m.approval_chain;
            NEW.approval_required_levels := m.approval_required_levels;
            DELETE FROM public.titulo_aprovacao_memoria
             WHERE organization_id = m.organization_id AND source_system = m.source_system
               AND reference_id = m.reference_id AND entry_type = m.entry_type;
            RETURN NEW;
        END IF;
    END IF;

    SELECT r.required_levels INTO v_niveis
      FROM public.fn_resolve_approval_levels(NEW.organization_id, NEW.amount) r;
    NEW.approval_status          := 'PENDENTE';
    NEW.approval_chain           := '[]'::jsonb;
    NEW.approval_required_levels := COALESCE(v_niveis, 1);
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_titulo_nasce_na_alcada() FROM PUBLIC, anon, authenticated;

-- ── M2. Criar: sem mínimo de tributos; o DARF nasce RASCUNHO (não enviado) ───
CREATE OR REPLACE FUNCTION public.fn_darf_criar(
    p_darf_id uuid,
    p_tributo_ids uuid[],
    p_due_date date,
    p_multa numeric,
    p_juros numeric,
    p_dados jsonb,
    p_categoria_encargos jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ids   uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_tributo_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
    v_multa numeric := COALESCE(p_multa, 0);
    v_juros numeric := COALESCE(p_juros, 0);
    v_achados int;
    v_org   uuid;
    v_comp  date;
    v_barras text := NULLIF(regexp_replace(COALESCE(p_dados ->> 'codigo_barras', ''), '\D', '', 'g'), '');
BEGIN
    IF p_darf_id IS NULL OR p_due_date IS NULL THEN
        RAISE EXCEPTION 'Informe o vencimento do DARF.' USING ERRCODE = 'P0001';
    END IF;
    IF v_multa < 0 OR v_juros < 0 THEN
        RAISE EXCEPTION 'Multa e juros não podem ser negativos.' USING ERRCODE = 'P0001';
    END IF;
    -- 09/11/2026: sem mínimo — 1 tributo basta (o mínimo de 2 caiu a pedido do usuário).
    IF cardinality(v_ids) = 0 THEN
        RAISE EXCEPTION 'Selecione ao menos um tributo.' USING ERRCODE = 'P0001';
    END IF;

    -- Trava os tributos (ordem fixa: sem deadlock entre duas criações).
    PERFORM 1 FROM public.internal_transactions WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

    SELECT count(*),
           min(organization_id::text)::uuid,
           min(date_trunc('month', transaction_date)::date)
      INTO v_achados, v_org, v_comp
      FROM public.internal_transactions
     WHERE id = ANY(v_ids);

    IF v_achados <> cardinality(v_ids) THEN
        RAISE EXCEPTION 'Algum tributo não foi encontrado ou você não tem acesso a ele.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.internal_transactions
                WHERE id = ANY(v_ids) AND (party_type IS DISTINCT FROM 'TAX' OR direction <> 'DEBIT')) THEN
        RAISE EXCEPTION 'Só tributos entram em um DARF.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.internal_transactions WHERE id = ANY(v_ids) AND darf_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Algum tributo já está em outro DARF.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.internal_transactions
                WHERE id = ANY(v_ids)
                  AND (status <> 'PENDING' OR COALESCE(business_status, 'PREVISTO') <> 'PREVISTO')) THEN
        RAISE EXCEPTION 'Só tributos em aberto (a pagar ou vencidos) entram no DARF — pago, retido pelo cliente ou cancelado fica de fora.'
            USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT count(DISTINCT organization_id) FROM public.internal_transactions WHERE id = ANY(v_ids)) > 1 THEN
        RAISE EXCEPTION 'Um DARF é de uma organização só.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.internal_transactions WHERE id = ANY(v_ids) AND transaction_date IS NULL)
       OR (SELECT count(DISTINCT date_trunc('month', transaction_date)) FROM public.internal_transactions WHERE id = ANY(v_ids)) > 1 THEN
        RAISE EXCEPTION 'Um DARF só junta tributos da mesma competência.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.reconciliation_matches WHERE internal_transaction_id = ANY(v_ids)) THEN
        RAISE EXCEPTION 'Algum tributo já está conciliado com o extrato.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.supplier_payments
                WHERE transaction_id = ANY(v_ids) AND status IN ('APPROVED', 'PENDING', 'SCHEDULED', 'DONE')) THEN
        RAISE EXCEPTION 'Algum tributo tem pagamento pela Asaas em andamento ou já feito.' USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('darf.rpc', 'on', true);

    INSERT INTO public.darfs (id, organization_id, competencia, due_date,
                              codigo_barras, numero_documento, observacao, documento_path, documento_nome)
    VALUES (p_darf_id, v_org, v_comp, p_due_date,
            v_barras,
            NULLIF(btrim(p_dados ->> 'numero_documento'), ''),
            NULLIF(btrim(p_dados ->> 'observacao'), ''),
            NULLIF(p_dados ->> 'documento_path', ''),
            NULLIF(p_dados ->> 'documento_nome', ''));

    -- A aprovação individual do tributo (todo título nasce PENDENTE desde 26/10)
    -- não vale para a guia: o DARF nasce RASCUNHO e só entra em Aprovações — e em
    -- Contas a Pagar — quando enviado (fn_darf_enviar_aprovacao).
    UPDATE public.internal_transactions
       SET darf_id = p_darf_id,
           due_date_antes_darf = due_date,
           due_date = p_due_date,
           approval_status = 'RASCUNHO',
           approval_chain = '[]'::jsonb,
           approval_required_levels = 1,
           updated_at = now()
     WHERE id = ANY(v_ids);

    PERFORM public.fn_darf_gravar_encargos(p_darf_id, v_org, v_comp, p_due_date, v_multa, v_juros, p_categoria_encargos);

    PERFORM set_config('darf.rpc', 'off', true);
    RETURN p_darf_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_criar(uuid, uuid[], date, numeric, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_criar(uuid, uuid[], date, numeric, numeric, jsonb, jsonb) TO authenticated;

-- ── M3. Editar: sem mínimo; aguardando aprovação trava vencimento/multa/juros ─
CREATE OR REPLACE FUNCTION public.fn_darf_editar(p_darf_id uuid, p_due_date date, p_multa numeric, p_juros numeric, p_dados jsonb, p_categoria_encargos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    d       public.darfs%ROWTYPE;
    s       record;
    v_multa numeric := COALESCE(p_multa, 0);
    v_juros numeric := COALESCE(p_juros, 0);
    v_multa_atual numeric;
    v_juros_atual numeric;
    v_total_antes numeric;
    v_total_depois numeric;
    v_aprov_antes text;
    v_niveis integer;
    v_cadeia jsonb;
BEGIN
    SELECT * INTO d FROM public.darfs WHERE id = p_darf_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DARF não encontrado ou sem acesso.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.internal_transactions WHERE darf_id = p_darf_id ORDER BY id FOR UPDATE;
    SELECT * INTO s FROM public.fn_darf_situacao(p_darf_id);

    IF v_multa < 0 OR v_juros < 0 THEN
        RAISE EXCEPTION 'Multa e juros não podem ser negativos.' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(sum(amount) FILTER (WHERE reference_id = 'darf-' || p_darf_id || '-multa'), 0),
           COALESCE(sum(amount) FILTER (WHERE reference_id = 'darf-' || p_darf_id || '-juros'), 0),
           COALESCE(sum(amount), 0)
      INTO v_multa_atual, v_juros_atual, v_total_antes
      FROM public.internal_transactions WHERE darf_id = p_darf_id;
    v_aprov_antes := public.fn_darf_aprovacao(p_darf_id);

    IF s.n_pagos > 0 THEN
        IF p_due_date IS DISTINCT FROM d.due_date OR v_multa <> v_multa_atual OR v_juros <> v_juros_atual THEN
            RAISE EXCEPTION 'DARF pago: vencimento, multa e juros só mudam depois de estornar a baixa em Contas a Pagar.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
        IF p_due_date IS NULL THEN
            RAISE EXCEPTION 'Informe o vencimento do DARF.' USING ERRCODE = 'P0001';
        END IF;
        -- 09/11/2026: enviado = fechado. Texto IDÊNTICO a MOTIVO_DARF_AGUARDANDO (utils/darf.ts).
        IF v_aprov_antes = 'PENDENTE'
           AND (p_due_date IS DISTINCT FROM d.due_date OR v_multa <> v_multa_atual OR v_juros <> v_juros_atual) THEN
            RAISE EXCEPTION 'DARF aguardando aprovação em Financeiro › Aprovações: vencimento, multa e juros só mudam depois de aprovado ou rejeitado.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    PERFORM set_config('darf.rpc', 'on', true);

    UPDATE public.darfs
       SET due_date = COALESCE(p_due_date, due_date),
           codigo_barras = NULLIF(regexp_replace(COALESCE(p_dados ->> 'codigo_barras', ''), '\D', '', 'g'), ''),
           numero_documento = NULLIF(btrim(p_dados ->> 'numero_documento'), ''),
           observacao = NULLIF(btrim(p_dados ->> 'observacao'), ''),
           documento_path = NULLIF(p_dados ->> 'documento_path', ''),
           documento_nome = NULLIF(p_dados ->> 'documento_nome', ''),
           updated_at = now()
     WHERE id = p_darf_id;

    IF s.n_pagos = 0 THEN
        UPDATE public.internal_transactions
           SET due_date = p_due_date, updated_at = now()
         WHERE darf_id = p_darf_id AND party_type = 'TAX' AND due_date IS DISTINCT FROM p_due_date;
        PERFORM public.fn_darf_gravar_encargos(p_darf_id, d.organization_id, d.competencia, p_due_date,
                                               v_multa, v_juros, p_categoria_encargos);

        SELECT COALESCE(sum(amount), 0) INTO v_total_depois
          FROM public.internal_transactions WHERE darf_id = p_darf_id;
        IF v_total_depois <> v_total_antes THEN
            IF v_aprov_antes = 'REJEITADO' THEN
                SELECT COALESCE((array_agg(COALESCE(it.approval_chain, '[]'::jsonb)
                                 ORDER BY jsonb_array_length(COALESCE(it.approval_chain, '[]'::jsonb)) DESC))[1], '[]'::jsonb)
                  INTO v_cadeia FROM public.internal_transactions it WHERE it.darf_id = p_darf_id;
                UPDATE public.internal_transactions
                   SET approval_status = 'REJEITADO', approval_chain = v_cadeia, updated_at = now()
                 WHERE darf_id = p_darf_id AND approval_status IS DISTINCT FROM 'REJEITADO';
            ELSIF v_aprov_antes IN ('APROVADO', 'PENDENTE') THEN
                SELECT nn.niveis INTO v_niveis FROM public.fn_darf_niveis(p_darf_id) nn;
                UPDATE public.internal_transactions
                   SET approval_status = 'PENDENTE', approval_chain = '[]'::jsonb,
                       approval_required_levels = COALESCE(v_niveis, 1), updated_at = now()
                 WHERE darf_id = p_darf_id;
            END IF;
        END IF;
    END IF;

    PERFORM set_config('darf.rpc', 'off', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_editar(uuid, date, numeric, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_editar(uuid, date, numeric, numeric, jsonb, jsonb) TO authenticated;

-- ── M4. Desagrupar: aguardando aprovação não desfaz ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_darf_desagrupar(p_darf_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    d public.darfs%ROWTYPE;
    s record;
BEGIN
    SELECT * INTO d FROM public.darfs WHERE id = p_darf_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DARF não encontrado ou sem acesso.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.internal_transactions WHERE darf_id = p_darf_id ORDER BY id FOR UPDATE;
    SELECT * INTO s FROM public.fn_darf_situacao(p_darf_id);

    IF s.conciliado THEN
        RAISE EXCEPTION 'DARF conciliado com o extrato — desfaça a conciliação em Conciliação Bancária antes de desagrupar.'
            USING ERRCODE = 'P0001';
    END IF;
    IF s.n_pagos > 0 THEN
        RAISE EXCEPTION 'DARF pago — estorne a baixa em Contas a Pagar antes de desagrupar.' USING ERRCODE = 'P0001';
    END IF;
    -- 09/11/2026: texto IDÊNTICO ao de motivoNaoDesagrupa (components/financeiro/DarfsTab.tsx).
    IF public.fn_darf_aprovacao(p_darf_id) = 'PENDENTE' THEN
        RAISE EXCEPTION 'DARF aguardando aprovação — rejeite-o em Financeiro › Aprovações antes de desagrupar.'
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('darf.rpc', 'on', true);

    UPDATE public.internal_transactions
       SET due_date = COALESCE(due_date_antes_darf, due_date),
           due_date_antes_darf = NULL,
           darf_id = NULL,
           updated_at = now()
     WHERE darf_id = p_darf_id AND party_type = 'TAX';

    -- Sobram só multa/juros, que são do próprio DARF.
    DELETE FROM public.internal_transactions WHERE darf_id = p_darf_id;
    DELETE FROM public.darfs WHERE id = p_darf_id;

    PERFORM set_config('darf.rpc', 'off', true);
    RETURN jsonb_build_object('documento_path', d.documento_path);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_desagrupar(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_desagrupar(uuid) TO authenticated;

-- ── M5. Baixa: DARF não enviado não se paga ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_darf_dar_baixa(p_darf_id uuid, p_payment_date date, p_payment_type text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s record;
    v_ids uuid[];
BEGIN
    PERFORM 1 FROM public.darfs WHERE id = p_darf_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DARF não encontrado ou sem acesso.' USING ERRCODE = 'P0001';
    END IF;
    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'Informe a data do pagamento.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.internal_transactions WHERE darf_id = p_darf_id ORDER BY id FOR UPDATE;
    SELECT * INTO s FROM public.fn_darf_situacao(p_darf_id);

    IF s.n_membros = 0 THEN
        RAISE EXCEPTION 'DARF sem lançamentos.' USING ERRCODE = 'P0001';
    END IF;
    IF s.n_pagos > 0 THEN
        RAISE EXCEPTION 'Este DARF já está pago.' USING ERRCODE = 'P0001';
    END IF;
    -- 09/11/2026: rascunho não está em Contas a Pagar — só chamada direta chegaria aqui.
    IF public.fn_darf_aprovacao(p_darf_id) = 'RASCUNHO' THEN
        RAISE EXCEPTION 'DARF ainda não enviado para aprovação — envie em Financeiro › Tributos a Pagar › DARFs.'
            USING ERRCODE = 'P0001';
    END IF;
    IF s.alcada_pendente THEN
        -- Texto IDÊNTICO a MOTIVO_ALCADA_PENDENTE (services/alcadaDaBaixa.ts).
        RAISE EXCEPTION 'Aguardando aprovação na alçada — aprove em Financeiro › Aprovações antes de dar baixa. A conciliação com o extrato continua liberada.'
            USING ERRCODE = 'P0001';
    END IF;
    IF s.asaas_em_curso THEN
        RAISE EXCEPTION 'DARF com pagamento pela Asaas em andamento.' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.internal_transactions
       SET business_status = 'PAGO',
           status = 'CONCILIATED',
           payment_date = p_payment_date,
           payment_type = p_payment_type,
           updated_at = now()
     WHERE darf_id = p_darf_id;

    SELECT array_agg(id ORDER BY id) INTO v_ids FROM public.internal_transactions WHERE darf_id = p_darf_id;
    RETURN v_ids;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_dar_baixa(uuid, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_dar_baixa(uuid, date, text) TO authenticated;

-- ── M6. Fila: tributo solto (não FGTS) sai — só o DARF enviado é aprovado ──
CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(p_organization_id uuid)
 RETURNS TABLE(entity text, id uuid, title text, party_name text, project_name text, amount numeric, due_date date, approval_status text, approval_chain jsonb, approval_required_levels integer, origem text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;
  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;
  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;
  RETURN QUERY
  -- TRANSAÇÕES (saídas)
  --
  -- 26/10/2026 (2º pedido): CONTRATO e PEDIDO DE COMPRA saíram desta fila. O que
  -- se paga são as PARCELAS (títulos em Contas a Pagar), e elas já nascem
  -- PENDENTES; o contrato/pedido entrava pelo valor TOTAL (CTS-042-0001: R$ 2.850
  -- na fila, enquanto o pago são as parcelas). A aprovação de contrato/pedido
  -- nunca tinha sido usada (0 de 43 contratos, 0 de 21 pedidos).
  --
  -- Desde 26/10/2026 todo título a pagar nasce PENDENTE (gatilho
  -- fn_titulo_nasce_na_alcada), de qualquer valor: PENDENTE entra SEM exigir
  -- faixa — exigir deixaria o título abaixo do piso travado e fora da fila.
  -- RASCUNHO (a submeter) continua só na faixa e só em aberto. Membro de DARF
  -- fica fora: o DARF entra como um item só (ramo abaixo).
  --
  -- 09/11/2026: tributo SOLTO também fica fora — tributo só se paga pelo DARF
  -- enviado para aprovação. Exceção: FGTS (guia própria do FGTS Digital) segue
  -- avulso. Mesma régua de utils/darf.ehFgts.
  SELECT
    'transaction'::text,
    t.id,
    COALESCE(NULLIF(t.description, ''), '(sem descrição)'),
    t.party_name,
    p.name,
    t.amount,
    t.due_date::date,
    COALESCE(t.approval_status, 'RASCUNHO'),
    COALESCE(t.approval_chain, '[]'::jsonb),
    COALESCE(t.approval_required_levels, 1),
    CASE WHEN t.party_type = 'TAX' THEN 'TRIBUTO' ELSE t.source_system END
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = ANY(v_targets)
    AND t.direction = 'DEBIT'
    AND t.darf_id IS NULL
    AND t.status <> 'CANCELLED'
    AND COALESCE(t.business_status, '') <> 'RETIDO'
    -- IS DISTINCT FROM: party_type é NULL na maioria dos títulos, e um
    -- `NOT (party_type = 'TAX' AND …)` viraria NULL e tiraria boleto/comercial da fila.
    AND (t.party_type IS DISTINCT FROM 'TAX' OR btrim(COALESCE(t.party_name, '')) ~* '^FGTS\M')
    AND (
      t.approval_status = 'PENDENTE'
      OR (COALESCE(t.approval_status, 'RASCUNHO') = 'RASCUNHO'
          AND t.status = 'PENDING'
          AND EXISTS (
            SELECT 1 FROM public.financial_approval_config c
            WHERE c.organization_id = t.organization_id AND c.is_active
              AND t.amount >= c.faixa_min AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
          ))
    )

  UNION ALL
  -- DARF (26/10/2026): um item por guia, com o total; pendente quando algum membro pende.
  SELECT
    'darf'::text,
    vd.id,
    'DARF ' || to_char(vd.competencia, 'MM/YYYY') || COALESCE(' — ' || vd.tributos_nomes, ''),
    'Receita Federal (DARF)'::text,
    NULL::text,
    vd.total,
    vd.due_date,
    vd.aprovacao,
    COALESCE(vd.aprovacao_cadeia, '[]'::jsonb),
    (SELECT n.niveis FROM public.fn_darf_niveis(vd.id) n),
    'DARF'::text
  FROM public.vw_darfs vd
  WHERE vd.organization_id = ANY(v_targets)
    AND vd.aprovacao = 'PENDENTE'

  UNION ALL
  -- PLANTA PUBLICADA (blueprint_snapshots)
  --
  -- ⚠️ A condicao aqui e DIFERENTE das tres acima, de proposito. Elas exigem que
  -- o item caia numa faixa de `financial_approval_config` -- porque sao sobre
  -- DINHEIRO, e a faixa e que diz se aquele valor precisa de aprovacao. Uma
  -- revisao de planta nao tem valor: `submit` e chamado com `amount: 0`, como o
  -- proprio approvalService manda fazer para entidade nao monetaria.
  --
  -- Entao o criterio e outro: esta na fila o que ALGUEM ENVIOU. Copiar a
  -- condicao de faixa traria toda revisao publicada para a fila (ou nenhuma,
  -- conforme a organizacao tenha ou nao uma faixa comecando em zero) -- e uma
  -- fila que enche sozinha e uma fila que ninguem olha.
  SELECT
    'blueprint_snapshot'::text,
    bs.id,
    COALESCE(NULLIF(st.name, ''), '(planta sem nome)') || ' - revisao ' || bs.revision::text,
    NULL::text,
    p.name,
    0::numeric,
    NULL::date,
    COALESCE(bs.approval_status, 'RASCUNHO'),
    COALESCE(bs.approval_chain, '[]'::jsonb),
    COALESCE(bs.approval_required_levels, 1),
    'PLANTA'::text
  FROM public.blueprint_snapshots bs
  JOIN public.blueprint_studies st ON st.id = bs.study_id
  LEFT JOIN public.projects p ON p.id = st.project_id
  WHERE bs.organization_id = ANY(v_targets)
    AND bs.approval_status = 'PENDENTE'

  UNION ALL
  -- SOLICITAÇÕES DE COMPRA (purchase_requests)
  --
  -- ⚠️ Critério igual ao da planta, NÃO ao das compras: está na fila o que
  -- ALGUÉM ENVIOU. A SC é submetida com `semFaixa: 'exigir1'` — toda SC pede
  -- ao menos o nível 1, inclusive a que ainda não tem preço (valor 0). Exigir
  -- que o valor caia numa faixa deixaria essa SC PENDENTE e fora da fila, ou
  -- seja, esperando uma aprovação que ninguém vê.
  SELECT
    'purchase_request'::text,
    pr.id,
    -- Sem a palavra "Solicitação": a Central já mostra a etiqueta da entidade
    -- ao lado, e a linha lia "Solicitação Solicitação SC-…" (teste de 26/09).
    COALESCE(pr.number || ' — ', '') || pr.title,
    pr.requested_by_name,
    p.name,
    pr.estimated_total,
    pr.need_date,
    pr.approval_status,
    pr.approval_chain,
    pr.approval_required_levels,
    'SOLICITACAO_COMPRA'::text
  FROM public.purchase_requests pr
  LEFT JOIN public.projects p ON p.id = pr.project_id
  WHERE pr.organization_id = ANY(v_targets)
    AND pr.approval_status = 'PENDENTE'
    AND pr.cancelled_at IS NULL

  UNION ALL
  -- OFÍCIOS (doc_gen_documentos) — 10/10/2026, Documentos › Ofícios F4.
  --
  -- ⚠️ Critério da planta e da SC: está na fila o que ALGUÉM ENVIOU. Ofício não
  -- tem valor (amount 0, `semFaixa: 'exigir1'`). Só rascunho: emitido não
  -- volta para a fila.
  SELECT
    'doc_gen_documento'::text,
    d.id,
    COALESCE(NULLIF(btrim(d.assunto), ''), '(ofício sem assunto)'),
    d.destinatario_snapshot ->> 'razao_social',
    p.name,
    0::numeric,
    d.resposta_esperada_ate,
    d.approval_status,
    d.approval_chain,
    d.approval_required_levels,
    'OFICIO'::text
  FROM public.doc_gen_documentos d
  LEFT JOIN public.projects p ON p.id = d.project_id
  WHERE d.organization_id = ANY(v_targets)
    AND d.approval_status = 'PENDENTE'
    AND d.status = 'RASCUNHO'

  -- ⚠️ O ORDER BY e do CONJUNTO, e por isso vem depois do ultimo ramo. Ele
  -- estava no fim do terceiro ramo, e emendar o quarto abaixo dele o deixaria
  -- ordenando so uma parte -- que o Postgres recusa, e com razao.
  ORDER BY due_date NULLS LAST, amount DESC;

END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) TO authenticated, service_role;

COMMIT;
