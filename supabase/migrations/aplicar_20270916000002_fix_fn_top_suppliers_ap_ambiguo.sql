-- ==========================================================================
-- Corrige 42702 em fn_top_suppliers_ap (Dashboard Financeiro)
-- Date: 2026-08-29
-- Altera: public.fn_top_suppliers_ap(uuid, date, date, integer)
-- ==========================================================================
-- SINTOMA
-- O Dashboard Financeiro recebia HTTP 400 do PostgREST. Reproduzido chamando a
-- função direto:
--
--   ERROR: 42702: column reference "total_valor" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
-- CAUSA — a armadilha já conhecida da casa (ver memória
-- `project_plpgsql_returns_table_ambiguidade`, e o mesmo defeito em
-- `fn_opura_pivot`, corrigido por 20270216000000):
--
--   Em LANGUAGE plpgsql, CADA NOME DO `RETURNS TABLE` VIRA UMA VARIÁVEL OUT
--   visível dentro do corpo. Aqui o RETURNS TABLE declara `total_valor`, e a
--   CTE `total` fazia `SUM(total_valor)` SEM qualificar — o parser não sabe se
--   é a variável OUT ou a coluna da CTE `base`. `CREATE FUNCTION` passa limpo;
--   o erro só aparece em runtime, que é por que isto chegou à tela.
--
-- DUAS colisões, não uma. A segunda ainda não tinha estourado só porque o
-- parser morre na primeira:
--   1. `total AS (SELECT SUM(total_valor) ...)`      -> qualificado com base.
--   2. `GROUP BY b.supplier_id, supplier_name`       -> `supplier_name` também
--      é nome do RETURNS TABLE. Trocado pela EXPRESSÃO agregada, que é o que a
--      memória manda fazer com alias de saída em GROUP BY/ORDER BY: alias ali
--      não é qualificável, então repetir a expressão é a única saída sem
--      ambiguidade.
--
-- Nada além disso muda: mesma assinatura, mesma regra de acesso, mesmo
-- resultado. As duas irmãs da mesma tela (`fn_financial_kpis`,
-- `fn_dre_projects_summary`) foram executadas e NÃO têm o defeito.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_top_suppliers_ap(
    p_organization_id uuid,
    p_date_from       date,
    p_date_to         date,
    p_limit           integer DEFAULT 10
)
RETURNS TABLE(
    supplier_id    uuid,
    supplier_name  text,
    total_valor    numeric,
    count_boletos  bigint,
    pct            numeric
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  WITH base AS (
    SELECT
      b.supplier_id                                          AS sup_id,
      COALESCE(s.name, b.beneficiario_nome, 'Sem nome')      AS sup_name,
      SUM(b.valor)                                           AS soma_valor,
      COUNT(*)                                               AS qtd_boletos
    FROM public.boletos b
    LEFT JOIN public.suppliers s ON s.id = b.supplier_id
    WHERE b.organization_id = ANY(v_targets)
      AND b.vencimento BETWEEN p_date_from AND p_date_to
      AND b.status NOT IN ('cancelado', 'rascunho')
      AND b.valor IS NOT NULL
    -- A EXPRESSÃO, não o alias: alias de saída no GROUP BY colide com a
    -- variável OUT de mesmo nome e não há como qualificá-lo.
    GROUP BY b.supplier_id, COALESCE(s.name, b.beneficiario_nome, 'Sem nome')
  ),
  total AS (
    -- Qualificado com a CTE. Sem o `base.`, `soma_valor` seria ambíguo de novo
    -- no dia em que alguém renomeasse a saída para o mesmo nome.
    SELECT SUM(base.soma_valor) AS grand FROM base
  )
  SELECT
    b.sup_id,
    b.sup_name,
    b.soma_valor,
    b.qtd_boletos,
    ROUND(CASE WHEN t.grand > 0 THEN b.soma_valor / t.grand * 100 ELSE 0 END, 1)
  FROM base b, total t
  ORDER BY b.soma_valor DESC
  LIMIT p_limit;
END;
$function$;

-- A regra da casa: RPC nova (ou recriada) NÃO fica aberta para anon.
-- `CREATE OR REPLACE` preserva os grants, mas repetir aqui torna o arquivo
-- auto-suficiente — se algum dia for aplicado num banco onde a função não
-- existia, ela não nasce exposta pelo default privilege do Supabase.
REVOKE ALL ON FUNCTION public.fn_top_suppliers_ap(uuid, date, date, integer) FROM anon;
REVOKE ALL ON FUNCTION public.fn_top_suppliers_ap(uuid, date, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_top_suppliers_ap(uuid, date, date, integer) TO authenticated;

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- a. A função responde (era 42702):
-- SELECT * FROM public.fn_top_suppliers_ap(NULL, CURRENT_DATE - 90, CURRENT_DATE, 10);
--    -> esperado: 0+ linhas, sem erro
--
-- b. Grants:
-- SELECT has_function_privilege('anon',          'public.fn_top_suppliers_ap(uuid,date,date,integer)', 'EXECUTE') AS anon_pode,
--        has_function_privilege('authenticated', 'public.fn_top_suppliers_ap(uuid,date,date,integer)', 'EXECUTE') AS auth_ok;
--    -> esperado: f, t
-- ==========================================================================
-- FIM
-- ==========================================================================
