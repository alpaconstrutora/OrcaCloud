-- ==========================================================================
-- Alçada no servidor (1 de 2): as RPCs que decidem a aprovação
-- Date: 2026-11-18
-- Plano: docs/planos/2026-11-18-seguranca-alcada-no-servidor.md
-- Prova: scripts/teste-alcada-no-servidor.sql
-- Achados: F14 e F59 da varredura Claude Security de 15/11 (PR G da fase 2)
-- Base:  definições vigentes no banco em 18/11 de fn_alcada_proximo_nivel,
--        fn_alcada_aprovadores, fn_alcada_pode_aprovar (= aplicar_20271111150000) e a conta de
--        valor de fn_alcada_trava_passo (com project_risk, aplicar_20271115637000)
-- ==========================================================================
-- O QUE FECHA (junto com a 2 de 2)
--   A alçada só existia no navegador: approvalService.approve calculava sozinho se a alçada
--   fechou e gravava approval_status = 'APROVADO'; submit gravava 'APROVADO' direto quando
--   nenhuma faixa cobria o valor. Esta migration cria as RPCs que passam a decidir no servidor.
--   A 2 de 2 é a trava que recusa a gravação direta.
--
-- O QUE CRIA (só acrescenta — o front de hoje continua funcionando)
--   fn_alcada_enviar(entity, id, sem_faixa, extra, reenvio)   envia para aprovação / libera abaixo do piso
--   fn_alcada_aprovar(entity, id, nivel, obs, rotulos, extra) aprova o nível da vez
--   fn_alcada_rejeitar(entity, id, motivo, extra)             rejeita
--   e os auxiliares fn_alcada_tabela, fn_alcada_contexto, fn_alcada_faixa, fn_alcada_aplicar_extra.
--
--   As três RPCs são SECURITY INVOKER: a RLS de cada tabela continua decidindo QUAL linha a
--   pessoa alcança (a linha é lida com FOR UPDATE). O que elas acrescentam, tudo calculado no
--   servidor: valor do item, faixa, níveis exigidos (nunca menos que os da faixa), nível da vez
--   (fn_alcada_proximo_nivel — rodada depois da última rejeição), se quem está logado pode
--   aprovar esse nível (fn_alcada_pode_aprovar) e o passo gravado em nome do e-mail do JWT.
--   O nível que a tela manda é só conferido: diferente do da vez = erro ("recarregue").
--   Para gravar a aprovação elas ligam orcacloud.alcada_servidor só durante esse UPDATE — é a
--   exceção que a trava (2 de 2) reconhece. O "extra" de cada tela (business_status, status do
--   contrato, conclusão da etapa) vai num UPDATE à parte, com a trava ativa e a RLS valendo.
--
-- REGRA #7 (CLAUDE.md)
--   P1: sem policy nova.
--   P2: todas com REVOKE de PUBLIC e anon; EXECUTE para authenticated e service_role.
--       fn_alcada_faixa é SECURITY DEFINER (lê a faixa de qualquer papel — corretor não lê
--       financial_approval_config pela RLS): só responde a membro da organização, superadmin ou
--       chamada sem usuário (gatilho/rotina), como fn_alcada_aprovadores. As demais são INVOKER:
--       chamadas direto, fazem o que a pessoa já faria com UPDATE pela API, e nada além.
--   P3: sem Edge Function.
--
-- ORDEM: aplicar ANTES do merge do PR (o front novo chama estas RPCs). A 2 de 2 vai DEPOIS que
-- o front novo estiver no ar.
--
-- COMO CONFERIR
--   SELECT proname, prosecdef, has_function_privilege('anon', oid, 'EXECUTE') anon
--     FROM pg_proc WHERE proname LIKE 'fn_alcada_%' ORDER BY 1;
--   -- 7 funções novas + as 4 de 11/11; anon = false em todas.
--
-- ROLLBACK
--   DROP FUNCTION public.fn_alcada_enviar(text, uuid, text, jsonb, boolean),
--                 public.fn_alcada_aprovar(text, uuid, integer, text, jsonb, jsonb),
--                 public.fn_alcada_rejeitar(text, uuid, text, jsonb),
--                 public.fn_alcada_aplicar_extra(text, uuid, jsonb),
--                 public.fn_alcada_faixa(uuid, numeric),
--                 public.fn_alcada_contexto(text, jsonb),
--                 public.fn_alcada_tabela(text);
--   (só depois de desfazer a 2 de 2, que usa fn_alcada_contexto e fn_alcada_faixa)
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── Tabela de cada tipo de item (lista fechada: o nome vai para SQL dinâmico) ──
CREATE OR REPLACE FUNCTION public.fn_alcada_tabela(p_entity text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT CASE p_entity
        WHEN 'transaction'        THEN 'internal_transactions'
        WHEN 'contract'           THEN 'contracts'
        WHEN 'purchase_order'     THEN 'purchase_orders'
        WHEN 'process_step'       THEN 'process_instance_steps'
        WHEN 'blueprint_snapshot' THEN 'blueprint_snapshots'
        WHEN 'purchase_request'   THEN 'purchase_requests'
        WHEN 'doc_gen_documento'  THEN 'doc_gen_documentos'
        WHEN 'project_risk'       THEN 'project_risks'
    END;
$fn$;

-- ── Organização, tipo e valor de um item, a partir da linha (to_jsonb) ─────────
-- Mesma conta de fn_alcada_trava_passo, com uma diferença: a etapa de processo usa a coluna
-- amount, que é o valor que o envio usa para os níveis (processService.submitStepApproval grava
-- nela o valor da etapa ou do pedido de origem). Os aprovadores da etapa são por TIPO, então o
-- valor não muda quem aprova. Título de DARF: o valor é o TOTAL do DARF.
-- Número de item de pedido em texto que não é número vale 0 (não derruba a gravação).
CREATE OR REPLACE FUNCTION public.fn_alcada_contexto(p_tabela text, p_linha jsonb)
RETURNS TABLE(org uuid, entity text, valor numeric)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
    org := (p_linha ->> 'organization_id')::uuid;
    CASE p_tabela
        WHEN 'internal_transactions' THEN
            IF p_linha ->> 'darf_id' IS NOT NULL THEN
                entity := 'darf';
                SELECT vd.total INTO valor FROM public.vw_darfs vd WHERE vd.id = (p_linha ->> 'darf_id')::uuid;
            ELSE
                entity := 'transaction';
                valor  := (p_linha ->> 'amount')::numeric;
            END IF;
        WHEN 'contracts' THEN
            entity := 'contract';
            valor  := (p_linha ->> 'current_value')::numeric;
        WHEN 'purchase_orders' THEN
            entity := 'purchase_order';
            SELECT COALESCE(sum(COALESCE(
                       CASE WHEN i ->> 'quotedTotal' ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' THEN (i ->> 'quotedTotal')::numeric END,
                       CASE WHEN i ->> 'total' ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' THEN (i ->> 'total')::numeric END,
                       0)), 0)
              INTO valor
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_linha -> 'items') = 'array'
                                             THEN p_linha -> 'items' ELSE '[]'::jsonb END) i;
        WHEN 'process_instance_steps' THEN
            entity := 'process_step';
            valor  := (p_linha ->> 'amount')::numeric;
            SELECT pi.organization_id INTO org
              FROM public.process_instances pi WHERE pi.id = (p_linha ->> 'process_instance_id')::uuid;
        WHEN 'blueprint_snapshots' THEN
            entity := 'blueprint_snapshot';
            valor  := 0;
        WHEN 'purchase_requests' THEN
            entity := 'purchase_request';
            valor  := (p_linha ->> 'estimated_total')::numeric;
        WHEN 'doc_gen_documentos' THEN
            entity := 'doc_gen_documento';
            valor  := 0;
        WHEN 'project_risks' THEN
            entity := 'project_risk';
            valor  := 0;
        ELSE
            RETURN;
    END CASE;
    valor := COALESCE(valor, 0);
    RETURN NEXT;
