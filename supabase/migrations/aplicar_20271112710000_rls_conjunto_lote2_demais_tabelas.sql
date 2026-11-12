-- ════════════════════════════════════════════════════════════════════════════
-- RLS: is_org_member por linha → conjunto de orgs calculado uma vez — LOTE 2
-- o resto do schema public: 564 policies em 332 tabelas
-- ════════════════════════════════════════════════════════════════════════════
-- GERADO por scripts/rls-trocar-is-org-member.mjs a partir do retrato
-- docs/planos/2026-11-11-rls-is-org-member/policies-antes.json — não editar à mão;
-- regerar. Plano: docs/planos/2026-11-11-rls-is-org-member-tabelas-grandes.md
--
-- Cada is_org_member(X) vira COALESCE((X) IN (SELECT public.minhas_orgs_membro()), false):
-- mesmo booleano (inclusive X nulo), calculado uma vez por consulta. Só as cláusulas
-- que tinham a chamada mudam; nome, comando, papéis e as demais pernas ficam.
--
-- REGRA #7 — Pergunta 1: nenhuma perna nova; cada chamada é trocada no lugar.
-- Pergunta 2: nenhuma função nova. minhas_orgs_membro (aplicar_20271111940000) ganha
-- EXECUTE para anon quando o lote tem policy de papel {public}: o anon avalia essas
-- policies (mesmo motivo de is_org_member em aplicar_20271111930000); com JWT vazio
-- ela devolve conjunto vazio.
--
-- TRAVA: cada ALTER POLICY trava a tabela por milissegundos. lock_timeout de 2 s: se
-- uma tabela estiver ocupada o comando falha em vez de enfileirar o app — rodar de novo.
-- VOLTA: docs/planos/2026-11-11-rls-is-org-member/volta-lote-2.sql
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).

SET lock_timeout = '2s';

-- Policies de papel {public} neste lote: 122.
GRANT EXECUTE ON FUNCTION public.minhas_orgs_membro() TO anon;

