-- ==========================================================================
-- fn_fi_ledger: a lista de obras é calculada UMA vez (CTE MATERIALIZED)
-- ==========================================================================
-- Sintoma (16/11/2026): a Central de Controle não carregava. A RPC
-- fn_central_controle_bootstrap estourava o statement_timeout de 8 s do papel
-- `authenticated` (57014) — e cancelamento NÃO é pego pelo `EXCEPTION WHEN
-- OTHERS` de cada bloco, então a resposta inteira falhava e nenhum cartão abria.
--
-- Medido como o usuário (RLS ativa), bloco a bloco:
--   1 financial_alerts 5.328 ms · 2 divergences 192 · 3 approval_summary 109
--   4 bottlenecks 2 · 5 action_queue 102 · 6 scorecard 2.650   (> 8 s com o meu_dia)
-- Os dois lentos leem fn_fi_ledger (alerts 2× — direto e pelo scorecard —, scorecard 1×).
--
-- Causa: a CTE `obras` é referenciada uma só vez, então o PostgreSQL a embute no
-- LEFT JOIN LATERAL do fim e a reexecuta para CADA lançamento. EXPLAIN ANALYZE
-- (como postgres, mesmas 8 orgs): Seq Scan on projects loops=2115, 3 ms cada,
-- 433.600 buffers (detoast de projects.settings — o de um PLANEJAMENTO tem 132 kB
-- comprimido) = 6.461 ms. Com `AS MATERIALIZED`: 15,9 ms, mesmo resultado.
--
-- O resto da função é IGUAL a aplicar_20271021800000_inteligencia_financeira_numeros_reais.sql
-- (conferido contra pg_get_functiondef do banco em 16/11). Ganham junto todas as
-- leitoras do livro: fn_project_scorecard, fn_financial_alerts,
-- fn_cashflow_projection, fn_cashflow_position, fn_rental_income,
-- fn_entries_without_project.
--
-- REGRA #7
--   P1: nenhuma policy criada nem alterada.
--   P2: mesma assinatura e mesmo SECURITY INVOKER de antes; o REVOKE/GRANT abaixo
--       repete o da migration original (CREATE OR REPLACE preserva a ACL, mas
--       fica explícito).
--
-- Reverter: aplicar de novo o bloco fn_fi_ledger de
--   aplicar_20271021800000_inteligencia_financeira_numeros_reais.sql.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.fn_fi_ledger(p_targets uuid[])
RETURNS TABLE(
  id                  uuid,
  direction           text,
  amount              numeric,
  data_ref            date,
  realizado           boolean,
  em_aberto           boolean,
  categoria           text,
  obra_id             uuid,
  obra_nome           text,
  natureza            text,   -- 'VENDA' | 'LOCACAO' | NULL
  empreendimento_id   uuid,
  empreendimento_nome text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  -- MATERIALIZED (16/11/2026): referenciada uma vez só, a CTE era embutida no
  -- LATERAL lá embaixo e reavaliada POR LANÇAMENTO — Seq Scan em projects (com
  -- detoast de settings) × 2.115 linhas = 6,4 s de 6,5 s. Materializada, roda
  -- uma vez (16 ms no total). Não tirar: a Central de Controle estoura o
  -- statement_timeout de 8 s sem isso.
  WITH obras AS MATERIALIZED (
    -- Projeto de sistema: corte por nome E por flag (ver utils/systemProjects.ts).
    SELECT p.id, p.name
    FROM public.projects p
    WHERE p.settings->>'classification' = 'OBRA'
      AND COALESCE(p.settings->>'isSystemProject', 'false') <> 'true'
      AND p.name NOT IN ('Gestão Comercial')
  ),
  base AS (
    SELECT it.id, it.direction, it.amount, it.status, it.business_status,
           it.due_date, it.transaction_date, it.category, it.project_id,
           c.project_id AS contrato_obra,
           -- Parcela espelhada da negociação: reference_id 'tx-{dealId}-p{n}',
           -- 'tx-{dealId}-dp' ou 'tx-comm-{dealId}' (commercialFinanceService).
           COALESCE(
             c.deal_id,
             substring(it.reference_id FROM
               '^tx-(?:comm-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid
           ) AS deal_ref
    FROM public.internal_transactions it
    LEFT JOIN public.contracts c ON c.id = it.contract_id
    WHERE it.organization_id = ANY(p_targets)
      AND it.status <> 'CANCELLED'
      AND COALESCE(it.business_status, '') NOT IN ('CANCELADO', 'RENEGOCIADO')
  )
  SELECT
    b.id,
    b.direction,
    b.amount,
    COALESCE(b.due_date, b.transaction_date),
    b.status = 'CONCILIATED',
    b.status = 'PENDING' AND COALESCE(b.business_status, '') NOT IN ('RECEBIDO', 'PAGO'),
    COALESCE(NULLIF(trim(b.category), ''), 'Sem categoria'),
    o.id,
    o.name,
    CASE d.type WHEN 'SALE' THEN 'VENDA' WHEN 'RENTAL' THEN 'LOCACAO' END,
    m.empreendimento_id,
    m.empreendimento_name
  FROM base b
  LEFT JOIN public.commercial_deals d ON d.id = b.deal_ref
  -- Unidade comercial → torre → empreendimento → obra: o vínculo que o usuário
  -- cadastra em Empreendimento › Vinculações (empreendimentos.project_id, ou
  -- empreendimento_towers.project_id em multi-torre). A view é o caminho
  -- oficial (migration 20270842000000). É mapa N:1 — LIMIT 1, torre primeiro.
  -- ⚠️ commercial_properties.project_id NÃO é esse vínculo (está vazio).
  LEFT JOIN LATERAL (
    SELECT v.empreendimento_id, v.empreendimento_name, v.project_id
    FROM public.vw_unit_property_map v
    WHERE v.property_id = d.property_id
    ORDER BY (v.project_source = 'TOWER') DESC
    LIMIT 1
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT ob.id, ob.name
    FROM (VALUES (1, b.project_id), (2, b.contrato_obra), (3, d.linked_project_id),
                 (4, m.project_id)) AS cand(ordem, pid)
    JOIN obras ob ON ob.id = cand.pid
    ORDER BY cand.ordem
    LIMIT 1
  ) o ON true;
$fn$;

REVOKE ALL ON FUNCTION public.fn_fi_ledger(uuid[])     FROM anon;
REVOKE ALL ON FUNCTION public.fn_fi_ledger(uuid[])     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fi_ledger(uuid[]) TO authenticated;
