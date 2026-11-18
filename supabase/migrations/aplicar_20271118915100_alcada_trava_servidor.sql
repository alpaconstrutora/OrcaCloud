-- ==========================================================================
-- Alçada no servidor (2 de 2): a gravação direta não aprova
-- Date: 2026-11-18
-- Plano: docs/planos/2026-11-18-seguranca-alcada-no-servidor.md
-- Prova: scripts/teste-alcada-no-servidor.sql
-- Achados: F14 e F59 da varredura Claude Security de 15/11 (PR G da fase 2)
-- Base:  definições vigentes no banco em 18/11 de fn_titulo_nasce_na_alcada e
--        fn_titulo_aprovacao_memoriza (= aplicar_20271026400000) e as 8 tabelas com
--        approval_chain (as 7 de aplicar_20271111150000 + project_risks)
-- ==========================================================================
-- O QUE FECHA
--   F14: qualquer membro aprovava sem estar na alçada — PATCH {approval_status:'APROVADO'}
--        (a trava de 11/11 só dispara em UPDATE OF approval_chain), INSERT de título já
--        APROVADO, dois passos numa gravação (só o último era conferido), nível exigido
--        rebaixado, e a ida e volta: baixar o valor, aprovar na faixa menor, devolver o valor.
--   F59: o portão do Asaas (bloqueiosDoDisparo) confia em approval_status — com o campo só
--        gravável pela aprovação, o portão passa a estar certo como está.
--   Também: aprovação dada numa organização e usada noutra (mudar a organização do título,
--   ou do processo, e voltar), e a memória de aprovação devolvendo APROVADO a título recriado
--   com OUTRO favorecido.
--
-- O QUE MUDA
--   1. trg_alcada_guarda (BEFORE INSERT OR UPDATE, primeiro da fila — nome 'trg_alcada_…' vem
--      antes de todos os gatilhos BEFORE destas tabelas, então vê o que o cliente mandou, antes
--      de fn_titulo_nasce_na_alcada & cia.) nas 8 tabelas com approval_chain.
--      Para quem escreve pela API (current_user authenticated/anon) fora das funções do servidor:
--        • INSERT: não nasce APROVADO nem com passos; PENDENTE nasce com os níveis da faixa.
--        • UPDATE: approval_chain só fica igual ou zerada (zerada = nova rodada, fora de
--          APROVADO); nada vira APROVADO; nível exigido não diminui no meio da aprovação;
--          PENDENTE fica com ao menos os níveis da faixa.
--        • Mudar a organização de item aprovado ou com passo: no título, volta para aprovação
--          (abaixo); nos outros, recusado. Etapa de processo aprovada não troca de processo.
--      Continua livre o que só tira aprovação: voltar a RASCUNHO, PENDENTE→REJEITADO sem passo
--      (cancelar boleto), retirar ofício da aprovação, editar título (payableService).
--      Recusa = 42501 com "ALCADA_NAO_PERMITE: …" (utils/alcada.mensagemDaAlcada mostra a frase).
--   2. Título a pagar cujo valor sobe para faixa de PISO maior — QUALQUER escritor: tela,
--      sincronização, ajuste de conciliação (decisão do usuário, 18/11) — e que estava
--      APROVADO (ou PENDENTE com passo): volta a PENDENTE, cadeia zerada, níveis da faixa nova;
--      business_status APROVADO → PREVISTO (como payableService.updateAvulso); se já está
--      conciliado, fica marcado pago_sem_alcada_em. PENDENTE sem passo só ganha os níveis da
--      faixa nova. Desce ou fica na faixa = mantém. Mesmas exceções de fn_titulo_nasce_na_alcada
--      (DARF, RETIDO, ASAAS_FEE, CONTRA, cancelado, organização de condomínio).
--   3. trg_alcada_guarda_processo: process_instances não muda de organização (pela API) com
--      etapa aprovada ou com passo — a aprovação vale na organização em que foi dada.
--   4. Caminhos do servidor que gravam aprovação: função SECURITY DEFINER (o dono escreve) e
--      service_role passam sozinhos. As funções SECURITY INVOKER que gravam de propósito ligam
--      orcacloud.alcada_servidor: as RPCs da 1 de 2 (só no UPDATE da aprovação) e, aqui, por
--      ALTER FUNCTION … SET, fn_darf_criar, fn_darf_editar, fn_darf_enviar_aprovacao,
--      fn_darf_aprovar, fn_darf_rejeitar (o DARF grava a cadeia em todos os membros) e
--      fn_reconcile_group (o saldo do desmembramento é CLONE do título, aprovação junto).
--      ⚠️ CREATE OR REPLACE numa delas sem o SET apaga o SET — e a função passa a ser recusada
--      pela trava (falha alta, não buraco). Inventário de 18/11: nenhuma outra função INVOKER
--      grava approval_status/approval_chain/approval_required_levels nestas tabelas
--      (SELECT proname FROM pg_proc WHERE prosrc ILIKE '%approval_status%'); o front grava só
--      pelo approvalService (agora RPC), payableService.updateAvulso (RASCUNHO + cadeia zerada),
--      boletoService.cancelar (PENDENTE→REJEITADO), docGen.retirarDaAprovacao (→RASCUNHO) e
--      contractService.duplicateContract (agora sem copiar a aprovação).
--      O cliente não liga orcacloud.alcada_servidor: o PostgREST não executa SET e nenhuma
--      função exposta chama set_config com nome vindo de fora (conferido em 18/11).
--   5. titulo_aprovacao_memoria guarda o favorecido (supplier_id, employee_id, party_id,
--      party_name); fn_titulo_nasce_na_alcada só devolve APROVADO ao título recriado se o
--      favorecido for o mesmo.
--   fn_alcada_trava_passo (11/11) fica como está: confere de novo o passo que a RPC grava.
--
-- REGRA #7 (CLAUDE.md)
--   P1: sem policy nova.
--   P2: fn_alcada_guarda e fn_alcada_guarda_processo são de gatilho (não executáveis por RPC) e
--       SECURITY INVOKER de propósito — current_user é quem escreve. fn_alcada_org_condominio é
--       SECURITY DEFINER (fn_org_e_condominio não é executável por authenticated) e só responde
--       a membro da organização, superadmin ou chamada sem usuário. REVOKE de PUBLIC e anon em
--       todas; fn_titulo_nasce_na_alcada e fn_titulo_aprovacao_memoriza mantêm o ACL (REPLACE).
--   P3: sem Edge Function.
--
-- ORDEM: aplicar DEPOIS que o front do PR estiver no ar (o front antigo grava a aprovação com
-- UPDATE direto, que esta migration recusa). Pré-requisito: aplicar_20271118915000_alcada_rpcs.
-- Aba aberta com o front antigo depois disto: aprovar dá "ALCADA_NAO_PERMITE … Recarregue a tela".
--
-- COMO CONFERIR
--   SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--    WHERE t.tgname IN ('trg_alcada_guarda', 'trg_alcada_guarda_processo') ORDER BY 1;  -- 9 linhas
--   SELECT proname, proconfig FROM pg_proc
--    WHERE proname IN ('fn_darf_criar','fn_darf_editar','fn_darf_enviar_aprovacao','fn_darf_aprovar',
--                      'fn_darf_rejeitar','fn_reconcile_group');  -- todas com orcacloud.alcada_servidor=on
--   npx supabase db query --linked -f scripts/teste-alcada-no-servidor.sql   -- última linha: TUDO OK
--
-- ROLLBACK
--   DROP TRIGGER trg_alcada_guarda ON <cada uma das 8 tabelas>;
--   DROP TRIGGER trg_alcada_guarda_processo ON public.process_instances;
--   DROP FUNCTION public.fn_alcada_guarda(), public.fn_alcada_guarda_processo(),
--                 public.fn_alcada_org_condominio(uuid);
--   ALTER FUNCTION <cada uma das 6> RESET orcacloud.alcada_servidor;
--   fn_titulo_nasce_na_alcada / fn_titulo_aprovacao_memoriza: o corpo de
--   aplicar_20271026400000 (sem as 4 colunas do favorecido); as colunas novas da memória podem
--   ficar.
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── Organização de condomínio, para quem escreve (fn_org_e_condominio não é de authenticated) ──
CREATE OR REPLACE FUNCTION public.fn_alcada_org_condominio(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT CASE WHEN auth.uid() IS NULL OR public.is_org_member(p_org) OR public.is_superadmin()
                THEN public.fn_org_e_condominio(p_org)
                ELSE false END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_alcada_org_condominio(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_org_condominio(uuid) TO authenticated, service_role;

-- ── A trava ───────────────────────────────────────────────────────────────────
-- SECURITY INVOKER de propósito: current_user é quem escreve — authenticated/anon pela API
-- (inclusive dentro de RPC INVOKER), o dono dentro de função SECURITY DEFINER, service_role nas
-- Edge Functions. Em função SECURITY DEFINER current_user seria sempre o dono.
CREATE OR REPLACE FUNCTION public.fn_alcada_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_cliente   boolean := current_user IN ('authenticated', 'anon')
                           AND COALESCE(current_setting('orcacloud.alcada_servidor', true), '') <> 'on';
    v_st        text    := COALESCE(NEW.approval_status, 'RASCUNHO');
    v_cad       jsonb   := CASE WHEN jsonb_typeof(NEW.approval_chain) = 'array' THEN NEW.approval_chain ELSE '[]'::jsonb END;
    v_st_ant    text;
    v_cad_ant   jsonb;
    v_em_curso  boolean;
    v_ctx       record;
    v_org_mudou boolean := false;
    v_piso_ant  numeric;
    v_piso      numeric;
    v_niveis    integer;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF v_cliente THEN
            IF v_st = 'APROVADO' THEN
                RAISE EXCEPTION 'ALCADA_NAO_PERMITE: item novo não nasce aprovado — a aprovação é feita em Financeiro › Aprovações.'
                    USING ERRCODE = '42501';
            END IF;
            IF jsonb_array_length(v_cad) > 0 THEN
                RAISE EXCEPTION 'ALCADA_NAO_PERMITE: item novo não traz etapas de aprovação.'
                    USING ERRCODE = '42501';
            END IF;
            IF v_st = 'PENDENTE' THEN
                SELECT * INTO v_ctx FROM public.fn_alcada_contexto(TG_TABLE_NAME, to_jsonb(NEW));
                NEW.approval_required_levels := LEAST(2, GREATEST(COALESCE(NEW.approval_required_levels, 1),
                    COALESCE((SELECT f.niveis FROM public.fn_alcada_faixa(v_ctx.org, v_ctx.valor) f), 1)));
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    v_st_ant   := COALESCE(OLD.approval_status, 'RASCUNHO');
    v_cad_ant  := CASE WHEN jsonb_typeof(OLD.approval_chain) = 'array' THEN OLD.approval_chain ELSE '[]'::jsonb END;
    v_em_curso := v_st_ant = 'APROVADO' OR (v_st_ant = 'PENDENTE' AND jsonb_array_length(v_cad_ant) > 0);

    IF v_cliente THEN
        IF v_cad IS DISTINCT FROM v_cad_ant AND (jsonb_array_length(v_cad) > 0 OR v_st = 'APROVADO') THEN
            RAISE EXCEPTION 'ALCADA_NAO_PERMITE: as etapas da aprovação só são gravadas pela própria aprovação (Financeiro › Aprovações). Recarregue a tela e tente de novo.'
                USING ERRCODE = '42501';
        END IF;
        IF v_st = 'APROVADO' AND v_st_ant <> 'APROVADO' THEN
            RAISE EXCEPTION 'ALCADA_NAO_PERMITE: só a aprovação marca o item como aprovado (Financeiro › Aprovações). Recarregue a tela e tente de novo.'
                USING ERRCODE = '42501';
        END IF;
        IF COALESCE(NEW.approval_required_levels, 1) < COALESCE(OLD.approval_required_levels, 1)
           AND v_st IN ('PENDENTE', 'APROVADO') AND v_st_ant IN ('PENDENTE', 'APROVADO') THEN
            RAISE EXCEPTION 'ALCADA_NAO_PERMITE: o número de níveis da aprovação não diminui no meio da aprovação.'
                USING ERRCODE = '42501';
        END IF;
        IF v_st = 'PENDENTE'
           AND (v_st_ant <> 'PENDENTE' OR NEW.approval_required_levels IS DISTINCT FROM OLD.approval_required_levels) THEN
            SELECT * INTO v_ctx FROM public.fn_alcada_contexto(TG_TABLE_NAME, to_jsonb(NEW));
            NEW.approval_required_levels := LEAST(2, GREATEST(COALESCE(NEW.approval_required_levels, 1),
                COALESCE((SELECT f.niveis FROM public.fn_alcada_faixa(v_ctx.org, v_ctx.valor) f), 1)));
        END IF;

        IF TG_TABLE_NAME = 'process_instance_steps' THEN
            IF v_em_curso AND (to_jsonb(NEW) ->> 'process_instance_id') IS DISTINCT FROM (to_jsonb(OLD) ->> 'process_instance_id') THEN
                RAISE EXCEPTION 'ALCADA_NAO_PERMITE: etapa aprovada (ou com aprovação em curso) não troca de processo.'
                    USING ERRCODE = '42501';
            END IF;
        ELSIF v_em_curso AND (to_jsonb(NEW) ->> 'organization_id') IS DISTINCT FROM (to_jsonb(OLD) ->> 'organization_id') THEN
            IF TG_TABLE_NAME = 'internal_transactions' THEN
                v_org_mudou := true;   -- volta para aprovação, abaixo
            ELSE
                RAISE EXCEPTION 'ALCADA_NAO_PERMITE: item aprovado (ou com aprovação em curso) não muda de organização — a aprovação vale na organização em que foi dada.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    -- Título a pagar: valor subiu de faixa (qualquer escritor) ou organização trocada pela API.
    -- IF aninhado: as colunas abaixo só existem em internal_transactions, e o PL/pgSQL não
    -- garante parar no primeiro AND falso.
    IF TG_TABLE_NAME = 'internal_transactions' THEN
        IF (v_org_mudou OR NEW.amount IS DISTINCT FROM OLD.amount)
           AND NEW.direction = 'DEBIT'
           AND NEW.darf_id IS NULL
           AND COALESCE(NEW.approval_status, 'RASCUNHO') IN ('APROVADO', 'PENDENTE')
           AND COALESCE(NEW.status, 'PENDING') <> 'CANCELLED'
           AND COALESCE(NEW.business_status, '') NOT IN ('RETIDO', 'CANCELADO')
           AND COALESCE(NEW.source_system, '') NOT IN ('ASAAS_FEE', 'DARF')
           AND COALESCE(NEW.entry_type, 'PRINCIPAL') <> 'CONTRA' THEN
            SELECT f.faixa_min, f.niveis INTO v_piso, v_niveis FROM public.fn_alcada_faixa(NEW.organization_id, NEW.amount) f;
            IF NOT v_org_mudou THEN
                SELECT f.faixa_min INTO v_piso_ant FROM public.fn_alcada_faixa(NEW.organization_id, OLD.amount) f;
            END IF;
            IF (v_org_mudou OR (v_piso IS NOT NULL AND (v_piso_ant IS NULL OR v_piso > v_piso_ant)))
               AND NOT public.fn_alcada_org_condominio(NEW.organization_id) THEN
                IF NEW.approval_status = 'APROVADO'
                   OR jsonb_array_length(CASE WHEN jsonb_typeof(NEW.approval_chain) = 'array' THEN NEW.approval_chain ELSE '[]'::jsonb END) > 0 THEN
                    NEW.approval_status := 'PENDENTE';
                    NEW.approval_chain  := '[]'::jsonb;
                    IF NEW.business_status = 'APROVADO' AND COALESCE(NEW.status, 'PENDING') = 'PENDING' THEN
                        NEW.business_status := 'PREVISTO';
                    END IF;
                    IF NEW.status = 'CONCILIATED' AND NEW.pago_sem_alcada_em IS NULL THEN
                        NEW.pago_sem_alcada_em := now();
                    END IF;
                END IF;
                NEW.approval_required_levels := COALESCE(v_niveis, 1);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_alcada_guarda() FROM PUBLIC, anon;

DO $do$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['internal_transactions', 'contracts', 'purchase_orders', 'process_instance_steps',
                             'blueprint_snapshots', 'purchase_requests', 'doc_gen_documentos', 'project_risks']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_alcada_guarda ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_alcada_guarda BEFORE INSERT OR UPDATE ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.fn_alcada_guarda()', t);
    END LOOP;
END
$do$;

-- ── Processo com aprovação dada não muda de organização ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_alcada_guarda_processo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND COALESCE(current_setting('orcacloud.alcada_servidor', true), '') <> 'on'
       AND NEW.organization_id IS DISTINCT FROM OLD.organization_id
       AND EXISTS (
           SELECT 1 FROM public.process_instance_steps s
            WHERE s.process_instance_id = NEW.id
              AND (s.approval_status = 'APROVADO'
                   OR (s.approval_status = 'PENDENTE' AND jsonb_array_length(COALESCE(s.approval_chain, '[]'::jsonb)) > 0))) THEN
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: processo com etapa aprovada (ou com aprovação em curso) não muda de organização — a aprovação vale na organização em que foi dada.'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_alcada_guarda_processo() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_alcada_guarda_processo ON public.process_instances;
CREATE TRIGGER trg_alcada_guarda_processo BEFORE UPDATE OF organization_id ON public.process_instances
    FOR EACH ROW EXECUTE FUNCTION public.fn_alcada_guarda_processo();

-- ── Funções INVOKER do servidor que gravam aprovação de propósito ──────────────
ALTER FUNCTION public.fn_darf_criar(uuid, uuid[], date, numeric, numeric, jsonb, jsonb) SET orcacloud.alcada_servidor = 'on';
ALTER FUNCTION public.fn_darf_editar(uuid, date, numeric, numeric, jsonb, jsonb) SET orcacloud.alcada_servidor = 'on';
ALTER FUNCTION public.fn_darf_enviar_aprovacao(uuid) SET orcacloud.alcada_servidor = 'on';
ALTER FUNCTION public.fn_darf_aprovar(uuid, integer, text, text) SET orcacloud.alcada_servidor = 'on';
ALTER FUNCTION public.fn_darf_rejeitar(uuid, text, text) SET orcacloud.alcada_servidor = 'on';
ALTER FUNCTION public.fn_reconcile_group(uuid[], uuid[], text, jsonb) SET orcacloud.alcada_servidor = 'on';

-- ── Memória de aprovação: só o mesmo favorecido ───────────────────────────────
ALTER TABLE public.titulo_aprovacao_memoria
    ADD COLUMN IF NOT EXISTS supplier_id uuid,
    ADD COLUMN IF NOT EXISTS employee_id uuid,
    ADD COLUMN IF NOT EXISTS party_id    uuid,
    ADD COLUMN IF NOT EXISTS party_name  text;

CREATE OR REPLACE FUNCTION public.fn_titulo_aprovacao_memoriza()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF OLD.direction = 'DEBIT' AND OLD.status = 'PENDING'
       AND OLD.approval_status = 'APROVADO'
       AND OLD.reference_id IS NOT NULL AND OLD.source_system IS NOT NULL THEN
        INSERT INTO public.titulo_aprovacao_memoria
            (organization_id, source_system, reference_id, entry_type, amount,
             approval_chain, approval_required_levels,
             supplier_id, employee_id, party_id, party_name)
        VALUES (OLD.organization_id, OLD.source_system, OLD.reference_id,
                COALESCE(OLD.entry_type, 'PRINCIPAL'), OLD.amount,
                COALESCE(OLD.approval_chain, '[]'::jsonb), COALESCE(OLD.approval_required_levels, 1),
                OLD.supplier_id, OLD.employee_id, OLD.party_id, OLD.party_name);
    END IF;
    RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_titulo_nasce_na_alcada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    m record;
    v_niveis integer;
BEGIN
    IF COALESCE(NEW.status, 'PENDING') <> 'PENDING'
       OR COALESCE(NEW.business_status, '') IN ('RETIDO', 'CANCELADO', 'PAGO')
       OR COALESCE(NEW.source_system, '') IN ('ASAAS_FEE', 'DARF')
       OR COALESCE(NEW.entry_type, 'PRINCIPAL') = 'CONTRA'
       OR COALESCE(NEW.approval_status, 'RASCUNHO') <> 'RASCUNHO'
       -- 09/11/2026: tributo agrupado segue o DARF (fn_darf_enviar_aprovacao).
       -- Sem isto, o RASCUNHO que fn_darf_criar grava voltaria a PENDENTE pelo
       -- gatilho de UPDATE, e o DARF nasceria "aguardando aprovação".
       OR NEW.darf_id IS NOT NULL
       OR public.fn_org_e_condominio(NEW.organization_id) THEN
        RETURN NEW;
    END IF;

    -- Mesmo título recriado pelo sync, mesmo valor e MESMO FAVORECIDO, nos últimos 30 dias →
    -- continua aprovado. (18/11/2026: antes bastava a referência e o valor — apagar e recriar o
    -- título com outro fornecedor trazia a aprovação junto.)
    IF TG_OP = 'INSERT' AND NEW.reference_id IS NOT NULL AND NEW.source_system IS NOT NULL THEN
        SELECT * INTO m
          FROM public.titulo_aprovacao_memoria mm
         WHERE mm.organization_id = NEW.organization_id
           AND mm.source_system = NEW.source_system
           AND mm.reference_id = NEW.reference_id
           AND mm.entry_type = COALESCE(NEW.entry_type, 'PRINCIPAL')
           AND mm.amount = NEW.amount
           AND mm.supplier_id IS NOT DISTINCT FROM NEW.supplier_id
           AND mm.employee_id IS NOT DISTINCT FROM NEW.employee_id
           AND mm.party_id IS NOT DISTINCT FROM NEW.party_id
           AND lower(btrim(COALESCE(mm.party_name, ''))) = lower(btrim(COALESCE(NEW.party_name, '')))
           AND mm.apagado_em > now() - interval '30 days'
         ORDER BY mm.apagado_em DESC
         LIMIT 1;
        IF FOUND THEN
            NEW.approval_status          := 'APROVADO';
            NEW.approval_chain           := m.approval_chain;
            NEW.approval_required_levels := m.approval_required_levels;
            DELETE FROM public.titulo_aprovacao_memoria
             WHERE organization_id = m.organization_id AND source_system = m.source_system
               AND reference_id = m.reference_id AND entry_type = m.entry_type;
            RETURN NEW;
        END IF;
    END IF;

    SELECT r.required_levels INTO v_niveis
      FROM public.fn_resolve_approval_levels(NEW.organization_id, NEW.amount) r;
    NEW.approval_status          := 'PENDENTE';
    NEW.approval_chain           := '[]'::jsonb;
    NEW.approval_required_levels := COALESCE(v_niveis, 1);
    RETURN NEW;
END;
$function$;

-- Funções de gatilho: ninguém as chama por RPC (REPLACE mantém o ACL; o REVOKE é explícito).
REVOKE EXECUTE ON FUNCTION public.fn_titulo_aprovacao_memoriza() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_titulo_nasce_na_alcada() FROM PUBLIC, anon;

COMMIT;
