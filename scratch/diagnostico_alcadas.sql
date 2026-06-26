-- ============================================================
-- DIAGNÓSTICO — Exposição das alçadas desconectadas
-- SOMENTE LEITURA. Rode no SQL Editor do Supabase.
-- Objetivo: medir se as alçadas de governança (org_authority_limits)
-- estão cadastradas (cliente "acredita" que valem) e se os fluxos
-- de aprovação já deixaram passar valores altos com 1 só nível.
-- ============================================================


-- ── 1. ALÇADAS DE GOVERNANÇA CADASTRADAS (org_authority_limits) ──
-- Se vier > 0, há exposição ATIVA: o cliente configurou alçadas
-- que hoje NÃO têm nenhum efeito real nas aprovações.
SELECT
  '1. Alçadas cadastradas (total)' AS metrica,
  COUNT(*)                          AS valor
FROM public.org_authority_limits;

-- Quebra por fluxo, tipo de alvo e dupla assinatura
SELECT
  flow_type,
  CASE
    WHEN role_id       IS NOT NULL THEN 'cargo'
    WHEN department_id IS NOT NULL THEN 'departamento'
    WHEN employee_id   IS NOT NULL THEN 'pessoa'
    ELSE 'indefinido'
  END                              AS alvo,
  COUNT(*)                         AS qtd,
  COUNT(*) FILTER (WHERE requer_dupla_assinatura) AS com_dupla_assinatura,
  MIN(limite_maximo)               AS menor_limite,
  MAX(limite_maximo)               AS maior_limite
FROM public.org_authority_limits
GROUP BY 1, 2
ORDER BY 1, 2;

-- Quantas EMPRESAS distintas têm alçada cadastrada
SELECT
  '1b. Empresas com alçada configurada' AS metrica,
  COUNT(DISTINCT company_id)            AS valor
FROM public.org_authority_limits;


-- ── 2. DELEGAÇÕES DE AUTORIDADE (org_delegations) ──
-- Também governança órfã. Delegações "ativas" que não têm efeito.
SELECT
  status,
  COUNT(*) AS qtd
FROM public.org_delegations
GROUP BY status
ORDER BY status;


-- ── 3. FINANCEIRO — internal_transactions aprovadas ──
-- Distribuição: níveis exigidos x passos de APROVADO realmente na cadeia.
SELECT
  COALESCE(approval_required_levels, 1) AS niveis_exigidos,
  COUNT(*)                              AS qtd_aprovadas,
  ROUND(SUM(amount)::numeric, 2)        AS soma_valor,
  ROUND(MAX(amount)::numeric, 2)        AS maior_valor
FROM public.internal_transactions
WHERE approval_status = 'APROVADO'
GROUP BY 1
ORDER BY 1;

-- DESTAQUE: transações de valor ALTO aprovadas com apenas 1 passo na cadeia.
-- (ajuste o limiar 50000 conforme a realidade do cliente)
SELECT
  '3b. Tx ALTAS aprovadas com 1 passo' AS metrica,
  COUNT(*)                              AS qtd,
  ROUND(SUM(amount)::numeric, 2)        AS soma_valor
FROM public.internal_transactions
WHERE approval_status = 'APROVADO'
  AND amount >= 50000
  AND COALESCE(jsonb_array_length(approval_chain), 0) <= 1;


-- ── 4. CONTRATOS aprovados ──
SELECT
  COALESCE(approval_required_levels, 1) AS niveis_exigidos,
  COUNT(*)                              AS qtd_aprovados,
  ROUND(SUM(current_value)::numeric, 2) AS soma_valor,
  ROUND(MAX(current_value)::numeric, 2) AS maior_valor
FROM public.contracts
WHERE approval_status = 'APROVADO'
GROUP BY 1
ORDER BY 1;

-- DESTAQUE: contratos de valor ALTO aprovados com 1 só passo
SELECT
  '4b. Contratos ALTOS aprovados com 1 passo' AS metrica,
  COUNT(*)                                     AS qtd,
  ROUND(SUM(current_value)::numeric, 2)        AS soma_valor
FROM public.contracts
WHERE approval_status = 'APROVADO'
  AND current_value >= 50000
  AND COALESCE(jsonb_array_length(approval_chain), 0) <= 1;


-- ── 5. QUEM APROVA — concentração / "qualquer um aprova" ──
-- Lista os aprovadores distintos que já constam nas cadeias financeiras.
-- Muitos aprovadores distintos sem alçada = confirmação do buraco.
SELECT
  step ->> 'approved_by' AS aprovador,
  COUNT(*)               AS qtd_aprovacoes
FROM public.internal_transactions t,
     LATERAL jsonb_array_elements(t.approval_chain) AS step
WHERE step ->> 'action' = 'APROVADO'
GROUP BY 1
ORDER BY 2 DESC;


-- ── 6. COMPRAS — orders aprovadas (modelo boolean, sem níveis) ──
SELECT
  '6. Pedidos com is_financial_approved = true' AS metrica,
  COUNT(*)                                       AS valor
FROM public.purchase_orders
WHERE is_financial_approved = true;

-- ============================================================
-- LEITURA DO RESULTADO:
--  • Bloco 1 > 0  → exposição ATIVA (alçadas configuradas e inertes).
--  • Blocos 3b/4b > 0 → o teatro já deixou passar valores altos com 1 clique.
--  • Bloco 5 com muitos aprovadores → ausência de segregação de funções.
-- ============================================================
