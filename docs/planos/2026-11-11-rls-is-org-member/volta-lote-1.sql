-- VOLTA do lote 1: devolve as expressões com is_org_member (retrato de 11/11/2026).
SET lock_timeout = '2s';

ALTER POLICY "boletos_audit_insert" ON "public"."boletos_auditoria"
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "boletos_audit_select" ON "public"."boletos_auditoria"
  USING (is_org_member(organization_id));

ALTER POLICY "notifications_rw" ON "public"."notifications"
  USING (((lower(recipient_email) = lower((auth.jwt() ->> 'email'::text))) OR ((organization_id IS NOT NULL) AND is_org_member(organization_id))))
  WITH CHECK (((organization_id IS NULL) OR is_org_member(organization_id)));

ALTER POLICY "reconciliation_memory_org" ON "public"."reconciliation_classification_memory"
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "boletos_delete" ON "public"."boletos"
  USING (is_org_member(organization_id));

ALTER POLICY "boletos_insert" ON "public"."boletos"
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "boletos_select" ON "public"."boletos"
  USING (is_org_member(organization_id));

ALTER POLICY "boletos_update" ON "public"."boletos"
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "blueprint_objects_org_insert" ON "public"."blueprint_objects"
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "blueprint_objects_org_read" ON "public"."blueprint_objects"
  USING (is_org_member(organization_id));

ALTER POLICY "sos_manage" ON "public"."supplier_org_shares"
  USING ((is_org_member(target_org_id) OR is_superadmin()))
  WITH CHECK ((is_org_member(target_org_id) OR is_superadmin()));

ALTER POLICY "sos_select" ON "public"."supplier_org_shares"
  USING ((is_org_member(target_org_id) OR is_superadmin()));

ALTER POLICY "blueprint_audit_org_insert" ON "public"."blueprint_audit_events"
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "blueprint_audit_org_read" ON "public"."blueprint_audit_events"
  USING (is_org_member(organization_id));

ALTER POLICY "org_access_contract_precedent_conditions" ON "public"."contract_precedent_conditions"
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "invoices_org_delete" ON "public"."invoices"
  USING (is_org_member(organization_id));

ALTER POLICY "invoices_org_insert" ON "public"."invoices"
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "invoices_org_select" ON "public"."invoices"
  USING (is_org_member(organization_id));

ALTER POLICY "invoices_org_update" ON "public"."invoices"
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "Users can manage suppliers of their organization" ON "public"."suppliers"
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

ALTER POLICY "suppliers_select" ON "public"."suppliers"
  USING ((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = suppliers.id) AND is_org_member(sh.target_org_id))))));
