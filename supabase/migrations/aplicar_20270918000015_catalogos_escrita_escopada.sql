-- ============================================================
-- Migration: aplicar_20270918000015_catalogos_escrita_escopada.sql
-- SEGURANÇA — complemento indispensável da aplicar_20270918000014
--
-- POR QUE ESTA MIGRATION EXISTE
-- A ...014 criou as policies de SELECT recortadas, mas o teste de regressão
-- mostrou que TODO MUNDO continuava vendo tudo — inclusive um "cliente #2"
-- simulado. A causa: sobraram as policies
--
--     authenticated_write_custom_databases  FOR ALL  USING (true)
--     authenticated_write_custom_items      FOR ALL  USING (true)
--
-- `FOR ALL` **inclui SELECT**, e policies permissivas são combinadas com OR.
-- Uma policy de leitura nova não restringe nada enquanto uma `ALL USING(true)`
-- continuar ao lado dela — ela sozinha já libera a linha.
--
-- É a mesma armadilha do C1-05 (`OR is_shared`), noutra roupagem: o que decide
-- não é a policy mais restritiva, é a mais permissiva.
--
-- O QUE MUDA
-- As `ALL` viram policies por comando:
--   • SELECT  — fica só com as da ...014 (recortadas)
--   • UPDATE/DELETE — recortados: cliente #2 não altera nem apaga o acervo do grupo
--   • INSERT  — NÃO é criado aqui. A primeira versão desta migration criava
--     `custom_databases_insert` e `custom_items_insert` com `WITH CHECK (true)`,
--     alegando que a UI ainda não passava `organizationId`. A trava
--     `__tests__/segurancaMigrations.test.ts` acusou este arquivo, e estava
--     certa: uma migration não deve conter um passo que abre o buraco, mesmo
--     que outra o feche depois — quem lê o histórico vê a abertura.
--     As policies de INSERT nascem já escopadas na aplicar_...017, junto com a
--     mudança de UI que passou a resolver a organização (`useOrgWriteTarget`).
--     Entre esta migration e a ...017 não há policy de INSERT: a criação fica
--     negada, que é o lado seguro de falhar.
-- ============================================================

-- ── custom_databases ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_write_custom_databases" ON public.custom_databases;

CREATE POLICY "custom_databases_update" ON public.custom_databases
    FOR UPDATE TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                    WHERE sh.database_id = custom_databases.id
                      AND public.is_org_member(sh.target_org_id))
    );

CREATE POLICY "custom_databases_delete" ON public.custom_databases
    FOR DELETE TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                    WHERE sh.database_id = custom_databases.id
                      AND public.is_org_member(sh.target_org_id))
    );

-- ── custom_items (herda o recorte da base) ──────────────────────────────────
DROP POLICY IF EXISTS "authenticated_write_custom_items" ON public.custom_items;

CREATE POLICY "custom_items_update" ON public.custom_items
    FOR UPDATE TO authenticated
    USING (
        database_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.custom_databases d
             WHERE d.id = custom_items.database_id
               AND (public.is_org_member(d.organization_id)
                    OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                                WHERE sh.database_id = d.id
                                  AND public.is_org_member(sh.target_org_id)))
        )
    );

CREATE POLICY "custom_items_delete" ON public.custom_items
    FOR DELETE TO authenticated
    USING (
        database_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.custom_databases d
             WHERE d.id = custom_items.database_id
               AND (public.is_org_member(d.organization_id)
                    OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                                WHERE sh.database_id = d.id
                                  AND public.is_org_member(sh.target_org_id)))
        )
    );

-- ── rubrics: UPDATE/DELETE eram USING(true) ─────────────────────────────────
DROP POLICY IF EXISTS "rubrics_update_all" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_delete_all" ON public.rubrics;

CREATE POLICY "rubrics_update" ON public.rubrics
    FOR UPDATE TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (SELECT 1 FROM public.rubric_org_shares sh
                    WHERE sh.rubric_code = rubrics.code
                      AND public.is_org_member(sh.target_org_id))
    );

-- Seed de CLT (organization_id NULL) fica FORA do UPDATE/DELETE de propósito:
-- é dado do sistema, alterado por migration, não pela tela.
CREATE POLICY "rubrics_delete" ON public.rubrics
    FOR DELETE TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (SELECT 1 FROM public.rubric_org_shares sh
                    WHERE sh.rubric_code = rubrics.code
                      AND public.is_org_member(sh.target_org_id))
    );

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE v_permissivas text;
BEGIN
    -- Nenhuma policy pode voltar a liberar SELECT sem condição nestas três.
    SELECT string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ')
      INTO v_permissivas
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('custom_databases','custom_items','rubrics')
       AND cmd IN ('ALL','SELECT')
       AND qual = 'true';

    IF v_permissivas IS NOT NULL THEN
        RAISE EXCEPTION 'catalogos: ainda ha policy liberando leitura sem condicao: %', v_permissivas;
    END IF;

    RAISE NOTICE 'OK: leitura, alteracao e remocao dos catalogos recortadas. INSERT nasce escopado na aplicar_...017.';
END $$;
