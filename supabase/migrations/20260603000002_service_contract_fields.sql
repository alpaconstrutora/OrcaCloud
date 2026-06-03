-- Campos específicos para contratos de serviço (OUTGOING)
ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS execution_address   TEXT,
    ADD COLUMN IF NOT EXISTS client_responsible  TEXT,
    ADD COLUMN IF NOT EXISTS internal_responsible TEXT,
    ADD COLUMN IF NOT EXISTS sla_days            INTEGER,
    ADD COLUMN IF NOT EXISTS warranty_months     INTEGER,
    ADD COLUMN IF NOT EXISTS labor_value         NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS materials_value     NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS services_included   TEXT,
    ADD COLUMN IF NOT EXISTS services_excluded   TEXT;
