-- =============================================================================
-- Qualidade (SiAC / PBQP-H) — fase 2: estrutura (FVS na OE, histórico, NC, SGQ da SPE).
-- Plano:  docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md (Task 1).
-- Desenho: docs/planos/2026-11-25-qualidade-siac-pbqph.md ("Fase 2 — desenho").
--
-- O que nasce / muda aqui:
--   • quality_settings.sgq_organization_id — organização dona do sistema da
--     qualidade (as SPEs apontam para a Alpa). Gatilho: trocar exige dono/admin
--     da org e do destino (ou superadmin), nunca a própria, sem cadeia.
--   • quality_controlled_items.checklist_template_id — a "ficha modelo" do serviço
--     (modelo de checklist do Controle Operacional), sempre da mesma organização.
--   • oe_checklist_items: criterio, metodo, ativo (item com resposta não se apaga,
--     só se desativa — a FK das respostas passa a ON DELETE RESTRICT).
--   • work_orders.controlled_item_id — serviço controlado da OE, sempre da
--     organização dona do SGQ da organização da OE.
--   • oe_checklist_responses: quem/quando respondeu (pelo banco) + cópia congelada
--     do que foi verificado (descrição, critério, método, revisão do procedimento).
--   • oe_checklist_response_history — a resposta anterior, a cada reinspeção.
--   • work_order_validations: liberado_por/em, executores, revisão do procedimento.
--   • non_conformances: causa, eficácia, serviço controlado (pela OE); encerrar
--     exige causa e ação corretiva; non_conformance_history.
--   • quality_project_exclusions: a obra pode ser de uma org que aponta para a org
--     do item como SGQ.
--
-- REGRA #7:
--   Pergunta 1 — policies novas (só SELECT): histórico da resposta pela OE
--   (org da OE em minhas_orgs_membro()); histórico da NC pela NC → OE (idem). Sem
--   OR. A policy de quality_project_exclusions ganha um OR DENTRO do EXISTS: as
--   duas pernas exigem o item visível (membro da org do item) E a obra visível
--   (RLS de projects); a perna nova exige ainda a configuração da org da obra
--   visível (membro da org da obra) apontando para a org do item.
--   Pergunta 2 — toda função: REVOKE EXECUTE FROM PUBLIC, anon + GRANT a
--   authenticated. Todas são funções de gatilho (não chamáveis por RPC: "trigger
--   functions can only be called as triggers"). SECURITY DEFINER só em três:
--   as duas que gravam histórico (authenticated não tem INSERT nas tabelas de
--   histórico; só copiam OLD/NEW da linha que a RLS de quem gravou já deixou
--   alterar) e quality_settings_sgq_valido (lê quality_settings de outras orgs
--   para barrar cadeia; autoriza por is_superadmin()/is_org_manager()). As demais
--   são SECURITY INVOKER: a busca passa pela RLS de quem grava (registro que ele
--   não enxerga é recusado — não revela outra organização).
--
-- Correção 1 (revisão, 26/11): histórico desacoplado (SET NULL, não CASCADE);
-- resposta e NC de OE de serviço controlado não se apagam direto; trocar o SGQ
-- exige dono/admin das duas orgs (ou superadmin) e não forma cadeia; NC aceita o
-- SET NULL do serviço apagado; eficacia_por/em gravados pelo banco.
-- Correção 2: OE controlada com registro não perde/troca o serviço nem se apaga
-- direto; resposta e NC não mudam de OE (nem a resposta de item); a exclusão de
-- resposta/NC também vai para o histórico (evento 'exclusao'); eficácia
-- 'pendente' não tem autor.
-- Correção 3: registro = qualquer resposta ou linha de histórico da OE (sem
-- exceção para resposta "vazia"); o histórico da resposta também grava mudança
-- de `completed` e quem alterou/apagou (alterado_por).
--
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
--
-- ⚠️ REAPLICAR NA ORDEM (revisão final, 26/11): as quatro migrations da fase 2
--    redefinem as mesmas funções; reaplicar uma antiga depois das novas DESFAZ as
--    novas. Ordem: 100000 → 110000 → 120000 → 130000. Guarda no topo (DO) recusa
--    reaplicar sozinha. Para reaplicar de propósito: um arquivo só com
--    `SET qualidade.reaplicar_fase2_na_ordem = 'on';` + as quatro, na ordem.
--
--    Esta 100000 regride, se reaplicada depois: non_conformances_grava_historico e
--    o gatilho dela (120000), work_orders_servico_controlado_do_sgq (110000) e
--    quality_settings_sgq_valido (130000). A guarda detecta a 110000 pela tabela
--    work_order_validation_history (criada lá): na 1ª aplicação ela não existe e
--    a guarda passa.
-- =============================================================================

SET lock_timeout = '3s';

BEGIN;

-- ── 0. Guarda de reaplicação ───────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.work_order_validation_history') IS NOT NULL
       AND coalesce(current_setting('qualidade.reaplicar_fase2_na_ordem', true), '') <> 'on' THEN
        RAISE EXCEPTION 'Migration já superada por 110000/120000/130000 — reaplicar as quatro NA ORDEM (100000 → 110000 → 120000 → 130000)';
    END IF;
END $$;

-- ── 1. Colunas ──────────────────────────────────────────────────────────────

ALTER TABLE public.quality_settings
    ADD COLUMN IF NOT EXISTS sgq_organization_id uuid
        REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.quality_settings.sgq_organization_id IS
    'Organização dona do sistema da qualidade (SGQ) que vale para esta. NULL = a própria. '
    'Trocar exige dono/admin da organização e da de destino (ou superadmin); nunca a própria; sem cadeia '
    '(trigger quality_settings_sgq_valido).';

CREATE INDEX IF NOT EXISTS idx_quality_settings_sgq
    ON public.quality_settings (sgq_organization_id) WHERE sgq_organization_id IS NOT NULL;

ALTER TABLE public.quality_controlled_items
    ADD COLUMN IF NOT EXISTS checklist_template_id uuid
        REFERENCES public.oe_checklist_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.quality_controlled_items.checklist_template_id IS
    'Ficha modelo do serviço: modelo de checklist do Controle Operacional (mesma organização do item).';

CREATE INDEX IF NOT EXISTS idx_quality_controlled_items_template
    ON public.quality_controlled_items (checklist_template_id) WHERE checklist_template_id IS NOT NULL;

ALTER TABLE public.oe_checklist_items
    ADD COLUMN IF NOT EXISTS criterio text,
    ADD COLUMN IF NOT EXISTS metodo   text,
    ADD COLUMN IF NOT EXISTS ativo    boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.oe_checklist_items.criterio IS 'Critério de aceitação (tolerância) do item.';
COMMENT ON COLUMN public.oe_checklist_items.metodo   IS 'Método de verificação do item.';
COMMENT ON COLUMN public.oe_checklist_items.ativo    IS
    'Item desativado não entra em OE nova. Item com resposta não pode ser apagado (FK RESTRICT) — só desativado.';

ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS controlled_item_id uuid
        REFERENCES public.quality_controlled_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.work_orders.controlled_item_id IS
    'Serviço controlado (Qualidade SiAC) da OE — da organização dona do SGQ da organização da OE '
    '(trigger work_orders_servico_controlado_do_sgq).';

CREATE INDEX IF NOT EXISTS idx_work_orders_controlled_item
    ON public.work_orders (controlled_item_id) WHERE controlled_item_id IS NOT NULL;

ALTER TABLE public.oe_checklist_responses
    ADD COLUMN IF NOT EXISTS respondido_por         uuid DEFAULT auth.uid(),
    ADD COLUMN IF NOT EXISTS respondido_em          timestamptz,
    ADD COLUMN IF NOT EXISTS item_descricao         text,
    ADD COLUMN IF NOT EXISTS item_criterio          text,
    ADD COLUMN IF NOT EXISTS item_metodo            text,
    ADD COLUMN IF NOT EXISTS procedimento_revisao   text,
    ADD COLUMN IF NOT EXISTS procedimento_versao_id uuid;

COMMENT ON COLUMN public.oe_checklist_responses.respondido_por IS
    'Usuário (auth.uid) que deu a resposta atual — gravado pelo banco quando response_status muda.';
COMMENT ON COLUMN public.oe_checklist_responses.item_criterio IS
    'Cópia congelada do critério do item no momento da resposta (trigger oe_checklist_responses_copia_ficha).';
COMMENT ON COLUMN public.oe_checklist_responses.procedimento_revisao IS
    'Revisão (opura_documents.revisao) do procedimento do serviço controlado da OE no momento da resposta.';
COMMENT ON COLUMN public.oe_checklist_responses.procedimento_versao_id IS
    'Versão ativa (opura_documents.active_version_id) do procedimento no momento da resposta.';

ALTER TABLE public.work_order_validations
    ADD COLUMN IF NOT EXISTS liberado_por           uuid,
    ADD COLUMN IF NOT EXISTS liberado_em            timestamptz,
    ADD COLUMN IF NOT EXISTS executores             jsonb,
    ADD COLUMN IF NOT EXISTS procedimento_revisao   text,
    ADD COLUMN IF NOT EXISTS procedimento_versao_id uuid;

ALTER TABLE public.work_order_validations
    DROP CONSTRAINT IF EXISTS work_order_validations_executores_lista;
ALTER TABLE public.work_order_validations
    ADD CONSTRAINT work_order_validations_executores_lista
    CHECK (executores IS NULL OR jsonb_typeof(executores) = 'array');

COMMENT ON COLUMN public.work_order_validations.liberado_por IS
    'Usuário (auth.uid) que aprovou/reprovou a inspeção (approved_by_id aponta para employees e o liberador pode não ser colaborador).';
COMMENT ON COLUMN public.work_order_validations.executores IS
    'Congelado na aprovação: [{employee_id, nome, treinado}] — treinado na revisão vigente do procedimento naquele momento.';

ALTER TABLE public.non_conformances
    ADD COLUMN IF NOT EXISTS causa              text,
    ADD COLUMN IF NOT EXISTS eficacia           text,
    ADD COLUMN IF NOT EXISTS eficacia_em        timestamptz,
    ADD COLUMN IF NOT EXISTS eficacia_por       uuid,
    ADD COLUMN IF NOT EXISTS controlled_item_id uuid
        REFERENCES public.quality_controlled_items(id) ON DELETE SET NULL;

ALTER TABLE public.non_conformances
    DROP CONSTRAINT IF EXISTS non_conformances_eficacia_check;
ALTER TABLE public.non_conformances
    ADD CONSTRAINT non_conformances_eficacia_check
    CHECK (eficacia IN ('pendente', 'eficaz', 'nao_eficaz'));

-- NOT VALID: vale para toda gravação daqui em diante; as linhas antigas não são
-- reconferidas (0 NCs encerradas em 26/11, conferido antes de aplicar).
ALTER TABLE public.non_conformances
    DROP CONSTRAINT IF EXISTS non_conformances_encerrar_exige_causa_e_acao;
ALTER TABLE public.non_conformances
    ADD CONSTRAINT non_conformances_encerrar_exige_causa_e_acao
    CHECK (status <> 'closed'
           OR (btrim(coalesce(causa, '')) <> '' AND btrim(coalesce(corrective_action, '')) <> ''))
    NOT VALID;

COMMENT ON COLUMN public.non_conformances.controlled_item_id IS
    'Serviço controlado da OE da NC — preenchido pelo banco a partir da OE (trigger non_conformances_servico_controlado).';

CREATE INDEX IF NOT EXISTS idx_non_conformances_controlled_item
    ON public.non_conformances (controlled_item_id) WHERE controlled_item_id IS NOT NULL;

-- ── 2. FK da resposta → item: RESTRICT ─────────────────────────────────────
-- Antes: ON DELETE CASCADE — apagar o item do modelo apagava as respostas (o
-- registro de inspeção). Agora o item com resposta só pode ser desativado.
ALTER TABLE public.oe_checklist_responses
    DROP CONSTRAINT IF EXISTS oe_checklist_responses_item_id_fkey;
ALTER TABLE public.oe_checklist_responses
    ADD CONSTRAINT oe_checklist_responses_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES public.oe_checklist_items(id) ON DELETE RESTRICT;

-- ── 3. Tabelas de histórico ────────────────────────────────────────────────

-- O histórico é DESACOPLADO da linha-mãe: response_id / nc_id ON DELETE SET NULL
-- (a linha fica, órfã, com o work_order_id). Antes era CASCADE — apagar a resposta
-- ou a NC levava o histórico junto e o registro podia ser reescrito sem rastro.
-- work_order_id SEM FK de propósito: ao apagar a OE, a cascata da NC faz SET NULL
-- em nc_id da resposta ANTES de a resposta ser apagada — o gatilho de histórico
-- grava uma linha e a conferência da FK para work_orders (já apagada no mesmo
-- comando) derrubaria a exclusão da OE.
CREATE TABLE IF NOT EXISTS public.oe_checklist_response_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id     uuid REFERENCES public.oe_checklist_responses(id) ON DELETE SET NULL,
    work_order_id   uuid NOT NULL,
    item_id         uuid NOT NULL,
    response_status text,
    notes           text,
    nc_id           uuid,
    evidence_id     uuid,
    respondido_por  uuid,
    respondido_em   timestamptz,
    copia           jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oe_checklist_response_history_response
    ON public.oe_checklist_response_history (response_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oe_checklist_response_history_wo
    ON public.oe_checklist_response_history (work_order_id);

COMMENT ON TABLE public.oe_checklist_response_history IS
    'Qualidade (SiAC): resposta anterior do checklist da OE, gravada pelo banco quando a resposta muda '
    '(response_status, notes, nc_id, evidence_id ou completed) ou é apagada (evento). Só leitura para o app.';

CREATE TABLE IF NOT EXISTS public.non_conformance_history (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nc_id             uuid REFERENCES public.non_conformances(id) ON DELETE SET NULL,
    work_order_id     uuid NOT NULL,
    status            text,
    causa             text,
    corrective_action text,
    eficacia          text,
    alterado_por      uuid DEFAULT auth.uid(),
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- Quem já aplicou a 1ª versão (CASCADE, NOT NULL, sem work_order_id na NC):
-- leva para o desenho acima. Idempotente.
ALTER TABLE public.oe_checklist_response_history ALTER COLUMN response_id DROP NOT NULL;
ALTER TABLE public.oe_checklist_response_history
    DROP CONSTRAINT IF EXISTS oe_checklist_response_history_response_id_fkey;
ALTER TABLE public.oe_checklist_response_history
    ADD CONSTRAINT oe_checklist_response_history_response_id_fkey
    FOREIGN KEY (response_id) REFERENCES public.oe_checklist_responses(id) ON DELETE SET NULL;

ALTER TABLE public.non_conformance_history ADD COLUMN IF NOT EXISTS work_order_id uuid;
UPDATE public.non_conformance_history h
   SET work_order_id = nc.work_order_id
  FROM public.non_conformances nc
 WHERE nc.id = h.nc_id AND h.work_order_id IS NULL;
ALTER TABLE public.non_conformance_history ALTER COLUMN work_order_id SET NOT NULL;
ALTER TABLE public.non_conformance_history ALTER COLUMN nc_id DROP NOT NULL;
ALTER TABLE public.non_conformance_history
    DROP CONSTRAINT IF EXISTS non_conformance_history_nc_id_fkey;
ALTER TABLE public.non_conformance_history
    ADD CONSTRAINT non_conformance_history_nc_id_fkey
    FOREIGN KEY (nc_id) REFERENCES public.non_conformances(id) ON DELETE SET NULL;

-- Correção 2: o histórico também guarda a EXCLUSÃO (estado OLD, gravado no
-- BEFORE DELETE — vale também quando a exclusão vem de cascata).
ALTER TABLE public.oe_checklist_response_history
    ADD COLUMN IF NOT EXISTS evento text NOT NULL DEFAULT 'alteracao';
ALTER TABLE public.oe_checklist_response_history
    DROP CONSTRAINT IF EXISTS oe_checklist_response_history_evento_check;
ALTER TABLE public.oe_checklist_response_history
    ADD CONSTRAINT oe_checklist_response_history_evento_check CHECK (evento IN ('alteracao', 'exclusao'));
ALTER TABLE public.non_conformance_history
    ADD COLUMN IF NOT EXISTS evento text NOT NULL DEFAULT 'alteracao';
ALTER TABLE public.non_conformance_history
    DROP CONSTRAINT IF EXISTS non_conformance_history_evento_check;
ALTER TABLE public.non_conformance_history
    ADD CONSTRAINT non_conformance_history_evento_check CHECK (evento IN ('alteracao', 'exclusao'));

-- Correção 3: quem substituiu/apagou a resposta (gravado pelo gatilho).
ALTER TABLE public.oe_checklist_response_history
    ADD COLUMN IF NOT EXISTS alterado_por uuid DEFAULT auth.uid();
COMMENT ON COLUMN public.oe_checklist_response_history.alterado_por IS
    'Usuário (auth.uid) que substituiu ou apagou a resposta — gravado pelo gatilho.';

COMMENT ON COLUMN public.oe_checklist_response_history.evento IS
    'alteracao = a resposta foi substituída (linha = a anterior); exclusao = a resposta foi apagada (linha = a última).';
COMMENT ON COLUMN public.non_conformance_history.evento IS
    'alteracao = a NC mudou (linha = o estado novo); exclusao = a NC foi apagada (linha = o último estado).';

CREATE INDEX IF NOT EXISTS idx_non_conformance_history_nc
    ON public.non_conformance_history (nc_id, created_at);
CREATE INDEX IF NOT EXISTS idx_non_conformance_history_wo
    ON public.non_conformance_history (work_order_id);

COMMENT ON TABLE public.non_conformance_history IS
    'Qualidade (SiAC): cada mudança de status/causa/ação corretiva/eficácia da NC — o estado NOVO, '
    'com quem mudou (alterado_por) e quando. Gravada pelo banco; só leitura para o app.';

-- ── 4. Gatilhos ────────────────────────────────────────────────────────────

-- 4.1 quality_settings: trocar o SGQ (apontar, trocar, voltar a NULL ou apagar a
-- linha que aponta) é decisão de DONO/ADMIN — da organização E da organização de
-- destino — ou de superadmin. Ser membro não basta: qualquer autenticado cria uma
-- organização (vira owner dela) e, se bastasse ser membro, um membro comum da SPE
-- apontaria o SGQ para uma org dele e aprovaria inspeções com as permissões de lá.
-- Sem cadeia: o destino não pode ter SGQ próprio, e uma org que já é dona do SGQ
-- de outra não pode apontar para uma terceira (22023).
-- Conferido só quando o SGQ muda: mexer em nivel_alvo não é barrado.
-- Cascata (org apagada → linha apagada / SGQ vira NULL, pg_trigger_depth() > 1)
-- passa: quem apaga a organização já foi autorizado lá.
-- SECURITY DEFINER: a checagem de cadeia lê quality_settings de outras orgs sem
-- depender da RLS de quem grava (superadmin pode não ser membro). Não recebe
-- parâmetro; autorização por is_superadmin() / is_org_manager() (auth.jwt()).
CREATE OR REPLACE FUNCTION public.quality_settings_sgq_valido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_super boolean;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    v_super := public.is_superadmin();

    IF TG_OP = 'DELETE' THEN
        IF OLD.sgq_organization_id IS NOT NULL
           AND NOT (v_super OR public.is_org_manager(OLD.organization_id)) THEN
            RAISE EXCEPTION 'Só o dono ou um administrador da organização pode deixar de usar o sistema da qualidade de outra.'
                USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.sgq_organization_id IS NOT NULL AND NEW.sgq_organization_id = NEW.organization_id THEN
        RAISE EXCEPTION 'A organização dona do sistema da qualidade tem de ser outra (sem valor = a própria).'
            USING ERRCODE = '22023';
    END IF;

    IF TG_OP = 'INSERT' AND NEW.sgq_organization_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.sgq_organization_id IS NOT DISTINCT FROM OLD.sgq_organization_id
       AND (NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
            OR (NEW.sgq_organization_id IS NULL AND OLD.sgq_organization_id IS NULL)) THEN
        RETURN NEW;
    END IF;

    -- Daqui em diante o SGQ mudou (inclui virar NULL).
    IF NOT (v_super OR public.is_org_manager(NEW.organization_id)) THEN
        RAISE EXCEPTION 'Só o dono ou um administrador da organização pode trocar a organização dona do sistema da qualidade.'
            USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id
       AND OLD.sgq_organization_id IS NOT NULL
       AND NOT (v_super OR public.is_org_manager(OLD.organization_id)) THEN
        RAISE EXCEPTION 'Só o dono ou um administrador da organização pode trocar a organização dona do sistema da qualidade.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.sgq_organization_id IS NOT NULL THEN
        IF NOT (v_super OR public.is_org_manager(NEW.sgq_organization_id)) THEN
            RAISE EXCEPTION 'Só o dono ou um administrador da organização de destino pode torná-la dona do sistema da qualidade de outra.'
                USING ERRCODE = '42501';
        END IF;
        IF EXISTS (SELECT 1 FROM public.quality_settings s
                    WHERE s.organization_id = NEW.sgq_organization_id
                      AND s.sgq_organization_id IS NOT NULL) THEN
            RAISE EXCEPTION 'A organização de destino já usa o sistema da qualidade de outra.'
                USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM public.quality_settings s
                    WHERE s.sgq_organization_id = NEW.organization_id
                      AND s.organization_id <> NEW.organization_id) THEN
            RAISE EXCEPTION 'Esta organização já é a dona do sistema da qualidade de outra e não pode usar o de uma terceira.'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quality_settings_sgq_valido ON public.quality_settings;
CREATE TRIGGER trg_quality_settings_sgq_valido
    BEFORE INSERT OR UPDATE OR DELETE ON public.quality_settings
    FOR EACH ROW EXECUTE FUNCTION public.quality_settings_sgq_valido();

-- 4.2 quality_controlled_items: fase 1 + a ficha modelo da mesma organização.
CREATE OR REPLACE FUNCTION public.quality_controlled_items_mesma_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Organização do item é imutável: mover o item deixaria para trás quem aponta
    -- para ele (substitui_item_id de outro item, exclusões em obras da org antiga,
    -- OEs de serviço controlado).
    IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'A organização de um item controlado não pode ser trocada.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.procedure_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.opura_documents d
         WHERE d.id = NEW.procedure_document_id
           AND d.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'O procedimento escolhido não é desta organização.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.training_course_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.training_courses c
         WHERE c.id = NEW.training_course_id
           AND c.org_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'O treinamento escolhido não é desta organização.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.substitui_item_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
         WHERE i.id = NEW.substitui_item_id
           AND i.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'O item substituído não é desta organização.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.checklist_template_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.oe_checklist_templates t
         WHERE t.id = NEW.checklist_template_id
           AND t.org_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'A ficha modelo escolhida não é desta organização.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quality_controlled_items_mesma_org ON public.quality_controlled_items;
CREATE TRIGGER trg_quality_controlled_items_mesma_org
    BEFORE INSERT OR UPDATE ON public.quality_controlled_items
    FOR EACH ROW EXECUTE FUNCTION public.quality_controlled_items_mesma_org();

-- 4.3 work_orders: o serviço controlado é da organização dona do SGQ da org da
-- OE (coalesce(sgq_organization_id, org da OE)). INVOKER: quem não é membro da
-- org do SGQ não enxerga o item e é recusado.
-- Correção 2: OE controlada que já tem REGISTRO não troca nem perde o serviço
-- controlado num UPDATE direto — senão bastava desligar o serviço, apagar o
-- registro (OE "comum") e religar. O SET NULL da cascata (serviço controlado
-- apagado, pg_trigger_depth() > 1) passa.
-- Correção 3: REGISTRO = qualquer linha em oe_checklist_responses OU em
-- oe_checklist_response_history da OE, qualquer NC ou qualquer validação. Não há
-- exceção para resposta "vazia": zerar a resposta é um UPDATE comum (e vai para o
-- histórico), então "vazia" não prova que nunca houve inspeção.
CREATE OR REPLACE FUNCTION public.work_orders_servico_controlado_do_sgq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sgq uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND pg_trigger_depth() = 1
       AND OLD.controlled_item_id IS NOT NULL
       AND NEW.controlled_item_id IS DISTINCT FROM OLD.controlled_item_id
       AND (EXISTS (SELECT 1 FROM public.oe_checklist_responses r WHERE r.work_order_id = OLD.id)
            OR EXISTS (SELECT 1 FROM public.oe_checklist_response_history h WHERE h.work_order_id = OLD.id)
            OR EXISTS (SELECT 1 FROM public.non_conformances nc WHERE nc.work_order_id = OLD.id)
            OR EXISTS (SELECT 1 FROM public.work_order_validations v WHERE v.work_order_id = OLD.id)) THEN
        RAISE EXCEPTION 'O serviço controlado de uma OE com registro de inspeção (resposta, histórico de resposta, NC ou validação) não pode ser trocado nem retirado.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.controlled_item_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.controlled_item_id IS NOT DISTINCT FROM OLD.controlled_item_id
       AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id THEN
        RETURN NEW;
    END IF;

    SELECT coalesce(
               (SELECT s.sgq_organization_id FROM public.quality_settings s
                 WHERE s.organization_id = NEW.org_id),
               NEW.org_id)
      INTO v_sgq;

    IF NOT EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
         WHERE i.id = NEW.controlled_item_id
           AND i.organization_id = v_sgq
    ) THEN
        RAISE EXCEPTION 'O serviço controlado escolhido não é do sistema da qualidade da organização desta OE.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_orders_servico_controlado_do_sgq ON public.work_orders;
CREATE TRIGGER trg_work_orders_servico_controlado_do_sgq
    BEFORE INSERT OR UPDATE OF controlled_item_id, org_id ON public.work_orders
    FOR EACH ROW EXECUTE FUNCTION public.work_orders_servico_controlado_do_sgq();

-- 4.3b Correção 2: OE controlada com registro não se apaga direto (a policy
-- work_orders_access é FOR ALL para qualquer membro; apagar a OE levaria o
-- registro junto). Cascata (organização apagada) passa. OE controlada sem
-- registro e OE comum continuam podendo ser apagadas. INVOKER: quem apaga a OE a
-- enxerga, e com ela respostas/NCs/validações (RLS pela OE).
CREATE OR REPLACE FUNCTION public.work_orders_bloqueia_exclusao_controlada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF pg_trigger_depth() > 1 OR OLD.controlled_item_id IS NULL THEN
        RETURN OLD;
    END IF;

    IF EXISTS (SELECT 1 FROM public.oe_checklist_responses r WHERE r.work_order_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.oe_checklist_response_history h WHERE h.work_order_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.non_conformances nc WHERE nc.work_order_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.work_order_validations v WHERE v.work_order_id = OLD.id) THEN
        RAISE EXCEPTION 'Uma OE de serviço controlado com registro de inspeção (resposta, histórico de resposta, NC ou validação) não pode ser apagada.'
            USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_orders_bloqueia_exclusao_controlada ON public.work_orders;
CREATE TRIGGER trg_work_orders_bloqueia_exclusao_controlada
    BEFORE DELETE ON public.work_orders
    FOR EACH ROW EXECUTE FUNCTION public.work_orders_bloqueia_exclusao_controlada();

-- 4.4 oe_checklist_responses: quem/quando + cópia congelada da ficha.
-- A cópia (descrição/critério/método do item + revisão/versão do procedimento do
-- serviço controlado da OE) é tirada quando a resposta nasce ou muda de status
-- (ou de item); fora isso fica a anterior — o app não reescreve o que foi
-- verificado. respondido_por/em idem: só o banco grava (auth.uid(), now()).
-- INVOKER: lê item, OE, serviço e procedimento com a RLS de quem responde.
CREATE OR REPLACE FUNCTION public.oe_checklist_responses_copia_ficha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Correção 2: a resposta não muda de OE nem de item num UPDATE direto (nenhum
    -- fluxo legítimo move; mover tiraria o registro da OE controlada sem rastro).
    IF TG_OP = 'UPDATE' AND pg_trigger_depth() = 1
       AND (NEW.work_order_id IS DISTINCT FROM OLD.work_order_id
            OR NEW.item_id IS DISTINCT FROM OLD.item_id) THEN
        RAISE EXCEPTION 'A resposta do checklist não pode mudar de OE nem de item.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT'
       OR NEW.response_status IS DISTINCT FROM OLD.response_status
       OR NEW.item_id IS DISTINCT FROM OLD.item_id THEN
        -- SELECT INTO sem linha deixa os alvos NULL.
        SELECT i.description, i.criterio, i.metodo
          INTO NEW.item_descricao, NEW.item_criterio, NEW.item_metodo
          FROM public.oe_checklist_items i
         WHERE i.id = NEW.item_id;

        SELECT d.revisao, d.active_version_id
          INTO NEW.procedimento_revisao, NEW.procedimento_versao_id
          FROM public.work_orders wo
          JOIN public.quality_controlled_items q ON q.id = wo.controlled_item_id
          JOIN public.opura_documents d          ON d.id = q.procedure_document_id
         WHERE wo.id = NEW.work_order_id;
    ELSE
        NEW.item_descricao         := OLD.item_descricao;
        NEW.item_criterio          := OLD.item_criterio;
        NEW.item_metodo            := OLD.item_metodo;
        NEW.procedimento_revisao   := OLD.procedimento_revisao;
        NEW.procedimento_versao_id := OLD.procedimento_versao_id;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.response_status IS DISTINCT FROM OLD.response_status THEN
        IF NEW.response_status IS NULL THEN
            NEW.respondido_por := NULL;
            NEW.respondido_em  := NULL;
        ELSE
            NEW.respondido_por := auth.uid();
            NEW.respondido_em  := now();
        END IF;
    ELSE
        NEW.respondido_por := OLD.respondido_por;
        NEW.respondido_em  := OLD.respondido_em;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oe_checklist_responses_copia_ficha ON public.oe_checklist_responses;
CREATE TRIGGER trg_oe_checklist_responses_copia_ficha
    BEFORE INSERT OR UPDATE ON public.oe_checklist_responses
    FOR EACH ROW EXECUTE FUNCTION public.oe_checklist_responses_copia_ficha();

-- 4.5 oe_checklist_responses → histórico: grava a resposta ANTERIOR (OLD) quando
-- ela é substituída (AFTER UPDATE) e a última quando é apagada (BEFORE DELETE —
-- direto ou por cascata; no BEFORE a resposta ainda existe e o response_id vira
-- NULL pelo ON DELETE SET NULL logo depois).
-- SECURITY DEFINER: authenticated não tem INSERT no histórico. Autorização: o
-- gatilho só roda depois que o comando passou pela RLS de quem grava, e só copia a
-- própria linha (OLD) — não recebe parâmetro nenhum.
CREATE OR REPLACE FUNCTION public.oe_checklist_responses_grava_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.oe_checklist_response_history (
        response_id, work_order_id, item_id, response_status, notes, nc_id,
        evidence_id, respondido_por, respondido_em, evento, alterado_por, copia)
    VALUES (
        OLD.id, OLD.work_order_id, OLD.item_id, OLD.response_status, OLD.notes, OLD.nc_id,
        OLD.evidence_id, OLD.respondido_por, OLD.respondido_em,
        CASE WHEN TG_OP = 'DELETE' THEN 'exclusao' ELSE 'alteracao' END,
        auth.uid(),
        jsonb_build_object(
            'item_descricao',         OLD.item_descricao,
            'item_criterio',          OLD.item_criterio,
            'item_metodo',            OLD.item_metodo,
            'procedimento_revisao',   OLD.procedimento_revisao,
            'procedimento_versao_id', OLD.procedimento_versao_id,
            'completed',              OLD.completed,
            'completed_at',           OLD.completed_at,
            'completed_by_id',        OLD.completed_by_id));
    RETURN OLD;  -- no BEFORE DELETE, NULL cancelaria a exclusão; no AFTER UPDATE é ignorado
END;
$$;

DROP TRIGGER IF EXISTS trg_oe_checklist_responses_grava_historico_exclusao ON public.oe_checklist_responses;
CREATE TRIGGER trg_oe_checklist_responses_grava_historico_exclusao
    BEFORE DELETE ON public.oe_checklist_responses
    FOR EACH ROW EXECUTE FUNCTION public.oe_checklist_responses_grava_historico();

DROP TRIGGER IF EXISTS trg_oe_checklist_responses_grava_historico ON public.oe_checklist_responses;
CREATE TRIGGER trg_oe_checklist_responses_grava_historico
    AFTER UPDATE ON public.oe_checklist_responses
    FOR EACH ROW
    WHEN (OLD.response_status IS DISTINCT FROM NEW.response_status
       OR OLD.notes           IS DISTINCT FROM NEW.notes
       OR OLD.nc_id           IS DISTINCT FROM NEW.nc_id
       OR OLD.evidence_id     IS DISTINCT FROM NEW.evidence_id
       OR OLD.completed       IS DISTINCT FROM NEW.completed)
    EXECUTE FUNCTION public.oe_checklist_responses_grava_historico();

-- 4.6 non_conformances: serviço controlado vem da OE (o app não escolhe).
-- Na criação (ou se a NC mudar de OE) copia o da OE; em qualquer outro UPDATE
-- direto fica o que já estava. UPDATE vindo de cascata (pg_trigger_depth() > 1 —
-- o ON DELETE SET NULL quando o serviço controlado é apagado) passa como veio.
-- INVOKER: a OE já é visível para quem grava a NC (a RLS da NC passa pela OE).
CREATE OR REPLACE FUNCTION public.non_conformances_servico_controlado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Correção 2: a NC não muda de OE num UPDATE direto (nenhum fluxo legítimo
    -- move; mover tiraria a NC aberta da OE controlada sem rastro).
    IF TG_OP = 'UPDATE' AND pg_trigger_depth() = 1
       AND NEW.work_order_id IS DISTINCT FROM OLD.work_order_id THEN
        RAISE EXCEPTION 'A não conformidade não pode mudar de OE.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id THEN
        SELECT wo.controlled_item_id INTO NEW.controlled_item_id
          FROM public.work_orders wo
         WHERE wo.id = NEW.work_order_id;
    ELSIF pg_trigger_depth() = 1 THEN
        NEW.controlled_item_id := OLD.controlled_item_id;
    END IF;
    RETURN NEW;
END;
$$;

-- 4.6b non_conformances: quem/quando verificou a eficácia é o banco que grava
-- (auth.uid(), now()) quando `eficacia` muda para um resultado (eficaz /
-- nao_eficaz); pendente ou NULL = ninguém verificou ainda (NULL/NULL). O que o
-- app mandar é ignorado.
CREATE OR REPLACE FUNCTION public.non_conformances_eficacia_autor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.eficacia IS DISTINCT FROM OLD.eficacia THEN
        IF NEW.eficacia IN ('eficaz', 'nao_eficaz') THEN
            NEW.eficacia_por := auth.uid();
            NEW.eficacia_em  := now();
        ELSE
            NEW.eficacia_por := NULL;
            NEW.eficacia_em  := NULL;
        END IF;
    ELSE
        NEW.eficacia_por := OLD.eficacia_por;
        NEW.eficacia_em  := OLD.eficacia_em;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_non_conformances_eficacia_autor ON public.non_conformances;
CREATE TRIGGER trg_non_conformances_eficacia_autor
    BEFORE INSERT OR UPDATE ON public.non_conformances
    FOR EACH ROW EXECUTE FUNCTION public.non_conformances_eficacia_autor();

-- 4.6c Registro de inspeção de OE de serviço controlado não se apaga direto:
-- resposta do checklist e NC (as policies FOR ALL deixam qualquer membro apagar —
-- apagar e recriar reescreveria o registro; apagar a NC aberta destravaria o
-- portão). Só DELETE direto (pg_trigger_depth() = 1); a cascata de apagar a OE
-- inteira passa. INVOKER: quem pode apagar a linha enxerga a OE (a RLS passa por ela).
CREATE OR REPLACE FUNCTION public.qualidade_bloqueia_exclusao_direta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    -- Correção 3: sem exceção para resposta "vazia" — toda resposta de OE
    -- controlada é registro (zerar e apagar não pode apagar a inspeção).

    IF EXISTS (SELECT 1 FROM public.work_orders wo
                WHERE wo.id = OLD.work_order_id
                  AND wo.controlled_item_id IS NOT NULL) THEN
        IF TG_TABLE_NAME = 'non_conformances' THEN
            RAISE EXCEPTION 'A não conformidade de uma OE de serviço controlado não pode ser apagada — encerre-a com causa e ação corretiva.'
                USING ERRCODE = '42501';
        ELSE
            RAISE EXCEPTION 'A resposta da ficha de verificação de uma OE de serviço controlado não pode ser apagada — responda de novo (a anterior fica no histórico).'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_oe_checklist_responses_bloqueia_exclusao ON public.oe_checklist_responses;
CREATE TRIGGER trg_oe_checklist_responses_bloqueia_exclusao
    BEFORE DELETE ON public.oe_checklist_responses
    FOR EACH ROW EXECUTE FUNCTION public.qualidade_bloqueia_exclusao_direta();

DROP TRIGGER IF EXISTS trg_non_conformances_bloqueia_exclusao ON public.non_conformances;
CREATE TRIGGER trg_non_conformances_bloqueia_exclusao
    BEFORE DELETE ON public.non_conformances
    FOR EACH ROW EXECUTE FUNCTION public.qualidade_bloqueia_exclusao_direta();

DROP TRIGGER IF EXISTS trg_non_conformances_servico_controlado ON public.non_conformances;
CREATE TRIGGER trg_non_conformances_servico_controlado
    BEFORE INSERT OR UPDATE ON public.non_conformances
    FOR EACH ROW EXECUTE FUNCTION public.non_conformances_servico_controlado();

-- 4.7 non_conformances → histórico: grava o estado NOVO e quem mudou (AFTER
-- UPDATE) e o último estado quando a NC é apagada (BEFORE DELETE — direto ou
-- por cascata). SECURITY DEFINER pelo mesmo motivo do 4.5; só copia a própria linha.
CREATE OR REPLACE FUNCTION public.non_conformances_grava_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.non_conformance_history (nc_id, work_order_id, status, causa, corrective_action, eficacia, alterado_por, evento)
        VALUES (OLD.id, OLD.work_order_id, OLD.status, OLD.causa, OLD.corrective_action, OLD.eficacia, auth.uid(), 'exclusao');
        RETURN OLD;  -- NULL cancelaria a exclusão
    END IF;
    INSERT INTO public.non_conformance_history (nc_id, work_order_id, status, causa, corrective_action, eficacia, alterado_por, evento)
    VALUES (NEW.id, NEW.work_order_id, NEW.status, NEW.causa, NEW.corrective_action, NEW.eficacia, auth.uid(), 'alteracao');
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_non_conformances_grava_historico_exclusao ON public.non_conformances;
CREATE TRIGGER trg_non_conformances_grava_historico_exclusao
    BEFORE DELETE ON public.non_conformances
    FOR EACH ROW EXECUTE FUNCTION public.non_conformances_grava_historico();

DROP TRIGGER IF EXISTS trg_non_conformances_grava_historico ON public.non_conformances;
CREATE TRIGGER trg_non_conformances_grava_historico
    AFTER UPDATE ON public.non_conformances
    FOR EACH ROW
    WHEN (OLD.status            IS DISTINCT FROM NEW.status
       OR OLD.causa             IS DISTINCT FROM NEW.causa
       OR OLD.corrective_action IS DISTINCT FROM NEW.corrective_action
       OR OLD.eficacia          IS DISTINCT FROM NEW.eficacia)
    EXECUTE FUNCTION public.non_conformances_grava_historico();

-- ── 5. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.oe_checklist_response_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.non_conformance_history       ENABLE ROW LEVEL SECURITY;

-- Histórico da resposta — mesmo padrão de checklist_responses_access (pela OE).
-- Só SELECT: sem policy de INSERT/UPDATE/DELETE (e sem o privilégio).
DROP POLICY IF EXISTS oe_checklist_response_history_select ON public.oe_checklist_response_history;
CREATE POLICY oe_checklist_response_history_select ON public.oe_checklist_response_history
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = oe_checklist_response_history.work_order_id
           AND wo.org_id IN (SELECT public.minhas_orgs_membro())));

