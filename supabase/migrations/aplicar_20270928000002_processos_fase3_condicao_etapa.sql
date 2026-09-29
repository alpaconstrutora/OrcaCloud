-- migration: aplicar_20270928000002_processos_fase3_condicao_etapa.sql
-- Módulo ÒPURA Processos — Fase 3 / Passo 4 do plano
-- docs/planos/2026-09-28-torre-p2p-processos.md: condição por etapa.
--
-- A etapa do TEMPLATE ganha `condition` (jsonb). Ao criar a instância, o motor
-- COPIA a condição para a etapa da instância — snapshot, como já faz com
-- `template_version`: mudar o template depois não muda o comportamento de uma
-- instância em andamento. Em `advanceToNextStep`, condição falsa → etapa vira
-- 'PULADO' (status que já existia no CHECK desde a F0) e o motor segue.
--
-- Formato (avaliado em utils/processCondition.ts, puro):
--   { "field": "amount" | "project_id" | "supplier_id",
--     "op":    "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "in",
--     "value": número | texto | [lista] }
-- Sem condição = sempre executa. Campo ausente no contexto = executa (nunca
-- pula por falta de dado — regra da casa: "nunca bloqueia").
--
-- Sem policy, sem função. Idempotente. Aplicar com
-- `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.

ALTER TABLE public.process_template_steps
    ADD COLUMN IF NOT EXISTS condition JSONB;

COMMENT ON COLUMN public.process_template_steps.condition IS
    'Condição para a etapa entrar no caminho: {field, op, value}. NULL = sempre executa. '
    'Avaliada em utils/processCondition.ts; copiada para process_instance_steps ao iniciar a instância.';

ALTER TABLE public.process_instance_steps
    ADD COLUMN IF NOT EXISTS condition JSONB;

COMMENT ON COLUMN public.process_instance_steps.condition IS
    'Snapshot da condição do template no momento em que a instância nasceu. '
    'Falsa em advanceToNextStep → status PULADO.';
