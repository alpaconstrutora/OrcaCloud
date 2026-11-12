-- SÓ LEITURA: EXPLAIN de cada expressão nova (823). Confere sintaxe e tipos.
DO $v$
DECLARE erros text := ''; n int := 0;
BEGIN
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."boletos_auditoria" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$boletos_auditoria.boletos_audit_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."boletos_auditoria" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$boletos_auditoria.boletos_audit_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."notifications" WHERE ((lower(recipient_email) = lower((auth.jwt() ->> 'email'::text))) OR ((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$notifications.notifications_rw$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."notifications" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$notifications.notifications_rw$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_classification_memory" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_classification_memory.reconciliation_memory_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_classification_memory" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_classification_memory.reconciliation_memory_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.bank_statements_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.bank_statements_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.bank_statements_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.bim_file_obj_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.bim_file_obj_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.bim_file_obj_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.bim_file_obj_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.bim_file_obj_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.blueprint_underlay_obj_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.blueprint_underlay_obj_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.blueprint_underlay_obj_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.blueprint_underlay_obj_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.blueprint_underlay_obj_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.condominio_docs_storage_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.condominio_docs_storage_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.condominio_docs_storage_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.condominio_docs_storage_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.condominio_docs_storage_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.diario_midia_storage_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.diario_midia_storage_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.diario_midia_storage_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.diario_midia_storage_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.diario_midia_storage_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.financeiro_anexos_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.financeiro_anexos_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.financeiro_anexos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.financeiro_anexos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.financeiro_anexos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)
    ELSE false
END)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.financial_receipts_storage_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)
    ELSE false
