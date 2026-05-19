-- Adiciona número sequencial único e global a cada boleto.
-- Aplique no Supabase Dashboard → SQL Editor.

ALTER TABLE public.boletos
    ADD COLUMN IF NOT EXISTS numero BIGSERIAL;

-- Índice para busca por número
CREATE UNIQUE INDEX IF NOT EXISTS boletos_numero_idx ON public.boletos (numero);
