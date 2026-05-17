-- Migration: Add 'Enviado' status to contracts
-- Date: 2026-02-24

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;

ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check 
CHECK (status IN ('Rascunho', 'Enviado', 'Ativo', 'Suspenso', 'Encerrado', 'Cancelado'));