END)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.financial_receipts_storage_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.services_visits_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.services_visits_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.services_visits_org_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "storage"."objects" WHERE ((bucket_id = 'opura-docs'::text) AND ((storage.foldername(name))[1] = 'partner-uploads'::text) AND (((storage.foldername(name))[2] IN ( SELECT (partner_users.partner_workspace_id)::text AS partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))) OR ((storage.foldername(name))[2] IN ( SELECT (pw.id)::text AS id
   FROM partner_workspaces pw
  WHERE COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$objects.storage_docs_select_partner_uploads$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."boletos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$boletos.boletos_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."boletos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$boletos.boletos_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."boletos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$boletos.boletos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."boletos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$boletos.boletos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."boletos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$boletos.boletos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_objects" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_objects.blueprint_objects_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_objects" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_objects.blueprint_objects_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_org_shares.sos_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_org_shares.sos_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_org_shares.sos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_audit_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_audit_events.blueprint_audit_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_audit_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_audit_events.blueprint_audit_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_precedent_conditions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_precedent_conditions.org_access_contract_precedent_conditions$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_precedent_conditions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_precedent_conditions.org_access_contract_precedent_conditions$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."invoices" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$invoices.invoices_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."invoices" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$invoices.invoices_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."invoices" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$invoices.invoices_org_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."invoices" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$invoices.invoices_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."invoices" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$invoices.invoices_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."suppliers" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$suppliers.Users can manage suppliers of their organization$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."suppliers" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$suppliers.Users can manage suppliers of their organization$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."suppliers" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = suppliers.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$suppliers.suppliers_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_suggestions" WHERE (EXISTS ( SELECT 1
   FROM bank_transactions bt
  WHERE ((bt.id = reconciliation_suggestions.bank_transaction_id) AND COALESCE((bt.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_suggestions.Manage reconciliation_suggestions as member$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_matches" WHERE (EXISTS ( SELECT 1
   FROM bank_transactions bt
  WHERE ((bt.id = reconciliation_matches.bank_transaction_id) AND COALESCE((bt.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_matches.Manage reconciliation_matches as member$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_branches" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_branches.blueprint_branches_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_branches" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_branches.blueprint_branches_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_studies" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_studies.blueprint_studies_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_studies" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_studies.blueprint_studies_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_properties" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_properties.Enable access to organization members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_properties" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_properties.Enable access to organization members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."email_capture_messages" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$email_capture_messages.email_capture_messages_ler$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_runs" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_runs.reconciliation_runs_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_runs" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_runs.reconciliation_runs_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_audit_log" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_audit_log.Create audit logs as member$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_audit_log" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_audit_log.View audit logs as member$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."client_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$client_org_shares.cos_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."client_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$client_org_shares.cos_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."client_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$client_org_shares.cos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_rateio_itens" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_rateio_itens.condominio_rateio_itens_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_rateio_itens" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_rateio_itens.condominio_rateio_itens_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tasks" WHERE ((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tasks.tasks_select_assignee$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tasks" WHERE ((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tasks.tasks_update_assignee$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tasks" WHERE ((assignee_employee_id IS NOT NULL) AND is_employee_do_usuario(assignee_employee_id) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tasks.tasks_update_assignee$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_climatizacao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_climatizacao.blueprint_study_climatizacao_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_climatizacao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_climatizacao.blueprint_study_climatizacao_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contracts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contracts.Users can manage contract of their organization$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contracts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contracts.Users can view contract of their organization$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_payments_auditoria" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_payments_auditoria.spa_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payroll_events" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payroll_events.payroll_events_v2_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payroll_events" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payroll_events.payroll_events_v2_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."unit_occupancies" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$unit_occupancies.unit_occupancies_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."unit_occupancies" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$unit_occupancies.unit_occupancies_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."unit_occupancies" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$unit_occupancies.unit_occupancies_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."unit_occupancies" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$unit_occupancies.unit_occupancies_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."unit_occupancies" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$unit_occupancies.unit_occupancies_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_profiles" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_profiles.broker_profiles_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_profiles" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_profiles.broker_profiles_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_profiles" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((auth.jwt() ->> 'email'::text) = email) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_profiles.broker_profiles_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."projects" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((organization_id IS NULL) AND COALESCE((((settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$projects.projects_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."projects" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR ((organization_id IS NULL) AND COALESCE((((settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$projects.projects_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."bank_statement_imports" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$bank_statement_imports.bank_statement_imports_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."bank_statement_imports" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$bank_statement_imports.bank_statement_imports_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."organization_members" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$organization_members.Members can view coworkers$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."preferencias" WHERE (((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$preferencias.preferencias_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."preferencias" WHERE (((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$preferencias.preferencias_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."preferencias" WHERE (((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$preferencias.preferencias_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."preferencias" WHERE (((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$preferencias.preferencias_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."preferencias" WHERE (((escopo = 'USUARIO'::text) AND (user_id = auth.uid())) OR ((escopo = 'ORGANIZACAO'::text) AND is_org_manager(organization_id)) OR ((escopo = 'ESTUDO'::text) AND (EXISTS ( SELECT 1
   FROM blueprint_studies s
  WHERE ((s.id = preferencias.study_id) AND COALESCE((s.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$preferencias.preferencias_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_numbering_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_numbering_settings.document_numbering_settings_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_numbering_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_numbering_settings.document_numbering_settings_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_numbering_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_numbering_settings.document_numbering_settings_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_numbering_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_numbering_settings.document_numbering_settings_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_numbering_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_numbering_settings.document_numbering_settings_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payroll_runs" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payroll_runs.payroll_runs_v2_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_casa" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_casa.blueprint_study_casa_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_casa" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_casa.blueprint_study_casa_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."task_statuses" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$task_statuses.task_statuses_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."task_statuses" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$task_statuses.task_statuses_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."task_statuses" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$task_statuses.task_statuses_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."task_statuses" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$task_statuses.task_statuses_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."clients" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$clients.Members can manage clients$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."clients" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$clients.Members can manage clients$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."clients" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM client_org_shares sh
  WHERE ((sh.client_id = clients.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$clients.clients_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employees" WHERE (COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_employee_shared_with_user(id))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employees.employees_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."email_capture_buscas" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$email_capture_buscas.email_capture_buscas_ler$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."purchase_order_number_history" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$purchase_order_number_history.purchase_order_number_history_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_payments" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_payments.supplier_payments_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_automatic_rubrics" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_automatic_rubrics.employee_automatic_rubrics_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_automatic_rubrics" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_automatic_rubrics.employee_automatic_rubrics_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."vr_calculos" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$vr_calculos.vr_calculos_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_element_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_element_types.blueprint_element_type_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_element_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_element_types.blueprint_element_type_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_element_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_element_types.blueprint_element_type_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_element_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_element_types.blueprint_element_type_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_element_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_element_types.blueprint_element_type_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_produto" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_produto.blueprint_study_produto_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_produto" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_produto.blueprint_study_produto_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."client_portal_tokens" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$client_portal_tokens.client_portal_tokens_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_hidro" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_hidro.blueprint_study_hidro_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_hidro" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_hidro.blueprint_study_hidro_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_urban_context" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_urban_context.blueprint_study_urban_context_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_urban_context" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_urban_context.blueprint_study_urban_context_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_tokens" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_tokens.broker_tokens_auth_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_tokens" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_tokens.broker_tokens_auth_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."financial_receipts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$financial_receipts.financial_receipts_select_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."product_brands" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$product_brands.product_brands_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."product_brands" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$product_brands.product_brands_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshots" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshots.blueprint_snapshots_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshots" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshots.blueprint_snapshots_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_topografia" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_topografia.blueprint_study_topografia_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_topografia" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_topografia.blueprint_study_topografia_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."building_systems" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$building_systems.building_systems_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."building_systems" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$building_systems.building_systems_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."building_systems" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$building_systems.building_systems_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."building_systems" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$building_systems.building_systems_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."building_systems" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$building_systems.building_systems_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."investor_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$investor_org_shares.ios_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_org_shares" WHERE COALESCE((( SELECT employees.org_id
   FROM employees
  WHERE (employees.id = employee_org_shares.employee_id))) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_org_shares.employee_shares_insert_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_org_shares" WHERE (COALESCE((( SELECT employees.org_id
   FROM employees
  WHERE (employees.id = employee_org_shares.employee_id))) IN (SELECT public.minhas_orgs_membro()), false) OR COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_org_shares.employee_shares_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_templates.document_templates_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_templates.document_templates_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_templates.document_templates_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."document_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$document_templates.document_templates_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."email_capture_senders" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$email_capture_senders.email_capture_senders_alterar$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."email_capture_senders" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((importacao = 'revisao'::text) OR is_org_manager(organization_id)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$email_capture_senders.email_capture_senders_alterar$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."email_capture_senders" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((importacao = 'revisao'::text) OR is_org_manager(organization_id)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$email_capture_senders.email_capture_senders_criar$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."email_capture_senders" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$email_capture_senders.email_capture_senders_excluir$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."email_capture_senders" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$email_capture_senders.email_capture_senders_ler$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."organizations" WHERE COALESCE((id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$organizations.Users can view their own organization$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."reconciliation_rules" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$reconciliation_rules.Manage reconciliation_rules as member$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_bank_accounts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_bank_accounts.sba_authenticated_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_bank_accounts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_bank_accounts.sba_authenticated_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_bank_accounts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_bank_accounts.sba_authenticated_view$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_access_logs" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_access_logs.academy_access_logs_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_access_logs" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_access_logs.academy_access_logs_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assignments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assignments.academy_assignments_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assignments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assignments.academy_assignments_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assignments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assignments.academy_assignments_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assignments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assignments.academy_assignments_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assignments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assignments.academy_assignments_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_enrollments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_enrollments.academy_enrollments_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_enrollments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_enrollments.academy_enrollments_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_enrollments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_enrollments.academy_enrollments_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_enrollments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_enrollments.academy_enrollments_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_enrollments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_enrollments.academy_enrollments_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_price_table_items" WHERE (EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_price_table_items.commercial_price_table_items_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_price_table_items" WHERE (EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_price_table_items.commercial_price_table_items_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_price_table_items" WHERE (EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_price_table_items.commercial_price_table_items_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_price_table_items" WHERE (EXISTS ( SELECT 1
   FROM commercial_price_tables t
  WHERE ((t.id = commercial_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_price_table_items.commercial_price_table_items_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_price_tables" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_price_tables.commercial_price_tables_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_price_tables" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_price_tables.commercial_price_tables_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_price_tables" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_price_tables.commercial_price_tables_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_price_tables" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_price_tables.commercial_price_tables_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payment_account_gateway" WHERE (EXISTS ( SELECT 1
   FROM payment_accounts pa
  WHERE ((pa.id = payment_account_gateway.payment_account_id) AND COALESCE((pa.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payment_account_gateway.pag_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payment_accounts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payment_accounts.Users can view payment accounts$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_course_versions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_course_versions.academy_course_versions_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_course_versions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_course_versions.academy_course_versions_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_course_versions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_course_versions.academy_course_versions_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_course_versions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_course_versions.academy_course_versions_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_course_versions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_course_versions.academy_course_versions_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lessons" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lessons.academy_lessons_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lessons" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lessons.academy_lessons_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lessons" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lessons.academy_lessons_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lessons" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lessons.academy_lessons_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lessons" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lessons.academy_lessons_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_modules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_modules.academy_modules_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_modules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_modules.academy_modules_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_modules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_modules.academy_modules_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_modules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_modules.academy_modules_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_modules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_modules.academy_modules_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_portal_users" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_portal_users.academy_portal_users_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_portal_users" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_portal_users.academy_portal_users_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_portal_users" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_portal_users.academy_portal_users_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_portal_users" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_portal_users.academy_portal_users_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_portal_users" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_portal_users.academy_portal_users_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_measurements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_measurements.blueprint_medicao_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_measurements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_measurements.blueprint_medicao_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_measurements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_measurements.blueprint_medicao_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_measurements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_measurements.blueprint_medicao_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_measurements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_measurements.blueprint_medicao_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshot_topografia" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshot_topografia.blueprint_snapshot_topografia_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshot_topografia" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshot_topografia.blueprint_snapshot_topografia_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_levantamento" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_levantamento.blueprint_study_levantamento_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_levantamento" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_levantamento.blueprint_study_levantamento_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_deal_buyers" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_deals d
  WHERE ((d.id = commercial_deal_buyers.deal_id) AND COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_deal_buyers.Enable access to organization members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_deal_buyers" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_deals d
  WHERE ((d.id = commercial_deal_buyers.deal_id) AND COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_deal_buyers.Enable access to organization members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_deal_units" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_deal_units.Enable access to organization members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_deal_units" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_deal_units.Enable access to organization members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_deals" WHERE (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deals.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_deals.Enable access to organization members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_deals" WHERE (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deals.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_deals.Enable access to organization members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_aviso_leituras" WHERE (EXISTS ( SELECT 1
   FROM condominio_avisos a
  WHERE ((a.id = condominio_aviso_leituras.aviso_id) AND COALESCE((a.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_aviso_leituras.condominio_aviso_leituras_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_aviso_leituras" WHERE (EXISTS ( SELECT 1
   FROM condominio_avisos a
  WHERE ((a.id = condominio_aviso_leituras.aviso_id) AND COALESCE((a.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_aviso_leituras.condominio_aviso_leituras_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_number_history" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_number_history.contract_number_history_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."darfs" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$darfs.darfs_membro_da_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."darfs" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$darfs.darfs_membro_da_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."email_capture_accounts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$email_capture_accounts.email_capture_accounts_ler$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_types" WHERE ((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid())))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_types.empreendimento_types_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_types" WHERE ((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid())))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_types.empreendimento_types_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_types" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_types.empreendimento_types_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_types" WHERE ((is_system = false) AND (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid())))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_types.empreendimento_types_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."financial_categories" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$financial_categories.financial_categories_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."financial_categories" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$financial_categories.financial_categories_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."hr_targets" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$hr_targets.hr_targets_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plan_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plan_items.maintenance_plan_items_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plan_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plan_items.maintenance_plan_items_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plan_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plan_items.maintenance_plan_items_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plan_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plan_items.maintenance_plan_items_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plan_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plan_items.maintenance_plan_items_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_users" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_users.partner_users_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_users" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (email = (auth.jwt() ->> 'email'::text)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_users.partner_users_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_workspaces" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_workspaces.workspaces_manage_internal$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_workspaces" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_workspaces.workspaces_manage_internal$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_workspaces" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = partner_workspaces.supplier_id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_workspaces.workspaces_select_internal$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."portal_tokens" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$portal_tokens.portal_tokens_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rubrics" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rubrics.rubrics_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rubrics" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rubrics.rubrics_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rubrics" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rubrics.rubrics_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rubrics" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM rubric_org_shares sh
  WHERE ((sh.rubric_code = rubrics.code) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rubrics.rubrics_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sales_plans" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'draft'::text))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sales_plans.sales_plans_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sales_plans" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sales_plans.sales_plans_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sales_plans" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sales_plans.sales_plans_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sales_plans" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sales_plans.sales_plans_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."termination_records" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$termination_records.termination_records_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."absences" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$absences.absences_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."absences" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$absences.absences_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessment_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessment_questions.academy_assessment_questions_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessment_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessment_questions.academy_assessment_questions_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessment_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessment_questions.academy_assessment_questions_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessment_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessment_questions.academy_assessment_questions_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessment_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessment_questions.academy_assessment_questions_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessments.academy_assessments_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessments.academy_assessments_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessments.academy_assessments_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessments.academy_assessments_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_assessments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_assessments.academy_assessments_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempt_answers" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempt_answers.academy_attempt_answers_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempt_answers" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempt_answers.academy_attempt_answers_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempt_answers" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempt_answers.academy_attempt_answers_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempt_answers" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempt_answers.academy_attempt_answers_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempt_answers" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempt_answers.academy_attempt_answers_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempts" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempts.academy_attempts_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempts" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempts.academy_attempts_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempts" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempts.academy_attempts_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempts" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempts.academy_attempts_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_attempts" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_attempts.academy_attempts_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_certificates" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_certificates.academy_certificates_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_certificates" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_certificates.academy_certificates_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_certificates" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_certificates.academy_certificates_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_certificates" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_certificates.academy_certificates_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lesson_progress" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lesson_progress.academy_lesson_progress_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lesson_progress" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lesson_progress.academy_lesson_progress_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lesson_progress" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lesson_progress.academy_lesson_progress_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lesson_progress" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lesson_progress.academy_lesson_progress_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_lesson_progress" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_lesson_progress.academy_lesson_progress_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_materials" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_materials.academy_materials_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_materials" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_materials.academy_materials_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_materials" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_materials.academy_materials_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_materials" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_materials.academy_materials_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_materials" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_materials.academy_materials_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_question_options" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_question_options.academy_question_options_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_question_options" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_question_options.academy_question_options_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_question_options" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_question_options.academy_question_options_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_question_options" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_question_options.academy_question_options_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_question_options" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_question_options.academy_question_options_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_questions.academy_questions_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_questions.academy_questions_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_questions.academy_questions_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_questions.academy_questions_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."academy_questions" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$academy_questions.academy_questions_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."accidents" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$accidents.accidents_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."approval_approvers" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$approval_approvers.aa_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."bi_report_schedules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$bi_report_schedules.bi_report_schedules_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."bi_report_schedules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$bi_report_schedules.bi_report_schedules_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_api_tokens" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_api_tokens.blueprint_api_tokens_org_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_budget_mappings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_budget_mappings.blueprint_map_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_budget_mappings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_budget_mappings.blueprint_map_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_budget_mappings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_budget_mappings.blueprint_map_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_budget_mappings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_budget_mappings.blueprint_map_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_budget_mappings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_budget_mappings.blueprint_map_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_composicoes_de_peca" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_composicoes_de_peca.blueprint_composicao_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_composicoes_de_peca" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_composicoes_de_peca.blueprint_composicao_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_composicoes_de_peca" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_composicoes_de_peca.blueprint_composicao_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_composicoes_de_peca" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_composicoes_de_peca.blueprint_composicao_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_composicoes_de_peca" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_composicoes_de_peca.blueprint_composicao_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_conflict_acceptances" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_conflict_acceptances.blueprint_conflict_acceptances_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_conflict_acceptances" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_conflict_acceptances.blueprint_conflict_acceptances_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_element_locks" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_element_locks.blueprint_element_locks_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_element_locks" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (holder_user_id = auth.uid()))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_element_locks.blueprint_element_locks_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_element_locks" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_element_locks.blueprint_element_locks_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_kits_de_insercao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_kits_de_insercao.blueprint_kit_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_kits_de_insercao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_kits_de_insercao.blueprint_kit_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_kits_de_insercao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_kits_de_insercao.blueprint_kit_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_kits_de_insercao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_kits_de_insercao.blueprint_kit_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_kits_de_insercao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_kits_de_insercao.blueprint_kit_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_levels" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_levels.blueprint_levels_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_levels" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_levels.blueprint_levels_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_materials" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_materials.blueprint_materials_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_materials" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_materials.blueprint_materials_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_opening_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_opening_types.blueprint_opening_type_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_opening_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_opening_types.blueprint_opening_type_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_opening_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_opening_types.blueprint_opening_type_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_opening_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_opening_types.blueprint_opening_type_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_opening_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_opening_types.blueprint_opening_type_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_parameter_definitions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_parameter_definitions.blueprint_parameter_definition_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_parameter_definitions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_parameter_definitions.blueprint_parameter_definition_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_parameter_definitions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_parameter_definitions.blueprint_parameter_definition_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_parameter_definitions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_parameter_definitions.blueprint_parameter_definition_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_parameter_definitions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_parameter_definitions.blueprint_parameter_definition_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_plugins" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_plugins.blueprint_plugins_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_plugins" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_plugins.blueprint_plugins_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_programs" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_programs.blueprint_programs_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_programs" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_programs.blueprint_programs_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_quantity_snapshots" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_quantity_snapshots.blueprint_qty_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_quantity_snapshots" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_quantity_snapshots.blueprint_qty_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_rule_sets" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_rule_sets.blueprint_rule_set_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_rule_sets" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_rule_sets.blueprint_rule_set_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_rule_sets" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_rule_sets.blueprint_rule_set_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_rule_sets" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_rule_sets.blueprint_rule_set_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_rule_sets" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_rule_sets.blueprint_rule_set_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_sheet_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_sheet_templates.blueprint_sheet_templates_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_sheet_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_sheet_templates.blueprint_sheet_templates_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshot_nbr12721" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshot_nbr12721.blueprint_snapshot_nbr12721_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshot_nbr12721" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshot_nbr12721.blueprint_snapshot_nbr12721_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshot_nbr12721_aprovacoes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshot_nbr12721_aprovacoes.blueprint_snapshot_nbr12721_aprovacoes_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshot_produto" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshot_produto.blueprint_snapshot_produto_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_snapshot_produto" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_snapshot_produto.blueprint_snapshot_produto_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_armadura" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_armadura.blueprint_study_armadura_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_armadura" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_armadura.blueprint_study_armadura_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_eletrica" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_eletrica.blueprint_study_eletrica_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_eletrica" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_eletrica.blueprint_study_eletrica_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_entorno" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_entorno.blueprint_study_entorno_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_entorno" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_entorno.blueprint_study_entorno_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_incendio" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_incendio.blueprint_study_incendio_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_incendio" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_incendio.blueprint_study_incendio_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_nbr12721" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_nbr12721.blueprint_study_nbr12721_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_nbr12721" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_nbr12721.blueprint_study_nbr12721_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_permissions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_permissions.blueprint_study_permissions_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_permissions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_permissions.blueprint_study_permissions_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_projeto_executivo" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_projeto_executivo.blueprint_projeto_executivo_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_projeto_executivo" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_projeto_executivo.blueprint_projeto_executivo_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_projeto_executivo" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_projeto_executivo.blueprint_projeto_executivo_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_projeto_executivo" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_projeto_executivo.blueprint_projeto_executivo_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_projeto_executivo" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_projeto_executivo.blueprint_projeto_executivo_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_referencias" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_referencias.blueprint_study_referencias_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_referencias" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_referencias.blueprint_study_referencias_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_regularizacao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_regularizacao.blueprint_study_regularizacao_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_regularizacao" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_regularizacao.blueprint_study_regularizacao_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_sigef" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_sigef.blueprint_study_sigef_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_sigef" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_sigef.blueprint_study_sigef_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_terraplenagem" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_terraplenagem.blueprint_study_terraplenagem_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_terraplenagem" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_terraplenagem.blueprint_study_terraplenagem_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_vias" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_vias.blueprint_study_vias_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_study_vias" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_study_vias.blueprint_study_vias_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_table_definitions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_table_definitions.blueprint_table_definitions_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_table_definitions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_table_definitions.blueprint_table_definitions_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_underlays" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_underlays.blueprint_underlay_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_underlays" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_underlays.blueprint_underlay_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_underlays" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_underlays.blueprint_underlay_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_underlays" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_underlays.blueprint_underlay_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_underlays" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_underlays.blueprint_underlay_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_view_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_view_templates.blueprint_view_templates_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_view_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_view_templates.blueprint_view_templates_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_wall_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_wall_types.blueprint_wall_type_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_wall_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_wall_types.blueprint_wall_type_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_wall_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_wall_types.blueprint_wall_type_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_wall_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_wall_types.blueprint_wall_type_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_wall_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_wall_types.blueprint_wall_type_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_webhook_entregas" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_webhook_entregas.blueprint_webhook_entregas_org_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_webhooks" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_webhooks.blueprint_webhooks_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."blueprint_webhooks" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$blueprint_webhooks.blueprint_webhooks_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_chat_channels" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_chat_channels.broker_channels_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_chat_channels" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_chat_channels.broker_channels_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_chat_channels" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_chat_channels.broker_channels_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_chat_messages" WHERE ((EXISTS ( SELECT 1
   FROM broker_portal_chat_channels ch
  WHERE ((ch.id = broker_portal_chat_messages.channel_id) AND (COALESCE((ch.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))) AND ((sender_email = (auth.jwt() ->> 'email'::text)) OR is_superadmin()))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_chat_messages.broker_messages_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_chat_messages" WHERE (EXISTS ( SELECT 1
   FROM broker_portal_chat_channels ch
  WHERE ((ch.id = broker_portal_chat_messages.channel_id) AND (COALESCE((ch.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_chat_messages.broker_messages_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_commissions" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_commissions.broker_commissions_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_commissions" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_commissions.broker_commissions_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_commissions" WHERE ((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_commissions.broker_commissions_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_event_registrations" WHERE (EXISTS ( SELECT 1
   FROM broker_portal_events e
  WHERE ((e.id = broker_portal_event_registrations.event_id) AND (COALESCE((e.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_event_registrations.broker_event_registrations_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_events" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_events.broker_events_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_events" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_events.broker_events_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_events" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_events.broker_events_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_integrations" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_integrations.broker_integrations_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_integrations" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_integrations.broker_integrations_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_integrations" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_integrations.broker_integrations_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_lead_interactions" WHERE (EXISTS ( SELECT 1
   FROM broker_portal_leads l
  WHERE ((l.id = broker_portal_lead_interactions.lead_id) AND (COALESCE((l.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_lead_interactions.broker_lead_interactions_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_leads" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_leads.broker_leads_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_leads" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_leads.broker_leads_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_leads" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_leads.broker_leads_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_leads" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_leads.broker_leads_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_materials" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_materials.broker_materials_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_materials" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_materials.broker_materials_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_materials" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_materials.broker_materials_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_price_columns" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_price_columns.broker_portal_price_columns_member$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_price_columns" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_price_columns.broker_portal_price_columns_member$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_proposal_units" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text)))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_proposal_units.broker_proposal_units_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_proposal_units" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
           FROM organization_members om
          WHERE ((om.organization_id = pr.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text)))))))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_proposal_units.broker_proposal_units_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_proposal_units" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR COALESCE((pr.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_proposal_units.broker_proposal_units_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_proposal_units" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text)))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_proposal_units.broker_proposal_units_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_proposals" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND ((lower(broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = broker_portal_proposals.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text))))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_proposals.broker_proposals_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_proposals" WHERE ((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_proposals.broker_proposals_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_proposals" WHERE ((broker_email = (auth.jwt() ->> 'email'::text)) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_proposals.broker_proposals_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_rankings" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_rankings.broker_rankings_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_rankings" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_rankings.broker_rankings_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_rankings" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_rankings.broker_rankings_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_trainings" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_trainings.broker_trainings_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_trainings" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_trainings.broker_trainings_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_portal_trainings" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_portal_trainings.broker_trainings_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_property_access" WHERE (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_property_access.broker_property_access_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_property_access" WHERE (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_property_access.broker_property_access_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_property_access" WHERE (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_property_access.broker_property_access_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_webhook_configs" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_webhook_configs.broker_webhooks_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."broker_webhook_configs" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$broker_webhook_configs.broker_webhooks_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."candidates" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$candidates.candidates_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."chart_of_accounts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$chart_of_accounts.Users can view chart of accounts$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."client_request_eventos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$client_request_eventos.client_request_eventos_membro_grava$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."client_request_eventos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$client_request_eventos.client_request_eventos_membro_le$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_deal_code_history" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_deal_code_history.commercial_deal_code_history_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_property_status_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_property_status_events.org_access_prop_status_events$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."commercial_property_status_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$commercial_property_status_events.org_access_prop_status_events$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."communication_receipts" WHERE (EXISTS ( SELECT 1
   FROM communications c
  WHERE ((c.id = communication_receipts.communication_id) AND COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$communication_receipts.receipt_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."communications" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$communications.comm_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condo_rateio_number_history" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condo_rateio_number_history.condo_rateio_number_history_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_avisos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_avisos.condominio_avisos_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_avisos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_avisos.condominio_avisos_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_documentos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_documentos.condominio_documentos_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_documentos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_documentos.condominio_documentos_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_rateio_decisoes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_rateio_decisoes.condominio_rateio_decisoes_membro_le$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_rateio_despesas" WHERE (EXISTS ( SELECT 1
   FROM condominio_rateios r
  WHERE ((r.id = condominio_rateio_despesas.rateio_id) AND COALESCE((r.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_rateio_despesas.condominio_rateio_despesas_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_rateio_despesas" WHERE (EXISTS ( SELECT 1
   FROM condominio_rateios r
  WHERE ((r.id = condominio_rateio_despesas.rateio_id) AND COALESCE((r.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_rateio_despesas.condominio_rateio_despesas_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_rateios" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_rateios.condominio_rateios_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condominio_rateios" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condominio_rateios.condominio_rateios_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condomino_portal_access" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condomino_portal_access.condomino_portal_access_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."condomino_portal_access" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$condomino_portal_access.condomino_portal_access_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_acceptances" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_acceptances.org_access_contract_acceptances$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_acceptances" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_acceptances.org_access_contract_acceptances$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_document_requirements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_document_requirements.org_access_contract_document_requirements$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_document_requirements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_document_requirements.org_access_contract_document_requirements$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_evaluations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_evaluations.org_access_contract_evaluations$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_evaluations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_evaluations.org_access_contract_evaluations$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_guarantees" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_guarantees.org_access_contract_guarantees$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_guarantees" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_guarantees.org_access_contract_guarantees$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_guarantors" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_guarantors.org_access_contract_guarantors$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_guarantors" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_guarantors.org_access_contract_guarantors$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_index_values" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_index_values.contract_index_values_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_index_values" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_index_values.contract_index_values_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_index_values" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_index_values.contract_index_values_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_interfaces" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_interfaces.org_access_contract_interfaces$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_interfaces" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_interfaces.org_access_contract_interfaces$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_labor_questionnaires" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_labor_questionnaires.org_access_contract_labor_questionnaires$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_labor_questionnaires" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_labor_questionnaires.org_access_contract_labor_questionnaires$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_organization_moves" WHERE (COALESCE((from_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR COALESCE((to_org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_organization_moves.contract_organization_moves_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_penalties" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_penalties.org_access_contract_penalties$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_penalties" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_penalties.org_access_contract_penalties$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_retention_releases" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_retention_releases.org_access_contract_retention_releases$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_retention_releases" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_retention_releases.org_access_contract_retention_releases$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_risk_assessments" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_risk_assessments.org_access_contract_risk_assessments$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_risk_assessments" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_risk_assessments.org_access_contract_risk_assessments$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_scope_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_scope_templates.scope_tpl_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_scope_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_scope_templates.scope_tpl_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_scope_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_scope_templates.scope_tpl_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_scope_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_scope_templates.scope_tpl_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_supply_matrix" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_supply_matrix.org_access_contract_supply_matrix$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_supply_matrix" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_supply_matrix.org_access_contract_supply_matrix$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_technical_responsibilities" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_technical_responsibilities.org_access_contract_technical_responsibilities$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_technical_responsibilities" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_technical_responsibilities.org_access_contract_technical_responsibilities$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_template_clauses" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_template_clauses.contract_template_clauses_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_template_clauses" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_template_clauses.contract_template_clauses_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_templates.contract_templates_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_templates" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_templates.contract_templates_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_types" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_types.contract_types_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contract_types" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contract_types.contract_types_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contractor_documents" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contractor_documents.contractor_documents_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contractor_measurements" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contractor_measurements.contractor_measurements_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."contractors" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$contractors.contractors_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."cost_center_closing_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$cost_center_closing_items.cost_center_closing_items_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."cost_center_closing_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$cost_center_closing_items.cost_center_closing_items_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."cost_center_closings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$cost_center_closings.cost_center_closings_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."cost_center_closings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$cost_center_closings.cost_center_closings_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."credit_room_members" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$credit_room_members.credit_room_members_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."credit_room_members" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$credit_room_members.credit_room_members_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."credit_room_versions" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND fn_credit_room_is_internal(credit_room_id))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$credit_room_versions.credit_room_versions_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."credit_rooms" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$credit_rooms.credit_rooms_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."credit_rooms" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$credit_rooms.credit_rooms_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."credit_rooms" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_credit_room_member(id))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$credit_rooms.credit_rooms_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."credit_rooms" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$credit_rooms.credit_rooms_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."credit_rooms" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$credit_rooms.credit_rooms_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_contacts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_contacts.crm_contacts_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_contacts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_contacts.crm_contacts_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_opportunities" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_opportunities.crm_opportunities_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_opportunities" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_opportunities.crm_opportunities_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_proposals" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_proposals.crm_proposals_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_proposals" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_proposals.crm_proposals_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_tasks" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_tasks.crm_tasks_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_tasks" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_tasks.crm_tasks_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_timeline_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_timeline_events.crm_timeline_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."crm_timeline_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$crm_timeline_events.crm_timeline_org_members$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_database_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_database_org_shares.cdos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_databases" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_databases.custom_databases_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_databases" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_databases.custom_databases_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_databases" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_databases.custom_databases_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_databases" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_database_org_shares sh
  WHERE ((sh.database_id = custom_databases.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_databases.custom_databases_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_items" WHERE ((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_items.custom_items_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_items" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_items.custom_items_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_items" WHERE ((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_items.custom_items_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."custom_items" WHERE ((EXISTS ( SELECT 1
   FROM custom_databases d
  WHERE ((d.id = custom_items.database_id) AND (COALESCE((d.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
           FROM custom_database_org_shares sh
          WHERE ((sh.database_id = d.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$custom_items.custom_items_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."deal_credit_analysis" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$deal_credit_analysis.deal_credit_analysis_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."deal_credit_analysis" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$deal_credit_analysis.deal_credit_analysis_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_allocations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_allocations.debt_allocations_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_allocations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_allocations.debt_allocations_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_component_accounts" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_component_accounts.debt_component_accounts_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_component_accounts" WHERE ((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_component_accounts.debt_component_accounts_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_component_accounts" WHERE ((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_component_accounts.debt_component_accounts_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_contracts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_contracts.debt_contracts_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_contracts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_contracts.debt_contracts_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_covenant_measurements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_covenant_measurements.debt_covenant_measurements_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_covenant_measurements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_covenant_measurements.debt_covenant_measurements_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_covenants" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_covenants.debt_covenants_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_covenants" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_covenants.debt_covenants_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_disbursements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_disbursements.debt_disbursements_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_disbursements" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_disbursements.debt_disbursements_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_events.debt_events_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_events.debt_events_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_installments" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_installments.debt_installments_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_installments" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_installments.debt_installments_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_schedules" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_schedules.debt_schedules_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."debt_schedules" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$debt_schedules.debt_schedules_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."digital_files" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$digital_files.digital_file_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."digital_files" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$digital_files.digital_file_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."digital_files" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$digital_files.digital_file_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."digital_files" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$digital_files.digital_file_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."digital_files" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$digital_files.digital_file_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_assinaturas" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_assinaturas.doc_gen_assinaturas_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_blocos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_blocos.doc_gen_blocos_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_blocos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_blocos.doc_gen_blocos_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_blocos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_blocos.doc_gen_blocos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_blocos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_blocos.doc_gen_blocos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_blocos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_blocos.doc_gen_blocos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_documento_versoes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_documento_versoes.doc_gen_documento_versoes_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_documento_versoes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_documento_versoes.doc_gen_documento_versoes_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_documentos" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (status = 'RASCUNHO'::text))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_documentos.doc_gen_documentos_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_documentos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_documentos.doc_gen_documentos_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_documentos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_documentos.doc_gen_documentos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_documentos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_documentos.doc_gen_documentos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_documentos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_documentos.doc_gen_documentos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_eventos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_eventos.doc_gen_eventos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_fontes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_fontes.doc_gen_fontes_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_fontes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_fontes.doc_gen_fontes_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_fontes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_fontes.doc_gen_fontes_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_fontes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_fontes.doc_gen_fontes_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_fontes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_fontes.doc_gen_fontes_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_modelo_versoes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_modelo_versoes.doc_gen_modelo_versoes_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_modelo_versoes" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_modelo_versoes.doc_gen_modelo_versoes_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_modelos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_modelos.doc_gen_modelos_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_modelos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_modelos.doc_gen_modelos_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_modelos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_modelos.doc_gen_modelos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_modelos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_modelos.doc_gen_modelos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_modelos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_modelos.doc_gen_modelos_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_vinculos" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) AND (NOT ((tipo = 'RESPONDE'::text) AND (de_documento_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM doc_gen_documentos d
  WHERE ((d.id = doc_gen_vinculos.de_documento_id) AND (d.status <> 'RASCUNHO'::text)))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_vinculos.doc_gen_vinculos_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_vinculos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_vinculos.doc_gen_vinculos_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."doc_gen_vinculos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$doc_gen_vinculos.doc_gen_vinculos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_cost_splits" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_cost_splits.employee_cost_splits_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_cost_splits" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_cost_splits.employee_cost_splits_org_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_documents" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_documents.employee_docs_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_salary_history" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_salary_history.emp_salary_hist_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_salary_history" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_salary_history.emp_salary_hist_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."employee_trainings" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$employee_trainings.employee_trainings_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristic_values" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristic_values.empr_unit_char_values_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristic_values" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristic_values.empr_unit_char_values_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristic_values" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristic_values.empr_unit_char_values_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristic_values" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristic_values.empr_unit_char_values_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristic_values" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristic_values.empr_unit_char_values_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristics" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristics.empr_unit_characteristics_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristics" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristics.empr_unit_characteristics_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristics" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristics.empr_unit_characteristics_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristics" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristics.empr_unit_characteristics_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."empreendimento_unit_characteristics" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$empreendimento_unit_characteristics.empr_unit_characteristics_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."epi_catalog" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$epi_catalog.epi_catalog_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."epi_deliveries" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$epi_deliveries.epi_deliveries_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."esocial_batch_events" WHERE (EXISTS ( SELECT 1
   FROM esocial_batches b
  WHERE ((b.id = esocial_batch_events.batch_id) AND COALESCE((b.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$esocial_batch_events.esocial_batch_ev_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."esocial_batches" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$esocial_batches.esocial_batches_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."esocial_config" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$esocial_config.esocial_config_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."esocial_events" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$esocial_events.esocial_events_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."esocial_pending_alerts" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$esocial_pending_alerts.esocial_alerts_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."evaluation_cycles" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$evaluation_cycles.eval_cycles_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."evaluation_responses" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$evaluation_responses.eval_responses_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."evaluation_results" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$evaluation_results.eval_results_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."evidence_files" WHERE (EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = evidence_files.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$evidence_files.evidence_files_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."guarantee_deposit_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$guarantee_deposit_events.org_access_guarantee_deposit_events$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."guarantee_deposit_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$guarantee_deposit_events.org_access_guarantee_deposit_events$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."guarantee_documents" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$guarantee_documents.org_access_guarantee_documents$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."guarantee_documents" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$guarantee_documents.org_access_guarantee_documents$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."hr_monthly_snapshots" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$hr_monthly_snapshots.hr_snap_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."hr_productivity_metrics" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$hr_productivity_metrics.hr_prod_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."hr_turnover_events" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$hr_turnover_events.hr_turn_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."incentive_rules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$incentive_rules.incentive_rules_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."incentive_rules" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$incentive_rules.incentive_rules_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."interview_records" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$interview_records.interview_records_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."investor_opportunity_competitors" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$investor_opportunity_competitors.competitors_org_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."job_openings" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$job_openings.job_openings_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."labor_diary_entries" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$labor_diary_entries.labor_diary_entries_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."labor_diary_workers" WHERE (EXISTS ( SELECT 1
   FROM labor_diary_entries d
  WHERE ((d.id = labor_diary_workers.diary_entry_id) AND COALESCE((d.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$labor_diary_workers.labor_diary_workers_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."labor_teams" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$labor_teams.labor_teams_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_orders" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_orders.maintenance_orders_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_orders" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_orders.maintenance_orders_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_orders" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_orders.maintenance_orders_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_orders" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_orders.maintenance_orders_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_orders" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_orders.maintenance_orders_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plans" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plans.maintenance_plans_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plans" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plans.maintenance_plans_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plans" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plans.maintenance_plans_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plans" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plans.maintenance_plans_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."maintenance_plans" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$maintenance_plans.maintenance_plans_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."non_conformances" WHERE (EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = non_conformances.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$non_conformances.non_conformances_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."oe_checklist_items" WHERE (EXISTS ( SELECT 1
   FROM oe_checklist_templates t
  WHERE ((t.id = oe_checklist_items.template_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$oe_checklist_items.oe_checklist_items_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."oe_checklist_responses" WHERE (EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = oe_checklist_responses.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$oe_checklist_responses.checklist_responses_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."oe_checklist_templates" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$oe_checklist_templates.oe_checklist_templates_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_areas" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_areas.cno_areas_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_areas" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_areas.cno_areas_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_compliance_score" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_compliance_score.cno_compliance_score_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_compliance_score" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_compliance_score.cno_compliance_score_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_dctfweb" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_dctfweb.cno_dctfweb_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_dctfweb" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_dctfweb.cno_dctfweb_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_deductions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_deductions.cno_deductions_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_deductions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_deductions.cno_deductions_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_documents" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_documents.cno_documents_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_documents" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_documents.cno_documents_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_reductions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_reductions.cno_reductions_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_reductions" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_reductions.cno_reductions_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_registrations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_registrations.cno_registrations_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_registrations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_registrations.cno_registrations_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_simulations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_simulations.cno_simulations_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."opura_cno_simulations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$opura_cno_simulations.cno_simulations_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."org_funcoes" WHERE (company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$org_funcoes.org_funcoes_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."org_funcoes" WHERE (company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$org_funcoes.org_funcoes_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."org_funcoes" WHERE (company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$org_funcoes.org_funcoes_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."org_funcoes" WHERE (company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$org_funcoes.org_funcoes_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."org_funcoes" WHERE (company_id IN ( SELECT c.id
   FROM companies c
  WHERE COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$org_funcoes.org_funcoes_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_compensation_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_compensation_settings.partner_comp_settings_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_compensation_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_compensation_settings.partner_comp_settings_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_conversations" WHERE ((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_conversations.partner_conversations_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_conversations" WHERE ((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_conversations.partner_conversations_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_messages" WHERE (conversation_id IN ( SELECT c.id
   FROM (partner_conversations c
     JOIN partner_workspaces pw ON ((pw.id = c.partner_workspace_id)))
  WHERE (COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (pw.id IN ( SELECT partner_users.partner_workspace_id
           FROM partner_users
          WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_messages.partner_messages_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_messages" WHERE (conversation_id IN ( SELECT c.id
   FROM (partner_conversations c
     JOIN partner_workspaces pw ON ((pw.id = c.partner_workspace_id)))
  WHERE (COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (pw.id IN ( SELECT partner_users.partner_workspace_id
           FROM partner_users
          WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_messages.partner_messages_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_requests" WHERE ((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_requests.partner_requests_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_requests" WHERE ((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_requests.partner_requests_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_shared_documents" WHERE (partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_shared_documents.shared_docs_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_shared_documents" WHERE ((partner_workspace_id IN ( SELECT partner_workspaces.id
   FROM partner_workspaces
  WHERE ((partner_workspaces.organization_id IS NULL) OR COALESCE((partner_workspaces.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT partner_users.partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_shared_documents.shared_docs_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_shared_folders" WHERE (partner_workspace_id IN ( SELECT pw.id
   FROM partner_workspaces pw
  WHERE ((pw.organization_id IS NULL) OR COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_shared_folders.shared_folders_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."partner_shared_folders" WHERE ((partner_workspace_id IN ( SELECT pw.id
   FROM partner_workspaces pw
  WHERE ((pw.organization_id IS NULL) OR COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))) OR (partner_workspace_id IN ( SELECT pu.partner_workspace_id
   FROM partner_users pu
  WHERE ((pu.email = (auth.jwt() ->> 'email'::text)) AND (pu.is_active = true)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$partner_shared_folders.shared_folders_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payment_account_organizations" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM payment_accounts pa
  WHERE ((pa.id = payment_account_organizations.payment_account_id) AND COALESCE((pa.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payment_account_organizations.pao_select_member$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payment_account_saldo_informado" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payment_account_saldo_informado.saldo_informado_membro$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payment_account_saldo_informado" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payment_account_saldo_informado.saldo_informado_membro$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payment_types" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payment_types.payment_types_org_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payment_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payment_types.payment_types_org_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payment_types" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payment_types.payment_types_org_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payroll_encargos_config" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payroll_encargos_config.payroll_encargos_config_membro$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."payroll_encargos_config" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$payroll_encargos_config.payroll_encargos_config_membro$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."pdi_items" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$pdi_items.pdi_items_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."plano_de_contas" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$plano_de_contas.Users can view cost centers$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."pricing_rule_applications" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$pricing_rule_applications.pricing_rule_applications_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."pricing_rule_applications" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$pricing_rule_applications.pricing_rule_applications_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."pricing_rule_applications" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$pricing_rule_applications.pricing_rule_applications_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."pricing_rule_applications" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$pricing_rule_applications.pricing_rule_applications_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."pricing_rule_applications" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$pricing_rule_applications.pricing_rule_applications_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."product_models" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$product_models.product_models_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."product_models" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$product_models.product_models_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."productivity_logs" WHERE (((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM labor_teams t
  WHERE ((t.id = productivity_logs.team_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false))))) OR ((employee_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = productivity_logs.employee_id) AND COALESCE((e.org_id) IN (SELECT public.minhas_orgs_membro()), false))))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$productivity_logs.productivity_logs_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."profit_distribution_batches" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$profit_distribution_batches.profit_batches_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."profit_distribution_batches" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$profit_distribution_batches.profit_batches_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."profit_distribution_items" WHERE (EXISTS ( SELECT 1
   FROM profit_distribution_batches b
  WHERE ((b.id = profit_distribution_items.batch_id) AND COALESCE((b.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$profit_distribution_items.profit_items_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."profit_distribution_items" WHERE (EXISTS ( SELECT 1
   FROM profit_distribution_batches b
  WHERE ((b.id = profit_distribution_items.batch_id) AND COALESCE((b.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$profit_distribution_items.profit_items_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."project_ops_config" WHERE (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_ops_config.project_id) AND COALESCE((((p.settings ->> 'organizationId'::text))::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$project_ops_config.project_ops_config_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."project_type_templates" WHERE ((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$project_type_templates.org admins manage templates$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."project_type_templates" WHERE ((org_id IS NULL) OR COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$project_type_templates.system templates readable$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."prolabore_manual_entries" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$prolabore_manual_entries.prolabore_manual_entries_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."prolabore_manual_entries" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$prolabore_manual_entries.prolabore_manual_entries_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."prolabore_payroll_items" WHERE (EXISTS ( SELECT 1
   FROM prolabore_payrolls p
  WHERE ((p.id = prolabore_payroll_items.payroll_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$prolabore_payroll_items.prolabore_items_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."prolabore_payroll_items" WHERE (EXISTS ( SELECT 1
   FROM prolabore_payrolls p
  WHERE ((p.id = prolabore_payroll_items.payroll_id) AND COALESCE((p.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$prolabore_payroll_items.prolabore_items_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."prolabore_payrolls" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$prolabore_payrolls.prolabore_payrolls_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."prolabore_payrolls" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$prolabore_payrolls.prolabore_payrolls_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."property_expense_allocations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$property_expense_allocations.org_access_prop_expense_alloc$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."property_expense_allocations" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$property_expense_allocations.org_access_prop_expense_alloc$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."purchase_request_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$purchase_request_items.purchase_request_items_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."purchase_request_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$purchase_request_items.purchase_request_items_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."purchase_requests" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$purchase_requests.purchase_requests_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."purchase_requests" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$purchase_requests.purchase_requests_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."qr_codes_obra" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$qr_codes_obra.qr_codes_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."quotation_number_history" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$quotation_number_history.quotation_number_history_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_price_table_items" WHERE (EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_price_table_items.rental_price_table_items_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_price_table_items" WHERE (EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_price_table_items.rental_price_table_items_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_price_table_items" WHERE (EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_price_table_items.rental_price_table_items_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_price_table_items" WHERE (EXISTS ( SELECT 1
   FROM rental_price_tables t
  WHERE ((t.id = rental_price_table_items.price_table_id) AND COALESCE((t.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_price_table_items.rental_price_table_items_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_price_tables" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_price_tables.rental_price_tables_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_price_tables" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_price_tables.rental_price_tables_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_price_tables" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_price_tables.rental_price_tables_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_price_tables" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_price_tables.rental_price_tables_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_pricing_rules" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_pricing_rules.rental_pricing_rules_org_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_pricing_rules" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_pricing_rules.rental_pricing_rules_org_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_pricing_rules" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_pricing_rules.rental_pricing_rules_org_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_pricing_rules" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_pricing_rules.rental_pricing_rules_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rental_pricing_rules" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rental_pricing_rules.rental_pricing_rules_org_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_roles" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_roles.Admins can manage all resource roles$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_roles" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_roles.Admins can manage all resource roles$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_roles" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_roles.Admins can view all resource roles$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_teams" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_teams.Admins can manage all resource teams$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_teams" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_teams.Admins can manage all resource teams$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_teams" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_teams.Admins can view all resource teams$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_workers" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_workers.Admins can manage all resource workers$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_workers" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_workers.Admins can manage all resource workers$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."resource_workers" WHERE (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$resource_workers.Admins can view all resource workers$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."risk_assessments" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$risk_assessments.risk_assessments_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."rubric_org_shares" WHERE (COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$rubric_org_shares.ros_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."schedule_constraints" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$schedule_constraints.org members manage schedule_constraints$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."schedule_constraints" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$schedule_constraints.org members manage schedule_constraints$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."service_clients" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$service_clients.service_clients_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."service_clients" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$service_clients.service_clients_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."service_clients" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$service_clients.service_clients_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."service_clients" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$service_clients.service_clients_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_budget_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_budget_items.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_budget_items" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_budget_items.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_budgets" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_budgets.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_budgets" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_budgets.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_contracts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_contracts.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_contracts" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_contracts.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_opportunities" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_opportunities.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_opportunities" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_opportunities.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_opportunity_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_opportunity_events.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_opportunity_events" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_opportunity_events.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_pipeline_stages" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_pipeline_stages.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_pipeline_stages" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_pipeline_stages.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_proposal_number_history" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_proposal_number_history.services_proposal_number_history_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_proposals" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_proposals.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_proposals" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_proposals.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_visit_photos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_visit_photos.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_visit_photos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_visit_photos.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_visits" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_visits.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."services_visits" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$services_visits.org_members_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sindico_financeiro_eventos" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sindico_financeiro_eventos.sindico_financeiro_eventos_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."site_diary" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$site_diary.site_diary_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sst_checklists_obra" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sst_checklists_obra.sst_checklists_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sst_regulatory_docs" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sst_regulatory_docs.sst_reg_docs_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sst_regulatory_docs" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sst_regulatory_docs.sst_reg_docs_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sst_regulatory_docs" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sst_regulatory_docs.sst_reg_docs_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."sst_regulatory_docs" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$sst_regulatory_docs.sst_reg_docs_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_assemblies" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_assemblies.assemblies_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_assemblies" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_assemblies.assemblies_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_elements" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_elements.elements_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_elements" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_elements.elements_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_rebars" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_rebars.rebars_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_rebars" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_rebars.rebars_all$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_steel_catalog" WHERE ((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_steel_catalog.steel_catalog_delete$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_steel_catalog" WHERE ((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_steel_catalog.steel_catalog_insert$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_steel_catalog" WHERE ((org_id IS NULL) OR COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_steel_catalog.steel_catalog_select$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_steel_catalog" WHERE ((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_steel_catalog.steel_catalog_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."structural_steel_catalog" WHERE ((org_id IS NOT NULL) AND COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$structural_steel_catalog.steel_catalog_update$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_categories" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_categories.supplier_categories_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_categories" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_categories.supplier_categories_manage$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."supplier_categories" WHERE ((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$supplier_categories.supplier_categories_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tax_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tax_settings.tax_settings_read$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tax_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tax_settings.tax_settings_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tax_settings" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tax_settings.tax_settings_write$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."team_members" WHERE (EXISTS ( SELECT 1
   FROM labor_teams t
  WHERE ((t.id = team_members.team_id) AND COALESCE((t.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$team_members.team_members_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."time_bank" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$time_bank.time_bank_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."time_bank_entries" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$time_bank_entries.time_bank_entries_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."training_courses" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$training_courses.training_courses_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tts_fiscal_movements" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tts_fiscal_movements.tts_fiscal_movements_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tts_fiscal_movements" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tts_fiscal_movements.tts_fiscal_movements_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tts_regime_settings" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tts_regime_settings.tts_regime_settings_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."tts_regime_settings" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$tts_regime_settings.tts_regime_settings_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."vacation_balance" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$vacation_balance.vacation_balance_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."vacation_balance" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$vacation_balance.vacation_balance_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."vr_ajustes" WHERE (EXISTS ( SELECT 1
   FROM vr_calculos c
  WHERE ((c.id = vr_ajustes.calculo_id) AND COALESCE((c.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$vr_ajustes.vr_ajustes_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."vr_feriados" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$vr_feriados.vr_feriados_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."vr_regras" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$vr_regras.vr_regras_org_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."weekly_commitments" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$weekly_commitments.org members manage weekly_commitments$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."weekly_commitments" WHERE COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$weekly_commitments.org members manage weekly_commitments$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."whatsapp_config" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$whatsapp_config.wpp_config_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."whatsapp_queue" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$whatsapp_queue.wpp_queue_org$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."work_logs" WHERE (EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_logs.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$work_logs.work_logs_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."work_order_status_log" WHERE (EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_status_log.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$work_order_status_log.wo_status_log_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."work_order_validations" WHERE (EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_validations.work_order_id) AND COALESCE((wo.org_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$work_order_validations.wo_validations_access$q$ || ': ' || SQLERRM; END;
  BEGIN EXECUTE $q$EXPLAIN SELECT 1 FROM "public"."work_orders" WHERE COALESCE((org_id) IN (SELECT public.minhas_orgs_membro()), false)$q$; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\n' || $q$work_orders.work_orders_access$q$ || ': ' || SQLERRM; END;
  RAISE EXCEPTION 'RESULTADOS: % expressões válidas de 823%', n, CASE WHEN erros = '' THEN '' ELSE E'\nERROS:' || erros END;
END
$v$;
