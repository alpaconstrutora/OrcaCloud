ALTER TABLE contracts
ADD CONSTRAINT contracts_org_number_unique UNIQUE (organization_id, number);
