-- ==========================================================================
-- Fase 2 (parte 2 de 2) — vw_payables passa a expor a OBRA resolvida
-- ==========================================================================
-- CONTEXTO
-- `vw_payables` expõe `p.name AS project_name` juntando `projects` cru, então
-- lançamento pendurado num ORÇAMENTO aparece com o nome do orçamento sob o
-- cabeçalho "Obra" de Contas a Pagar (21 linhas em 28/08/2026: pedidos, folha
-- e uma comissão). A resolução da obra-mãe vive em `vw_project_obra`
-- (aplicar_20270914000013_obra_do_projeto.sql).
--
-- ⚠️ POR QUE ADITIVA, e não "trocar project_name pelo nome da obra":
--    `payableService.list` filtra obra com `.eq('project_id', ...)` — o id CRU
--    (services/payableService.ts:50). Se `project_name` virasse o nome da obra
--    sem um id correspondente, a coluna mostraria "Garden" mas filtrar por
--    Garden não traria a linha: a tela trocaria um erro por outro. Por isso o
--    par novo `obra_id`/`obra_name` entra INTEIRO, e o par cru continua
--    intacto para quem precisa da dimensão como ela foi gravada.
--
--    Consequência: esta migration NÃO muda nada na tela. A virada acontece no
--    client (coluna Obra + filtro passam a usar `obra_*`), num passo separado
--    e revisável.
--
-- ⚠️ `CREATE OR REPLACE`, não `DROP`+`CREATE`:
--    1. preserva GRANTs e dependências (nada de recriar REVOKE/GRANT no escuro);
--    2. o Postgres EXIGE que as colunas existentes venham iguais, na mesma
--       ordem — ou seja, ele mesmo trava qualquer coluna que eu tenha perdido
--       ao transcrever. Colunas novas só podem entrar NO FIM, e é onde estão.
--
-- ⚠️ Base desta transcrição: `pg_get_viewdef('public.vw_payables', true)` do
--    banco vivo, colhido em 28/08/2026 — NÃO o arquivo do repo. A migration
--    mais recente da pasta (aplicar_20270905000007) está DESATUALIZADA: o
--    `effective_status` vivo tem o ramo `CONCILIATED → PAGO` e o estado
--    `APROVADO` na lista de vencíveis, nenhum dos dois no arquivo. Recriar a
--    view a partir do repo teria apagado os dois calado.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (CLAUDE.md).
--    Exige a parte 1 (vw_project_obra) já aplicada.
-- ==========================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE VIEW public.vw_payables
WITH (security_invoker = on) AS
SELECT
  it.id,
  it.organization_id,
  it.source_system,
  it.reference_id,
  it.transaction_date,
  it.due_date,
  it.amount,
  it.direction,
  it.description,
  it.category,
  it.status,
  it.business_status,
  it.party_id,
  it.party_name,
  it.party_type,
  it.entity_name,
  it.supplier_id,
  it.project_id,
  it.cost_center_id,
  it.plano_de_contas_id,
  it.property_id,
  it.property_allocation_mode,
  it.created_at,
  it.updated_at,
  CASE
    WHEN it.status = 'CONCILIATED'::text
     AND (COALESCE(it.business_status, 'PREVISTO'::text) <> ALL (ARRAY['PARCIAL'::text, 'RENEGOCIADO'::text]))
    THEN 'PAGO'::text
    WHEN (COALESCE(it.business_status, 'PREVISTO'::text) = ANY (ARRAY['PREVISTO'::text, 'EMITIDO'::text, 'ENVIADO'::text, 'APROVADO'::text]))
     AND it.due_date IS NOT NULL
     AND it.due_date < CURRENT_DATE
    THEN 'VENCIDO'::text
    ELSE COALESCE(it.business_status, 'PREVISTO'::text)
  END AS effective_status,
  p.name  AS project_name,
  cp.name AS property_name,
  -- ── NOVO (só aqui, no fim) ────────────────────────────────────────────────
  -- A obra de verdade do lançamento: o próprio projeto quando já é OBRA, ou o
  -- ancestral por settings.linkedProjectId (ORCAMENTO/PLANEJAMENTO → OBRA).
  -- NULL quando não há obra na cadeia — ou quando a RLS esconde o pai (projeto
  -- de outra organização), que é o comportamento desejado.
  o.obra_id,
  o.obra_name
FROM public.internal_transactions it
  LEFT JOIN public.projects p              ON p.id = it.project_id
  LEFT JOIN public.commercial_properties cp ON cp.id = it.property_id
  LEFT JOIN public.vw_project_obra o        ON o.project_id = it.project_id
WHERE it.direction = 'DEBIT'::text
  AND it.status    <> 'CANCELLED'::text
  AND it.entry_type IS DISTINCT FROM 'CONTRA'::text;

-- Reafirmação defensiva: CREATE OR REPLACE preserva os grants, então isto é
-- redundante por construção. Fica porque as duas migrations anteriores da view
-- registram que perder o REVOKE nominal de `anon` já aconteceu — e o custo de
-- reafirmar é zero.
REVOKE ALL  ON public.vw_payables FROM PUBLIC;
REVOKE ALL  ON public.vw_payables FROM anon;
GRANT SELECT ON public.vw_payables TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- CONFERÊNCIA
-- ==========================================================================

-- 1. As duas colunas novas existem:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'vw_payables' AND column_name IN ('obra_id','obra_name');

-- 2. NADA se perdeu: a contagem de colunas tem de ser a de antes + 2 (28).
-- SELECT count(*) FROM information_schema.columns WHERE table_name = 'vw_payables';

-- 3. Contagem de linhas idêntica à de antes — o LEFT JOIN novo não pode
--    multiplicar nem cortar linha nenhuma. (vw_project_obra tem no máximo uma
--    linha por project_id, garantido pelo DISTINCT ON.)
-- SELECT count(*) FROM public.vw_payables;

-- 4. security_invoker preservado:
-- SELECT reloptions FROM pg_class WHERE relname = 'vw_payables';

-- 5. O efeito prático — o que a tela vai passar a mostrar quando o client virar:
-- SELECT source_system, description, amount,
--        project_name AS mostra_hoje,
--        obra_name    AS vai_mostrar
--   FROM public.vw_payables
--  WHERE obra_name IS DISTINCT FROM project_name
--  ORDER BY obra_name NULLS FIRST;

-- ==========================================================================
-- FIM: aplicar_20270914000014_vw_payables_obra.sql
-- ==========================================================================
