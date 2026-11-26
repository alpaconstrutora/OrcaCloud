-- =============================================================================
-- Qualidade (SiAC / PBQP-H) — fase 2: regras no banco (portões, permissões,
-- "Aprovar inspeção").
-- Plano:  docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md (Task 2).
-- Desenho: docs/planos/2026-11-25-qualidade-siac-pbqph.md ("Fase 2 — desenho").
-- Consome: aplicar_20271126100000_qualidade_fase2_estrutura.sql (Task 1).
--
-- O que nasce aqui:
--   • _qualidade_sgq_da_org(org) — a organização dona do SGQ (coalesce(sgq, org)).
--   • _qualidade_pode(org, chave) — superadmin, dono/admin da org ou a chave
--     (canInspectQualitySystem / canReleaseQualitySystem) ligada no membro.
--   • _qualidade_treinado_na_revisao(colaborador, curso, versão_em) — regra da
--     fase 1 (dia posterior ao da versão ativa, ou mesmo dia registrado depois)
--     + validade vencida não conta.
--   • _qualidade_oe_tem_registro(OE) — resposta, histórico de resposta, NC,
--     validação ou histórico de validação.
--   • oe_portoes(OE, status novo) — os portões do checklist/NC/executores/inspeção
--     (o resto — equipe, responsável, datas, custo, predecessora, % — fica no app).
--   • Gatilho de status em work_orders: portão não vazio → P0001 com as mensagens.
--   • Gatilho em oe_checklist_responses: OE controlada exige canInspectQualitySystem
--     na org do SGQ.
--   • Gatilho em work_order_validations: inspeção aprovada/reprovada de OE
--     controlada só pela RPC e com canReleaseQualitySystem; validação de inspeção
--     de OE controlada não se altera nem se apaga direto; histórico
--     (work_order_validation_history).
--   • quality_aprovar_inspecao(OE, aprovar, notas) — a ação "Aprovar inspeção".
--   • Determinações carregadas da Task 1: (i) serviço controlado com OE que tem
--     registro não se apaga direto; (ii) acima; (iii) a ficha (checklist_template_id)
--     de OE controlada com registro não se troca.
--
-- A mais do que o brief (cada uma fecha um desvio do portão "approved"):
--   • oe_portoes é SECURITY DEFINER (o brief dizia INVOKER): a ficha da OE da SPE é
--     o modelo da org do SGQ (Alpa), e a RLS de oe_checklist_items esconde esses
--     itens de quem é só da SPE — com INVOKER o portão contaria 0 itens e
--     passaria. Autoriza dentro: membro da org da OE ou superadmin.
--   • Inspeção aprovada vale UMA vez: o corte é a última entrada de
--     work_order_status_log em pending_inspection, approved ou rejected (a RPC
--     grava 'approved' depois da validação). Sem isso, OE aprovada voltava a
--     in_progress → pending_inspection por UPDATE direto e se reaprovava com a
--     validação antiga.
--   • work_order_status_log: created_at é do banco (clock_timestamp()) e a linha
--     de OE controlada não se altera nem se apaga direto (o corte acima depende
--     dela; a policy é FOR ALL para qualquer membro). created_at da validação
--     também é do banco.
--   • 'measured' só a partir de 'approved' e 'closed' só a partir de 'measured'
--     (senão bastava UPDATE status='measured' para pular a inspeção).
--   • pending_inspection também confere os itens "antes de iniciar" (UPDATE
--     direto planned → in_progress pulava o portão de released).
--   • Bloquear grava status_before_block pelo banco (o status de antes); só o
--     desbloqueio que volta a ele pula o portão (senão: bloquear, forjar
--     status_before_block = 'approved' e desbloquear).
--
-- REGRA #7:
--   Pergunta 1 — policy nova (só SELECT): work_order_validation_history pela OE
--   (org da OE em minhas_orgs_membro()). Sem OR. Sem policy de escrita (e sem o
--   privilégio).
--   Pergunta 2 — ver o bloco 9 (quem executa cada função e por que DEFINER/INVOKER).
--
-- Correção 1 (revisão, 26/11):
--   • 'rejected' de OE controlada só com validação inspection/rejected posterior ao
--     corte (= só pela RPC, com permissão e motivo) — espelho do 'approved'.
--   • work_orders_servico_controlado_do_sgq (Task 1) redefinida aqui: o serviço
--     controlado não se troca, retira NEM ATRIBUI em UPDATE direto com a OE em
--     inspeção/aprovada/reprovada/medida/encerrada (ou bloqueada vinda de um
--     desses) nem com registro (_qualidade_oe_tem_registro, nos dois sentidos) —
--     senão: desligar o serviço, aprovar como OE comum e religar. Apagar o serviço
--     controlado segue a mesma régua (o SET NULL soltaria a OE).
--   • A RPC, para aprovar, reconfere o portão de pending_inspection no momento
--     (NC aberta / item desfeito depois do pedido de inspeção).
--   • Membro conferido com COALESCE(… IN minhas_orgs_membro(), false).
--   • work_order_validation_history.created_at DEFAULT clock_timestamp().
--   • _qualidade_sgq_da_org devolve NULL (não erro) a quem não é membro da org
--     nem do SGQ dela (nem superadmin) — NULL fecha: _qualidade_pode(NULL, …) = false.
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
--    Esta 110000 regride, se reaplicada depois da 130000: _oe_portoes (ficha
--    obrigatória), os gatilhos da resposta e da validação e quality_aprovar_inspecao
--    (permissão na org do serviço). A guarda detecta a 130000 pela função
--    _qualidade_pode_no_servico (criada lá); antes dela, reaplicar sozinha segue
--    idempotente como era.
-- =============================================================================