-- Histórico da NC — igual à da NC (pela OE). Pelo work_order_id da própria linha:
-- a linha continua legível se a NC for apagada (nc_id vira NULL). Só SELECT.
DROP POLICY IF EXISTS non_conformance_history_select ON public.non_conformance_history;
CREATE POLICY non_conformance_history_select ON public.non_conformance_history
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = non_conformance_history.work_order_id
           AND wo.org_id IN (SELECT public.minhas_orgs_membro())));

REVOKE ALL ON public.oe_checklist_response_history, public.non_conformance_history FROM anon;
REVOKE ALL ON public.oe_checklist_response_history, public.non_conformance_history FROM authenticated;
GRANT SELECT ON public.oe_checklist_response_history, public.non_conformance_history TO authenticated;

-- quality_project_exclusions — item visível E obra visível E (a obra é da org do
-- item OU a org da obra aponta para a org do item como SGQ). As duas pernas do OR
-- estão DENTRO do EXISTS: nenhuma libera a linha sem o item e a obra visíveis; a
-- perna nova ainda exige a configuração da org da obra visível (RLS de
-- quality_settings = membro da org da obra).
DROP POLICY IF EXISTS quality_project_exclusions_select ON public.quality_project_exclusions;
CREATE POLICY quality_project_exclusions_select ON public.quality_project_exclusions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND (p.organization_id = i.organization_id
                OR EXISTS (SELECT 1 FROM public.quality_settings s
                            WHERE s.organization_id = p.organization_id
                              AND s.sgq_organization_id = i.organization_id))));

