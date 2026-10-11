-- Uma unidade, um contrato ativo — agora também no BANCO (11/10/2026)
--
-- Bug: Comercial › Venda de Ativos › Negociações mostrava duas negociações
-- (0010 e 0011) para a mesma unidade 42 do Bella Vista e o mesmo cliente.
-- As duas linhas eram idênticas e foram inseridas com 13 ms de diferença
-- (23/09/2026 20:39:25) — o formulário foi enviado duas vezes em paralelo.
--
-- A regra "uma unidade, um contrato ativo" só existia no navegador
-- (commercialService.assertUnitsAvailable): LÊ se há negociação ativa e,
-- noutra ida ao servidor, INSERE. Dois envios simultâneos leem "livre" os
-- dois e gravam os dois. O DealModal ganhou trava de envio duplo, mas isso
-- só cobre aquele botão — outra aba, outro usuário ou outro caminho de
-- gravação passam do mesmo jeito.
--
-- Esta trava serializa por UNIDADE (advisory lock da transação) e confere de
-- novo depois de esperar: o segundo insert só lê depois que o primeiro
-- terminou, e aí o vê. Mesma regra do assertUnitsAvailable — qualquer
-- negociação com status <> 'CANCELLED' segura a unidade, venha ela por
-- commercial_deals.property_id (unidade principal) ou por
-- commercial_deal_units (contrato com várias unidades).
--
-- UPDATE só confere quando a unidade TROCA ou a negociação sai de CANCELLED:
-- o saveDeal regrava property_id em toda edição, e o upsert de
-- commercial_deal_units dispara BEFORE INSERT mesmo quando a linha já existe —
-- por isso a negociação nunca conflita consigo mesma.
--
-- Medido antes (11/10/2026): o único conflito no banco inteiro é a unidade 42
-- (0010 × 0011). Limpo no mesmo arquivo, abaixo, antes dos gatilhos — senão a
-- negociação que fica passaria a falhar ao gravar as unidades. Decisão do
-- usuário: sai a 0011 (CONTRATO), fica a 0010 (RESERVA). Nenhuma das duas tem
-- parcela, contrato, documento, pós-venda ou análise de crédito. Cópia
-- completa em public.negociacao_duplicada_reversao_20261011 (RLS ligada, sem
-- grant — não apagar).
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`.
-- Idempotente.

BEGIN;

-- ── 1. Limpeza da duplicata 0011 ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.negociacao_duplicada_reversao_20261011 (
    id          bigserial PRIMARY KEY,
    tabela      text NOT NULL,
    linha       jsonb NOT NULL,
    removido_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.negociacao_duplicada_reversao_20261011 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.negociacao_duplicada_reversao_20261011 FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    v_dup  constant uuid := 'de2e1f9c-7c4a-4c54-8ca5-5358176cc866';  -- 0011 (CONTRATO) — sai
    v_fica constant uuid := '4d0318f9-61e4-4f36-89e6-c40ac8ff5d4d';  -- 0010 (RESERVA)  — fica
BEGIN
    IF NOT EXISTS (SELECT 1 FROM commercial_deals WHERE id = v_dup) THEN
        RAISE NOTICE 'Duplicata 0011 já removida — nada a limpar.';
        RETURN;
    END IF;

    -- Trava: só apaga se continuar sendo a duplicata medida — a mesma unidade
    -- e o mesmo cliente da 0010, e nada pendurado nela.
    IF NOT EXISTS (
        SELECT 1 FROM commercial_deals a JOIN commercial_deals b ON b.id = v_fica
         WHERE a.id = v_dup
           AND a.property_id = b.property_id
           AND a.client_id = b.client_id
           AND b.status <> 'CANCELLED'
    ) THEN
        RAISE EXCEPTION 'A 0011 não é mais duplicata da 0010 — conferir à mão antes de apagar.';
    END IF;
    IF EXISTS (SELECT 1 FROM contracts WHERE deal_id = v_dup)
       OR EXISTS (SELECT 1 FROM commercial_post_sales WHERE deal_id = v_dup)
       OR EXISTS (SELECT 1 FROM deal_credit_analysis WHERE deal_id = v_dup)
       OR EXISTS (SELECT 1 FROM internal_transactions WHERE reference_id LIKE v_dup::text || '%') THEN
        RAISE EXCEPTION 'A 0011 ganhou contrato/parcela/pós-venda/análise depois da medição — conferir à mão.';
    END IF;

    INSERT INTO public.negociacao_duplicada_reversao_20261011 (tabela, linha)
    SELECT 'commercial_deal_units', to_jsonb(u) FROM commercial_deal_units u WHERE u.deal_id = v_dup
    UNION ALL
    SELECT 'commercial_deal_buyers', to_jsonb(b) FROM commercial_deal_buyers b WHERE b.deal_id = v_dup
    UNION ALL
    SELECT 'commercial_deal_code_history', to_jsonb(h) FROM commercial_deal_code_history h WHERE h.deal_id = v_dup
    UNION ALL
    SELECT 'commercial_property_status_events', to_jsonb(e) FROM commercial_property_status_events e WHERE e.deal_id = v_dup
    UNION ALL
    SELECT 'commercial_deals', to_jsonb(d) FROM commercial_deals d WHERE d.id = v_dup;

    DELETE FROM commercial_deal_units             WHERE deal_id = v_dup;
    DELETE FROM commercial_deal_buyers            WHERE deal_id = v_dup;
    DELETE FROM commercial_deal_code_history      WHERE deal_id = v_dup;
    DELETE FROM commercial_property_status_events WHERE deal_id = v_dup;
    DELETE FROM commercial_deals                  WHERE id      = v_dup;

    -- A unidade 42 NÃO é tocada: segue RESERVED para o mesmo cliente, que é
    -- o estado certo para a 0010 em RESERVA.
END $$;

-- ── 2. A trava ────────────────────────────────────────────────────────────

-- Há negociação ativa, que não seja p_deal_id, segurando a unidade?
-- Devolve o código (ou id) dela para a mensagem; NULL = livre.
-- Espera o lock da unidade antes de olhar — é isso que fecha a corrida.
CREATE OR REPLACE FUNCTION public.fn_negociacao_unidade_ocupada(p_property_id uuid, p_deal_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_outra text;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('commercial_unit:' || p_property_id::text, 0));

    SELECT COALESCE(d.code, d.id::text) INTO v_outra
      FROM commercial_deals d
     WHERE d.id IS DISTINCT FROM p_deal_id
       AND d.status IS DISTINCT FROM 'CANCELLED'
       AND (d.property_id = p_property_id
            OR EXISTS (SELECT 1 FROM commercial_deal_units u
                        WHERE u.deal_id = d.id AND u.property_id = p_property_id))
     ORDER BY d.created_at
     LIMIT 1;

    RETURN v_outra;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_negociacao_unidade_ocupada(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Mensagem igual à do assertUnitsAvailable: é ela que o DealModal mostra.
CREATE OR REPLACE FUNCTION public.fn_raise_unidade_ocupada(p_property_id uuid, p_outra text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nome text;
BEGIN
    SELECT name INTO v_nome FROM commercial_properties WHERE id = p_property_id;
    RAISE EXCEPTION 'Já existe contrato ativo para: % (negociação %). Cancele o contrato atual (ou remova a unidade dele) antes de prosseguir.',
        COALESCE(v_nome, 'unidade'), p_outra
        USING ERRCODE = 'unique_violation';
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_raise_unidade_ocupada(uuid, text) FROM PUBLIC, anon, authenticated;

-- commercial_deals: unidade principal.
CREATE OR REPLACE FUNCTION public.trg_fn_negociacao_unidade_unica_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_outra text;
BEGIN
    IF NEW.property_id IS NULL OR NEW.status IS NOT DISTINCT FROM 'CANCELLED' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.property_id IS NOT DISTINCT FROM OLD.property_id
       AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
        RETURN NEW;  -- mesma unidade, já ativa: edição comum
    END IF;

    v_outra := public.fn_negociacao_unidade_ocupada(NEW.property_id, NEW.id);
    IF v_outra IS NOT NULL THEN
        PERFORM public.fn_raise_unidade_ocupada(NEW.property_id, v_outra);
    END IF;
    RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_negociacao_unidade_unica_deal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_negociacao_unidade_unica ON public.commercial_deals;
CREATE TRIGGER trg_negociacao_unidade_unica
    BEFORE INSERT OR UPDATE OF property_id, status ON public.commercial_deals
    FOR EACH ROW EXECUTE FUNCTION public.trg_fn_negociacao_unidade_unica_deal();

-- commercial_deal_units: demais unidades de um contrato com várias.
CREATE OR REPLACE FUNCTION public.trg_fn_negociacao_unidade_unica_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_outra text;
BEGIN
    IF NEW.property_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.property_id IS NOT DISTINCT FROM OLD.property_id
       AND NEW.deal_id IS NOT DISTINCT FROM OLD.deal_id THEN
        RETURN NEW;
    END IF;
    -- Item de negociação cancelada não segura nada.
    IF EXISTS (SELECT 1 FROM commercial_deals WHERE id = NEW.deal_id AND status = 'CANCELLED') THEN
        RETURN NEW;
    END IF;

    v_outra := public.fn_negociacao_unidade_ocupada(NEW.property_id, NEW.deal_id);
    IF v_outra IS NOT NULL THEN
        PERFORM public.fn_raise_unidade_ocupada(NEW.property_id, v_outra);
    END IF;
    RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_negociacao_unidade_unica_item() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_negociacao_unidade_unica_item ON public.commercial_deal_units;
CREATE TRIGGER trg_negociacao_unidade_unica_item
    BEFORE INSERT OR UPDATE OF property_id, deal_id ON public.commercial_deal_units
    FOR EACH ROW EXECUTE FUNCTION public.trg_fn_negociacao_unidade_unica_item();

COMMIT;
