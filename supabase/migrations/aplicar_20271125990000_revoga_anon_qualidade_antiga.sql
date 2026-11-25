-- ============================================================
-- Migration: aplicar_20271125990000_revoga_anon_qualidade_antiga.sql
-- SEGURANÇA (higiene) — REGRA OBRIGATÓRIA #7, pergunta 2: "quem mais pode
-- executar esta função?"
-- Plano: docs/planos/2026-11-25-revoga-anon-qualidade-antiga.md
--
-- O antigo módulo "Qualidade & Entrega" (consolidado em Pós-Obra & Garantia,
-- docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md) deixou 21 funções
-- PL/pgSQL (SECURITY INVOKER) executáveis por PUBLIC e anon — o default do
-- PostgreSQL, nunca revogado nas migrations 20260514000001/3/4. Entre elas
-- quality_calculate_score, quality_emit_event e quality_lock_condition.
--
-- FATOS VERIFICADOS NO BANCO DE PRODUÇÃO (25/11, somente leitura)
--  * Lista = 21 funções (query em pg_proc: EXECUTE para anon e nome/corpo ligado
--    a construction_conditions / condition_events / condition_evidence).
--    As funções novas (quality_registrar_treinamento_em_obra,
--    quality_controlled_items_mesma_org, quality_touch_updated_at) NÃO aparecem:
--    já não têm EXECUTE para anon.
--  * Nenhuma outra função/trigger/view/policy/cron.job depende de anon executar
--    estas. A única referência externa é a Edge Function quality-sla-enforcement,
--    que exige `Bearer <service_role>` e usa service_role (não é afetada).
--  * O app (services/qualityConditionService.ts) chama as RPCs já logado
--    (authenticated), que MANTÉM o EXECUTE aqui.
--  * As tabelas têm RLS ligada e todas as policies são `TO authenticated`:
--    anon JÁ É barrado pela RLS. Esta migration é HIGIENE (defesa em
--    profundidade), não correção de vazamento comprovado.
--
-- O QUE FAZ
--  1. REVOKE EXECUTE de PUBLIC e anon nas 21 funções; GRANT a authenticated.
--  2. REVOKE ALL em anon nas tabelas do módulo antigo (as 5 pedidas + as 4
--     irmãs condition_action_plans/contestations/responsibilities/validations,
--     mesma situação).
--  3. REVOKE TRUNCATE/REFERENCES/TRIGGER de authenticated nelas.
--
-- Idempotente (REVOKE/GRANT repetidos não falham). Aplicar com
-- `npx supabase db query --linked -f` (nunca `db push`).
-- ============================================================

SET lock_timeout = '3s';

-- 1. Funções
REVOKE EXECUTE ON FUNCTION public.assign_responsibility(uuid,uuid,integer,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_responsibility(uuid,uuid,integer,text,text,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.classify_condition(uuid,uuid,integer,jsonb,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classify_condition(uuid,uuid,integer,jsonb,text,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.close_condition(uuid,uuid,integer,boolean,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_condition(uuid,uuid,integer,boolean,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_repair_step(uuid,uuid,integer,uuid,uuid[],jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_repair_step(uuid,uuid,integer,uuid,uuid[],jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.contest_condition(uuid,uuid,integer,text,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contest_condition(uuid,uuid,integer,text,date,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_condition(uuid,uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_condition(uuid,uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,text,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_condition(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_condition(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.escalate_condition(uuid,uuid,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_condition(uuid,uuid,integer,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.link_conditions(uuid,uuid,integer,uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_conditions(uuid,uuid,integer,uuid,text,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.quality_calculate_score(uuid,uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quality_calculate_score(uuid,uuid,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.quality_emit_event(uuid,uuid,text,jsonb,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quality_emit_event(uuid,uuid,text,jsonb,uuid,integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.quality_lock_condition(uuid,uuid,integer,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quality_lock_condition(uuid,uuid,integer,text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_condition(uuid,uuid,integer,text,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_condition(uuid,uuid,integer,text,date,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_action(uuid,uuid,integer,text,jsonb,date,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_action(uuid,uuid,integer,text,jsonb,date,jsonb,jsonb,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_escalation(uuid,uuid,integer,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_escalation(uuid,uuid,integer,text,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_to_contestation(uuid,uuid,integer,boolean,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_contestation(uuid,uuid,integer,boolean,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.revise_action_plan(uuid,uuid,integer,text,jsonb,date,jsonb,jsonb,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_action_plan(uuid,uuid,integer,text,jsonb,date,jsonb,jsonb,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.start_repair(uuid,uuid,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_repair(uuid,uuid,integer,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.supersede_evidence(uuid,uuid,integer,uuid,uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supersede_evidence(uuid,uuid,integer,uuid,uuid,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_condition_draft(uuid,uuid,integer,text,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_condition_draft(uuid,uuid,integer,text,text,text,text,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_condition(uuid,uuid,integer,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_condition(uuid,uuid,integer,text,text,jsonb) TO authenticated;

-- 2/3. Tabelas
REVOKE ALL ON TABLE public.construction_conditions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.construction_conditions FROM authenticated;
REVOKE ALL ON TABLE public.condition_events FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.condition_events FROM authenticated;
REVOKE ALL ON TABLE public.condition_evidence FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.condition_evidence FROM authenticated;
REVOKE ALL ON TABLE public.condition_taxonomy_pathologies FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.condition_taxonomy_pathologies FROM authenticated;
REVOKE ALL ON TABLE public.condition_taxonomy_systems FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.condition_taxonomy_systems FROM authenticated;
REVOKE ALL ON TABLE public.condition_action_plans FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.condition_action_plans FROM authenticated;
REVOKE ALL ON TABLE public.condition_contestations FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.condition_contestations FROM authenticated;
REVOKE ALL ON TABLE public.condition_responsibilities FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.condition_responsibilities FROM authenticated;
REVOKE ALL ON TABLE public.condition_validations FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.condition_validations FROM authenticated;
