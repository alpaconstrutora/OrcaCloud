-- Apelido do cliente (Minha Organização › Meus Clientes)
--
-- Pedido do usuário em 23/09/2026: no topo do Portal do Cliente, "Área do
-- Cliente" era redundante com o badge "PORTAL DO CLIENTE" ao lado; deve virar
-- "Olá, <apelido do cliente>". O cadastro de clientes não tinha onde guardar
-- esse apelido — `suppliers` tem `nickname` (Nome fantasia) desde sempre,
-- `clients` não tinha o equivalente.
--
-- Mesmo nome de coluna do fornecedor (`nickname`), de propósito: as duas
-- entidades passam a responder à mesma pergunta com o mesmo vocabulário.
-- Opcional; vazio significa "use o primeiro nome", decidido na aplicação.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS nickname text;

COMMENT ON COLUMN public.clients.nickname IS
    'Apelido / nome fantasia do cliente. Usado como saudação no Portal do Cliente; vazio = primeiro nome de name.';
