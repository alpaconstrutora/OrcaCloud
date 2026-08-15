-- ============================================================================
-- Contas a Pagar — FECHAMENTO POR CENTRO DE CUSTO
-- Plano: docs/planos/2026-08-14-fechamento-por-centro-de-custo.md
--
-- Fechar uma competência é dizer: os títulos a pagar com vencimento neste mês,
-- nesta organização, não mudam mais. O consolidado por Centro de Custo vira um
-- RETRATO CONGELADO, e o banco passa a recusar INSERT/UPDATE/DELETE de
-- lançamento a pagar cujo vencimento caia no mês fechado.
--
-- DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO:
--
-- 1. A trava é por (organização, competência), NÃO por centro de custo. O
--    relatório é por centro de custo; o fechamento é do mês. Fechar "só o
--    Administrativo de agosto" deixaria "o mês está fechado?" sem resposta
--    única — e é essa a pergunta que a contabilidade faz.
--
-- 2. A competência de um título sai de `due_date`, com FALLBACK para
--    `transaction_date`. Centenas de lançamentos DEBIT não têm vencimento (ver
--    ContasPagarManager.carregar); sem o fallback, eles ficariam fora de
--    qualquer fechamento e a trava teria um furo por onde alterar dado de mês
--    já fechado.
--
-- ⚠️ CONSEQUÊNCIA ASSUMIDA: a trava atinge as sincronizações automáticas. Um
-- Pedido de Compra ou Contrato de Suprimentos que tente espelhar parcela com
-- vencimento em mês fechado FALHA, com mensagem explícita. É o comportamento
-- pedido — e é por isso que existe reabertura (status REABERTO), registrada com
-- data e autor em vez de apagar a linha.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ (o SQL Editor roda o script inteiro como
-- UMA transação: erro no bloco 4 desfaz o bloco 1 sem avisar).
-- ============================================================================

-- ═══ BLOCO 1 — o fechamento da competência ══════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cost_center_closings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    /** Competência: SEMPRE o primeiro dia do mês (2026-08-01 = agosto/2026). */
    competencia      DATE NOT NULL,

    /**
     * FECHADO trava a competência. REABERTO destrava e fica na tabela de
     * propósito: apagar a linha apagaria junto a prova de que o mês esteve
     * fechado, que é justamente o que uma auditoria procura.
     */
    status           TEXT NOT NULL DEFAULT 'FECHADO'
                       CHECK (status IN ('FECHADO','REABERTO')),

    /* Totais do momento do fechamento — soma dos itens, guardada aqui para o
       cabeçalho não depender de agregação a cada leitura. */
    total_previsto   NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_pago       NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_aberto     NUMERIC(15,2) NOT NULL DEFAULT 0,
    qtd_titulos      INTEGER       NOT NULL DEFAULT 0,

    observacoes      TEXT,
    fechado_em       TIMESTAMPTZ,
    fechado_por      TEXT,
    reaberto_em      TIMESTAMPTZ,
    reaberto_por     TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Competência é mês, não dia: guardar 15/08 faria dois "agostos" diferentes.
    CONSTRAINT closing_competencia_e_primeiro_dia
        CHECK (competencia = date_trunc('month', competencia)::date),
    -- Fechado sem data deixa a trilha sem âncora temporal.
    CONSTRAINT closing_fechado_tem_data
        CHECK (status <> 'FECHADO' OR fechado_em IS NOT NULL)
);

-- UM fechamento por (org, competência) — inclusive o REABERTO, que é o mesmo
-- fechamento em outro estado, não um segundo registro. Fechar de novo é UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_cost_center_closing_competencia
    ON public.cost_center_closings(organization_id, competencia);

-- Índice que a TRIGGER do bloco 4 usa: sem ele, cada escrita em
-- internal_transactions viraria seq scan nesta tabela.
CREATE INDEX IF NOT EXISTS idx_cost_center_closings_lookup
    ON public.cost_center_closings(organization_id, competencia)
    WHERE status = 'FECHADO';

-- ═══ BLOCO 2 — o retrato por centro de custo ════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cost_center_closing_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closing_id      UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    /** NULO = a fatia "sem centro de custo". Não é lacuna a esconder: é o
     *  número que diz quanto do mês ninguém classificou. */
    cost_center_id  UUID REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL,

    /**
     * Nome CONGELADO no fechamento. Renomear ou excluir o centro de custo
     * depois não pode reescrever o passado — o retrato tem que continuar
     * legível mesmo com a FK acima já em NULL.
     */
    cost_center_name TEXT NOT NULL,

    total_previsto  NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_pago      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_aberto    NUMERIC(15,2) NOT NULL DEFAULT 0,
    qtd_titulos     INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_closing_items_closing
    ON public.cost_center_closing_items(closing_id);

-- ═══ BLOCO 3 — chave estrangeira, separada ══════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.cost_center_closing_items
  DROP CONSTRAINT IF EXISTS cost_center_closing_items_closing_fk;
ALTER TABLE public.cost_center_closing_items
  ADD CONSTRAINT cost_center_closing_items_closing_fk
  FOREIGN KEY (closing_id) REFERENCES public.cost_center_closings(id) ON DELETE CASCADE;

