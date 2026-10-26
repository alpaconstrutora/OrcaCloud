-- Todo título a pagar passa pela aprovação (pedido de 26/10/2026).
-- Plano: docs/planos/2026-10-26-todo-titulo-a-pagar-passa-pela-aprovacao.md (itens M1–M6).
--
-- Decisões do usuário: TODO título a pagar, de qualquer valor, nasce "Aguardando
-- aprovação" e só se paga depois de aprovado em Financeiro › Aprovações. As faixas
-- de `financial_approval_config` continuam dizendo QUANTOS níveis; abaixo do piso,
-- 1 nível. Na virada, os títulos em aberto VENCIDOS ficam liberados e os A VENCER
-- entram na fila.
--
-- REGRA #7:
--   • fn_titulo_nasce_na_alcada / fn_titulo_aprovacao_memoriza — de gatilho, ninguém
--     chama por RPC. SECURITY DEFINER só para ler/gravar `titulo_aprovacao_memoria`
--     (RLS ligada e sem policy: invisível pela API). EXECUTE revogado de todos.
--   • fn_approval_action_queue — recriada (o retorno ganhou `origem`), mesma ACL de antes.
--   • fn_darf_enviar_aprovacao / fn_darf_aprovar / fn_darf_rejeitar — SECURITY INVOKER:
--     a RLS de internal_transactions/darfs recorta; REVOKE de PUBLIC/anon.

BEGIN;

