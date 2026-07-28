-- ═════════════════════════════════════════════════════════════════════════════
-- Garantias Locatícias F1 — PARTE 1 de 5: colunas em `contract_guarantees`
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ RODAR CADA PARTE SEPARADAMENTE, uma por vez, esperando a anterior terminar.
--
-- Por quê: o script único deu `40P01 deadlock detected`. O editor SQL roda tudo
-- numa transação só, então os locks das tabelas novas ficam segurados enquanto
-- a transação AINDA espera AccessExclusiveLock numa tabela antiga e quente
-- (`organizations`/`contracts`) — e qualquer processo concorrente (PostgREST
-- recarregando o cache de schema, uma query da aplicação) fecha o ciclo.
-- Rodando em pedaços, cada transação pega poucos locks e os solta rápido.
--
-- `lock_timeout` faz a parte FALHAR em 5s em vez de ficar pendurada esperando —
-- deadlock vira "tente de novo", não trava de banco. Se der timeout, é só
-- reexecutar (tudo aqui é idempotente).
--
-- Esta parte toca SOMENTE `contract_guarantees`. Nenhuma FK para tabela quente.

SET lock_timeout = '5s';

-- `scope` separa o uso de OBRA (RC, ambiental — vários por contrato, legítimo)
-- do uso de LOCAÇÃO (uma única modalidade ativa, art. 43 da Lei 8.245/91).
ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'OBRA';

DO $$ BEGIN
    ALTER TABLE public.contract_guarantees
        ADD CONSTRAINT contract_guarantees_scope_chk CHECK (scope IN ('OBRA', 'LOCACAO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Eixos 2 e 3 da arquitetura: produto comercial e provedor não são a modalidade
-- jurídica. "Título de capitalização" é produto que se enquadra como CAUCAO —
-- não é uma quinta modalidade legal. (Provedor continua em `insurer`.)
ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS product_name TEXT;

ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS caucao_type TEXT;

DO $$ BEGIN
    ALTER TABLE public.contract_guarantees
        ADD CONSTRAINT contract_guarantees_caucao_type_chk
        CHECK (caucao_type IS NULL OR caucao_type IN
               ('DINHEIRO', 'BEM_MOVEL', 'BEM_IMOVEL', 'TITULOS', 'QUOTAS'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `coverage_limit` (já existia) = limite ATUAL. `guaranteed_value` = valor
-- ORIGINALMENTE garantido. Divergem depois de dedução/atualização.
ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS guaranteed_value DECIMAL(15,2);

-- Base da conferência do art. 38 (caução em dinheiro ≤ 3 aluguéis).
ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS rent_months_equivalent NUMERIC;

ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS cost_bearer TEXT;

DO $$ BEGIN
    ALTER TABLE public.contract_guarantees
        ADD CONSTRAINT contract_guarantees_cost_bearer_chk
        CHECK (cost_bearer IS NULL OR cost_bearer IN ('LOCATARIO', 'LOCADOR', 'AMBOS'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS scope_notes TEXT;

-- ── Versionamento (decisão arquitetural central) ─────────────────────────────
-- Substituir NÃO edita a linha: cria versão nova apontando para a anterior.
ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Auto-referência: o lock é na própria `contract_guarantees`, que já está
-- travada por este mesmo ALTER — não puxa tabela nova para a transação.
ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES public.contract_guarantees(id) ON DELETE SET NULL;

ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS substitution_reason TEXT;

-- `is_active` é o que a trava do art. 43 conta. NÃO é derivado de `status`:
-- uma garantia pode estar EM_ANALISE (ainda não ativa) ou LIBERADA (já não
-- ativa) e continuar sendo a versão corrente da cadeia.
ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ── Registro / averbação (caução em bem) ─────────────────────────────────────
ALTER TABLE public.contract_guarantees ADD COLUMN IF NOT EXISTS registry_office TEXT;
ALTER TABLE public.contract_guarantees ADD COLUMN IF NOT EXISTS registry_protocol TEXT;
ALTER TABLE public.contract_guarantees ADD COLUMN IF NOT EXISTS registered_at DATE;

-- ── Caução em dinheiro: conta do depósito (art. 38 §2º, caderneta de poupança).
--    O SALDO não mora aqui — é derivado do ledger (parte 2).
ALTER TABLE public.contract_guarantees ADD COLUMN IF NOT EXISTS deposit_bank TEXT;
ALTER TABLE public.contract_guarantees ADD COLUMN IF NOT EXISTS deposit_agency TEXT;
ALTER TABLE public.contract_guarantees ADD COLUMN IF NOT EXISTS deposit_account TEXT;
ALTER TABLE public.contract_guarantees ADD COLUMN IF NOT EXISTS deposit_account_holder TEXT;
ALTER TABLE public.contract_guarantees ADD COLUMN IF NOT EXISTS deposit_date DATE;

-- ── Reanálise obrigatória na renovação ───────────────────────────────────────
-- Contrato-filho nasce SEM garantia ativa. Esta flag marca a garantia do PAI
-- como "precisa ser reanalisada antes de reaproveitar".
ALTER TABLE public.contract_guarantees
    ADD COLUMN IF NOT EXISTS requires_reanalysis BOOLEAN NOT NULL DEFAULT false;

-- ── kind: acrescenta as modalidades jurídicas da locação ─────────────────────
-- SEGURO_FIANCA (locatícia) é distinto de SEGURO_GARANTIA (performance de obra).
ALTER TABLE public.contract_guarantees DROP CONSTRAINT IF EXISTS contract_guarantees_kind_check;
ALTER TABLE public.contract_guarantees
    ADD CONSTRAINT contract_guarantees_kind_check CHECK (kind IN (
        'RC_GERAL', 'RC_PROFISSIONAL', 'SEGURO_GARANTIA', 'FIANCA',
        'CAUCAO', 'EQUIPAMENTOS', 'AMBIENTAL', 'GARANTIA_ADIANTAMENTO',
        'SEM_GARANTIA', 'SEGURO_FIANCA', 'CESSAO_FIDUCIARIA'
    ));

-- ── status: estados complementares do ciclo de vida ──────────────────────────
ALTER TABLE public.contract_guarantees DROP CONSTRAINT IF EXISTS contract_guarantees_status_check;
ALTER TABLE public.contract_guarantees
    ADD CONSTRAINT contract_guarantees_status_check CHECK (status IN (
        'VIGENTE', 'VENCIDA', 'CANCELADA', 'SUBSTITUIDA',
        'EM_ANALISE', 'PENDENTE_DOCUMENTOS', 'PENDENTE_ASSINATURA',
        'PENDENTE_REGISTRO', 'EM_RENOVACAO', 'INSUFICIENTE',
        'LIBERADA', 'DEVOLVIDA'
    ));

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_supersedes
    ON public.contract_guarantees (supersedes_id) WHERE supersedes_id IS NOT NULL;

-- A trava do art. 43 (índice único parcial) fica na PARTE 4, depois do
-- backfill — criá-la aqui abortaria se alguma locação legada já tivesse duas.