DROP POLICY IF EXISTS quality_project_exclusions_insert ON public.quality_project_exclusions;
CREATE POLICY quality_project_exclusions_insert ON public.quality_project_exclusions
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND (p.organization_id = i.organization_id
                OR EXISTS (SELECT 1 FROM public.quality_settings s
                            WHERE s.organization_id = p.organization_id
                              AND s.sgq_organization_id = i.organization_id))));

DROP POLICY IF EXISTS quality_project_exclusions_update ON public.quality_project_exclusions;
CREATE POLICY quality_project_exclusions_update ON public.quality_project_exclusions
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND (p.organization_id = i.organization_id
                OR EXISTS (SELECT 1 FROM public.quality_settings s
                            WHERE s.organization_id = p.organization_id
                              AND s.sgq_organization_id = i.organization_id))))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND (p.organization_id = i.organization_id
                OR EXISTS (SELECT 1 FROM public.quality_settings s
                            WHERE s.organization_id = p.organization_id
                              AND s.sgq_organization_id = i.organization_id))));

DROP POLICY IF EXISTS quality_project_exclusions_delete ON public.quality_project_exclusions;
CREATE POLICY quality_project_exclusions_delete ON public.quality_project_exclusions
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND (p.organization_id = i.organization_id
                OR EXISTS (SELECT 1 FROM public.quality_settings s
                            WHERE s.organization_id = p.organization_id
                              AND s.sgq_organization_id = i.organization_id))));

-- ── 6. Quem executa ─────────────────────────────────────────────────────────
-- Todas são funções de gatilho: o PostgREST não as expõe e chamá-las fora de um
-- gatilho dá erro. Mesmo assim, nada para PUBLIC/anon.

REVOKE EXECUTE ON FUNCTION public.quality_settings_sgq_valido() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_settings_sgq_valido() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.quality_controlled_items_mesma_org() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_controlled_items_mesma_org() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_orders_servico_controlado_do_sgq() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_orders_servico_controlado_do_sgq() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.oe_checklist_responses_copia_ficha() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.oe_checklist_responses_copia_ficha() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.oe_checklist_responses_grava_historico() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.oe_checklist_responses_grava_historico() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.non_conformances_servico_controlado() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.non_conformances_servico_controlado() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.non_conformances_grava_historico() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.non_conformances_grava_historico() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.non_conformances_eficacia_autor() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.non_conformances_eficacia_autor() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.qualidade_bloqueia_exclusao_direta() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.qualidade_bloqueia_exclusao_direta() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_orders_bloqueia_exclusao_controlada() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_orders_bloqueia_exclusao_controlada() TO authenticated;

COMMIT;
