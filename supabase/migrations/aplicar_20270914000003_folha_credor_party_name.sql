-- ==========================================================================
-- Contas a Pagar · Origem "Folha" — preencher o Credor (party_name)
-- Date: 2026-08-23
-- Tabela: public.internal_transactions (só source_system = 'LABOR')
-- ==========================================================================
-- CONTEXTO
-- Filtrando Origem = "Folha" em Contas a Pagar, a coluna Credor vinha vazia
-- em TODAS as linhas. Não era leitura nem RLS: a coluna sai de
-- `party_name || entity_name` (services/payableService.ts:16-18, via
-- vw_payables), e os 12 pontos de inserção de `services/payrollService.ts`
-- nunca gravaram nenhum dos dois — só description/category/amount/project_id.
--
-- O produtor foi corrigido na mesma data (payrollService.ts, seção "CREDOR DAS
-- LINHAS DE FOLHA"). Esta migration cobre o passivo: as folhas JÁ
-- sincronizadas, que ninguém vai reabrir só para resincronizar.
--
-- A REGRA DE PRODUTO (a mesma do produtor)
--   • salário, adiantamento e rubricas individualizadas → o COLABORADOR;
--   • encargos patronais                                → 'INSS/FGTS';
--   • contribuições de terceiros                        → a ENTIDADE da
--     rubrica (SESI, SENAI, INCRA…), que abre a `description`;
--   • linha AGREGADA (custo por obra, custo não alocado) → a lista dos
--     colaboradores, resumida em "(+N)" a partir do quarto nome.
--
-- COMO O COLABORADOR É RECUPERADO
-- O `employee_id` nunca foi gravado em coluna nenhuma — ele só existe dentro
-- do `reference_id`, e em quatro formatos diferentes:
--
--   labor-<run>-<projeto>-<empregado>-salario|encargos|terceiros-<cod>
--   labor-<run>-indiv-<cod>-<empregado>-<projeto>
--   labor-<run>-indiv-<cod>-<empregado>
--   labor-<run>-<obra>-salario|encargos|terceiros-<cod>      (agregada)
--   labor-<run>-unallocated-salario|encargos|terceiros-<cod> (agregada)
--
-- Em vez de escrever um parser por formato, extraímos TODOS os UUIDs do
-- `reference_id` e testamos contra `employees.id`. Um id de projeto ou de
-- folha simplesmente não casa, então o teste é seguro sem saber a posição.
--
-- ⚠️ NÃO gravamos `party_id`: a coluna tem FK para `clients`
-- (`internal_txs_party_id_fkey`, migration 20261219000003) e um `employee_id`
-- ali estoura a constraint.
--
-- ⚠️ `party_type` NÃO usa 'TAX' nem nos encargos: esse valor é o
-- discriminador exclusivo de `vw_commercial_tax_payables` (20270824000010,
-- `WHERE it.party_type = 'TAX'`) e a folha inteira vazaria para Tributos a
-- Pagar. Usamos 'EMPLOYEE' e 'GOVERNMENT'.
--
-- IDEMPOTENTE: só toca linha cujo credor está vazio hoje. Rodar duas vezes
-- não muda nada na segunda; e um credor corrigido à mão depois nunca é
-- sobrescrito.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: as colunas de contraparte precisam existir ─────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'internal_transactions'
           AND column_name = 'party_name'
    ) THEN
        RAISE EXCEPTION 'ABORTADO: internal_transactions.party_name nao existe (rode 20261118000002 antes).';
    END IF;
END $$;

-- ==========================================================================
-- 1. Backfill
-- ==========================================================================

WITH alvo AS (
    SELECT
        it.id,
        it.organization_id,
        it.project_id,
        it.reference_id,
        it.category,
        it.description
      FROM public.internal_transactions it
     WHERE it.source_system = 'LABOR'
       AND it.direction     = 'DEBIT'
       -- Só o que está sem credor. Nada de sobrescrever ajuste manual.
       AND NULLIF(btrim(COALESCE(it.party_name,  '')), '') IS NULL
       AND NULLIF(btrim(COALESCE(it.entity_name, '')), '') IS NULL
),

-- 1.a. O colaborador, quando o reference_id carrega o id dele.
--      DISTINCT ON: `regexp_matches` com 'g' devolve uma linha por UUID
--      encontrado. Sem isto, um reference_id em que dois UUIDs casassem com
--      colaboradores diferentes duplicaria a linha no UPDATE.
por_colaborador AS (
    SELECT DISTINCT ON (a.id) a.id, e.name AS employee_name
      FROM alvo a
      CROSS JOIN LATERAL regexp_matches(
              a.reference_id,
              '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
              'g') AS m(uuid_txt)
      JOIN public.employees e ON e.id = (m.uuid_txt)[1]::uuid
     ORDER BY a.id, e.name
),

-- 1.b. A folha da linha agregada: primeiro UUID do reference_id é sempre o
--      `runId` (`labor-<run>-…`). Precisamos dele para achar a competência.
run_da_linha AS (
    SELECT a.id,
           (regexp_match(a.reference_id,
                '^labor-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
           ))[1]::uuid AS run_id
      FROM alvo a
     WHERE a.reference_id ~ '^labor-[0-9a-fA-F]{8}-'
),

