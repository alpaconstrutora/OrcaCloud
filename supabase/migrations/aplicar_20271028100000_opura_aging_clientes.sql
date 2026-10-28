-- ÒPURA · Central de Clientes — Em aberto por faixa de atraso (28/10/2026)
-- Plano: docs/planos/2026-10-28-central-clientes-faixas-de-atraso.md
--
-- O gráfico "Previsto × Realizado" respondia QUANDO o lançamento foi feito; a
-- cobrança precisa saber HÁ QUANTO TEMPO venceu. Esta função agrupa as ENTRADAS
-- PENDENTES dos clientes em faixas de atraso (pelo vencimento × hoje):
--   a_vencer · 1_30 · 31_60 · 61_90 · mais_90
-- com quantidade, valor e o maior atraso (dias) de cada faixa.
--
-- p_base:
--   'periodo' — só lançamentos com transaction_date no período (a base dos KPIs:
--               a soma fecha com o Em aberto da tela);
--   'hoje'    — tudo o que está em aberto hoje, lançado quando for. Medido em
--               27/10: R$ 2,22 mi vencidos há mais de 90 dias, quase todos
--               lançados antes de 2026 — o recorte por período os escondia.
-- p_dimension: NULL (total) · 'client' · 'project' (chave NULL = sem obra) — a
--   coluna "Atraso máx." das tabelas Por cliente / Por obra.
--
-- Sem cliente informado (p_client_id e p_client_ids NULL) não devolve nada: a
-- organização inteira não sai por acidente (mesma trava do fn_opura_cliente_kpis).
-- SECURITY INVOKER: a RLS de vw_fact_financial_tx recorta; a checagem de
-- organização abaixo é a mesma do fn_opura_entries.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_opura_aging(
  p_organization_id uuid,
  p_client_id       uuid    DEFAULT NULL,
  p_client_ids      uuid[]  DEFAULT NULL,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_base            text    DEFAULT 'periodo',
  p_dimension       text    DEFAULT NULL
)
RETURNS TABLE(dimension_key text, faixa text, qtd bigint, valor numeric, atraso_max integer)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  IF p_base NOT IN ('periodo', 'hoje') THEN
    RAISE EXCEPTION 'Base desconhecida em p_base: %', p_base;
  END IF;
  IF p_dimension IS NOT NULL AND p_dimension NOT IN ('client', 'project') THEN
    RAISE EXCEPTION 'Dimensão desconhecida em p_dimension: %', p_dimension;
  END IF;
  IF p_client_id IS NULL AND p_client_ids IS NULL THEN
    RETURN;
  END IF;

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
  WITH abertos AS (
    SELECT
      CASE p_dimension
        WHEN 'client'  THEN f.client_id::text
        WHEN 'project' THEN f.project_id::text
      END AS dim_key,
      f.amount,
      CASE WHEN f.due_date IS NOT NULL AND f.due_date < CURRENT_DATE
           THEN (CURRENT_DATE - f.due_date) END AS dias
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = ANY(v_targets)
      AND f.direction = 'CREDIT'
      AND f.status = 'PENDING'
      AND (p_client_id  IS NULL OR f.client_id = p_client_id)
      AND (p_client_ids IS NULL OR f.client_id = ANY(p_client_ids))
      AND (p_base = 'hoje' OR (
            (p_date_from IS NULL OR f.transaction_date >= p_date_from)
        AND (p_date_to   IS NULL OR f.transaction_date <= p_date_to)))
  )
  SELECT
    a.dim_key AS dimension_key,
    CASE
      WHEN a.dias IS NULL  THEN 'a_vencer'
      WHEN a.dias <= 30    THEN '1_30'
      WHEN a.dias <= 60    THEN '31_60'
      WHEN a.dias <= 90    THEN '61_90'
      ELSE 'mais_90'
    END AS faixa,
    COUNT(*)                       AS qtd,
    COALESCE(SUM(a.amount), 0)     AS valor,
    MAX(a.dias)::integer           AS atraso_max
  FROM abertos a
  GROUP BY 1, 2;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_opura_aging(uuid, uuid, uuid[], date, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_aging(uuid, uuid, uuid[], date, date, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
