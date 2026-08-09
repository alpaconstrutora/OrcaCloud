-- ============================================================================
-- Medição Inteligente — dar dono ORGANIZACIONAL ao levantamento
-- Auditoria: docs/planos/2026-08-09-auditoria-rls-measure.md (Fase 2)
--
-- Hoje a policy é `user_id = auth.uid()`: o levantamento pertence à PESSOA.
-- Ninguém mais na empresa enxerga — nem sócio, nem administrador — e quem sai
-- leva o trabalho, porque desativado o usuário nenhum `auth.uid()` volta a casar
-- as linhas.
--
-- Não é erro de policy: é ausência de coluna. Reescrever a policy sem
-- acrescentar `organization_id` não teria como funcionar.
--
-- ⚠️ A POLICY FICA COMO "DONO **OU** ORGANIZAÇÃO", não só organização.
--    Se a coluna não puder ser preenchida numa linha (usuário em mais de uma
--    organização, sem obra associada), trocar para organização pura tornaria
--    essa linha inacessível para TODO MUNDO — inclusive para quem a criou.
--    Perder o trabalho é pior que o problema que se está corrigindo.
--    Estreitar para organização pura é passo seguinte, depois que a conferência
--    do bloco 6 mostrar zero linhas sem organização.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
--
-- ⚠️ RENUMERADA. Nasceu como `aplicar_20270905000008` e colidiu com uma
--    migration de outra frente, criada mais cedo no mesmo dia. Prefixo repetido tira a única coisa
--    que o prefixo faz: dizer a ordem. Quem renomeia é quem chegou depois.
--    AINDA NÃO aplicada.
-- ============================================================================

-- ═══ BLOCO 1 — a coluna ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.measure_projects
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_measure_projects_org
    ON public.measure_projects(organization_id);

COMMENT ON COLUMN public.measure_projects.organization_id IS
  'Dono organizacional. `user_id` continua sendo a AUTORIA — as duas coisas são '
  'diferentes, e confundi-las foi o que prendeu o levantamento à pessoa.';

-- ═══ BLOCO 2 — preencher pela obra associada ════════════════════════════════
-- É a fonte mais confiável: se o levantamento aponta para uma obra, a
-- organização é a daquela obra, sem ambiguidade possível.
SET lock_timeout = '5s';

UPDATE public.measure_projects m
   SET organization_id = p.organization_id
  FROM public.projects p
 WHERE m.associated_project_id = p.id
   AND m.organization_id IS NULL
   AND p.organization_id IS NOT NULL;

-- ═══ BLOCO 3 — preencher pela única organização do autor ════════════════════
-- Só quando NÃO houver ambiguidade. Para quem participa de mais de uma
-- organização, o banco não tem como saber em qual o levantamento foi feito —
-- e atribuir por chute deixaria trabalho na empresa errada, que é pior que o
-- problema atual. Essas linhas ficam NULAS de propósito e aparecem no bloco 6.
SET lock_timeout = '5s';

UPDATE public.measure_projects m
   SET organization_id = unica.org
  FROM (
        SELECT om.user_id, MIN(om.organization_id) AS org
          FROM public.organization_members om
         WHERE om.user_id IS NOT NULL
         GROUP BY om.user_id
        HAVING COUNT(DISTINCT om.organization_id) = 1
       ) AS unica
 WHERE m.user_id = unica.user_id
   AND m.organization_id IS NULL;

-- ═══ BLOCO 4 — o predicado, num lugar só ════════════════════════════════════
-- As quatro tabelas-filhas repetiam `WHERE user_id = auth.uid()` embutido.
-- Regra duplicada é regra que diverge — a mesma lição do arranjo planar que
-- existe em duas cópias no produto. Aqui ela passa a existir uma vez.
--
-- SECURITY DEFINER para não reaplicar a RLS de `measure_projects` dentro da
-- policy das filhas, o que dobraria o trabalho a cada linha lida.
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
       AND (
             p.user_id = auth.uid()
             OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id))
           )
  );
$$;

-- RPC nova nasce sem PUBLIC: `GRANT authenticated` sozinho não tira o EXECUTE
-- que o PUBLIC recebe por padrão, e `anon` faz parte de PUBLIC.
REVOKE ALL ON FUNCTION public.fn_measure_projeto_acessivel(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_measure_projeto_acessivel(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_measure_projeto_acessivel(UUID) TO authenticated;

-- ═══ BLOCO 5 — as cinco policies ════════════════════════════════════════════
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "measure_projects_owner_access" ON public.measure_projects;
CREATE POLICY "measure_projects_acesso" ON public.measure_projects
    FOR ALL TO authenticated
    USING (
      user_id = auth.uid()
      OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    )
    WITH CHECK (
      user_id = auth.uid()
      OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    );

DROP POLICY IF EXISTS "measure_files_owner_access" ON public.measure_files;
CREATE POLICY "measure_files_acesso" ON public.measure_files
    FOR ALL TO authenticated
    USING (public.fn_measure_projeto_acessivel(project_id))
    WITH CHECK (public.fn_measure_projeto_acessivel(project_id));

DROP POLICY IF EXISTS "measure_layers_owner_access" ON public.measure_layers;
CREATE POLICY "measure_layers_acesso" ON public.measure_layers
    FOR ALL TO authenticated
    USING (public.fn_measure_projeto_acessivel(project_id))
    WITH CHECK (public.fn_measure_projeto_acessivel(project_id));

DROP POLICY IF EXISTS "measure_library_items_owner_access" ON public.measure_library_items;
CREATE POLICY "measure_library_items_acesso" ON public.measure_library_items
    FOR ALL TO authenticated
    USING (public.fn_measure_projeto_acessivel(project_id))
    WITH CHECK (public.fn_measure_projeto_acessivel(project_id));

DROP POLICY IF EXISTS "measure_shapes_owner_access" ON public.measure_shapes;
CREATE POLICY "measure_shapes_acesso" ON public.measure_shapes
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.measure_files f
         WHERE f.id = file_id AND public.fn_measure_projeto_acessivel(f.project_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.measure_files f
         WHERE f.id = file_id AND public.fn_measure_projeto_acessivel(f.project_id)
      )
    );

-- ═══ BLOCO 6 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: coluna=1, policies=5, anon=0, sem_organizacao=0
--
-- `sem_organizacao > 0` NÃO é falha da migration: são os levantamentos de quem
-- participa de mais de uma organização e não tem obra associada. Eles continuam
-- acessíveis pelo autor; falta decidir a organização deles à mão.

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='measure_projects'
      AND column_name='organization_id')                                        AS coluna,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename LIKE 'measure_%')                    AS policies,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename LIKE 'measure_%'
      AND roles::text LIKE '%anon%')                                             AS anon,
  (SELECT count(*) FROM public.measure_projects
    WHERE organization_id IS NULL)                                               AS sem_organizacao;
