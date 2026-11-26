-- =============================================================================
-- Qualidade (SiAC / PBQP-H) — fase 2: ajustes da revisão final do ramo.
-- Plano:  docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md.
-- Desenho: docs/planos/2026-11-25-qualidade-siac-pbqph.md ("Fase 2 — desenho").
-- Consome: aplicar_20271126100000 (estrutura), aplicar_20271126110000 (regras),
--          aplicar_20271126120000 (motivo da eficácia).
--
-- ⚠️ REAPLICAR NA ORDEM: as quatro migrations da fase 2 redefinem as mesmas funções.
--    Reaplicar uma antiga depois de uma nova DESFAZ a nova. A ordem é sempre
--    100000 → 110000 → 120000 → 130000. A 100000 e a 110000 têm guarda (DO no topo)
--    que recusa reaplicar sozinha; para reaplicar de propósito, um arquivo só com
--    `SET qualidade.reaplicar_fase2_na_ordem = 'on';` seguido das quatro, na ordem.
--    Esta (130000) é idempotente e pode ser reaplicada sozinha.
--
-- O que muda aqui (cada item fecha um achado da revisão final):
--   1. Ficha obrigatória na OE de serviço controlado. _oe_portoes (110000) contava só
--      os itens da ficha que a OE tinha — OE controlada SEM ficha (ou com outra ficha,
--      ou com ficha sem item obrigatório) ia para inspeção e era aprovada, e contava
--      como "aplicado com registro". Agora, em pending_inspection (e na reconferência
--      da RPC ao aprovar), OE controlada exige: o serviço tem ficha; a ficha da OE é a
--      ficha do serviço; a ficha tem ≥ 1 item obrigatório ativo.
--   2. Permissão na organização DONA DO SERVIÇO. canInspectQualitySystem /
--      canReleaseQualitySystem eram conferidas em _qualidade_sgq_da_org(org da OE):
--      o admin da SPE desfazia o SGQ e passava a responder/aprovar OEs que apontam
--      para serviços da Alpa (contando no painel da Alpa). Agora são conferidas em
--      quality_controlled_items.organization_id (nova _qualidade_pode_no_servico) —
--      no gatilho da resposta, no gatilho da validação e na RPC.
--   3. Desfazer/trocar o SGQ exige TAMBÉM dono/admin da organização dona do SGQ
--      ATUAL (OLD.sgq_organization_id), além do dono/admin da SPE (100000 só pedia o
--      da SPE e o do destino novo).
--
-- REGRA #7:
--   Pergunta 1 — nenhuma policy nova nem alterada.
--   Pergunta 2 — funções:
--     • _qualidade_pode_no_servico(serviço, chave) — NOVA, SECURITY DEFINER: lê a org
--       do serviço sem depender da RLS de quem chama (quem é só da SPE não lê o
--       serviço da Alpa; NULL = só superadmin passaria, o que fecha certo, mas a
--       resposta tem de ser a da org dona). Só diz se o PRÓPRIO usuário (auth.uid())
--       tem a chave na org dona do serviço — um booleano sobre si mesmo; para quem
--       não é membro dessa org é sempre false (não distingue serviço inexistente).
--       REVOKE FROM PUBLIC, anon + GRANT authenticated.
--     • _oe_portoes — redefinida; continua SEM EXECUTE para authenticated (só as
--       DEFINER que conferem o acesso a chamam).
--     • oe_checklist_responses_exige_inspetor, work_order_validations_inspecao_controlada
--       (INVOKER, gatilho), quality_aprovar_inspecao (DEFINER, confere dentro),
--       quality_settings_sgq_valido (DEFINER, gatilho) — redefinidas, mesmo ACL.
--
-- Idempotente (CREATE OR REPLACE). Aplicar com `npx supabase db query --linked -f`
-- — nunca `db push`.
-- =============================================================================

SET lock_timeout = '3s';

BEGIN;

