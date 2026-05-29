-- Migration: Remove políticas anon de desenvolvimento deixadas em produção
-- Date: 2026-07-06
-- Problema 1: contracts e tabelas filhas tinham FOR ALL TO anon USING (true)
--   criadas como suporte de desenvolvimento, nunca removidas.
-- Problema 2: nbr_tables e sinapi_items tinham INSERT/UPDATE para anon
--   criadas para script de ingestão de dados; o próprio comentário pedia revogação.

-- ── Contratos ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon all on contracts"
  ON public.contracts;
DROP POLICY IF EXISTS "Allow anon all on contract_items"
  ON public.contract_items;
DROP POLICY IF EXISTS "Allow anon all on contract_addendums"
  ON public.contract_addendums;
DROP POLICY IF EXISTS "Allow anon all on contract_measurements"
  ON public.contract_measurements;
DROP POLICY IF EXISTS "Allow anon all on contract_measurement_items"
  ON public.contract_measurement_items;

-- ── Tabelas de referência SINAPI / NBR ────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert" ON public.nbr_tables;
DROP POLICY IF EXISTS "Allow anon update" ON public.nbr_tables;
DROP POLICY IF EXISTS "Allow anon insert" ON public.sinapi_items;
DROP POLICY IF EXISTS "Allow anon update" ON public.sinapi_items;
