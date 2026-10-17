-- =====================================================================
-- Comissão do corretor: título a pagar no financeiro + leitura derivada
-- no Portal do Corretor › Comissões.
--
-- Plano: docs/planos/2026-10-17-comissao-corretor-portal.md
--
-- Por que existe (17/10/2026): a aba "Partes e Comissões" da negociação
-- grava a comissão só em commercial_deals.broker_*; o portal lia
-- broker_portal_commissions, que era alimentada por uma ponte no front
-- (commercialFinanceService.syncBrokerCommissionToPortal) que NUNCA foi
-- chamada. 0 linhas no banco; todo corretor via a aba zerada.
--
-- Desenho:
--   · o título nasce AQUI, por gatilho — não existe caminho de gravação
--     do negócio que possa esquecer de chamar;
--   · o portal não lê cópia: deriva do negócio + do título.
--
-- ⚠️ Aplicar com `npx supabase db query --linked -f`, nunca `db push`.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Sincroniza o título a pagar da comissão de UM negócio.
--    reference_id = 'brk-{deal_id}', source_system = 'COMMERCIAL'.
--    Devolve o que fez: criado | atualizado | cancelado | pago_intocado | nada
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_comissao_corretor_sincronizar(p_deal_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Estágios em que o negócio está fechado em contrato e a comissão vira
    -- obrigação. Antes disso (proposta/reserva) o portal mostra a comissão
    -- como prevista, sem título — mesma razão de o saveDeal não gerar
    -- cobrança em proposta.
    c_estagios  CONSTANT text[] := ARRAY['CONTRATO', 'ASSINATURA', 'COMPLETED'];
    c_categorias CONSTANT text[] := ARRAY['Comissão de Corretagem', 'Comissões de Venda'];

    v_ref       text := 'brk-' || p_deal_id::text;
    v_deal      public.commercial_deals;
    v_tem_deal  boolean;
    v_tit       public.internal_transactions;
    v_tem_tit   boolean;
    v_email     text;
    v_nome      text;
    v_sup       uuid;
    v_cat_id    uuid;
    v_cat       text;
    v_contrato  uuid;
    v_numero    text;
    v_venc      date;
    v_desc      text;
    v_valor     numeric;
    v_reabre    boolean;
BEGIN
    SELECT * INTO v_tit
      FROM public.internal_transactions
     WHERE reference_id = v_ref AND entry_type = 'PRINCIPAL'
     ORDER BY created_at
     LIMIT 1;
    v_tem_tit := FOUND;

    SELECT * INTO v_deal FROM public.commercial_deals WHERE id = p_deal_id;
    v_tem_deal := FOUND;

    -- Título pago nunca é regravado (ver "10 origens regravam amount de
    -- título PAGO"): o que foi pago é fato do financeiro, não do negócio.
    IF v_tem_tit AND v_tit.status = 'CONCILIATED' THEN
        RETURN 'pago_intocado';
    END IF;

    -- Negócio que não deve ter título: apagado, fora dos estágios, sem
    -- corretor ou com comissão zerada. Título em aberto é CANCELADO, não
    -- apagado (conciliação tem FK com CASCADE; cancelar é reversível).
    IF NOT v_tem_deal
       OR NOT (v_deal.status = ANY (c_estagios))
       OR v_deal.broker_id IS NULL
       OR COALESCE(v_deal.broker_commission_value, 0) <= 0
    THEN
        IF v_tem_tit AND v_tit.status <> 'CANCELLED' THEN
            UPDATE public.internal_transactions
               SET status = 'CANCELLED', business_status = 'CANCELADO', updated_at = now()
             WHERE id = v_tit.id;
            RETURN 'cancelado';
        END IF;
        RETURN 'nada';
    END IF;

    v_valor := round(v_deal.broker_commission_value, 2);

    SELECT lower(trim(bp.email)), bp.name
      INTO v_email, v_nome
      FROM public.broker_profiles bp
     WHERE bp.id = v_deal.broker_id;
    v_nome := COALESCE(NULLIF(trim(v_nome), ''), NULLIF(trim(v_deal.broker_name), ''), 'Corretor');

    -- Fornecedor = o cadastro do corretor como fornecedor NA ORG DO NEGÓCIO,
    -- pelo e-mail (é por e-mail que broker_profiles nasce de suppliers).
    IF v_email IS NOT NULL AND v_email <> '' THEN
        SELECT s.id INTO v_sup
          FROM public.suppliers s
         WHERE s.organization_id = v_deal.organization_id
           AND lower(trim(s.email)) = v_email
         ORDER BY s.created_at
         LIMIT 1;
    END IF;

    -- Categoria: mesma regra do financialCategoryResolver (nome na ordem
    -- dada, a da organização antes da global).
    SELECT fc.id, fc.name INTO v_cat_id, v_cat
      FROM public.financial_categories fc
     WHERE fc.name = ANY (c_categorias)
       AND (fc.organization_id = v_deal.organization_id OR fc.organization_id IS NULL)
     ORDER BY array_position(c_categorias, fc.name), (fc.organization_id IS NULL)
     LIMIT 1;
    v_cat := COALESCE(v_cat, c_categorias[1]);

    -- Número do contrato: o mesmo da descrição dos tributos
    -- (contracts.number → contract_number → code → Deal #xxxxxxxx).
    SELECT c.id, c.number INTO v_contrato, v_numero
      FROM public.contracts c
     WHERE c.deal_id = p_deal_id
     ORDER BY c.created_at
     LIMIT 1;
    v_numero := COALESCE(NULLIF(trim(v_numero), ''),
                         NULLIF(trim(v_deal.contract_number), ''),
                         NULLIF(trim(v_deal.code), ''),
                         'Deal #' || left(p_deal_id::text, 8));
    v_desc := v_numero || ' - Comissão de corretagem - ' || v_nome;

    -- Vencimento: o informado no negócio; senão o que o título já tem
    -- (pode ter sido ajustado no Contas a Pagar); senão hoje.
    v_venc := COALESCE(v_deal.broker_payment_due_date,
                       CASE WHEN v_tem_tit THEN v_tit.due_date END,
                       current_date);

    BEGIN
        IF NOT v_tem_tit THEN
            INSERT INTO public.internal_transactions (
                organization_id, source_system, reference_id, entry_type,
                transaction_date, due_date, amount, direction, description,
                category, category_id, status, business_status,
                party_name, party_type, party_email, entity_name, supplier_id,
                cost_center_id, property_id, contract_id
            ) VALUES (
                v_deal.organization_id, 'COMMERCIAL', v_ref, 'PRINCIPAL',
                v_venc, v_venc, v_valor, 'DEBIT', v_desc,
                v_cat, v_cat_id, 'PENDING', 'PREVISTO',
                v_nome, 'SUPPLIER', v_email, v_nome, v_sup,
                v_deal.cost_center_id, v_deal.property_id, v_contrato
            );
            RETURN 'criado';
        END IF;

        -- Já existe (em aberto ou cancelado): só grava o que mudou.
        IF v_tit.status IS NOT DISTINCT FROM 'PENDING'
           AND v_tit.organization_id = v_deal.organization_id
           AND v_tit.amount = v_valor
           AND v_tit.due_date IS NOT DISTINCT FROM v_venc
           AND v_tit.description IS NOT DISTINCT FROM v_desc
           AND v_tit.party_name IS NOT DISTINCT FROM v_nome
           AND v_tit.party_email IS NOT DISTINCT FROM v_email
           AND (v_sup IS NULL OR v_tit.supplier_id IS NOT DISTINCT FROM v_sup)
        THEN
            RETURN 'nada';
        END IF;

        -- Valor novo, ou título que volta de cancelado, precisa de nova
        -- aprovação: alçada aprovou OUTRO valor.
        v_reabre := v_tit.status = 'CANCELLED' OR v_tit.amount <> v_valor;

        UPDATE public.internal_transactions
           SET organization_id  = v_deal.organization_id,
               amount           = v_valor,
               due_date         = v_venc,
               transaction_date = v_venc,
               description      = v_desc,
               party_name       = v_nome,
               party_email      = v_email,
               entity_name      = v_nome,
               supplier_id      = COALESCE(v_sup, supplier_id),
               -- categoria/CC/contrato: só preenche o que está vazio — o que
               -- foi escolhido no Contas a Pagar não é sobrescrito.
               category_id      = COALESCE(category_id, v_cat_id),
               category         = COALESCE(NULLIF(category, ''), v_cat),
               cost_center_id   = COALESCE(cost_center_id, v_deal.cost_center_id),
               contract_id      = COALESCE(contract_id, v_contrato),
               status           = 'PENDING',
               business_status  = CASE WHEN status = 'CANCELLED' THEN 'PREVISTO' ELSE business_status END,
               approval_status  = CASE WHEN v_reabre AND approval_status IN ('PENDENTE', 'APROVADO')
                                       THEN 'RASCUNHO' ELSE approval_status END,
               approval_chain   = CASE WHEN v_reabre AND approval_status IN ('PENDENTE', 'APROVADO')
                                       THEN '[]'::jsonb ELSE approval_chain END,
               updated_at       = now()
         WHERE id = v_tit.id;
        RETURN 'atualizado';
    EXCEPTION WHEN OTHERS THEN
        -- Ex.: competência fechada em Contas a Pagar. A gravação do negócio
        -- falha junto, com a causa dita — título de comissão faltando em
        -- silêncio foi exatamente o bug que esta migration corrige.
        RAISE EXCEPTION 'Comissão do corretor (%): %', v_numero, SQLERRM
            USING ERRCODE = SQLSTATE;
    END;
END;
$$;

COMMENT ON FUNCTION public.fn_comissao_corretor_sincronizar(uuid) IS
'Cria/atualiza/cancela o título a pagar da comissão do corretor de um negócio (reference_id brk-{deal}). Chamada pelo gatilho trg_comissao_corretor. Plano docs/planos/2026-10-17-comissao-corretor-portal.md';

REVOKE EXECUTE ON FUNCTION public.fn_comissao_corretor_sincronizar(uuid) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Gatilho em commercial_deals.
--    Só age quando muda algo que mexe na comissão: regravar um negócio
--    antigo sem mudança NÃO cria título (há vendas de 2015/2016 em
--    "Contrato" — título hoje seria obrigação falsa).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_trg_comissao_corretor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.fn_comissao_corretor_sincronizar(OLD.id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.status                  IS NOT DISTINCT FROM OLD.status
       AND NEW.broker_id               IS NOT DISTINCT FROM OLD.broker_id
       AND NEW.broker_commission_value IS NOT DISTINCT FROM OLD.broker_commission_value
       AND NEW.broker_payment_due_date IS NOT DISTINCT FROM OLD.broker_payment_due_date
       AND NEW.organization_id         IS NOT DISTINCT FROM OLD.organization_id
    THEN
        RETURN NEW;
    END IF;

    PERFORM public.fn_comissao_corretor_sincronizar(NEW.id);
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trg_comissao_corretor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_comissao_corretor ON public.commercial_deals;
CREATE TRIGGER trg_comissao_corretor
    AFTER INSERT OR UPDATE OR DELETE ON public.commercial_deals
    FOR EACH ROW EXECUTE FUNCTION public.fn_trg_comissao_corretor();


-- ---------------------------------------------------------------------
-- 3. Leitura derivada: as comissões de um corretor (ou de todos, e-mail
--    NULL) nas organizações dadas. Interna — quem autoriza são as duas
--    funções de entrada abaixo.
--
--    Corretor casa pelo E-MAIL do perfil, não pelo id: o mesmo corretor
--    tem um broker_profiles por organização e o negócio pode apontar o
--    perfil de outra org (o seletor da negociação deduplica por e-mail).
--
--    Status: Paga = título conciliado cobrindo o previsto; Parcial = pago
--    menos que o previsto; Liberada = título aprovado na alçada;
--    Pendente = sem título ou título ainda não aprovado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_comissoes_lista(p_orgs uuid[], p_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH negocio AS (
    SELECT d.*, lower(trim(bp.email)) AS corretor_email
      FROM public.commercial_deals d
      JOIN public.broker_profiles bp ON bp.id = d.broker_id
     WHERE d.organization_id = ANY (p_orgs)
       AND d.status IS DISTINCT FROM 'CANCELLED'
       AND COALESCE(d.broker_commission_value, 0) > 0
       AND (NULLIF(trim(p_email), '') IS NULL OR lower(trim(bp.email)) = lower(trim(p_email)))
),
titulo AS (
    SELECT n.id AS deal_id,
           COALESCE(sum(it.amount) FILTER (WHERE it.status = 'CONCILIATED'), 0) AS pago,
           COALESCE(sum(it.amount) FILTER (WHERE it.status = 'CONCILIATED'
                                              OR it.approval_status = 'APROVADO'), 0) AS liberado,
           jsonb_agg(jsonb_build_object(
               'name', CASE
                         WHEN it.status = 'CONCILIATED'        THEN 'Pago'
                         WHEN it.approval_status = 'APROVADO'  THEN 'Liberado para pagamento'
                         ELSE 'Lançado no Contas a Pagar (aguardando aprovação)'
                       END,
               'value', it.amount,
               'date',  COALESCE(it.payment_date, it.due_date),
               'paid',  it.status = 'CONCILIATED'
           ) ORDER BY it.due_date) AS marcos
      FROM negocio n
      JOIN public.internal_transactions it
        ON it.organization_id = n.organization_id
       AND it.reference_id    = 'brk-' || n.id::text
       AND it.status         <> 'CANCELLED'
     GROUP BY n.id
),
unidade AS (
    SELECT n.id AS deal_id,
           string_agg(p.name, ', ' ORDER BY du.is_primary DESC NULLS LAST, p.name) AS nomes,
           min(COALESCE(pai.name, p.block)) AS bloco
      FROM negocio n
      JOIN public.commercial_deal_units du ON du.deal_id = n.id
      JOIN public.commercial_properties p ON p.id = du.property_id
      LEFT JOIN public.commercial_properties pai ON pai.id = p.parent_id
     GROUP BY n.id
)
SELECT COALESCE(jsonb_agg(linha ORDER BY (linha->>'created_at') DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
        'id',                   n.id,
        'organization_id',      n.organization_id,
        'proposal_id',          NULL,
        'broker_email',         n.corretor_email,
        'deal_type',            n.type,
        'contract_number',      COALESCE(
                                    (SELECT c.number FROM public.contracts c
                                      WHERE c.deal_id = n.id ORDER BY c.created_at LIMIT 1),
                                    NULLIF(trim(n.contract_number), ''),
                                    NULLIF(trim(n.code), '')),
        'unit_number',          COALESCE(u.nomes, prop.name),
        'block',                COALESCE(u.bloco, pai.name, prop.block),
        'buyer_name',           cli.name,
        'sale_value',           n.value,
        'commission_pct',       COALESCE(n.broker_commission_pct, 0),
        'commission_predicted', n.broker_commission_value,
        'commission_released',  COALESCE(t.liberado, 0),
        'commission_paid',      COALESCE(t.pago, 0),
        'status',               CASE
                                  WHEN COALESCE(t.pago, 0) >= n.broker_commission_value THEN 'PAGA'
                                  WHEN COALESCE(t.pago, 0) > 0                          THEN 'PARCIAL'
                                  WHEN COALESCE(t.liberado, 0) > 0                      THEN 'LIBERADA'
                                  ELSE 'PENDENTE'
                                END,
        'milestones',           COALESCE(t.marcos, jsonb_build_array(jsonb_build_object(
                                    'name',  'Prevista — ainda sem título no Contas a Pagar',
                                    'value', n.broker_commission_value,
                                    'date',  NULL,
                                    'paid',  false))),
        'created_at',           COALESCE(n.date::timestamptz, n.created_at),
        'updated_at',           n.created_at
    ) AS linha
      FROM negocio n
      LEFT JOIN titulo  t   ON t.deal_id = n.id
      LEFT JOIN unidade u   ON u.deal_id = n.id
      LEFT JOIN public.commercial_properties prop ON prop.id = n.property_id
      LEFT JOIN public.commercial_properties pai  ON pai.id  = prop.parent_id
      LEFT JOIN public.clients cli ON cli.id = n.client_id
  ) x;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_comissoes_lista(uuid[], text) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Entrada do corretor pelo LINK (anon): org e e-mail vêm do token,
--    nunca do chamador.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_commissions(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org   uuid;
    v_email text;
BEGIN
    SELECT t.org_id, t.email INTO v_org, v_email
      FROM public.fn_broker_portal_corretor_do_token(p_token) t;
    IF v_org IS NULL OR v_email IS NULL OR v_email = '' THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid',       TRUE,
        'commissions', public.fn_broker_comissoes_lista(ARRAY[v_org], v_email)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_get_commissions(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_get_commissions(text) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Entrada interna (gestor / prévia): só as organizações de que quem
--    chama é membro. p_org NULL = "Todas" (REGRA #5); p_email NULL = todos
--    os corretores.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_comissoes_gestor(p_org uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orgs uuid[];
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    IF p_org IS NOT NULL THEN
        IF NOT (public.is_org_member(p_org) OR public.is_superadmin()) THEN
            RETURN '[]'::jsonb;
        END IF;
        v_orgs := ARRAY[p_org];
    ELSE
        -- Mesma régua da RLS (is_org_member), não uma leitura própria de
        -- organization_members.
        SELECT array_agg(o.id) INTO v_orgs
          FROM public.organizations o
         WHERE public.is_org_member(o.id);
    END IF;

    IF v_orgs IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    RETURN public.fn_broker_comissoes_lista(v_orgs, p_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_comissoes_gestor(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_broker_comissoes_gestor(uuid, text) TO authenticated;
