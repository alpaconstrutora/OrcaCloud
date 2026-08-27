-- Re-aponta contracts.category_id da `chart_of_accounts` legada (tabela de
-- 2026-02, anterior à existência de `financial_categories`) para a
-- `financial_categories` atual — fonte de verdade da dimensão "Conta
-- Financeira" desde 2026-07 (ver [[centro-custo-vs-plano-de-contas-canonico]]).
--
-- Sintoma: ContractModal.tsx carrega o dropdown "Conta Financeira" via
-- financialRegistryService.listChartOfAccounts(), que já consulta
-- `financial_categories` (apesar do nome). Ao salvar, o id enviado nunca
-- existe em `chart_of_accounts`, e o insert/update falha com 23503
-- (contracts_category_id_fkey). Nenhuma tela grava mais em `chart_of_accounts`
-- desde então, então nulamos os valores antigos em vez de tentar migrá-los —
-- mesmo padrão de 20270822000003_contracts_cost_center_v2_fk.sql.
--
-- ⚠️ RE-EXECUTÁVEL (corrigido em 2026-08-22). A primeira versão terminava num
-- `ADD CONSTRAINT` cru e, rodada de novo, morria em
-- `42710: constraint "contracts_category_id_financial_categories_fkey" ...
-- already exists`. Dois problemas nisso, e o segundo é o grave:
--
--   1. O erro parecia "a migration falhou" quando na verdade ela JÁ TINHA
--      passado — o estado do banco estava certo e o operador não tinha como
--      saber sem ir no catálogo.
--   2. O `UPDATE ... SET category_id = NULL` vinha ANTES do passo que
--      quebrava. No SQL Editor o script inteiro roda numa transação implícita,
--      então o erro desfazia tudo — mas quem rodasse os comandos SOLTOS, um a
--      um, apagaria as contas financeiras que os usuários preencheram desde a
--      primeira execução. O UPDATE abaixo agora só limpa ÓRFÃO, não tudo.
--
-- lock_timeout curto: se colidir com uma transação em andamento, falha rápido
-- (55P03) em vez de segurar lock. Repita a migration se falhar.
SET lock_timeout = '5s';

-- Só os valores que não existem no destino. Na primeira execução isso é o
-- mesmo conjunto de antes (id de `chart_of_accounts` não existe em
-- `financial_categories`); nas seguintes, preserva o que já foi preenchido
-- direito pela tela.
UPDATE public.contracts c
   SET category_id = NULL
 WHERE c.category_id IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM public.financial_categories f WHERE f.id = c.category_id
   );

-- Derruba a FK antiga (a que aponta para `chart_of_accounts`), se ainda houver.
DO $$
DECLARE
    v_conname text;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.contracts'::regclass
      AND contype = 'f'
      AND confrelid = 'public.chart_of_accounts'::regclass
      AND conkey = (
          SELECT array_agg(attnum) FROM pg_attribute
          WHERE attrelid = 'public.contracts'::regclass AND attname = 'category_id'
      );
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.contracts DROP CONSTRAINT %I', v_conname);
    END IF;
END $$;

-- Cria a nova só se ela ainda não existir. O teste é pelo ALVO da FK, não pelo
-- nome: uma constraint com o mesmo nome apontando para outro lugar é problema
-- diferente, e passar batido por ela seria pior do que estourar.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.contracts'::regclass
          AND contype = 'f'
          AND confrelid = 'public.financial_categories'::regclass
          AND conkey = (
              SELECT array_agg(attnum) FROM pg_attribute
              WHERE attrelid = 'public.contracts'::regclass AND attname = 'category_id'
          )
    ) THEN
        ALTER TABLE public.contracts
            ADD CONSTRAINT contracts_category_id_financial_categories_fkey
            FOREIGN KEY (category_id) REFERENCES public.financial_categories(id)
            ON DELETE SET NULL;
    END IF;
END $$;

RESET lock_timeout;
