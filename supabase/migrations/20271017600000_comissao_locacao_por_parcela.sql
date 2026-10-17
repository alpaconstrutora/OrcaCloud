-- =====================================================================
-- Comissão do corretor — fase 2: LOCAÇÃO é % sobre CADA parcela.
--
-- Plano: docs/planos/2026-10-17-comissao-corretor-portal.md (Fase 2)
--
-- Regra do usuário (17/10/2026):
--   · venda   → % uma única vez sobre o total da negociação (fase 1, igual);
--   · locação → % sobre cada parcela de aluguel. Comissão da parcela fica
--     LIBERADA quando aquele aluguel é recebido; PAGA quando o título da
--     comissão é conciliado. Renovação (contrato-filho) também gera.
--
-- Títulos: venda = 'brk-{deal}'; locação = 'brk-{deal}-{reference_id da parcela}'.
--
-- As parcelas de aluguel nascem fora do saveDeal (botão "Gerar parcelas",
-- contractService), então a comissão por parcela tem gatilho NA PARCELA —
-- senão repetia o defeito da fase 1 (só aparecia se alguém salvasse o
-- negócio de novo).
--
-- Cancelamento feito pela sincronização = business_status 'CANCELADO_AUTO'
-- (é o único que a sincronização reabre); cancelamento feito por pessoa no
-- Contas a Pagar é respeitado.
--
-- ⚠️ Aplicar com `npx supabase db query --linked -f`, nunca `db push`.
-- =====================================================================

SET lock_timeout = '10s';


-- ---------------------------------------------------------------------
-- 0. Pendências: erro ao sincronizar a comissão de UMA parcela não pode
--    derrubar a gravação da parcela (regerar, corte de renovação,
--    conciliação). Fica registrado aqui, legível pela causa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissao_corretor_pendencias (
    id          bigserial PRIMARY KEY,
    criado_em   timestamptz NOT NULL DEFAULT now(),
    deal_id     uuid,
    parcela_ref text,
    erro        text NOT NULL
);
ALTER TABLE public.comissao_corretor_pendencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissao_corretor_pendencias FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.comissao_corretor_pendencias IS
'Falhas ao sincronizar a comissão do corretor a partir de uma parcela (gatilho trg_comissao_parcela_*). A parcela foi gravada; a comissão dela não. Ver docs/planos/2026-10-17-comissao-corretor-portal.md';


-- Índice da ligação título ↔ negócio: uuid do negócio dentro do reference_id.
CREATE INDEX IF NOT EXISTS ix_internal_tx_brk_deal
    ON public.internal_transactions ((substring(reference_id from 5 for 36)))
    WHERE reference_id LIKE 'brk-%';


