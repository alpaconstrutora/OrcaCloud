-- ═══════════════════════════════════════════════════════════════════════════
-- SÉRIE ÚNICA DE PARCELAS — `deal_installments`
--
-- Pedido do usuário (2026-08-01), em Comercial > Locações > Gestão de Unidades
-- > Gerenciar Negociação > aba Parcelas:
--   "as parcelas do plano de pagamento que eram para ser apenas para o fim de
--    proposta acabou sendo publicada no contas a receber. Isso gera enorme
--    confusão e frustração. Para evitarmos isso, excluir completamente essas
--    parcelas e usarmos apenas uma tabela de parcelas, a mesma usada para
--    propostas e a mesma que será usada em contrato. Criar botão para envio ao
--    contas a receber."
--
-- Até aqui o mesmo dado vivia em TRÊS lugares:
--   1. commercial_deals.custom_installments  (JSONB — plano da negociação)
--   2. broker_portal_proposals.payment_plan  (JSONB — proposta do corretor)
--   3. internal_transactions                 (linhas soltas do contrato)
-- e o (1) era materializado AUTOMATICAMENTE em Contas a Receber por
-- commercialService.saveDeal assim que o negócio saía de IN_NEGOTIATION.
--
-- Esta tabela é a série única. Publicar em Contas a Receber passa a ser uma
-- AÇÃO EXPLÍCITA (published_at + financial_entry_id), nunca um efeito colateral
-- de salvar a negociação.
--
-- A ENTRADA vira LINHA (sequence = 0, installment_type = 'ENTRADA'). Era o
-- único item do plano que não estava no array (vivia nos campos soltos
-- down_payment*), e por isso não tinha desconto, não entrava na edição em lote
-- e não tinha situação própria. commercial_deals.down_payment NÃO é removida —
-- vira espelho derivado, mantido pelo dealInstallmentService.
--
-- ⚠️ DDL com FK em tabela quente deadlocka neste banco (commercial_deals e
-- internal_transactions são quentes). Por isso: cria a tabela SEM FK e adiciona
-- cada constraint depois, com lock_timeout curto. Idempotente do começo ao fim.
-- ⚠️ NUNCA `supabase db push` — aplicar à mão no SQL Editor, em partes
-- separadas se der 40P01 (deadlock).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabela (sem FK — nenhum lock em tabela quente aqui) ──────────────────
CREATE TABLE IF NOT EXISTS public.deal_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,

    -- ORIGEM: de onde a parcela nasceu. A mesma LINHA acompanha o ciclo
    -- proposta → negociação → contrato; o que muda é o dono, não o registro.
    deal_id UUID,
    proposal_id UUID,
    contract_id UUID,
    source TEXT NOT NULL DEFAULT 'DEAL'
        CHECK (source IN ('DEAL', 'PROPOSAL', 'CONTRACT_RENEWAL')),

    -- PLANO (espelho 1:1 de PaymentInstallment — types/financial.ts)
    sequence INTEGER NOT NULL DEFAULT 0,          -- 0 = ENTRADA
    due_date DATE NOT NULL,
    original_amount NUMERIC(15,2),                -- bruto (pré-desconto)
    discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('VALUE', 'PERCENT')),
    discount_amount NUMERIC(15,2),
    amount NUMERIC(15,2) NOT NULL DEFAULT 0,      -- líquido = o que será cobrado
    installment_type TEXT,                        -- ENTRADA|SINAL|MENSAL|TRIMESTRAL|...
    payment_type TEXT,                            -- PIX|TED|DOC|DINHEIRO|CHEQUE|PERMUTA
    description TEXT,
    notes TEXT,
    cost_center_id UUID,
    plano_de_contas_id UUID,

    -- PUBLICAÇÃO — o que o botão "Enviar ao Contas a Receber" liga/desliga.
    published_at TIMESTAMPTZ,
    published_by UUID,
    unpublished_at TIMESTAMPTZ,
    financial_entry_id UUID,                      -- internal_transactions.id
    -- Chave idempotente do upsert em internal_transactions
    -- (onConflict 'organization_id,reference_id,entry_type').
    reference_id TEXT NOT NULL,

    -- ESTADO DE COBRANÇA — espelhado DE VOLTA do financeiro; read-only na UI.
    settlement_status TEXT NOT NULL DEFAULT 'NAO_LANCADA'
        CHECK (settlement_status IN ('NAO_LANCADA', 'LANCADA', 'RECEBIDA', 'CANCELADA')),
    paid_at DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Unicidade e índices ─────────────────────────────────────────────────