-- ALL · {authenticated} · 1 troca(s) · 170 linhas
ALTER POLICY "Manage reconciliation_suggestions as member" ON "public"."reconciliation_suggestions"
  USING ((EXISTS ( SELECT 1
   FROM bank_transactions bt
  WHERE ((bt.id = reconciliation_suggestions.bank_transaction_id) AND COALESCE((bt.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {authenticated} · 1 troca(s) · 140 linhas
ALTER POLICY "Manage reconciliation_matches as member" ON "public"."reconciliation_matches"
  USING ((EXISTS ( SELECT 1
   FROM bank_transactions bt
  WHERE ((bt.id = reconciliation_matches.bank_transaction_id) AND COALESCE((bt.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {authenticated} · 2 troca(s) · 131 linhas
ALTER POLICY "blueprint_branches_org" ON "public"."blueprint_branches"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 131 linhas
ALTER POLICY "blueprint_studies_org" ON "public"."blueprint_studies"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 97 linhas
ALTER POLICY "Enable access to organization members" ON "public"."commercial_properties"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 93 linhas
ALTER POLICY "email_capture_messages_ler" ON "public"."email_capture_messages"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 93 linhas
ALTER POLICY "reconciliation_runs_org" ON "public"."reconciliation_runs"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 90 linhas
ALTER POLICY "Create audit logs as member" ON "public"."reconciliation_audit_log"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 90 linhas
ALTER POLICY "View audit logs as member" ON "public"."reconciliation_audit_log"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 89 linhas
ALTER POLICY "cos_manage" ON "public"."client_org_shares"
  USING ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 89 linhas
ALTER POLICY "cos_select" ON "public"."client_org_shares"
  USING ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 72 linhas
ALTER POLICY "condominio_rateio_itens_org_all" ON "public"."condominio_rateio_itens"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 69 linhas
ALTER POLICY "tasks_select_assignee" ON "public"."tasks"
  USING (((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- UPDATE · {public} · 2 troca(s) · 69 linhas
ALTER POLICY "tasks_update_assignee" ON "public"."tasks"
  USING (((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {authenticated} · 2 troca(s) · 60 linhas
ALTER POLICY "blueprint_study_climatizacao_org" ON "public"."blueprint_study_climatizacao"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 1 troca(s) · 48 linhas
ALTER POLICY "Users can manage contract of their organization" ON "public"."contracts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 48 linhas
ALTER POLICY "Users can view contract of their organization" ON "public"."contracts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 43 linhas
ALTER POLICY "spa_select" ON "public"."supplier_payments_auditoria"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 40 linhas
ALTER POLICY "payroll_events_v2_access" ON "public"."payroll_events"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 37 linhas
ALTER POLICY "unit_occupancies_org_delete" ON "public"."unit_occupancies"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 37 linhas
ALTER POLICY "unit_occupancies_org_insert" ON "public"."unit_occupancies"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 37 linhas
ALTER POLICY "unit_occupancies_org_read" ON "public"."unit_occupancies"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 37 linhas
ALTER POLICY "unit_occupancies_org_update" ON "public"."unit_occupancies"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 36 linhas
ALTER POLICY "broker_profiles_manage" ON "public"."broker_profiles"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 36 linhas
ALTER POLICY "broker_profiles_select" ON "public"."broker_profiles"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((auth.jwt() ->> 'email'::text) = email) OR is_superadmin()));

-- ALL · {authenticated} · 4 troca(s) · 29 linhas
ALTER POLICY "projects_org_access" ON "public"."projects"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((organization_id IS NULL) AND COALESCE((((settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false))))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((organization_id IS NULL) AND COALESCE((((settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false))));

-- ALL · {authenticated} · 2 troca(s) · 27 linhas
ALTER POLICY "bank_statement_imports_org" ON "public"."bank_statement_imports"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 26 linhas
ALTER POLICY "Members can view coworkers" ON "public"."organization_members"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 26 linhas
ALTER POLICY "preferencias_delete" ON "public"."preferencias"
  USING ((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))));

-- INSERT · {authenticated} · 1 troca(s) · 26 linhas
ALTER POLICY "preferencias_insert" ON "public"."preferencias"
  WITH CHECK ((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))));

-- SELECT · {authenticated} · 2 troca(s) · 26 linhas
ALTER POLICY "preferencias_select" ON "public"."preferencias"
  USING ((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))));

-- UPDATE · {authenticated} · 2 troca(s) · 26 linhas
ALTER POLICY "preferencias_update" ON "public"."preferencias"
  USING ((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))))
  WITH CHECK ((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))));

-- DELETE · {authenticated} · 1 troca(s) · 24 linhas
ALTER POLICY "document_numbering_settings_delete" ON "public"."document_numbering_settings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 24 linhas
ALTER POLICY "document_numbering_settings_insert" ON "public"."document_numbering_settings"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 24 linhas
ALTER POLICY "document_numbering_settings_select" ON "public"."document_numbering_settings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 24 linhas
ALTER POLICY "document_numbering_settings_update" ON "public"."document_numbering_settings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 24 linhas
ALTER POLICY "payroll_runs_v2_access" ON "public"."payroll_runs"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 22 linhas
ALTER POLICY "blueprint_study_casa_org" ON "public"."blueprint_study_casa"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {public} · 1 troca(s) · 21 linhas
ALTER POLICY "task_statuses_delete" ON "public"."task_statuses"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {public} · 1 troca(s) · 21 linhas
ALTER POLICY "task_statuses_insert" ON "public"."task_statuses"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 21 linhas
ALTER POLICY "task_statuses_select" ON "public"."task_statuses"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {public} · 1 troca(s) · 21 linhas
ALTER POLICY "task_statuses_update" ON "public"."task_statuses"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 14 linhas
ALTER POLICY "Members can manage clients" ON "public"."clients"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 2 troca(s) · 14 linhas
ALTER POLICY "clients_select" ON "public"."clients"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM client_org_shares sh
  WHERE ((sh.client_id = clients.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- ALL · {public} · 1 troca(s) · 14 linhas
ALTER POLICY "employees_org_access" ON "public"."employees"
  USING ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_employee_shared_with_user(id)));

-- SELECT · {authenticated} · 1 troca(s) · 13 linhas
ALTER POLICY "email_capture_buscas_ler" ON "public"."email_capture_buscas"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 11 linhas
ALTER POLICY "purchase_order_number_history_select" ON "public"."purchase_order_number_history"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 10 linhas
ALTER POLICY "supplier_payments_select" ON "public"."supplier_payments"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 9 linhas
ALTER POLICY "employee_automatic_rubrics_org_access" ON "public"."employee_automatic_rubrics"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 9 linhas
ALTER POLICY "vr_calculos_org_access" ON "public"."vr_calculos"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 8 linhas
ALTER POLICY "blueprint_element_type_org_delete" ON "public"."blueprint_element_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 8 linhas
ALTER POLICY "blueprint_element_type_org_insert" ON "public"."blueprint_element_types"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 8 linhas
ALTER POLICY "blueprint_element_type_org_read" ON "public"."blueprint_element_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 8 linhas
ALTER POLICY "blueprint_element_type_org_update" ON "public"."blueprint_element_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 8 linhas
ALTER POLICY "blueprint_study_produto_org" ON "public"."blueprint_study_produto"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 8 linhas
ALTER POLICY "client_portal_tokens_org_access" ON "public"."client_portal_tokens"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 7 linhas
ALTER POLICY "blueprint_study_hidro_org" ON "public"."blueprint_study_hidro"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 6 linhas
ALTER POLICY "blueprint_study_urban_context_org" ON "public"."blueprint_study_urban_context"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 6 linhas
ALTER POLICY "broker_tokens_auth_all" ON "public"."broker_portal_tokens"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 6 linhas
ALTER POLICY "financial_receipts_select_org" ON "public"."financial_receipts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 6 linhas
ALTER POLICY "product_brands_org" ON "public"."product_brands"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 5 linhas
ALTER POLICY "blueprint_snapshots_org_insert" ON "public"."blueprint_snapshots"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 5 linhas
ALTER POLICY "blueprint_snapshots_org_read" ON "public"."blueprint_snapshots"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 5 linhas
ALTER POLICY "blueprint_study_topografia_org" ON "public"."blueprint_study_topografia"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 5 linhas
ALTER POLICY "building_systems_org_delete" ON "public"."building_systems"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 5 linhas
ALTER POLICY "building_systems_org_insert" ON "public"."building_systems"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 5 linhas
ALTER POLICY "building_systems_org_read" ON "public"."building_systems"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 5 linhas
ALTER POLICY "building_systems_org_update" ON "public"."building_systems"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 5 linhas
ALTER POLICY "ios_select" ON "public"."investor_org_shares"
  USING ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {public} · 1 troca(s) · 4 linhas
ALTER POLICY "employee_shares_insert_delete" ON "public"."employee_org_shares"
  USING (COALESCE((( SELECT employees.org_id
   FROM employees
  WHERE (employees.id = employee_org_shares.employee_id))) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 2 troca(s) · 4 linhas
ALTER POLICY "employee_shares_select" ON "public"."employee_org_shares"
  USING ((COALESCE((( SELECT employees.org_id
   FROM employees
  WHERE (employees.id = employee_org_shares.employee_id))) IN (SELECT public.minhas_orgs_membro()), false) OR COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- DELETE · {public} · 1 troca(s) · 3 linhas
ALTER POLICY "document_templates_delete" ON "public"."document_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {public} · 1 troca(s) · 3 linhas
ALTER POLICY "document_templates_insert" ON "public"."document_templates"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 3 linhas
ALTER POLICY "document_templates_select" ON "public"."document_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {public} · 1 troca(s) · 3 linhas
ALTER POLICY "document_templates_update" ON "public"."document_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 3 linhas
ALTER POLICY "email_capture_senders_alterar" ON "public"."email_capture_senders"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((importacao = 'revisao'::text) OR is_org_manager(organization_id))));

-- INSERT · {authenticated} · 1 troca(s) · 3 linhas
ALTER POLICY "email_capture_senders_criar" ON "public"."email_capture_senders"
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((importacao = 'revisao'::text) OR is_org_manager(organization_id))));

-- DELETE · {authenticated} · 1 troca(s) · 3 linhas
ALTER POLICY "email_capture_senders_excluir" ON "public"."email_capture_senders"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 3 linhas
ALTER POLICY "email_capture_senders_ler" ON "public"."email_capture_senders"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 3 linhas
ALTER POLICY "Users can view their own organization" ON "public"."organizations"
  USING (COALESCE((id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 1 troca(s) · 3 linhas
ALTER POLICY "Manage reconciliation_rules as member" ON "public"."reconciliation_rules"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 3 linhas
ALTER POLICY "sba_authenticated_manage" ON "public"."supplier_bank_accounts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 3 linhas
ALTER POLICY "sba_authenticated_view" ON "public"."supplier_bank_accounts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "academy_access_logs_insert" ON "public"."academy_access_logs"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "academy_access_logs_select" ON "public"."academy_access_logs"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "academy_assignments_delete" ON "public"."academy_assignments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "academy_assignments_insert" ON "public"."academy_assignments"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "academy_assignments_select" ON "public"."academy_assignments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 2 linhas
ALTER POLICY "academy_assignments_update" ON "public"."academy_assignments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "academy_enrollments_delete" ON "public"."academy_enrollments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "academy_enrollments_insert" ON "public"."academy_enrollments"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "academy_enrollments_select" ON "public"."academy_enrollments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 2 linhas
ALTER POLICY "academy_enrollments_update" ON "public"."academy_enrollments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {public} · 1 troca(s) · 2 linhas
ALTER POLICY "commercial_price_table_items_delete" ON "public"."commercial_price_table_items"
  USING ((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- INSERT · {public} · 1 troca(s) · 2 linhas
ALTER POLICY "commercial_price_table_items_insert" ON "public"."commercial_price_table_items"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- SELECT · {public} · 1 troca(s) · 2 linhas
ALTER POLICY "commercial_price_table_items_select" ON "public"."commercial_price_table_items"
  USING ((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- UPDATE · {public} · 1 troca(s) · 2 linhas
ALTER POLICY "commercial_price_table_items_update" ON "public"."commercial_price_table_items"
  USING ((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- DELETE · {public} · 1 troca(s) · 2 linhas
ALTER POLICY "commercial_price_tables_delete" ON "public"."commercial_price_tables"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {public} · 1 troca(s) · 2 linhas
ALTER POLICY "commercial_price_tables_insert" ON "public"."commercial_price_tables"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 2 linhas
ALTER POLICY "commercial_price_tables_select" ON "public"."commercial_price_tables"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {public} · 1 troca(s) · 2 linhas
ALTER POLICY "commercial_price_tables_update" ON "public"."commercial_price_tables"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "pag_select" ON "public"."payment_account_gateway"
  USING ((EXISTS ( SELECT 1
   FROM payment_accounts pa
  WHERE ((pa.id = payment_account_gateway.payment_account_id) AND COALESCE((pa.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- SELECT · {authenticated} · 1 troca(s) · 2 linhas
ALTER POLICY "Users can view payment accounts" ON "public"."payment_accounts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_course_versions_delete" ON "public"."academy_course_versions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_course_versions_insert" ON "public"."academy_course_versions"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_course_versions_select" ON "public"."academy_course_versions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "academy_course_versions_update" ON "public"."academy_course_versions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_lessons_delete" ON "public"."academy_lessons"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_lessons_insert" ON "public"."academy_lessons"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_lessons_select" ON "public"."academy_lessons"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "academy_lessons_update" ON "public"."academy_lessons"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_modules_delete" ON "public"."academy_modules"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_modules_insert" ON "public"."academy_modules"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_modules_select" ON "public"."academy_modules"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "academy_modules_update" ON "public"."academy_modules"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_portal_users_delete" ON "public"."academy_portal_users"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_portal_users_insert" ON "public"."academy_portal_users"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "academy_portal_users_select" ON "public"."academy_portal_users"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "academy_portal_users_update" ON "public"."academy_portal_users"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "blueprint_medicao_org_delete" ON "public"."blueprint_measurements"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "blueprint_medicao_org_insert" ON "public"."blueprint_measurements"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "blueprint_medicao_org_read" ON "public"."blueprint_measurements"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "blueprint_medicao_org_update" ON "public"."blueprint_measurements"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "blueprint_snapshot_topografia_insert" ON "public"."blueprint_snapshot_topografia"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "blueprint_snapshot_topografia_read" ON "public"."blueprint_snapshot_topografia"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "blueprint_study_levantamento_org" ON "public"."blueprint_study_levantamento"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 4 troca(s) · 1 linhas
ALTER POLICY "Enable access to organization members" ON "public"."commercial_deal_buyers"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_deals d
  WHERE ((d.id = commercial_deal_buyers.deal_id) AND COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_deals d
  WHERE ((d.id = commercial_deal_buyers.deal_id) AND COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- ALL · {authenticated} · 4 troca(s) · 1 linhas
ALTER POLICY "Enable access to organization members" ON "public"."commercial_deal_units"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- ALL · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "Enable access to organization members" ON "public"."commercial_deals"
  USING ((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deals.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deals.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "condominio_aviso_leituras_org_all" ON "public"."condominio_aviso_leituras"
  USING ((EXISTS ( SELECT 1
   FROM condominio_avisos a
  WHERE ((a.id = condominio_aviso_leituras.aviso_id) AND COALESCE((a.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM condominio_avisos a
  WHERE ((a.id = condominio_aviso_leituras.aviso_id) AND COALESCE((a.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "contract_number_history_select" ON "public"."contract_number_history"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "darfs_membro_da_org" ON "public"."darfs"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "email_capture_accounts_ler" ON "public"."email_capture_accounts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {public} · 1 troca(s) · 1 linhas
ALTER POLICY "empreendimento_types_delete" ON "public"."empreendimento_types"
  USING (((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))))));

-- INSERT · {public} · 1 troca(s) · 1 linhas
ALTER POLICY "empreendimento_types_insert" ON "public"."empreendimento_types"
  WITH CHECK (((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))))));

-- SELECT · {public} · 1 troca(s) · 1 linhas
ALTER POLICY "empreendimento_types_read" ON "public"."empreendimento_types"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid())))));

-- UPDATE · {public} · 1 troca(s) · 1 linhas
ALTER POLICY "empreendimento_types_update" ON "public"."empreendimento_types"
  USING (((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))))));

-- ALL · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "financial_categories_org" ON "public"."financial_categories"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {public} · 1 troca(s) · 1 linhas
ALTER POLICY "hr_targets_org" ON "public"."hr_targets"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "maintenance_plan_items_org_delete" ON "public"."maintenance_plan_items"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "maintenance_plan_items_org_insert" ON "public"."maintenance_plan_items"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "maintenance_plan_items_org_read" ON "public"."maintenance_plan_items"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "maintenance_plan_items_org_update" ON "public"."maintenance_plan_items"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "partner_users_manage" ON "public"."partner_users"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "partner_users_select" ON "public"."partner_users"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (email = (auth.jwt() ->> 'email'::text))));

-- ALL · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "workspaces_manage_internal" ON "public"."partner_workspaces"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "workspaces_select_internal" ON "public"."partner_workspaces"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = partner_workspaces.supplier_id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- ALL · {public} · 1 troca(s) · 1 linhas
ALTER POLICY "portal_tokens_org_access" ON "public"."portal_tokens"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "rubrics_delete" ON "public"."rubrics"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "rubrics_insert" ON "public"."rubrics"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "rubrics_select" ON "public"."rubrics"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- UPDATE · {authenticated} · 2 troca(s) · 1 linhas
ALTER POLICY "rubrics_update" ON "public"."rubrics"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- DELETE · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "sales_plans_delete" ON "public"."sales_plans"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'draft'::text)));

-- INSERT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "sales_plans_insert" ON "public"."sales_plans"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "sales_plans_select" ON "public"."sales_plans"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 1 troca(s) · 1 linhas
ALTER POLICY "sales_plans_update" ON "public"."sales_plans"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 1 linhas
ALTER POLICY "termination_records_org_access" ON "public"."termination_records"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "absences_org_access" ON "public"."absences"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_assessment_questions_delete" ON "public"."academy_assessment_questions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_assessment_questions_insert" ON "public"."academy_assessment_questions"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_assessment_questions_select" ON "public"."academy_assessment_questions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_assessment_questions_update" ON "public"."academy_assessment_questions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_assessments_delete" ON "public"."academy_assessments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_assessments_insert" ON "public"."academy_assessments"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_assessments_select" ON "public"."academy_assessments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_assessments_update" ON "public"."academy_assessments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_attempt_answers_delete" ON "public"."academy_attempt_answers"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_attempt_answers_insert" ON "public"."academy_attempt_answers"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_attempt_answers_select" ON "public"."academy_attempt_answers"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_attempt_answers_update" ON "public"."academy_attempt_answers"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_attempts_delete" ON "public"."academy_attempts"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_attempts_insert" ON "public"."academy_attempts"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_attempts_select" ON "public"."academy_attempts"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_attempts_update" ON "public"."academy_attempts"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_certificates_insert" ON "public"."academy_certificates"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_certificates_select" ON "public"."academy_certificates"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_certificates_update" ON "public"."academy_certificates"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_lesson_progress_delete" ON "public"."academy_lesson_progress"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_lesson_progress_insert" ON "public"."academy_lesson_progress"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_lesson_progress_select" ON "public"."academy_lesson_progress"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_lesson_progress_update" ON "public"."academy_lesson_progress"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_materials_delete" ON "public"."academy_materials"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_materials_insert" ON "public"."academy_materials"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_materials_select" ON "public"."academy_materials"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_materials_update" ON "public"."academy_materials"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_question_options_delete" ON "public"."academy_question_options"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_question_options_insert" ON "public"."academy_question_options"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_question_options_select" ON "public"."academy_question_options"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_question_options_update" ON "public"."academy_question_options"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_questions_delete" ON "public"."academy_questions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_questions_insert" ON "public"."academy_questions"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "academy_questions_select" ON "public"."academy_questions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "academy_questions_update" ON "public"."academy_questions"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "accidents_org_access" ON "public"."accidents"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "aa_select" ON "public"."approval_approvers"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "bi_report_schedules_org" ON "public"."bi_report_schedules"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_api_tokens_org_select" ON "public"."blueprint_api_tokens"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_map_org_delete" ON "public"."blueprint_budget_mappings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_map_org_insert" ON "public"."blueprint_budget_mappings"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_map_org_read" ON "public"."blueprint_budget_mappings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_map_org_update" ON "public"."blueprint_budget_mappings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_composicao_org_delete" ON "public"."blueprint_composicoes_de_peca"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_composicao_org_insert" ON "public"."blueprint_composicoes_de_peca"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_composicao_org_read" ON "public"."blueprint_composicoes_de_peca"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_composicao_org_update" ON "public"."blueprint_composicoes_de_peca"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_conflict_acceptances_org" ON "public"."blueprint_conflict_acceptances"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_element_locks_delete" ON "public"."blueprint_element_locks"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_element_locks_insert" ON "public"."blueprint_element_locks"
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (holder_user_id = auth.uid())));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_element_locks_select" ON "public"."blueprint_element_locks"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_kit_org_delete" ON "public"."blueprint_kits_de_insercao"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_kit_org_insert" ON "public"."blueprint_kits_de_insercao"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_kit_org_read" ON "public"."blueprint_kits_de_insercao"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_kit_org_update" ON "public"."blueprint_kits_de_insercao"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_levels_org" ON "public"."blueprint_levels"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_materials_org" ON "public"."blueprint_materials"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_opening_type_org_delete" ON "public"."blueprint_opening_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_opening_type_org_insert" ON "public"."blueprint_opening_types"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_opening_type_org_read" ON "public"."blueprint_opening_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_opening_type_org_update" ON "public"."blueprint_opening_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_parameter_definition_org_delete" ON "public"."blueprint_parameter_definitions"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_parameter_definition_org_insert" ON "public"."blueprint_parameter_definitions"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_parameter_definition_org_read" ON "public"."blueprint_parameter_definitions"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_parameter_definition_org_update" ON "public"."blueprint_parameter_definitions"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_plugins_org" ON "public"."blueprint_plugins"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_programs_org" ON "public"."blueprint_programs"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_qty_org_insert" ON "public"."blueprint_quantity_snapshots"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_qty_org_read" ON "public"."blueprint_quantity_snapshots"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_rule_set_org_delete" ON "public"."blueprint_rule_sets"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_rule_set_org_insert" ON "public"."blueprint_rule_sets"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_rule_set_org_read" ON "public"."blueprint_rule_sets"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_rule_set_org_update" ON "public"."blueprint_rule_sets"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_sheet_templates_org" ON "public"."blueprint_sheet_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_snapshot_nbr12721_insert" ON "public"."blueprint_snapshot_nbr12721"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_snapshot_nbr12721_read" ON "public"."blueprint_snapshot_nbr12721"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_snapshot_nbr12721_aprovacoes_read" ON "public"."blueprint_snapshot_nbr12721_aprovacoes"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_snapshot_produto_insert" ON "public"."blueprint_snapshot_produto"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_snapshot_produto_read" ON "public"."blueprint_snapshot_produto"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_armadura_org" ON "public"."blueprint_study_armadura"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_eletrica_org" ON "public"."blueprint_study_eletrica"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_entorno_org" ON "public"."blueprint_study_entorno"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_incendio_org" ON "public"."blueprint_study_incendio"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_nbr12721_org" ON "public"."blueprint_study_nbr12721"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_permissions_org" ON "public"."blueprint_study_permissions"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_projeto_executivo_delete" ON "public"."blueprint_study_projeto_executivo"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text)));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_projeto_executivo_insert" ON "public"."blueprint_study_projeto_executivo"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_projeto_executivo_read" ON "public"."blueprint_study_projeto_executivo"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_projeto_executivo_update" ON "public"."blueprint_study_projeto_executivo"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text)))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_referencias_org" ON "public"."blueprint_study_referencias"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_regularizacao_org" ON "public"."blueprint_study_regularizacao"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_sigef_org" ON "public"."blueprint_study_sigef"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_terraplenagem_org" ON "public"."blueprint_study_terraplenagem"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_study_vias_org" ON "public"."blueprint_study_vias"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_table_definitions_org" ON "public"."blueprint_table_definitions"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_underlay_org_delete" ON "public"."blueprint_underlays"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_underlay_org_insert" ON "public"."blueprint_underlays"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_underlay_org_read" ON "public"."blueprint_underlays"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_underlay_org_update" ON "public"."blueprint_underlays"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_view_templates_org" ON "public"."blueprint_view_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_wall_type_org_delete" ON "public"."blueprint_wall_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_wall_type_org_insert" ON "public"."blueprint_wall_types"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_wall_type_org_read" ON "public"."blueprint_wall_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_wall_type_org_update" ON "public"."blueprint_wall_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "blueprint_webhook_entregas_org_select" ON "public"."blueprint_webhook_entregas"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "blueprint_webhooks_org" ON "public"."blueprint_webhooks"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_channels_manage" ON "public"."broker_portal_chat_channels"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_channels_select" ON "public"."broker_portal_chat_channels"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_messages_insert" ON "public"."broker_portal_chat_messages"
  WITH CHECK (((EXISTS ( SELECT 1
   FROM broker_portal_chat_channels ch
  WHERE ((ch.id = broker_portal_chat_messages.channel_id) AND (COALESCE((ch.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))) AND ((sender_email = (auth.jwt() ->> 'email'::text)) OR is_superadmin())));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_messages_select" ON "public"."broker_portal_chat_messages"
  USING ((EXISTS ( SELECT 1
   FROM broker_portal_chat_channels ch
  WHERE ((ch.id = broker_portal_chat_messages.channel_id) AND (COALESCE((ch.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_commissions_manage" ON "public"."broker_portal_commissions"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_commissions_select" ON "public"."broker_portal_commissions"
  USING (((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_event_registrations_select" ON "public"."broker_portal_event_registrations"
  USING ((EXISTS ( SELECT 1
   FROM broker_portal_events e
  WHERE ((e.id = broker_portal_event_registrations.event_id) AND (COALESCE((e.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_events_manage" ON "public"."broker_portal_events"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_events_select" ON "public"."broker_portal_events"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_integrations_manage" ON "public"."broker_portal_integrations"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_integrations_select" ON "public"."broker_portal_integrations"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_lead_interactions_select" ON "public"."broker_portal_lead_interactions"
  USING ((EXISTS ( SELECT 1
   FROM broker_portal_leads l
  WHERE ((l.id = broker_portal_lead_interactions.lead_id) AND (COALESCE((l.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_leads_insert" ON "public"."broker_portal_leads"
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_leads_select" ON "public"."broker_portal_leads"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_leads_update" ON "public"."broker_portal_leads"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_materials_manage" ON "public"."broker_portal_materials"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_materials_select" ON "public"."broker_portal_materials"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_portal_price_columns_member" ON "public"."broker_portal_price_columns"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_proposal_units_delete" ON "public"."broker_portal_proposal_units"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))))))));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_proposal_units_insert" ON "public"."broker_portal_proposal_units"
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
           FROM organization_members om
          WHERE ((om.organization_id = pr.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text))))))))))));

-- SELECT · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_proposal_units_select" ON "public"."broker_portal_proposal_units"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR COALESCE((pr.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))));

-- UPDATE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_proposal_units_update" ON "public"."broker_portal_proposal_units"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))))))));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_proposals_insert" ON "public"."broker_portal_proposals"
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((lower(broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = broker_portal_proposals.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text)))))))));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_proposals_select" ON "public"."broker_portal_proposals"
  USING (((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- UPDATE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_proposals_update" ON "public"."broker_portal_proposals"
  USING (((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_rankings_manage" ON "public"."broker_portal_rankings"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_rankings_select" ON "public"."broker_portal_rankings"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_trainings_manage" ON "public"."broker_portal_trainings"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_trainings_select" ON "public"."broker_portal_trainings"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_property_access_manage" ON "public"."broker_property_access"
  USING ((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "broker_property_access_select" ON "public"."broker_property_access"
  USING ((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "broker_webhooks_org_access" ON "public"."broker_webhook_configs"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "candidates_org_access" ON "public"."candidates"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "Users can view chart of accounts" ON "public"."chart_of_accounts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "client_request_eventos_membro_grava" ON "public"."client_request_eventos"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "client_request_eventos_membro_le" ON "public"."client_request_eventos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "commercial_deal_code_history_select" ON "public"."commercial_deal_code_history"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_prop_status_events" ON "public"."commercial_property_status_events"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "receipt_org_access" ON "public"."communication_receipts"
  USING ((EXISTS ( SELECT 1
   FROM communications c
  WHERE ((c.id = communication_receipts.communication_id) AND COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "comm_org_access" ON "public"."communications"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "condo_rateio_number_history_select" ON "public"."condo_rateio_number_history"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "condominio_avisos_org_all" ON "public"."condominio_avisos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "condominio_documentos_org_all" ON "public"."condominio_documentos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "condominio_rateio_decisoes_membro_le" ON "public"."condominio_rateio_decisoes"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "condominio_rateio_despesas_org_all" ON "public"."condominio_rateio_despesas"
  USING ((EXISTS ( SELECT 1
   FROM condominio_rateios r
  WHERE ((r.id = condominio_rateio_despesas.rateio_id) AND COALESCE((r.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM condominio_rateios r
  WHERE ((r.id = condominio_rateio_despesas.rateio_id) AND COALESCE((r.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "condominio_rateios_org_all" ON "public"."condominio_rateios"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "condomino_portal_access_org_all" ON "public"."condomino_portal_access"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_acceptances" ON "public"."contract_acceptances"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_document_requirements" ON "public"."contract_document_requirements"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_evaluations" ON "public"."contract_evaluations"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_guarantees" ON "public"."contract_guarantees"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_guarantors" ON "public"."contract_guarantors"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "contract_index_values_read" ON "public"."contract_index_values"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "contract_index_values_write" ON "public"."contract_index_values"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_interfaces" ON "public"."contract_interfaces"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_labor_questionnaires" ON "public"."contract_labor_questionnaires"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "contract_organization_moves_select" ON "public"."contract_organization_moves"
  USING ((COALESCE((from_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR COALESCE((to_org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_penalties" ON "public"."contract_penalties"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_retention_releases" ON "public"."contract_retention_releases"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_risk_assessments" ON "public"."contract_risk_assessments"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "scope_tpl_delete" ON "public"."contract_scope_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "scope_tpl_insert" ON "public"."contract_scope_templates"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "scope_tpl_select" ON "public"."contract_scope_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "scope_tpl_update" ON "public"."contract_scope_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_supply_matrix" ON "public"."contract_supply_matrix"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_contract_technical_responsibilities" ON "public"."contract_technical_responsibilities"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "contract_template_clauses_org" ON "public"."contract_template_clauses"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "contract_templates_org" ON "public"."contract_templates"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "contract_types_org" ON "public"."contract_types"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "contractor_documents_org_access" ON "public"."contractor_documents"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "contractor_measurements_org_access" ON "public"."contractor_measurements"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "contractors_org_access" ON "public"."contractors"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cost_center_closing_items_org_all" ON "public"."cost_center_closing_items"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cost_center_closings_org_all" ON "public"."cost_center_closings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "credit_room_members_write" ON "public"."credit_room_members"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id)))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id)));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "credit_room_versions_insert" ON "public"."credit_room_versions"
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id)));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "credit_rooms_delete" ON "public"."credit_rooms"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "credit_rooms_insert" ON "public"."credit_rooms"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "credit_rooms_select" ON "public"."credit_rooms"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_credit_room_member(id)));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "credit_rooms_update" ON "public"."credit_rooms"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "crm_contacts_org_members" ON "public"."crm_contacts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "crm_opportunities_org_members" ON "public"."crm_opportunities"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "crm_proposals_org_members" ON "public"."crm_proposals"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "crm_tasks_org_members" ON "public"."crm_tasks"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "crm_timeline_org_members" ON "public"."crm_timeline_events"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "cdos_select" ON "public"."custom_database_org_shares"
  USING ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- DELETE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "custom_databases_delete" ON "public"."custom_databases"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "custom_databases_insert" ON "public"."custom_databases"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "custom_databases_select" ON "public"."custom_databases"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "custom_databases_update" ON "public"."custom_databases"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- DELETE · {authenticated} · 3 troca(s) · 0 linhas
ALTER POLICY "custom_items_delete" ON "public"."custom_items"
  USING (((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 3 troca(s) · 0 linhas
ALTER POLICY "custom_items_insert" ON "public"."custom_items"
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))))))));

-- SELECT · {authenticated} · 3 troca(s) · 0 linhas
ALTER POLICY "custom_items_select" ON "public"."custom_items"
  USING (((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- UPDATE · {authenticated} · 3 troca(s) · 0 linhas
ALTER POLICY "custom_items_update" ON "public"."custom_items"
  USING (((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "deal_credit_analysis_org" ON "public"."deal_credit_analysis"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_allocations_org_all" ON "public"."debt_allocations"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "debt_component_accounts_read" ON "public"."debt_component_accounts"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_component_accounts_write" ON "public"."debt_component_accounts"
  USING (((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_contracts_org_all" ON "public"."debt_contracts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_covenant_measurements_org_all" ON "public"."debt_covenant_measurements"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_covenants_org_all" ON "public"."debt_covenants"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_disbursements_org_all" ON "public"."debt_disbursements"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_events_org_all" ON "public"."debt_events"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_installments_org_all" ON "public"."debt_installments"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "debt_schedules_org_all" ON "public"."debt_schedules"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "digital_file_org_delete" ON "public"."digital_files"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "digital_file_org_insert" ON "public"."digital_files"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "digital_file_org_read" ON "public"."digital_files"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "digital_file_org_update" ON "public"."digital_files"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_assinaturas_select" ON "public"."doc_gen_assinaturas"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_blocos_delete" ON "public"."doc_gen_blocos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_blocos_insert" ON "public"."doc_gen_blocos"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_blocos_select" ON "public"."doc_gen_blocos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "doc_gen_blocos_update" ON "public"."doc_gen_blocos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_documento_versoes_insert" ON "public"."doc_gen_documento_versoes"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_documento_versoes_select" ON "public"."doc_gen_documento_versoes"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_documentos_delete" ON "public"."doc_gen_documentos"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text)));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_documentos_insert" ON "public"."doc_gen_documentos"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_documentos_select" ON "public"."doc_gen_documentos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "doc_gen_documentos_update" ON "public"."doc_gen_documentos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_eventos_select" ON "public"."doc_gen_eventos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_fontes_delete" ON "public"."doc_gen_fontes"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_fontes_insert" ON "public"."doc_gen_fontes"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_fontes_select" ON "public"."doc_gen_fontes"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "doc_gen_fontes_update" ON "public"."doc_gen_fontes"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_modelo_versoes_insert" ON "public"."doc_gen_modelo_versoes"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_modelo_versoes_select" ON "public"."doc_gen_modelo_versoes"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_modelos_delete" ON "public"."doc_gen_modelos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_modelos_insert" ON "public"."doc_gen_modelos"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_modelos_select" ON "public"."doc_gen_modelos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "doc_gen_modelos_update" ON "public"."doc_gen_modelos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_vinculos_delete" ON "public"."doc_gen_vinculos"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (NOT ((tipo = 'RESPONDE'::text) AND (de_documento_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM doc_gen_documentos d
  WHERE ((d.id = doc_gen_vinculos.de_documento_id) AND (d.status <> 'RASCUNHO'::text))))))));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_vinculos_insert" ON "public"."doc_gen_vinculos"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "doc_gen_vinculos_select" ON "public"."doc_gen_vinculos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "employee_cost_splits_org_all" ON "public"."employee_cost_splits"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "employee_docs_org_access" ON "public"."employee_documents"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "emp_salary_hist_org_access" ON "public"."employee_salary_history"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "employee_trainings_org_access" ON "public"."employee_trainings"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "empr_unit_char_values_org_delete" ON "public"."empreendimento_unit_characteristic_values"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "empr_unit_char_values_org_insert" ON "public"."empreendimento_unit_characteristic_values"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "empr_unit_char_values_org_read" ON "public"."empreendimento_unit_characteristic_values"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "empr_unit_char_values_org_update" ON "public"."empreendimento_unit_characteristic_values"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "empr_unit_characteristics_org_delete" ON "public"."empreendimento_unit_characteristics"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "empr_unit_characteristics_org_insert" ON "public"."empreendimento_unit_characteristics"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "empr_unit_characteristics_org_read" ON "public"."empreendimento_unit_characteristics"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "empr_unit_characteristics_org_update" ON "public"."empreendimento_unit_characteristics"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "epi_catalog_org_access" ON "public"."epi_catalog"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "epi_deliveries_org_access" ON "public"."epi_deliveries"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "esocial_batch_ev_org" ON "public"."esocial_batch_events"
  USING ((EXISTS ( SELECT 1
   FROM esocial_batches b
  WHERE ((b.id = esocial_batch_events.batch_id) AND COALESCE((b.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "esocial_batches_org" ON "public"."esocial_batches"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "esocial_config_org" ON "public"."esocial_config"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "esocial_events_org" ON "public"."esocial_events"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "esocial_alerts_org" ON "public"."esocial_pending_alerts"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "eval_cycles_org_access" ON "public"."evaluation_cycles"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "eval_responses_org_access" ON "public"."evaluation_responses"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "eval_results_org_access" ON "public"."evaluation_results"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "evidence_files_access" ON "public"."evidence_files"
  USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = evidence_files.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_guarantee_deposit_events" ON "public"."guarantee_deposit_events"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_guarantee_documents" ON "public"."guarantee_documents"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "hr_snap_org" ON "public"."hr_monthly_snapshots"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "hr_prod_org" ON "public"."hr_productivity_metrics"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "hr_turn_org" ON "public"."hr_turnover_events"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "incentive_rules_org_access" ON "public"."incentive_rules"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "interview_records_org_access" ON "public"."interview_records"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "competitors_org_select" ON "public"."investor_opportunity_competitors"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "job_openings_org_access" ON "public"."job_openings"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "labor_diary_entries_org_access" ON "public"."labor_diary_entries"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "labor_diary_workers_org_access" ON "public"."labor_diary_workers"
  USING ((EXISTS ( SELECT 1
   FROM labor_diary_entries d
  WHERE ((d.id = labor_diary_workers.diary_entry_id) AND COALESCE((d.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "labor_teams_org_access" ON "public"."labor_teams"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "maintenance_orders_org_delete" ON "public"."maintenance_orders"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "maintenance_orders_org_insert" ON "public"."maintenance_orders"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "maintenance_orders_org_read" ON "public"."maintenance_orders"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "maintenance_orders_org_update" ON "public"."maintenance_orders"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "maintenance_plans_org_delete" ON "public"."maintenance_plans"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "maintenance_plans_org_insert" ON "public"."maintenance_plans"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "maintenance_plans_org_read" ON "public"."maintenance_plans"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "maintenance_plans_org_update" ON "public"."maintenance_plans"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "non_conformances_access" ON "public"."non_conformances"
  USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = non_conformances.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "oe_checklist_items_access" ON "public"."oe_checklist_items"
  USING ((EXISTS ( SELECT 1
   FROM oe_checklist_templates t
  WHERE ((t.id = oe_checklist_items.template_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "checklist_responses_access" ON "public"."oe_checklist_responses"
  USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = oe_checklist_responses.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "oe_checklist_templates_access" ON "public"."oe_checklist_templates"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cno_areas_org_access" ON "public"."opura_cno_areas"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cno_compliance_score_org_access" ON "public"."opura_cno_compliance_score"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cno_dctfweb_org_access" ON "public"."opura_cno_dctfweb"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cno_deductions_org_access" ON "public"."opura_cno_deductions"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cno_documents_org_access" ON "public"."opura_cno_documents"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cno_reductions_org_access" ON "public"."opura_cno_reductions"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cno_registrations_org_access" ON "public"."opura_cno_registrations"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "cno_simulations_org_access" ON "public"."opura_cno_simulations"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "org_funcoes_delete" ON "public"."org_funcoes"
  USING ((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "org_funcoes_insert" ON "public"."org_funcoes"
  WITH CHECK ((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "org_funcoes_select" ON "public"."org_funcoes"
  USING ((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_funcoes_update" ON "public"."org_funcoes"
  USING ((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))))
  WITH CHECK ((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "partner_comp_settings_all" ON "public"."partner_compensation_settings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "partner_conversations_manage" ON "public"."partner_conversations"
  USING (((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "partner_conversations_select" ON "public"."partner_conversations"
  USING (((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "partner_messages_insert" ON "public"."partner_messages"
  WITH CHECK ((conversation_id IN ( SELECT c.id
   FROM (partner_conversations c
     JOIN partner_workspaces pw ON ((pw.id = c.partner_workspace_id)))
  WHERE (COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (pw.id IN ( SELECT partner_users.partner_workspace_id
           FROM partner_users
          WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "partner_messages_select" ON "public"."partner_messages"
  USING ((conversation_id IN ( SELECT c.id
   FROM (partner_conversations c
     JOIN partner_workspaces pw ON ((pw.id = c.partner_workspace_id)))
  WHERE (COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (pw.id IN ( SELECT partner_users.partner_workspace_id
           FROM partner_users
          WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))));

-- ALL · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "partner_requests_manage" ON "public"."partner_requests"
  USING (((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "partner_requests_select" ON "public"."partner_requests"
  USING (((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))));

-- ALL · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "shared_docs_manage" ON "public"."partner_shared_documents"
  USING ((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "shared_docs_select" ON "public"."partner_shared_documents"
  USING (((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))));

-- ALL · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "shared_folders_manage" ON "public"."partner_shared_folders"
  USING ((partner_workspace_id IN ( SELECT pw.id
   FROM partner_workspaces pw
  WHERE ((pw.organization_id IS NULL) OR COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "shared_folders_select" ON "public"."partner_shared_folders"
  USING (((partner_workspace_id IN ( SELECT pw.id
   FROM partner_workspaces pw
  WHERE ((pw.organization_id IS NULL) OR COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT pu.partner_workspace_id
   FROM partner_users pu
  WHERE ((pu.email = (auth.jwt() ->> 'email'::text)) AND (pu.is_active = true))))));

-- SELECT · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "pao_select_member" ON "public"."payment_account_organizations"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM payment_accounts pa
  WHERE ((pa.id = payment_account_organizations.payment_account_id) AND COALESCE((pa.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "saldo_informado_membro" ON "public"."payment_account_saldo_informado"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "payment_types_org_select" ON "public"."payment_types"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "payment_types_org_write" ON "public"."payment_types"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "payroll_encargos_config_membro" ON "public"."payroll_encargos_config"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "pdi_items_org_access" ON "public"."pdi_items"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "Users can view cost centers" ON "public"."plano_de_contas"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "pricing_rule_applications_org_delete" ON "public"."pricing_rule_applications"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "pricing_rule_applications_org_insert" ON "public"."pricing_rule_applications"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "pricing_rule_applications_org_read" ON "public"."pricing_rule_applications"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "pricing_rule_applications_org_update" ON "public"."pricing_rule_applications"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "product_models_org" ON "public"."product_models"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "productivity_logs_org_access" ON "public"."productivity_logs"
  USING ((((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM labor_teams t
  WHERE ((t.id = productivity_logs.team_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false))))) OR ((employee_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = productivity_logs.employee_id) AND COALESCE((e.org_id) IN (SELECT public.minhas_orgs_membro()), false)))))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "profit_batches_all" ON "public"."profit_distribution_batches"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "profit_items_all" ON "public"."profit_distribution_items"
  USING ((EXISTS ( SELECT 1
   FROM profit_distribution_batches b
  WHERE ((b.id = profit_distribution_items.batch_id) AND COALESCE((b.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profit_distribution_batches b
  WHERE ((b.id = profit_distribution_items.batch_id) AND COALESCE((b.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "project_ops_config_access" ON "public"."project_ops_config"
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_ops_config.project_id) AND COALESCE((((p.settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "org admins manage templates" ON "public"."project_type_templates"
  USING (((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "system templates readable" ON "public"."project_type_templates"
  USING (((org_id IS NULL) OR COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "prolabore_manual_entries_all" ON "public"."prolabore_manual_entries"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "prolabore_items_all" ON "public"."prolabore_payroll_items"
  USING ((EXISTS ( SELECT 1
   FROM prolabore_payrolls p
  WHERE ((p.id = prolabore_payroll_items.payroll_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM prolabore_payrolls p
  WHERE ((p.id = prolabore_payroll_items.payroll_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "prolabore_payrolls_all" ON "public"."prolabore_payrolls"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_access_prop_expense_alloc" ON "public"."property_expense_allocations"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "purchase_request_items_org" ON "public"."purchase_request_items"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "purchase_requests_org" ON "public"."purchase_requests"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "qr_codes_org_access" ON "public"."qr_codes_obra"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "quotation_number_history_select" ON "public"."quotation_number_history"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_price_table_items_delete" ON "public"."rental_price_table_items"
  USING ((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- INSERT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_price_table_items_insert" ON "public"."rental_price_table_items"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_price_table_items_select" ON "public"."rental_price_table_items"
  USING ((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- UPDATE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_price_table_items_update" ON "public"."rental_price_table_items"
  USING ((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- DELETE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_price_tables_delete" ON "public"."rental_price_tables"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_price_tables_insert" ON "public"."rental_price_tables"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_price_tables_select" ON "public"."rental_price_tables"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_price_tables_update" ON "public"."rental_price_tables"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_pricing_rules_org_delete" ON "public"."rental_pricing_rules"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_pricing_rules_org_insert" ON "public"."rental_pricing_rules"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "rental_pricing_rules_org_read" ON "public"."rental_pricing_rules"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "rental_pricing_rules_org_update" ON "public"."rental_pricing_rules"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "Admins can manage all resource roles" ON "public"."resource_roles"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "Admins can view all resource roles" ON "public"."resource_roles"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "Admins can manage all resource teams" ON "public"."resource_teams"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "Admins can view all resource teams" ON "public"."resource_teams"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "Admins can manage all resource workers" ON "public"."resource_workers"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "Admins can view all resource workers" ON "public"."resource_workers"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "risk_assessments_org_access" ON "public"."risk_assessments"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "ros_select" ON "public"."rubric_org_shares"
  USING ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "org members manage schedule_constraints" ON "public"."schedule_constraints"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "service_clients_delete" ON "public"."service_clients"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "service_clients_insert" ON "public"."service_clients"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "service_clients_select" ON "public"."service_clients"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "service_clients_update" ON "public"."service_clients"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_budget_items"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_budgets"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_contracts"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_opportunities"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_opportunity_events"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_pipeline_stages"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "services_proposal_number_history_select" ON "public"."services_proposal_number_history"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_proposals"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_visit_photos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "org_members_all" ON "public"."services_visits"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "sindico_financeiro_eventos_select" ON "public"."sindico_financeiro_eventos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "site_diary_access" ON "public"."site_diary"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "sst_checklists_org_access" ON "public"."sst_checklists_obra"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "sst_reg_docs_delete" ON "public"."sst_regulatory_docs"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "sst_reg_docs_insert" ON "public"."sst_regulatory_docs"
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "sst_reg_docs_select" ON "public"."sst_regulatory_docs"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "sst_reg_docs_update" ON "public"."sst_regulatory_docs"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "assemblies_all" ON "public"."structural_assemblies"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "elements_all" ON "public"."structural_elements"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "rebars_all" ON "public"."structural_rebars"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "steel_catalog_delete" ON "public"."structural_steel_catalog"
  USING (((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "steel_catalog_insert" ON "public"."structural_steel_catalog"
  WITH CHECK (((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "steel_catalog_select" ON "public"."structural_steel_catalog"
  USING (((org_id IS NULL) OR COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- UPDATE · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "steel_catalog_update" ON "public"."structural_steel_catalog"
  USING (((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "supplier_categories_manage" ON "public"."supplier_categories"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 0 linhas
ALTER POLICY "supplier_categories_read" ON "public"."supplier_categories"
  USING (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "tax_settings_read" ON "public"."tax_settings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "tax_settings_write" ON "public"."tax_settings"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "team_members_org_access" ON "public"."team_members"
  USING ((EXISTS ( SELECT 1
   FROM labor_teams t
  WHERE ((t.id = team_members.team_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "time_bank_org_access" ON "public"."time_bank"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "time_bank_entries_access" ON "public"."time_bank_entries"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "training_courses_org_access" ON "public"."training_courses"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "tts_fiscal_movements_org" ON "public"."tts_fiscal_movements"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "tts_regime_settings_org" ON "public"."tts_regime_settings"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 0 linhas
ALTER POLICY "vacation_balance_org_access" ON "public"."vacation_balance"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "vr_ajustes_org_access" ON "public"."vr_ajustes"
  USING ((EXISTS ( SELECT 1
   FROM vr_calculos c
  WHERE ((c.id = vr_ajustes.calculo_id) AND COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "vr_feriados_org_access" ON "public"."vr_feriados"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "vr_regras_org_access" ON "public"."vr_regras"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 2 troca(s) · 0 linhas
ALTER POLICY "org members manage weekly_commitments" ON "public"."weekly_commitments"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "wpp_config_org" ON "public"."whatsapp_config"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "wpp_queue_org" ON "public"."whatsapp_queue"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "work_logs_access" ON "public"."work_logs"
  USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_logs.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "wo_status_log_access" ON "public"."work_order_status_log"
  USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_status_log.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "wo_validations_access" ON "public"."work_order_validations"
  USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_validations.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false)))));

-- ALL · {public} · 1 troca(s) · 0 linhas
ALTER POLICY "work_orders_access" ON "public"."work_orders"
  USING (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false));
