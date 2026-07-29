-- A migration anterior (20270837000000) criou contract_numbering_settings
-- (config por organização, com toggle enabled) — mas o pedido original era
-- copiar o mecanismo de Numeração de Pedidos, que fica em localStorage
-- (AppSettings) e é sempre ativo, sem tabela por organização e sem toggle.
-- Contract_number_counters + fn_next_contract_seq continuam (é o sequencial
-- atômico por obra, igual ao de pedidos — não é "config", é o mecanismo).

DROP POLICY IF EXISTS contract_numbering_settings_select ON public.contract_numbering_settings;
DROP POLICY IF EXISTS contract_numbering_settings_insert ON public.contract_numbering_settings;
DROP POLICY IF EXISTS contract_numbering_settings_update ON public.contract_numbering_settings;
DROP TABLE IF EXISTS public.contract_numbering_settings;
