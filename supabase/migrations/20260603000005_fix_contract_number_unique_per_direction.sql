-- Substitui o unique constraint global (org + number) por dois índices parciais
-- separados por direction, permitindo sequências independentes entre módulos.

-- Remove constraint antigo
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_org_number_unique;

-- Unique para contratos OUTGOING (Serviços)
CREATE UNIQUE INDEX IF NOT EXISTS contracts_outgoing_num_unique
    ON public.contracts(organization_id, number)
    WHERE direction = 'OUTGOING';

-- Unique para contratos INCOMING ou sem direction (Suprimentos / legado)
CREATE UNIQUE INDEX IF NOT EXISTS contracts_incoming_num_unique
    ON public.contracts(organization_id, number)
    WHERE direction IS NULL OR direction = 'INCOMING';
