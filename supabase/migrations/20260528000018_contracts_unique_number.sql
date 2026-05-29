DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'contracts_org_number_unique'
    ) THEN
        ALTER TABLE contracts
        ADD CONSTRAINT contracts_org_number_unique UNIQUE (organization_id, number);
    END IF;
END $$;
