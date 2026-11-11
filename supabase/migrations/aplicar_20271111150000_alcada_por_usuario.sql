-- ════════════════════════════════════════════════════════════════════════════
-- Alçada de aprovação POR USUÁRIO (10/11/2026)
-- Plano: docs/planos/2026-11-10-alcada-aprovacao-por-usuario.md
--
-- Até aqui `financial_approval_config` dizia só a FAIXA de valor, quantos níveis
-- (1 ou 2) e o RÓTULO de cada nível ("Gestor", "Financeiro / Diretoria"). Quem
-- abria Aprovações aprovava qualquer nível. Agora:
--
--   • `approval_approvers` diz QUEM aprova cada nível — por FAIXA (itens com
--     valor: título, DARF, contrato, pedido) ou por TIPO (itens sem valor:
--     revisão de planta, ofício, solicitação de compra, etapa de processo);
--   • nível sem ninguém cadastrado continua LIBERADO a todos (como antes) —
--     nada trava no dia do deploy;
--   • a mesma pessoa pode aprovar os dois níveis, se estiver nas duas listas;
--   • gatilho `trg_zz_alcada_trava_passo` nas 7 tabelas com `approval_chain`
--     recusa o passo de quem não está na lista, e o passo gravado em nome de
--     outra pessoa (`approved_by` ≠ e-mail do JWT);
--   • só dono/admin da organização (ou superadmin) edita aprovadores E faixas —
--     antes, qualquer membro editava as faixas (policies fac_v4_*);
--   • a fila (`fn_approval_action_queue`) ganha `pode_aprovar` e `vez_de`.
--
-- REGRA #7 (CLAUDE.md):
--   P1 "esta perna do OR sozinha basta para liberar a linha?"
--      approval_approvers SELECT: is_org_member(org) — sim, e é o que se quer:
--      todo membro pode saber quem aprova (a tela mostra "Vez de: …").
--      is_superadmin() — sim, por desenho (desenvolvedor@ tem acesso a tudo).
--      Escrita: is_org_manager(org) OR is_superadmin() — cada perna sozinha é
--      dono/admin daquela org ou superadmin; nenhuma libera membro comum.
--      financial_approval_config (fac_v5_*): idem.
--   P2 "quem mais pode executar esta função?"
--      fn_alcada_aprovadores (SECURITY DEFINER): authenticated; devolve vazio
--      se quem chama não é membro da org nem superadmin — não lê outra org.
--      fn_alcada_pode_aprovar / fn_alcada_proximo_nivel: authenticated; só
--      calculam sobre o que a primeira já recorta.
--      fn_alcada_trava_passo: função de gatilho, não é chamável por RPC.
--      fn_approval_action_queue: authenticated + service_role, como antes.
--      Todas: REVOKE … FROM PUBLIC, anon.
--   P3 não se aplica (sem Edge Function).
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `supabase db push`.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. Quem aprova ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approval_approvers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Exatamente um dos dois: a faixa (itens com valor) OU o tipo (itens sem valor).
    faixa_id        uuid REFERENCES public.financial_approval_config(id) ON DELETE CASCADE,
    entity_type     text CHECK (entity_type IN ('blueprint_snapshot', 'doc_gen_documento', 'purchase_request', 'process_step')),
    level           smallint NOT NULL CHECK (level IN (1, 2)),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid DEFAULT auth.uid(),
    -- `IS NOT NULL` dos dois lados: nunca dá NULL, então o CHECK não "passa" por omissão.
    CONSTRAINT approval_approvers_um_alvo CHECK ((faixa_id IS NOT NULL) <> (entity_type IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_approvers_unico
    ON public.approval_approvers (organization_id, COALESCE(faixa_id::text, entity_type), level, user_id);
CREATE INDEX IF NOT EXISTS approval_approvers_faixa ON public.approval_approvers (faixa_id) WHERE faixa_id IS NOT NULL;

COMMENT ON TABLE public.approval_approvers IS
    'Quem aprova cada nível: por faixa de financial_approval_config (itens com valor) ou por tipo (itens sem valor). Nível sem linha = liberado a todos. Plano 2026-11-10-alcada-aprovacao-por-usuario.';

ALTER TABLE public.approval_approvers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aa_select ON public.approval_approvers;
CREATE POLICY aa_select ON public.approval_approvers
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_superadmin());

-- Escrita: dono/admin da org (ou superadmin). A faixa tem de ser da MESMA org e o
-- usuário, membro dela — sem isso dava para apontar a faixa de outra organização.
DROP POLICY IF EXISTS aa_insert ON public.approval_approvers;
CREATE POLICY aa_insert ON public.approval_approvers
    FOR INSERT TO authenticated
    WITH CHECK (
        (public.is_org_manager(organization_id) OR public.is_superadmin())
        AND (faixa_id IS NULL OR EXISTS (
            SELECT 1 FROM public.financial_approval_config c
             WHERE c.id = faixa_id AND c.organization_id = approval_approvers.organization_id))
        AND EXISTS (
            SELECT 1 FROM public.organization_members om
             WHERE om.organization_id = approval_approvers.organization_id
               AND om.user_id = approval_approvers.user_id)
    );

DROP POLICY IF EXISTS aa_delete ON public.approval_approvers;
CREATE POLICY aa_delete ON public.approval_approvers
    FOR DELETE TO authenticated
    USING (public.is_org_manager(organization_id) OR public.is_superadmin());
-- Sem UPDATE: trocar aprovador = remover + incluir.

REVOKE ALL ON public.approval_approvers FROM anon;
GRANT SELECT, INSERT, DELETE ON public.approval_approvers TO authenticated;

-- ── 2. Faixas: só dono/admin edita (antes: qualquer membro, fac_v4_*) ──────
-- O SELECT (fac_v4_select) fica como está.
DROP POLICY IF EXISTS fac_v4_insert ON public.financial_approval_config;
DROP POLICY IF EXISTS fac_v4_update ON public.financial_approval_config;
DROP POLICY IF EXISTS fac_v4_delete ON public.financial_approval_config;
DROP POLICY IF EXISTS fac_v5_insert ON public.financial_approval_config;
DROP POLICY IF EXISTS fac_v5_update ON public.financial_approval_config;
DROP POLICY IF EXISTS fac_v5_delete ON public.financial_approval_config;

CREATE POLICY fac_v5_insert ON public.financial_approval_config
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_manager(organization_id) OR public.is_superadmin());
CREATE POLICY fac_v5_update ON public.financial_approval_config
    FOR UPDATE TO authenticated
    USING (public.is_org_manager(organization_id) OR public.is_superadmin())
    WITH CHECK (public.is_org_manager(organization_id) OR public.is_superadmin());
