-- "Meus Clientes": coluna status (Ativo/Inativo), com switch na tabela.
-- Coluna simples com default seguro — clientes existentes ficam como 'Ativo'
-- (comportamento atual: continuam disponíveis em seletores de cliente).
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Ativo';

COMMENT ON COLUMN public.clients.status IS
    'Status do cadastro do cliente. Valores: Ativo | Inativo.';