SET lock_timeout = '3s';

BEGIN;

-- ── 0. Guarda de reaplicação ───────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public._qualidade_pode_no_servico(uuid, text)') IS NOT NULL
       AND coalesce(current_setting('qualidade.reaplicar_fase2_na_ordem', true), '') <> 'on' THEN
        RAISE EXCEPTION 'Migration já superada por 130000 — reaplicar as quatro NA ORDEM (100000 → 110000 → 120000 → 130000)';
    END IF;
END $$;

-- ── 1. Histórico da validação ──────────────────────────────────────────────
-- Mesmo desenho dos históricos da Task 1: DESACOPLADO da linha-mãe
-- (validation_id ON DELETE SET NULL — a linha fica, órfã, com o work_order_id);
-- work_order_id SEM FK de propósito (a exclusão da OE apaga a validação por
-- cascata e o BEFORE DELETE grava a linha de exclusão no mesmo comando — a FK para
-- work_orders já apagada derrubaria a exclusão). Grava o estado NOVO na criação e
-- a cada mudança, e o último na exclusão; alterado_por pelo gatilho.
CREATE TABLE IF NOT EXISTS public.work_order_validation_history (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id          uuid REFERENCES public.work_order_validations(id) ON DELETE SET NULL,
    work_order_id          uuid NOT NULL,
    type                   text,
    status                 text,
    notes                  text,
    approved_by_id         uuid,
    liberado_por           uuid,
    liberado_em            timestamptz,
    executores             jsonb,
    procedimento_revisao   text,
    procedimento_versao_id uuid,
    evento                 text NOT NULL DEFAULT 'criacao',
    alterado_por           uuid DEFAULT auth.uid(),
    created_at             timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Correção 1: quem já aplicou a 1ª versão (DEFAULT now()).
ALTER TABLE public.work_order_validation_history ALTER COLUMN created_at SET DEFAULT clock_timestamp();

ALTER TABLE public.work_order_validation_history
    DROP CONSTRAINT IF EXISTS work_order_validation_history_evento_check;
ALTER TABLE public.work_order_validation_history
    ADD CONSTRAINT work_order_validation_history_evento_check
    CHECK (evento IN ('criacao', 'alteracao', 'exclusao'));

CREATE INDEX IF NOT EXISTS idx_work_order_validation_history_validation
    ON public.work_order_validation_history (validation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_work_order_validation_history_wo
    ON public.work_order_validation_history (work_order_id);

COMMENT ON TABLE public.work_order_validation_history IS
    'Qualidade (SiAC): cada criação/mudança/exclusão de validação da OE — o estado (novo na criação/mudança, '
    'o último na exclusão), com quem (alterado_por) e quando. Gravada pelo banco; só leitura para o app.';
COMMENT ON COLUMN public.work_order_validation_history.evento IS
    'criacao = a validação nasceu; alteracao = mudou (linha = o estado novo); exclusao = foi apagada (linha = o último estado).';

ALTER TABLE public.work_order_validation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_order_validation_history_select ON public.work_order_validation_history;
CREATE POLICY work_order_validation_history_select ON public.work_order_validation_history
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_validation_history.work_order_id
           AND wo.org_id IN (SELECT public.minhas_orgs_membro())));

