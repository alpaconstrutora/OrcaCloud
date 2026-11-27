-- ============================================================================
-- Condomínio › Ficha: "Conta do condomínio" (27/11/2026)
--
-- Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md (2ª parte)
-- Pedido: "em comercial > condominio: voce vai implementar um campo para eu selecionar
-- uma conta que ja existe cadastrada em minhas organização > contas" — na ficha do
-- condomínio, valendo "para tudo do condomínio".
--
-- 1. `empreendimentos.condominio_payment_account_id` — a conta do condomínio.
-- 2. `condominio_salvar_ficha` aceita o campo. Conta de OUTRA organização passa a atender
--    a org do condomínio (`payment_account_organizations`, o "Atende também" de Contas):
--    sem isso o Portal do Síndico (`fn_sindico_conta_atende`) e a emissão
--    (`fn_conta_asaas_da_org`) recusariam a conta. Só grava quem enxerga a conta (membro
--    da org dona, superadmin, ou a conta já atende o condomínio). Condomínio sem org
--    própria recusa: a conta não teria onde valer.
-- 3. "Vale para tudo": gatilho BEFORE INSERT em `internal_transactions` — lançamento NOVO
--    na org do condomínio que chega SEM conta recebe a do condomínio (cota, despesa,
--    receita, contrato; pelo app ou pelo portal). Conta já escolhida não é tocada. Só na
--    org do condomínio: o centro de custo do condomínio pode estar no MESMO empreendimento
--    da obra, e despesa da obra não pode pegar a conta do condomínio. Lançamentos já
--    existentes não mudam.
--
-- REGRA #7: as duas funções com REVOKE de PUBLIC/anon; autorização dentro da RPC.
-- Reverter: DROP TRIGGER trg_condominio_conta_padrao + DROP FUNCTION
-- fn_condominio_conta_padrao; recriar condominio_salvar_ficha de …21500000; DROP COLUMN.
-- ============================================================================

ALTER TABLE public.empreendimentos
    ADD COLUMN IF NOT EXISTS condominio_payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

