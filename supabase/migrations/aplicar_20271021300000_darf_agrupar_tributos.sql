-- ==========================================================================
-- aplicar_20271021300000_darf_agrupar_tributos.sql
-- Agrupar tributos em um DARF — banco (tabela, vínculo, travas, views, RPCs)
-- Plano: docs/planos/2026-10-21-agrupar-tributos-em-darf.md
-- ==========================================================================
-- O DARF NÃO é um título novo com o valor da soma: vw_payables, DRE, fluxo de
-- caixa, calendário e KPIs somam todo DEBIT não cancelado, e os tributos já
-- estão lá. Ele AGRUPA os tributos existentes (`internal_transactions.darf_id`),
-- que continuam sendo o razão contábil. Multa e juros são despesa nova real:
-- viram linhas DEBIT próprias (`source_system = 'DARF'`) dentro do DARF.
--
-- Contas a Pagar recolhe os membros numa linha só, no cliente; quem paga é
-- `fn_darf_dar_baixa`, que baixa todos os membros na mesma transação.
--
-- Travas:
--   (a) `darfs` só muda pelas RPCs (permissão local `darf.rpc`, que o cliente
--       não liga: `set_config` está em pg_catalog, fora do PostgREST — mesmo
--       mecanismo de `docgen.emitindo`, aplicar_20271008000200).
--   (b) membro de DARF não muda valor/datas/org, não é cancelado nem apagado
--       fora das RPCs (inclusive pela regeração de tributos de bundle antigo).
--   (c) no COMMIT, os membros de um DARF estão todos pagos ou todos em aberto:
--       baixa/conciliação de um tributo sozinho é recusada.
--
-- RPCs SECURITY INVOKER: a RLS de `internal_transactions`/`darfs`
-- (`is_org_member`) autoriza, e `fn_block_period_internal_tx` continua valendo
-- (ela libera quem não é `authenticated` — uma DEFINER furaria a trava de
-- período para multa/juros).
--
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>
--    NUNCA `supabase db push` (CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- --------------------------------------------------------------------------
-- 1. Cabeçalho do DARF — sem dinheiro nem status (derivados dos membros)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.darfs (
    -- Gerado no cliente: o anexo sobe antes, em `{org}/darf/{id}/…`.
    id               uuid PRIMARY KEY,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    competencia      date NOT NULL CHECK (EXTRACT(DAY FROM competencia) = 1),
    due_date         date NOT NULL,
    codigo_barras    text CHECK (codigo_barras IS NULL OR codigo_barras ~ '^[0-9]{44}$' OR codigo_barras ~ '^[0-9]{48}$'),
    numero_documento text,
    observacao       text,
    documento_path   text,
    documento_nome   text,
    created_by       uuid DEFAULT auth.uid(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.darfs IS
    'Guia DARF que agrupa tributos (internal_transactions.darf_id). Total e status vêm dos membros (vw_darfs). Só muda pelas RPCs fn_darf_*.';

CREATE INDEX IF NOT EXISTS ix_darfs_org ON public.darfs (organization_id, competencia);

ALTER TABLE public.darfs ENABLE ROW LEVEL SECURITY;

-- Uma condição só, sem OR (Regra #7, pergunta 1).
DROP POLICY IF EXISTS darfs_membro_da_org ON public.darfs;
CREATE POLICY darfs_membro_da_org ON public.darfs
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- REVOKE de authenticated também: os privilégios padrão do Supabase dão ALL
-- (inclusive TRUNCATE/TRIGGER/REFERENCES) a tabela nova; fica só o que a RLS cobre.
REVOKE ALL ON public.darfs FROM PUBLIC;
REVOKE ALL ON public.darfs FROM anon;
REVOKE ALL ON public.darfs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.darfs TO authenticated;

-- --------------------------------------------------------------------------
-- 2. Vínculo dos membros
-- --------------------------------------------------------------------------
ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS darf_id uuid REFERENCES public.darfs(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS due_date_antes_darf date;

COMMENT ON COLUMN public.internal_transactions.darf_id IS
    'DARF que agrupa este lançamento (tributo, ou multa/juros do próprio DARF). Pago junto com os demais membros.';
COMMENT ON COLUMN public.internal_transactions.due_date_antes_darf IS
    'Vencimento do tributo antes de entrar no DARF (o due_date passa a ser o do DARF); volta ao desagrupar.';

CREATE INDEX IF NOT EXISTS ix_internal_tx_darf
    ON public.internal_transactions (darf_id) WHERE darf_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 3. Trava (a): `darfs` só muda pelas RPCs
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_darf_so_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(current_setting('darf.rpc', true), '') <> 'on' THEN
        RAISE EXCEPTION 'O DARF só é criado, alterado ou desfeito em Financeiro › Tributos a Pagar › DARFs.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_so_por_rpc() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_darf_so_por_rpc ON public.darfs;
CREATE TRIGGER trg_darf_so_por_rpc
    BEFORE INSERT OR UPDATE OR DELETE ON public.darfs
    FOR EACH ROW EXECUTE FUNCTION public.fn_darf_so_por_rpc();

-- --------------------------------------------------------------------------
-- 4. Trava (b): membro de DARF não é alterado/apagado fora das RPCs
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_darf_membro_trava()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_darf_id uuid := COALESCE(OLD.darf_id, NEW.darf_id);
    v_venc    date;
    v_msg     text;
BEGIN
    IF COALESCE(current_setting('darf.rpc', true), '') = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.darf_id IS NOT DISTINCT FROM OLD.darf_id
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.direction IS NOT DISTINCT FROM OLD.direction
       AND NEW.transaction_date IS NOT DISTINCT FROM OLD.transaction_date
       AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
       AND NOT (NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED')
       AND NOT (NEW.business_status = 'CANCELADO' AND OLD.business_status IS DISTINCT FROM 'CANCELADO')
    THEN
        -- Baixa/estorno/conciliação (status, payment_*), reclassificação (CC,
        -- plano de contas, categoria, descrição) seguem livres. A coerência
        -- "pago junto" é conferida no commit (trava c).
        RETURN NEW;
    END IF;

    SELECT due_date INTO v_venc FROM public.darfs WHERE id = v_darf_id;
    v_msg := format(
        'Lançamento agrupado no DARF de venc. %s — desagrupe em Financeiro › Tributos a Pagar › DARFs antes de alterar, cancelar ou excluir.',
        COALESCE(to_char(v_venc, 'DD/MM/YYYY'), '?'));
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_membro_trava() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_darf_membro_trava_ins ON public.internal_transactions;
CREATE TRIGGER trg_darf_membro_trava_ins
    BEFORE INSERT ON public.internal_transactions
    FOR EACH ROW WHEN (NEW.darf_id IS NOT NULL)
    EXECUTE FUNCTION public.fn_darf_membro_trava();

DROP TRIGGER IF EXISTS trg_darf_membro_trava_upd ON public.internal_transactions;
CREATE TRIGGER trg_darf_membro_trava_upd
    BEFORE UPDATE ON public.internal_transactions
    FOR EACH ROW WHEN (OLD.darf_id IS NOT NULL OR NEW.darf_id IS NOT NULL)
    EXECUTE FUNCTION public.fn_darf_membro_trava();

DROP TRIGGER IF EXISTS trg_darf_membro_trava_del ON public.internal_transactions;
CREATE TRIGGER trg_darf_membro_trava_del
    BEFORE DELETE ON public.internal_transactions
    FOR EACH ROW WHEN (OLD.darf_id IS NOT NULL)
    EXECUTE FUNCTION public.fn_darf_membro_trava();

-- --------------------------------------------------------------------------
-- 5. Trava (c): no commit, os membros estão todos pagos ou todos em aberto
-- --------------------------------------------------------------------------
-- "Pago" = a régua de `tributoJaPago` (services/taxPayableService.ts):
-- conciliado OU baixado como PAGO. Deferida: dentro de fn_darf_dar_baixa ou de
-- fn_reconcile_group com o grupo inteiro, os membros mudam um a um e só ficam
-- coerentes no fim.
CREATE OR REPLACE FUNCTION public.fn_darf_pago_junto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total int;
    v_pagos int;
    v_venc  date;
BEGIN
    SELECT count(*),
           count(*) FILTER (WHERE it.status = 'CONCILIATED' OR it.business_status = 'PAGO')
      INTO v_total, v_pagos
      FROM public.internal_transactions it
     WHERE it.darf_id = NEW.darf_id;

    IF v_pagos > 0 AND v_pagos < v_total THEN
        SELECT due_date INTO v_venc FROM public.darfs WHERE id = NEW.darf_id;
        RAISE EXCEPTION '%', format(
            'O DARF de venc. %s é pago junto (%s lançamentos): dê baixa, concilie ou estorne o DARF inteiro — não um tributo sozinho.',
            COALESCE(to_char(v_venc, 'DD/MM/YYYY'), '?'), v_total)
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_pago_junto() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_darf_pago_junto ON public.internal_transactions;
CREATE CONSTRAINT TRIGGER trg_darf_pago_junto
    AFTER INSERT OR UPDATE OF status, business_status ON public.internal_transactions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW WHEN (NEW.darf_id IS NOT NULL)
    EXECUTE FUNCTION public.fn_darf_pago_junto();

-- --------------------------------------------------------------------------
-- 6. Views — a partir da definição VIVA (pg_get_viewdef em 21/10/2026),
--    colunas novas só no fim (CREATE OR REPLACE não reordena colunas).
-- --------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_payables
WITH (security_invoker = on) AS
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
            WHEN it.status = 'CONCILIATED'::text AND (COALESCE(it.business_status, 'PREVISTO'::text) <> ALL (ARRAY['PARCIAL'::text, 'RENEGOCIADO'::text])) THEN 'PAGO'::text
            WHEN (COALESCE(it.business_status, 'PREVISTO'::text) = ANY (ARRAY['PREVISTO'::text, 'EMITIDO'::text, 'ENVIADO'::text, 'APROVADO'::text])) AND it.due_date IS NOT NULL AND it.due_date < CURRENT_DATE THEN 'VENCIDO'::text
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
    -- ── NOVO (só aqui, no fim) ─────────────────────────────────────────────
    it.darf_id
   FROM internal_transactions it
     LEFT JOIN projects p ON p.id = it.project_id
     LEFT JOIN commercial_properties cp ON cp.id = it.property_id
     LEFT JOIN vw_project_obra o ON o.project_id = it.project_id
  WHERE it.direction = 'DEBIT'::text AND it.status <> 'CANCELLED'::text AND it.entry_type IS DISTINCT FROM 'CONTRA'::text;

REVOKE ALL ON public.vw_payables FROM PUBLIC;
REVOKE ALL ON public.vw_payables FROM anon;
GRANT SELECT ON public.vw_payables TO authenticated;

CREATE OR REPLACE VIEW public.vw_commercial_tax_payables
WITH (security_invoker = on) AS
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
    it.project_id,
    it.cost_center_id,
    it.created_at,
    it.updated_at,
        CASE
            WHEN COALESCE(it.business_status, 'PREVISTO'::text) = 'PREVISTO'::text AND it.due_date IS NOT NULL AND it.due_date < CURRENT_DATE THEN 'VENCIDO'::text
            ELSE COALESCE(it.business_status, 'PREVISTO'::text)
        END AS effective_status,
    p.name AS project_name,
    -- ── NOVO (só aqui, no fim) ─────────────────────────────────────────────
    it.darf_id,
    it.due_date_antes_darf
   FROM internal_transactions it
     LEFT JOIN projects p ON p.id = it.project_id
  WHERE it.direction = 'DEBIT'::text AND it.party_type = 'TAX'::text AND it.status <> 'CANCELLED'::text;

REVOKE ALL ON public.vw_commercial_tax_payables FROM PUBLIC;
REVOKE ALL ON public.vw_commercial_tax_payables FROM anon;
GRANT SELECT ON public.vw_commercial_tax_payables TO authenticated;

-- Um DARF por linha, com os totais e o status derivados dos membros.
CREATE OR REPLACE VIEW public.vw_darfs
WITH (security_invoker = on) AS
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
    COALESCE(a.principal, 0)  AS principal,
    COALESCE(a.multa, 0)      AS multa,
    COALESCE(a.juros, 0)      AS juros,
    COALESCE(a.total, 0)      AS total,
    COALESCE(a.qtd_tributos, 0) AS qtd_tributos,
    a.tributos_nomes,
    COALESCE(a.n_membros, 0)  AS n_membros,
    COALESCE(a.n_pagos, 0)    AS n_pagos,
    a.payment_date,
    a.payment_type,
    COALESCE(a.conciliado_no_extrato, false) AS conciliado_no_extrato,
    COALESCE(a.alcada_pendente, false)       AS alcada_pendente,
    COALESCE(a.asaas_em_curso, false)        AS asaas_em_curso,
    CASE
        WHEN COALESCE(a.n_membros, 0) > 0 AND a.n_pagos = a.n_membros THEN 'PAGO'
        WHEN COALESCE(a.n_pagos, 0) > 0 THEN 'PARCIAL'
        WHEN d.due_date < CURRENT_DATE THEN 'VENCIDO'
        ELSE 'PREVISTO'
    END AS status_efetivo
  FROM public.darfs d
  LEFT JOIN LATERAL (
        SELECT sum(it.amount) FILTER (WHERE it.party_type = 'TAX')                          AS principal,
               sum(it.amount) FILTER (WHERE it.reference_id = 'darf-' || d.id || '-multa')   AS multa,
               sum(it.amount) FILTER (WHERE it.reference_id = 'darf-' || d.id || '-juros')   AS juros,
               sum(it.amount)                                                               AS total,
               count(*) FILTER (WHERE it.party_type = 'TAX')                                AS qtd_tributos,
               string_agg(DISTINCT it.party_name, ', ' ORDER BY it.party_name) FILTER (WHERE it.party_type = 'TAX') AS tributos_nomes,
               count(*)                                                                     AS n_membros,
               count(*) FILTER (WHERE it.status = 'CONCILIATED' OR it.business_status = 'PAGO') AS n_pagos,
               max(it.payment_date)                                                         AS payment_date,
               max(it.payment_type)                                                         AS payment_type,
               bool_or(EXISTS (SELECT 1 FROM public.reconciliation_matches m
                                WHERE m.internal_transaction_id = it.id))                   AS conciliado_no_extrato,
               bool_or(it.approval_status = 'PENDENTE')                                     AS alcada_pendente,
               bool_or(EXISTS (SELECT 1 FROM public.supplier_payments sp
                                WHERE sp.transaction_id = it.id
                                  AND sp.status IN ('APPROVED', 'PENDING', 'SCHEDULED')))   AS asaas_em_curso
          FROM public.internal_transactions it
         WHERE it.darf_id = d.id
  ) a ON true;

REVOKE ALL ON public.vw_darfs FROM PUBLIC;
REVOKE ALL ON public.vw_darfs FROM anon;
REVOKE ALL ON public.vw_darfs FROM authenticated;
GRANT SELECT ON public.vw_darfs TO authenticated;

-- --------------------------------------------------------------------------
-- 7. RPCs (SECURITY INVOKER) — Regra #7: REVOKE de PUBLIC/anon + GRANT
-- --------------------------------------------------------------------------

-- Grava (ou apaga, se zero) as linhas de multa e juros do DARF. Interna às
-- RPCs: chamada direta falha na trava (b), que exige `darf.rpc`.
CREATE OR REPLACE FUNCTION public.fn_darf_gravar_encargos(
    p_darf_id uuid,
    p_org uuid,
    p_competencia date,
    p_due_date date,
    p_multa numeric,
    p_juros numeric,
    p_categoria_encargos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tipo  text;
    v_valor numeric;
    v_ref   text;
    v_rotulo text;
BEGIN
    FOREACH v_tipo IN ARRAY ARRAY['multa', 'juros'] LOOP
        v_valor := CASE v_tipo WHEN 'multa' THEN COALESCE(p_multa, 0) ELSE COALESCE(p_juros, 0) END;
        v_ref := 'darf-' || p_darf_id || '-' || v_tipo;
        v_rotulo := CASE v_tipo WHEN 'multa' THEN 'Multa' ELSE 'Juros' END;
        IF v_valor > 0 THEN
            INSERT INTO public.internal_transactions (
                organization_id, source_system, reference_id, entry_type, direction,
                amount, description, category, category_id,
                party_type, party_name, entity_name,
                transaction_date, competencia_date, due_date,
                status, business_status, darf_id
            ) VALUES (
                p_org, 'DARF', v_ref, 'PRINCIPAL', 'DEBIT',
                v_valor, format('%s — DARF %s', v_rotulo, to_char(p_competencia, 'MM/YYYY')),
                NULLIF(p_categoria_encargos ->> 'category', ''),
                NULLIF(p_categoria_encargos ->> 'category_id', '')::uuid,
                'GOVERNMENT', 'Receita Federal', 'Receita Federal',
                p_due_date, p_due_date, p_due_date,
                'PENDING', 'PREVISTO', p_darf_id
            )
            ON CONFLICT (organization_id, reference_id, entry_type) DO UPDATE
               SET amount = EXCLUDED.amount,
                   transaction_date = EXCLUDED.transaction_date,
                   competencia_date = EXCLUDED.competencia_date,
                   due_date = EXCLUDED.due_date,
                   category = COALESCE(EXCLUDED.category, internal_transactions.category),
                   category_id = COALESCE(EXCLUDED.category_id, internal_transactions.category_id),
                   updated_at = now();
        ELSE
            DELETE FROM public.internal_transactions
             WHERE organization_id = p_org AND reference_id = v_ref AND darf_id = p_darf_id;
        END IF;
    END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_gravar_encargos(uuid, uuid, date, date, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_darf_gravar_encargos(uuid, uuid, date, date, numeric, numeric, jsonb) TO authenticated;

-- 7.1 Criar o DARF a partir dos tributos escolhidos -------------------------
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
    IF cardinality(v_ids) = 0 THEN
        RAISE EXCEPTION 'Selecione ao menos um tributo.' USING ERRCODE = 'P0001';
    END IF;
    IF cardinality(v_ids) < 2 AND v_multa + v_juros = 0 THEN
        RAISE EXCEPTION 'Um DARF junta ao menos 2 tributos — ou 1 tributo com multa/juros.' USING ERRCODE = 'P0001';
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

    UPDATE public.internal_transactions
       SET darf_id = p_darf_id,
           due_date_antes_darf = due_date,
           due_date = p_due_date,
           updated_at = now()
     WHERE id = ANY(v_ids);

    PERFORM public.fn_darf_gravar_encargos(p_darf_id, v_org, v_comp, p_due_date, v_multa, v_juros, p_categoria_encargos);

    PERFORM set_config('darf.rpc', 'off', true);
    RETURN p_darf_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_criar(uuid, uuid[], date, numeric, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_darf_criar(uuid, uuid[], date, numeric, numeric, jsonb, jsonb) TO authenticated;

-- Situação de pagamento dos membros (usada pelas RPCs abaixo).
CREATE OR REPLACE FUNCTION public.fn_darf_situacao(p_darf_id uuid)
RETURNS TABLE (n_membros int, n_tributos int, n_pagos int, conciliado boolean, alcada_pendente boolean, asaas_em_curso boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT count(*)::int,
           count(*) FILTER (WHERE it.party_type = 'TAX')::int,
           count(*) FILTER (WHERE it.status = 'CONCILIATED' OR it.business_status = 'PAGO')::int,
           COALESCE(bool_or(EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)), false),
           COALESCE(bool_or(it.approval_status = 'PENDENTE'), false),
           COALESCE(bool_or(EXISTS (SELECT 1 FROM public.supplier_payments sp
                                     WHERE sp.transaction_id = it.id AND sp.status IN ('APPROVED', 'PENDING', 'SCHEDULED'))), false)
      FROM public.internal_transactions it
     WHERE it.darf_id = p_darf_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_situacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_darf_situacao(uuid) TO authenticated;

-- 7.2 Editar ----------------------------------------------------------------
-- Pago: só código de barras, número, observação e anexo (anexar a guia paga
-- depois é o caso comum). Em aberto: tudo, propagando o vencimento.
CREATE OR REPLACE FUNCTION public.fn_darf_editar(
    p_darf_id uuid,
    p_due_date date,
    p_multa numeric,
    p_juros numeric,
    p_dados jsonb,
    p_categoria_encargos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    d       public.darfs%ROWTYPE;
    s       record;
    v_multa numeric := COALESCE(p_multa, 0);
    v_juros numeric := COALESCE(p_juros, 0);
    v_multa_atual numeric;
    v_juros_atual numeric;
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
           COALESCE(sum(amount) FILTER (WHERE reference_id = 'darf-' || p_darf_id || '-juros'), 0)
      INTO v_multa_atual, v_juros_atual
      FROM public.internal_transactions WHERE darf_id = p_darf_id;

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
    END IF;

    PERFORM set_config('darf.rpc', 'off', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_editar(uuid, date, numeric, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_darf_editar(uuid, date, numeric, numeric, jsonb, jsonb) TO authenticated;

-- 7.3 Desagrupar (desfaz o DARF) -------------------------------------------
-- Devolve o caminho do anexo: o cliente apaga o arquivo do bucket.
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
GRANT EXECUTE ON FUNCTION public.fn_darf_desagrupar(uuid) TO authenticated;

-- 7.4 Dar baixa no DARF inteiro (mesmo efeito de payableService.darBaixa) ---
CREATE OR REPLACE FUNCTION public.fn_darf_dar_baixa(
    p_darf_id uuid,
    p_payment_date date,
    p_payment_type text
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_dar_baixa(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_darf_dar_baixa(uuid, date, text) TO authenticated;

-- 7.5 Estornar a baixa do DARF inteiro --------------------------------------
CREATE OR REPLACE FUNCTION public.fn_darf_estornar(p_darf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    s record;
BEGIN
    PERFORM 1 FROM public.darfs WHERE id = p_darf_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DARF não encontrado ou sem acesso.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM public.internal_transactions WHERE darf_id = p_darf_id ORDER BY id FOR UPDATE;
    SELECT * INTO s FROM public.fn_darf_situacao(p_darf_id);

    IF s.conciliado THEN
        RAISE EXCEPTION 'DARF conciliado com o extrato — desfaça a conciliação em Conciliação Bancária.' USING ERRCODE = 'P0001';
    END IF;
    IF s.n_pagos = 0 THEN
        RAISE EXCEPTION 'Este DARF não está pago.' USING ERRCODE = 'P0001';
    END IF;

    -- Espelho de payableService.updateStatus('PREVISTO'): desfaz a baixa
    -- também em `status` e `payment_date`.
    UPDATE public.internal_transactions
       SET business_status = 'PREVISTO',
           status = 'PENDING',
           payment_date = NULL,
           updated_at = now()
     WHERE darf_id = p_darf_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_darf_estornar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_darf_estornar(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- VERIFICAÇÃO (rodar depois de aplicar)
-- ==========================================================================
-- 1. Colunas novas nas views:
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_name IN ('vw_payables','vw_commercial_tax_payables','vw_darfs')
--    AND column_name IN ('darf_id','due_date_antes_darf','status_efetivo');
-- 2. security_invoker preservado:
-- SELECT relname, reloptions FROM pg_class WHERE relname IN ('vw_payables','vw_commercial_tax_payables','vw_darfs');
-- 3. ACL das funções sem PUBLIC (=X/) e sem anon:
-- SELECT proname, proacl FROM pg_proc WHERE proname LIKE 'fn_darf_%';
-- 4. Gatilhos:
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_darf_%';
-- 5. Nada mudou para quem não tem DARF (contagem igual à de antes):
-- SELECT count(*) FROM public.vw_payables;
-- ==========================================================================
-- FIM: aplicar_20271021300000_darf_agrupar_tributos.sql
-- ==========================================================================
