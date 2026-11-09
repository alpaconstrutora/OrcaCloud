-- Centro de custo: conta bancária vinculada + grupo não recebe lançamento
-- (pedido de 09/11/2026, Minha Organização › Centro de Custo).
-- Plano: docs/planos/2026-11-09-centro-de-custo-conta-e-trava-de-grupo.md
--
-- Grupo = `cost_centers_v2.parent_id IS NULL`. A trava vale para lançamento NOVO
-- ou quando o `cost_center_id` MUDA; lançamento antigo em grupo fica como está e
-- continua editável (o UPDATE que não mexe no centro de custo passa).
--
-- Antes de travar, os grupos SEM filho que recebiam lançamento viram centro de
-- custo dentro de um grupo (decisão do usuário em 09/11/2026). Só muda o
-- `parent_id` deles; nenhum lançamento é tocado. "Condomínios" da Alpa (006,
-- 6 lançamentos antigos) fica grupo: é o que
-- `condominioRateioService.garantirGrupoCondominios` procura.
--
-- `sindico_portal_financeiro` reescrita a partir do arquivo
-- aplicar_20271024920000 (corpo idêntico ao do banco em 09/11/2026, conferido
-- pelo prosrc). UMA troca: cada centro leva `paymentAccountId`.
-- REGRA #7: ACL reafirmada após cada função.

BEGIN;

-- ── 1. Conta bancária (opcional) do centro de custo ─────────────────────────
ALTER TABLE public.cost_centers_v2
    ADD COLUMN IF NOT EXISTS payment_account_id uuid
        REFERENCES public.payment_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cost_centers_v2_payment_account
    ON public.cost_centers_v2(payment_account_id) WHERE payment_account_id IS NOT NULL;

COMMENT ON COLUMN public.cost_centers_v2.payment_account_id IS
    'Conta que o lançamento neste centro de custo recebe por padrão (a tela preenche; o usuário pode trocar).';

-- ── 2. Grupos sem filho com lançamento viram centro de custo ────────────────
CREATE TABLE IF NOT EXISTS public.bkp_cc_grupos_conversao_20261109 AS
    SELECT cc.*, now() AS bkp_em
      FROM public.cost_centers_v2 cc
     WHERE cc.id IN ('d647e2c8-2f69-46f4-8d03-b5f82239d0d9',  -- 010 - Galeria Altavista
                     '2bbeabd2-e548-4962-a024-fdaaaae26eed',  -- 007 - Bella Vista
                     '65345111-f9eb-4775-9179-a900ce100eba',  -- Movimentação (Alpa)
                     '4b115c59-d4a9-4c03-bc42-15edeeab4655'); -- Movimentação (Altair)
ALTER TABLE public.bkp_cc_grupos_conversao_20261109 ENABLE ROW LEVEL SECURITY;

-- Condomínios: dentro do grupo "Condomínios" da própria organização.
UPDATE public.cost_centers_v2 SET parent_id = '47792148-10d6-48ba-a783-a042a7729cec'
 WHERE id = 'd647e2c8-2f69-46f4-8d03-b5f82239d0d9' AND parent_id IS NULL;
UPDATE public.cost_centers_v2 SET parent_id = '465c2744-3f3f-4c0d-aa97-b65d2453edc6'
 WHERE id = '2bbeabd2-e548-4962-a024-fdaaaae26eed' AND parent_id IS NULL;

-- Movimentação: dentro de um grupo "Financeiro" novo em cada organização.
DO $$
DECLARE
    r record;
    v_grupo uuid;
BEGIN
    FOR r IN
        SELECT id, organization_id FROM public.cost_centers_v2
         WHERE id IN ('65345111-f9eb-4775-9179-a900ce100eba', '4b115c59-d4a9-4c03-bc42-15edeeab4655')
           AND parent_id IS NULL
    LOOP
        SELECT id INTO v_grupo FROM public.cost_centers_v2
         WHERE organization_id = r.organization_id AND parent_id IS NULL AND name = 'Financeiro'
         LIMIT 1;
        IF v_grupo IS NULL THEN
            INSERT INTO public.cost_centers_v2 (organization_id, code, name, description)
            VALUES (r.organization_id, public.get_next_cost_center_v2_code(r.organization_id), 'Financeiro',
                    'Grupo criado em 09/11/2026 para receber "Movimentação" — grupo não recebe lançamento.')
            RETURNING id INTO v_grupo;
        END IF;
        UPDATE public.cost_centers_v2 SET parent_id = v_grupo WHERE id = r.id;
    END LOOP;
END $$;

-- Memória de classificação do extrato que sugeria um grupo: a sugestão viraria
-- erro ao ser aplicada. Fica sem centro de custo (categoria/contraparte ficam).
CREATE TABLE IF NOT EXISTS public.bkp_cc_memoria_grupo_20261109 AS
    SELECT m.*, now() AS bkp_em
      FROM public.reconciliation_classification_memory m
      JOIN public.cost_centers_v2 cc ON cc.id = m.cost_center_id
     WHERE cc.parent_id IS NULL;
ALTER TABLE public.bkp_cc_memoria_grupo_20261109 ENABLE ROW LEVEL SECURITY;
UPDATE public.reconciliation_classification_memory m SET cost_center_id = NULL
  FROM public.cost_centers_v2 cc
 WHERE cc.id = m.cost_center_id AND cc.parent_id IS NULL;

-- ── 3. Trava: grupo não recebe lançamento ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cc_bloquear_lancamento_em_grupo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_nome text;
BEGIN
    IF NEW.cost_center_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.cost_center_id IS NOT DISTINCT FROM OLD.cost_center_id THEN
        RETURN NEW;  -- lançamento antigo em grupo continua editável
    END IF;
    SELECT name INTO v_nome FROM public.cost_centers_v2
     WHERE id = NEW.cost_center_id AND parent_id IS NULL;
    IF FOUND THEN
        RAISE EXCEPTION 'Centro de custo "%" é um grupo — escolha um centro de custo dentro dele.', v_nome
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cc_bloquear_lancamento_em_grupo() FROM PUBLIC, anon;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'invoices', 'internal_transactions', 'bank_transactions', 'boletos', 'contracts',
        'commercial_deals', 'purchase_orders', 'purchase_requests', 'payroll_runs',
        'employee_cost_splits', 'employees', 'warranty_claims', 'opura_asset_maintenances'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_cc_bloquear_lancamento_em_grupo ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_cc_bloquear_lancamento_em_grupo BEFORE INSERT OR UPDATE OF cost_center_id ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION public.fn_cc_bloquear_lancamento_em_grupo()', t);
    END LOOP;
END $$;

-- ── 4. Portal do Síndico: o centro leva a conta vinculada ───────────────────
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
                SELECT jsonb_agg(jsonb_build_object('id', cc.id, 'code', cc.code, 'name', cc.name, 'parentId', cc.parent_id,
                                                    'paymentAccountId', cc.payment_account_id) ORDER BY cc.code)
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

COMMIT;