-- ── 0. Pré-requisito: 110000 aplicada ───────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public._oe_portoes(uuid, text, text, uuid, uuid, uuid[])') IS NULL
       OR to_regclass('public.work_order_validation_history') IS NULL THEN
        RAISE EXCEPTION 'Aplique antes aplicar_20271126100000, 110000 e 120000 (na ordem).';
    END IF;
END $$;

-- ── 1. Permissão na organização dona do serviço controlado ──────────────────
-- O PRÓPRIO usuário pode <chave> na org dona do serviço p_controlled_item_id?
-- _qualidade_pode(org do serviço, chave): superadmin, dono/admin ou a chave ligada.
CREATE OR REPLACE FUNCTION public._qualidade_pode_no_servico(p_controlled_item_id uuid, p_chave text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public._qualidade_pode(
        (SELECT i.organization_id FROM public.quality_controlled_items i
          WHERE i.id = p_controlled_item_id),
        p_chave)
$$;

-- ── 2. Portões: ficha obrigatória na OE controlada ──────────────────────────
-- Igual à 110000 + o bloco "ficha do serviço" em pending_inspection. A RPC reconfere
-- pending_inspection ao aprovar, então a mesma régua vale para "Aprovar inspeção".
CREATE OR REPLACE FUNCTION public._oe_portoes(
    p_work_order_id      uuid,
    p_status_atual       text,
    p_novo_status        text,
    p_template_id        uuid,
    p_controlled_item_id uuid,
    p_collaborator_ids   uuid[])
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_msgs          text[] := ARRAY[]::text[];
    v_n             integer;
    v_corte         timestamptz;
    v_ficha_servico uuid;
BEGIN
    -- "Antes de iniciar": em released e de novo em pending_inspection (UPDATE
    -- direto planned → in_progress pulava o portão de released).
    IF p_novo_status IN ('released', 'pending_inspection') THEN
        SELECT count(*) INTO v_n
          FROM public.oe_checklist_items i
          LEFT JOIN public.oe_checklist_responses r
                 ON r.work_order_id = p_work_order_id AND r.item_id = i.id
         WHERE i.template_id = p_template_id
           AND i.ativo AND i.required AND i.gate = 'pre_start'
           AND NOT coalesce(r.response_status = 'conforme'
                            OR (r.response_status = 'nao_aplicavel' AND btrim(coalesce(r.notes, '')) <> ''),
                            false);
        IF v_n > 0 THEN
            v_msgs := v_msgs || format('%s itens obrigatórios do checklist antes de iniciar não cumpridos', v_n);
        END IF;
    END IF;

    IF p_novo_status = 'pending_inspection' THEN
        -- Ficha do serviço controlado (revisão final): sem ela a inspeção não tem o que
        -- verificar e contaria como "aplicado com registro".
        IF p_controlled_item_id IS NOT NULL THEN
            SELECT q.checklist_template_id INTO v_ficha_servico
              FROM public.quality_controlled_items q
             WHERE q.id = p_controlled_item_id;
            IF v_ficha_servico IS NULL THEN
                v_msgs := v_msgs || 'Serviço controlado sem ficha de verificação — crie a ficha do serviço na Qualidade'::text;
            ELSIF p_template_id IS DISTINCT FROM v_ficha_servico THEN
                v_msgs := v_msgs || 'A ficha da OE não é a ficha do serviço controlado — aplique a ficha do serviço na OE'::text;
            ELSIF NOT EXISTS (
                SELECT 1 FROM public.oe_checklist_items i
                 WHERE i.template_id = v_ficha_servico AND i.ativo AND i.required) THEN
                v_msgs := v_msgs || 'Serviço controlado sem ficha de verificação — a ficha do serviço não tem item obrigatório ativo'::text;
            END IF;
        END IF;

        SELECT count(*) INTO v_n
          FROM public.oe_checklist_items i
          LEFT JOIN public.oe_checklist_responses r
                 ON r.work_order_id = p_work_order_id AND r.item_id = i.id
         WHERE i.template_id = p_template_id
           AND i.ativo AND i.required AND i.gate = 'pre_completion'
           AND NOT coalesce(r.response_status = 'conforme'
                            OR (r.response_status = 'nao_aplicavel' AND btrim(coalesce(r.notes, '')) <> ''),
                            false);
        IF v_n > 0 THEN
            v_msgs := v_msgs || format('%s itens obrigatórios do checklist antes de concluir não cumpridos', v_n);
        END IF;

        SELECT count(*) INTO v_n
          FROM public.non_conformances nc
         WHERE nc.work_order_id = p_work_order_id
           AND nc.status IN ('open', 'in_treatment');
        IF v_n > 0 THEN
            v_msgs := v_msgs || format('%s não conformidade(s) em aberto', v_n);
        END IF;

        IF p_controlled_item_id IS NOT NULL AND coalesce(cardinality(p_collaborator_ids), 0) = 0 THEN
            v_msgs := v_msgs || 'Informe quem executou o serviço controlado'::text;
        END IF;
    END IF;

    IF p_novo_status = 'approved'
       OR (p_novo_status = 'rejected' AND p_controlled_item_id IS NOT NULL) THEN
        -- A inspeção aprovada (ou reprovada) vale UMA vez: posterior à última entrada
        -- em pending_inspection, approved ou rejected do histórico de status.
        SELECT max(l.created_at) INTO v_corte
          FROM public.work_order_status_log l
         WHERE l.work_order_id = p_work_order_id
           AND l.new_status IN ('pending_inspection', 'approved', 'rejected');
        IF NOT EXISTS (
            SELECT 1 FROM public.work_order_validations v
             WHERE v.work_order_id = p_work_order_id
               AND v.type = 'inspection' AND v.status = p_novo_status
               AND (v_corte IS NULL OR v.created_at > v_corte)) THEN
            v_msgs := v_msgs || CASE p_novo_status
                WHEN 'approved' THEN 'Registro de inspeção aprovada não encontrado — use "Aprovar inspeção"'
                ELSE 'Registro de inspeção reprovada não encontrado — use "Aprovar inspeção"' END;
        END IF;
    END IF;

    -- Medir/encerrar sem passar pela aprovação pularia a inspeção.
    IF p_novo_status = 'measured' AND p_status_atual IS DISTINCT FROM 'approved' THEN
        v_msgs := v_msgs || 'A OE só pode ser medida depois da inspeção aprovada'::text;
    END IF;
    IF p_novo_status = 'closed' AND p_status_atual IS DISTINCT FROM 'measured' THEN
        v_msgs := v_msgs || 'A OE só pode ser encerrada depois de medida'::text;
    END IF;

    RETURN v_msgs;
END;
$$;

-- ── 3. Responder a ficha: canInspectQualitySystem na org do SERVIÇO ─────────
CREATE OR REPLACE FUNCTION public.oe_checklist_responses_exige_inspetor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ctrl uuid;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    SELECT wo.controlled_item_id INTO v_ctrl
      FROM public.work_orders wo
     WHERE wo.id = NEW.work_order_id;

    IF v_ctrl IS NOT NULL
       AND NOT public._qualidade_pode_no_servico(v_ctrl, 'canInspectQualitySystem') THEN
        RAISE EXCEPTION 'Sem permissão para inspecionar serviço controlado'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- ── 4. Validação de inspeção: canReleaseQualitySystem na org do SERVIÇO ─────
CREATE OR REPLACE FUNCTION public.work_order_validations_inspecao_controlada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ctrl uuid;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND pg_trigger_depth() = 1
       AND OLD.type = 'inspection'
       AND EXISTS (SELECT 1 FROM public.work_orders wo
                    WHERE wo.id = OLD.work_order_id AND wo.controlled_item_id IS NOT NULL) THEN
        RAISE EXCEPTION 'A validação de inspeção de uma OE de serviço controlado não pode ser alterada nem apagada.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_at := clock_timestamp();
    ELSE
        NEW.created_at := OLD.created_at;
        IF pg_trigger_depth() > 1 THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.type = 'inspection' AND NEW.status IN ('approved', 'rejected') THEN
        SELECT wo.controlled_item_id INTO v_ctrl
          FROM public.work_orders wo
         WHERE wo.id = NEW.work_order_id;
        IF v_ctrl IS NOT NULL THEN
            IF coalesce(current_setting('qualidade.via_rpc', true), '') <> 'on' THEN
                RAISE EXCEPTION 'A inspeção de serviço controlado só se aprova ou reprova pela ação "Aprovar inspeção".'
                    USING ERRCODE = '42501';
            END IF;
            IF NOT public._qualidade_pode_no_servico(v_ctrl, 'canReleaseQualitySystem') THEN
                RAISE EXCEPTION 'Sem permissão para aprovar a inspeção de serviço controlado'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ── 5. "Aprovar inspeção": canReleaseQualitySystem na org do SERVIÇO ────────
-- Igual à 110000, trocando a régua de permissão. A reconferência do portão de
-- pending_inspection (ao aprovar) já traz a ficha obrigatória (bloco 2).
CREATE OR REPLACE FUNCTION public.quality_aprovar_inspecao(p_work_order_id uuid, p_aprovar boolean, p_notas text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid        uuid := auth.uid();
    v_wo         public.work_orders%ROWTYPE;
    v_course     uuid;
    v_revisao    text;
    v_versao_id  uuid;
    v_versao_em  timestamptz;
    v_executores jsonb;
    v_novo       text;
    v_id         uuid;
    v_notas      text := nullif(btrim(coalesce(p_notas, '')), '');
    v_msgs       text[];
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sem usuário na requisição.' USING ERRCODE = '42501';
    END IF;
    IF p_aprovar IS NULL THEN
        RAISE EXCEPTION 'Informe se a inspeção foi aprovada ou reprovada.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_wo FROM public.work_orders wo WHERE wo.id = p_work_order_id FOR UPDATE;
    IF NOT FOUND
       OR NOT (public.is_superadmin()
               OR COALESCE(v_wo.org_id IN (SELECT public.minhas_orgs_membro()), false)) THEN
        RAISE EXCEPTION 'OE não encontrada ou sem acesso.' USING ERRCODE = '42501';
    END IF;

    IF v_wo.status IS DISTINCT FROM 'pending_inspection' THEN
        RAISE EXCEPTION 'A OE não está aguardando inspeção.' USING ERRCODE = 'P0001';
    END IF;

    IF NOT p_aprovar AND v_notas IS NULL THEN
        RAISE EXCEPTION 'Para reprovar a inspeção, descreva o motivo.' USING ERRCODE = '22023';
    END IF;

    -- Permissão antes do portão: quem não pode aprovar não fica sabendo do estado da ficha.
    IF v_wo.controlled_item_id IS NOT NULL
       AND NOT public._qualidade_pode_no_servico(v_wo.controlled_item_id, 'canReleaseQualitySystem') THEN
        RAISE EXCEPTION 'Sem permissão para aprovar a inspeção de serviço controlado'
            USING ERRCODE = '42501';
    END IF;

    -- Aprovar reconfere, no momento, o portão de pending_inspection (ficha do serviço,
    -- NC aberta ou item desfeito DEPOIS do pedido de inspeção; executores). Reprovar não.
    IF p_aprovar THEN
        v_msgs := public._oe_portoes(v_wo.id, 'in_progress', 'pending_inspection', v_wo.checklist_template_id,
                                     v_wo.controlled_item_id, v_wo.collaborator_ids);
        IF coalesce(cardinality(v_msgs), 0) > 0 THEN
            RAISE EXCEPTION '%', array_to_string(v_msgs, '; ') USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF v_wo.controlled_item_id IS NOT NULL THEN
        SELECT q.training_course_id, d.revisao, d.active_version_id, ver.created_at
          INTO v_course, v_revisao, v_versao_id, v_versao_em
          FROM public.quality_controlled_items q
          LEFT JOIN public.opura_documents d           ON d.id = q.procedure_document_id
          LEFT JOIN public.opura_document_versions ver ON ver.id = d.active_version_id
         WHERE q.id = v_wo.controlled_item_id;

        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'employee_id', c.eid,
                   'nome',        e.name,
                   'treinado',    public._qualidade_treinado_na_revisao(c.eid, v_course, v_versao_em))
                   ORDER BY c.ord), '[]'::jsonb)
          INTO v_executores
          FROM unnest(coalesce(v_wo.collaborator_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS c(eid, ord)
          LEFT JOIN public.employees e ON e.id = c.eid;
    END IF;

    v_novo := CASE WHEN p_aprovar THEN 'approved' ELSE 'rejected' END;

    PERFORM set_config('qualidade.via_rpc', 'on', true);
    INSERT INTO public.work_order_validations (
        work_order_id, type, status, notes, liberado_por, liberado_em,
        executores, procedimento_revisao, procedimento_versao_id)
    VALUES (
        v_wo.id, 'inspection', v_novo, v_notas, v_uid, now(),
        v_executores, v_revisao, v_versao_id)
    RETURNING id INTO v_id;
    PERFORM set_config('qualidade.via_rpc', '', true);

    UPDATE public.work_orders SET status = v_novo WHERE id = v_wo.id;

    INSERT INTO public.work_order_status_log (work_order_id, previous_status, new_status, changed_by_id, reason)
    VALUES (v_wo.id, v_wo.status, v_novo,
            (SELECT e.id FROM public.employees e
              WHERE e.user_id = v_uid AND e.org_id = v_wo.org_id
              ORDER BY e.created_at LIMIT 1),
            v_notas);

    RETURN v_id;
END;
$$;

-- ── 6. SGQ: desfazer/trocar exige também o dono/admin do SGQ ATUAL ──────────
-- Igual à 100000 (4.1) + a perna do SGQ atual: deixar de usar (DELETE da linha que
-- aponta, UPDATE para NULL ou para outra org) exige dono/admin da org dona do SGQ de
-- ANTES — senão o admin da SPE muda sozinho de quem é a permissão sobre os registros
-- da Alpa. Cascata (org apagada, pg_trigger_depth() > 1) passa.
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
        IF OLD.sgq_organization_id IS NOT NULL THEN
            IF NOT (v_super OR public.is_org_manager(OLD.organization_id)) THEN
                RAISE EXCEPTION 'Só o dono ou um administrador da organização pode deixar de usar o sistema da qualidade de outra.'
                    USING ERRCODE = '42501';
            END IF;
            IF NOT (v_super OR public.is_org_manager(OLD.sgq_organization_id)) THEN
                RAISE EXCEPTION 'Só o dono ou um administrador da organização dona do sistema da qualidade atual pode desfazer o vínculo.'
                    USING ERRCODE = '42501';
            END IF;
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
    -- Revisão final: o SGQ de antes também tem de concordar em soltar.
    IF TG_OP = 'UPDATE' AND OLD.sgq_organization_id IS NOT NULL
       AND NOT (v_super OR public.is_org_manager(OLD.sgq_organization_id)) THEN
        RAISE EXCEPTION 'Só o dono ou um administrador da organização dona do sistema da qualidade atual pode desfazer ou trocar o vínculo.'
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

-- ── 7. Quem executa ─────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public._qualidade_pode_no_servico(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._qualidade_pode_no_servico(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._oe_portoes(uuid, text, text, uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._oe_portoes(uuid, text, text, uuid, uuid, uuid[]) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public._oe_portoes(uuid, text, text, uuid, uuid, uuid[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.oe_checklist_responses_exige_inspetor() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.oe_checklist_responses_exige_inspetor() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_order_validations_inspecao_controlada() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_order_validations_inspecao_controlada() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.quality_aprovar_inspecao(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_aprovar_inspecao(uuid, boolean, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.quality_settings_sgq_valido() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_settings_sgq_valido() TO authenticated;

COMMIT;
