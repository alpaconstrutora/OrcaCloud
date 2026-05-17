-- Pacote 1 — Optimistic Locking: coluna version em purchase_orders
-- Cada UPDATE bem-sucedido incrementa version; conflito retorna 0 linhas.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
