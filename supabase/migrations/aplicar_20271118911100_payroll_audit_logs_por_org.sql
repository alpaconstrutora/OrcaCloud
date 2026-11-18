-- ==========================================================================
-- payroll_audit_logs (histórico de rubrica e de evento da folha): cada organização lê e
-- grava só o que é dela; 'SYSTEM' deixa de ser lido por todo mundo
-- Date: 2026-11-18
-- Prova: scripts/teste-compartilhamentos-e-auditoria-folha.sql
-- Base:  policies vigentes no banco em 18/11 (lidas de pg_policies). O repositório ainda diz
--        "payroll_audit_logs_manage_all FOR ALL USING (true)" (20260327183000) — drift: o banco
--        já tinha trocado por estas duas, por e-mail:
--          payroll_audit_logs_select  USING      (org_id = 'SYSTEM' OR org_id IN (orgs do e-mail do JWT))
--          payroll_audit_logs_insert  WITH CHECK (org_id = 'SYSTEM' OR org_id IN (orgs do e-mail do JWT))
-- ==========================================================================
-- Origem: revisores da varredura Claude Security de 15/11/2026 (nota de F13: "payroll_audit_logs
-- with USING (true)").
--
-- O QUE AINDA ESTAVA ABERTO NO BANCO
--   A perna `org_id = 'SYSTEM'` libera a linha sozinha (REGRA #7, pergunta 1). E o front grava
--   TODA alteração de rubrica em 'SYSTEM' (payrollService.createRubric/updateRubric/deleteRubric),
--   embora desde 02/09 a rubrica tenha dona (rubrics.organization_id). Resultado: o histórico das
--   rubricas de uma organização — nome, fórmula, configuração de cálculo, antes e depois, e o
--   e-mail de quem alterou — era lido por QUALQUER usuário logado de qualquer cliente, e
--   qualquer um gravava linha 'SYSTEM' (histórico forjado, com o e-mail que quisesse).
--   Dados em 18/11: 55 linhas; 45 'SYSTEM' (29 de rubrica de org, 2 de rubrica global, 14 de
--   rubrica já excluída — 'VALE REFEIÇÃO', 'ADIANTAMENTO*', 'TESTE_CODE_TRAJETORIA', ''); 10 de
--   evento, por org. Depois do UPDATE: 16 'SYSTEM' (2 globais, 14 de excluída — só superadmin).
--
-- O QUE MUDA
--   Dados (uma vez, idempotente): as linhas 'SYSTEM' de rubrica que hoje tem dona vão para a org
--     dona (UPDATE … FROM rubrics). 'SYSTEM' fica só para rubrica global e para rubrica já
--     excluída (dona desconhecida — o JSON antigo não guarda a org).
--   Ler (SELECT):
--     · linha de uma org minha (minhas_orgs_membro(), por conjunto — antes era só o e-mail);
--     · histórico de RUBRICA que eu enxergo, na org DONA atual dela: rubrica visível para mim
--       pela RLS de rubrics (da minha org ou compartilhada comigo por rubric_org_shares) com
--       organization_id = org_id da linha — quem pode ver e editar a rubrica vê o histórico dela;
--     · 'SYSTEM' só de rubrica GLOBAL (dona NULL). Não basta "existe rubrica com esse código":
--       a PK de rubrics é o código, e quem recriasse 'VALE REFEIÇÃO' na própria org passaria a
--       ler o histórico da rubrica excluída de outra org (revisão de 18/11);
--     · superadmin vê tudo (inclusive o de rubrica já excluída).
--   Gravar (INSERT):
--     · user_email tem de ser o e-mail do JWT (o front já manda esse — auth.getUser());
--     · na org minha; ou histórico de RUBRICA na org DONA de rubrica que enxergo (quem recebeu a
--       rubrica compartilhada e a edita registra na org dona); 'SYSTEM' só superadmin.
--   UPDATE/DELETE seguem sem policy (histórico não se edita). anon perde o privilégio de tabela
--   (já não tinha policy).
--   Código desta entrega: o front passa a gravar o histórico de rubrica na org DONA
--   (orgDoLogDaRubrica; 'SYSTEM' só para rubrica global) e a ler sem filtro de org (a RLS recorta).
--
-- ORDEM: DEPOIS do merge (front publicado). Antes dele, o bundle velho grava rubrica em 'SYSTEM',
-- que esta policy recusa: o registro de histórico se perde em silêncio (logAction não interrompe
-- a tela), nada quebra. Bundle velho em cache depois do merge: idem, até recarregar.
--
-- COMO CONFERIR
--   npx supabase db query --linked -o table "SELECT policyname, cmd, roles::text, qual, with_check FROM pg_policies WHERE tablename='payroll_audit_logs'"
--   → só payroll_audit_logs_select e payroll_audit_logs_insert, TO authenticated, sem a perna
--     "org_id = 'SYSTEM' OR" solta.
--   npx supabase db query --linked -o table "SELECT count(*) FROM payroll_audit_logs l JOIN rubrics r ON r.code = l.entity_id WHERE l.org_id = 'SYSTEM' AND l.entity_type = 'RUBRIC' AND r.organization_id IS NOT NULL"
--   → 0 (nenhum histórico 'SYSTEM' de rubrica que tem dona).
--   E a prova inteira: npx supabase db query --linked -f scripts/teste-compartilhamentos-e-auditoria-folha.sql
--
-- ROLLBACK (volta às duas policies de 18/11; o UPDATE de dados não precisa voltar — com as
-- policies antigas, linha na org dona continua legível pelos membros dela)
--   DROP POLICY payroll_audit_logs_select ON public.payroll_audit_logs;
--   DROP POLICY payroll_audit_logs_insert ON public.payroll_audit_logs;
--   CREATE POLICY payroll_audit_logs_select ON public.payroll_audit_logs FOR SELECT TO authenticated
--     USING ((org_id = 'SYSTEM') OR (org_id IN (SELECT organization_members.organization_id::text
--            FROM organization_members WHERE organization_members.email = (auth.jwt() ->> 'email'))));
--   CREATE POLICY payroll_audit_logs_insert ON public.payroll_audit_logs FOR INSERT TO authenticated
--     WITH CHECK ((org_id = 'SYSTEM') OR (org_id IN (SELECT organization_members.organization_id::text
--            FROM organization_members WHERE organization_members.email = (auth.jwt() ->> 'email'))));
--   GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.payroll_audit_logs TO anon;
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Histórico 'SYSTEM' de rubrica que tem dona vai para a org dona (idempotente: 2ª vez, 0 linhas).
UPDATE public.payroll_audit_logs l
   SET org_id = r.organization_id::text
  FROM public.rubrics r
 WHERE l.org_id = 'SYSTEM'
   AND l.entity_type = 'RUBRIC'
   AND r.code = l.entity_id
   AND r.organization_id IS NOT NULL;

DROP POLICY IF EXISTS payroll_audit_logs_select ON public.payroll_audit_logs;
DROP POLICY IF EXISTS payroll_audit_logs_insert ON public.payroll_audit_logs;
-- Nomes do repositório (20260326190001 / 20260327183000), caso algum ambiente ainda os tenha.
DROP POLICY IF EXISTS payroll_audit_logs_manage_all ON public.payroll_audit_logs;
DROP POLICY IF EXISTS "Users can view logs of their organization" ON public.payroll_audit_logs;

CREATE POLICY payroll_audit_logs_select ON public.payroll_audit_logs
    FOR SELECT TO authenticated
    USING (
        COALESCE(org_id IN (SELECT public.minhas_orgs_membro()::text), false)
        OR (entity_type = 'RUBRIC' AND EXISTS (
                -- sujeita à RLS de rubrics: só rubrica que quem lê enxerga, e só o histórico
                -- da dona ATUAL dela ('SYSTEM' só se ela é global)
                SELECT 1
                  FROM public.rubrics r
                 WHERE r.code = payroll_audit_logs.entity_id
                   AND ((payroll_audit_logs.org_id = 'SYSTEM' AND r.organization_id IS NULL)
                        OR r.organization_id::text = payroll_audit_logs.org_id)))
        OR public.is_superadmin()
    );

CREATE POLICY payroll_audit_logs_insert ON public.payroll_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
        AND (
            COALESCE(org_id IN (SELECT public.minhas_orgs_membro()::text), false)
            OR (entity_type = 'RUBRIC' AND org_id <> 'SYSTEM' AND EXISTS (
                    SELECT 1
                      FROM public.rubrics r
                     WHERE r.code = payroll_audit_logs.entity_id
                       AND r.organization_id::text = payroll_audit_logs.org_id))
            OR (org_id = 'SYSTEM' AND public.is_superadmin())
        )
    );

REVOKE ALL ON TABLE public.payroll_audit_logs FROM anon;

COMMIT;
