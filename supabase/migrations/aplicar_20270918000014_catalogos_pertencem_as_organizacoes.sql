-- ============================================================
-- Migration: aplicar_20270918000014_catalogos_pertencem_as_organizacoes.sql
-- SEGURANÇA — C1-06 (catálogos sem dono) da auditoria de 2026-09-01
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md
--
-- O PROBLEMA
-- `custom_databases`, `custom_items` e `rubrics` não têm coluna de tenant
-- NENHUMA, e as policies são `USING (true)` para authenticated. Não é policy
-- frouxa, é modelagem: hoje são globais. Como as quatro organizações do banco
-- pertencem ao mesmo cliente, nada vaza AGORA — o defeito vira vazamento no dia
-- em que o segundo cliente entrar no SaaS.
--
-- A DECISÃO DO DONO (2026-09-02)
-- "todas organizações significa que pertence a todas as organizações" — ou seja,
-- pertence às QUATRO organizações do grupo, e não a quem mais entrar depois.
--
-- POR QUE ENUMERAR, E NÃO MARCAR COMO GLOBAL
-- `organization_id = NULL` significa "todo mundo" — é o estado atual, e o
-- CLAUDE.md › REGRA #5 é explícito: "um NULL apareceria para todos os clientes
-- do SaaS". E não dá para o banco INFERIR "todas as minhas organizações": um
-- gatilho em `organizations` pegaria também a organização do cliente #2, porque
-- ela também é um INSERT ali. Sem conceito de grupo declarado, pertencimento
-- tem de ser enumerado. Por eliminação, sobra a tabela de vínculo — que é
-- exatamente como `employee_org_shares` (já existente) modela o mesmo problema.
--
-- POR QUE NÃO REPLICAR UMA CÓPIA POR ORGANIZAÇÃO
-- Seria o padrão `forEachTargetOrg` da REGRA #5, mas o schema impede:
-- `rubrics` tem PRIMARY KEY (code) e `custom_items` tem UNIQUE (code). A segunda
-- cópia violaria a chave. Trocar para chave composta arrastaria as 3 FKs que
-- apontam para `rubrics(code)` (payroll_events, payroll_items,
-- employee_automatic_rubrics) — migração de PK em cima da folha de pagamento.
--
-- `custom_items` NÃO ganha coluna: o recorte vem do `database_id`. Além de
-- evitar o UNIQUE(code), mantém a verdade do modelo — o item pertence à base,
-- e a base é que pertence às organizações.
--
-- ESCOPO: LEITURA. A escrita continua como está, de propósito — apertar o
-- INSERT exige passar `organizationId` nos fluxos de criação seguindo a
-- REGRA #5 (`useOrgWriteTarget`), o que é mudança de UI e merece passo próprio.
-- O valor de segurança aqui é impedir que o cliente #2 LEIA este acervo.
-- ============================================================

-- ── 1. Coluna de dono ───────────────────────────────────────────────────────
ALTER TABLE public.custom_databases
    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

ALTER TABLE public.rubrics
    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Dona = a organização com dado real (a que tem fornecedores e folha).
-- Escolhida por consulta, não cravada: se o banco mudar, a migration acompanha.
DO $$
DECLARE v_dona uuid;
BEGIN
    SELECT o.id INTO v_dona
      FROM public.organizations o
      LEFT JOIN public.suppliers s ON s.organization_id = o.id
     GROUP BY o.id
     ORDER BY count(s.id) DESC, o.created_at ASC
     LIMIT 1;

    IF v_dona IS NULL THEN
        RAISE EXCEPTION 'catalogos: nenhuma organizacao encontrada para ser dona';
    END IF;

    UPDATE public.custom_databases SET organization_id = v_dona WHERE organization_id IS NULL;

    -- Rubricas obrigatórias da CLT (INSS/FGTS/IRRF) são lei federal: ficam como
    -- SEED DO SISTEMA, com organization_id NULL. É o uso que a REGRA #5 reserva
    -- ao NULL — o mesmo das 38 categorias financeiras padrão.
    UPDATE public.rubrics
       SET organization_id = v_dona
     WHERE organization_id IS NULL
       AND NOT coalesce(is_clt_mandatory, false);

    RAISE NOTICE 'catalogos: dona = %', v_dona;
END $$;

-- ── 2. Pertencimento explícito ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_database_org_shares (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    database_id   uuid NOT NULL REFERENCES public.custom_databases(id) ON DELETE CASCADE,
    target_org_id uuid NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (database_id, target_org_id)
);

CREATE TABLE IF NOT EXISTS public.rubric_org_shares (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_code   text NOT NULL REFERENCES public.rubrics(code) ON DELETE CASCADE,
    target_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rubric_code, target_org_id)
);

CREATE INDEX IF NOT EXISTS idx_cdos_target_org ON public.custom_database_org_shares (target_org_id);
CREATE INDEX IF NOT EXISTS idx_ros_target_org  ON public.rubric_org_shares (target_org_id);

-- ── 3. Backfill: "pertence a TODAS as organizações" de hoje ─────────────────
INSERT INTO public.custom_database_org_shares (database_id, target_org_id)
SELECT d.id, o.id FROM public.custom_databases d CROSS JOIN public.organizations o
ON CONFLICT (database_id, target_org_id) DO NOTHING;

INSERT INTO public.rubric_org_shares (rubric_code, target_org_id)
SELECT r.code, o.id
  FROM public.rubrics r CROSS JOIN public.organizations o
 WHERE r.organization_id IS NOT NULL          -- seeds de CLT não precisam: já são globais
