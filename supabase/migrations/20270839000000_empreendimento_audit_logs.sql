-- Histórico / trilha de auditoria do módulo Empreendimento.
--
-- Contexto: o módulo não tinha auditoria nenhuma. Não havia como saber quem mudou o
-- VGV, quando a obra foi vinculada, ou o que uma sincronização com o Imovib/Planta IA
-- alterou. A aba Curadoria (empreendimento_field_proposals, 20270218000000) chega perto,
-- mas só cobre propostas externas pendentes — não é histórico do que já aconteceu.
--
-- ⚠️ SEM FOREIGN KEY, de propósito — nem para `empreendimentos`, nem para `projects`,
-- nem para `auth.users`. `REFERENCES` nessas tabelas pega ShareRowExclusiveLock e
-- deadlocka (40P01) contra o app ativo; já mordeu 3× neste módulo (broker_proposals,
-- ponte de Locações, curadoria 20270218000000). Padrão do módulo: migration nova toca
-- só a tabela nova e o join é resolvido no cliente. Ver 20270719000000:11-15.
--
-- Escrita é 100% no cliente (services/empreendimentoAuditService.ts), como no motor de
-- áreas e em Processos. NÃO criar trigger de audit: exigiria DDL nas tabelas quentes do
-- módulo, que é exatamente o risco de lock que motivou a regra acima.

CREATE TABLE IF NOT EXISTS public.empreendimento_audit_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Denormalizado para a RLS não precisar de join com `empreendimentos` (sem FK).
    organization_id   UUID NOT NULL,
    empreendimento_id UUID NOT NULL,
    entity_type       TEXT NOT NULL CHECK (entity_type IN (
                          'empreendimento','tower','floor','unit','common_area',
                          'regulatory_zone','obra_link','area_project','study_link',
                          'commercial','rental','proposal')),
    entity_id         UUID,
    -- Nome legível NO MOMENTO do evento: a torre/unidade pode ser excluída depois e o
    -- histórico continua tendo que dizer de quem se tratava.
    entity_label      TEXT,
    action            TEXT NOT NULL CHECK (action IN (
                          'create','update','delete','link','unlink',
                          'sync','publish','pull','approve','reject','export')),
    -- Um evento por campo alterado (mesmo formato de area_version_audit_logs).
    field_name        TEXT,
    old_value         JSONB,
    new_value         JSONB,
    -- Contadores de operação em lote, ids de origem externa, relatórios de sync.
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason            TEXT,
    source            TEXT NOT NULL DEFAULT 'app' CHECK (source IN (
                          'app','sync_imovib','sync_planta','curadoria',
                          'comercial','locacao','area_engine')),
    user_id           UUID,
    -- organization_members.user_id pode ser NULL (convite por e-mail ainda não aceito),
    -- então o e-mail é gravado junto — mesmo motivo do dual-check da RLS do módulo.
    user_email        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_audit_timeline
    ON public.empreendimento_audit_logs (empreendimento_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emp_audit_entity
    ON public.empreendimento_audit_logs (empreendimento_id, entity_type, created_at DESC);

COMMENT ON TABLE public.empreendimento_audit_logs IS
    'Trilha de auditoria do Empreendimento (aba Histórico). Imutável: só SELECT e INSERT. '
    'Sem FK por causa de deadlock de DDL neste módulo; integridade validada na aplicação.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — imutável por construção: existe policy de SELECT e de INSERT, e NENHUMA
-- de UPDATE/DELETE. Com RLS ligada, ausência de policy = operação negada.
-- Reusa empr_user_org_ids() (dual-check uid+email), criada em 20261228000002.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.empreendimento_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_read_emp_audit" ON public.empreendimento_audit_logs;
CREATE POLICY "org_read_emp_audit" ON public.empreendimento_audit_logs
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.empr_user_org_ids()));

DROP POLICY IF EXISTS "org_write_emp_audit" ON public.empreendimento_audit_logs;
CREATE POLICY "org_write_emp_audit" ON public.empreendimento_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.empr_user_org_ids()));

-- Ao contrário das outras tabelas do módulo (que têm policy "Allow anon all ..."),
-- audit NÃO é leitura pública. GRANT a authenticated sozinho não bloqueia anon —
-- o REVOKE explícito é o que fecha.
REVOKE ALL ON TABLE public.empreendimento_audit_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.empreendimento_audit_logs FROM anon;
GRANT SELECT, INSERT ON TABLE public.empreendimento_audit_logs TO authenticated;
