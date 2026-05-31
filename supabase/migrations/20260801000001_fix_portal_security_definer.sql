-- Migration: Adiciona SET search_path às funções SECURITY DEFINER restantes
-- Date: 2026-08-01
-- Contexto: 20260706000003 cobriu 27 funções; este patch cobre as 6 que ficaram de fora:
--   get_order_by_share_token, portal_get_time_entries, portal_get_absences,
--   portal_get_trainings, portal_get_documents, portal_get_payroll_runs.
-- Sem SET search_path, um atacante com CREATE SCHEMA pode criar objetos em pg_temp
-- que sombreiam tabelas/funções de public, causando privilege escalation.

ALTER FUNCTION public.get_order_by_share_token(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.portal_get_time_entries(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.portal_get_absences(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.portal_get_trainings(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.portal_get_documents(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.portal_get_payroll_runs(uuid)
  SET search_path = public, pg_temp;
