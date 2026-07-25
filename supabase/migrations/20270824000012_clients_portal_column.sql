-- "Meus Clientes": campo dropdown "Portais" por cliente.
-- Controla se o cliente aparece na tabela do Portal do Cliente (módulo de acesso
-- externo). 'Nenhum' = não exibir; 'Portal do Cliente' = exibir.
-- Coluna simples com default seguro — clientes existentes ficam como 'Nenhum'
-- (comportamento atual: não aparecem enquanto o admin não optar por incluí-los).
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS portal text NOT NULL DEFAULT 'Nenhum';

COMMENT ON COLUMN public.clients.portal IS
    'Portais em que o cliente é exposto. Valores: Nenhum | Portal do Cliente.';