-- ---------------------------------------------------------------------
-- 1. Cadeia de contratos
-- ---------------------------------------------------------------------
-- Negócio de um contrato: o próprio deal_id ou o do contrato-pai (renovação
-- não herda deal_id — o vínculo é parent_contract_id).
CREATE OR REPLACE FUNCTION public.fn_comissao_deal_do_contrato(p_contract_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH RECURSIVE cadeia AS (
        SELECT c.id, c.deal_id, c.parent_contract_id, 1 AS nivel
          FROM public.contracts c
         WHERE c.id = p_contract_id
        UNION ALL
        SELECT c.id, c.deal_id, c.parent_contract_id, k.nivel + 1
          FROM public.contracts c
          JOIN cadeia k ON c.id = k.parent_contract_id
         WHERE k.deal_id IS NULL AND k.nivel < 20
    )
    SELECT deal_id FROM cadeia WHERE deal_id IS NOT NULL ORDER BY nivel LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_comissao_deal_do_contrato(uuid) FROM PUBLIC, anon, authenticated;

-- Contratos de um negócio: os dele + renovações descendentes (que não tenham
-- outro negócio próprio).
CREATE OR REPLACE FUNCTION public.fn_comissao_contratos_do_deal(p_deal_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH RECURSIVE arvore AS (
        SELECT c.id, 1 AS nivel FROM public.contracts c WHERE c.deal_id = p_deal_id
        UNION ALL
        SELECT c.id, a.nivel + 1
          FROM public.contracts c
          JOIN arvore a ON c.parent_contract_id = a.id
         WHERE a.nivel < 20 AND (c.deal_id IS NULL OR c.deal_id = p_deal_id)
    )
    SELECT DISTINCT id FROM arvore;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_comissao_contratos_do_deal(uuid) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Núcleos: gravar / cancelar UM título de comissão
-- ---------------------------------------------------------------------
-- Devolve: criado | atualizado | nada | pago_intocado | cancelado_manual
CREATE OR REPLACE FUNCTION public.fn_comissao_titulo_gravar(
    p_ref      text,
    p_org      uuid,
    p_valor    numeric,
    p_venc     date,      -- NULL = mantém o do título (ou hoje, se novo)
    p_desc     text,
    p_nome     text,
    p_email    text,
    p_cc       uuid,
    p_imovel   uuid,
    p_contrato uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_categorias CONSTANT text[] := ARRAY['Comissão de Corretagem', 'Comissões de Venda'];
    v_tit     public.internal_transactions;
    v_tem     boolean;
    v_sup     uuid;
    v_cat_id  uuid;
    v_cat     text;
    v_venc    date;
    v_valor   numeric := round(p_valor, 2);
    v_reabre  boolean;
BEGIN
    SELECT * INTO v_tit
      FROM public.internal_transactions
     WHERE reference_id = p_ref AND entry_type = 'PRINCIPAL'
     ORDER BY created_at
     LIMIT 1;
    v_tem := FOUND;

    -- Pago é fato do financeiro: nunca regravado.
    IF v_tem AND v_tit.status = 'CONCILIATED' THEN
        RETURN 'pago_intocado';
    END IF;
    -- Cancelado por PESSOA no Contas a Pagar: respeitado.
    IF v_tem AND v_tit.status = 'CANCELLED'
       AND v_tit.business_status IS DISTINCT FROM 'CANCELADO_AUTO' THEN
        RETURN 'cancelado_manual';
    END IF;

    -- Fornecedor = cadastro do corretor como fornecedor na org do título.
    IF p_email IS NOT NULL AND p_email <> '' THEN
        SELECT s.id INTO v_sup
          FROM public.suppliers s
         WHERE s.organization_id = p_org
           AND lower(trim(s.email)) = p_email
         ORDER BY s.created_at
         LIMIT 1;
    END IF;

    -- Categoria: regra do financialCategoryResolver (nome na ordem, org antes da global).
    SELECT fc.id, fc.name INTO v_cat_id, v_cat
      FROM public.financial_categories fc
     WHERE fc.name = ANY (c_categorias)
       AND (fc.organization_id = p_org OR fc.organization_id IS NULL)
     ORDER BY array_position(c_categorias, fc.name), (fc.organization_id IS NULL)
     LIMIT 1;
    v_cat := COALESCE(v_cat, c_categorias[1]);

    v_venc := COALESCE(p_venc, CASE WHEN v_tem THEN v_tit.due_date END, current_date);

    IF NOT v_tem THEN
        INSERT INTO public.internal_transactions (
            organization_id, source_system, reference_id, entry_type,
            transaction_date, due_date, amount, direction, description,
            category, category_id, status, business_status,
            party_name, party_type, party_email, entity_name, supplier_id,
            cost_center_id, property_id, contract_id
        ) VALUES (
            p_org, 'COMMERCIAL', p_ref, 'PRINCIPAL',
            v_venc, v_venc, v_valor, 'DEBIT', p_desc,
            v_cat, v_cat_id, 'PENDING', 'PREVISTO',
            p_nome, 'SUPPLIER', p_email, p_nome, v_sup,
            p_cc, p_imovel, p_contrato
        );
        RETURN 'criado';
    END IF;

    IF v_tit.status = 'PENDING'
       AND v_tit.organization_id = p_org
       AND v_tit.amount = v_valor
       AND v_tit.due_date IS NOT DISTINCT FROM v_venc
       AND v_tit.description IS NOT DISTINCT FROM p_desc
       AND v_tit.party_name IS NOT DISTINCT FROM p_nome
       AND v_tit.party_email IS NOT DISTINCT FROM p_email
       AND (v_sup IS NULL OR v_tit.supplier_id IS NOT DISTINCT FROM v_sup)
    THEN
        RETURN 'nada';
    END IF;

    -- Alçada aprovou OUTRO valor → reaprovar. Mesmo valor (ex.: parcela
    -- apagada e reinserida pelo "regerar") mantém a aprovação.
    v_reabre := v_tit.amount IS DISTINCT FROM v_valor;

    UPDATE public.internal_transactions
       SET organization_id  = p_org,
           amount           = v_valor,
           due_date         = v_venc,
           transaction_date = v_venc,
           description      = p_desc,
           party_name       = p_nome,
           party_email      = p_email,
           entity_name      = p_nome,
           supplier_id      = COALESCE(v_sup, supplier_id),
           -- categoria/CC/contrato: só preenche vazio — escolha manual fica.
           category_id      = COALESCE(category_id, v_cat_id),
           category         = COALESCE(NULLIF(category, ''), v_cat),
           cost_center_id   = COALESCE(cost_center_id, p_cc),
           contract_id      = COALESCE(contract_id, p_contrato),
           status           = 'PENDING',
           business_status  = CASE WHEN status = 'CANCELLED' THEN 'PREVISTO' ELSE business_status END,
           approval_status  = CASE WHEN v_reabre AND approval_status IN ('PENDENTE', 'APROVADO')
                                   THEN 'RASCUNHO' ELSE approval_status END,
           approval_chain   = CASE WHEN v_reabre AND approval_status IN ('PENDENTE', 'APROVADO')
                                   THEN '[]'::jsonb ELSE approval_chain END,
           updated_at       = now()
     WHERE id = v_tit.id;
    RETURN 'atualizado';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_comissao_titulo_gravar(text, uuid, numeric, date, text, text, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Devolve: cancelado | nada | pago_intocado
CREATE OR REPLACE FUNCTION public.fn_comissao_titulo_cancelar(p_ref text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id     uuid;
    v_status text;
BEGIN
    SELECT id, status INTO v_id, v_status
      FROM public.internal_transactions
     WHERE reference_id = p_ref AND entry_type = 'PRINCIPAL'
     ORDER BY created_at
     LIMIT 1;
    IF v_id IS NULL OR v_status = 'CANCELLED' THEN RETURN 'nada'; END IF;
    IF v_status = 'CONCILIATED' THEN RETURN 'pago_intocado'; END IF;
    UPDATE public.internal_transactions
       SET status = 'CANCELLED', business_status = 'CANCELADO_AUTO', updated_at = now()
     WHERE id = v_id;
    RETURN 'cancelado';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_comissao_titulo_cancelar(text) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Comissão de UMA parcela de aluguel
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_comissao_parcela_sincronizar(
    p_deal    public.commercial_deals,
    p_parcela public.internal_transactions
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_estagios CONSTANT text[] := ARRAY['CONTRATO', 'ASSINATURA', 'COMPLETED'];
    v_ref      text := 'brk-' || p_deal.id::text || '-' || p_parcela.reference_id;
    v_pct      numeric := COALESCE(p_deal.broker_commission_pct, 0);
    v_viva     boolean;
    v_recebida boolean;
    v_email    text;
    v_nome     text;
    v_numero   text;
BEGIN
    v_viva := p_parcela.status <> 'CANCELLED'
              AND COALESCE(p_parcela.business_status, '') <> 'CANCELADO'
              AND COALESCE(p_parcela.amount, 0) > 0;
    v_recebida := p_parcela.status = 'CONCILIATED'
                  OR p_parcela.business_status = 'RECEBIDO';

    IF NOT v_viva THEN
        RETURN public.fn_comissao_titulo_cancelar(v_ref);
    END IF;

    -- Sem corretor, % zerado ou outro tipo de negócio → comissão não existe.
    IF p_deal.type IS DISTINCT FROM 'RENTAL' OR p_deal.broker_id IS NULL OR v_pct <= 0 THEN
        RETURN public.fn_comissao_titulo_cancelar(v_ref);
    END IF;

    -- Distrato / fora dos estágios: o que já foi RECEBIDO segue devido ao
    -- corretor; o que não foi, cancela.
    IF NOT (p_deal.status = ANY (c_estagios)) THEN
        IF v_recebida THEN RETURN 'mantido'; END IF;
        RETURN public.fn_comissao_titulo_cancelar(v_ref);
    END IF;

    SELECT lower(trim(bp.email)), bp.name INTO v_email, v_nome
      FROM public.broker_profiles bp WHERE bp.id = p_deal.broker_id;
    v_nome := COALESCE(NULLIF(trim(v_nome), ''), NULLIF(trim(p_deal.broker_name), ''), 'Corretor');

    SELECT c.number INTO v_numero FROM public.contracts c WHERE c.id = p_parcela.contract_id;
    v_numero := COALESCE(NULLIF(trim(v_numero), ''),
                         NULLIF(trim(p_deal.contract_number), ''),
                         NULLIF(trim(p_deal.code), ''),
                         'Deal #' || left(p_deal.id::text, 8));

    RETURN public.fn_comissao_titulo_gravar(
        v_ref,
        p_parcela.organization_id,
        p_parcela.amount * v_pct / 100,
        p_parcela.due_date,
        v_numero || ' - Comissão de corretagem - ' || v_nome
                 || ' - Aluguel ' || COALESCE(to_char(p_parcela.due_date, 'DD/MM/YYYY'), ''),
        v_nome,
        v_email,
        COALESCE(p_parcela.cost_center_id, p_deal.cost_center_id),
        COALESCE(p_parcela.property_id, p_deal.property_id),
        p_parcela.contract_id
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_comissao_parcela_sincronizar(public.commercial_deals, public.internal_transactions) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Comissão de UM negócio (venda: 1 título; locação: 1 por parcela)
--    Devolve um resumo "criado=n atualizado=n …".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_comissao_corretor_sincronizar(p_deal_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_estagios CONSTANT text[] := ARRAY['CONTRATO', 'ASSINATURA', 'COMPLETED'];
    v_ref      text := 'brk-' || p_deal_id::text;
    v_deal     public.commercial_deals;
    v_tem_deal boolean;
    v_parcela  public.internal_transactions;
    v_vivas    text[] := '{}';
    v_res      text;
    v_cont     jsonb := '{}'::jsonb;
    v_email    text;
    v_nome     text;
    v_contrato uuid;
    v_numero   text;
    r          record;
BEGIN
    SELECT * INTO v_deal FROM public.commercial_deals WHERE id = p_deal_id;
    v_tem_deal := FOUND;

    IF v_tem_deal AND v_deal.type = 'RENTAL' THEN
        -- Locação: título único da fase 1 (se houver) deixa de valer.
        v_res := public.fn_comissao_titulo_cancelar(v_ref);
        v_cont := v_cont || jsonb_build_object('unico_' || v_res, 1);

        FOR v_parcela IN
            SELECT it.*
              FROM public.internal_transactions it
             WHERE it.direction = 'CREDIT'
               AND (
                    (it.contract_id IN (SELECT public.fn_comissao_contratos_do_deal(p_deal_id))
                     AND it.source_system IN ('CONTRACT_RECURRING', 'CONTRACT_PARCELADO'))
                 OR it.reference_id LIKE 'tx-' || p_deal_id::text || '-%'
               )
             ORDER BY it.reference_id
        LOOP
            v_res := public.fn_comissao_parcela_sincronizar(v_deal, v_parcela);
            v_cont := v_cont || jsonb_build_object(v_res, COALESCE((v_cont->>v_res)::int, 0) + 1);
            v_vivas := v_vivas || v_parcela.reference_id;
        END LOOP;

        -- Títulos de parcela que sumiu (apagada sem passar pelo gatilho).
        FOR r IN
            SELECT it.reference_id
              FROM public.internal_transactions it
             WHERE it.reference_id LIKE 'brk-%'
               AND substring(it.reference_id from 5 for 36) = p_deal_id::text
               AND it.reference_id <> v_ref
               AND it.status = 'PENDING'
               AND NOT (substring(it.reference_id from 42) = ANY (v_vivas))
             ORDER BY it.reference_id
        LOOP
            PERFORM public.fn_comissao_titulo_cancelar(r.reference_id);
            v_cont := v_cont || jsonb_build_object('orfao_cancelado', COALESCE((v_cont->>'orfao_cancelado')::int, 0) + 1);
        END LOOP;

        RETURN v_cont::text;
    END IF;

    -- Venda (ou negócio apagado): títulos por parcela de quando era locação
    -- deixam de valer, menos os de aluguel já recebido.
    FOR r IN
        SELECT it.reference_id
          FROM public.internal_transactions it
         WHERE it.reference_id LIKE 'brk-%'
           AND substring(it.reference_id from 5 for 36) = p_deal_id::text
           AND it.reference_id <> v_ref
           AND it.status = 'PENDING'
           AND NOT EXISTS (
                SELECT 1 FROM public.internal_transactions par
                 WHERE par.organization_id = it.organization_id
                   AND par.reference_id = substring(it.reference_id from 42)
                   AND (par.status = 'CONCILIATED' OR par.business_status = 'RECEBIDO'))
         ORDER BY it.reference_id
    LOOP
        PERFORM public.fn_comissao_titulo_cancelar(r.reference_id);
    END LOOP;

    IF NOT v_tem_deal
       OR NOT (v_deal.status = ANY (c_estagios))
       OR v_deal.broker_id IS NULL
       OR COALESCE(v_deal.broker_commission_value, 0) <= 0
    THEN
        RETURN public.fn_comissao_titulo_cancelar(v_ref);
    END IF;

    SELECT lower(trim(bp.email)), bp.name INTO v_email, v_nome
      FROM public.broker_profiles bp WHERE bp.id = v_deal.broker_id;
    v_nome := COALESCE(NULLIF(trim(v_nome), ''), NULLIF(trim(v_deal.broker_name), ''), 'Corretor');

    SELECT c.id, c.number INTO v_contrato, v_numero
      FROM public.contracts c WHERE c.deal_id = p_deal_id ORDER BY c.created_at LIMIT 1;
    v_numero := COALESCE(NULLIF(trim(v_numero), ''),
                         NULLIF(trim(v_deal.contract_number), ''),
                         NULLIF(trim(v_deal.code), ''),
                         'Deal #' || left(p_deal_id::text, 8));

    RETURN public.fn_comissao_titulo_gravar(
        v_ref,
        v_deal.organization_id,
        v_deal.broker_commission_value,
        v_deal.broker_payment_due_date,
        v_numero || ' - Comissão de corretagem - ' || v_nome,
        v_nome,
        v_email,
        v_deal.cost_center_id,
        v_deal.property_id,
        v_contrato
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_comissao_corretor_sincronizar(uuid) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Gatilho do NEGÓCIO: agora observa também tipo, % e valor (para
--    locação o % é a fonte). Erro aqui derruba a gravação do negócio, com a
--    causa dita (fase 1).
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
       AND NEW.type                    IS NOT DISTINCT FROM OLD.type
       AND NEW.broker_id               IS NOT DISTINCT FROM OLD.broker_id
       AND NEW.broker_commission_pct   IS NOT DISTINCT FROM OLD.broker_commission_pct
       AND NEW.broker_commission_value IS NOT DISTINCT FROM OLD.broker_commission_value
       AND NEW.broker_payment_due_date IS NOT DISTINCT FROM OLD.broker_payment_due_date
       AND NEW.value                   IS NOT DISTINCT FROM OLD.value
       AND NEW.organization_id         IS NOT DISTINCT FROM OLD.organization_id
    THEN
        RETURN NEW;
    END IF;

    BEGIN
        PERFORM public.fn_comissao_corretor_sincronizar(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Comissão do corretor: %', SQLERRM USING ERRCODE = SQLSTATE;
    END;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_trg_comissao_corretor() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. Gatilhos da PARCELA (internal_transactions, só CREDIT — título de
--    comissão/tributo é DEBIT e não re-dispara). Conciliar parcela NÃO
--    dispara: "liberada" é calculada na leitura. Erro é engolido e vai para
--    comissao_corretor_pendencias.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_trg_comissao_parcela()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row     public.internal_transactions;
    v_deal_id uuid;
    v_antigo  uuid;
    v_deal    public.commercial_deals;
BEGIN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

    -- Só parcelas de contrato recorrente/parcelado, ou o legado tx-{deal}-…
    IF NOT (COALESCE(v_row.source_system, '') IN ('CONTRACT_RECURRING', 'CONTRACT_PARCELADO')
            OR COALESCE(v_row.reference_id, '') ~ '^tx-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-')
    THEN
        RETURN NULL;
    END IF;

    BEGIN
        IF COALESCE(v_row.reference_id, '') ~ '^tx-[0-9a-f]{8}-' AND v_row.contract_id IS NULL THEN
            v_deal_id := substring(v_row.reference_id from 4 for 36)::uuid;
        ELSE
            v_deal_id := public.fn_comissao_deal_do_contrato(v_row.contract_id);
        END IF;

        -- Parcela mudou de contrato (ou o contrato foi apagado): o negócio
        -- antigo é ressincronizado inteiro (cancela o título que ficou órfão).
        IF TG_OP = 'UPDATE' AND OLD.contract_id IS DISTINCT FROM NEW.contract_id THEN
            v_antigo := public.fn_comissao_deal_do_contrato(OLD.contract_id);
            IF v_antigo IS NOT NULL AND v_antigo IS DISTINCT FROM v_deal_id THEN
                PERFORM public.fn_comissao_corretor_sincronizar(v_antigo);
            END IF;
        END IF;

        IF v_deal_id IS NULL THEN RETURN NULL; END IF;

        IF TG_OP = 'DELETE' THEN
            PERFORM public.fn_comissao_titulo_cancelar('brk-' || v_deal_id::text || '-' || OLD.reference_id);
            RETURN NULL;
        END IF;

        SELECT * INTO v_deal FROM public.commercial_deals WHERE id = v_deal_id;
        IF NOT FOUND OR v_deal.type IS DISTINCT FROM 'RENTAL' THEN RETURN NULL; END IF;

        PERFORM public.fn_comissao_parcela_sincronizar(v_deal, NEW);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.comissao_corretor_pendencias (deal_id, parcela_ref, erro)
        VALUES (v_deal_id, v_row.reference_id, SQLSTATE || ' ' || SQLERRM);
        RAISE NOTICE 'Comissão do corretor da parcela % não sincronizada: %', v_row.reference_id, SQLERRM;
    END;
    RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_trg_comissao_parcela() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_comissao_parcela_ins ON public.internal_transactions;
CREATE TRIGGER trg_comissao_parcela_ins
    AFTER INSERT ON public.internal_transactions
    FOR EACH ROW
    WHEN (NEW.direction = 'CREDIT' AND (NEW.contract_id IS NOT NULL OR NEW.reference_id LIKE 'tx-%'))
    EXECUTE FUNCTION public.fn_trg_comissao_parcela();

DROP TRIGGER IF EXISTS trg_comissao_parcela_upd ON public.internal_transactions;
CREATE TRIGGER trg_comissao_parcela_upd
    AFTER UPDATE ON public.internal_transactions
    FOR EACH ROW
    WHEN (NEW.direction = 'CREDIT'
          AND (NEW.contract_id IS NOT NULL OR OLD.contract_id IS NOT NULL OR NEW.reference_id LIKE 'tx-%')
          AND (OLD.amount      IS DISTINCT FROM NEW.amount
            OR OLD.due_date    IS DISTINCT FROM NEW.due_date
            OR OLD.contract_id IS DISTINCT FROM NEW.contract_id
            OR (OLD.status = 'CANCELLED' OR COALESCE(OLD.business_status, '') = 'CANCELADO')
               IS DISTINCT FROM
               (NEW.status = 'CANCELLED' OR COALESCE(NEW.business_status, '') = 'CANCELADO')))
    EXECUTE FUNCTION public.fn_trg_comissao_parcela();

DROP TRIGGER IF EXISTS trg_comissao_parcela_del ON public.internal_transactions;
CREATE TRIGGER trg_comissao_parcela_del
    AFTER DELETE ON public.internal_transactions
    FOR EACH ROW
    WHEN (OLD.direction = 'CREDIT' AND (OLD.contract_id IS NOT NULL OR OLD.reference_id LIKE 'tx-%'))
    EXECUTE FUNCTION public.fn_trg_comissao_parcela();


-- ---------------------------------------------------------------------
-- 7. Leitura derivada (portal do corretor) — venda e locação.
--    Título ↔ negócio pelo uuid do negócio no reference_id (sem exigir a
--    mesma org: o título fica na org da parcela).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_comissoes_lista(p_orgs uuid[], p_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH negocio AS (
    SELECT d.*, lower(trim(bp.email)) AS corretor_email, (d.type = 'RENTAL') AS por_parcela
      FROM public.commercial_deals d
      JOIN public.broker_profiles bp ON bp.id = d.broker_id
     WHERE d.organization_id = ANY (p_orgs)
       AND (NULLIF(trim(p_email), '') IS NULL OR lower(trim(bp.email)) = lower(trim(p_email)))
       AND (
            (d.status IS DISTINCT FROM 'CANCELLED'
             AND CASE WHEN d.type = 'RENTAL' THEN COALESCE(d.broker_commission_pct, 0) > 0
                      ELSE COALESCE(d.broker_commission_value, 0) > 0 END)
            -- distrato: comissão de aluguel já recebido continua devida
         OR EXISTS (SELECT 1 FROM public.internal_transactions it
                     WHERE it.reference_id LIKE 'brk-%'
                       AND substring(it.reference_id from 5 for 36) = d.id::text
                       AND it.status <> 'CANCELLED')
       )
),
titulo_base AS (
    SELECT n.id AS deal_id, n.por_parcela,
           it.amount, it.status, it.approval_status, it.due_date, it.payment_date,
           (it.status = 'CONCILIATED') AS pago,
           COALESCE(par.status = 'CONCILIATED' OR par.business_status = 'RECEBIDO', false) AS recebida,
           row_number() OVER (PARTITION BY n.id ORDER BY it.due_date, it.reference_id) AS n_parcela,
           count(*)     OVER (PARTITION BY n.id) AS total_parcelas
      FROM negocio n
      JOIN public.internal_transactions it
        ON it.reference_id LIKE 'brk-%'
       AND substring(it.reference_id from 5 for 36) = n.id::text
       AND it.status <> 'CANCELLED'
       AND it.direction = 'DEBIT'
       -- venda: só o título único; locação: só os por parcela
       AND (CASE WHEN n.por_parcela THEN length(it.reference_id) > 40 ELSE length(it.reference_id) = 40 END)
      LEFT JOIN public.internal_transactions par
        ON n.por_parcela
       AND par.organization_id = it.organization_id
       AND par.reference_id = substring(it.reference_id from 42)
       AND par.direction = 'CREDIT'
),
titulo AS (
    SELECT tb.*,
           min(tb.n_parcela) FILTER (WHERE tb.due_date >= current_date)
               OVER (PARTITION BY tb.deal_id) AS primeira_futura
      FROM titulo_base tb
),
soma AS (
    SELECT t.deal_id,
           sum(t.amount) AS previsto,
           sum(t.amount) FILTER (WHERE t.pago) AS pago,
           sum(t.amount) FILTER (WHERE t.pago
                                    OR (t.por_parcela AND t.recebida)
                                    OR (NOT t.por_parcela AND t.approval_status = 'APROVADO')) AS liberado,
           max(t.total_parcelas) AS parcelas,
           jsonb_agg(jsonb_build_object(
               'name', CASE
                   WHEN t.por_parcela THEN
                       'Parcela ' || t.n_parcela || '/' || t.total_parcelas || ' — ' ||
                       CASE WHEN t.pago     THEN 'comissão paga'
                            WHEN t.recebida THEN 'aluguel recebido — liberada'
                            ELSE 'aluguel a receber' END
                   WHEN t.pago                         THEN 'Pago'
                   WHEN t.approval_status = 'APROVADO' THEN 'Liberado para pagamento'
                   ELSE 'Lançado no Contas a Pagar (aguardando aprovação)'
               END,
               'value', t.amount,
               'date',  COALESCE(CASE WHEN t.pago THEN t.payment_date END, t.due_date),
               'paid',  t.pago
           ) ORDER BY t.due_date, t.n_parcela)
           -- locação: só o que interessa agora — liberadas/vencidas não pagas
           -- e as próximas 12 (o total vai em parcelas_total).
           FILTER (WHERE NOT t.por_parcela
                      OR (NOT t.pago AND (t.recebida OR t.due_date < current_date))
                      OR (t.due_date >= current_date AND t.n_parcela <= t.primeira_futura + 11)) AS marcos
      FROM titulo t
     GROUP BY t.deal_id
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
        'commission_base',      CASE WHEN n.por_parcela THEN 'PARCELA' ELSE 'TOTAL' END,
        'parcelas_total',       COALESCE(s.parcelas, 0),
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
        'commission_predicted', x.previsto,
        'commission_released',  COALESCE(s.liberado, 0),
        'commission_paid',      COALESCE(s.pago, 0),
        'status',               CASE
                                  WHEN x.previsto > 0 AND COALESCE(s.pago, 0) >= x.previsto THEN 'PAGA'
                                  WHEN COALESCE(s.pago, 0) > 0                              THEN 'PARCIAL'
                                  WHEN COALESCE(s.liberado, 0) > 0                          THEN 'LIBERADA'
                                  ELSE 'PENDENTE'
                                END,
        'milestones',           COALESCE(s.marcos, jsonb_build_array(jsonb_build_object(
                                    'name',  CASE WHEN n.por_parcela
                                                  THEN 'Prevista por parcela — as parcelas do aluguel ainda não foram geradas'
                                                  ELSE 'Prevista — ainda sem título no Contas a Pagar' END,
                                    'value', x.previsto,
                                    'date',  NULL,
                                    'paid',  false))),
        'created_at',           COALESCE(n.date::timestamptz, n.created_at),
        'updated_at',           n.created_at
    ) AS linha
      FROM negocio n
      LEFT JOIN soma    s   ON s.deal_id = n.id
      LEFT JOIN unidade u   ON u.deal_id = n.id
      LEFT JOIN public.commercial_properties prop ON prop.id = n.property_id
      LEFT JOIN public.commercial_properties pai  ON pai.id  = prop.parent_id
      LEFT JOIN public.clients cli ON cli.id = n.client_id
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN s.previsto IS NOT NULL AND n.por_parcela THEN s.previsto
                 -- locação sem parcelas geradas: estimativa de UMA parcela
                 WHEN n.por_parcela THEN round(COALESCE(NULLIF(n.installment_value, 0), n.value, 0)
                                               * COALESCE(n.broker_commission_pct, 0) / 100, 2)
                 ELSE n.broker_commission_value
               END AS previsto
      ) x
  ) y;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_broker_comissoes_lista(uuid[], text) FROM PUBLIC, anon, authenticated;

RESET lock_timeout;
