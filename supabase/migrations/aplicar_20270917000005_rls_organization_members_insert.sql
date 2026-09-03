-- ============================================================
-- Migration: aplicar_20270917000005_rls_organization_members_insert.sql
-- SEGURANÇA — achado C1-01 da auditoria de 2026-09-01 (severidade: CRÍTICA)
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 1.1
--
-- PROBLEMA
-- A policy "Authenticated users can create memberships" era:
--
--     for insert to authenticated with check (true)
--
-- WITH CHECK (true) não restringe organization_id, não restringe email e não
-- restringe role. Como `organization_members` é a tabela que is_org_member() e
-- is_org_manager() consultam para resolver TODA a RLS org-scoped do sistema,
-- qualquer conta autenticada podia se declarar `owner` de qualquer organização
-- com um único INSERT — e a partir daí ler e escrever financeiro, folha,
-- contratos e documentos daquele tenant.
--
-- Comprovado em produção (transação abortada): is_org_manager FALSE → TRUE e
-- internal_transactions visíveis 0 → 2214.
-- Prova: docs/security-audit/provas/poc-c1-01-escalada-owner.sql
--
-- CORREÇÃO
-- Basta REMOVER a policy permissiva. Não é preciso criar nada no lugar:
--
--   • A policy "Owners and admins can manage members" já é FOR ALL com
--     WITH CHECK (is_org_manager(organization_id) OR is_superadmin()) — e em
--     INSERT é o WITH CHECK que vale. Ela cobre o caso legítimo (admin/owner
--     gerenciando membros pela tela de Organizações).
--
--   • A criação de organização NÃO depende desta policy: o app chama a RPC
--     `create_organization_v2`, que é SECURITY DEFINER (verificado em
--     pg_proc.prosecdef) e portanto grava o primeiro `owner` ignorando a RLS.
--     `organization_members` não tem FORCE ROW LEVEL SECURITY, então o bypass
--     do owner da tabela vale.
--
-- Idempotente: DROP POLICY IF EXISTS.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can create memberships"
    ON public.organization_members;

-- ── Verificação embutida ────────────────────────────────────────────────────
-- Falha a migration se a policy permissiva sobreviver, ou se a policy que
-- precisa assumir o INSERT não estiver no lugar.
DO $$
DECLARE
    v_permissiva int;
    v_gestora    int;
BEGIN
    SELECT count(*) INTO v_permissiva
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'organization_members'
       AND cmd IN ('INSERT', 'ALL')
       AND coalesce(with_check, 'true') = 'true';

    SELECT count(*) INTO v_gestora
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'organization_members'
       AND cmd = 'ALL'
       AND with_check LIKE '%is_org_manager%';

    IF v_permissiva > 0 THEN
        RAISE EXCEPTION 'C1-01: ainda existem % policy(ies) de INSERT/ALL sem restricao em organization_members', v_permissiva;
    END IF;

    IF v_gestora = 0 THEN
        RAISE EXCEPTION 'C1-01: nenhuma policy ALL com is_org_manager restou — INSERT ficaria bloqueado ate para admins';
    END IF;

    RAISE NOTICE 'C1-01 OK: policy permissiva removida; INSERT coberto por is_org_manager/is_superadmin.';
END $$;
