-- ============================================================
-- Migration: aplicar_20270918000017_catalogos_insert_escopado.sql
-- SEGURANÇA — fecha os dois INSERT que a ...015 deixou abertos
--
-- A ...015 criou `custom_databases_insert` e `custom_items_insert` com
-- `WITH CHECK (true)`, com a justificativa de que os fluxos de criação ainda
-- não passavam `organizationId`. A trava `__tests__/segurancaMigrations.test.ts`
-- acusou a própria migration — e estava certa: silenciá-la na ALLOWLIST teria
-- escondido um buraco real (cliente #2 escrevendo no acervo do grupo) atrás de
-- uma exceção que ninguém revisitaria.
--
-- A UI foi ajustada junto com esta migration:
--   • services/customDatabaseService.ts  — `createDatabase` passa a exigir
--     `organizationId`
--   • components/DatabaseManagerModal.tsx — resolve a organização com
--     `useOrgWriteTarget()` em modo 'single', e renderiza `{orgTargetModal}`.
--     Modo 'single' porque catálogo tem UMA organização dona; o pertencimento
--     às demais vive em `custom_database_org_shares`, não em cópias.
--
-- `custom_items` não precisa de mudança de UI: o item sempre chega com
-- `database_id`, então a organização vem por herança — um trigger a preenche e
-- a policy confere a base. É a mesma solução da `invoices` (aplicar_...002).
-- ============================================================

-- ── Trigger: item herda a organização da base ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_custom_items_preenche_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.organization_id IS NULL AND NEW.database_id IS NOT NULL THEN
        SELECT d.organization_id INTO NEW.organization_id
          FROM public.custom_databases d WHERE d.id = NEW.database_id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_custom_items_preenche_org() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_custom_items_preenche_org ON public.custom_items;
CREATE TRIGGER trg_custom_items_preenche_org
    BEFORE INSERT OR UPDATE OF database_id ON public.custom_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_custom_items_preenche_org();

-- ── INSERT com condição real ────────────────────────────────────────────────
DROP POLICY IF EXISTS "custom_databases_insert" ON public.custom_databases;
CREATE POLICY "custom_databases_insert" ON public.custom_databases
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

-- O trigger roda ANTES do WITH CHECK (comprovado no mesmo padrão de `invoices`),
-- então o item que chega com `database_id` já tem organização quando a policy
-- avalia. Item sem base só entra se vier com organização explícita.
DROP POLICY IF EXISTS "custom_items_insert" ON public.custom_items;
CREATE POLICY "custom_items_insert" ON public.custom_items
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.custom_databases d
             WHERE d.id = custom_items.database_id
               AND (public.is_org_member(d.organization_id)
                    OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                                WHERE sh.database_id = d.id
                                  AND public.is_org_member(sh.target_org_id)))
        )
    );

-- ── rubrics: o INSERT também estava aberto ──────────────────────────────────
-- A verificação embutida da primeira versão desta migration abortou tudo
-- apontando `rubrics_insert_all (INSERT) with_check=true`. Estava certa: eu
-- havia olhado só para as duas de `custom_*`. A UI foi ajustada junto —
-- `payrollService.createRubric` passa a exigir `organizationId`, e
-- `LaborRubrics.tsx` o resolve com `useOrgWriteTarget('single')`.
--
-- `useLaborMutations.useSaveRubric` e `incentiveService.upsertIncentiveRubric`
-- também repassam a organização na criação (a edição não precisa: a linha já
-- tem dono).
DROP POLICY IF EXISTS "rubrics_insert_all" ON public.rubrics;
CREATE POLICY "rubrics_insert" ON public.rubrics
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE v_frouxas text;
BEGIN
    SELECT string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ')
      INTO v_frouxas
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('custom_databases','custom_items','rubrics')
       AND (qual = 'true' OR with_check = 'true');

    IF v_frouxas IS NOT NULL THEN
        RAISE EXCEPTION 'catalogos: ainda ha policy sem condicao: %', v_frouxas;
    END IF;

    RAISE NOTICE 'OK: leitura, escrita e criacao dos catalogos recortadas por organizacao.';
END $$;
