-- Fix Audit Log RLS Policy
-- Simplified to avoid syntax errors with ALTER POLICY

DROP POLICY IF EXISTS "Org Access reconciliation_audit_log" ON reconciliation_audit_log;

CREATE POLICY "Org Access reconciliation_audit_log" 
ON reconciliation_audit_log 
FOR ALL 
USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
