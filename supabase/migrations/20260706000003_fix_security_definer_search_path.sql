-- Migration: Adiciona SET search_path = public, pg_temp em todas as funções SECURITY DEFINER
-- Date: 2026-07-06
-- Problema: sem search_path fixo, um atacante com CREATE SCHEMA pode criar objetos
--   em pg_temp que sombreiam funções/tabelas de public, causando privilege escalation.
-- Nota: is_org_member já recebeu SET search_path na migration 20260706000002.

-- ── Core / Org ────────────────────────────────────────────────────────────────
ALTER FUNCTION public.is_org_member(uuid)
  SET search_path = public, pg_temp;

-- ── Fiscal ────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.fiscal_auth_org_id()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.fiscal_member_of(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.replay_dead_letter(uuid)
  SET search_path = public, pg_temp;

-- ── Contratos ─────────────────────────────────────────────────────────────────
ALTER FUNCTION public.get_next_contract_number(text)
  SET search_path = public, pg_temp;

-- ── Projetos ──────────────────────────────────────────────────────────────────
ALTER FUNCTION public.get_next_project_code(text)
  SET search_path = public, pg_temp;

-- ── RH: Férias / Ausências ────────────────────────────────────────────────────
ALTER FUNCTION public.sync_vacation_balance_on_approval()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.create_vacation_period(uuid, uuid, date)
  SET search_path = public, pg_temp;

-- ── RH: Rescisão ──────────────────────────────────────────────────────────────
ALTER FUNCTION public.finalize_termination()
  SET search_path = public, pg_temp;

-- ── RH: KPIs ──────────────────────────────────────────────────────────────────
ALTER FUNCTION public.rh_kpis(uuid, date)
  SET search_path = public, pg_temp;

-- ── RH: Ponto Avançado ────────────────────────────────────────────────────────
ALTER FUNCTION public.sync_time_bank_balance()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.qr_checkin(text)
  SET search_path = public, pg_temp;

-- ── RH: SST ───────────────────────────────────────────────────────────────────
ALTER FUNCTION public.sst_indicators(uuid, integer)
  SET search_path = public, pg_temp;

-- ── RH: Diário de Obras (batch) ───────────────────────────────────────────────
ALTER FUNCTION public.close_labor_diary(uuid)
  SET search_path = public, pg_temp;

-- ── RH: ATS (contratação) ─────────────────────────────────────────────────────
ALTER FUNCTION public.hire_candidate(uuid, date)
  SET search_path = public, pg_temp;

-- ── RH: Portal do Colaborador ─────────────────────────────────────────────────
ALTER FUNCTION public.portal_validate_token(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.portal_generate_token(uuid, uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.portal_employee_summary(uuid)
  SET search_path = public, pg_temp;

-- ── RH: Avaliação ─────────────────────────────────────────────────────────────
ALTER FUNCTION public.consolidate_evaluation_cycle(uuid)
  SET search_path = public, pg_temp;

-- ── RH: Comunicação ───────────────────────────────────────────────────────────
ALTER FUNCTION public.dispatch_communication(uuid)
  SET search_path = public, pg_temp;

-- ── RH: BI ────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.generate_hr_monthly_snapshot(uuid, date)
  SET search_path = public, pg_temp;

-- ── RH: eSocial ───────────────────────────────────────────────────────────────
ALTER FUNCTION public.esocial_generate_s2200(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.esocial_get_dashboard(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.esocial_create_batch(uuid, text, text)
  SET search_path = public, pg_temp;

-- ── EPI ───────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.epi_update_stock()
  SET search_path = public, pg_temp;

-- ── Empresas / Documentos ─────────────────────────────────────────────────────
ALTER FUNCTION public.set_company_documents_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.log_company_status_change()
  SET search_path = public, pg_temp;