REVOKE ALL ON public.work_order_validation_history FROM anon;
REVOKE ALL ON public.work_order_validation_history FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.work_order_validation_history FROM authenticated;
GRANT SELECT ON public.work_order_validation_history TO authenticated;

-- ── 2. Ajudantes ────────────────────────────────────────────────────────────

-- Organização dona do SGQ que vale para p_org. SECURITY DEFINER: decisão de
-- autorização não pode depender da RLS de quem chama (linha escondida = a própria
-- org = permissão conferida no lugar errado). Devolve só um id de organização.
-- Correção 1: só responde a quem é membro de p_org ou do SGQ dela, superadmin, ou
-- a chamada sem usuário (service_role/postgres); aos demais devolve NULL — e NULL
-- fecha (_qualidade_pode(NULL, …) só é verdadeiro para superadmin).
CREATE OR REPLACE FUNCTION public._qualidade_sgq_da_org(p_org uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
               WHEN auth.uid() IS NULL
                 OR public.is_superadmin()
                 OR COALESCE(p_org IN (SELECT public.minhas_orgs_membro()), false)
                 OR COALESCE(x.sgq IN (SELECT public.minhas_orgs_membro()), false)
               THEN x.sgq
           END
      FROM (SELECT coalesce(
                       (SELECT s.sgq_organization_id FROM public.quality_settings s
                         WHERE s.organization_id = p_org),
                       p_org) AS sgq) x
$$;

-- O PRÓPRIO usuário (auth.uid()) pode <chave> em p_org? Superadmin, dono/admin ou
-- a chave ligada em organization_members.permissions. Modelo: _diretoria_pode.
-- Só responde sobre quem chama.
CREATE OR REPLACE FUNCTION public._qualidade_pode(p_org uuid, p_chave text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.is_superadmin()
        OR (p_org IS NOT NULL AND auth.uid() IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.organization_members m
                         WHERE m.organization_id = p_org
                           AND m.user_id = auth.uid()
                           AND (m.role IN ('owner', 'admin')
                                OR COALESCE(m.permissions ->> p_chave, 'false') = 'true')))
$$;

-- Treinado na revisão vigente (utils/qualidadeSiac.ts treinamentoVigente):
-- registro aprovado no curso, realizado num dia posterior ao da versão ativa (dia
-- em UTC, como o slice(0,10) do app), ou no mesmo dia e registrado (created_at)
-- depois dela. Sem versão ativa = não treinado. Validade: só deixa de contar se
-- data_validade existe e é anterior a hoje (data de São Paulo); o status VENCIDO
-- sozinho não tira. INVOKER: fora da RPC, lê com a RLS de quem chama.
CREATE OR REPLACE FUNCTION public._qualidade_treinado_na_revisao(
    p_employee uuid, p_course uuid, p_versao_em timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT p_employee IS NOT NULL AND p_course IS NOT NULL AND p_versao_em IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.employee_trainings t
            WHERE t.employee_id = p_employee
              AND t.course_id   = p_course
              AND t.aprovado IS TRUE
              AND (t.data_validade IS NULL
                   OR t.data_validade >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
              AND (t.data_realizacao > (p_versao_em AT TIME ZONE 'UTC')::date
                   OR (t.data_realizacao = (p_versao_em AT TIME ZONE 'UTC')::date
                       AND t.created_at >= p_versao_em)))
$$;

-- REGISTRO de inspeção da OE: a régua da Task 1 (resposta, histórico de resposta,
-- NC, validação) + o histórico da validação. INVOKER: dentro de função DEFINER
-- enxerga tudo; num gatilho INVOKER, o que a RLS de quem grava deixa (tudo pela OE).
CREATE OR REPLACE FUNCTION public._qualidade_oe_tem_registro(p_work_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (SELECT 1 FROM public.oe_checklist_responses r WHERE r.work_order_id = p_work_order_id)
        OR EXISTS (SELECT 1 FROM public.oe_checklist_response_history h WHERE h.work_order_id = p_work_order_id)
        OR EXISTS (SELECT 1 FROM public.non_conformances nc WHERE nc.work_order_id = p_work_order_id)
        OR EXISTS (SELECT 1 FROM public.work_order_validations v WHERE v.work_order_id = p_work_order_id)
        OR EXISTS (SELECT 1 FROM public.work_order_validation_history vh WHERE vh.work_order_id = p_work_order_id)
$$;

-- ── 3. Portões ─────────────────────────────────────────────────────────────
-- _oe_portoes recebe os valores da OE (o gatilho passa o NEW: um UPDATE pode
-- trocar ficha/executores junto com o status). NÃO é executável por
-- authenticated — só pelas duas funções DEFINER abaixo, que conferem o acesso;
-- se fosse, qualquer um contaria itens de ficha de outra org passando o id.
-- "Cumprido" = conforme, ou nao_aplicavel com notes não vazio; sem resposta,
-- parcial e nao_conforme = não cumprido; item inativo não conta.
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
    v_msgs  text[] := ARRAY[]::text[];
    v_n     integer;
    v_corte timestamptz;
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
        -- A inspeção aprovada (ou reprovada) vale UMA vez: tem de ser posterior à
        -- última entrada em pending_inspection, approved ou rejected do histórico de
        -- status (a RPC grava o status novo depois da validação — ela não serve
        -- para a próxima volta).
        -- Correção 1: 'rejected' de OE controlada exige a validação reprovada (que
        -- só a RPC grava, com permissão, motivo e liberado_por) — espelho do
        -- 'approved'. 'rejected' de OE comum segue livre, como antes.
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

-- Para o app mostrar o motivo antes de tentar. DEFINER (cabeçalho: a ficha da
-- OE da SPE é da org do SGQ); confere dentro: membro da org da OE ou superadmin —
-- senão 42501, sem dizer se a OE existe.
CREATE OR REPLACE FUNCTION public.oe_portoes(p_work_order_id uuid, p_novo_status text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_wo public.work_orders%ROWTYPE;
BEGIN
    SELECT * INTO v_wo FROM public.work_orders wo WHERE wo.id = p_work_order_id;
    IF NOT FOUND
       OR NOT (public.is_superadmin()
               OR COALESCE(v_wo.org_id IN (SELECT public.minhas_orgs_membro()), false)) THEN
        RAISE EXCEPTION 'OE não encontrada ou sem acesso.' USING ERRCODE = '42501';
    END IF;
    RETURN public._oe_portoes(v_wo.id, v_wo.status, p_novo_status, v_wo.checklist_template_id,
                              v_wo.controlled_item_id, v_wo.collaborator_ids);
END;
$$;

-- Gatilho: status que não passa no portão não grava (P0001, mensagens por "; ").
-- DEFINER pelo mesmo motivo de oe_portoes; autorização: o UPDATE/INSERT já passou
-- pela RLS de quem grava; não recebe parâmetro.
-- Bloquear: o banco grava status_before_block (o status de antes) e não deixa
-- trocá-lo com a OE bloqueada. Desbloquear (blocked → esse status) não passa por
-- portão — qualquer outra saída de blocked passa.
CREATE OR REPLACE FUNCTION public.work_orders_portoes_de_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_msgs text[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'blocked' THEN
            NEW.status_before_block := NULL;  -- desbloquear volta para planned
            RETURN NEW;
        END IF;
        v_msgs := public._oe_portoes(NEW.id, NULL, NEW.status, NEW.checklist_template_id,
                                     NEW.controlled_item_id, NEW.collaborator_ids);
    ELSE
        IF NEW.status = 'blocked' THEN
            IF OLD.status IS DISTINCT FROM 'blocked' THEN
                NEW.status_before_block := CASE
                    WHEN OLD.status IN ('planned', 'released', 'in_progress', 'pending_inspection',
                                        'approved', 'rejected', 'measured') THEN OLD.status
                    ELSE NULL END;
            ELSE
                NEW.status_before_block := OLD.status_before_block;
            END IF;
            RETURN NEW;
        END IF;

        IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
            RETURN NEW;
        END IF;

        IF OLD.status = 'blocked'
           AND NEW.status IS NOT DISTINCT FROM coalesce(OLD.status_before_block, 'planned') THEN
            RETURN NEW;
        END IF;

        v_msgs := public._oe_portoes(NEW.id, OLD.status, NEW.status, NEW.checklist_template_id,
                                     NEW.controlled_item_id, NEW.collaborator_ids);
    END IF;

    IF coalesce(cardinality(v_msgs), 0) > 0 THEN
        RAISE EXCEPTION '%', array_to_string(v_msgs, '; ') USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_orders_portoes_de_status ON public.work_orders;
CREATE TRIGGER trg_work_orders_portoes_de_status
    BEFORE INSERT OR UPDATE OF status, status_before_block ON public.work_orders
    FOR EACH ROW EXECUTE FUNCTION public.work_orders_portoes_de_status();

-- ── 4. Histórico de status: o corte do portão "approved" ───────────────────
-- created_at é do banco (clock_timestamp(): ordem real mesmo dentro de uma
-- transação; o app não antedata nem pós-data). Linha de OE de serviço controlado
-- não se altera nem se apaga direto (a policy é FOR ALL para qualquer membro —
-- apagar a entrada 'approved' reabriria a validação já usada). Cascata (OE
-- apagada; changed_by_id SET NULL quando o colaborador é apagado) passa.
-- INVOKER: quem mexe na linha enxerga a OE (a RLS do log passa por ela).
CREATE OR REPLACE FUNCTION public.work_order_status_log_protege()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := clock_timestamp();
        RETURN NEW;
    END IF;

    IF pg_trigger_depth() = 1
       AND (EXISTS (SELECT 1 FROM public.work_orders wo
                     WHERE wo.id = OLD.work_order_id AND wo.controlled_item_id IS NOT NULL)
            OR (TG_OP = 'UPDATE'
                AND EXISTS (SELECT 1 FROM public.work_orders wo
                             WHERE wo.id = NEW.work_order_id AND wo.controlled_item_id IS NOT NULL))) THEN
        RAISE EXCEPTION 'O histórico de status de uma OE de serviço controlado não pode ser alterado nem apagado.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_order_status_log_protege ON public.work_order_status_log;
CREATE TRIGGER trg_work_order_status_log_protege
    BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_status_log
    FOR EACH ROW EXECUTE FUNCTION public.work_order_status_log_protege();

-- ── 5. Responder a ficha de OE controlada exige canInspectQualitySystem ────
-- Conferida na org DONA DO SGQ da org da OE. INVOKER: lê a OE com a RLS de quem
-- grava (OE invisível = a RLS da resposta já recusa). Cascata (nc_id /
-- completed_by_id SET NULL) passa.
CREATE OR REPLACE FUNCTION public.oe_checklist_responses_exige_inspetor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org  uuid;
    v_ctrl uuid;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    SELECT wo.org_id, wo.controlled_item_id INTO v_org, v_ctrl
      FROM public.work_orders wo
     WHERE wo.id = NEW.work_order_id;

    IF v_ctrl IS NOT NULL
       AND NOT public._qualidade_pode(public._qualidade_sgq_da_org(v_org), 'canInspectQualitySystem') THEN
        RAISE EXCEPTION 'Sem permissão para inspecionar serviço controlado'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oe_checklist_responses_exige_inspetor ON public.oe_checklist_responses;
CREATE TRIGGER trg_oe_checklist_responses_exige_inspetor
    BEFORE INSERT OR UPDATE ON public.oe_checklist_responses
    FOR EACH ROW EXECUTE FUNCTION public.oe_checklist_responses_exige_inspetor();

-- ── 6. work_order_validations ──────────────────────────────────────────────
-- (a) Validação de inspeção de OE controlada não se altera nem se apaga direto
--     (pg_trigger_depth() = 1). Cascata (OE apagada; approved_by_id SET NULL)
--     passa.
-- (b) Inspeção aprovada/reprovada de OE controlada só nasce pela RPC
--     quality_aprovar_inspecao (variável de transação qualidade.via_rpc, ligada
--     só em volta do INSERT da RPC) e com canReleaseQualitySystem na org do SGQ.
-- (c) created_at é do banco (clock_timestamp()) — o corte do portão "approved".
-- INVOKER: quem grava a validação enxerga a OE (a RLS passa por ela).
CREATE OR REPLACE FUNCTION public.work_order_validations_inspecao_controlada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org  uuid;
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
        SELECT wo.org_id, wo.controlled_item_id INTO v_org, v_ctrl
          FROM public.work_orders wo
         WHERE wo.id = NEW.work_order_id;
        IF v_ctrl IS NOT NULL THEN
            IF coalesce(current_setting('qualidade.via_rpc', true), '') <> 'on' THEN
                RAISE EXCEPTION 'A inspeção de serviço controlado só se aprova ou reprova pela ação "Aprovar inspeção".'
                    USING ERRCODE = '42501';
            END IF;
            IF NOT public._qualidade_pode(public._qualidade_sgq_da_org(v_org), 'canReleaseQualitySystem') THEN
                RAISE EXCEPTION 'Sem permissão para aprovar a inspeção de serviço controlado'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_order_validations_inspecao_controlada ON public.work_order_validations;
CREATE TRIGGER trg_work_order_validations_inspecao_controlada
    BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_validations
    FOR EACH ROW EXECUTE FUNCTION public.work_order_validations_inspecao_controlada();

-- Histórico: estado NOVO na criação/mudança (AFTER INSERT/UPDATE) e o último na
-- exclusão (BEFORE DELETE — direto ou por cascata). SECURITY DEFINER:
-- authenticated não tem INSERT no histórico; só copia a própria linha (que já
-- passou pela RLS de quem gravou) + auth.uid(); não recebe parâmetro.
CREATE OR REPLACE FUNCTION public.work_order_validations_grava_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r public.work_order_validations%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        r := OLD;
    ELSE
        r := NEW;
    END IF;
    INSERT INTO public.work_order_validation_history (
        validation_id, work_order_id, type, status, notes, approved_by_id, liberado_por,
        liberado_em, executores, procedimento_revisao, procedimento_versao_id, evento, alterado_por)
    VALUES (
        r.id, r.work_order_id, r.type, r.status, r.notes, r.approved_by_id, r.liberado_por,
        r.liberado_em, r.executores, r.procedimento_revisao, r.procedimento_versao_id,
        CASE TG_OP WHEN 'INSERT' THEN 'criacao' WHEN 'UPDATE' THEN 'alteracao' ELSE 'exclusao' END,
        auth.uid());
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;  -- NULL cancelaria a exclusão
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_order_validations_grava_historico ON public.work_order_validations;
CREATE TRIGGER trg_work_order_validations_grava_historico
    AFTER INSERT OR UPDATE ON public.work_order_validations
    FOR EACH ROW EXECUTE FUNCTION public.work_order_validations_grava_historico();

DROP TRIGGER IF EXISTS trg_work_order_validations_grava_historico_exclusao ON public.work_order_validations;
CREATE TRIGGER trg_work_order_validations_grava_historico_exclusao
    BEFORE DELETE ON public.work_order_validations
    FOR EACH ROW EXECUTE FUNCTION public.work_order_validations_grava_historico();

-- ── 7. Determinações (i) e (iii) da Task 1 ─────────────────────────────────

-- (i) Serviço controlado referenciado por OE com registro não se apaga direto —
-- senão o ON DELETE SET NULL solta a OE e o registro dela fica apagável.
-- Cascata (organização apagada, pg_trigger_depth() > 1) passa. DEFINER: quem
-- apaga o item da Alpa pode não enxergar as OEs da SPE que apontam para ele; não
-- recebe parâmetro e só diz "tem registro".
-- Correção 1: também não se apaga se alguma OE dele está em inspeção, aprovada,
-- reprovada, medida ou encerrada (ou bloqueada vinda de um desses) — a mesma régua
-- de trocar o serviço da OE (o SET NULL a deixaria comum nesse status).
CREATE OR REPLACE FUNCTION public.quality_controlled_items_bloqueia_exclusao_com_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    IF EXISTS (SELECT 1 FROM public.work_orders wo
                WHERE wo.controlled_item_id = OLD.id
                  AND public._qualidade_oe_tem_registro(wo.id)) THEN
        RAISE EXCEPTION 'Este serviço controlado tem OE com registro de inspeção (resposta, histórico de resposta, NC ou validação) e não pode ser apagado.'
            USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.work_orders wo
                WHERE wo.controlled_item_id = OLD.id
                  AND coalesce(CASE WHEN wo.status = 'blocked' THEN wo.status_before_block END, wo.status)
                      IN ('pending_inspection', 'approved', 'rejected', 'measured', 'closed')) THEN
        RAISE EXCEPTION 'Este serviço controlado tem OE em inspeção, aprovada, reprovada, medida ou encerrada e não pode ser apagado.'
            USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
END;
$$;

-- Correção 1: work_orders_servico_controlado_do_sgq (Task 1) REDEFINIDA aqui.
-- UPDATE direto (pg_trigger_depth() = 1) que MUDA controlled_item_id — trocar,
-- retirar ou ATRIBUIR (NULL → valor) — é recusado (42501):
--   • com a OE (antes ou depois) em pending_inspection, approved, rejected,
--     measured ou closed — ou bloqueada vinda de um desses (status_before_block).
--     Sem isso: OE controlada em inspeção sem registro → desligar o serviço →
--     validação aprovada direta (OE comum) → approved → religar (OLD NULL pulava);
--   • com registro (_qualidade_oe_tem_registro: resposta, histórico de resposta,
--     NC, validação ou histórico de validação), nos dois sentidos — ligar o serviço
--     a uma OE comum que já tem registro faria de respostas de quem não tinha
--     canInspectQualitySystem um registro de inspeção.
-- O resto é igual à Task 1 (o item tem de ser do SGQ da org da OE). Cascata
-- (serviço apagado → SET NULL, pg_trigger_depth() > 1) passa. INVOKER: quem grava
-- a OE enxerga o registro dela (RLS pela OE) e só o item do SGQ que enxerga.
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
       AND NEW.controlled_item_id IS DISTINCT FROM OLD.controlled_item_id THEN
        IF coalesce(CASE WHEN OLD.status = 'blocked' THEN OLD.status_before_block END, OLD.status)
               IN ('pending_inspection', 'approved', 'rejected', 'measured', 'closed')
           OR NEW.status IN ('pending_inspection', 'approved', 'rejected', 'measured', 'closed') THEN
            RAISE EXCEPTION 'O serviço controlado de uma OE em inspeção, aprovada, reprovada, medida ou encerrada não pode ser trocado, retirado nem atribuído.'
                USING ERRCODE = '42501';
        END IF;
        IF public._qualidade_oe_tem_registro(OLD.id) THEN
            RAISE EXCEPTION 'O serviço controlado de uma OE com registro de inspeção (resposta, histórico de resposta, NC ou validação) não pode ser trocado, retirado nem atribuído.'
                USING ERRCODE = '42501';
        END IF;
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

DROP TRIGGER IF EXISTS trg_quality_controlled_items_bloqueia_exclusao_com_registro ON public.quality_controlled_items;
CREATE TRIGGER trg_quality_controlled_items_bloqueia_exclusao_com_registro
    BEFORE DELETE ON public.quality_controlled_items
    FOR EACH ROW EXECUTE FUNCTION public.quality_controlled_items_bloqueia_exclusao_com_registro();

-- (iii) A ficha (checklist_template_id) de OE controlada com registro não se
-- troca nem se retira num UPDATE direto (o app manda o campo sempre: só conta se
-- MUDOU). Cascata (modelo apagado → SET NULL) passa. INVOKER: quem grava a OE
-- enxerga o registro dela (RLS pela OE).
CREATE OR REPLACE FUNCTION public.work_orders_ficha_travada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF pg_trigger_depth() = 1
       AND OLD.controlled_item_id IS NOT NULL
       AND NEW.checklist_template_id IS DISTINCT FROM OLD.checklist_template_id
       AND public._qualidade_oe_tem_registro(OLD.id) THEN
        RAISE EXCEPTION 'A ficha de verificação de uma OE de serviço controlado com registro de inspeção (resposta, histórico de resposta, NC ou validação) não pode ser trocada nem retirada.'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_orders_ficha_travada ON public.work_orders;
CREATE TRIGGER trg_work_orders_ficha_travada
    BEFORE UPDATE OF checklist_template_id ON public.work_orders
    FOR EACH ROW EXECUTE FUNCTION public.work_orders_ficha_travada();

-- ── 8. "Aprovar inspeção" ──────────────────────────────────────────────────
-- SECURITY DEFINER; confere dentro: usuário na requisição; membro da org da OE
-- (ou superadmin); OE em pending_inspection; reprovar exige notas; OE controlada
-- exige canReleaseQualitySystem na org do SGQ (e, para aprovar, quem executou).
-- Grava a validação (liberado_por/em pelo banco; se controlada, executores com
-- "treinado na revisão" de cada um e a revisão/versão do procedimento), muda o
-- status (o gatilho de portões confere a validação recém-criada) e grava o
-- histórico de status. Devolve o id da validação.
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

    -- Correção 1: aprovar reconfere, no momento, o portão de pending_inspection
    -- (NC aberta ou item desfeito DEPOIS do pedido de inspeção; executores da OE
    -- controlada). Reprovar não precisa.
    IF p_aprovar THEN
        v_msgs := public._oe_portoes(v_wo.id, 'in_progress', 'pending_inspection', v_wo.checklist_template_id,
                                     v_wo.controlled_item_id, v_wo.collaborator_ids);
        IF coalesce(cardinality(v_msgs), 0) > 0 THEN
            RAISE EXCEPTION '%', array_to_string(v_msgs, '; ') USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF v_wo.controlled_item_id IS NOT NULL THEN
        IF NOT public._qualidade_pode(public._qualidade_sgq_da_org(v_wo.org_id), 'canReleaseQualitySystem') THEN
            RAISE EXCEPTION 'Sem permissão para aprovar a inspeção de serviço controlado'
                USING ERRCODE = '42501';
        END IF;

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

-- ── 9. Quem executa ─────────────────────────────────────────────────────────
-- Chamáveis pelo app (authenticated): oe_portoes, quality_aprovar_inspecao e os
-- ajudantes. _qualidade_pode / _qualidade_sgq_da_org são DEFINER mas só dizem o
-- que o PRÓPRIO usuário pode / qual org é a dona do SGQ de uma org (um id).
-- _qualidade_treinado_na_revisao e _qualidade_oe_tem_registro são INVOKER (RLS de
-- quem chama). _oe_portoes: NADA para authenticated (só as funções DEFINER que
-- conferem o acesso a chamam). As de gatilho (RETURNS trigger) não são chamáveis
-- por RPC; mesmo assim, nada para PUBLIC/anon.

REVOKE EXECUTE ON FUNCTION public._qualidade_sgq_da_org(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._qualidade_sgq_da_org(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._qualidade_pode(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._qualidade_pode(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._qualidade_treinado_na_revisao(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._qualidade_treinado_na_revisao(uuid, uuid, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._qualidade_oe_tem_registro(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._qualidade_oe_tem_registro(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._oe_portoes(uuid, text, text, uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._oe_portoes(uuid, text, text, uuid, uuid, uuid[]) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public._oe_portoes(uuid, text, text, uuid, uuid, uuid[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.oe_portoes(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.oe_portoes(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.quality_aprovar_inspecao(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_aprovar_inspecao(uuid, boolean, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_orders_portoes_de_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_orders_portoes_de_status() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_order_status_log_protege() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_order_status_log_protege() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.oe_checklist_responses_exige_inspetor() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.oe_checklist_responses_exige_inspetor() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_order_validations_inspecao_controlada() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_order_validations_inspecao_controlada() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_order_validations_grava_historico() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_order_validations_grava_historico() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.quality_controlled_items_bloqueia_exclusao_com_registro() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_controlled_items_bloqueia_exclusao_com_registro() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_orders_ficha_travada() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_orders_ficha_travada() TO authenticated;

-- Redefinida aqui (Correção 1); mesmo ACL da Task 1.
REVOKE EXECUTE ON FUNCTION public.work_orders_servico_controlado_do_sgq() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.work_orders_servico_controlado_do_sgq() TO authenticated;

COMMIT;
