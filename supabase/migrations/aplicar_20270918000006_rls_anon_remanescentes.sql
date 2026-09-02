-- ============================================================
-- Migration: aplicar_20270918000006_rls_anon_remanescentes.sql
-- SEGURANÇA — achados C1-03 (média) e C1-04 (baixa) da auditoria de 2026-09-01
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 4.1
--
-- C1-03 — opura_cno_areas / opura_cno_reductions
-- Duas policies `FOR ALL TO anon USING (true)` que escaparam do rollout da
-- migration 20270208000002 (que removeu 81 policies do mesmo tipo). Leitura,
-- escrita E exclusão por qualquer portador da chave pública. Hoje as tabelas
-- estão vazias, então não há vazamento em curso — é buraco latente, que vira
-- exposição total no dia em que o módulo CNO receber dados.
-- Seguro remover: as duas já têm `cno_*_org_access` para `authenticated`.
--
-- C1-04 — payment_types
-- Tem coluna de tenant, mas as duas policies usam USING(true) para
-- authenticated: qualquer usuário logado lê, altera e apaga os tipos de
-- pagamento de qualquer organização. Foi a única tabela com coluna de tenant
-- nessa condição em toda a varredura. A tabela está VAZIA hoje (0 linhas), então
-- apertar agora tem risco zero e evita que o catálogo nasça cross-tenant.
--
-- A leitura preserva a perna `organization_id IS NULL`, reservada aos seeds do
-- sistema (CLAUDE.md › REGRA OBRIGATÓRIA #5). A ESCRITA não preserva: seed de
-- sistema se cria por migration, não pelo app.
-- ============================================================

-- ── C1-03 ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon all on opura_cno_areas"      ON public.opura_cno_areas;
DROP POLICY IF EXISTS "Allow anon all on opura_cno_reductions" ON public.opura_cno_reductions;

-- ── C1-04 ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated users to manage payment types" ON public.payment_types;
DROP POLICY IF EXISTS "Allow authenticated users to read payment types"   ON public.payment_types;

CREATE POLICY "payment_types_org_select" ON public.payment_types
    FOR SELECT TO authenticated
    USING (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "payment_types_org_write" ON public.payment_types
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_anon_cno   int;
    v_pt_frouxa  int;
    v_cno_auth   int;
BEGIN
    SELECT count(*) INTO v_anon_cno
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('opura_cno_areas','opura_cno_reductions')
       AND 'anon' = ANY(roles);

    -- Sobra alguma policy de payment_types liberando linha sem checar organização?
    -- (a de SELECT tem a perna dos seeds globais, que é intencional)
    SELECT count(*) INTO v_pt_frouxa
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'payment_types'
       AND (qual = 'true' OR with_check = 'true');

    SELECT count(*) INTO v_cno_auth
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('opura_cno_areas','opura_cno_reductions')
       AND 'authenticated' = ANY(roles);

    IF v_anon_cno > 0 THEN
        RAISE EXCEPTION 'C1-03: ainda restam % policy(ies) anon em opura_cno_*', v_anon_cno;
    END IF;
    IF v_pt_frouxa > 0 THEN
        RAISE EXCEPTION 'C1-04: ainda restam % policy(ies) sem recorte em payment_types', v_pt_frouxa;
    END IF;
    IF v_cno_auth < 2 THEN
        RAISE EXCEPTION 'C1-03: opura_cno_* ficaria sem policy authenticated — modulo CNO quebraria';
    END IF;

    RAISE NOTICE 'C1-03/C1-04 OK: anon removido de opura_cno_*; payment_types recortado por organizacao.';
END $$;