-- reference_id é a chave do upsert no financeiro: tem que ser única na org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_inst_org_ref
    ON public.deal_installments(organization_id, reference_id);
CREATE INDEX IF NOT EXISTS idx_deal_inst_deal     ON public.deal_installments(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_inst_proposal ON public.deal_installments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_deal_inst_contract ON public.deal_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_deal_inst_org      ON public.deal_installments(organization_id);
CREATE INDEX IF NOT EXISTS idx_deal_inst_pub      ON public.deal_installments(organization_id, published_at);
CREATE INDEX IF NOT EXISTS idx_deal_inst_entry    ON public.deal_installments(financial_entry_id);

-- NÃO existe UNIQUE em (deal_id, sequence): "Parcela avulsa na posição N"
-- renumera o bloco inteiro (DealModal.handleInsertInstallmentAt) e um unique
-- quebraria no meio do UPDATE. `sequence` é ORDEM, não identidade.

ALTER TABLE public.deal_installments DROP CONSTRAINT IF EXISTS deal_inst_origin_chk;
ALTER TABLE public.deal_installments ADD CONSTRAINT deal_inst_origin_chk
    CHECK (deal_id IS NOT NULL OR proposal_id IS NOT NULL);

-- ── 3. FKs — uma por vez, com lock_timeout curto (< deadlock_timeout).
--    Se não conseguir o lock agora, a migration NÃO falha: a tabela funciona
--    sem a FK e o bloco pode ser reexecutado.
--    Sem FK para `organizations`: tabela quente, e a RLS já protege.
DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_installments_deal_fk') THEN
        ALTER TABLE public.deal_installments
            ADD CONSTRAINT deal_installments_deal_fk
            FOREIGN KEY (deal_id) REFERENCES public.commercial_deals(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK deal_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_installments_proposal_fk') THEN
        ALTER TABLE public.deal_installments
            ADD CONSTRAINT deal_installments_proposal_fk
            FOREIGN KEY (proposal_id) REFERENCES public.broker_portal_proposals(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK proposal_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_installments_contract_fk') THEN
        ALTER TABLE public.deal_installments
            ADD CONSTRAINT deal_installments_contract_fk
            FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK contract_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

-- CRÍTICO: SET NULL, nunca CASCADE. Apagar o lançamento em Contas a Receber
-- não pode apagar a parcela do PLANO — ela só volta para "Não lançada".
DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_installments_entry_fk') THEN
        ALTER TABLE public.deal_installments
            ADD CONSTRAINT deal_installments_entry_fk
            FOREIGN KEY (financial_entry_id) REFERENCES public.internal_transactions(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK financial_entry_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_installments_cost_center_fk') THEN
        ALTER TABLE public.deal_installments
            ADD CONSTRAINT deal_installments_cost_center_fk
            FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK cost_center_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_installments_plano_contas_fk') THEN
        ALTER TABLE public.deal_installments
            ADD CONSTRAINT deal_installments_plano_contas_fk
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK plano_de_contas_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

-- ── 4. updated_at ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_deal_installments_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deal_installments_updated_at ON public.deal_installments;
CREATE TRIGGER trg_deal_installments_updated_at
    BEFORE UPDATE ON public.deal_installments
    FOR EACH ROW EXECUTE FUNCTION public.fn_deal_installments_touch_updated_at();

-- ── 5. RLS — mesmo padrão de commercial_deal_units. Somente `authenticated`.
--    O Portal do Corretor e a PublicProposalView rodam como `anon` e NÃO
--    recebem grant aqui: o acesso delas é por RPC SECURITY DEFINER.
ALTER TABLE public.deal_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable access to organization members" ON public.deal_installments;
CREATE POLICY "Enable access to organization members" ON public.deal_installments
    FOR ALL TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.commercial_deals d
            WHERE d.id = deal_installments.deal_id
              AND public.is_org_member(d.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    )
    WITH CHECK (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.commercial_deals d
            WHERE d.id = deal_installments.deal_id
              AND public.is_org_member(d.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

REVOKE ALL ON public.deal_installments FROM PUBLIC;
REVOKE ALL ON public.deal_installments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_installments TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL — idempotente (ON CONFLICT DO NOTHING / UPDATE reexecutável)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 6.1 Parcelas do array custom_installments ──────────────────────────────
-- Adota o reference_id LEGADO ('tx-{deal}-custom-p{n}'), o mesmo que
-- commercialFinanceService já usava: assim o passo 6.3 consegue casar com o
-- que já está em internal_transactions, e republicar não duplica.
INSERT INTO public.deal_installments (
    organization_id, deal_id, source, sequence, due_date,
    amount, original_amount, discount_type, discount_amount,
    installment_type, payment_type, description, notes,
    cost_center_id, plano_de_contas_id, reference_id, settlement_status)
SELECT d.organization_id,
       d.id,
       'DEAL',
       ci.ord::int,
       COALESCE(NULLIF(ci.item->>'dueDate', '')::date, d.date, CURRENT_DATE),
       COALESCE(NULLIF(ci.item->>'value', '')::numeric, 0),
       NULLIF(ci.item->>'originalValue', '')::numeric,
       NULLIF(ci.item->>'discountType', ''),
       NULLIF(ci.item->>'discountAmount', '')::numeric,
       COALESCE(NULLIF(ci.item->>'installmentType', ''), 'MENSAL'),
       NULLIF(ci.item->>'paymentType', ''),
       NULLIF(ci.item->>'description', ''),
       NULLIF(ci.item->>'notes', ''),
       d.cost_center_id,
       d.plano_de_contas_id,
       'tx-' || d.id::text || '-custom-p' || ci.ord::text,
       'NAO_LANCADA'
FROM public.commercial_deals d
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(d.custom_installments) = 'array'
         THEN d.custom_installments ELSE '[]'::jsonb END
) WITH ORDINALITY AS ci(item, ord)
WHERE d.organization_id IS NOT NULL
ON CONFLICT (organization_id, reference_id) DO NOTHING;

-- ── 6.2 Entrada vira linha (sequence 0) ────────────────────────────────────
INSERT INTO public.deal_installments (
    organization_id, deal_id, source, sequence, due_date,
    amount, installment_type, payment_type, description, notes,
    cost_center_id, plano_de_contas_id, reference_id, settlement_status)
SELECT d.organization_id,
       d.id,
       'DEAL',
       0,
       -- mesma data que commercialFinanceService usava para a Entrada (deal.date)
       COALESCE(d.date, CURRENT_DATE),
       d.down_payment,
       COALESCE(NULLIF(d.down_payment_installment_type, ''), 'ENTRADA'),
       NULLIF(d.down_payment_payment_type, ''),
       'Receita: ' || CASE WHEN d.type = 'SALE' THEN 'Venda' ELSE 'Aluguel' END || ' - Sinal (Entrada)',
       NULLIF(d.down_payment_notes, ''),
       d.cost_center_id,
       d.plano_de_contas_id,
       'tx-' || d.id::text || '-dp',
       'NAO_LANCADA'
FROM public.commercial_deals d
WHERE COALESCE(d.down_payment, 0) > 0
  AND d.organization_id IS NOT NULL
ON CONFLICT (organization_id, reference_id) DO NOTHING;

-- ── 6.2b Série MATEMÁTICA (negócio sem plano itemizado) ────────────────────
-- Negócio que nunca teve o plano montado na aba Parcelas só tinha o campo
-- "Nº de parcelas": o antigo syncDealToFinance gerava `tx-{deal}-p{i}` na hora
-- (CASO 3, um mês entre parcelas). Sem este bloco essas linhas não existiriam
-- na série única e a limpeza (20270849000001) as apagaria sem deixar nada no
-- lugar — o usuário teria que remontar o plano do zero.
-- Fórmula idêntica à do código: locação NÃO desconta a entrada do total.
INSERT INTO public.deal_installments (
    organization_id, deal_id, source, sequence, due_date,
    amount, installment_type, description,
    cost_center_id, plano_de_contas_id, reference_id, settlement_status)
SELECT d.organization_id,
       d.id,
       'DEAL',
       g.i,
       (COALESCE(d.date, CURRENT_DATE)::date + (g.i || ' month')::interval)::date,
       ROUND(
           (COALESCE(d.value, 0) - CASE WHEN d.type = 'SALE' THEN COALESCE(d.down_payment, 0) ELSE 0 END)
           / NULLIF(d.installments, 0), 2),
       'MENSAL',
       'Receita: ' || CASE WHEN d.type = 'SALE' THEN 'Venda' ELSE 'Aluguel' END
           || ' - Parcela ' || g.i || '/' || d.installments
           || ' - Deal #' || substring(d.id::text, 1, 8),
       d.cost_center_id,
       d.plano_de_contas_id,
       'tx-' || d.id::text || '-p' || g.i::text,
       'NAO_LANCADA'
FROM public.commercial_deals d
CROSS JOIN LATERAL generate_series(1, d.installments) AS g(i)
WHERE d.organization_id IS NOT NULL
  AND COALESCE(d.installments, 0) > 0
  -- só quem NÃO tem plano itemizado: com custom_installments, quem manda é 6.1
  AND (d.custom_installments IS NULL
       OR jsonb_typeof(d.custom_installments) <> 'array'
       OR jsonb_array_length(d.custom_installments) = 0)
ON CONFLICT (organization_id, reference_id) DO NOTHING;

-- ── 6.3 Adoção do que JÁ está em Contas a Receber ──────────────────────────
-- Sem este passo, a migration de limpeza (20270849000001) apagaria dinheiro
-- real: parcela conciliada/recebida tem que nascer marcada como publicada.
--
-- ⚠️ Adota SOMENTE o que está liquidado (CONCILIATED / RECEBIDO / PAGO).
-- Adotar também as PREVISTO seria o erro oposto: elas são justamente o passivo
-- que a limpeza tem que remover, e marcá-las como `published_at` as colocaria
-- na whitelist do 20270849000001 — a PARTE B não apagaria absolutamente nada.
-- Parcela PREVISTO nasce NAO_LANCADA (já é o default): some de Contas a Receber
-- na limpeza, mas SOBREVIVE como plano, pronta para um clique em "Enviar ao
-- Contas a Receber" quando o negócio de fato fechar.
UPDATE public.deal_installments di
   SET published_at       = COALESCE(di.published_at, it.created_at, NOW()),
       financial_entry_id = it.id,
       settlement_status  = 'RECEBIDA'
  FROM public.internal_transactions it
 WHERE it.organization_id = di.organization_id
   AND it.reference_id    = di.reference_id
   AND it.direction       = 'CREDIT'
   AND it.status IS DISTINCT FROM 'CANCELLED'
   AND (it.status = 'CONCILIATED'
        OR COALESCE(it.business_status, '') IN ('RECEBIDO', 'PAGO'));

-- ── 7. Documentação e depreciação do JSONB ─────────────────────────────────
COMMENT ON TABLE public.deal_installments IS
    'SÉRIE ÚNICA de parcelas do eixo comercial: a MESMA linha atravessa proposta '
    '(proposal_id) → negociação (deal_id) → contrato (contract_id). Publicar em '
    'Contas a Receber é ação EXPLÍCITA (published_at + financial_entry_id), nunca '
    'efeito colateral de salvar a negociação. A Entrada é a linha sequence = 0.';

COMMENT ON COLUMN public.deal_installments.reference_id IS
    'Chave idempotente do upsert em internal_transactions '
    '(onConflict organization_id,reference_id,entry_type). Adota os ids legados '
    'tx-{dealId}-custom-p{n} / tx-{dealId}-dp para o backfill casar com o que já '
    'estava publicado.';

COMMENT ON COLUMN public.deal_installments.settlement_status IS
    'NAO_LANCADA (só no plano) | LANCADA (em Contas a Receber, previsto) | '
    'RECEBIDA (baixada/conciliada — não pode ser editada nem removida pela '
    'negociação) | CANCELADA. Espelho do financeiro; a UI trata como read-only.';

COMMENT ON COLUMN public.commercial_deals.custom_installments IS
    'DEPRECADA (2026-08-01) — espelho de leitura de deal_installments, mantido '
    'por 2 releases porque contractService.createFromDeal, o PDF da proposta e o '
    'BI ainda leem daqui. Fonte da verdade: deal_installments. Não escrever '
    'direto: use dealInstallmentService.';