-- ── 2. Ficha ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.condominio_salvar_ficha(p_empreendimento_id uuid, p_campos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_e     public.empreendimentos;
    v_dona  boolean;
    v_opera boolean;
    v_conta uuid;
    v_pa    public.payment_accounts;
BEGIN
    SELECT * INTO v_e FROM public.empreendimentos WHERE id = p_empreendimento_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio não encontrado.');
    END IF;
    v_dona  := public.is_org_member(v_e.organization_id);
    v_opera := v_e.condominio_org_id IS NOT NULL AND public.is_org_member(v_e.condominio_org_id);
    IF NOT (v_dona OR v_opera) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para este condomínio.');
    END IF;
    IF NOT v_dona AND (p_campos ?| ARRAY['sindico_client_id', 'sindico_mandato_inicio', 'sindico_mandato_fim', 'rateio_exige_aprovacao_sindico']) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Síndico, mandato e a exigência de aprovação são definidos pela administradora do empreendimento.');
    END IF;

    -- Conta do condomínio (27/11/2026).
    IF p_campos ? 'condominio_payment_account_id' THEN
        BEGIN
            v_conta := nullif(p_campos ->> 'condominio_payment_account_id', '')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Conta inválida.');
        END;
        IF v_conta IS NOT NULL AND v_conta IS DISTINCT FROM v_e.condominio_payment_account_id THEN
            IF v_e.condominio_org_id IS NULL THEN
                RETURN jsonb_build_object('ok', false, 'motivo', 'O condomínio não tem organização própria — a conta não teria onde valer.');
            END IF;
            SELECT * INTO v_pa FROM public.payment_accounts WHERE id = v_conta;
            IF NOT FOUND OR v_pa.is_active IS FALSE THEN
                RETURN jsonb_build_object('ok', false, 'motivo', 'Conta não encontrada ou inativa.');
            END IF;
            IF NOT (public.is_org_member(v_pa.organization_id) OR public.is_superadmin()
                    OR public.fn_sindico_conta_atende(v_conta, v_e.condominio_org_id)) THEN
                RETURN jsonb_build_object('ok', false, 'motivo', 'Você não tem acesso a esta conta.');
            END IF;
            IF NOT public.fn_sindico_conta_atende(v_conta, v_e.condominio_org_id) THEN
                INSERT INTO public.payment_account_organizations (payment_account_id, organization_id)
                VALUES (v_conta, v_e.condominio_org_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;
    END IF;

    UPDATE public.empreendimentos SET
        condominio_razao_social = CASE WHEN p_campos ? 'condominio_razao_social' THEN nullif(p_campos->>'condominio_razao_social', '') ELSE condominio_razao_social END,
        condominio_cnpj         = CASE WHEN p_campos ? 'condominio_cnpj' THEN nullif(p_campos->>'condominio_cnpj', '') ELSE condominio_cnpj END,
        condominio_instalado_em = CASE WHEN p_campos ? 'condominio_instalado_em' THEN nullif(p_campos->>'condominio_instalado_em', '')::date ELSE condominio_instalado_em END,
        cobranca_multa_percent  = CASE WHEN p_campos ? 'cobranca_multa_percent' THEN coalesce((p_campos->>'cobranca_multa_percent')::numeric, 0) ELSE cobranca_multa_percent END,
        cobranca_juros_mes_percent = CASE WHEN p_campos ? 'cobranca_juros_mes_percent' THEN coalesce((p_campos->>'cobranca_juros_mes_percent')::numeric, 0) ELSE cobranca_juros_mes_percent END,
        sindico_client_id       = CASE WHEN p_campos ? 'sindico_client_id' THEN nullif(p_campos->>'sindico_client_id', '')::uuid ELSE sindico_client_id END,
        sindico_mandato_inicio  = CASE WHEN p_campos ? 'sindico_mandato_inicio' THEN nullif(p_campos->>'sindico_mandato_inicio', '')::date ELSE sindico_mandato_inicio END,
        sindico_mandato_fim     = CASE WHEN p_campos ? 'sindico_mandato_fim' THEN nullif(p_campos->>'sindico_mandato_fim', '')::date ELSE sindico_mandato_fim END,
        rateio_exige_aprovacao_sindico = CASE WHEN p_campos ? 'rateio_exige_aprovacao_sindico' THEN coalesce((p_campos->>'rateio_exige_aprovacao_sindico')::boolean, false) ELSE rateio_exige_aprovacao_sindico END,
        condominio_payment_account_id = CASE WHEN p_campos ? 'condominio_payment_account_id' THEN v_conta ELSE condominio_payment_account_id END,
        updated_at = now()
     WHERE id = p_empreendimento_id;

    RETURN jsonb_build_object('ok', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.condominio_salvar_ficha(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.condominio_salvar_ficha(uuid, jsonb) TO authenticated;

-- ── 3. Lançamento novo sem conta, na org do condomínio → a conta do condomínio ─
-- SECURITY DEFINER: quem insere (síndico por RPC, membro da org do condomínio) pode não
-- ler o empreendimento da construtora.
CREATE OR REPLACE FUNCTION public.fn_condominio_conta_padrao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_conta uuid;
    v_n     int;
BEGIN
    IF NEW.payment_account_id IS NOT NULL OR NEW.organization_id IS NULL THEN
        RETURN NEW;
    END IF;
    -- Pelo centro de custo vinculado ao condomínio (o caso comum: cota e despesa).
    IF NEW.cost_center_id IS NOT NULL THEN
        SELECT e.condominio_payment_account_id INTO v_conta
          FROM public.cost_centers_v2 cc
          JOIN public.empreendimentos e ON e.id = cc.empreendimento_id
         WHERE cc.id = NEW.cost_center_id
           AND e.condominio_org_id = NEW.organization_id;
    END IF;
    -- Sem centro de custo do condomínio: a org opera UM condomínio só → a conta dele.
    IF v_conta IS NULL THEN
        SELECT count(*), max(condominio_payment_account_id::text)::uuid INTO v_n, v_conta
          FROM public.empreendimentos
         WHERE condominio_org_id = NEW.organization_id;
        IF v_n <> 1 THEN v_conta := NULL; END IF;
    END IF;
    IF v_conta IS NOT NULL THEN
        NEW.payment_account_id := v_conta;
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_condominio_conta_padrao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_condominio_conta_padrao ON public.internal_transactions;
CREATE TRIGGER trg_condominio_conta_padrao
    BEFORE INSERT ON public.internal_transactions
    FOR EACH ROW EXECUTE FUNCTION public.fn_condominio_conta_padrao();
