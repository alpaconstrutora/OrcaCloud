-- SÓ LEITURA (desfeito no fim): (antiga) IS DISTINCT FROM (nova) linha a linha, lote 2, 761 expressões × cada usuário.
DO $c$
DECLARE r text := ''; u record; k bigint; total bigint := 0; testes int := 0; detalhes text := '';
BEGIN
  PERFORM set_config('statement_timeout', '1800s', true);
  CREATE TEMP TABLE _quem ON COMMIT DROP AS
    SELECT DISTINCT lower(m.email) AS email, COALESCE(m.user_id, au.id) AS uid
      FROM public.organization_members m LEFT JOIN auth.users au ON lower(au.email) = lower(m.email)
    UNION
    SELECT DISTINCT lower(b.email), au.id FROM public.broker_profiles b LEFT JOIN auth.users au ON lower(au.email) = lower(b.email)
    UNION SELECT NULL, NULL;
  FOR u IN SELECT * FROM _quem LOOP
    PERFORM set_config('request.jwt.claims', CASE WHEN u.email IS NULL THEN '' ELSE json_build_object('sub', u.uid, 'email', u.email, 'role', 'authenticated')::text END, true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_suggestions" WHERE (((EXISTS ( SELECT 1
   FROM bank_transactions bt
  WHERE ((bt.id = reconciliation_suggestions.bank_transaction_id) AND is_org_member(bt.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM bank_transactions bt
  WHERE ((bt.id = reconciliation_suggestions.bank_transaction_id) AND COALESCE((bt.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_suggestions.Manage reconciliation_suggestions as member USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_suggestions.Manage reconciliation_suggestions as member USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_matches" WHERE (((EXISTS ( SELECT 1
   FROM bank_transactions bt
  WHERE ((bt.id = reconciliation_matches.bank_transaction_id) AND is_org_member(bt.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM bank_transactions bt
  WHERE ((bt.id = reconciliation_matches.bank_transaction_id) AND COALESCE((bt.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_matches.Manage reconciliation_matches as member USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_matches.Manage reconciliation_matches as member USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_branches" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_branches.blueprint_branches_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_branches.blueprint_branches_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_branches" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_branches.blueprint_branches_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_branches.blueprint_branches_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_studies" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_studies.blueprint_studies_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_studies.blueprint_studies_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_studies" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_studies.blueprint_studies_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_studies.blueprint_studies_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_properties" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_properties.Enable access to organization members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_properties.Enable access to organization members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_properties" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_properties.Enable access to organization members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_properties.Enable access to organization members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."email_capture_messages" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s email_capture_messages.email_capture_messages_ler USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s email_capture_messages.email_capture_messages_ler USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_runs" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_runs.reconciliation_runs_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_runs.reconciliation_runs_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_runs" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_runs.reconciliation_runs_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_runs.reconciliation_runs_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_audit_log" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_audit_log.Create audit logs as member CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_audit_log.Create audit logs as member CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_audit_log" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_audit_log.View audit logs as member USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_audit_log.View audit logs as member USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."client_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s client_org_shares.cos_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s client_org_shares.cos_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."client_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s client_org_shares.cos_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s client_org_shares.cos_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."client_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s client_org_shares.cos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s client_org_shares.cos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_rateio_itens" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_rateio_itens.condominio_rateio_itens_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_rateio_itens.condominio_rateio_itens_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_rateio_itens" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_rateio_itens.condominio_rateio_itens_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_rateio_itens.condominio_rateio_itens_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tasks" WHERE ((((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND is_org_member(org_id)))) IS DISTINCT FROM ((((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tasks.tasks_select_assignee USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tasks.tasks_select_assignee USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tasks" WHERE ((((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND is_org_member(org_id)))) IS DISTINCT FROM ((((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tasks.tasks_update_assignee USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tasks.tasks_update_assignee USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tasks" WHERE ((((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND is_org_member(org_id)))) IS DISTINCT FROM ((((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tasks.tasks_update_assignee CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tasks.tasks_update_assignee CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_climatizacao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_climatizacao.blueprint_study_climatizacao_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_climatizacao.blueprint_study_climatizacao_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_climatizacao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_climatizacao.blueprint_study_climatizacao_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_climatizacao.blueprint_study_climatizacao_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contracts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contracts.Users can manage contract of their organization USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contracts.Users can manage contract of their organization USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contracts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contracts.Users can view contract of their organization USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contracts.Users can view contract of their organization USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_payments_auditoria" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_payments_auditoria.spa_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_payments_auditoria.spa_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payroll_events" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payroll_events.payroll_events_v2_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payroll_events.payroll_events_v2_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payroll_events" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payroll_events.payroll_events_v2_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payroll_events.payroll_events_v2_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."unit_occupancies" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s unit_occupancies.unit_occupancies_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s unit_occupancies.unit_occupancies_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."unit_occupancies" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s unit_occupancies.unit_occupancies_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s unit_occupancies.unit_occupancies_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."unit_occupancies" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s unit_occupancies.unit_occupancies_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s unit_occupancies.unit_occupancies_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."unit_occupancies" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s unit_occupancies.unit_occupancies_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s unit_occupancies.unit_occupancies_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."unit_occupancies" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s unit_occupancies.unit_occupancies_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s unit_occupancies.unit_occupancies_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_profiles" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_profiles.broker_profiles_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_profiles.broker_profiles_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_profiles" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_profiles.broker_profiles_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_profiles.broker_profiles_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_profiles" WHERE (((is_org_member(organization_id) OR ((auth.jwt() ->> 'email'::text) = email) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((auth.jwt() ->> 'email'::text) = email) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_profiles.broker_profiles_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_profiles.broker_profiles_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."projects" WHERE (((is_org_member(organization_id) OR ((organization_id IS NULL) AND is_org_member(((settings ->> 'organizationId'::text))::uuid))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((organization_id IS NULL) AND COALESCE((((settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s projects.projects_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s projects.projects_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."projects" WHERE (((is_org_member(organization_id) OR ((organization_id IS NULL) AND is_org_member(((settings ->> 'organizationId'::text))::uuid))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((organization_id IS NULL) AND COALESCE((((settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s projects.projects_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s projects.projects_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."bank_statement_imports" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s bank_statement_imports.bank_statement_imports_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s bank_statement_imports.bank_statement_imports_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."bank_statement_imports" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s bank_statement_imports.bank_statement_imports_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s bank_statement_imports.bank_statement_imports_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."organization_members" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s organization_members.Members can view coworkers USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s organization_members.Members can view coworkers USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."preferencias" WHERE (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND is_org_member(s.organization_id)))))))) IS DISTINCT FROM (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s preferencias.preferencias_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s preferencias.preferencias_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."preferencias" WHERE (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND is_org_member(s.organization_id)))))))) IS DISTINCT FROM (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s preferencias.preferencias_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s preferencias.preferencias_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."preferencias" WHERE (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_member(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND is_org_member(s.organization_id)))))))) IS DISTINCT FROM (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s preferencias.preferencias_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s preferencias.preferencias_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."preferencias" WHERE (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND is_org_member(s.organization_id)))))))) IS DISTINCT FROM (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s preferencias.preferencias_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s preferencias.preferencias_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."preferencias" WHERE (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND is_org_member(s.organization_id)))))))) IS DISTINCT FROM (((((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s preferencias.preferencias_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s preferencias.preferencias_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_numbering_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_numbering_settings.document_numbering_settings_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_numbering_settings.document_numbering_settings_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_numbering_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_numbering_settings.document_numbering_settings_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_numbering_settings.document_numbering_settings_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_numbering_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_numbering_settings.document_numbering_settings_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_numbering_settings.document_numbering_settings_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_numbering_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_numbering_settings.document_numbering_settings_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_numbering_settings.document_numbering_settings_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_numbering_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_numbering_settings.document_numbering_settings_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_numbering_settings.document_numbering_settings_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payroll_runs" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payroll_runs.payroll_runs_v2_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payroll_runs.payroll_runs_v2_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_casa" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_casa.blueprint_study_casa_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_casa.blueprint_study_casa_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_casa" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_casa.blueprint_study_casa_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_casa.blueprint_study_casa_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."task_statuses" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s task_statuses.task_statuses_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s task_statuses.task_statuses_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."task_statuses" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s task_statuses.task_statuses_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s task_statuses.task_statuses_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."task_statuses" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s task_statuses.task_statuses_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s task_statuses.task_statuses_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."task_statuses" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s task_statuses.task_statuses_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s task_statuses.task_statuses_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."clients" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s clients.Members can manage clients USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s clients.Members can manage clients USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."clients" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s clients.Members can manage clients CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s clients.Members can manage clients CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."clients" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM client_org_shares sh
  WHERE ((sh.client_id = clients.id) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM client_org_shares sh
  WHERE ((sh.client_id = clients.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s clients.clients_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s clients.clients_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employees" WHERE (((is_org_member(org_id) OR is_employee_shared_with_user(id)))) IS DISTINCT FROM (((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_employee_shared_with_user(id))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employees.employees_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employees.employees_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."email_capture_buscas" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s email_capture_buscas.email_capture_buscas_ler USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s email_capture_buscas.email_capture_buscas_ler USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."purchase_order_number_history" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s purchase_order_number_history.purchase_order_number_history_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s purchase_order_number_history.purchase_order_number_history_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_payments" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_payments.supplier_payments_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_payments.supplier_payments_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_automatic_rubrics" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_automatic_rubrics.employee_automatic_rubrics_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_automatic_rubrics.employee_automatic_rubrics_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_automatic_rubrics" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_automatic_rubrics.employee_automatic_rubrics_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_automatic_rubrics.employee_automatic_rubrics_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."vr_calculos" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s vr_calculos.vr_calculos_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s vr_calculos.vr_calculos_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_element_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_element_types.blueprint_element_type_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_element_types.blueprint_element_type_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_element_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_element_types.blueprint_element_type_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_element_types.blueprint_element_type_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_element_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_element_types.blueprint_element_type_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_element_types.blueprint_element_type_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_element_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_element_types.blueprint_element_type_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_element_types.blueprint_element_type_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_element_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_element_types.blueprint_element_type_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_element_types.blueprint_element_type_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_produto" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_produto.blueprint_study_produto_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_produto.blueprint_study_produto_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_produto" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_produto.blueprint_study_produto_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_produto.blueprint_study_produto_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."client_portal_tokens" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s client_portal_tokens.client_portal_tokens_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s client_portal_tokens.client_portal_tokens_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_hidro" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_hidro.blueprint_study_hidro_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_hidro.blueprint_study_hidro_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_hidro" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_hidro.blueprint_study_hidro_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_hidro.blueprint_study_hidro_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_urban_context" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_urban_context.blueprint_study_urban_context_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_urban_context.blueprint_study_urban_context_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_urban_context" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_urban_context.blueprint_study_urban_context_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_urban_context.blueprint_study_urban_context_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_tokens" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_tokens.broker_tokens_auth_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_tokens.broker_tokens_auth_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_tokens" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_tokens.broker_tokens_auth_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_tokens.broker_tokens_auth_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."financial_receipts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s financial_receipts.financial_receipts_select_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s financial_receipts.financial_receipts_select_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."product_brands" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s product_brands.product_brands_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s product_brands.product_brands_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."product_brands" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s product_brands.product_brands_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s product_brands.product_brands_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshots" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshots.blueprint_snapshots_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshots.blueprint_snapshots_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshots" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshots.blueprint_snapshots_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshots.blueprint_snapshots_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_topografia" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_topografia.blueprint_study_topografia_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_topografia.blueprint_study_topografia_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_topografia" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_topografia.blueprint_study_topografia_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_topografia.blueprint_study_topografia_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."building_systems" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s building_systems.building_systems_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s building_systems.building_systems_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."building_systems" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s building_systems.building_systems_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s building_systems.building_systems_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."building_systems" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s building_systems.building_systems_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s building_systems.building_systems_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."building_systems" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s building_systems.building_systems_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s building_systems.building_systems_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."building_systems" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s building_systems.building_systems_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s building_systems.building_systems_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."investor_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s investor_org_shares.ios_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s investor_org_shares.ios_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_org_shares" WHERE ((is_org_member(( SELECT employees.org_id
   FROM employees
  WHERE (employees.id = employee_org_shares.employee_id))))) IS DISTINCT FROM ((COALESCE((( SELECT employees.org_id
   FROM employees
  WHERE (employees.id = employee_org_shares.employee_id))) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_org_shares.employee_shares_insert_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_org_shares.employee_shares_insert_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_org_shares" WHERE (((is_org_member(( SELECT employees.org_id
   FROM employees
  WHERE (employees.id = employee_org_shares.employee_id))) OR is_org_member(target_org_id)))) IS DISTINCT FROM (((COALESCE((( SELECT employees.org_id
   FROM employees
  WHERE (employees.id = employee_org_shares.employee_id))) IN (SELECT public.minhas_orgs_membro()), false) OR COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_org_shares.employee_shares_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_org_shares.employee_shares_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_templates.document_templates_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_templates.document_templates_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_templates.document_templates_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_templates.document_templates_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_templates.document_templates_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_templates.document_templates_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."document_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s document_templates.document_templates_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s document_templates.document_templates_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."email_capture_senders" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s email_capture_senders.email_capture_senders_alterar USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s email_capture_senders.email_capture_senders_alterar USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."email_capture_senders" WHERE (((is_org_member(organization_id) AND ((importacao = 'revisao'::text) OR is_org_manager(organization_id))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((importacao = 'revisao'::text) OR is_org_manager(organization_id)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s email_capture_senders.email_capture_senders_alterar CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s email_capture_senders.email_capture_senders_alterar CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."email_capture_senders" WHERE (((is_org_member(organization_id) AND ((importacao = 'revisao'::text) OR is_org_manager(organization_id))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((importacao = 'revisao'::text) OR is_org_manager(organization_id)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s email_capture_senders.email_capture_senders_criar CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s email_capture_senders.email_capture_senders_criar CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."email_capture_senders" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s email_capture_senders.email_capture_senders_excluir USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s email_capture_senders.email_capture_senders_excluir USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."email_capture_senders" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s email_capture_senders.email_capture_senders_ler USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s email_capture_senders.email_capture_senders_ler USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."organizations" WHERE ((is_org_member(id))) IS DISTINCT FROM ((COALESCE((id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s organizations.Users can view their own organization USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s organizations.Users can view their own organization USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_rules" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_rules.Manage reconciliation_rules as member USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_rules.Manage reconciliation_rules as member USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_bank_accounts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_bank_accounts.sba_authenticated_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_bank_accounts.sba_authenticated_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_bank_accounts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_bank_accounts.sba_authenticated_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_bank_accounts.sba_authenticated_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_bank_accounts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_bank_accounts.sba_authenticated_view USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_bank_accounts.sba_authenticated_view USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_access_logs" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_access_logs.academy_access_logs_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_access_logs.academy_access_logs_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_access_logs" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_access_logs.academy_access_logs_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_access_logs.academy_access_logs_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assignments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assignments.academy_assignments_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assignments.academy_assignments_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assignments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assignments.academy_assignments_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assignments.academy_assignments_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assignments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assignments.academy_assignments_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assignments.academy_assignments_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assignments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assignments.academy_assignments_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assignments.academy_assignments_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assignments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assignments.academy_assignments_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assignments.academy_assignments_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_enrollments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_enrollments.academy_enrollments_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_enrollments.academy_enrollments_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_enrollments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_enrollments.academy_enrollments_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_enrollments.academy_enrollments_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_enrollments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_enrollments.academy_enrollments_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_enrollments.academy_enrollments_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_enrollments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_enrollments.academy_enrollments_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_enrollments.academy_enrollments_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_enrollments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_enrollments.academy_enrollments_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_enrollments.academy_enrollments_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_price_table_items" WHERE (((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND is_org_member(t.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_price_table_items.commercial_price_table_items_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_price_table_items.commercial_price_table_items_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_price_table_items" WHERE (((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND is_org_member(t.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_price_table_items.commercial_price_table_items_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_price_table_items.commercial_price_table_items_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_price_table_items" WHERE (((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND is_org_member(t.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_price_table_items.commercial_price_table_items_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_price_table_items.commercial_price_table_items_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_price_table_items" WHERE (((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND is_org_member(t.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_price_table_items.commercial_price_table_items_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_price_table_items.commercial_price_table_items_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_price_tables" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_price_tables.commercial_price_tables_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_price_tables.commercial_price_tables_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_price_tables" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_price_tables.commercial_price_tables_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_price_tables.commercial_price_tables_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_price_tables" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_price_tables.commercial_price_tables_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_price_tables.commercial_price_tables_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_price_tables" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_price_tables.commercial_price_tables_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_price_tables.commercial_price_tables_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payment_account_gateway" WHERE (((EXISTS ( SELECT 1
   FROM payment_accounts pa
  WHERE ((pa.id = payment_account_gateway.payment_account_id) AND is_org_member(pa.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM payment_accounts pa
  WHERE ((pa.id = payment_account_gateway.payment_account_id) AND COALESCE((pa.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payment_account_gateway.pag_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payment_account_gateway.pag_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payment_accounts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payment_accounts.Users can view payment accounts USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payment_accounts.Users can view payment accounts USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_course_versions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_course_versions.academy_course_versions_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_course_versions.academy_course_versions_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_course_versions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_course_versions.academy_course_versions_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_course_versions.academy_course_versions_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_course_versions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_course_versions.academy_course_versions_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_course_versions.academy_course_versions_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_course_versions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_course_versions.academy_course_versions_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_course_versions.academy_course_versions_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_course_versions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_course_versions.academy_course_versions_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_course_versions.academy_course_versions_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lessons" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lessons.academy_lessons_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lessons.academy_lessons_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lessons" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lessons.academy_lessons_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lessons.academy_lessons_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lessons" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lessons.academy_lessons_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lessons.academy_lessons_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lessons" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lessons.academy_lessons_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lessons.academy_lessons_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lessons" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lessons.academy_lessons_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lessons.academy_lessons_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_modules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_modules.academy_modules_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_modules.academy_modules_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_modules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_modules.academy_modules_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_modules.academy_modules_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_modules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_modules.academy_modules_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_modules.academy_modules_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_modules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_modules.academy_modules_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_modules.academy_modules_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_modules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_modules.academy_modules_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_modules.academy_modules_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_portal_users" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_portal_users.academy_portal_users_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_portal_users.academy_portal_users_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_portal_users" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_portal_users.academy_portal_users_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_portal_users.academy_portal_users_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_portal_users" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_portal_users.academy_portal_users_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_portal_users.academy_portal_users_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_portal_users" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_portal_users.academy_portal_users_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_portal_users.academy_portal_users_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_portal_users" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_portal_users.academy_portal_users_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_portal_users.academy_portal_users_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_measurements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_measurements.blueprint_medicao_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_measurements.blueprint_medicao_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_measurements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_measurements.blueprint_medicao_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_measurements.blueprint_medicao_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_measurements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_measurements.blueprint_medicao_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_measurements.blueprint_medicao_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_measurements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_measurements.blueprint_medicao_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_measurements.blueprint_medicao_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_measurements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_measurements.blueprint_medicao_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_measurements.blueprint_medicao_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshot_topografia" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshot_topografia.blueprint_snapshot_topografia_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshot_topografia.blueprint_snapshot_topografia_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshot_topografia" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshot_topografia.blueprint_snapshot_topografia_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshot_topografia.blueprint_snapshot_topografia_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_levantamento" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_levantamento.blueprint_study_levantamento_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_levantamento.blueprint_study_levantamento_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_levantamento" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_levantamento.blueprint_study_levantamento_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_levantamento.blueprint_study_levantamento_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_deal_buyers" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM commercial_deals d
  WHERE ((d.id = commercial_deal_buyers.deal_id) AND is_org_member(d.organization_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_deals d
  WHERE ((d.id = commercial_deal_buyers.deal_id) AND COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_deal_buyers.Enable access to organization members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_deal_buyers.Enable access to organization members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_deal_buyers" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM commercial_deals d
  WHERE ((d.id = commercial_deal_buyers.deal_id) AND is_org_member(d.organization_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_deals d
  WHERE ((d.id = commercial_deal_buyers.deal_id) AND COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_deal_buyers.Enable access to organization members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_deal_buyers.Enable access to organization members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_deal_units" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND is_org_member(p.organization_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_deal_units.Enable access to organization members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_deal_units.Enable access to organization members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_deal_units" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND is_org_member(p.organization_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_deal_units.Enable access to organization members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_deal_units.Enable access to organization members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_deals" WHERE (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deals.property_id) AND is_org_member(p.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deals.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_deals.Enable access to organization members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_deals.Enable access to organization members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_deals" WHERE (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deals.property_id) AND is_org_member(p.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deals.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_deals.Enable access to organization members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_deals.Enable access to organization members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_aviso_leituras" WHERE (((EXISTS ( SELECT 1
   FROM condominio_avisos a
  WHERE ((a.id = condominio_aviso_leituras.aviso_id) AND is_org_member(a.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM condominio_avisos a
  WHERE ((a.id = condominio_aviso_leituras.aviso_id) AND COALESCE((a.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_aviso_leituras.condominio_aviso_leituras_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_aviso_leituras.condominio_aviso_leituras_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_aviso_leituras" WHERE (((EXISTS ( SELECT 1
   FROM condominio_avisos a
  WHERE ((a.id = condominio_aviso_leituras.aviso_id) AND is_org_member(a.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM condominio_avisos a
  WHERE ((a.id = condominio_aviso_leituras.aviso_id) AND COALESCE((a.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_aviso_leituras.condominio_aviso_leituras_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_aviso_leituras.condominio_aviso_leituras_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_number_history" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_number_history.contract_number_history_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_number_history.contract_number_history_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."darfs" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s darfs.darfs_membro_da_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s darfs.darfs_membro_da_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."darfs" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s darfs.darfs_membro_da_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s darfs.darfs_membro_da_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."email_capture_accounts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s email_capture_accounts.email_capture_accounts_ler USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s email_capture_accounts.email_capture_accounts_ler USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_types" WHERE ((((is_system = false) AND (is_org_member(organization_id) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))))))) IS DISTINCT FROM ((((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid())))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_types.empreendimento_types_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_types.empreendimento_types_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_types" WHERE ((((is_system = false) AND (is_org_member(organization_id) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))))))) IS DISTINCT FROM ((((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid())))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_types.empreendimento_types_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_types.empreendimento_types_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_types" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid())))))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_types.empreendimento_types_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_types.empreendimento_types_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_types" WHERE ((((is_system = false) AND (is_org_member(organization_id) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))))))) IS DISTINCT FROM ((((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid())))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_types.empreendimento_types_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_types.empreendimento_types_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."financial_categories" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s financial_categories.financial_categories_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s financial_categories.financial_categories_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."financial_categories" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s financial_categories.financial_categories_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s financial_categories.financial_categories_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."hr_targets" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s hr_targets.hr_targets_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s hr_targets.hr_targets_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plan_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plan_items.maintenance_plan_items_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plan_items.maintenance_plan_items_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plan_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plan_items.maintenance_plan_items_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plan_items.maintenance_plan_items_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plan_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plan_items.maintenance_plan_items_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plan_items.maintenance_plan_items_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plan_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plan_items.maintenance_plan_items_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plan_items.maintenance_plan_items_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plan_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plan_items.maintenance_plan_items_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plan_items.maintenance_plan_items_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_users" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_users.partner_users_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_users.partner_users_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_users" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id) OR (email = (auth.jwt() ->> 'email'::text))))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (email = (auth.jwt() ->> 'email'::text)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_users.partner_users_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_users.partner_users_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_workspaces" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_workspaces.workspaces_manage_internal USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_workspaces.workspaces_manage_internal USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_workspaces" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_workspaces.workspaces_manage_internal CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_workspaces.workspaces_manage_internal CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_workspaces" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = partner_workspaces.supplier_id) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = partner_workspaces.supplier_id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_workspaces.workspaces_select_internal USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_workspaces.workspaces_select_internal USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."portal_tokens" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s portal_tokens.portal_tokens_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s portal_tokens.portal_tokens_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rubrics" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rubrics.rubrics_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rubrics.rubrics_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rubrics" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rubrics.rubrics_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rubrics.rubrics_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rubrics" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rubrics.rubrics_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rubrics.rubrics_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rubrics" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rubrics.rubrics_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rubrics.rubrics_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sales_plans" WHERE (((is_org_member(organization_id) AND (status = 'draft'::text)))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'draft'::text))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sales_plans.sales_plans_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sales_plans.sales_plans_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sales_plans" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sales_plans.sales_plans_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sales_plans.sales_plans_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sales_plans" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sales_plans.sales_plans_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sales_plans.sales_plans_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sales_plans" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sales_plans.sales_plans_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sales_plans.sales_plans_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."termination_records" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s termination_records.termination_records_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s termination_records.termination_records_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."absences" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s absences.absences_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s absences.absences_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."absences" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s absences.absences_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s absences.absences_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessment_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessment_questions.academy_assessment_questions_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessment_questions.academy_assessment_questions_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessment_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessment_questions.academy_assessment_questions_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessment_questions.academy_assessment_questions_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessment_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessment_questions.academy_assessment_questions_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessment_questions.academy_assessment_questions_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessment_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessment_questions.academy_assessment_questions_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessment_questions.academy_assessment_questions_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessment_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessment_questions.academy_assessment_questions_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessment_questions.academy_assessment_questions_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessments.academy_assessments_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessments.academy_assessments_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessments.academy_assessments_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessments.academy_assessments_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessments.academy_assessments_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessments.academy_assessments_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessments.academy_assessments_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessments.academy_assessments_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_assessments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_assessments.academy_assessments_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_assessments.academy_assessments_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempt_answers" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempt_answers.academy_attempt_answers_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempt_answers.academy_attempt_answers_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempt_answers" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempt_answers.academy_attempt_answers_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempt_answers.academy_attempt_answers_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempt_answers" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempt_answers.academy_attempt_answers_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempt_answers.academy_attempt_answers_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempt_answers" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempt_answers.academy_attempt_answers_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempt_answers.academy_attempt_answers_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempt_answers" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempt_answers.academy_attempt_answers_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempt_answers.academy_attempt_answers_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempts" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempts.academy_attempts_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempts.academy_attempts_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempts" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempts.academy_attempts_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempts.academy_attempts_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempts" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempts.academy_attempts_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempts.academy_attempts_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempts" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempts.academy_attempts_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempts.academy_attempts_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_attempts" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_attempts.academy_attempts_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_attempts.academy_attempts_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_certificates" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_certificates.academy_certificates_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_certificates.academy_certificates_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_certificates" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_certificates.academy_certificates_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_certificates.academy_certificates_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_certificates" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_certificates.academy_certificates_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_certificates.academy_certificates_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_certificates" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_certificates.academy_certificates_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_certificates.academy_certificates_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lesson_progress" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lesson_progress.academy_lesson_progress_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lesson_progress.academy_lesson_progress_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lesson_progress" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lesson_progress.academy_lesson_progress_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lesson_progress.academy_lesson_progress_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lesson_progress" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lesson_progress.academy_lesson_progress_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lesson_progress.academy_lesson_progress_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lesson_progress" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lesson_progress.academy_lesson_progress_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lesson_progress.academy_lesson_progress_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_lesson_progress" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_lesson_progress.academy_lesson_progress_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_lesson_progress.academy_lesson_progress_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_materials" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_materials.academy_materials_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_materials.academy_materials_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_materials" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_materials.academy_materials_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_materials.academy_materials_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_materials" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_materials.academy_materials_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_materials.academy_materials_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_materials" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_materials.academy_materials_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_materials.academy_materials_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_materials" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_materials.academy_materials_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_materials.academy_materials_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_question_options" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_question_options.academy_question_options_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_question_options.academy_question_options_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_question_options" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_question_options.academy_question_options_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_question_options.academy_question_options_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_question_options" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_question_options.academy_question_options_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_question_options.academy_question_options_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_question_options" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_question_options.academy_question_options_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_question_options.academy_question_options_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_question_options" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_question_options.academy_question_options_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_question_options.academy_question_options_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_questions.academy_questions_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_questions.academy_questions_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_questions.academy_questions_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_questions.academy_questions_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_questions.academy_questions_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_questions.academy_questions_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_questions.academy_questions_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_questions.academy_questions_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."academy_questions" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s academy_questions.academy_questions_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s academy_questions.academy_questions_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."accidents" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s accidents.accidents_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s accidents.accidents_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."approval_approvers" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s approval_approvers.aa_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s approval_approvers.aa_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."bi_report_schedules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s bi_report_schedules.bi_report_schedules_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s bi_report_schedules.bi_report_schedules_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."bi_report_schedules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s bi_report_schedules.bi_report_schedules_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s bi_report_schedules.bi_report_schedules_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_api_tokens" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_api_tokens.blueprint_api_tokens_org_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_api_tokens.blueprint_api_tokens_org_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_budget_mappings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_budget_mappings.blueprint_map_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_budget_mappings.blueprint_map_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_budget_mappings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_budget_mappings.blueprint_map_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_budget_mappings.blueprint_map_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_budget_mappings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_budget_mappings.blueprint_map_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_budget_mappings.blueprint_map_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_budget_mappings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_budget_mappings.blueprint_map_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_budget_mappings.blueprint_map_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_budget_mappings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_budget_mappings.blueprint_map_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_budget_mappings.blueprint_map_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_composicoes_de_peca" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_composicoes_de_peca.blueprint_composicao_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_composicoes_de_peca.blueprint_composicao_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_composicoes_de_peca" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_composicoes_de_peca.blueprint_composicao_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_composicoes_de_peca.blueprint_composicao_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_composicoes_de_peca" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_composicoes_de_peca.blueprint_composicao_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_composicoes_de_peca.blueprint_composicao_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_composicoes_de_peca" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_composicoes_de_peca.blueprint_composicao_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_composicoes_de_peca.blueprint_composicao_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_composicoes_de_peca" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_composicoes_de_peca.blueprint_composicao_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_composicoes_de_peca.blueprint_composicao_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_conflict_acceptances" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_conflict_acceptances.blueprint_conflict_acceptances_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_conflict_acceptances.blueprint_conflict_acceptances_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_conflict_acceptances" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_conflict_acceptances.blueprint_conflict_acceptances_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_conflict_acceptances.blueprint_conflict_acceptances_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_element_locks" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_element_locks.blueprint_element_locks_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_element_locks.blueprint_element_locks_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_element_locks" WHERE (((is_org_member(organization_id) AND (holder_user_id = auth.uid())))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (holder_user_id = auth.uid()))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_element_locks.blueprint_element_locks_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_element_locks.blueprint_element_locks_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_element_locks" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_element_locks.blueprint_element_locks_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_element_locks.blueprint_element_locks_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_kits_de_insercao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_kits_de_insercao.blueprint_kit_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_kits_de_insercao.blueprint_kit_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_kits_de_insercao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_kits_de_insercao.blueprint_kit_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_kits_de_insercao.blueprint_kit_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_kits_de_insercao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_kits_de_insercao.blueprint_kit_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_kits_de_insercao.blueprint_kit_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_kits_de_insercao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_kits_de_insercao.blueprint_kit_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_kits_de_insercao.blueprint_kit_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_kits_de_insercao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_kits_de_insercao.blueprint_kit_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_kits_de_insercao.blueprint_kit_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_levels" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_levels.blueprint_levels_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_levels.blueprint_levels_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_levels" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_levels.blueprint_levels_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_levels.blueprint_levels_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_materials" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_materials.blueprint_materials_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_materials.blueprint_materials_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_materials" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_materials.blueprint_materials_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_materials.blueprint_materials_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_opening_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_opening_types.blueprint_opening_type_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_opening_types.blueprint_opening_type_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_opening_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_opening_types.blueprint_opening_type_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_opening_types.blueprint_opening_type_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_opening_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_opening_types.blueprint_opening_type_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_opening_types.blueprint_opening_type_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_opening_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_opening_types.blueprint_opening_type_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_opening_types.blueprint_opening_type_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_opening_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_opening_types.blueprint_opening_type_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_opening_types.blueprint_opening_type_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_parameter_definitions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_parameter_definitions.blueprint_parameter_definition_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_parameter_definitions.blueprint_parameter_definition_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_parameter_definitions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_parameter_definitions.blueprint_parameter_definition_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_parameter_definitions.blueprint_parameter_definition_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_parameter_definitions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_parameter_definitions.blueprint_parameter_definition_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_parameter_definitions.blueprint_parameter_definition_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_parameter_definitions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_parameter_definitions.blueprint_parameter_definition_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_parameter_definitions.blueprint_parameter_definition_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_parameter_definitions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_parameter_definitions.blueprint_parameter_definition_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_parameter_definitions.blueprint_parameter_definition_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_plugins" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_plugins.blueprint_plugins_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_plugins.blueprint_plugins_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_plugins" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_plugins.blueprint_plugins_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_plugins.blueprint_plugins_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_programs" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_programs.blueprint_programs_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_programs.blueprint_programs_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_programs" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_programs.blueprint_programs_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_programs.blueprint_programs_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_quantity_snapshots" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_quantity_snapshots.blueprint_qty_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_quantity_snapshots.blueprint_qty_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_quantity_snapshots" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_quantity_snapshots.blueprint_qty_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_quantity_snapshots.blueprint_qty_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_rule_sets" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_rule_sets.blueprint_rule_set_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_rule_sets.blueprint_rule_set_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_rule_sets" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_rule_sets.blueprint_rule_set_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_rule_sets.blueprint_rule_set_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_rule_sets" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_rule_sets.blueprint_rule_set_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_rule_sets.blueprint_rule_set_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_rule_sets" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_rule_sets.blueprint_rule_set_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_rule_sets.blueprint_rule_set_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_rule_sets" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_rule_sets.blueprint_rule_set_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_rule_sets.blueprint_rule_set_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_sheet_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_sheet_templates.blueprint_sheet_templates_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_sheet_templates.blueprint_sheet_templates_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_sheet_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_sheet_templates.blueprint_sheet_templates_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_sheet_templates.blueprint_sheet_templates_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshot_nbr12721" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshot_nbr12721.blueprint_snapshot_nbr12721_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshot_nbr12721.blueprint_snapshot_nbr12721_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshot_nbr12721" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshot_nbr12721.blueprint_snapshot_nbr12721_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshot_nbr12721.blueprint_snapshot_nbr12721_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshot_nbr12721_aprovacoes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshot_nbr12721_aprovacoes.blueprint_snapshot_nbr12721_aprovacoes_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshot_nbr12721_aprovacoes.blueprint_snapshot_nbr12721_aprovacoes_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshot_produto" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshot_produto.blueprint_snapshot_produto_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshot_produto.blueprint_snapshot_produto_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_snapshot_produto" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_snapshot_produto.blueprint_snapshot_produto_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_snapshot_produto.blueprint_snapshot_produto_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_armadura" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_armadura.blueprint_study_armadura_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_armadura.blueprint_study_armadura_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_armadura" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_armadura.blueprint_study_armadura_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_armadura.blueprint_study_armadura_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_eletrica" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_eletrica.blueprint_study_eletrica_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_eletrica.blueprint_study_eletrica_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_eletrica" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_eletrica.blueprint_study_eletrica_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_eletrica.blueprint_study_eletrica_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_entorno" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_entorno.blueprint_study_entorno_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_entorno.blueprint_study_entorno_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_entorno" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_entorno.blueprint_study_entorno_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_entorno.blueprint_study_entorno_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_incendio" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_incendio.blueprint_study_incendio_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_incendio.blueprint_study_incendio_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_incendio" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_incendio.blueprint_study_incendio_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_incendio.blueprint_study_incendio_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_nbr12721" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_nbr12721.blueprint_study_nbr12721_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_nbr12721.blueprint_study_nbr12721_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_nbr12721" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_nbr12721.blueprint_study_nbr12721_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_nbr12721.blueprint_study_nbr12721_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_permissions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_permissions.blueprint_study_permissions_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_permissions.blueprint_study_permissions_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_permissions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_permissions.blueprint_study_permissions_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_permissions.blueprint_study_permissions_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_projeto_executivo" WHERE (((is_org_member(organization_id) AND (status = 'RASCUNHO'::text)))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_projeto_executivo" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_projeto_executivo" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_projeto_executivo" WHERE (((is_org_member(organization_id) AND (status = 'RASCUNHO'::text)))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_projeto_executivo" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_projeto_executivo.blueprint_projeto_executivo_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_referencias" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_referencias.blueprint_study_referencias_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_referencias.blueprint_study_referencias_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_referencias" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_referencias.blueprint_study_referencias_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_referencias.blueprint_study_referencias_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_regularizacao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_regularizacao.blueprint_study_regularizacao_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_regularizacao.blueprint_study_regularizacao_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_regularizacao" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_regularizacao.blueprint_study_regularizacao_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_regularizacao.blueprint_study_regularizacao_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_sigef" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_sigef.blueprint_study_sigef_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_sigef.blueprint_study_sigef_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_sigef" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_sigef.blueprint_study_sigef_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_sigef.blueprint_study_sigef_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_terraplenagem" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_terraplenagem.blueprint_study_terraplenagem_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_terraplenagem.blueprint_study_terraplenagem_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_terraplenagem" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_terraplenagem.blueprint_study_terraplenagem_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_terraplenagem.blueprint_study_terraplenagem_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_vias" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_vias.blueprint_study_vias_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_vias.blueprint_study_vias_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_study_vias" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_study_vias.blueprint_study_vias_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_study_vias.blueprint_study_vias_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_table_definitions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_table_definitions.blueprint_table_definitions_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_table_definitions.blueprint_table_definitions_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_table_definitions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_table_definitions.blueprint_table_definitions_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_table_definitions.blueprint_table_definitions_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_underlays" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_underlays.blueprint_underlay_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_underlays.blueprint_underlay_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_underlays" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_underlays.blueprint_underlay_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_underlays.blueprint_underlay_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_underlays" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_underlays.blueprint_underlay_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_underlays.blueprint_underlay_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_underlays" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_underlays.blueprint_underlay_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_underlays.blueprint_underlay_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_underlays" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_underlays.blueprint_underlay_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_underlays.blueprint_underlay_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_view_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_view_templates.blueprint_view_templates_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_view_templates.blueprint_view_templates_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_view_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_view_templates.blueprint_view_templates_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_view_templates.blueprint_view_templates_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_wall_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_wall_types.blueprint_wall_type_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_wall_types.blueprint_wall_type_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_wall_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_wall_types.blueprint_wall_type_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_wall_types.blueprint_wall_type_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_wall_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_wall_types.blueprint_wall_type_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_wall_types.blueprint_wall_type_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_wall_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_wall_types.blueprint_wall_type_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_wall_types.blueprint_wall_type_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_wall_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_wall_types.blueprint_wall_type_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_wall_types.blueprint_wall_type_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_webhook_entregas" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_webhook_entregas.blueprint_webhook_entregas_org_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_webhook_entregas.blueprint_webhook_entregas_org_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_webhooks" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_webhooks.blueprint_webhooks_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_webhooks.blueprint_webhooks_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_webhooks" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_webhooks.blueprint_webhooks_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_webhooks.blueprint_webhooks_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_chat_channels" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_chat_channels.broker_channels_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_chat_channels.broker_channels_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_chat_channels" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_chat_channels.broker_channels_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_chat_channels.broker_channels_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_chat_channels" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_chat_channels.broker_channels_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_chat_channels.broker_channels_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_chat_messages" WHERE ((((EXISTS ( SELECT 1
   FROM broker_portal_chat_channels ch
  WHERE ((ch.id = broker_portal_chat_messages.channel_id) AND (is_org_member(ch.organization_id) OR is_superadmin())))) AND ((sender_email = (auth.jwt() ->> 'email'::text)) OR is_superadmin())))) IS DISTINCT FROM ((((EXISTS ( SELECT 1
   FROM broker_portal_chat_channels ch
  WHERE ((ch.id = broker_portal_chat_messages.channel_id) AND (COALESCE((ch.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))) AND ((sender_email = (auth.jwt() ->> 'email'::text)) OR is_superadmin()))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_chat_messages.broker_messages_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_chat_messages.broker_messages_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_chat_messages" WHERE (((EXISTS ( SELECT 1
   FROM broker_portal_chat_channels ch
  WHERE ((ch.id = broker_portal_chat_messages.channel_id) AND (is_org_member(ch.organization_id) OR is_superadmin())))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM broker_portal_chat_channels ch
  WHERE ((ch.id = broker_portal_chat_messages.channel_id) AND (COALESCE((ch.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_chat_messages.broker_messages_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_chat_messages.broker_messages_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_commissions" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_commissions.broker_commissions_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_commissions.broker_commissions_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_commissions" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_commissions.broker_commissions_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_commissions.broker_commissions_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_commissions" WHERE ((((broker_email = (auth.jwt() ->> 'email'::text)) OR is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM ((((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_commissions.broker_commissions_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_commissions.broker_commissions_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_event_registrations" WHERE (((EXISTS ( SELECT 1
   FROM broker_portal_events e
  WHERE ((e.id = broker_portal_event_registrations.event_id) AND (is_org_member(e.organization_id) OR is_superadmin())))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM broker_portal_events e
  WHERE ((e.id = broker_portal_event_registrations.event_id) AND (COALESCE((e.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_event_registrations.broker_event_registrations_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_event_registrations.broker_event_registrations_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_events" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_events.broker_events_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_events.broker_events_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_events" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_events.broker_events_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_events.broker_events_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_events" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_events.broker_events_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_events.broker_events_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_integrations" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_integrations.broker_integrations_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_integrations.broker_integrations_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_integrations" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_integrations.broker_integrations_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_integrations.broker_integrations_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_integrations" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_integrations.broker_integrations_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_integrations.broker_integrations_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_lead_interactions" WHERE (((EXISTS ( SELECT 1
   FROM broker_portal_leads l
  WHERE ((l.id = broker_portal_lead_interactions.lead_id) AND (is_org_member(l.organization_id) OR is_superadmin())))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM broker_portal_leads l
  WHERE ((l.id = broker_portal_lead_interactions.lead_id) AND (COALESCE((l.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_lead_interactions.broker_lead_interactions_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_lead_interactions.broker_lead_interactions_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_leads" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_leads.broker_leads_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_leads.broker_leads_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_leads" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_leads.broker_leads_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_leads.broker_leads_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_leads" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_leads.broker_leads_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_leads.broker_leads_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_leads" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_leads.broker_leads_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_leads.broker_leads_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_materials" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_materials.broker_materials_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_materials.broker_materials_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_materials" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_materials.broker_materials_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_materials.broker_materials_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_materials" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_materials.broker_materials_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_materials.broker_materials_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_price_columns" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_price_columns.broker_portal_price_columns_member USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_price_columns.broker_portal_price_columns_member USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_price_columns" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_price_columns.broker_portal_price_columns_member CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_price_columns.broker_portal_price_columns_member CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_proposal_units" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text)))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_proposal_units.broker_proposal_units_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_proposal_units.broker_proposal_units_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_proposal_units" WHERE (((is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
           FROM organization_members om
          WHERE ((om.organization_id = pr.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text))))))))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
           FROM organization_members om
          WHERE ((om.organization_id = pr.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text)))))))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_proposal_units.broker_proposal_units_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_proposal_units.broker_proposal_units_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_proposal_units" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR is_org_member(pr.organization_id)))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR COALESCE((pr.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_proposal_units.broker_proposal_units_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_proposal_units.broker_proposal_units_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_proposal_units" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text)))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_proposal_units.broker_proposal_units_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_proposal_units.broker_proposal_units_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_proposals" WHERE (((is_org_member(organization_id) AND ((lower(broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = broker_portal_proposals.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text)))))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((lower(broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = broker_portal_proposals.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text))))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_proposals.broker_proposals_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_proposals.broker_proposals_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_proposals" WHERE ((((broker_email = (auth.jwt() ->> 'email'::text)) OR is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM ((((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_proposals.broker_proposals_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_proposals.broker_proposals_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_proposals" WHERE ((((broker_email = (auth.jwt() ->> 'email'::text)) OR is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM ((((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_proposals.broker_proposals_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_proposals.broker_proposals_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_rankings" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_rankings.broker_rankings_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_rankings.broker_rankings_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_rankings" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_rankings.broker_rankings_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_rankings.broker_rankings_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_rankings" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_rankings.broker_rankings_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_rankings.broker_rankings_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_trainings" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_trainings.broker_trainings_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_trainings.broker_trainings_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_trainings" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_trainings.broker_trainings_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_trainings.broker_trainings_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_portal_trainings" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_portal_trainings.broker_trainings_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_portal_trainings.broker_trainings_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_property_access" WHERE (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND is_org_member(p.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_property_access.broker_property_access_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_property_access.broker_property_access_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_property_access" WHERE (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND is_org_member(p.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_property_access.broker_property_access_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_property_access.broker_property_access_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_property_access" WHERE (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND is_org_member(p.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_property_access.broker_property_access_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_property_access.broker_property_access_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_webhook_configs" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_webhook_configs.broker_webhooks_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_webhook_configs.broker_webhooks_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."broker_webhook_configs" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s broker_webhook_configs.broker_webhooks_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s broker_webhook_configs.broker_webhooks_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."candidates" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s candidates.candidates_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s candidates.candidates_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."chart_of_accounts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s chart_of_accounts.Users can view chart of accounts USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s chart_of_accounts.Users can view chart of accounts USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."client_request_eventos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s client_request_eventos.client_request_eventos_membro_grava CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s client_request_eventos.client_request_eventos_membro_grava CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."client_request_eventos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s client_request_eventos.client_request_eventos_membro_le USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s client_request_eventos.client_request_eventos_membro_le USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_deal_code_history" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_deal_code_history.commercial_deal_code_history_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_deal_code_history.commercial_deal_code_history_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_property_status_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_property_status_events.org_access_prop_status_events USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_property_status_events.org_access_prop_status_events USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."commercial_property_status_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s commercial_property_status_events.org_access_prop_status_events CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s commercial_property_status_events.org_access_prop_status_events CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."communication_receipts" WHERE (((EXISTS ( SELECT 1
   FROM communications c
  WHERE ((c.id = communication_receipts.communication_id) AND is_org_member(c.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM communications c
  WHERE ((c.id = communication_receipts.communication_id) AND COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s communication_receipts.receipt_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s communication_receipts.receipt_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."communications" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s communications.comm_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s communications.comm_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condo_rateio_number_history" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condo_rateio_number_history.condo_rateio_number_history_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condo_rateio_number_history.condo_rateio_number_history_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_avisos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_avisos.condominio_avisos_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_avisos.condominio_avisos_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_avisos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_avisos.condominio_avisos_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_avisos.condominio_avisos_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_documentos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_documentos.condominio_documentos_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_documentos.condominio_documentos_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_documentos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_documentos.condominio_documentos_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_documentos.condominio_documentos_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_rateio_decisoes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_rateio_decisoes.condominio_rateio_decisoes_membro_le USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_rateio_decisoes.condominio_rateio_decisoes_membro_le USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_rateio_despesas" WHERE (((EXISTS ( SELECT 1
   FROM condominio_rateios r
  WHERE ((r.id = condominio_rateio_despesas.rateio_id) AND is_org_member(r.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM condominio_rateios r
  WHERE ((r.id = condominio_rateio_despesas.rateio_id) AND COALESCE((r.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_rateio_despesas.condominio_rateio_despesas_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_rateio_despesas.condominio_rateio_despesas_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_rateio_despesas" WHERE (((EXISTS ( SELECT 1
   FROM condominio_rateios r
  WHERE ((r.id = condominio_rateio_despesas.rateio_id) AND is_org_member(r.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM condominio_rateios r
  WHERE ((r.id = condominio_rateio_despesas.rateio_id) AND COALESCE((r.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_rateio_despesas.condominio_rateio_despesas_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_rateio_despesas.condominio_rateio_despesas_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_rateios" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_rateios.condominio_rateios_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_rateios.condominio_rateios_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condominio_rateios" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condominio_rateios.condominio_rateios_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condominio_rateios.condominio_rateios_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condomino_portal_access" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condomino_portal_access.condomino_portal_access_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condomino_portal_access.condomino_portal_access_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."condomino_portal_access" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s condomino_portal_access.condomino_portal_access_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s condomino_portal_access.condomino_portal_access_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_acceptances" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_acceptances.org_access_contract_acceptances USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_acceptances.org_access_contract_acceptances USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_acceptances" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_acceptances.org_access_contract_acceptances CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_acceptances.org_access_contract_acceptances CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_document_requirements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_document_requirements.org_access_contract_document_requirements USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_document_requirements.org_access_contract_document_requirements USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_document_requirements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_document_requirements.org_access_contract_document_requirements CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_document_requirements.org_access_contract_document_requirements CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_evaluations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_evaluations.org_access_contract_evaluations USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_evaluations.org_access_contract_evaluations USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_evaluations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_evaluations.org_access_contract_evaluations CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_evaluations.org_access_contract_evaluations CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_guarantees" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_guarantees.org_access_contract_guarantees USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_guarantees.org_access_contract_guarantees USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_guarantees" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_guarantees.org_access_contract_guarantees CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_guarantees.org_access_contract_guarantees CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_guarantors" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_guarantors.org_access_contract_guarantors USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_guarantors.org_access_contract_guarantors USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_guarantors" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_guarantors.org_access_contract_guarantors CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_guarantors.org_access_contract_guarantors CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_index_values" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_index_values.contract_index_values_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_index_values.contract_index_values_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_index_values" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_index_values.contract_index_values_write USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_index_values.contract_index_values_write USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_index_values" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_index_values.contract_index_values_write CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_index_values.contract_index_values_write CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_interfaces" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_interfaces.org_access_contract_interfaces USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_interfaces.org_access_contract_interfaces USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_interfaces" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_interfaces.org_access_contract_interfaces CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_interfaces.org_access_contract_interfaces CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_labor_questionnaires" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_labor_questionnaires.org_access_contract_labor_questionnaires USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_labor_questionnaires.org_access_contract_labor_questionnaires USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_labor_questionnaires" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_labor_questionnaires.org_access_contract_labor_questionnaires CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_labor_questionnaires.org_access_contract_labor_questionnaires CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_organization_moves" WHERE (((is_org_member(from_org_id) OR is_org_member(to_org_id)))) IS DISTINCT FROM (((COALESCE((from_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR COALESCE((to_org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_organization_moves.contract_organization_moves_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_organization_moves.contract_organization_moves_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_penalties" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_penalties.org_access_contract_penalties USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_penalties.org_access_contract_penalties USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_penalties" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_penalties.org_access_contract_penalties CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_penalties.org_access_contract_penalties CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_retention_releases" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_retention_releases.org_access_contract_retention_releases USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_retention_releases.org_access_contract_retention_releases USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_retention_releases" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_retention_releases.org_access_contract_retention_releases CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_retention_releases.org_access_contract_retention_releases CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_risk_assessments" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_risk_assessments.org_access_contract_risk_assessments USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_risk_assessments.org_access_contract_risk_assessments USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_risk_assessments" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_risk_assessments.org_access_contract_risk_assessments CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_risk_assessments.org_access_contract_risk_assessments CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_scope_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_scope_templates.scope_tpl_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_scope_templates.scope_tpl_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_scope_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_scope_templates.scope_tpl_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_scope_templates.scope_tpl_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_scope_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_scope_templates.scope_tpl_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_scope_templates.scope_tpl_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_scope_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_scope_templates.scope_tpl_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_scope_templates.scope_tpl_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_supply_matrix" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_supply_matrix.org_access_contract_supply_matrix USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_supply_matrix.org_access_contract_supply_matrix USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_supply_matrix" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_supply_matrix.org_access_contract_supply_matrix CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_supply_matrix.org_access_contract_supply_matrix CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_technical_responsibilities" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_technical_responsibilities.org_access_contract_technical_responsibilities USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_technical_responsibilities.org_access_contract_technical_responsibilities USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_technical_responsibilities" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_technical_responsibilities.org_access_contract_technical_responsibilities CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_technical_responsibilities.org_access_contract_technical_responsibilities CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_template_clauses" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_template_clauses.contract_template_clauses_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_template_clauses.contract_template_clauses_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_template_clauses" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_template_clauses.contract_template_clauses_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_template_clauses.contract_template_clauses_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_templates.contract_templates_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_templates.contract_templates_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_templates" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_templates.contract_templates_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_templates.contract_templates_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_types" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_types.contract_types_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_types.contract_types_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_types" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_types.contract_types_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_types.contract_types_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contractor_documents" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contractor_documents.contractor_documents_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contractor_documents.contractor_documents_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contractor_measurements" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contractor_measurements.contractor_measurements_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contractor_measurements.contractor_measurements_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contractors" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contractors.contractors_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contractors.contractors_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."cost_center_closing_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s cost_center_closing_items.cost_center_closing_items_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s cost_center_closing_items.cost_center_closing_items_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."cost_center_closing_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s cost_center_closing_items.cost_center_closing_items_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s cost_center_closing_items.cost_center_closing_items_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."cost_center_closings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s cost_center_closings.cost_center_closings_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s cost_center_closings.cost_center_closings_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."cost_center_closings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s cost_center_closings.cost_center_closings_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s cost_center_closings.cost_center_closings_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."credit_room_members" WHERE (((is_org_member(organization_id) AND fn_credit_room_is_internal(credit_room_id)))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s credit_room_members.credit_room_members_write USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s credit_room_members.credit_room_members_write USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."credit_room_members" WHERE (((is_org_member(organization_id) AND fn_credit_room_is_internal(credit_room_id)))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s credit_room_members.credit_room_members_write CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s credit_room_members.credit_room_members_write CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."credit_room_versions" WHERE (((is_org_member(organization_id) AND fn_credit_room_is_internal(credit_room_id)))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s credit_room_versions.credit_room_versions_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s credit_room_versions.credit_room_versions_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."credit_rooms" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s credit_rooms.credit_rooms_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s credit_rooms.credit_rooms_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."credit_rooms" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s credit_rooms.credit_rooms_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s credit_rooms.credit_rooms_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."credit_rooms" WHERE (((is_org_member(organization_id) OR is_credit_room_member(id)))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_credit_room_member(id))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s credit_rooms.credit_rooms_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s credit_rooms.credit_rooms_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."credit_rooms" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s credit_rooms.credit_rooms_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s credit_rooms.credit_rooms_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."credit_rooms" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s credit_rooms.credit_rooms_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s credit_rooms.credit_rooms_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_contacts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_contacts.crm_contacts_org_members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_contacts.crm_contacts_org_members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_contacts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_contacts.crm_contacts_org_members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_contacts.crm_contacts_org_members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_opportunities" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_opportunities.crm_opportunities_org_members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_opportunities.crm_opportunities_org_members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_opportunities" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_opportunities.crm_opportunities_org_members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_opportunities.crm_opportunities_org_members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_proposals" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_proposals.crm_proposals_org_members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_proposals.crm_proposals_org_members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_proposals" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_proposals.crm_proposals_org_members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_proposals.crm_proposals_org_members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_tasks" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_tasks.crm_tasks_org_members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_tasks.crm_tasks_org_members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_tasks" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_tasks.crm_tasks_org_members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_tasks.crm_tasks_org_members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_timeline_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_timeline_events.crm_timeline_org_members USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_timeline_events.crm_timeline_org_members USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."crm_timeline_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s crm_timeline_events.crm_timeline_org_members CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s crm_timeline_events.crm_timeline_org_members CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_database_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_database_org_shares.cdos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_database_org_shares.cdos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_databases" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_databases.custom_databases_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_databases.custom_databases_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_databases" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_databases.custom_databases_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_databases.custom_databases_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_databases" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_databases.custom_databases_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_databases.custom_databases_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_databases" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_databases.custom_databases_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_databases.custom_databases_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_items" WHERE ((((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (is_org_member(d.organization_id) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND is_org_member(sh.target_org_id)))))))) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_items.custom_items_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_items.custom_items_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_items" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (is_org_member(d.organization_id) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND is_org_member(sh.target_org_id))))))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_items.custom_items_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_items.custom_items_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_items" WHERE ((((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (is_org_member(d.organization_id) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND is_org_member(sh.target_org_id)))))))) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_items.custom_items_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_items.custom_items_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."custom_items" WHERE ((((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (is_org_member(d.organization_id) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND is_org_member(sh.target_org_id)))))))) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s custom_items.custom_items_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s custom_items.custom_items_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."deal_credit_analysis" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s deal_credit_analysis.deal_credit_analysis_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s deal_credit_analysis.deal_credit_analysis_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."deal_credit_analysis" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s deal_credit_analysis.deal_credit_analysis_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s deal_credit_analysis.deal_credit_analysis_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_allocations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_allocations.debt_allocations_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_allocations.debt_allocations_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_allocations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_allocations.debt_allocations_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_allocations.debt_allocations_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_component_accounts" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_component_accounts.debt_component_accounts_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_component_accounts.debt_component_accounts_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_component_accounts" WHERE ((((organization_id IS NOT NULL) AND is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_component_accounts.debt_component_accounts_write USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_component_accounts.debt_component_accounts_write USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_component_accounts" WHERE ((((organization_id IS NOT NULL) AND is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_component_accounts.debt_component_accounts_write CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_component_accounts.debt_component_accounts_write CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_contracts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_contracts.debt_contracts_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_contracts.debt_contracts_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_contracts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_contracts.debt_contracts_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_contracts.debt_contracts_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_covenant_measurements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_covenant_measurements.debt_covenant_measurements_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_covenant_measurements.debt_covenant_measurements_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_covenant_measurements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_covenant_measurements.debt_covenant_measurements_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_covenant_measurements.debt_covenant_measurements_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_covenants" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_covenants.debt_covenants_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_covenants.debt_covenants_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_covenants" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_covenants.debt_covenants_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_covenants.debt_covenants_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_disbursements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_disbursements.debt_disbursements_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_disbursements.debt_disbursements_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_disbursements" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_disbursements.debt_disbursements_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_disbursements.debt_disbursements_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_events.debt_events_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_events.debt_events_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_events.debt_events_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_events.debt_events_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_installments" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_installments.debt_installments_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_installments.debt_installments_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_installments" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_installments.debt_installments_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_installments.debt_installments_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_schedules" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_schedules.debt_schedules_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_schedules.debt_schedules_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."debt_schedules" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s debt_schedules.debt_schedules_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s debt_schedules.debt_schedules_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."digital_files" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s digital_files.digital_file_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s digital_files.digital_file_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."digital_files" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s digital_files.digital_file_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s digital_files.digital_file_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."digital_files" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s digital_files.digital_file_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s digital_files.digital_file_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."digital_files" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s digital_files.digital_file_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s digital_files.digital_file_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."digital_files" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s digital_files.digital_file_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s digital_files.digital_file_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_assinaturas" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_assinaturas.doc_gen_assinaturas_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_assinaturas.doc_gen_assinaturas_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_blocos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_blocos.doc_gen_blocos_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_blocos.doc_gen_blocos_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_blocos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_blocos.doc_gen_blocos_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_blocos.doc_gen_blocos_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_blocos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_blocos.doc_gen_blocos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_blocos.doc_gen_blocos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_blocos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_blocos.doc_gen_blocos_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_blocos.doc_gen_blocos_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_blocos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_blocos.doc_gen_blocos_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_blocos.doc_gen_blocos_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_documento_versoes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_documento_versoes.doc_gen_documento_versoes_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_documento_versoes.doc_gen_documento_versoes_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_documento_versoes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_documento_versoes.doc_gen_documento_versoes_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_documento_versoes.doc_gen_documento_versoes_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_documentos" WHERE (((is_org_member(organization_id) AND (status = 'RASCUNHO'::text)))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_documentos.doc_gen_documentos_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_documentos.doc_gen_documentos_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_documentos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_documentos.doc_gen_documentos_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_documentos.doc_gen_documentos_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_documentos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_documentos.doc_gen_documentos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_documentos.doc_gen_documentos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_documentos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_documentos.doc_gen_documentos_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_documentos.doc_gen_documentos_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_documentos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_documentos.doc_gen_documentos_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_documentos.doc_gen_documentos_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_eventos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_eventos.doc_gen_eventos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_eventos.doc_gen_eventos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_fontes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_fontes.doc_gen_fontes_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_fontes.doc_gen_fontes_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_fontes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_fontes.doc_gen_fontes_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_fontes.doc_gen_fontes_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_fontes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_fontes.doc_gen_fontes_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_fontes.doc_gen_fontes_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_fontes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_fontes.doc_gen_fontes_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_fontes.doc_gen_fontes_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_fontes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_fontes.doc_gen_fontes_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_fontes.doc_gen_fontes_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_modelo_versoes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_modelo_versoes.doc_gen_modelo_versoes_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_modelo_versoes.doc_gen_modelo_versoes_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_modelo_versoes" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_modelo_versoes.doc_gen_modelo_versoes_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_modelo_versoes.doc_gen_modelo_versoes_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_modelos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_modelos.doc_gen_modelos_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_modelos.doc_gen_modelos_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_modelos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_modelos.doc_gen_modelos_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_modelos.doc_gen_modelos_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_modelos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_modelos.doc_gen_modelos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_modelos.doc_gen_modelos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_modelos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_modelos.doc_gen_modelos_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_modelos.doc_gen_modelos_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_modelos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_modelos.doc_gen_modelos_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_modelos.doc_gen_modelos_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_vinculos" WHERE (((is_org_member(organization_id) AND (NOT ((tipo = 'RESPONDE'::text) AND (de_documento_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM doc_gen_documentos d
  WHERE ((d.id = doc_gen_vinculos.de_documento_id) AND (d.status <> 'RASCUNHO'::text))))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (NOT ((tipo = 'RESPONDE'::text) AND (de_documento_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM doc_gen_documentos d
  WHERE ((d.id = doc_gen_vinculos.de_documento_id) AND (d.status <> 'RASCUNHO'::text)))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_vinculos.doc_gen_vinculos_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_vinculos.doc_gen_vinculos_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_vinculos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_vinculos.doc_gen_vinculos_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_vinculos.doc_gen_vinculos_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."doc_gen_vinculos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s doc_gen_vinculos.doc_gen_vinculos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s doc_gen_vinculos.doc_gen_vinculos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_cost_splits" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_cost_splits.employee_cost_splits_org_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_cost_splits.employee_cost_splits_org_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_cost_splits" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_cost_splits.employee_cost_splits_org_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_cost_splits.employee_cost_splits_org_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_documents" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_documents.employee_docs_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_documents.employee_docs_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_salary_history" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_salary_history.emp_salary_hist_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_salary_history.emp_salary_hist_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_salary_history" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_salary_history.emp_salary_hist_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_salary_history.emp_salary_hist_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."employee_trainings" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s employee_trainings.employee_trainings_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s employee_trainings.employee_trainings_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristic_values" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristic_values" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristic_values" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristic_values" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristic_values" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristic_values.empr_unit_char_values_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristics" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristics.empr_unit_characteristics_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristics.empr_unit_characteristics_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristics" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristics.empr_unit_characteristics_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristics.empr_unit_characteristics_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristics" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristics.empr_unit_characteristics_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristics.empr_unit_characteristics_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristics" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristics.empr_unit_characteristics_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristics.empr_unit_characteristics_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."empreendimento_unit_characteristics" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s empreendimento_unit_characteristics.empr_unit_characteristics_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s empreendimento_unit_characteristics.empr_unit_characteristics_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."epi_catalog" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s epi_catalog.epi_catalog_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s epi_catalog.epi_catalog_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."epi_deliveries" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s epi_deliveries.epi_deliveries_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s epi_deliveries.epi_deliveries_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."esocial_batch_events" WHERE (((EXISTS ( SELECT 1
   FROM esocial_batches b
  WHERE ((b.id = esocial_batch_events.batch_id) AND is_org_member(b.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM esocial_batches b
  WHERE ((b.id = esocial_batch_events.batch_id) AND COALESCE((b.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s esocial_batch_events.esocial_batch_ev_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s esocial_batch_events.esocial_batch_ev_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."esocial_batches" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s esocial_batches.esocial_batches_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s esocial_batches.esocial_batches_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."esocial_config" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s esocial_config.esocial_config_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s esocial_config.esocial_config_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."esocial_events" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s esocial_events.esocial_events_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s esocial_events.esocial_events_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."esocial_pending_alerts" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s esocial_pending_alerts.esocial_alerts_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s esocial_pending_alerts.esocial_alerts_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."evaluation_cycles" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s evaluation_cycles.eval_cycles_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s evaluation_cycles.eval_cycles_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."evaluation_responses" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s evaluation_responses.eval_responses_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s evaluation_responses.eval_responses_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."evaluation_results" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s evaluation_results.eval_results_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s evaluation_results.eval_results_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."evidence_files" WHERE (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = evidence_files.work_order_id) AND is_org_member(wo.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = evidence_files.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s evidence_files.evidence_files_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s evidence_files.evidence_files_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."guarantee_deposit_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s guarantee_deposit_events.org_access_guarantee_deposit_events USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s guarantee_deposit_events.org_access_guarantee_deposit_events USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."guarantee_deposit_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s guarantee_deposit_events.org_access_guarantee_deposit_events CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s guarantee_deposit_events.org_access_guarantee_deposit_events CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."guarantee_documents" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s guarantee_documents.org_access_guarantee_documents USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s guarantee_documents.org_access_guarantee_documents USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."guarantee_documents" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s guarantee_documents.org_access_guarantee_documents CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s guarantee_documents.org_access_guarantee_documents CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."hr_monthly_snapshots" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s hr_monthly_snapshots.hr_snap_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s hr_monthly_snapshots.hr_snap_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."hr_productivity_metrics" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s hr_productivity_metrics.hr_prod_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s hr_productivity_metrics.hr_prod_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."hr_turnover_events" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s hr_turnover_events.hr_turn_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s hr_turnover_events.hr_turn_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."incentive_rules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s incentive_rules.incentive_rules_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s incentive_rules.incentive_rules_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."incentive_rules" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s incentive_rules.incentive_rules_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s incentive_rules.incentive_rules_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."interview_records" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s interview_records.interview_records_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s interview_records.interview_records_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."investor_opportunity_competitors" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s investor_opportunity_competitors.competitors_org_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s investor_opportunity_competitors.competitors_org_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."job_openings" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s job_openings.job_openings_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s job_openings.job_openings_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."labor_diary_entries" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s labor_diary_entries.labor_diary_entries_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s labor_diary_entries.labor_diary_entries_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."labor_diary_workers" WHERE (((EXISTS ( SELECT 1
   FROM labor_diary_entries d
  WHERE ((d.id = labor_diary_workers.diary_entry_id) AND is_org_member(d.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM labor_diary_entries d
  WHERE ((d.id = labor_diary_workers.diary_entry_id) AND COALESCE((d.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s labor_diary_workers.labor_diary_workers_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s labor_diary_workers.labor_diary_workers_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."labor_teams" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s labor_teams.labor_teams_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s labor_teams.labor_teams_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_orders" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_orders.maintenance_orders_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_orders.maintenance_orders_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_orders" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_orders.maintenance_orders_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_orders.maintenance_orders_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_orders" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_orders.maintenance_orders_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_orders.maintenance_orders_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_orders" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_orders.maintenance_orders_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_orders.maintenance_orders_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_orders" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_orders.maintenance_orders_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_orders.maintenance_orders_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plans" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plans.maintenance_plans_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plans.maintenance_plans_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plans" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plans.maintenance_plans_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plans.maintenance_plans_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plans" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plans.maintenance_plans_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plans.maintenance_plans_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plans" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plans.maintenance_plans_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plans.maintenance_plans_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."maintenance_plans" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s maintenance_plans.maintenance_plans_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s maintenance_plans.maintenance_plans_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."non_conformances" WHERE (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = non_conformances.work_order_id) AND is_org_member(wo.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = non_conformances.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s non_conformances.non_conformances_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s non_conformances.non_conformances_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."oe_checklist_items" WHERE (((EXISTS ( SELECT 1
   FROM oe_checklist_templates t
  WHERE ((t.id = oe_checklist_items.template_id) AND is_org_member(t.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM oe_checklist_templates t
  WHERE ((t.id = oe_checklist_items.template_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s oe_checklist_items.oe_checklist_items_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s oe_checklist_items.oe_checklist_items_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."oe_checklist_responses" WHERE (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = oe_checklist_responses.work_order_id) AND is_org_member(wo.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = oe_checklist_responses.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s oe_checklist_responses.checklist_responses_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s oe_checklist_responses.checklist_responses_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."oe_checklist_templates" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s oe_checklist_templates.oe_checklist_templates_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s oe_checklist_templates.oe_checklist_templates_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_areas" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_areas.cno_areas_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_areas.cno_areas_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_areas" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_areas.cno_areas_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_areas.cno_areas_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_compliance_score" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_compliance_score.cno_compliance_score_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_compliance_score.cno_compliance_score_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_compliance_score" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_compliance_score.cno_compliance_score_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_compliance_score.cno_compliance_score_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_dctfweb" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_dctfweb.cno_dctfweb_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_dctfweb.cno_dctfweb_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_dctfweb" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_dctfweb.cno_dctfweb_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_dctfweb.cno_dctfweb_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_deductions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_deductions.cno_deductions_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_deductions.cno_deductions_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_deductions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_deductions.cno_deductions_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_deductions.cno_deductions_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_documents" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_documents.cno_documents_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_documents.cno_documents_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_documents" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_documents.cno_documents_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_documents.cno_documents_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_reductions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_reductions.cno_reductions_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_reductions.cno_reductions_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_reductions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_reductions.cno_reductions_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_reductions.cno_reductions_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_registrations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_registrations.cno_registrations_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_registrations.cno_registrations_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_registrations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_registrations.cno_registrations_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_registrations.cno_registrations_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_simulations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_simulations.cno_simulations_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_simulations.cno_simulations_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."opura_cno_simulations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s opura_cno_simulations.cno_simulations_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s opura_cno_simulations.cno_simulations_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."org_funcoes" WHERE (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE is_org_member(c.org_id))))) IS DISTINCT FROM (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s org_funcoes.org_funcoes_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s org_funcoes.org_funcoes_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."org_funcoes" WHERE (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE is_org_member(c.org_id))))) IS DISTINCT FROM (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s org_funcoes.org_funcoes_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s org_funcoes.org_funcoes_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."org_funcoes" WHERE (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE is_org_member(c.org_id))))) IS DISTINCT FROM (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s org_funcoes.org_funcoes_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s org_funcoes.org_funcoes_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."org_funcoes" WHERE (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE is_org_member(c.org_id))))) IS DISTINCT FROM (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s org_funcoes.org_funcoes_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s org_funcoes.org_funcoes_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."org_funcoes" WHERE (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE is_org_member(c.org_id))))) IS DISTINCT FROM (((company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s org_funcoes.org_funcoes_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s org_funcoes.org_funcoes_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_compensation_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_compensation_settings.partner_comp_settings_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_compensation_settings.partner_comp_settings_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_compensation_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_compensation_settings.partner_comp_settings_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_compensation_settings.partner_comp_settings_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_conversations" WHERE ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR is_org_member(partner_workspaces.organization_id)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))) IS DISTINCT FROM ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_conversations.partner_conversations_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_conversations.partner_conversations_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_conversations" WHERE ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR is_org_member(partner_workspaces.organization_id)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))) IS DISTINCT FROM ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_conversations.partner_conversations_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_conversations.partner_conversations_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_messages" WHERE (((conversation_id IN ( SELECT c.id
   FROM (partner_conversations c
     JOIN partner_workspaces pw ON ((pw.id = c.partner_workspace_id)))
  WHERE (is_org_member(pw.organization_id) OR (pw.id IN ( SELECT partner_users.partner_workspace_id
           FROM partner_users
          WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))))) IS DISTINCT FROM (((conversation_id IN ( SELECT c.id
   FROM (partner_conversations c
     JOIN partner_workspaces pw ON ((pw.id = c.partner_workspace_id)))
  WHERE (COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (pw.id IN ( SELECT partner_users.partner_workspace_id
           FROM partner_users
          WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_messages.partner_messages_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_messages.partner_messages_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_messages" WHERE (((conversation_id IN ( SELECT c.id
   FROM (partner_conversations c
     JOIN partner_workspaces pw ON ((pw.id = c.partner_workspace_id)))
  WHERE (is_org_member(pw.organization_id) OR (pw.id IN ( SELECT partner_users.partner_workspace_id
           FROM partner_users
          WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))))) IS DISTINCT FROM (((conversation_id IN ( SELECT c.id
   FROM (partner_conversations c
     JOIN partner_workspaces pw ON ((pw.id = c.partner_workspace_id)))
  WHERE (COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (pw.id IN ( SELECT partner_users.partner_workspace_id
           FROM partner_users
          WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_messages.partner_messages_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_messages.partner_messages_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_requests" WHERE ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR is_org_member(partner_workspaces.organization_id)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))) IS DISTINCT FROM ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_requests.partner_requests_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_requests.partner_requests_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_requests" WHERE ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR is_org_member(partner_workspaces.organization_id)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))) IS DISTINCT FROM ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_requests.partner_requests_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_requests.partner_requests_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_shared_documents" WHERE (((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR is_org_member(partner_workspaces.organization_id)))))) IS DISTINCT FROM (((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_shared_documents.shared_docs_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_shared_documents.shared_docs_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_shared_documents" WHERE ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR is_org_member(partner_workspaces.organization_id)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true))))))) IS DISTINCT FROM ((((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_shared_documents.shared_docs_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_shared_documents.shared_docs_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_shared_folders" WHERE (((partner_workspace_id IN ( SELECT pw.id
   FROM partner_workspaces pw
  WHERE ((pw.organization_id IS NULL) OR is_org_member(pw.organization_id)))))) IS DISTINCT FROM (((partner_workspace_id IN ( SELECT pw.id
   FROM partner_workspaces pw
  WHERE ((pw.organization_id IS NULL) OR COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_shared_folders.shared_folders_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_shared_folders.shared_folders_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."partner_shared_folders" WHERE ((((partner_workspace_id IN ( SELECT pw.id
   FROM partner_workspaces pw
  WHERE ((pw.organization_id IS NULL) OR is_org_member(pw.organization_id)))) OR (partner_workspace_id IN ( SELECT pu.partner_workspace_id
   FROM partner_users pu
  WHERE ((pu.email = (auth.jwt() ->> 'email'::text)) AND (pu.is_active = true))))))) IS DISTINCT FROM ((((partner_workspace_id IN ( SELECT pw.id
   FROM partner_workspaces pw
  WHERE ((pw.organization_id IS NULL) OR COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT pu.partner_workspace_id
   FROM partner_users pu
  WHERE ((pu.email = (auth.jwt() ->> 'email'::text)) AND (pu.is_active = true)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s partner_shared_folders.shared_folders_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s partner_shared_folders.shared_folders_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payment_account_organizations" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM payment_accounts pa
  WHERE ((pa.id = payment_account_organizations.payment_account_id) AND is_org_member(pa.organization_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM payment_accounts pa
  WHERE ((pa.id = payment_account_organizations.payment_account_id) AND COALESCE((pa.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payment_account_organizations.pao_select_member USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payment_account_organizations.pao_select_member USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payment_account_saldo_informado" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payment_account_saldo_informado.saldo_informado_membro USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payment_account_saldo_informado.saldo_informado_membro USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payment_account_saldo_informado" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payment_account_saldo_informado.saldo_informado_membro CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payment_account_saldo_informado.saldo_informado_membro CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payment_types" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payment_types.payment_types_org_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payment_types.payment_types_org_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payment_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payment_types.payment_types_org_write USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payment_types.payment_types_org_write USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payment_types" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payment_types.payment_types_org_write CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payment_types.payment_types_org_write CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payroll_encargos_config" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payroll_encargos_config.payroll_encargos_config_membro USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payroll_encargos_config.payroll_encargos_config_membro USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."payroll_encargos_config" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s payroll_encargos_config.payroll_encargos_config_membro CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s payroll_encargos_config.payroll_encargos_config_membro CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."pdi_items" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s pdi_items.pdi_items_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s pdi_items.pdi_items_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."plano_de_contas" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s plano_de_contas.Users can view cost centers USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s plano_de_contas.Users can view cost centers USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."pricing_rule_applications" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s pricing_rule_applications.pricing_rule_applications_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s pricing_rule_applications.pricing_rule_applications_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."pricing_rule_applications" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s pricing_rule_applications.pricing_rule_applications_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s pricing_rule_applications.pricing_rule_applications_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."pricing_rule_applications" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s pricing_rule_applications.pricing_rule_applications_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s pricing_rule_applications.pricing_rule_applications_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."pricing_rule_applications" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s pricing_rule_applications.pricing_rule_applications_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s pricing_rule_applications.pricing_rule_applications_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."pricing_rule_applications" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s pricing_rule_applications.pricing_rule_applications_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s pricing_rule_applications.pricing_rule_applications_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."product_models" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s product_models.product_models_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s product_models.product_models_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."product_models" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s product_models.product_models_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s product_models.product_models_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."productivity_logs" WHERE (((((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM labor_teams t
  WHERE ((t.id = productivity_logs.team_id) AND is_org_member(t.org_id))))) OR ((employee_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = productivity_logs.employee_id) AND is_org_member(e.org_id)))))))) IS DISTINCT FROM (((((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM labor_teams t
  WHERE ((t.id = productivity_logs.team_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false))))) OR ((employee_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = productivity_logs.employee_id) AND COALESCE((e.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s productivity_logs.productivity_logs_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s productivity_logs.productivity_logs_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."profit_distribution_batches" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s profit_distribution_batches.profit_batches_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s profit_distribution_batches.profit_batches_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."profit_distribution_batches" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s profit_distribution_batches.profit_batches_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s profit_distribution_batches.profit_batches_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."profit_distribution_items" WHERE (((EXISTS ( SELECT 1
   FROM profit_distribution_batches b
  WHERE ((b.id = profit_distribution_items.batch_id) AND is_org_member(b.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM profit_distribution_batches b
  WHERE ((b.id = profit_distribution_items.batch_id) AND COALESCE((b.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s profit_distribution_items.profit_items_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s profit_distribution_items.profit_items_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."profit_distribution_items" WHERE (((EXISTS ( SELECT 1
   FROM profit_distribution_batches b
  WHERE ((b.id = profit_distribution_items.batch_id) AND is_org_member(b.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM profit_distribution_batches b
  WHERE ((b.id = profit_distribution_items.batch_id) AND COALESCE((b.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s profit_distribution_items.profit_items_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s profit_distribution_items.profit_items_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."project_ops_config" WHERE (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_ops_config.project_id) AND is_org_member(((p.settings ->> 'organizationId'::text))::uuid)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_ops_config.project_id) AND COALESCE((((p.settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s project_ops_config.project_ops_config_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s project_ops_config.project_ops_config_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."project_type_templates" WHERE ((((org_id IS NOT NULL) AND is_org_member(org_id)))) IS DISTINCT FROM ((((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s project_type_templates.org admins manage templates USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s project_type_templates.org admins manage templates USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."project_type_templates" WHERE ((((org_id IS NULL) OR is_org_member(org_id)))) IS DISTINCT FROM ((((org_id IS NULL) OR COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s project_type_templates.system templates readable USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s project_type_templates.system templates readable USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."prolabore_manual_entries" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s prolabore_manual_entries.prolabore_manual_entries_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s prolabore_manual_entries.prolabore_manual_entries_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."prolabore_manual_entries" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s prolabore_manual_entries.prolabore_manual_entries_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s prolabore_manual_entries.prolabore_manual_entries_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."prolabore_payroll_items" WHERE (((EXISTS ( SELECT 1
   FROM prolabore_payrolls p
  WHERE ((p.id = prolabore_payroll_items.payroll_id) AND is_org_member(p.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM prolabore_payrolls p
  WHERE ((p.id = prolabore_payroll_items.payroll_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s prolabore_payroll_items.prolabore_items_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s prolabore_payroll_items.prolabore_items_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."prolabore_payroll_items" WHERE (((EXISTS ( SELECT 1
   FROM prolabore_payrolls p
  WHERE ((p.id = prolabore_payroll_items.payroll_id) AND is_org_member(p.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM prolabore_payrolls p
  WHERE ((p.id = prolabore_payroll_items.payroll_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s prolabore_payroll_items.prolabore_items_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s prolabore_payroll_items.prolabore_items_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."prolabore_payrolls" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s prolabore_payrolls.prolabore_payrolls_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s prolabore_payrolls.prolabore_payrolls_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."prolabore_payrolls" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s prolabore_payrolls.prolabore_payrolls_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s prolabore_payrolls.prolabore_payrolls_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."property_expense_allocations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s property_expense_allocations.org_access_prop_expense_alloc USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s property_expense_allocations.org_access_prop_expense_alloc USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."property_expense_allocations" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s property_expense_allocations.org_access_prop_expense_alloc CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s property_expense_allocations.org_access_prop_expense_alloc CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."purchase_request_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s purchase_request_items.purchase_request_items_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s purchase_request_items.purchase_request_items_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."purchase_request_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s purchase_request_items.purchase_request_items_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s purchase_request_items.purchase_request_items_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."purchase_requests" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s purchase_requests.purchase_requests_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s purchase_requests.purchase_requests_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."purchase_requests" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s purchase_requests.purchase_requests_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s purchase_requests.purchase_requests_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."qr_codes_obra" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s qr_codes_obra.qr_codes_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s qr_codes_obra.qr_codes_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."quotation_number_history" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s quotation_number_history.quotation_number_history_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s quotation_number_history.quotation_number_history_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_price_table_items" WHERE (((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND is_org_member(t.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_price_table_items.rental_price_table_items_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_price_table_items.rental_price_table_items_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_price_table_items" WHERE (((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND is_org_member(t.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_price_table_items.rental_price_table_items_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_price_table_items.rental_price_table_items_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_price_table_items" WHERE (((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND is_org_member(t.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_price_table_items.rental_price_table_items_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_price_table_items.rental_price_table_items_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_price_table_items" WHERE (((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND is_org_member(t.organization_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_price_table_items.rental_price_table_items_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_price_table_items.rental_price_table_items_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_price_tables" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_price_tables.rental_price_tables_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_price_tables.rental_price_tables_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_price_tables" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_price_tables.rental_price_tables_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_price_tables.rental_price_tables_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_price_tables" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_price_tables.rental_price_tables_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_price_tables.rental_price_tables_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_price_tables" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_price_tables.rental_price_tables_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_price_tables.rental_price_tables_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_pricing_rules" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_pricing_rules.rental_pricing_rules_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_pricing_rules.rental_pricing_rules_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_pricing_rules" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_pricing_rules.rental_pricing_rules_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_pricing_rules.rental_pricing_rules_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_pricing_rules" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_pricing_rules.rental_pricing_rules_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_pricing_rules.rental_pricing_rules_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_pricing_rules" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_pricing_rules.rental_pricing_rules_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_pricing_rules.rental_pricing_rules_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rental_pricing_rules" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rental_pricing_rules.rental_pricing_rules_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rental_pricing_rules.rental_pricing_rules_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_roles" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_roles.Admins can manage all resource roles USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_roles.Admins can manage all resource roles USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_roles" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_roles.Admins can manage all resource roles CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_roles.Admins can manage all resource roles CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_roles" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_roles.Admins can view all resource roles USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_roles.Admins can view all resource roles USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_teams" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_teams.Admins can manage all resource teams USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_teams.Admins can manage all resource teams USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_teams" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_teams.Admins can manage all resource teams CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_teams.Admins can manage all resource teams CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_teams" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_teams.Admins can view all resource teams USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_teams.Admins can view all resource teams USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_workers" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_workers.Admins can manage all resource workers USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_workers.Admins can manage all resource workers USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_workers" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_workers.Admins can manage all resource workers CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_workers.Admins can manage all resource workers CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."resource_workers" WHERE (((is_org_member(organization_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s resource_workers.Admins can view all resource workers USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s resource_workers.Admins can view all resource workers USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."risk_assessments" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s risk_assessments.risk_assessments_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s risk_assessments.risk_assessments_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."rubric_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s rubric_org_shares.ros_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s rubric_org_shares.ros_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."schedule_constraints" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s schedule_constraints.org members manage schedule_constraints USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s schedule_constraints.org members manage schedule_constraints USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."schedule_constraints" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s schedule_constraints.org members manage schedule_constraints CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s schedule_constraints.org members manage schedule_constraints CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."service_clients" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s service_clients.service_clients_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s service_clients.service_clients_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."service_clients" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s service_clients.service_clients_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s service_clients.service_clients_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."service_clients" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s service_clients.service_clients_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s service_clients.service_clients_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."service_clients" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s service_clients.service_clients_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s service_clients.service_clients_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_budget_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_budget_items.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_budget_items.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_budget_items" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_budget_items.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_budget_items.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_budgets" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_budgets.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_budgets.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_budgets" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_budgets.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_budgets.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_contracts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_contracts.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_contracts.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_contracts" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_contracts.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_contracts.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_opportunities" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_opportunities.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_opportunities.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_opportunities" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_opportunities.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_opportunities.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_opportunity_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_opportunity_events.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_opportunity_events.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_opportunity_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_opportunity_events.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_opportunity_events.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_pipeline_stages" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_pipeline_stages.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_pipeline_stages.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_pipeline_stages" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_pipeline_stages.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_pipeline_stages.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_proposal_number_history" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_proposal_number_history.services_proposal_number_history_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_proposal_number_history.services_proposal_number_history_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_proposals" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_proposals.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_proposals.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_proposals" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_proposals.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_proposals.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_visit_photos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_visit_photos.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_visit_photos.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_visit_photos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_visit_photos.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_visit_photos.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_visits" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_visits.org_members_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_visits.org_members_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."services_visits" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s services_visits.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s services_visits.org_members_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sindico_financeiro_eventos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sindico_financeiro_eventos.sindico_financeiro_eventos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sindico_financeiro_eventos.sindico_financeiro_eventos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."site_diary" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s site_diary.site_diary_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s site_diary.site_diary_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sst_checklists_obra" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sst_checklists_obra.sst_checklists_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sst_checklists_obra.sst_checklists_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sst_regulatory_docs" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sst_regulatory_docs.sst_reg_docs_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sst_regulatory_docs.sst_reg_docs_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sst_regulatory_docs" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sst_regulatory_docs.sst_reg_docs_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sst_regulatory_docs.sst_reg_docs_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sst_regulatory_docs" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sst_regulatory_docs.sst_reg_docs_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sst_regulatory_docs.sst_reg_docs_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."sst_regulatory_docs" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s sst_regulatory_docs.sst_reg_docs_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s sst_regulatory_docs.sst_reg_docs_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_assemblies" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_assemblies.assemblies_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_assemblies.assemblies_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_assemblies" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_assemblies.assemblies_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_assemblies.assemblies_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_elements" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_elements.elements_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_elements.elements_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_elements" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_elements.elements_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_elements.elements_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_rebars" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_rebars.rebars_all USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_rebars.rebars_all USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_rebars" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_rebars.rebars_all CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_rebars.rebars_all CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_steel_catalog" WHERE ((((org_id IS NOT NULL) AND is_org_member(org_id)))) IS DISTINCT FROM ((((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_steel_catalog.steel_catalog_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_steel_catalog.steel_catalog_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_steel_catalog" WHERE ((((org_id IS NOT NULL) AND is_org_member(org_id)))) IS DISTINCT FROM ((((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_steel_catalog.steel_catalog_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_steel_catalog.steel_catalog_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_steel_catalog" WHERE ((((org_id IS NULL) OR is_org_member(org_id)))) IS DISTINCT FROM ((((org_id IS NULL) OR COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_steel_catalog.steel_catalog_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_steel_catalog.steel_catalog_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_steel_catalog" WHERE ((((org_id IS NOT NULL) AND is_org_member(org_id)))) IS DISTINCT FROM ((((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_steel_catalog.steel_catalog_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_steel_catalog.steel_catalog_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."structural_steel_catalog" WHERE ((((org_id IS NOT NULL) AND is_org_member(org_id)))) IS DISTINCT FROM ((((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s structural_steel_catalog.steel_catalog_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s structural_steel_catalog.steel_catalog_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_categories" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_categories.supplier_categories_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_categories.supplier_categories_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_categories" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_categories.supplier_categories_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_categories.supplier_categories_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_categories" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_categories.supplier_categories_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_categories.supplier_categories_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tax_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tax_settings.tax_settings_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tax_settings.tax_settings_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tax_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tax_settings.tax_settings_write USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tax_settings.tax_settings_write USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tax_settings" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tax_settings.tax_settings_write CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tax_settings.tax_settings_write CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."team_members" WHERE (((EXISTS ( SELECT 1
   FROM labor_teams t
  WHERE ((t.id = team_members.team_id) AND is_org_member(t.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM labor_teams t
  WHERE ((t.id = team_members.team_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s team_members.team_members_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s team_members.team_members_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."time_bank" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s time_bank.time_bank_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s time_bank.time_bank_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."time_bank_entries" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s time_bank_entries.time_bank_entries_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s time_bank_entries.time_bank_entries_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."training_courses" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s training_courses.training_courses_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s training_courses.training_courses_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tts_fiscal_movements" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tts_fiscal_movements.tts_fiscal_movements_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tts_fiscal_movements.tts_fiscal_movements_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tts_fiscal_movements" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tts_fiscal_movements.tts_fiscal_movements_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tts_fiscal_movements.tts_fiscal_movements_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tts_regime_settings" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tts_regime_settings.tts_regime_settings_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tts_regime_settings.tts_regime_settings_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."tts_regime_settings" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s tts_regime_settings.tts_regime_settings_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s tts_regime_settings.tts_regime_settings_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."vacation_balance" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s vacation_balance.vacation_balance_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s vacation_balance.vacation_balance_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."vacation_balance" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s vacation_balance.vacation_balance_org_access CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s vacation_balance.vacation_balance_org_access CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."vr_ajustes" WHERE (((EXISTS ( SELECT 1
   FROM vr_calculos c
  WHERE ((c.id = vr_ajustes.calculo_id) AND is_org_member(c.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM vr_calculos c
  WHERE ((c.id = vr_ajustes.calculo_id) AND COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s vr_ajustes.vr_ajustes_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s vr_ajustes.vr_ajustes_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."vr_feriados" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s vr_feriados.vr_feriados_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s vr_feriados.vr_feriados_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."vr_regras" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s vr_regras.vr_regras_org_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s vr_regras.vr_regras_org_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."weekly_commitments" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s weekly_commitments.org members manage weekly_commitments USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s weekly_commitments.org members manage weekly_commitments USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."weekly_commitments" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s weekly_commitments.org members manage weekly_commitments CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s weekly_commitments.org members manage weekly_commitments CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."whatsapp_config" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s whatsapp_config.wpp_config_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s whatsapp_config.wpp_config_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."whatsapp_queue" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s whatsapp_queue.wpp_queue_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s whatsapp_queue.wpp_queue_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."work_logs" WHERE (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_logs.work_order_id) AND is_org_member(wo.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_logs.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s work_logs.work_logs_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s work_logs.work_logs_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."work_order_status_log" WHERE (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_status_log.work_order_id) AND is_org_member(wo.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_status_log.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s work_order_status_log.wo_status_log_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s work_order_status_log.wo_status_log_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."work_order_validations" WHERE (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_validations.work_order_id) AND is_org_member(wo.org_id)))))) IS DISTINCT FROM (((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_validations.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s work_order_validations.wo_validations_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s work_order_validations.wo_validations_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."work_orders" WHERE ((is_org_member(org_id))) IS DISTINCT FROM ((COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s work_orders.work_orders_access USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s work_orders.work_orders_access USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
  END LOOP;
  RAISE EXCEPTION 'RESULTADOS: lote 2: % comparações (expressão × usuário), % linhas com resultado diferente%', testes, total,
    CASE WHEN detalhes = '' THEN '' ELSE E'
' || left(detalhes, 3000) END;
END
$c$;