-- ── M2. Memória da aprovação (sync que apaga e recria o título) ─────────────
-- 27 caminhos em services/ apagam título em aberto e criam de novo (contrato,
-- comercial, folha, tributos, dívida…). Sem memória, um título já aprovado
-- voltaria para a fila a cada sincronização. Só vale para o MESMO valor: valor
-- diferente é outra coisa a aprovar.
CREATE TABLE IF NOT EXISTS public.titulo_aprovacao_memoria (
    id                       bigserial PRIMARY KEY,
    organization_id          uuid NOT NULL,
    source_system            text NOT NULL,
    reference_id             text NOT NULL,
    entry_type               text NOT NULL,
    amount                   numeric NOT NULL,
    approval_chain           jsonb NOT NULL DEFAULT '[]'::jsonb,
    approval_required_levels integer NOT NULL DEFAULT 1,
    apagado_em               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS titulo_aprovacao_memoria_chave_idx
    ON public.titulo_aprovacao_memoria (organization_id, source_system, reference_id, entry_type);
ALTER TABLE public.titulo_aprovacao_memoria ENABLE ROW LEVEL SECURITY;
-- Sem policy: só os gatilhos (SECURITY DEFINER) leem e gravam.
COMMENT ON TABLE public.titulo_aprovacao_memoria IS
    'Aprovação de título a pagar APAGADO em aberto, para o gatilho fn_titulo_nasce_na_alcada '
    'restaurar quando o sync recria o mesmo título (org+origem+reference_id+entry_type+valor). '
    'Plano 2026-10-26-todo-titulo-a-pagar-passa-pela-aprovacao, item M2.';

CREATE OR REPLACE FUNCTION public.fn_titulo_aprovacao_memoriza()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.direction = 'DEBIT' AND OLD.status = 'PENDING'
       AND OLD.approval_status = 'APROVADO'
       AND OLD.reference_id IS NOT NULL AND OLD.source_system IS NOT NULL THEN
        INSERT INTO public.titulo_aprovacao_memoria
            (organization_id, source_system, reference_id, entry_type, amount,
             approval_chain, approval_required_levels)
        VALUES (OLD.organization_id, OLD.source_system, OLD.reference_id,
                COALESCE(OLD.entry_type, 'PRINCIPAL'), OLD.amount,
                COALESCE(OLD.approval_chain, '[]'::jsonb), COALESCE(OLD.approval_required_levels, 1));
    END IF;
    RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_titulo_aprovacao_memoriza() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_titulo_aprovacao_memoriza ON public.internal_transactions;
CREATE TRIGGER trg_titulo_aprovacao_memoriza
    AFTER DELETE ON public.internal_transactions
    FOR EACH ROW WHEN (OLD.direction = 'DEBIT' AND OLD.approval_status = 'APROVADO')
    EXECUTE FUNCTION public.fn_titulo_aprovacao_memoriza();

-- ── M1. Todo título a pagar nasce na alçada ─────────────────────────────────
-- Um ponto só no banco porque são 15 origens que criam título a pagar; um
-- `submitForApproval` por serviço deixaria de fora a próxima origem que surgir.
-- Fora da regra (não há pagamento a aprovar):
--   • já nasce pago/cancelado (avulso "Já pago");
--   • tributo RETIDO pelo cliente;
--   • ASAAS_FEE (o banco já debitou);
--   • multa/juros de DARF (source_system 'DARF' — seguem a aprovação do DARF);
--   • entry_type CONTRA.
-- Respeita quem já grava PENDENTE/APROVADO/REJEITADO explicitamente.
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
       OR COALESCE(NEW.approval_status, 'RASCUNHO') <> 'RASCUNHO' THEN
        RETURN NEW;
    END IF;

    -- Mesmo título recriado pelo sync, mesmo valor, nos últimos 30 dias → continua aprovado.
    IF NEW.reference_id IS NOT NULL AND NEW.source_system IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS trg_titulo_nasce_na_alcada ON public.internal_transactions;
CREATE TRIGGER trg_titulo_nasce_na_alcada
    BEFORE INSERT ON public.internal_transactions
    FOR EACH ROW WHEN (NEW.direction = 'DEBIT')
    EXECUTE FUNCTION public.fn_titulo_nasce_na_alcada();

-- ── M4. vw_payables expõe a alçada (colunas no FIM; effective_status igual) ──
CREATE OR REPLACE VIEW public.vw_payables AS
 SELECT it.id,
    it.organization_id,
    it.source_system,
    it.reference_id,
    it.transaction_date,
    it.due_date,
    it.amount,
    it.direction,
    it.description,
    it.category,
    it.status,
    it.business_status,
    it.party_id,
    it.party_name,
    it.party_type,
    it.entity_name,
    it.supplier_id,
    it.project_id,
    it.cost_center_id,
    it.plano_de_contas_id,
    it.property_id,
    it.property_allocation_mode,
    it.created_at,
    it.updated_at,
        CASE
            WHEN ((it.status = 'CONCILIATED'::text) AND (COALESCE(it.business_status, 'PREVISTO'::text) <> ALL (ARRAY['PARCIAL'::text, 'RENEGOCIADO'::text]))) THEN 'PAGO'::text
            WHEN ((COALESCE(it.business_status, 'PREVISTO'::text) = ANY (ARRAY['PREVISTO'::text, 'EMITIDO'::text, 'ENVIADO'::text, 'APROVADO'::text])) AND (it.due_date IS NOT NULL) AND (it.due_date < CURRENT_DATE)) THEN 'VENCIDO'::text
            ELSE COALESCE(it.business_status, 'PREVISTO'::text)
        END AS effective_status,
    p.name AS project_name,
    cp.name AS property_name,
    o.obra_id,
    o.obra_name,
    it.documento_path,
    it.documento_nome,
    it.category_id,
    it.payment_account_id,
    it.payment_type,
    it.payment_date,
    it.competencia_date,
    it.installment_type,
    it.darf_id,
    COALESCE(it.approval_status, 'RASCUNHO'::text) AS approval_status,
    COALESCE(it.approval_required_levels, 1) AS approval_required_levels,
    COALESCE(it.approval_chain, '[]'::jsonb) AS approval_chain
   FROM (((internal_transactions it
     LEFT JOIN projects p ON ((p.id = it.project_id)))
     LEFT JOIN commercial_properties cp ON ((cp.id = it.property_id)))
     LEFT JOIN vw_project_obra o ON ((o.project_id = it.project_id)))
  WHERE ((it.direction = 'DEBIT'::text) AND (it.status <> 'CANCELLED'::text) AND (it.entry_type IS DISTINCT FROM 'CONTRA'::text));

-- ── M5. DARF: situação da aprovação ─────────────────────────────────────────
-- Rejeitado também trava a baixa do DARF (fn_darf_dar_baixa lê `alcada_pendente`).
CREATE OR REPLACE FUNCTION public.fn_darf_situacao(p_darf_id uuid)
 RETURNS TABLE(n_membros integer, n_tributos integer, n_pagos integer, conciliado boolean, alcada_pendente boolean, asaas_em_curso boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT count(*)::int,
           count(*) FILTER (WHERE it.party_type = 'TAX')::int,
           count(*) FILTER (WHERE it.status = 'CONCILIATED' OR it.business_status = 'PAGO')::int,
           COALESCE(bool_or(EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)), false),
           COALESCE(bool_or(it.approval_status IN ('PENDENTE', 'REJEITADO')), false),
           COALESCE(bool_or(EXISTS (SELECT 1 FROM public.supplier_payments sp
                                     WHERE sp.transaction_id = it.id AND sp.status IN ('APPROVED', 'PENDING', 'SCHEDULED'))), false)
      FROM public.internal_transactions it
     WHERE it.darf_id = p_darf_id;
$function$;

-- Aprovação do DARF inteiro: PENDENTE se algum membro pende; REJEITADO se algum
-- foi rejeitado; APROVADO se todos os TRIBUTOS estão aprovados; senão RASCUNHO.
-- (Multa/juros nascem RASCUNHO e seguem o DARF pelas RPCs abaixo.)
CREATE OR REPLACE FUNCTION public.fn_darf_aprovacao(p_darf_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
             WHEN bool_or(it.approval_status = 'PENDENTE') THEN 'PENDENTE'
             WHEN bool_or(it.approval_status = 'REJEITADO') THEN 'REJEITADO'
             WHEN count(*) FILTER (WHERE it.party_type = 'TAX') > 0
                  AND bool_and(it.approval_status = 'APROVADO') FILTER (WHERE it.party_type = 'TAX') THEN 'APROVADO'
             ELSE 'RASCUNHO'
           END
      FROM public.internal_transactions it
     WHERE it.darf_id = p_darf_id;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_aprovacao(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_aprovacao(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.vw_darfs AS
 SELECT d.id,
    d.organization_id,
    d.competencia,
    d.due_date,
    d.codigo_barras,
    d.numero_documento,
    d.observacao,
    d.documento_path,
    d.documento_nome,
    d.created_by,
    d.created_at,
    d.updated_at,
    COALESCE(a.principal, (0)::numeric) AS principal,
    COALESCE(a.multa, (0)::numeric) AS multa,
    COALESCE(a.juros, (0)::numeric) AS juros,
    COALESCE(a.total, (0)::numeric) AS total,
    COALESCE(a.qtd_tributos, (0)::bigint) AS qtd_tributos,
    a.tributos_nomes,
    COALESCE(a.n_membros, (0)::bigint) AS n_membros,
    COALESCE(a.n_pagos, (0)::bigint) AS n_pagos,
    a.payment_date,
    a.payment_type,
    COALESCE(a.conciliado_no_extrato, false) AS conciliado_no_extrato,
    COALESCE(a.alcada_pendente, false) AS alcada_pendente,
    COALESCE(a.asaas_em_curso, false) AS asaas_em_curso,
        CASE
            WHEN ((COALESCE(a.n_membros, (0)::bigint) > 0) AND (a.n_pagos = a.n_membros)) THEN 'PAGO'::text
            WHEN (COALESCE(a.n_pagos, (0)::bigint) > 0) THEN 'PARCIAL'::text
            WHEN (d.due_date < CURRENT_DATE) THEN 'VENCIDO'::text
            ELSE 'PREVISTO'::text
        END AS status_efetivo,
    COALESCE(a.aprovacao, 'RASCUNHO'::text) AS aprovacao,
    a.aprovacao_cadeia,
    COALESCE(a.aprovacao_niveis, 1) AS aprovacao_niveis
   FROM (darfs d
     LEFT JOIN LATERAL ( SELECT sum(it.amount) FILTER (WHERE (it.party_type = 'TAX'::text)) AS principal,
            sum(it.amount) FILTER (WHERE (it.reference_id = (('darf-'::text || d.id) || '-multa'::text))) AS multa,
            sum(it.amount) FILTER (WHERE (it.reference_id = (('darf-'::text || d.id) || '-juros'::text))) AS juros,
            sum(it.amount) AS total,
            count(*) FILTER (WHERE (it.party_type = 'TAX'::text)) AS qtd_tributos,
            string_agg(DISTINCT it.party_name, ', '::text ORDER BY it.party_name) FILTER (WHERE (it.party_type = 'TAX'::text)) AS tributos_nomes,
            count(*) AS n_membros,
            count(*) FILTER (WHERE ((it.status = 'CONCILIATED'::text) OR (it.business_status = 'PAGO'::text))) AS n_pagos,
            max(it.payment_date) AS payment_date,
            max(it.payment_type) AS payment_type,
            bool_or((EXISTS ( SELECT 1
                   FROM reconciliation_matches m
                  WHERE (m.internal_transaction_id = it.id)))) AS conciliado_no_extrato,
            bool_or((it.approval_status = 'PENDENTE'::text)) AS alcada_pendente,
            bool_or((EXISTS ( SELECT 1
                   FROM supplier_payments sp
                  WHERE ((sp.transaction_id = it.id) AND (sp.status = ANY (ARRAY['APPROVED'::text, 'PENDING'::text, 'SCHEDULED'::text])))))) AS asaas_em_curso,
            CASE
              WHEN bool_or(it.approval_status = 'PENDENTE') THEN 'PENDENTE'
              WHEN bool_or(it.approval_status = 'REJEITADO') THEN 'REJEITADO'
              WHEN count(*) FILTER (WHERE it.party_type = 'TAX') > 0
                   AND bool_and(it.approval_status = 'APROVADO') FILTER (WHERE it.party_type = 'TAX') THEN 'APROVADO'
              ELSE 'RASCUNHO'
            END AS aprovacao,
            -- As RPCs gravam a MESMA cadeia em todos os membros; a mais longa é a do DARF.
            (array_agg(COALESCE(it.approval_chain, '[]'::jsonb) ORDER BY jsonb_array_length(COALESCE(it.approval_chain, '[]'::jsonb)) DESC))[1] AS aprovacao_cadeia,
            max(it.approval_required_levels) AS aprovacao_niveis
           FROM internal_transactions it
          WHERE (it.darf_id = d.id)) a ON (true));

-- Níveis do DARF pelo TOTAL da guia (faixa) ou 1.
CREATE OR REPLACE FUNCTION public.fn_darf_niveis(p_darf_id uuid)
 RETURNS TABLE(niveis integer, rotulo1 text, rotulo2 text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH d AS (
        SELECT dd.organization_id, COALESCE(sum(it.amount), 0) AS total
          FROM public.darfs dd
          LEFT JOIN public.internal_transactions it ON it.darf_id = dd.id
         WHERE dd.id = p_darf_id
         GROUP BY dd.organization_id
    )
    SELECT COALESCE(r.required_levels, 1),
           COALESCE(r.level1_label, 'Gestor'),
           COALESCE(r.level2_label, 'Financeiro / Diretoria')
      FROM d
      LEFT JOIN LATERAL public.fn_resolve_approval_levels(d.organization_id, d.total) r ON true;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_niveis(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_niveis(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_darf_enviar_aprovacao(p_darf_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s record;
    v_niveis integer;
    v_aprov text;
    v_cadeia jsonb;
BEGIN
    PERFORM 1 FROM public.darfs WHERE id = p_darf_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DARF não encontrado ou sem acesso.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.internal_transactions WHERE darf_id = p_darf_id ORDER BY id FOR UPDATE;
    SELECT * INTO s FROM public.fn_darf_situacao(p_darf_id);
    IF s.n_pagos > 0 THEN
        RAISE EXCEPTION 'DARF pago não vai para aprovação.' USING ERRCODE = 'P0001';
    END IF;
    v_aprov := public.fn_darf_aprovacao(p_darf_id);
    IF v_aprov = 'PENDENTE' THEN
        RAISE EXCEPTION 'Este DARF já está em Financeiro › Aprovações.' USING ERRCODE = 'P0001';
    END IF;
    SELECT n.niveis INTO v_niveis FROM public.fn_darf_niveis(p_darf_id) n;
    -- Reenvio de rejeitado preserva a cadeia (histórico da rejeição); fn_darf_aprovar
    -- só conta o que vem depois da última rejeição. Qualquer outro envio recomeça vazio.
    IF v_aprov = 'REJEITADO' THEN
        SELECT COALESCE((array_agg(COALESCE(it.approval_chain, '[]'::jsonb)
                         ORDER BY jsonb_array_length(COALESCE(it.approval_chain, '[]'::jsonb)) DESC))[1], '[]'::jsonb)
          INTO v_cadeia FROM public.internal_transactions it WHERE it.darf_id = p_darf_id;
    ELSE
        v_cadeia := '[]'::jsonb;
    END IF;

    UPDATE public.internal_transactions
       SET approval_status = 'PENDENTE',
           approval_chain = v_cadeia,
           approval_required_levels = COALESCE(v_niveis, 1),
           updated_at = now()
     WHERE darf_id = p_darf_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_enviar_aprovacao(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_enviar_aprovacao(uuid) TO authenticated;

-- Aprova UM nível do DARF; quando os níveis fecham, todos os membros viram APROVADO.
CREATE OR REPLACE FUNCTION public.fn_darf_aprovar(p_darf_id uuid, p_nivel integer, p_por text, p_obs text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    n record;
    v_cadeia jsonb;
    v_niveis_aprovados int[];
    v_completo boolean;
    v_status text;
BEGIN
    PERFORM 1 FROM public.darfs WHERE id = p_darf_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DARF não encontrado ou sem acesso.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.internal_transactions WHERE darf_id = p_darf_id ORDER BY id FOR UPDATE;
    IF public.fn_darf_aprovacao(p_darf_id) <> 'PENDENTE' THEN
        RAISE EXCEPTION 'DARF não está pendente de aprovação.' USING ERRCODE = 'P0001';
    END IF;
    IF p_nivel NOT IN (1, 2) THEN
        RAISE EXCEPTION 'Nível de aprovação inválido.' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO n FROM public.fn_darf_niveis(p_darf_id);

    SELECT COALESCE((array_agg(COALESCE(it.approval_chain, '[]'::jsonb)
                     ORDER BY jsonb_array_length(COALESCE(it.approval_chain, '[]'::jsonb)) DESC))[1], '[]'::jsonb)
      INTO v_cadeia
      FROM public.internal_transactions it WHERE it.darf_id = p_darf_id;

    v_cadeia := v_cadeia || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'level', p_nivel,
        'role', CASE WHEN p_nivel = 1 THEN n.rotulo1 ELSE n.rotulo2 END,
        'action', 'APROVADO',
        'approved_by', COALESCE(NULLIF(btrim(p_por), ''), auth.jwt() ->> 'email'),
        'approved_at', to_jsonb(now()),
        'notes', NULLIF(btrim(p_obs), ''))));

    -- Só a rodada atual (depois da última rejeição) — mesma regra de
    -- utils/situacaoAprovacaoTitulo.niveisAprovadosNaRodada.
    SELECT array_agg(DISTINCT (x.e ->> 'level')::int) INTO v_niveis_aprovados
      FROM jsonb_array_elements(v_cadeia) WITH ORDINALITY AS x(e, i)
     WHERE x.e ->> 'action' = 'APROVADO'
       AND x.i > COALESCE((SELECT max(y.j) FROM jsonb_array_elements(v_cadeia) WITH ORDINALITY AS y(f, j)
                            WHERE y.f ->> 'action' = 'REJEITADO'), 0);
    v_completo := CASE WHEN n.niveis = 1 THEN 1 = ANY(v_niveis_aprovados)
                       ELSE 1 = ANY(v_niveis_aprovados) AND 2 = ANY(v_niveis_aprovados) END;
    v_status := CASE WHEN v_completo THEN 'APROVADO' ELSE 'PENDENTE' END;

    UPDATE public.internal_transactions
       SET approval_chain = v_cadeia,
           approval_status = v_status,
           approval_required_levels = n.niveis,
           updated_at = now()
     WHERE darf_id = p_darf_id;
    RETURN v_status;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_aprovar(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_aprovar(uuid, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_darf_rejeitar(p_darf_id uuid, p_por text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_cadeia jsonb;
BEGIN
    IF NULLIF(btrim(p_motivo), '') IS NULL THEN
        RAISE EXCEPTION 'Informe o motivo da rejeição.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.darfs WHERE id = p_darf_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DARF não encontrado ou sem acesso.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.internal_transactions WHERE darf_id = p_darf_id ORDER BY id FOR UPDATE;
    IF public.fn_darf_aprovacao(p_darf_id) <> 'PENDENTE' THEN
        RAISE EXCEPTION 'DARF não está pendente de aprovação.' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE((array_agg(COALESCE(it.approval_chain, '[]'::jsonb)
                     ORDER BY jsonb_array_length(COALESCE(it.approval_chain, '[]'::jsonb)) DESC))[1], '[]'::jsonb)
      INTO v_cadeia
      FROM public.internal_transactions it WHERE it.darf_id = p_darf_id;
    v_cadeia := v_cadeia || jsonb_build_array(jsonb_build_object(
        'level', 1, 'role', 'Rejeição', 'action', 'REJEITADO',
        'approved_by', COALESCE(NULLIF(btrim(p_por), ''), auth.jwt() ->> 'email'),
        'approved_at', to_jsonb(now()), 'notes', btrim(p_motivo)));

    UPDATE public.internal_transactions
       SET approval_chain = v_cadeia, approval_status = 'REJEITADO', updated_at = now()
     WHERE darf_id = p_darf_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_rejeitar(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_darf_rejeitar(uuid, text, text) TO authenticated;

-- fn_darf_editar: se o TOTAL mudou (multa/juros), a aprovação dada valia para outro
-- valor → todos os membros voltam PENDENTE (rejeitado continua rejeitado, e as
-- linhas novas de multa/juros herdam a rejeição).
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
        IF s.n_tributos < 2 AND v_multa + v_juros = 0 THEN
            RAISE EXCEPTION 'Um DARF junta ao menos 2 tributos — ou 1 tributo com multa/juros.' USING ERRCODE = 'P0001';
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

-- ── M3. Fila: título PENDENTE de qualquer valor + DARF como um item ─────────
DROP FUNCTION IF EXISTS public.fn_approval_action_queue(uuid);
CREATE FUNCTION public.fn_approval_action_queue(p_organization_id uuid)
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
  -- Desde 26/10/2026 todo título a pagar nasce PENDENTE (gatilho
  -- fn_titulo_nasce_na_alcada), de qualquer valor: PENDENTE entra SEM exigir
  -- faixa — exigir deixaria o título abaixo do piso travado e fora da fila.
  -- RASCUNHO (a submeter) continua só na faixa e só em aberto. Membro de DARF
  -- fica fora: o DARF entra como um item só (ramo abaixo).
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
  -- CONTRATOS
  SELECT
    'contract'::text,
    k.id,
    COALESCE(NULLIF(k.title, ''), 'Contrato ' || COALESCE(k.number, '')),
    COALESCE(s.name, cl.name),
    p.name,
    k.current_value,
    NULL::date,
    COALESCE(k.approval_status, 'RASCUNHO'),
    COALESCE(k.approval_chain, '[]'::jsonb),
    COALESCE(k.approval_required_levels, 1),
    'CONTRATO'::text
  FROM public.contracts k
  LEFT JOIN public.projects  p  ON p.id  = k.project_id
  LEFT JOIN public.suppliers s  ON s.id  = k.supplier_id
  LEFT JOIN public.clients   cl ON cl.id = k.client_id
  WHERE k.organization_id = ANY(v_targets)
    AND COALESCE(k.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = k.organization_id AND c.is_active
        AND k.current_value >= c.faixa_min AND (c.faixa_max IS NULL OR k.current_value < c.faixa_max)
    )

  UNION ALL
  -- COMPRAS (purchase_orders) — valor = Σ items[] (cotado quando houver, senão
  -- referência — mesma regra de utils/pedidoItemValor.ts); escopo via empresa→org
  SELECT
    'purchase_order'::text,
    po.id,
    'Pedido ' || COALESCE(po.number, ''),
    s.name,
    p.name,
    po_total.v,
    NULL::date,
    COALESCE(po.approval_status, 'RASCUNHO'),
    COALESCE(po.approval_chain, '[]'::jsonb),
    COALESCE(po.approval_required_levels, 1),
    'PEDIDO'::text
  FROM public.purchase_orders po
  JOIN public.companies cmp ON cmp.id = po.empresa_id
  LEFT JOIN public.projects  p ON p.id = po.project_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE((it->>'quotedTotal')::numeric, (it->>'total')::numeric)), 0) AS v
    FROM jsonb_array_elements(COALESCE(po.items, '[]'::jsonb)) it
  ) po_total
  WHERE cmp.org_id = ANY(v_targets)
    AND COALESCE(po.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = cmp.org_id AND c.is_active
        AND po_total.v >= c.faixa_min AND (c.faixa_max IS NULL OR po_total.v < c.faixa_max)
    )

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

-- ── M6. Virada (26/10/2026): vencidos liberados, a vencer na fila ───────────
-- Tabela de reversão — NÃO APAGAR (é o único registro do estado anterior).
CREATE TABLE IF NOT EXISTS public._reversao_virada_alcada_20271026 (
    id                       uuid PRIMARY KEY,
    approval_status          text,
    approval_chain           jsonb,
    approval_required_levels integer,
    business_status          text,
    acao                     text NOT NULL,
    virada_em                timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._reversao_virada_alcada_20271026 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public._reversao_virada_alcada_20271026 IS
    'Reversão da virada "todo título a pagar passa pela aprovação" (26/10/2026). NÃO APAGAR.';

INSERT INTO public._reversao_virada_alcada_20271026
    (id, approval_status, approval_chain, approval_required_levels, business_status, acao)
SELECT t.id, t.approval_status, t.approval_chain, t.approval_required_levels, t.business_status,
       CASE WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE THEN 'LIBERADO' ELSE 'PENDENTE' END
  FROM public.internal_transactions t
 WHERE t.direction = 'DEBIT'
   AND t.status = 'PENDING'
   AND COALESCE(t.approval_status, 'RASCUNHO') = 'RASCUNHO'
   AND COALESCE(t.business_status, '') NOT IN ('RETIDO', 'CANCELADO', 'PAGO')
   AND COALESCE(t.source_system, '') NOT IN ('ASAAS_FEE', 'DARF')
   AND COALESCE(t.entry_type, 'PRINCIPAL') <> 'CONTRA'
ON CONFLICT (id) DO NOTHING;

UPDATE public.internal_transactions t
   SET approval_status = 'APROVADO',
       approval_chain = COALESCE(t.approval_chain, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'level', 1,
           'role', 'Liberação automática na virada (26/10/2026)',
           'action', 'APROVADO',
           'approved_by', 'sistema',
           'approved_at', to_jsonb(now()),
           'notes', 'Título vencido em aberto quando a aprovação passou a valer para todo título a pagar.'))
  FROM public._reversao_virada_alcada_20271026 r
 WHERE r.id = t.id AND r.acao = 'LIBERADO'
   AND COALESCE(t.approval_status, 'RASCUNHO') = 'RASCUNHO';

UPDATE public.internal_transactions t
   SET approval_status = 'PENDENTE',
       approval_chain = '[]'::jsonb,
       approval_required_levels = COALESCE(
           (SELECT lv.required_levels FROM public.fn_resolve_approval_levels(t.organization_id, t.amount) lv), 1)
  FROM public._reversao_virada_alcada_20271026 r
 WHERE r.id = t.id AND r.acao = 'PENDENTE'
   AND COALESCE(t.approval_status, 'RASCUNHO') = 'RASCUNHO';

COMMIT;
