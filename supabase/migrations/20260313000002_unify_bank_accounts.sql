-- Migration: Unify Bank Accounts into payment_accounts (UTF-8 FIX)
-- Date: 2026-03-13

DO $$ 
BEGIN
    -- 1. Garantir que a tabela bank_transactions existe (caso tenha sido removida acidentalmente)
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bank_transactions') THEN
        CREATE TABLE bank_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            bank_account_id UUID NOT NULL, -- Será vinculado a payment_accounts
            external_id TEXT,
            transaction_date DATE NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
            description_raw TEXT NOT NULL,
            description_normalized TEXT,
            counterparty_name TEXT,
            transaction_type TEXT,
            fingerprint TEXT,
            status TEXT NOT NULL DEFAULT 'IMPORTED',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(bank_account_id, external_id)
        );
    END IF;

    -- 2. Atualizar a constraint para apontar para payment_accounts
    ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_bank_account_id_fkey;
    
    -- Verifica se a tabela payment_accounts existe antes de criar a FK
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_accounts') THEN
        ALTER TABLE bank_transactions 
        ADD CONSTRAINT bank_transactions_bank_account_id_fkey 
        FOREIGN KEY (bank_account_id) REFERENCES payment_accounts(id) ON DELETE CASCADE;
    END IF;

    -- 3. Remover a tabela antiga redundante
    DROP TABLE IF EXISTS bank_accounts CASCADE;

END $$;
