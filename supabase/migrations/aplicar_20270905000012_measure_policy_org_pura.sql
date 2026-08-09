-- ============================================================================
-- Medição Inteligente — a policy passa a ser SÓ organização
-- Auditoria: docs/planos/2026-08-09-auditoria-rls-measure.md (passo final)
--
-- A `aplicar_20270905000011` deixou a policy como "dono OU organização", e isso
-- foi deliberado: se alguma linha não pudesse ser preenchida, organização pura a
-- tornaria inacessível para TODO MUNDO, inclusive para quem a criou. Rede de
-- segurança enquanto o preenchimento acontecia.
--
-- A rede já não é necessária:
--   • a conferência da 000011 fechou em `sem_organizacao = 0`;
--   • criar levantamento passa por `resolveWriteOrg('single')`, então todo novo
--     registro nasce com organização.
--
-- E ela tem um custo real: com `user_id = auth.uid()` no OR, quem sai da empresa
-- mas mantém a conta continua enxergando os levantamentos que criou. Era
-- justamente metade do problema que esta auditoria foi corrigir.
--
-- `user_id` NÃO é removido: ele continua sendo a AUTORIA. Autoria e posse são
-- coisas diferentes, e confundi-las foi a causa original.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ. O SQL Editor roda o script inteiro como
--    UMA transação: um erro no bloco 3 desfaz o bloco 1, e a coluna que você
--    acabou de ver criada some. Aconteceu na 000011.
-- ============================================================================

-- ═══ BLOCO 1 — travar a coluna no schema ════════════════════════════════════
-- Depender só da aplicação para preencher deixa a porta aberta: qualquer
-- caminho que insira sem organização recria o problema em silêncio. `NOT NULL`
-- transforma isso em erro na hora.
--
-- Se este bloco falhar com "column contains null values", NÃO force: rode
--   SELECT id, nome, user_id FROM public.measure_projects WHERE organization_id IS NULL;
-- e resolva cada linha antes. Uma linha sem organização depois do bloco 2 fica
-- invisível para todos.
SET lock_timeout = '5s';

ALTER TABLE public.measure_projects
  ALTER COLUMN organization_id SET NOT NULL;

-- ═══ BLOCO 2 — o predicado, sem a cláusula de dono ══════════════════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_measure_projeto_acessivel(p_projeto UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.measure_projects p
     WHERE p.id = p_projeto
       AND public.is_org_member(p.organization_id)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_measure_projeto_acessivel(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_measure_projeto_acessivel(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_measure_projeto_acessivel(UUID) TO authenticated;

-- ═══ BLOCO 3 — a policy do projeto ══════════════════════════════════════════
-- As quatro filhas não mudam: elas já chamam a função, que é onde a regra vive.
-- Era esse o ponto de ter extraído o predicado.
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "measure_projects_acesso" ON public.measure_projects;
CREATE POLICY "measure_projects_acesso" ON public.measure_projects
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: nao_nula=1, policies=5, anon=0, com_clausula_de_dono=0

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='measure_projects'
      AND column_name='organization_id' AND is_nullable='NO')                    AS nao_nula,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename LIKE 'measure_%')                     AS policies,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename LIKE 'measure_%'
      AND roles::text LIKE '%anon%')                                              AS anon,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='measure_projects'
      AND qual LIKE '%auth.uid()%')                                               AS com_clausula_de_dono;
