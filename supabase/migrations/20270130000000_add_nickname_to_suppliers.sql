-- Apelido curto do fornecedor, para exibição em tabelas onde a razão social não cabe.
-- Fallback sempre para `name` (razão social) quando vazio — ver getSupplierDisplayName.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS nickname text;
COMMENT ON COLUMN suppliers.nickname IS 'Apelido curto para exibição em tabelas estreitas; fallback = name (razão social)';