-- ═══ BLOCO 4 — a trava ══════════════════════════════════════════════════════
-- Mês fechado não aceita lançamento a pagar novo, alterado nem excluído.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_payable_bloqueia_competencia_fechada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_org    UUID;
    v_comp   DATE;
    v_antiga DATE;
BEGIN
    -- DELETE olha OLD; INSERT olha NEW; UPDATE tem de olhar OS DOIS, senão
    -- mover um título PARA FORA de um mês fechado passaria batido.
    IF TG_OP <> 'INSERT' THEN
        v_org    := OLD.organization_id;
        v_antiga := date_trunc('month', COALESCE(OLD.due_date, OLD.transaction_date))::date;
        IF v_antiga IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.cost_center_closings c
             WHERE c.organization_id = v_org
               AND c.competencia     = v_antiga
               AND c.status          = 'FECHADO'
        ) THEN
            RAISE EXCEPTION
                'Competência % já fechada em Contas a Pagar. Reabra o fechamento antes de alterar títulos deste mês.',
                to_char(v_antiga, 'MM/YYYY');
        END IF;
    END IF;

    IF TG_OP <> 'DELETE' THEN
        v_org  := NEW.organization_id;
        v_comp := date_trunc('month', COALESCE(NEW.due_date, NEW.transaction_date))::date;
        IF v_comp IS NOT NULL AND v_comp IS DISTINCT FROM v_antiga AND EXISTS (
            SELECT 1 FROM public.cost_center_closings c
             WHERE c.organization_id = v_org
               AND c.competencia     = v_comp
               AND c.status          = 'FECHADO'
        ) THEN
            RAISE EXCEPTION
                'Competência % já fechada em Contas a Pagar. Reabra o fechamento antes de lançar títulos neste mês.',
                to_char(v_comp, 'MM/YYYY');
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_payable_bloqueia_competencia_fechada() FROM PUBLIC;

-- `WHEN (direction = 'DEBIT')`: a trava é de Contas a PAGAR. Sem essa cláusula,
-- toda escrita de recebível pagaria o custo da checagem à toa.
DROP TRIGGER IF EXISTS trg_payable_competencia_fechada_ins ON public.internal_transactions;
CREATE TRIGGER trg_payable_competencia_fechada_ins
    BEFORE INSERT OR UPDATE ON public.internal_transactions
    FOR EACH ROW WHEN (NEW.direction = 'DEBIT')
    EXECUTE FUNCTION public.fn_payable_bloqueia_competencia_fechada();

DROP TRIGGER IF EXISTS trg_payable_competencia_fechada_del ON public.internal_transactions;
CREATE TRIGGER trg_payable_competencia_fechada_del
    BEFORE DELETE ON public.internal_transactions
    FOR EACH ROW WHEN (OLD.direction = 'DEBIT')
    EXECUTE FUNCTION public.fn_payable_bloqueia_competencia_fechada();

-- ═══ BLOCO 5 — updated_at ═══════════════════════════════════════════════════
SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS set_updated_at_cost_center_closings ON public.cost_center_closings;
CREATE TRIGGER set_updated_at_cost_center_closings BEFORE UPDATE ON public.cost_center_closings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 6 — RLS ══════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.cost_center_closings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_center_closing_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['cost_center_closings','cost_center_closing_items']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_all', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))',
            t || '_org_all', t);
        -- REVOKE FROM anon explícito: o Supabase concede SELECT a `anon` via
        -- ALTER DEFAULT PRIVILEGES, então revogar de PUBLIC sozinho não fecha.
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END LOOP;
END $$;

-- ═══ BLOCO 7 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho.
-- Esperado: tabelas=2, com_rls=2, anon_policies=0, uidx_competencia=1, triggers=2

SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'
     AND tablename IN ('cost_center_closings','cost_center_closing_items'))            AS tabelas,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity
     AND tablename IN ('cost_center_closings','cost_center_closing_items'))            AS com_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND 'anon' = ANY(roles)
     AND tablename IN ('cost_center_closings','cost_center_closing_items'))            AS anon_policies,
  (SELECT count(*) FROM pg_indexes WHERE indexname='uidx_cost_center_closing_competencia') AS uidx_competencia,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN
     ('trg_payable_competencia_fechada_ins','trg_payable_competencia_fechada_del'))    AS triggers;

-- ═══ BLOCO 8 — teste da trava (opcional, desfaz sozinho) ════════════════════
-- Prova que mês fechado recusa alteração de título a pagar. Troque o UUID da
-- organização e rode o bloco INTEIRO (o ROLLBACK no fim desfaz tudo).
--
-- BEGIN;
--   INSERT INTO public.cost_center_closings (organization_id, competencia, fechado_em, fechado_por)
--   VALUES ('<org-uuid>', date_trunc('month', CURRENT_DATE)::date, NOW(), 'teste');
--
--   -- esperado: ERRO "Competência MM/AAAA já fechada em Contas a Pagar."
--   INSERT INTO public.internal_transactions
--     (organization_id, source_system, direction, transaction_date, due_date, amount, description, status, business_status)
--   VALUES ('<org-uuid>', 'MANUAL', 'DEBIT', CURRENT_DATE, CURRENT_DATE, 1, 'teste da trava', 'PENDING', 'PREVISTO');
-- ROLLBACK;
