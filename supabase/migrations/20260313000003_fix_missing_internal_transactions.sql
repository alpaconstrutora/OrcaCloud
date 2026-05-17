-- Migration to fix missing internal_transactions table
-- Created on 2026-03-13 to ensure the table is present

-- 1. Internal Transaction Table
CREATE TABLE IF NOT EXISTS internal_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_system TEXT NOT NULL, -- 'COMMERCIAL', 'PROJECT', 'MANUAL'
    reference_id TEXT, -- ID of the original record (Deal, Order, etc.)
    transaction_date DATE NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
    description TEXT,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONCILIATED', 'CANCELLED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Ensure RLS is enabled
ALTER TABLE internal_transactions ENABLE ROW LEVEL SECURITY;

-- 3. Policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'internal_transactions' 
        AND policyname = 'Users can manage transactions from their organization'
    ) THEN
        CREATE POLICY "Users can manage transactions from their organization" 
        ON internal_transactions FOR ALL 
        USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
    END IF;
END $$;

-- 4. Audit Ledger (If missing)
CREATE TABLE IF NOT EXISTS reconciliation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    event_type TEXT NOT NULL, -- 'IMPORT', 'MATCH', 'REJECT', 'MANUAL_CREATE'
    target_id UUID,          -- ID of the related object
    payload JSONB,           -- Data captured at the time
    integrity_hash TEXT,     -- Security hash
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE reconciliation_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'reconciliation_audit_log' 
        AND policyname = 'Users can view audit logs from their organization'
    ) THEN
        CREATE POLICY "Users can view audit logs from their organization" 
        ON reconciliation_audit_log FOR SELECT 
        USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
    END IF;
END $$;
