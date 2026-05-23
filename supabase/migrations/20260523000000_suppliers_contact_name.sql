-- Adiciona campo de nome do contato à tabela suppliers
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS contact_name text;