-- 1.c. Lista de colaboradores das linhas AGREGADAS por obra. É o cruzamento
--      de quem teve resultado NAQUELA folha com quem estava alocado NAQUELA
--      obra na competência da folha — as duas condições que o produtor usa
--      para montar `summary[worksiteId].employees`.
equipe_da_obra AS (
    SELECT a.id,
           array_agg(DISTINCT e.name ORDER BY e.name) AS nomes
      FROM alvo a
      JOIN run_da_linha r     ON r.id = a.id
      JOIN public.payroll_runs pr    ON pr.id = r.run_id
      JOIN public.payroll_results pres ON pres.payroll_run_id = pr.id
      JOIN public.employee_allocations ea
             ON ea.employee_id = pres.employee_id
            AND ea.project_id  = a.project_id
            AND ea.reference_period = to_char(pr.start_date, 'YYYY-MM')
            AND COALESCE(ea.allocation_percent, 0) > 0
      JOIN public.employees e ON e.id = pres.employee_id
     WHERE a.project_id IS NOT NULL
       -- só as agregadas: as por colaborador já foram resolvidas em 1.a
       AND NOT EXISTS (SELECT 1 FROM por_colaborador pc WHERE pc.id = a.id)
     GROUP BY a.id
),

-- 1.d. Lista de colaboradores das linhas "Custo Administrativo (Não
--      Alocado)": quem teve resultado na folha e NÃO tem alocação nenhuma na
--      competência.
equipe_nao_alocada AS (
    SELECT a.id,
           array_agg(DISTINCT e.name ORDER BY e.name) AS nomes
      FROM alvo a
      JOIN run_da_linha r  ON r.id = a.id
      JOIN public.payroll_runs pr      ON pr.id = r.run_id
      JOIN public.payroll_results pres ON pres.payroll_run_id = pr.id
      JOIN public.employees e          ON e.id = pres.employee_id
     WHERE a.reference_id LIKE '%-unallocated-%'
       AND NOT EXISTS (
             SELECT 1 FROM public.employee_allocations ea
              WHERE ea.employee_id = pres.employee_id
                AND ea.reference_period = to_char(pr.start_date, 'YYYY-MM')
                AND COALESCE(ea.allocation_percent, 0) > 0
           )
     GROUP BY a.id
),

-- 1.e. Decisão final por linha. A ordem do CASE é a regra de produto:
--      encargos e terceiros ganham o órgão MESMO quando o reference_id traz
--      um colaborador — o credor é quem recebe, não por causa de quem.
decidido AS (
    SELECT
        a.id,
        CASE
            WHEN a.category = 'Encargos Patronais'
                THEN 'INSS/FGTS'
            WHEN a.category = 'Contribuições de Terceiros'
                -- description = '<Entidade> (1,0%) - <resto>'
                THEN COALESCE(
                        NULLIF(btrim(split_part(COALESCE(a.description, ''), ' (', 1)), ''),
                        'Contribuições de Terceiros')
            WHEN pc.employee_name IS NOT NULL
                THEN pc.employee_name
            WHEN COALESCE(eo.nomes, ena.nomes) IS NOT NULL
                THEN CASE
                        WHEN array_length(COALESCE(eo.nomes, ena.nomes), 1) <= 3
                            THEN array_to_string(COALESCE(eo.nomes, ena.nomes), ', ')
                        ELSE array_to_string((COALESCE(eo.nomes, ena.nomes))[1:3], ', ')
                             || ' (+' || (array_length(COALESCE(eo.nomes, ena.nomes), 1) - 3) || ')'
                     END
            -- Agregada cuja equipe não dá mais para reconstruir (alocação
            -- apagada, folha excluída). Rótulo genérico é pior que o nome
            -- certo e melhor que o travessão; resincronizar a folha corrige.
            ELSE 'Folha de Pagamento'
        END AS credor,
        CASE
            WHEN a.category IN ('Encargos Patronais', 'Contribuições de Terceiros')
                THEN 'GOVERNMENT'
            ELSE 'EMPLOYEE'
        END AS tipo
      FROM alvo a
      LEFT JOIN por_colaborador     pc  ON pc.id  = a.id
      LEFT JOIN equipe_da_obra      eo  ON eo.id  = a.id
      LEFT JOIN equipe_nao_alocada  ena ON ena.id = a.id
)

UPDATE public.internal_transactions it
   SET party_name = d.credor,
       party_type = d.tipo,
       updated_at = NOW()
  FROM decidido d
 WHERE it.id = d.id
   AND d.credor IS NOT NULL;

-- ==========================================================================
-- 2. Conferência
-- ==========================================================================
-- 2.a. Não pode sobrar linha de folha sem credor:
-- SELECT count(*) FROM public.internal_transactions
--  WHERE source_system = 'LABOR' AND direction = 'DEBIT'
--    AND NULLIF(btrim(COALESCE(party_name, '')),  '') IS NULL
--    AND NULLIF(btrim(COALESCE(entity_name, '')), '') IS NULL;
--    -> esperado: 0
--
-- 2.b. Distribuição do que foi preenchido (olhar se sobrou muito genérico):
-- SELECT party_type, party_name, count(*)
--   FROM public.internal_transactions
--  WHERE source_system = 'LABOR' AND direction = 'DEBIT'
--  GROUP BY 1, 2 ORDER BY 3 DESC;
--
-- 2.c. Nenhuma linha de folha pode ter escorregado para Tributos a Pagar:
-- SELECT count(*) FROM public.vw_commercial_tax_payables
--  WHERE source_system = 'LABOR';
--    -> esperado: 0
--
-- 2.d. A tela: com Origem = "Folha", a coluna Credor deixa de mostrar "—".
-- ==========================================================================
-- FIM: aplicar_20270914000003_folha_credor_party_name.sql
-- ==========================================================================
