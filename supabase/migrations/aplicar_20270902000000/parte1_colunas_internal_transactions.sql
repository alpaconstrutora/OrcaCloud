-- ═════════════════════════════════════════════════════════════════════════════
-- OPEX por imóvel — PARTE 1 de 4: dimensão imóvel em `internal_transactions`
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ RODAR CADA PARTE SEPARADAMENTE, uma por vez, esperando a anterior terminar.
--
-- `internal_transactions` é a tabela mais quente do financeiro: 84 usos diretos
-- nos services, mais `vw_payables`, `vw_receivables`, partida dobrada e a
-- trigger `trg_strip_system_project_from_internal_tx`. DDL aqui deadlocka se
-- pegar muitos locks numa transação só (mesma armadilha de Garantias F1 e da
-- Fase 1). Por isso cada parte roda sozinha, com `lock_timeout`.
--
-- ── Por que esta coluna existe ───────────────────────────────────────────────
-- A despesa hoje é apropriada por obra e centro de custo. A tabela tem
-- `project_id`, `cost_center_id`, `plano_de_contas_id`, `contract_id`,
-- `supplier_id`, `category_id` — e nenhuma dimensão de IMÓVEL. Um IPTU de
-- apartamento não tem onde pousar. (`commercial_properties.iptu_registration` é
-- só o número da inscrição, não o valor.)
--
-- Sem esta coluna, NOI, margem NOI, cap rate e yield líquido são impossíveis —
-- ou seja, todo indicador de "quanto RENDE" fica fora de alcance e só sobra
-- "quanto FATURA".
-- Plano: docs/planos/2026-08-06-kpis-locacao-primitivas.md (Fase 2).

SET lock_timeout = '5s';

-- Imóvel ao qual a despesa foi LANÇADA. É a intenção do usuário; a apropriação
-- efetiva (que pode ser rateada entre as unidades) vive em
-- `property_expense_allocations`, criada na parte 2.
ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS property_id UUID
    REFERENCES public.commercial_properties(id) ON DELETE SET NULL;

-- DIRECT   = fica no imóvel lançado.
-- PRORATED = rateia entre as unidades filhas.
-- Decisão do usuário (2026-08-06): "as duas opções, usuário decide". Não é
-- regra fixa do produto — condomínio de área comum pode fazer sentido rateado,
-- seguro predial pode fazer sentido parado no edifício. Quem sabe é quem lança.
ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS property_allocation_mode TEXT NOT NULL DEFAULT 'DIRECT';

DO $$ BEGIN
    ALTER TABLE public.internal_transactions
        ADD CONSTRAINT internal_transactions_property_alloc_mode_chk
        CHECK (property_allocation_mode IN ('DIRECT', 'PRORATED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice PARCIAL: a esmagadora maioria dos lançamentos não tem imóvel, e não
-- faz sentido carregá-los no índice.
CREATE INDEX IF NOT EXISTS idx_internal_tx_property
    ON public.internal_transactions (property_id)
    WHERE property_id IS NOT NULL;

COMMENT ON COLUMN public.internal_transactions.property_id IS
    'Imovel ao qual a despesa foi lancada. A apropriacao efetiva (com rateio) vive em property_expense_allocations.';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'internal_transactions'
--    AND column_name IN ('property_id', 'property_allocation_mode');
--
-- Lançamento antigo tem de continuar válido, com o modo DIRECT herdado:
-- SELECT property_allocation_mode, count(*)
--   FROM public.internal_transactions GROUP BY 1;