END;
$fn$;

-- ── Faixa que cobre um valor: piso e níveis (nenhuma linha = fora de todas) ────
-- Mesmo critério de fn_resolve_approval_levels (a de piso mais alto, se sobrepor).
-- SECURITY DEFINER: corretor e o gatilho da 2 de 2 (que roda como quem escreve) precisam da
-- faixa mesmo sem ler financial_approval_config pela RLS. Só responde a membro da organização,
-- superadmin ou chamada sem usuário (gatilho de rotina, service_role).
CREATE OR REPLACE FUNCTION public.fn_alcada_faixa(p_org uuid, p_valor numeric)
RETURNS TABLE(faixa_min numeric, niveis integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT c.faixa_min, c.required_levels
      FROM public.financial_approval_config c
     WHERE c.organization_id = p_org
       AND c.is_active
       AND COALESCE(p_valor, 0) >= c.faixa_min
       AND (c.faixa_max IS NULL OR COALESCE(p_valor, 0) < c.faixa_max)
       AND (auth.uid() IS NULL OR public.is_org_member(p_org) OR public.is_superadmin())
     ORDER BY c.faixa_min DESC
     LIMIT 1;
$fn$;

-- ── O "extra" de cada tela, num UPDATE comum ───────────────────────────────────
-- Sem campo de aprovação (esses só a RPC grava), sem campo que não existe na tabela. Roda com a
-- trava ativa e a RLS valendo: é exatamente o que a pessoa já faria com UPDATE pela API.
-- p_id NULL = só confere (as RPCs conferem ANTES de gravar a decisão).
CREATE OR REPLACE FUNCTION public.fn_alcada_aplicar_extra(p_tabela text, p_id uuid, p_extra jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_chaves   integer;
    v_achadas  integer;
    v_cols     text;
    v_vals     text;
    v_fora     text;
BEGIN
    IF p_extra IS NULL OR jsonb_typeof(p_extra) <> 'object' OR p_extra = '{}'::jsonb THEN
        RETURN;
    END IF;
    IF p_tabela NOT IN ('internal_transactions', 'contracts', 'purchase_orders', 'process_instance_steps',
                        'blueprint_snapshots', 'purchase_requests', 'doc_gen_documentos', 'project_risks') THEN
        RAISE EXCEPTION 'Tabela fora da alçada: %', p_tabela USING ERRCODE = '22023';
    END IF;
    SELECT string_agg(k, ', ') INTO v_fora
      FROM jsonb_object_keys(p_extra) k
     WHERE k LIKE 'approval%' OR k IN ('id', 'organization_id');
    IF v_fora IS NOT NULL THEN
        RAISE EXCEPTION 'Estes campos não acompanham a decisão da alçada: %', v_fora USING ERRCODE = '22023';
    END IF;

    SELECT count(*), count(a.attname),
           string_agg(format('%I', a.attname), ', ' ORDER BY a.attname),
           string_agg(format('r.%I', a.attname), ', ' ORDER BY a.attname),
           string_agg(k, ', ') FILTER (WHERE a.attname IS NULL)
      INTO v_chaves, v_achadas, v_cols, v_vals, v_fora
      FROM jsonb_object_keys(p_extra) k
      LEFT JOIN pg_attribute a
             ON a.attrelid = format('public.%I', p_tabela)::regclass
            AND a.attname = k AND a.attnum > 0 AND NOT a.attisdropped;
    IF v_achadas <> v_chaves THEN
        RAISE EXCEPTION 'Campo desconhecido em %: %', p_tabela, v_fora USING ERRCODE = '42703';
    END IF;
    IF p_id IS NULL THEN
        RETURN;
    END IF;

    EXECUTE format('UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r) WHERE t.id = $2',
                   p_tabela, v_cols, v_vals, p_tabela)
       USING p_extra, p_id;
END;
$fn$;

-- ── Enviar para aprovação ───────────────────────────────────────────────────────
-- Substitui approvalService.submit (e o "reenviar" do título rejeitado, com p_reenvio).
--   • PENDENTE: já enviado, devolve a linha como está (como antes).
--   • Fora de todas as faixas + p_sem_faixa = 'liberar' (título, contrato, pedido; etapa de
--     processo só com valor > 0): item em RASCUNHO vira APROVADO sem fila — é a regra "abaixo do
--     piso não precisa de aprovação". O valor é o do SERVIDOR. Item REJEITADO não se libera assim:
--     vai para a fila como qualquer outro (antes, chamar submit num rejeitado barato o aprovava).
--   • Senão: PENDENTE, níveis da faixa (1 sem faixa), cadeia zerada — ou mantida, no reenvio de
--     um rejeitado (o histórico fica; a aprovação conta só a rodada depois da rejeição).
--   • Título agrupado em DARF: recusado — o DARF tem as RPCs dele.
CREATE OR REPLACE FUNCTION public.fn_alcada_enviar(
    p_entity    text,
    p_id        uuid,
    p_sem_faixa text    DEFAULT 'exigir1',
    p_extra     jsonb   DEFAULT '{}'::jsonb,
    p_reenvio   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tabela text := public.fn_alcada_tabela(p_entity);
    v_linha  jsonb;
    v_status text;
    v_ctx    record;
    v_niveis integer;
BEGIN
    IF v_tabela IS NULL THEN
        RAISE EXCEPTION 'Tipo de item desconhecido na alçada: %', p_entity USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_sem_faixa, '') NOT IN ('liberar', 'exigir1') THEN
        RAISE EXCEPTION 'p_sem_faixa deve ser liberar ou exigir1.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.fn_alcada_aplicar_extra(v_tabela, NULL, p_extra);

    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 FOR UPDATE', v_tabela)
       INTO v_linha USING p_id;
    IF v_linha IS NULL THEN
        RAISE EXCEPTION 'Item não encontrado ou sem acesso.' USING ERRCODE = 'P0002';
    END IF;
    IF v_tabela = 'internal_transactions' AND v_linha ->> 'darf_id' IS NOT NULL THEN
        RAISE EXCEPTION 'Título agrupado em DARF: a aprovação é a do DARF (Financeiro › Tributos a Pagar).' USING ERRCODE = 'P0001';
    END IF;

    v_status := COALESCE(v_linha ->> 'approval_status', 'RASCUNHO');
    IF p_reenvio THEN
        IF v_status <> 'REJEITADO' THEN
            RAISE EXCEPTION 'Só item rejeitado é reenviado para aprovação.' USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_status = 'PENDENTE' THEN
        RETURN v_linha;
    END IF;

    SELECT * INTO v_ctx FROM public.fn_alcada_contexto(v_tabela, v_linha);
    SELECT f.niveis INTO v_niveis FROM public.fn_alcada_faixa(v_ctx.org, v_ctx.valor) f;

    IF v_niveis IS NULL AND NOT p_reenvio AND p_sem_faixa = 'liberar'
       AND v_status IN ('RASCUNHO', 'APROVADO')
       AND (p_entity IN ('transaction', 'contract', 'purchase_order')
            OR (p_entity = 'process_step' AND v_ctx.valor > 0)) THEN
        IF v_status = 'RASCUNHO' THEN
            -- `extra` NÃO vai: ele carrega o estado de espera, mentira num item que não entrou na fila.
            PERFORM set_config('orcacloud.alcada_servidor', 'on', true);
            EXECUTE format('UPDATE public.%I SET approval_status = ''APROVADO'' WHERE id = $1', v_tabela) USING p_id;
            PERFORM set_config('orcacloud.alcada_servidor', 'off', true);
        END IF;
        EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', v_tabela) INTO v_linha USING p_id;
        RETURN v_linha;
    END IF;

    PERFORM set_config('orcacloud.alcada_servidor', 'on', true);
    EXECUTE format('UPDATE public.%I SET approval_status = ''PENDENTE'', approval_required_levels = $2, approval_chain = $3 WHERE id = $1', v_tabela)
       USING p_id,
             COALESCE(v_niveis, 1),
             CASE WHEN p_reenvio AND jsonb_typeof(v_linha -> 'approval_chain') = 'array'
                  THEN v_linha -> 'approval_chain' ELSE '[]'::jsonb END;
    PERFORM set_config('orcacloud.alcada_servidor', 'off', true);

    PERFORM public.fn_alcada_aplicar_extra(v_tabela, p_id, p_extra);

    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', v_tabela) INTO v_linha USING p_id;
    RETURN v_linha;
END;
$fn$;

-- ── Aprovar o nível da vez ──────────────────────────────────────────────────────
-- Substitui approvalService.approve. p_nivel é o que a tela mostrou: só conferido.
-- p_rotulos = { level1_label, level2_label } da tela (só o rótulo do passo).
-- Etapa de processo: o nível 2 exige pessoa diferente da do nível 1 (regra de
-- utils/processApproval, agora também no servidor).
CREATE OR REPLACE FUNCTION public.fn_alcada_aprovar(
    p_entity  text,
    p_id      uuid,
    p_nivel   integer DEFAULT NULL,
    p_obs     text    DEFAULT NULL,
    p_rotulos jsonb   DEFAULT '{}'::jsonb,
    p_extra   jsonb   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tabela   text := public.fn_alcada_tabela(p_entity);
    v_email    text := NULLIF(btrim(auth.jwt() ->> 'email'), '');
    v_linha    jsonb;
    v_cadeia   jsonb;
    v_ctx      record;
    v_nivel    integer;
    v_exigidos integer;
    v_quem     text;
    v_niveis   integer[];
    v_completo boolean;
BEGIN
    IF v_tabela IS NULL THEN
        RAISE EXCEPTION 'Tipo de item desconhecido na alçada: %', p_entity USING ERRCODE = '22023';
    END IF;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'Aprovação exige usuário identificado.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.fn_alcada_aplicar_extra(v_tabela, NULL, p_extra);

    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 FOR UPDATE', v_tabela)
       INTO v_linha USING p_id;
    IF v_linha IS NULL THEN
        RAISE EXCEPTION 'Item não encontrado ou sem acesso.' USING ERRCODE = 'P0002';
    END IF;
    IF v_tabela = 'internal_transactions' AND v_linha ->> 'darf_id' IS NOT NULL THEN
        RAISE EXCEPTION 'Título agrupado em DARF: a aprovação é a do DARF (Financeiro › Tributos a Pagar).' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(v_linha ->> 'approval_status', 'RASCUNHO') <> 'PENDENTE' THEN
        RAISE EXCEPTION 'Item não está pendente de aprovação.' USING ERRCODE = 'P0001';
    END IF;

    v_cadeia := CASE WHEN jsonb_typeof(v_linha -> 'approval_chain') = 'array' THEN v_linha -> 'approval_chain' ELSE '[]'::jsonb END;
    v_nivel  := public.fn_alcada_proximo_nivel(v_cadeia);
    IF p_nivel IS NOT NULL AND p_nivel <> v_nivel THEN
        RAISE EXCEPTION 'O nível da vez deste item é o %. Recarregue a tela e tente de novo.', v_nivel USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_ctx FROM public.fn_alcada_contexto(v_tabela, v_linha);
    v_exigidos := LEAST(2, GREATEST(
        COALESCE((v_linha ->> 'approval_required_levels')::integer, 1),
        COALESCE((SELECT f.niveis FROM public.fn_alcada_faixa(v_ctx.org, v_ctx.valor) f), 1)));

    IF p_entity = 'process_step' AND v_nivel = 2 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_cadeia) WITH ORDINALITY AS x(e, i)
         WHERE x.e ->> 'action' = 'APROVADO' AND x.e ->> 'level' = '1'
           AND lower(btrim(COALESCE(x.e ->> 'approved_by', ''))) = lower(v_email)
           AND x.i > COALESCE((SELECT max(y.j) FROM jsonb_array_elements(v_cadeia) WITH ORDINALITY AS y(f, j)
                                WHERE y.f ->> 'action' = 'REJEITADO'), 0)) THEN
        RAISE EXCEPTION 'Você aprovou o nível 1. O nível 2 precisa de outra pessoa.' USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.fn_alcada_pode_aprovar(v_ctx.org, v_ctx.entity, v_ctx.valor, v_nivel) THEN
        SELECT string_agg(a.nome, ', ' ORDER BY a.nome) INTO v_quem
          FROM public.fn_alcada_aprovadores(v_ctx.org, v_ctx.entity, v_ctx.valor, v_nivel) a;
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: o nível % deste item é aprovado por %.', v_nivel, v_quem
            USING ERRCODE = 'P0001';
    END IF;

    v_cadeia := v_cadeia || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'level',       v_nivel,
        'role',        COALESCE(NULLIF(btrim(p_rotulos ->> CASE v_nivel WHEN 1 THEN 'level1_label' ELSE 'level2_label' END), ''),
                                CASE v_nivel WHEN 1 THEN 'Gestor' ELSE 'Financeiro / Diretoria' END),
        'action',      'APROVADO',
        'approved_by', v_email,
        'approved_at', to_jsonb(now()),
        'notes',       NULLIF(btrim(p_obs), ''))));

    -- Níveis aprovados na rodada (depois da última rejeição) — mesma régua de
    -- niveisAprovadosNaRodada e de fn_darf_aprovar.
    SELECT array_agg(DISTINCT (x.e ->> 'level')::integer) INTO v_niveis
      FROM jsonb_array_elements(v_cadeia) WITH ORDINALITY AS x(e, i)
     WHERE x.e ->> 'action' = 'APROVADO'
       AND x.i > COALESCE((SELECT max(y.j) FROM jsonb_array_elements(v_cadeia) WITH ORDINALITY AS y(f, j)
                            WHERE y.f ->> 'action' = 'REJEITADO'), 0);
    v_completo := 1 = ANY(v_niveis) AND (v_exigidos = 1 OR 2 = ANY(v_niveis));

    PERFORM set_config('orcacloud.alcada_servidor', 'on', true);
    EXECUTE format('UPDATE public.%I SET approval_chain = $2, approval_status = $3, approval_required_levels = $4 WHERE id = $1', v_tabela)
       USING p_id, v_cadeia, CASE WHEN v_completo THEN 'APROVADO' ELSE 'PENDENTE' END, v_exigidos;
    PERFORM set_config('orcacloud.alcada_servidor', 'off', true);

    IF v_completo THEN
        PERFORM public.fn_alcada_aplicar_extra(v_tabela, p_id, p_extra);
    END IF;

    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', v_tabela) INTO v_linha USING p_id;
    RETURN v_linha;