CREATE POLICY fac_v5_delete ON public.financial_approval_config
    FOR DELETE TO authenticated
    USING (public.is_org_manager(organization_id) OR public.is_superadmin());

-- ── 3. Regra ───────────────────────────────────────────────────────────────
-- Próximo nível pela cadeia: só a rodada atual (depois da última rejeição) —
-- mesma régua de utils/situacaoAprovacaoTitulo.niveisAprovadosNaRodada e de
-- fn_darf_aprovar.
CREATE OR REPLACE FUNCTION public.fn_alcada_proximo_nivel(p_cadeia jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
    WITH c AS (
        SELECT CASE WHEN jsonb_typeof(p_cadeia) = 'array' THEN p_cadeia ELSE '[]'::jsonb END AS v
    )
    SELECT CASE WHEN EXISTS (
        SELECT 1
          FROM c, jsonb_array_elements(c.v) WITH ORDINALITY AS x(e, i)
         WHERE x.e ->> 'action' = 'APROVADO'
           AND x.e ->> 'level' = '1'
           AND x.i > COALESCE((SELECT max(y.j)
                                 FROM c c2, jsonb_array_elements(c2.v) WITH ORDINALITY AS y(f, j)
                                WHERE y.f ->> 'action' = 'REJEITADO'), 0)
    ) THEN 2 ELSE 1 END;
$fn$;

-- Quem aprova `p_nivel` de um item. Itens sem valor vão pelo TIPO; os demais
-- pela faixa que contém o valor (a de piso mais alto, se houver sobreposição).
-- Sem faixa para o valor, ou faixa sem ninguém → conjunto vazio = liberado.
CREATE OR REPLACE FUNCTION public.fn_alcada_aprovadores(p_org uuid, p_entity text, p_valor numeric, p_nivel integer)
RETURNS TABLE(user_id uuid, nome text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT a.user_id,
           COALESCE(NULLIF(btrim(om.name), ''), NULLIF(btrim(pf.name), ''), om.email, a.user_id::text),
           om.email
      FROM public.approval_approvers a
      LEFT JOIN public.organization_members om
             ON om.organization_id = a.organization_id AND om.user_id = a.user_id
      LEFT JOIN public.profiles pf ON pf.id = a.user_id
     WHERE a.organization_id = p_org
       AND a.level = p_nivel
       -- SECURITY DEFINER: só responde a quem é da org (ou superadmin, ou o
       -- próprio banco — gatilho/rotina sem JWT).
       AND (auth.uid() IS NULL OR public.is_org_member(p_org) OR public.is_superadmin())
       AND CASE
             WHEN p_entity IN ('blueprint_snapshot', 'doc_gen_documento', 'purchase_request', 'process_step')
               THEN a.entity_type = p_entity
             ELSE a.faixa_id = (
                 SELECT c.id
                   FROM public.financial_approval_config c
                  WHERE c.organization_id = p_org
                    AND c.is_active
                    AND COALESCE(p_valor, 0) >= c.faixa_min
                    AND (c.faixa_max IS NULL OR COALESCE(p_valor, 0) < c.faixa_max)
                  ORDER BY c.faixa_min DESC
                  LIMIT 1)
           END;
$fn$;

-- Quem está logado pode aprovar `p_nivel`? Lista vazia = sim (liberado).
CREATE OR REPLACE FUNCTION public.fn_alcada_pode_aprovar(p_org uuid, p_entity text, p_valor numeric, p_nivel integer)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT NOT EXISTS (SELECT 1 FROM public.fn_alcada_aprovadores(p_org, p_entity, p_valor, p_nivel))
        OR EXISTS (
            SELECT 1 FROM public.fn_alcada_aprovadores(p_org, p_entity, p_valor, p_nivel) x
             WHERE x.user_id = auth.uid()
                OR (x.email IS NOT NULL AND lower(x.email) = lower(auth.jwt() ->> 'email')));
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_alcada_proximo_nivel(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alcada_aprovadores(uuid, text, numeric, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alcada_pode_aprovar(uuid, text, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_proximo_nivel(jsonb) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_aprovadores(uuid, text, numeric, integer) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_alcada_pode_aprovar(uuid, text, numeric, integer) TO authenticated, service_role;

-- ── 4. A trava ─────────────────────────────────────────────────────────────
-- Age só quando a cadeia CRESCE com um passo novo de APROVADO/REJEITADO e há
-- usuário logado. Esvaziar a cadeia (reenvio, edição do título) e escrita sem
-- JWT (service_role, rotinas) passam.
--
-- O nível do passo: APROVADO traz o seu; REJEITADO é gravado sempre com
-- level 1 (approvalService.reject, fn_darf_rejeitar), então vale o nível DA VEZ
-- pela cadeia antiga — quem rejeita é quem poderia aprovar agora.
--
-- Nome com `zz`: gatilhos BEFORE rodam em ordem alfabética, e este tem de ver o
-- NEW depois de trg_titulo_volta_a_alcada e trg_doc_gen_congelar.
CREATE OR REPLACE FUNCTION public.fn_alcada_trava_passo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_novo   jsonb;
    v_antigo jsonb;
    v_passo  jsonb;
    v_linha  jsonb;
    v_org    uuid;
    v_entity text;
    v_valor  numeric;
    v_nivel  integer;
    v_quem   text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_novo   := CASE WHEN jsonb_typeof(NEW.approval_chain) = 'array' THEN NEW.approval_chain ELSE '[]'::jsonb END;
    v_antigo := CASE WHEN jsonb_typeof(OLD.approval_chain) = 'array' THEN OLD.approval_chain ELSE '[]'::jsonb END;
    IF jsonb_array_length(v_novo) <= jsonb_array_length(v_antigo) THEN
        RETURN NEW;
    END IF;

    v_passo := v_novo -> (jsonb_array_length(v_novo) - 1);
    IF COALESCE(v_passo ->> 'action', '') NOT IN ('APROVADO', 'REJEITADO')
       OR v_antigo @> jsonb_build_array(v_passo) THEN
        RETURN NEW;
    END IF;

    IF lower(btrim(COALESCE(v_passo ->> 'approved_by', ''))) <> lower(COALESCE(auth.jwt() ->> 'email', '')) THEN
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: a aprovação tem de ser registrada em nome de quem está logado.'
            USING ERRCODE = 'P0001';
    END IF;

    v_linha := to_jsonb(NEW);
    v_org   := (v_linha ->> 'organization_id')::uuid;
    CASE TG_TABLE_NAME
        WHEN 'internal_transactions' THEN
            IF v_linha ->> 'darf_id' IS NOT NULL THEN
                -- DARF: a faixa é a do TOTAL da guia, não a do título-membro.
                v_entity := 'darf';
                SELECT vd.total INTO v_valor FROM public.vw_darfs vd WHERE vd.id = (v_linha ->> 'darf_id')::uuid;
            ELSE
                v_entity := 'transaction';
                v_valor  := (v_linha ->> 'amount')::numeric;
            END IF;
        WHEN 'contracts' THEN
            v_entity := 'contract';
            v_valor  := (v_linha ->> 'current_value')::numeric;
        WHEN 'purchase_orders' THEN
            -- Mesma conta de utils/pedidoItemValor.totalEfetivoDoPedido
            -- (item a item: quotedTotal ?? total ?? 0).
            v_entity := 'purchase_order';
            SELECT COALESCE(sum(COALESCE((i ->> 'quotedTotal')::numeric, (i ->> 'total')::numeric, 0)), 0)
              INTO v_valor
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_linha -> 'items') = 'array'
                                             THEN v_linha -> 'items' ELSE '[]'::jsonb END) i;
        WHEN 'process_instance_steps' THEN
            v_entity := 'process_step';
            v_valor  := 0;
            SELECT pi.organization_id INTO v_org
              FROM public.process_instances pi WHERE pi.id = (v_linha ->> 'process_instance_id')::uuid;
        WHEN 'blueprint_snapshots' THEN
            v_entity := 'blueprint_snapshot';
            v_valor  := 0;
        WHEN 'purchase_requests' THEN
            v_entity := 'purchase_request';
            v_valor  := (v_linha ->> 'estimated_total')::numeric;
        WHEN 'doc_gen_documentos' THEN
            v_entity := 'doc_gen_documento';
            v_valor  := 0;
        ELSE
            RETURN NEW;
    END CASE;

    IF v_org IS NULL THEN
        RETURN NEW;
    END IF;

    v_nivel := CASE WHEN v_passo ->> 'action' = 'APROVADO'
                    THEN COALESCE((v_passo ->> 'level')::integer, 1)
                    ELSE public.fn_alcada_proximo_nivel(v_antigo) END;

    IF NOT public.fn_alcada_pode_aprovar(v_org, v_entity, v_valor, v_nivel) THEN
        SELECT string_agg(a.nome, ', ' ORDER BY a.nome) INTO v_quem
          FROM public.fn_alcada_aprovadores(v_org, v_entity, v_valor, v_nivel) a;
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: o nível % deste item é aprovado por %.', v_nivel, v_quem
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_alcada_trava_passo() FROM PUBLIC, anon;

DO $do$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['internal_transactions', 'contracts', 'purchase_orders', 'process_instance_steps',
                             'blueprint_snapshots', 'purchase_requests', 'doc_gen_documentos']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_zz_alcada_trava_passo ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_zz_alcada_trava_passo BEFORE UPDATE OF approval_chain ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.fn_alcada_trava_passo()', t);
    END LOOP;
END
$do$;

-- ── 5. Fila com `pode_aprovar` e `vez_de` ─────────────────────────────────
-- Corpo dos 5 ramos copiado SEM MUDANÇA de aplicar_20271109300000 (conferido
-- igual ao banco em 10/11/2026); a novidade é a coluna da organização dentro
-- da subconsulta e as duas colunas calculadas por fora. DROP porque o tipo de
-- retorno muda. Quem lê a fila (fn_approval_pending_summary: entity/amount;
-- fn_central_controle_bootstrap: to_jsonb) não depende da forma exata.
DROP FUNCTION IF EXISTS public.fn_approval_action_queue(uuid);
CREATE FUNCTION public.fn_approval_action_queue(p_organization_id uuid)
 RETURNS TABLE(entity text, id uuid, title text, party_name text, project_name text, amount numeric, due_date date, approval_status text, approval_chain jsonb, approval_required_levels integer, origem text, pode_aprovar boolean, vez_de text[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;
  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;
  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;
  RETURN QUERY
  SELECT q.q_entity, q.q_id, q.q_title, q.q_party_name, q.q_project_name, q.q_amount, q.q_due_date,
         q.q_approval_status, q.q_approval_chain, q.q_required_levels, q.q_origem,
         public.fn_alcada_pode_aprovar(q.q_org, q.q_entity, q.q_amount, public.fn_alcada_proximo_nivel(q.q_approval_chain)),
         ARRAY(SELECT a.nome
                 FROM public.fn_alcada_aprovadores(q.q_org, q.q_entity, q.q_amount, public.fn_alcada_proximo_nivel(q.q_approval_chain)) a
                ORDER BY a.nome)
  FROM (
  -- TRANSAÇÕES (saídas)
  --
  -- 26/10/2026 (2º pedido): CONTRATO e PEDIDO DE COMPRA saíram desta fila. O que
  -- se paga são as PARCELAS (títulos em Contas a Pagar), e elas já nascem
  -- PENDENTES; o contrato/pedido entrava pelo valor TOTAL (CTS-042-0001: R$ 2.850
  -- na fila, enquanto o pago são as parcelas). A aprovação de contrato/pedido
  -- nunca tinha sido usada (0 de 43 contratos, 0 de 21 pedidos).
  --
  -- Desde 26/10/2026 todo título a pagar nasce PENDENTE (gatilho
  -- fn_titulo_nasce_na_alcada), de qualquer valor: PENDENTE entra SEM exigir
  -- faixa — exigir deixaria o título abaixo do piso travado e fora da fila.
  -- RASCUNHO (a submeter) continua só na faixa e só em aberto. Membro de DARF
  -- fica fora: o DARF entra como um item só (ramo abaixo).
  --
  -- 09/11/2026: tributo SOLTO também fica fora — tributo só se paga pelo DARF
  -- enviado para aprovação. Exceção: FGTS (guia própria do FGTS Digital) segue
  -- avulso. Mesma régua de utils/darf.ehFgts.
  SELECT
    t.organization_id AS q_org,
    'transaction'::text AS q_entity,
    t.id AS q_id,
    COALESCE(NULLIF(t.description, ''), '(sem descrição)') AS q_title,
    t.party_name AS q_party_name,
    p.name AS q_project_name,
    t.amount AS q_amount,
    t.due_date::date AS q_due_date,
    COALESCE(t.approval_status, 'RASCUNHO') AS q_approval_status,
    COALESCE(t.approval_chain, '[]'::jsonb) AS q_approval_chain,
    COALESCE(t.approval_required_levels, 1) AS q_required_levels,
    CASE WHEN t.party_type = 'TAX' THEN 'TRIBUTO' ELSE t.source_system END AS q_origem
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = ANY(v_targets)
    AND t.direction = 'DEBIT'
    AND t.darf_id IS NULL
    AND t.status <> 'CANCELLED'
    AND COALESCE(t.business_status, '') <> 'RETIDO'
    -- IS DISTINCT FROM: party_type é NULL na maioria dos títulos, e um
    -- `NOT (party_type = 'TAX' AND …)` viraria NULL e tiraria boleto/comercial da fila.
    AND (t.party_type IS DISTINCT FROM 'TAX' OR btrim(COALESCE(t.party_name, '')) ~* '^FGTS\M')
    AND (
      t.approval_status = 'PENDENTE'
      OR (COALESCE(t.approval_status, 'RASCUNHO') = 'RASCUNHO'
          AND t.status = 'PENDING'
          AND EXISTS (
            SELECT 1 FROM public.financial_approval_config c
            WHERE c.organization_id = t.organization_id AND c.is_active
              AND t.amount >= c.faixa_min AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
          ))
    )

  UNION ALL
  -- DARF (26/10/2026): um item por guia, com o total; pendente quando algum membro pende.
  SELECT
    vd.organization_id,
    'darf'::text,
    vd.id,
    'DARF ' || to_char(vd.competencia, 'MM/YYYY') || COALESCE(' — ' || vd.tributos_nomes, ''),
    'Receita Federal (DARF)'::text,
    NULL::text,
    vd.total,
    vd.due_date,
    vd.aprovacao,
    COALESCE(vd.aprovacao_cadeia, '[]'::jsonb),
    (SELECT n.niveis FROM public.fn_darf_niveis(vd.id) n),
    'DARF'::text
  FROM public.vw_darfs vd
  WHERE vd.organization_id = ANY(v_targets)
    AND vd.aprovacao = 'PENDENTE'

  UNION ALL
  -- PLANTA PUBLICADA (blueprint_snapshots)
  --
  -- ⚠️ A condicao aqui e DIFERENTE das tres acima, de proposito. Elas exigem que
  -- o item caia numa faixa de `financial_approval_config` -- porque sao sobre
  -- DINHEIRO, e a faixa e que diz se aquele valor precisa de aprovacao. Uma
  -- revisao de planta nao tem valor: `submit` e chamado com `amount: 0`, como o
  -- proprio approvalService manda fazer para entidade nao monetaria.
  --
  -- Entao o criterio e outro: esta na fila o que ALGUEM ENVIOU. Copiar a
  -- condicao de faixa traria toda revisao publicada para a fila (ou nenhuma,
  -- conforme a organizacao tenha ou nao uma faixa comecando em zero) -- e uma
  -- fila que enche sozinha e uma fila que ninguem olha.
  SELECT
    bs.organization_id,
    'blueprint_snapshot'::text,
    bs.id,
    COALESCE(NULLIF(st.name, ''), '(planta sem nome)') || ' - revisao ' || bs.revision::text,
    NULL::text,
    p.name,
    0::numeric,
    NULL::date,
    COALESCE(bs.approval_status, 'RASCUNHO'),
    COALESCE(bs.approval_chain, '[]'::jsonb),
    COALESCE(bs.approval_required_levels, 1),
    'PLANTA'::text
  FROM public.blueprint_snapshots bs
  JOIN public.blueprint_studies st ON st.id = bs.study_id
  LEFT JOIN public.projects p ON p.id = st.project_id
  WHERE bs.organization_id = ANY(v_targets)
    AND bs.approval_status = 'PENDENTE'

  UNION ALL
  -- SOLICITAÇÕES DE COMPRA (purchase_requests)
  --
  -- ⚠️ Critério igual ao da planta, NÃO ao das compras: está na fila o que
  -- ALGUÉM ENVIOU. A SC é submetida com `semFaixa: 'exigir1'` — toda SC pede
  -- ao menos o nível 1, inclusive a que ainda não tem preço (valor 0). Exigir
  -- que o valor caia numa faixa deixaria essa SC PENDENTE e fora da fila, ou
  -- seja, esperando uma aprovação que ninguém vê.
  SELECT
    pr.organization_id,
    'purchase_request'::text,
    pr.id,
    -- Sem a palavra "Solicitação": a Central já mostra a etiqueta da entidade
    -- ao lado, e a linha lia "Solicitação Solicitação SC-…" (teste de 26/09).
    COALESCE(pr.number || ' — ', '') || pr.title,
    pr.requested_by_name,
    p.name,
    pr.estimated_total,
    pr.need_date,
    pr.approval_status,
    pr.approval_chain,
    pr.approval_required_levels,
    'SOLICITACAO_COMPRA'::text
  FROM public.purchase_requests pr
  LEFT JOIN public.projects p ON p.id = pr.project_id
  WHERE pr.organization_id = ANY(v_targets)
    AND pr.approval_status = 'PENDENTE'
    AND pr.cancelled_at IS NULL

  UNION ALL
  -- OFÍCIOS (doc_gen_documentos) — 10/10/2026, Documentos › Ofícios F4.
  --
  -- ⚠️ Critério da planta e da SC: está na fila o que ALGUÉM ENVIOU. Ofício não
  -- tem valor (amount 0, `semFaixa: 'exigir1'`). Só rascunho: emitido não
  -- volta para a fila.
  SELECT
    d.organization_id,
    'doc_gen_documento'::text,
    d.id,
    COALESCE(NULLIF(btrim(d.assunto), ''), '(ofício sem assunto)'),
    d.destinatario_snapshot ->> 'razao_social',
    p.name,
    0::numeric,
    d.resposta_esperada_ate,
    d.approval_status,
    d.approval_chain,
    d.approval_required_levels,
    'OFICIO'::text
  FROM public.doc_gen_documentos d
  LEFT JOIN public.projects p ON p.id = d.project_id
  WHERE d.organization_id = ANY(v_targets)
    AND d.approval_status = 'PENDENTE'
    AND d.status = 'RASCUNHO'
  ) q
  ORDER BY q.q_due_date NULLS LAST, q.q_amount DESC;

END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) TO authenticated, service_role;

COMMIT;
