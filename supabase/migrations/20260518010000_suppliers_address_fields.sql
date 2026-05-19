-- Adiciona campos de endereço detalhados à tabela suppliers.
-- Aplique no Supabase Dashboard → SQL Editor.

ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS street      text,
    ADD COLUMN IF NOT EXISTS number      text,
    ADD COLUMN IF NOT EXISTS neighborhood text,
    ADD COLUMN IF NOT EXISTS zip_code    text;

-- Migra dados existentes: address → street (se address estiver preenchido)
UPDATE public.suppliers SET street = address WHERE street IS NULL AND address IS NOT NULL;
