-- ==========================================================================
-- Fase 2 (parte 1 de 2) — resolução "qual é a OBRA deste projeto?", em UM lugar
-- ==========================================================================
-- CONTEXTO
-- `projects` guarda quatro entidades separadas só por `settings.classification`
-- (OBRA / ORCAMENTO / PLANEJAMENTO / DIARIO — CLAUDE.md regra #3). As 24 views
-- que expõem `p.name AS project_name` juntam `projects` cru, então um
-- lançamento pendurado num ORÇAMENTO aparece com o nome do orçamento sob o
-- cabeçalho "Obra" — em Contas a Pagar, no DRE por obra, em toda tela que
-- consome essas views.
--
-- Diagnóstico de 28/08/2026: 21 lançamentos nessa situação (pedidos de compra,
-- folha de pagamento e uma comissão de corretor), todos ORCAMENTO.
--
-- Lançar um pedido/folha num ORÇAMENTO é fluxo SUPORTADO pelo produto (ver
-- `resolveOrderEmpreendimento` em components/empreendimento/EmpreendimentoCell.tsx).
-- Por isso a resposta certa aqui NÃO é esconder ("—"), e sim subir a cadeia
-- `settings.linkedProjectId` (PLANEJAMENTO → ORCAMENTO → OBRA) até a obra-mãe.
-- Isso é o oposto do que vale para CONTRATO, onde project_id não-obra é sempre
-- defeito e o certo é o erro visível.
--
-- Esta migration é ADITIVA: cria a resolução e não altera nenhuma view
-- existente. Nada muda na tela até a parte 2. Aplique esta, rode as consultas
-- de conferência no fim, e só então decida a parte 2.
--
-- ⚠️ Projeto SEM classificação NÃO conta como obra — a mesma decisão que
--    `TRATAR_SEM_CLASSIFICACAO_COMO_OBRA = false` toma no TypeScript
--    (utils/projectClassification.ts). As duas camadas TÊM de concordar; se um
--    dia essa constante virar `true`, este arquivo muda junto.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (CLAUDE.md).
--    O SQL Editor executa só a SELEÇÃO: selecione o arquivo inteiro.
-- ==========================================================================

SET lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. vw_project_obra — de QUALQUER projeto para a obra dele
--
--    Todo projeto parte de si mesmo (saltos = 0) e sobe por `linkedProjectId`
--    enquanto não for OBRA, no máximo 4 saltos (a cadeia real tem 2; o teto é
--    proteção contra ciclo em dado corrompido).
--
--    O cast para uuid vai dentro de um CASE guardado por regex de propósito:
--    `linkedProjectId` é texto livre dentro de JSONB e um valor malformado
--    derrubaria a view inteira com 22P02, não só a linha ruim.
--
--    `security_invoker = on`: a view respeita a RLS de quem consulta. Efeito
--    desejado — projeto-pai de OUTRA organização fica invisível e o lançamento
--    aparece sem obra, em vez de vazar o nome da obra alheia.
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.vw_project_obra;

CREATE VIEW public.vw_project_obra
WITH (security_invoker = on) AS
WITH RECURSIVE subida AS (
  SELECT
    p.id       AS project_id,
    p.id       AS no_id,
    p.settings AS no_settings,
    0          AS saltos
  FROM public.projects p

  UNION ALL

  SELECT
    s.project_id,
    pai.id,
    pai.settings,
    s.saltos + 1
  FROM subida s
  JOIN public.projects pai
    ON pai.id = CASE
         WHEN s.no_settings->>'linkedProjectId'
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (s.no_settings->>'linkedProjectId')::uuid
       END
  WHERE s.saltos < 4
    AND upper(btrim(coalesce(s.no_settings->>'classification', ''))) <> 'OBRA'
)
SELECT DISTINCT ON (s.project_id)
  s.project_id,
  s.no_id AS obra_id,
  o.name  AS obra_name,
  s.saltos
FROM subida s
JOIN public.projects o ON o.id = s.no_id
WHERE upper(btrim(coalesce(s.no_settings->>'classification', ''))) = 'OBRA'
ORDER BY s.project_id, s.saltos;

COMMENT ON VIEW public.vw_project_obra IS
  'Mapeia qualquer projeto para a OBRA dele (o próprio, se já for obra; senão o '
  'ancestral mais próximo por settings.linkedProjectId). Projeto sem obra na '
  'cadeia simplesmente não aparece — consumidores usam LEFT JOIN. Ver CLAUDE.md '
  'regra #3 e utils/projectClassification.ts.';

REVOKE ALL  ON public.vw_project_obra FROM PUBLIC;
REVOKE ALL  ON public.vw_project_obra FROM anon;
GRANT SELECT ON public.vw_project_obra TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. obra_id(uuid) — a mesma resolução em forma escalar
--
--    Conveniência para consulta ad-hoc e para view que já tem o project_id à
--    mão. Em view que varre muitas linhas, prefira o LEFT JOIN em
--    vw_project_obra: é uma passada recursiva só, em vez de uma por linha.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obra_id(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT o.obra_id
    FROM public.vw_project_obra o
   WHERE o.project_id = p_project_id;
$$;

COMMENT ON FUNCTION public.obra_id(uuid) IS
  'Id da OBRA de um projeto (ele mesmo, ou o ancestral por linkedProjectId). '
  'NULL quando não há obra na cadeia. Ver public.vw_project_obra.';

REVOKE ALL ON FUNCTION public.obra_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obra_id(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- CONFERÊNCIA — rodar as quatro, nesta ordem
-- ==========================================================================

-- 1. NÃO PODE REGREDIR: para lançamento que já está numa OBRA, a resolução tem
--    de devolver a MESMA obra. Resultado esperado: 0.
-- SELECT count(*) AS regressoes
--   FROM public.internal_transactions it
--   JOIN public.projects p        ON p.id = it.project_id
--   JOIN public.vw_project_obra o ON o.project_id = it.project_id
--  WHERE upper(btrim(coalesce(p.settings->>'classification',''))) = 'OBRA'
--    AND o.obra_id <> p.id;

-- 2. PRÉVIA do que a parte 2 mudaria na tela — uma linha por lançamento hoje
--    pendurado em não-obra, com o antes e o depois lado a lado.
-- SELECT it.source_system,
--        it.description,
--        it.amount,
--        p.name       AS obra_mostrada_hoje,
--        p.settings->>'classification' AS classificacao_hoje,
--        o.obra_name  AS obra_depois,
--        o.saltos
--   FROM public.internal_transactions it
--   JOIN public.projects p            ON p.id = it.project_id
--   LEFT JOIN public.vw_project_obra o ON o.project_id = it.project_id
--  WHERE upper(btrim(coalesce(p.settings->>'classification',''))) <> 'OBRA'
--  ORDER BY o.obra_name NULLS FIRST, it.description;

-- 3. ÓRFÃOS: projeto que não é obra e não tem obra na cadeia. Estes continuarão
--    sem obra depois da parte 2 — se aparecer algum aqui, é dado a corrigir,
--    não código.
-- SELECT p.id, p.name, p.settings->>'classification' AS classificacao,
--        p.settings->>'linkedProjectId' AS pai
--   FROM public.projects p
--   LEFT JOIN public.vw_project_obra o ON o.project_id = p.id
--  WHERE o.project_id IS NULL;

-- 4. anon NÃO pode aparecer:
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'vw_project_obra';

-- ==========================================================================
-- FIM: aplicar_20270914000013_obra_do_projeto.sql
-- ==========================================================================
