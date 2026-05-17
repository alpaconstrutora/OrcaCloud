-- Migration for Bank Reconciliation Module
-- Professional Engineering Spec 2.0

-- 1. Internal Transaction Table (Structured Mirror)
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

-- 2. Bank Accounts (Extension)
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payment_account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL, -- Link to current account list
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    branch TEXT,
    currency TEXT DEFAULT 'BRL',
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, bank_name, account_number)
);

-- 3. Bank Transactions
CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    external_id TEXT, -- Original ID from OFX/API
    transaction_date DATE NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
    description_raw TEXT NOT NULL,
    description_normalized TEXT,
    counterparty_name TEXT,
    transaction_type TEXT, -- 'PIX', 'TED', 'BOLETO', etc.
    fingerprint TEXT, -- Hash for deduplication
    status TEXT NOT NULL DEFAULT 'IMPORTED', -- 'IMPORTED', 'NORMALIZED', 'MATCHED', 'CONFIRMED', 'LOCKED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(bank_account_id, external_id)
);

-- 4. Reconciliation Matches
CREATE TABLE IF NOT EXISTS reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    internal_transaction_id UUID NOT NULL REFERENCES internal_transactions(id) ON DELETE CASCADE,
    match_type TEXT NOT NULL CHECK (match_type IN ('RULE', 'HEURISTIC', 'AI', 'MANUAL')),
    confidence_score DECIMAL(5, 2), -- 0.00 to 100.00
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(bank_transaction_id, internal_transaction_id)
);

-- 5. Match Suggestions
CREATE TABLE IF NOT EXISTS reconciliation_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    candidate_internal_transaction_id UUID NOT NULL REFERENCES internal_transactions(id) ON DELETE CASCADE,
    confidence DECIMAL(5, 2),
    reason TEXT,
    model_version TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Rules Engine
CREATE TABLE IF NOT EXISTS reconciliation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    conditions JSONB NOT NULL, -- Rules logic
    actions JSONB NOT NULL,    -- Resulting labels/matching
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Audit Ledger (Immutable)
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

-- RLS Policies
ALTER TABLE internal_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_audit_log ENABLE ROW LEVEL SECURITY;

-- Simple Org-based policies (Standard for the system)
CREATE POLICY "Users can view transactions from their organization" 
ON internal_transactions FOR SELECT USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage bank accounts" 
ON bank_accounts FOR ALL USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- Apply same pattern to others
CREATE POLICY "Org Access bank_transactions" ON bank_transactions FOR ALL USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Org Access reconciliation_matches" ON reconciliation_matches FOR ALL USING (EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.id = bank_transaction_id AND bt.organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())));
CREATE POLICY "Org Access reconciliation_suggestions" ON reconciliation_suggestions FOR ALL USING (EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.id = bank_transaction_id AND bt.organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())));
CREATE POLICY "Org Access reconciliation_rules" ON reconciliation_rules FOR ALL USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Org Access reconciliation_audit_log" ON reconciliation_audit_log FOR SELECT USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
