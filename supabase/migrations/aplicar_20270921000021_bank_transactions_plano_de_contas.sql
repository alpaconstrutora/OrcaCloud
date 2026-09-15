-- ==========================================================================
-- Financeiro · Extrato Bancário · Plano de Contas
-- Date: 2026-09-14
-- Tabela: public.bank_transactions
-- ==========================================================================
-- CONTEXTO
-- O movimento do extrato já podia ser classificado por Obra (project_id) e
-- Centro de Custo (cost_center_id), mas não pela terceira dimensão contábil.
-- Pedido do usuário em 2026-09-14: "financeiro < extrato bancário: incluir
-- coluna plano de contas na tabela".
--
-- São três dimensões DIFERENTES — ver 20270822000013_restore_plano_de_contas.sql:
--   • Centro de Custo  → cost_centers_v2   (Minha Organização > Centro de Custo)
--   • Plano de Contas  → plano_de_contas   (Minha Organização > Plano de Contas)
--   • Categoria        → texto livre em bank_transactions.category
-- Nunca tratar como sinônimos.
--
-- Mesmo desenho de internal_transactions.plano_de_contas_id (20270846000000):
-- ON DELETE SET NULL — apagar uma conta do plano não apaga o extrato, só o
-- desclassifica.
--
-- Sem policy nova: a tabela já tem RLS por organization_id e a coluna é só um
-- atributo da linha. Sem função nova (REGRA #7 não se aplica).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + FK criada só se não existir.
-- ==========================================================================
SET lock_timeout = '5s';

ALTER TABLE public.bank_transactions
    ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bank_transactions_plano_de_contas_id_fkey'
          AND conrelid = 'public.bank_transactions'::regclass
    ) THEN
        ALTER TABLE public.bank_transactions
            ADD CONSTRAINT bank_transactions_plano_de_contas_id_fkey
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_plano_de_contas
    ON public.bank_transactions (plano_de_contas_id)
    WHERE plano_de_contas_id IS NOT NULL;

COMMENT ON COLUMN public.bank_transactions.plano_de_contas_id IS
    'Plano de Contas (public.plano_de_contas) atribuído ao movimento do extrato — dimensão distinta de cost_center_id e de category.';