END;
$fn$;

-- ── Rejeitar ────────────────────────────────────────────────────────────────────
-- Substitui approvalService.reject. Quem rejeita é quem poderia aprovar o nível da vez (mesma
-- regra de fn_alcada_trava_passo). O passo vai com level 1, como antes.
CREATE OR REPLACE FUNCTION public.fn_alcada_rejeitar(
    p_entity text,
    p_id     uuid,
    p_motivo text,
    p_extra  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tabela text := public.fn_alcada_tabela(p_entity);
    v_email  text := NULLIF(btrim(auth.jwt() ->> 'email'), '');
    v_linha  jsonb;
    v_cadeia jsonb;
    v_ctx    record;
    v_nivel  integer;
    v_quem   text;
BEGIN
    IF v_tabela IS NULL THEN
        RAISE EXCEPTION 'Tipo de item desconhecido na alçada: %', p_entity USING ERRCODE = '22023';
    END IF;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'Rejeição exige usuário identificado.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.fn_alcada_aplicar_extra(v_tabela, NULL, p_extra);

    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 FOR UPDATE', v_tabela)
       INTO v_linha USING p_id;
    IF v_linha IS NULL THEN
        RAISE EXCEPTION 'Item não encontrado ou sem acesso.' USING ERRCODE = 'P0002';
    END IF;
    IF v_tabela = 'internal_transactions' AND v_linha ->> 'darf_id' IS NOT NULL THEN
        RAISE EXCEPTION 'Título agrupado em DARF: a aprovação é a do DARF (Financeiro › Tributos a Pagar).' USING ERRCODE = 'P0001';
    END IF;

    v_cadeia := CASE WHEN jsonb_typeof(v_linha -> 'approval_chain') = 'array' THEN v_linha -> 'approval_chain' ELSE '[]'::jsonb END;
    v_nivel  := public.fn_alcada_proximo_nivel(v_cadeia);
    SELECT * INTO v_ctx FROM public.fn_alcada_contexto(v_tabela, v_linha);
    IF NOT public.fn_alcada_pode_aprovar(v_ctx.org, v_ctx.entity, v_ctx.valor, v_nivel) THEN
        SELECT string_agg(a.nome, ', ' ORDER BY a.nome) INTO v_quem
          FROM public.fn_alcada_aprovadores(v_ctx.org, v_ctx.entity, v_ctx.valor, v_nivel) a;
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: o nível % deste item é aprovado por %.', v_nivel, v_quem
            USING ERRCODE = 'P0001';
    END IF;

    v_cadeia := v_cadeia || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'level',       1,
        'role',        'Rejeição',
        'action',      'REJEITADO',
        'approved_by', v_email,
        'approved_at', to_jsonb(now()),
        'notes',       p_motivo)));

    PERFORM set_config('orcacloud.alcada_servidor', 'on', true);
    EXECUTE format('UPDATE public.%I SET approval_chain = $2, approval_status = ''REJEITADO'' WHERE id = $1', v_tabela)
       USING p_id, v_cadeia;
    PERFORM set_config('orcacloud.alcada_servidor', 'off', true);

    PERFORM public.fn_alcada_aplicar_extra(v_tabela, p_id, p_extra);

    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', v_tabela) INTO v_linha USING p_id;
    RETURN v_linha;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_alcada_tabela(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alcada_contexto(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alcada_faixa(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alcada_aplicar_extra(text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alcada_enviar(text, uuid, text, jsonb, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alcada_aprovar(text, uuid, integer, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alcada_rejeitar(text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_tabela(text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_contexto(text, jsonb) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_faixa(uuid, numeric) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_aplicar_extra(text, uuid, jsonb) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_enviar(text, uuid, text, jsonb, boolean) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_aprovar(text, uuid, integer, text, jsonb, jsonb) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_rejeitar(text, uuid, text, jsonb) TO authenticated, service_role;

COMMIT;