ON CONFLICT (rubric_code, target_org_id) DO NOTHING;

-- ── 4. RLS nas tabelas de vínculo ───────────────────────────────────────────
ALTER TABLE public.custom_database_org_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_org_shares          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdos_select" ON public.custom_database_org_shares;
CREATE POLICY "cdos_select" ON public.custom_database_org_shares
    FOR SELECT TO authenticated
    USING (public.is_org_member(target_org_id) OR public.is_superadmin());

DROP POLICY IF EXISTS "cdos_manage" ON public.custom_database_org_shares;
CREATE POLICY "cdos_manage" ON public.custom_database_org_shares
    FOR ALL TO authenticated
    USING (public.is_org_manager(target_org_id) OR public.is_superadmin())
    WITH CHECK (public.is_org_manager(target_org_id) OR public.is_superadmin());

DROP POLICY IF EXISTS "ros_select" ON public.rubric_org_shares;
CREATE POLICY "ros_select" ON public.rubric_org_shares
    FOR SELECT TO authenticated
    USING (public.is_org_member(target_org_id) OR public.is_superadmin());

DROP POLICY IF EXISTS "ros_manage" ON public.rubric_org_shares;
CREATE POLICY "ros_manage" ON public.rubric_org_shares
    FOR ALL TO authenticated
    USING (public.is_org_manager(target_org_id) OR public.is_superadmin())
    WITH CHECK (public.is_org_manager(target_org_id) OR public.is_superadmin());

-- ── 5. Leitura recortada ────────────────────────────────────────────────────
-- Nenhum serviço precisa mudar: `customDatabaseService.listDatabases()` e o
-- `payrollService` já consultam sem filtro de organização, e a RLS passa a
-- recortar sozinha. Hoje o resultado é idêntico ao de antes — as quatro
-- organizações continuam vendo tudo, porque o backfill acima diz isso.

DROP POLICY IF EXISTS "authenticated_read_custom_databases" ON public.custom_databases;
CREATE POLICY "custom_databases_select" ON public.custom_databases
    FOR SELECT TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.custom_database_org_shares sh
             WHERE sh.database_id = custom_databases.id
               AND public.is_org_member(sh.target_org_id)
        )
    );

-- Item herda da base: sem coluna própria, sem tocar no UNIQUE(code).
DROP POLICY IF EXISTS "authenticated_read_custom_items" ON public.custom_items;
CREATE POLICY "custom_items_select" ON public.custom_items
    FOR SELECT TO authenticated
    USING (
        database_id IS NULL          -- item solto, legado: continua visível
        OR EXISTS (
            SELECT 1 FROM public.custom_databases d
             WHERE d.id = custom_items.database_id
               AND (
                   public.is_org_member(d.organization_id)
                   OR EXISTS (
                       SELECT 1 FROM public.custom_database_org_shares sh
                        WHERE sh.database_id = d.id
                          AND public.is_org_member(sh.target_org_id)
                   )
               )
        )
    );

DROP POLICY IF EXISTS "rubrics_read_all" ON public.rubrics;
CREATE POLICY "rubrics_select" ON public.rubrics
    FOR SELECT TO authenticated
    USING (
        organization_id IS NULL      -- seed do sistema (CLT), vale para todos
        OR public.is_org_member(organization_id)
        OR EXISTS (
            SELECT 1 FROM public.rubric_org_shares sh
             WHERE sh.rubric_code = rubrics.code
               AND public.is_org_member(sh.target_org_id)
        )
    );

-- ── 6. Verificação embutida ─────────────────────────────────────────────────
DO $$
DECLARE
    v_orgs int; v_db int; v_rub int;
    v_db_shares int; v_rub_shares int;
    v_clt int; v_sem_dono int;
BEGIN
    SELECT count(*) INTO v_orgs FROM public.organizations;
    SELECT count(*) INTO v_db   FROM public.custom_databases;
    SELECT count(*) INTO v_rub  FROM public.rubrics WHERE organization_id IS NOT NULL;
    SELECT count(*) INTO v_clt  FROM public.rubrics WHERE organization_id IS NULL;
    SELECT count(*) INTO v_db_shares  FROM public.custom_database_org_shares;
    SELECT count(*) INTO v_rub_shares FROM public.rubric_org_shares;

    SELECT count(*) INTO v_sem_dono FROM public.custom_databases WHERE organization_id IS NULL;
    IF v_sem_dono > 0 THEN
        RAISE EXCEPTION 'catalogos: % base(s) de dados sem dona apos o backfill', v_sem_dono;
    END IF;

    -- Cada registro tem de pertencer a TODAS as organizações — é o pedido.
    IF v_db_shares <> v_db * v_orgs THEN
        RAISE EXCEPTION 'catalogos: esperava % vinculos de base (% x %), encontrei %',
            v_db * v_orgs, v_db, v_orgs, v_db_shares;
    END IF;
    IF v_rub_shares <> v_rub * v_orgs THEN
        RAISE EXCEPTION 'catalogos: esperava % vinculos de rubrica (% x %), encontrei %',
            v_rub * v_orgs, v_rub, v_orgs, v_rub_shares;
    END IF;

    RAISE NOTICE 'OK: % organizacoes | % base(s) com % vinculos | % rubricas com % vinculos | % rubricas CLT como seed global',
        v_orgs, v_db, v_db_shares, v_rub, v_rub_shares, v_clt;
    RAISE NOTICE 'ESCRITA continua aberta de proposito — apertar o INSERT exige passar organizationId nos fluxos de criacao (REGRA #5).';
END $$;
