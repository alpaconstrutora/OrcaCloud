-- Fix RLS Policies for internal_transactions and audit logs
-- Aligning with project standard: is_org_member(org_id)

-- 1. Remove old/conflicting policies
DROP POLICY IF EXISTS "Users can view transactions from their organization" ON internal_transactions;
DROP POLICY IF EXISTS "Users can manage transactions from their organization" ON internal_transactions;
DROP POLICY IF EXISTS "Org Access reconciliation_audit_log" ON reconciliation_audit_log;
DROP POLICY IF EXISTS "Users can view audit logs from their organization" ON reconciliation_audit_log;

-- 2. New unified policy for internal_transactions
-- This gives ALL permissions to any organization member
CREATE POLICY "Manage internal_transactions as member"
ON internal_transactions
FOR ALL
TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- 3. New unified policy for reconciliation_audit_log
CREATE POLICY "View audit logs as member"
ON reconciliation_audit_log
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

-- Allow inserting logs if member
CREATE POLICY "Create audit logs as member"
ON reconciliation_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_member(organization_id));

-- 4. Enable RLS (just in case)
ALTER TABLE internal_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_rules ENABLE ROW LEVEL SECURITY;

-- 5. Repeat pattern for other reconciliation tables
DROP POLICY IF EXISTS "Org Access bank_transactions" ON bank_transactions;
CREATE POLICY "Manage bank_transactions as member" ON bank_transactions FOR ALL TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org Access reconciliation_matches" ON reconciliation_matches;
CREATE POLICY "Manage reconciliation_matches as member" ON reconciliation_matches FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.id = bank_transaction_id AND public.is_org_member(bt.organization_id)));

DROP POLICY IF EXISTS "Org Access reconciliation_suggestions" ON reconciliation_suggestions;
CREATE POLICY "Manage reconciliation_suggestions as member" ON reconciliation_suggestions FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.id = bank_transaction_id AND public.is_org_member(bt.organization_id)));

DROP POLICY IF EXISTS "Org Access reconciliation_rules" ON reconciliation_rules;
CREATE POLICY "Manage reconciliation_rules as member" ON reconciliation_rules FOR ALL TO authenticated 
USING (public.is_org_member(organization_id));
