-- VOLTA do lote 3: devolve as expressões com is_org_member (retrato de 11/11/2026).
SET lock_timeout = '2s';

ALTER POLICY "bank_statements_delete" ON "storage"."objects"
  USING (((bucket_id = 'bank-statements'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "bank_statements_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'bank-statements'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "bank_statements_read" ON "storage"."objects"
  USING (((bucket_id = 'bank-statements'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "bim_file_obj_delete" ON "storage"."objects"
  USING (((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "bim_file_obj_read" ON "storage"."objects"
  USING (((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "bim_file_obj_update" ON "storage"."objects"
  USING (((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))
  WITH CHECK (((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "bim_file_obj_write" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "blueprint_underlay_obj_delete" ON "storage"."objects"
  USING (((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "blueprint_underlay_obj_read" ON "storage"."objects"
  USING (((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "blueprint_underlay_obj_update" ON "storage"."objects"
  USING (((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))
  WITH CHECK (((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "blueprint_underlay_obj_write" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "condominio_docs_storage_delete" ON "storage"."objects"
  USING (((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "condominio_docs_storage_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "condominio_docs_storage_read" ON "storage"."objects"
  USING (((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "condominio_docs_storage_update" ON "storage"."objects"
  USING (((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))
  WITH CHECK (((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "diario_midia_storage_delete" ON "storage"."objects"
  USING (((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "diario_midia_storage_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "diario_midia_storage_read" ON "storage"."objects"
  USING (((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "diario_midia_storage_update" ON "storage"."objects"
  USING (((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))
  WITH CHECK (((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "financeiro_anexos_delete" ON "storage"."objects"
  USING (((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "financeiro_anexos_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "financeiro_anexos_select" ON "storage"."objects"
  USING (((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "financeiro_anexos_update" ON "storage"."objects"
  USING (((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))
  WITH CHECK (((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "financial_receipts_storage_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN is_org_member(((storage.foldername(name))[1])::uuid)
    ELSE false
END));

ALTER POLICY "financial_receipts_storage_select" ON "storage"."objects"
  USING (((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN is_org_member(((storage.foldername(name))[1])::uuid)
    ELSE false
END));

ALTER POLICY "services_visits_org_delete" ON "storage"."objects"
  USING (((bucket_id = 'services-visits'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "services_visits_org_read" ON "storage"."objects"
  USING (((bucket_id = 'services-visits'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "services_visits_org_write" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'services-visits'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));

ALTER POLICY "storage_docs_select_partner_uploads" ON "storage"."objects"
  USING (((bucket_id = 'opura-docs'::text) AND ((storage.foldername(name))[1] = 'partner-uploads'::text) AND (((storage.foldername(name))[2] IN ( SELECT (partner_users.partner_workspace_id)::text AS partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))) OR ((storage.foldername(name))[2] IN ( SELECT (pw.id)::text AS id
   FROM partner_workspaces pw
  WHERE is_org_member(pw.organization_id))))));
