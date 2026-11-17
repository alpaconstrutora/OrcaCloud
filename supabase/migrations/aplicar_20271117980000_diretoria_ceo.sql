-- aplicar_20271117980000_diretoria_ceo.sql
-- ÒPURA CEO — painel da Diretoria (1ª entrega, Parte 1). Plano: docs/planos/2026-11-17-opura-ceo.md
-- Prova: scripts/teste-diretoria-ceo.sql (BEGIN … ROLLBACK, termina em TUDO OK).
--
-- O que cria:
--   • Permissão "Diretoria (CEO)" conferida NO BANCO: organization_members.permissions →
--     canViewDiretoria / canEditDiretoria (desligadas para todos por padrão), ou superadmin.
--     _diretoria_orgs(p_editar) = as orgs do usuário em que ele tem a permissão; _diretoria_pode().
--   • 5 tabelas diretoria_* (áreas, hierarquia, determinações, atualizações, cobranças). Só
--     SELECT pela RLS; toda gravação passa pelas RPCs fn_diretoria_* (SECURITY DEFINER, com a
--     permissão de editar conferida dentro — REGRA #7).
--   • _fila_aprovacao_itens(p_orgs): a consulta da fila de aprovação SEM depender de auth.uid()
--     (o resumo semanal roda sem usuário). fn_approval_action_queue vira casca dela, com a
--     MESMA assinatura e a MESMA saída (a prova compara antes × depois).
--   • _diretoria_excecoes(p_orgs, p_hoje): as exceções agrupadas por tipo · org · conta ·
--     responsáveis · gravidade, cada tipo com a regra da tela de origem e num bloco próprio
--     (um tipo que cair vai para "erros" e os outros seguem — molde da Central).
--   • fn_diretoria_painel(p_org): tudo o que a tela precisa numa chamada.
--   • preferencias: chave 'diretoria.%' (visão escolhida, tipos silenciados, resumo por e-mail).
--
-- Aplicar: npx supabase db query --linked -f supabase/migrations/aplicar_20271117980000_diretoria_ceo.sql
-- (nunca `supabase db push`).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. preferências: chave diretoria.* ─────────────────────────────────────────
ALTER TABLE public.preferencias DROP CONSTRAINT preferencias_chave_sanidade;
ALTER TABLE public.preferencias ADD CONSTRAINT preferencias_chave_sanidade
    CHECK ((chave LIKE 'planta.%' OR chave LIKE 'suprimentos.%' OR chave LIKE 'diretoria.%') AND length(chave) <= 100);

-- ── 2. permissão ────────────────────────────────────────────────────────────────
-- Orgs do usuário (minhas_orgs_membro) em que ele tem a permissão Diretoria. Editar = só
-- canEditDiretoria; ver = canViewDiretoria ou canEditDiretoria. Superadmin vê e edita nas
-- orgs de que é membro. Sem usuário na requisição = conjunto vazio.
CREATE OR REPLACE FUNCTION public._diretoria_orgs(p_editar boolean DEFAULT false)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT o
      FROM public.minhas_orgs_membro() o
     WHERE auth.uid() IS NOT NULL
       AND (public.is_superadmin()
            OR EXISTS (SELECT 1 FROM public.organization_members m
                        WHERE m.organization_id = o
                          AND m.user_id = auth.uid()
                          AND (COALESCE(m.permissions ->> 'canEditDiretoria', 'false') = 'true'
                               OR (NOT p_editar AND COALESCE(m.permissions ->> 'canViewDiretoria', 'false') = 'true'))))
$$;

CREATE OR REPLACE FUNCTION public._diretoria_pode(p_org uuid, p_editar boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_org IS NOT NULL AND p_org IN (SELECT public._diretoria_orgs(p_editar))
$$;

-- Usadas pelas policies (rodam como o usuário): só dizem o que o PRÓPRIO usuário pode.
REVOKE EXECUTE ON FUNCTION public._diretoria_orgs(boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._diretoria_pode(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._diretoria_orgs(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._diretoria_pode(uuid, boolean) TO authenticated, service_role;

-- ── 3. tabelas ──────────────────────────────────────────────────────────────────
CREATE TABLE public.diretoria_responsaveis_area (
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    area            text NOT NULL CHECK (area IN ('financeiro', 'comercial', 'suprimentos', 'rh', 'obras')),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    atualizado_por  uuid,
    atualizado_em   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, area)
);
COMMENT ON TABLE public.diretoria_responsaveis_area IS
    'Diretoria (ÒPURA CEO): quem responde por cada área na organização. Recebe as exceções cujo dado não aponta pessoa. Grava só fn_diretoria_definir_area.';

CREATE TABLE public.diretoria_hierarquia (
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chefe_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    atualizado_por  uuid,
    atualizado_em   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id),
    CHECK (user_id <> chefe_user_id)
);
COMMENT ON TABLE public.diretoria_hierarquia IS
    'Diretoria (ÒPURA CEO): quem responde a quem, por organização. Sem ciclo (conferido em fn_diretoria_definir_chefe, a única que grava).';

CREATE TABLE public.diretoria_determinacoes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    titulo              text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 300),
    responsavel_user_id uuid NOT NULL,
    prazo               date NOT NULL,
    status              text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'andamento', 'concluida')),
    origem              text CHECK (origem IS NULL OR length(origem) <= 300),
    excecao_chave       text CHECK (excecao_chave IS NULL OR length(excecao_chave) <= 500),
    tarefa_id           uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
    criada_por          uuid,
    criada_em           timestamptz NOT NULL DEFAULT now(),
    concluida_por       uuid,
    concluida_em        timestamptz
);
CREATE INDEX diretoria_determinacoes_org_status ON public.diretoria_determinacoes (organization_id, status);
CREATE INDEX diretoria_determinacoes_responsavel ON public.diretoria_determinacoes (responsavel_user_id);
COMMENT ON TABLE public.diretoria_determinacoes IS
    'Diretoria (ÒPURA CEO): decisão com responsável e prazo. Criar põe uma tarefa na agenda do responsável; concluir fecha a tarefa. Grava só por fn_diretoria_*.';

CREATE TABLE public.diretoria_determinacao_atualizacoes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    determinacao_id uuid NOT NULL REFERENCES public.diretoria_determinacoes(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    texto           text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 1000),
    autor           uuid,
    criada_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diretoria_atualizacoes_det ON public.diretoria_determinacao_atualizacoes (determinacao_id, criada_em);
COMMENT ON TABLE public.diretoria_determinacao_atualizacoes IS
    'Diretoria (ÒPURA CEO): "o que andou" de cada determinação. Só acréscimo (fn_diretoria_atualizar).';

CREATE TABLE public.diretoria_cobrancas (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    excecao_chave       text NOT NULL CHECK (length(excecao_chave) BETWEEN 1 AND 500),
    tipo                text NOT NULL CHECK (length(tipo) BETWEEN 1 AND 60),
    titulo              text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 300),
    responsavel_user_id uuid NOT NULL,
    tarefa_id           uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
    cobrado_por         uuid,
    cobrado_em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diretoria_cobrancas_org_em ON public.diretoria_cobrancas (organization_id, cobrado_em DESC);
COMMENT ON TABLE public.diretoria_cobrancas IS
    'Diretoria (ÒPURA CEO): registro de cada "Cobrar" (quem cria tarefa na agenda de outro não a enxerga depois — tasks_select = dono). Só acréscimo.';

-- RLS: só leitura, por conjunto (a função roda uma vez por consulta). Gravação = RPC.
ALTER TABLE public.diretoria_responsaveis_area         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diretoria_hierarquia                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diretoria_determinacoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diretoria_determinacao_atualizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diretoria_cobrancas                 ENABLE ROW LEVEL SECURITY;

-- Os default privileges do Supabase dão ALL a anon e authenticated: tira tudo, devolve só SELECT.
REVOKE ALL ON TABLE public.diretoria_responsaveis_area, public.diretoria_hierarquia, public.diretoria_determinacoes,
                    public.diretoria_determinacao_atualizacoes, public.diretoria_cobrancas
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.diretoria_responsaveis_area, public.diretoria_hierarquia, public.diretoria_determinacoes,
                      public.diretoria_determinacao_atualizacoes, public.diretoria_cobrancas
  TO authenticated;
GRANT ALL ON TABLE public.diretoria_responsaveis_area, public.diretoria_hierarquia, public.diretoria_determinacoes,
                   public.diretoria_determinacao_atualizacoes, public.diretoria_cobrancas
  TO service_role;

CREATE POLICY diretoria_responsaveis_area_select ON public.diretoria_responsaveis_area
    FOR SELECT TO authenticated USING (organization_id IN (SELECT public._diretoria_orgs(false)));
CREATE POLICY diretoria_hierarquia_select ON public.diretoria_hierarquia
    FOR SELECT TO authenticated USING (organization_id IN (SELECT public._diretoria_orgs(false)));
-- Pergunta 1 da REGRA #7: a 2ª perna basta sozinha DE PROPÓSITO — o responsável enxerga a
-- determinação dele mesmo sem a permissão Diretoria (decisão 7 do plano). Ela diz com quem:
-- com a própria pessoa.
CREATE POLICY diretoria_determinacoes_select ON public.diretoria_determinacoes
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public._diretoria_orgs(false))
           OR responsavel_user_id = (SELECT auth.uid()));
CREATE POLICY diretoria_atualizacoes_select ON public.diretoria_determinacao_atualizacoes
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public._diretoria_orgs(false))
           OR determinacao_id IN (SELECT d.id FROM public.diretoria_determinacoes d
                                   WHERE d.responsavel_user_id = (SELECT auth.uid())));
CREATE POLICY diretoria_cobrancas_select ON public.diretoria_cobrancas
    FOR SELECT TO authenticated USING (organization_id IN (SELECT public._diretoria_orgs(false)));

-- ── 4. fila de aprovação sem auth ───────────────────────────────────────────────
-- A consulta abaixo é a de fn_approval_action_queue COPIADA DO BANCO (17/11), sem mudança
-- de regra; só `v_targets` virou o parâmetro `p_orgs`. Com usuário na requisição, p_orgs
-- tem de estar nas orgs dele (a casca já garante; isto é a rede). Sem usuário (cron,
-- service_role), a autorização é de quem chama — e só postgres/service_role/as RPCs chamam.
CREATE OR REPLACE FUNCTION public._fila_aprovacao_itens(p_orgs uuid[])
RETURNS TABLE(q_org uuid, q_entity text, q_id uuid, q_title text, q_party_name text, q_project_name text,
              q_amount numeric, q_due_date date, q_approval_status text, q_approval_chain jsonb,
              q_required_levels integer, q_origem text)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p_orgs) o WHERE o NOT IN (SELECT public.minhas_orgs_membro())) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT * FROM (
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
  WHERE t.organization_id = ANY(p_orgs)
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
  WHERE vd.organization_id = ANY(p_orgs)
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
  WHERE bs.organization_id = ANY(p_orgs)
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
  WHERE pr.organization_id = ANY(p_orgs)
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
  WHERE d.organization_id = ANY(p_orgs)
    AND d.approval_status = 'PENDENTE'
    AND d.status = 'RASCUNHO'
  ) q;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._fila_aprovacao_itens(uuid[]) FROM PUBLIC, anon;
-- authenticated: fn_approval_action_queue é INVOKER e a chama; com usuário, a guarda acima só
-- aceita orgs dele.
GRANT EXECUTE ON FUNCTION public._fila_aprovacao_itens(uuid[]) TO authenticated, service_role;

-- Mesma assinatura, mesmo retorno, mesma resolução de organizações e mesma ordem de antes;
-- a consulta passou para _fila_aprovacao_itens. CREATE OR REPLACE mantém os privilégios.
CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(p_organization_id uuid)
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
  FROM public._fila_aprovacao_itens(v_targets) q
  ORDER BY q.q_due_date NULLS LAST, q.q_amount DESC;
END;
$function$;

-- ── 5. exceções ─────────────────────────────────────────────────────────────────
-- Faixa de atraso (dias depois do vencimento): > 30 pede decisão, 8–30 atenção, até 7 acompanhar.
CREATE OR REPLACE FUNCTION public._diretoria_faixa_atraso(p_dias integer)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN p_dias > 30 THEN 'critico' WHEN p_dias >= 8 THEN 'atencao' ELSE 'acompanhar' END
$$;

-- Responsável: o que o dado aponta; senão o da área; senão ninguém.
CREATE OR REPLACE FUNCTION public._diretoria_resp(p_dado uuid[], p_area uuid, OUT resp uuid[], OUT origem text)
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN cardinality(array_remove(p_dado, NULL)) > 0 THEN array_remove(p_dado, NULL)
                WHEN p_area IS NOT NULL THEN ARRAY[p_area]
                ELSE '{}'::uuid[] END,
           CASE WHEN cardinality(array_remove(p_dado, NULL)) > 0 THEN 'dado'
                WHEN p_area IS NOT NULL THEN 'area'
                ELSE 'nenhum' END
$$;

-- Agrupa os itens de um tipo por org · grupo (conta) · responsáveis · origem · gravidade.
-- Cada grupo leva no máximo 20 itens (os de maior valor; empate, os mais atrasados).
CREATE OR REPLACE FUNCTION public._diretoria_agrupar(p_tipo text, p_itens jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
    WITH b AS (
        SELECT (e->>'org')::uuid                                   AS org,
               NULLIF(e->>'grupo', '')                             AS grupo,
               ARRAY(SELECT DISTINCT y::uuid
                       FROM jsonb_array_elements_text(COALESCE(e->'resp', '[]'::jsonb)) y
                      ORDER BY 1)                                  AS resp,
               COALESCE(e->>'origem', 'nenhum')                    AS origem,
               e->>'sev'                                           AS sev,
               e->>'id'                                            AS id,
               left(e->>'titulo', 200)                             AS titulo,
               (e->>'valor')::numeric                              AS valor,
               (e->>'dias')::integer                               AS dias,
               (e->>'data')::date                                  AS data
          FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) e
    ), r AS (
        SELECT b.*, row_number() OVER (PARTITION BY org, grupo, resp, origem, sev
                                       ORDER BY valor DESC NULLS LAST, dias DESC NULLS LAST, id) AS rn
          FROM b
    ), g AS (
        SELECT org, grupo, resp, origem, sev,
               count(*)       AS qtd,
               sum(valor)     AS valor,
               max(dias)      AS dias,
               min(data)      AS data_ref,
               jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'valor', valor, 'dias', dias, 'data', data)
                         ORDER BY rn) FILTER (WHERE rn <= 20) AS itens
          FROM r
         GROUP BY org, grupo, resp, origem, sev
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'chave', md5(p_tipo || '|' || org::text || '|' || COALESCE(grupo, '') || '|'
                            || array_to_string(resp, ',') || '|' || origem || '|' || sev),
               'tipo', p_tipo, 'org_id', org, 'grupo', grupo, 'severidade', sev,
               'origem_responsavel', origem, 'responsaveis', to_jsonb(resp),
               'quantidade', qtd, 'valor', valor, 'dias', dias, 'data_ref', data_ref,
               'itens', COALESCE(itens, '[]'::jsonb))
             ORDER BY CASE sev WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END, valor DESC NULLS LAST, qtd DESC),
           '[]'::jsonb)
      FROM g
$$;

-- As exceções das orgs p_orgs. NÃO confere permissão: quem chama já recortou p_orgs
-- (fn_diretoria_painel pelo usuário; o resumo semanal pela permissão de cada destinatário).
-- Roda dentro de função SECURITY DEFINER (dono postgres): a RLS não entra, o recorte é o
-- `= ANY(p_orgs)` explícito de cada bloco. Um bloco por tipo: o que cair vai para "erros".
-- "dias" = dias depois da data de referência (negativo = ainda faltam dias).
CREATE OR REPLACE FUNCTION public._diretoria_excecoes(p_orgs uuid[], p_hoje date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_areas  jsonb;
    v_itens  jsonb;
    v_grupos jsonb := '[]'::jsonb;
    v_erros  jsonb := '{}'::jsonb;
BEGIN
    SELECT COALESCE(jsonb_object_agg(a.organization_id::text || ':' || a.area, a.user_id), '{}'::jsonb)
      INTO v_areas
      FROM public.diretoria_responsaveis_area a
     WHERE a.organization_id = ANY(p_orgs);

    -- Conta a pagar vencida: o "Vencido" de Contas a pagar. Área Financeiro.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', v.organization_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', v.id,
                   'titulo', COALESCE(NULLIF(btrim(v.party_name), ''), '(sem credor)')
                             || COALESCE(' — ' || NULLIF(btrim(v.description), ''), ''),
                   'valor', v.amount, 'dias', p_hoje - v.due_date, 'data', v.due_date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - v.due_date)))
          INTO v_itens
          FROM public.vw_payables v
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (v.organization_id::text || ':financeiro'))::uuid) r
         WHERE v.organization_id = ANY(p_orgs)
           AND v.effective_status = 'VENCIDO';
        v_grupos := v_grupos || public._diretoria_agrupar('conta_vencida', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('conta_vencida', SQLERRM);
    END;

    -- Parcela de cliente vencida: o "Vencido" de Contas a receber. Área Comercial.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', v.organization_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', v.id,
                   'titulo', COALESCE(NULLIF(btrim(v.party_name), ''), '(sem cliente)')
                             || COALESCE(' — ' || NULLIF(btrim(v.description), ''), ''),
                   'valor', v.amount, 'dias', p_hoje - v.due_date, 'data', v.due_date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - v.due_date)))
          INTO v_itens
          FROM public.vw_receivables v
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (v.organization_id::text || ':comercial'))::uuid) r
         WHERE v.organization_id = ANY(p_orgs)
           AND v.effective_status = 'VENCIDO';
        v_grupos := v_grupos || public._diretoria_agrupar('parcela_cliente', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('parcela_cliente', SQLERRM);
    END;

    -- Extrato sem conciliar há mais de 7 dias (o "pendente" da Conciliação), por conta. Financeiro.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', t.organization_id, 'grupo', COALESCE(NULLIF(btrim(pa.name), ''), 'Conta sem nome'),
                   'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', t.id,
                   'titulo', COALESCE(NULLIF(btrim(t.description_raw), ''), '(sem histórico)'),
                   'valor', abs(t.amount), 'dias', p_hoje - t.transaction_date, 'data', t.transaction_date,
                   'sev', CASE WHEN p_hoje - t.transaction_date > 30 THEN 'critico' ELSE 'atencao' END))
          INTO v_itens
          FROM public.bank_transactions t
          LEFT JOIN public.payment_accounts pa ON pa.id = t.bank_account_id
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (t.organization_id::text || ':financeiro'))::uuid) r
         WHERE t.organization_id = ANY(p_orgs)
           AND public.fn_bank_tx_pendente(t.status)
           AND t.transaction_date < p_hoje - 7;
        v_grupos := v_grupos || public._diretoria_agrupar('extrato_sem_conciliar', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('extrato_sem_conciliar', SQLERRM);
    END;

    -- Aprovação parada: item da fila de aprovação que vence em até 3 dias ou já venceu.
    -- Responsáveis = aprovadores do próximo nível (a mesma conta da fila); sem eles, Financeiro.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', q.q_org, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', q.q_entity || ':' || q.q_id,
                   'titulo', q.q_title || COALESCE(' — ' || NULLIF(btrim(q.q_party_name), ''), ''),
                   'valor', NULLIF(q.q_amount, 0), 'dias', p_hoje - q.q_due_date, 'data', q.q_due_date,
                   'sev', CASE WHEN q.q_due_date < p_hoje THEN 'critico' ELSE 'atencao' END))
          INTO v_itens
          FROM (SELECT f.* FROM public._fila_aprovacao_itens(p_orgs) f
                 WHERE f.q_due_date IS NOT NULL AND f.q_due_date <= p_hoje + 3) q
         CROSS JOIN LATERAL (SELECT ARRAY(SELECT a.user_id
                                            FROM public.fn_alcada_aprovadores(q.q_org, q.q_entity, q.q_amount,
                                                                              public.fn_alcada_proximo_nivel(q.q_approval_chain)) a
                                           WHERE a.user_id IS NOT NULL) AS ids) ap
         CROSS JOIN LATERAL public._diretoria_resp(ap.ids, (v_areas ->> (q.q_org::text || ':financeiro'))::uuid) r;
        v_grupos := v_grupos || public._diretoria_agrupar('aprovacao_parada', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('aprovacao_parada', SQLERRM);
    END;

    -- Locação Ativa/Assinada que termina em até 30 dias (ou já terminou) sem contrato de
    -- renovação (filho). Responsável = responsible_email quando é membro; senão Comercial.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', c.organization_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', c.id,
                   'titulo', COALESCE(NULLIF(btrim(c.number), '') || ' — ', '') || COALESCE(NULLIF(btrim(c.title), ''), '(sem título)'),
                   'valor', c.current_value, 'dias', p_hoje - c.end_date, 'data', c.end_date,
                   'sev', CASE WHEN c.end_date < p_hoje THEN 'critico'
                               WHEN c.end_date <= p_hoje + 7 THEN 'atencao' ELSE 'acompanhar' END))
          INTO v_itens
          FROM public.contracts c
          LEFT JOIN LATERAL (SELECT m.user_id FROM public.organization_members m
                              WHERE m.organization_id = c.organization_id AND m.user_id IS NOT NULL
                                AND lower(btrim(m.email)) = lower(btrim(c.responsible_email))
                              LIMIT 1) rm ON true
         CROSS JOIN LATERAL public._diretoria_resp(ARRAY[rm.user_id], (v_areas ->> (c.organization_id::text || ':comercial'))::uuid) r
         WHERE c.organization_id = ANY(p_orgs)
           AND c.domain = 'LOCACAO'
           AND c.status IN ('Ativo', 'Assinado')
           AND c.end_date IS NOT NULL
           AND c.end_date <= p_hoje + 30
           AND NOT EXISTS (SELECT 1 FROM public.contracts f WHERE f.parent_contract_id = c.id);
        v_grupos := v_grupos || public._diretoria_agrupar('contrato_vencendo', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('contrato_vencendo', SQLERRM);
    END;

    -- Entrega atrasada: a condição de fn_risk_sinais, menos o rascunho (não foi enviado ao
    -- fornecedor). Responsável = quem criou o pedido, quando é membro; senão Suprimentos.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', po.organization_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', po.id,
                   'titulo', 'Pedido ' || COALESCE(NULLIF(btrim(po.number), ''), left(po.id::text, 8))
                             || COALESCE(' — ' || NULLIF(btrim(s.name), ''), ''),
                   'valor', NULL, 'dias', p_hoje - po.delivery_date, 'data', po.delivery_date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - po.delivery_date)))
          INTO v_itens
          FROM public.purchase_orders po
          LEFT JOIN public.suppliers s ON s.id = po.supplier_id
         CROSS JOIN LATERAL public._diretoria_resp(
                ARRAY[(SELECT m.user_id FROM public.organization_members m
                        WHERE m.organization_id = po.organization_id AND m.user_id = po.criado_por LIMIT 1)],
                (v_areas ->> (po.organization_id::text || ':suprimentos'))::uuid) r
         WHERE po.organization_id = ANY(p_orgs)
           AND po.delivery_date IS NOT NULL
           AND po.actual_delivery_date IS NULL
           AND po.status NOT IN ('Entregue', 'Recebido', 'Cancelado', 'Rascunho')
           AND po.delivery_date < p_hoje;
        v_grupos := v_grupos || public._diretoria_agrupar('entrega_atrasada', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('entrega_atrasada', SQLERRM);
    END;

    -- Documento de colaborador vencido: o critério de rh_kpis_calcular. Área RH.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', ed.org_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', ed.id,
                   'titulo', e.name || ' — ' || COALESCE(NULLIF(btrim(ed.title), ''), ed.category, 'documento'),
                   'valor', NULL, 'dias', p_hoje - ed.expiry_date, 'data', ed.expiry_date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - ed.expiry_date)))
          INTO v_itens
          FROM public.employee_documents ed
          JOIN public.employees e ON e.id = ed.employee_id
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (ed.org_id::text || ':rh'))::uuid) r
         WHERE ed.org_id = ANY(p_orgs)
           AND ed.status = 'ATIVO'
           AND ed.expiry_date IS NOT NULL
           AND ed.expiry_date < p_hoje;
        v_grupos := v_grupos || public._diretoria_agrupar('documento_vencido', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('documento_vencido', SQLERRM);
    END;

    -- Férias: período concessivo com saldo que acaba em até 60 dias ou já acabou (o critério
    -- de rh_kpis_calcular). Vencido pede decisão (paga em dobro). Área RH.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', vb.org_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', vb.id,
                   'titulo', e.name || ' — ' || vb.dias_restantes || ' dias a gozar',
                   'valor', NULL, 'dias', p_hoje - vb.vencimento, 'data', vb.vencimento,
                   'sev', CASE WHEN vb.vencimento < p_hoje THEN 'critico'
                               WHEN vb.vencimento <= p_hoje + 30 THEN 'atencao' ELSE 'acompanhar' END))
          INTO v_itens
          FROM public.vacation_balance vb
          JOIN public.employees e ON e.id = vb.employee_id
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (vb.org_id::text || ':rh'))::uuid) r
         WHERE vb.org_id = ANY(p_orgs)
           AND vb.dias_restantes > 0
           AND vb.vencimento IS NOT NULL
           AND vb.vencimento <= p_hoje + 60;
        v_grupos := v_grupos || public._diretoria_agrupar('ferias_vencendo', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('ferias_vencendo', SQLERRM);
    END;

    -- Tarefa vencida DE EQUIPE (com colaborador responsável ou num espaço): a agenda pessoal
    -- não é assunto da diretoria. Responsável = login do colaborador; senão o dono.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', t.org_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', t.id,
                   'titulo', COALESCE(NULLIF(btrim(t.title), ''), '(sem título)'),
                   'valor', NULL,
                   'dias', p_hoje - (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date,
                   'data', (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date)))
          INTO v_itens
          FROM public.tasks t
          LEFT JOIN public.employees e ON e.id = t.assignee_employee_id
         CROSS JOIN LATERAL public._diretoria_resp(ARRAY[COALESCE(e.user_id, t.user_id)], NULL::uuid) r
         WHERE t.org_id = ANY(p_orgs)
           AND t.status = 'open'
           AND t.due_date IS NOT NULL
           AND t.due_date < now()
           AND (t.assignee_employee_id IS NOT NULL OR t.space_id IS NOT NULL);
        v_grupos := v_grupos || public._diretoria_agrupar('tarefa_vencida', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('tarefa_vencida', SQLERRM);
    END;

    RETURN jsonb_build_object('grupos', v_grupos, 'erros', v_erros);
END;
$function$;

-- ── 6. montagem do painel ───────────────────────────────────────────────────────
-- Tudo o que a tela precisa, para as orgs p_orgs (já recortadas por quem chama).
CREATE OR REPLACE FUNCTION public._diretoria_painel_montar(p_orgs uuid[], p_hoje date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_exc     jsonb;
    v_det     jsonb;
    v_pessoas jsonb;
    v_ids     uuid[];
BEGIN
    v_exc := public._diretoria_excecoes(p_orgs, p_hoje);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', d.id, 'organization_id', d.organization_id, 'titulo', d.titulo,
               'responsavel_user_id', d.responsavel_user_id, 'prazo', d.prazo, 'status', d.status,
               'origem', d.origem, 'excecao_chave', d.excecao_chave, 'criada_por', d.criada_por,
               'criada_em', d.criada_em, 'concluida_em', d.concluida_em,
               'atualizacoes', COALESCE((SELECT jsonb_agg(jsonb_build_object('texto', a.texto, 'autor', a.autor, 'criada_em', a.criada_em)
                                                          ORDER BY a.criada_em DESC)
                                           FROM public.diretoria_determinacao_atualizacoes a
                                          WHERE a.determinacao_id = d.id), '[]'::jsonb))
             ORDER BY d.prazo, d.criada_em), '[]'::jsonb)
      INTO v_det
      FROM public.diretoria_determinacoes d
     WHERE d.organization_id = ANY(p_orgs)
       AND (d.status <> 'concluida' OR d.concluida_em > now() - interval '30 days');

    -- Pessoas: membros das orgs, mais quem aparece como responsável sem ser membro (login de
    -- colaborador numa tarefa de equipe) — para a tela nunca mostrar um id cru.
    v_ids := ARRAY(
        SELECT DISTINCT y::uuid FROM jsonb_array_elements(v_exc->'grupos') g, jsonb_array_elements_text(g->'responsaveis') y
        UNION SELECT (x->>'responsavel_user_id')::uuid FROM jsonb_array_elements(v_det) x
        UNION SELECT (x->>'criada_por')::uuid FROM jsonb_array_elements(v_det) x WHERE x->>'criada_por' IS NOT NULL
    );
    SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'nome', p.nome, 'email', p.email,
                                                 'cargo', p.cargo, 'orgs', to_jsonb(p.orgs))
                              ORDER BY lower(p.nome)), '[]'::jsonb)
      INTO v_pessoas
      FROM (
        SELECT u.user_id,
               COALESCE((SELECT NULLIF(btrim(m.name), '') FROM public.organization_members m
                          WHERE m.user_id = u.user_id AND m.organization_id = ANY(p_orgs)
                            AND NULLIF(btrim(m.name), '') IS NOT NULL LIMIT 1),
                        NULLIF(btrim(pf.name), ''),
                        (SELECT NULLIF(btrim(e.name), '') FROM public.employees e
                          WHERE e.user_id = u.user_id AND NULLIF(btrim(e.name), '') IS NOT NULL LIMIT 1),
                        (SELECT m.email FROM public.organization_members m
                          WHERE m.user_id = u.user_id AND m.organization_id = ANY(p_orgs) LIMIT 1),
                        'Pessoa sem nome') AS nome,
               (SELECT m.email FROM public.organization_members m
                 WHERE m.user_id = u.user_id AND m.organization_id = ANY(p_orgs) LIMIT 1) AS email,
               (SELECT NULLIF(btrim(m.cargo), '') FROM public.organization_members m
                 WHERE m.user_id = u.user_id AND m.organization_id = ANY(p_orgs)
                   AND NULLIF(btrim(m.cargo), '') IS NOT NULL LIMIT 1) AS cargo,
               ARRAY(SELECT DISTINCT m.organization_id FROM public.organization_members m
                      WHERE m.user_id = u.user_id AND m.organization_id = ANY(p_orgs)) AS orgs
          FROM (SELECT m.user_id FROM public.organization_members m
                 WHERE m.organization_id = ANY(p_orgs) AND m.user_id IS NOT NULL
                UNION
                SELECT unnest(v_ids)) u
          LEFT JOIN public.profiles pf ON pf.id = u.user_id
         WHERE u.user_id IS NOT NULL
      ) p;

    RETURN jsonb_build_object(
        'hoje', p_hoje,
        'excecoes', v_exc->'grupos',
        'erros', v_exc->'erros',
        'pessoas', v_pessoas,
        'hierarquia', (SELECT COALESCE(jsonb_agg(jsonb_build_object('organization_id', h.organization_id, 'user_id', h.user_id,
                                                                    'chefe_user_id', h.chefe_user_id, 'atualizado_em', h.atualizado_em)), '[]'::jsonb)
                         FROM public.diretoria_hierarquia h WHERE h.organization_id = ANY(p_orgs)),
        'areas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('organization_id', a.organization_id, 'area', a.area,
                                                               'user_id', a.user_id, 'atualizado_em', a.atualizado_em)), '[]'::jsonb)
                    FROM public.diretoria_responsaveis_area a WHERE a.organization_id = ANY(p_orgs)),
        'determinacoes', v_det,
        'cobrancas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('organization_id', c.organization_id, 'excecao_chave', c.excecao_chave,
                                                                   'tipo', c.tipo, 'titulo', c.titulo, 'responsavel_user_id', c.responsavel_user_id,
                                                                   'cobrado_por', c.cobrado_por, 'cobrado_em', c.cobrado_em)
                                                ORDER BY c.cobrado_em DESC), '[]'::jsonb)
                        FROM public.diretoria_cobrancas c
                       WHERE c.organization_id = ANY(p_orgs) AND c.cobrado_em > now() - interval '14 days')
    );
END;
$function$;

-- ── 7. painel (RPC) ─────────────────────────────────────────────────────────────
-- p_org = a org do seletor do topo; nulo = "Todas" (as orgs do usuário em que ele tem a
-- permissão). Org pedida sem a permissão → 42501.
CREATE OR REPLACE FUNCTION public.fn_diretoria_painel(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_orgs uuid[];
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'sem acesso: o painel da diretoria exige um usuário' USING ERRCODE = '42501';
    END IF;
    IF p_org IS NOT NULL THEN
        IF NOT public._diretoria_pode(p_org, false) THEN
            RAISE EXCEPTION 'sem acesso: falta a permissão "Diretoria (CEO)" nesta organização' USING ERRCODE = '42501';
        END IF;
        v_orgs := ARRAY[p_org];
    ELSE
        v_orgs := ARRAY(SELECT public._diretoria_orgs(false));
    END IF;

    RETURN public._diretoria_painel_montar(v_orgs, v_hoje)
        || jsonb_build_object('orgs', COALESCE((
               SELECT jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.name,
                                                   'pode_editar', public._diretoria_pode(o.id, true)) ORDER BY o.name)
                 FROM public.organizations o WHERE o.id = ANY(v_orgs)), '[]'::jsonb));
END;
$function$;

-- ── 8. gravações (RPC) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._diretoria_exige_editar(p_org uuid)
RETURNS void LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR p_org IS NULL OR NOT public._diretoria_pode(p_org, true) THEN
        RAISE EXCEPTION 'sem acesso: falta a permissão "Diretoria (CEO) · editar" nesta organização' USING ERRCODE = '42501';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public._diretoria_exige_membro(p_org uuid, p_user uuid, p_papel text)
RETURNS void LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members m
                                      WHERE m.organization_id = p_org AND m.user_id = p_user) THEN
        RAISE EXCEPTION '% precisa ser membro desta organização', p_papel USING ERRCODE = '22023';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_diretoria_definir_area(p_org uuid, p_area text, p_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public._diretoria_exige_editar(p_org);
    IF p_area IS NULL OR p_area NOT IN ('financeiro', 'comercial', 'suprimentos', 'rh', 'obras') THEN
        RAISE EXCEPTION 'área desconhecida: % (use financeiro, comercial, suprimentos, rh ou obras)', p_area USING ERRCODE = '22023';
    END IF;
    IF p_user IS NULL THEN
        DELETE FROM public.diretoria_responsaveis_area WHERE organization_id = p_org AND area = p_area;
        RETURN;
    END IF;
    PERFORM public._diretoria_exige_membro(p_org, p_user, 'o responsável da área');
    INSERT INTO public.diretoria_responsaveis_area (organization_id, area, user_id, atualizado_por, atualizado_em)
    VALUES (p_org, p_area, p_user, auth.uid(), now())
    ON CONFLICT (organization_id, area)
    DO UPDATE SET user_id = EXCLUDED.user_id, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
END $$;

CREATE OR REPLACE FUNCTION public.fn_diretoria_definir_chefe(p_org uuid, p_user uuid, p_chefe uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public._diretoria_exige_editar(p_org);
    PERFORM public._diretoria_exige_membro(p_org, p_user, 'quem responde');
    IF p_chefe IS NULL THEN
        DELETE FROM public.diretoria_hierarquia WHERE organization_id = p_org AND user_id = p_user;
        RETURN;
    END IF;
    PERFORM public._diretoria_exige_membro(p_org, p_chefe, 'o chefe');
    IF p_chefe = p_user THEN
        RAISE EXCEPTION 'ciclo: ninguém responde a si mesmo' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (WITH RECURSIVE acima(u) AS (
                   SELECT p_chefe
                   UNION
                   SELECT h.chefe_user_id FROM public.diretoria_hierarquia h JOIN acima a ON h.user_id = a.u
                    WHERE h.organization_id = p_org)
               SELECT 1 FROM acima WHERE u = p_user) THEN
        RAISE EXCEPTION 'ciclo: quem você escolheu como chefe já responde, direta ou indiretamente, a esta pessoa' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.diretoria_hierarquia (organization_id, user_id, chefe_user_id, atualizado_por, atualizado_em)
    VALUES (p_org, p_user, p_chefe, auth.uid(), now())
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET chefe_user_id = EXCLUDED.chefe_user_id, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
END $$;

CREATE OR REPLACE FUNCTION public.fn_diretoria_determinar(p_org uuid, p_titulo text, p_responsavel uuid, p_prazo date,
                                                          p_origem text, p_excecao_chave text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_titulo text := btrim(COALESCE(p_titulo, ''));
    v_id     uuid;
    v_tarefa uuid;
BEGIN
    PERFORM public._diretoria_exige_editar(p_org);
    IF length(v_titulo) = 0 OR length(v_titulo) > 300 THEN
        RAISE EXCEPTION 'a determinação precisa de um título (até 300 caracteres)' USING ERRCODE = '22023';
    END IF;
    IF p_prazo IS NULL THEN
        RAISE EXCEPTION 'a determinação precisa de um prazo' USING ERRCODE = '22023';
    END IF;
    PERFORM public._diretoria_exige_membro(p_org, p_responsavel, 'o responsável');

    INSERT INTO public.diretoria_determinacoes (organization_id, titulo, responsavel_user_id, prazo, origem, excecao_chave, criada_por)
    VALUES (p_org, v_titulo, p_responsavel, p_prazo, NULLIF(btrim(left(p_origem, 300)), ''),
            NULLIF(left(p_excecao_chave, 500), ''), auth.uid())
    RETURNING id INTO v_id;

    -- Na agenda do responsável, com o prazo às 18:00 de Brasília. create_task confere de novo
    -- (quem cria é da org; o responsável é membro dela).
    v_tarefa := public.create_task(
        p_responsavel, p_org, left('Determinação da diretoria: ' || v_titulo, 300),
        (p_prazo::timestamp + time '18:00') AT TIME ZONE 'America/Sao_Paulo',
        'diretoria', jsonb_build_object('type', 'determinacao', 'id', v_id::text, 'view', 'diretoria'), 2::smallint,
        'Prazo: ' || to_char(p_prazo, 'DD/MM/YYYY') || COALESCE('. Origem: ' || NULLIF(btrim(p_origem), ''), '')
            || '. Acompanhamento em Diretoria.');
    UPDATE public.diretoria_determinacoes SET tarefa_id = v_tarefa WHERE id = v_id;
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_diretoria_atualizar(p_id uuid, p_texto text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_det   public.diretoria_determinacoes;
    v_texto text := btrim(COALESCE(p_texto, ''));
BEGIN
    SELECT * INTO v_det FROM public.diretoria_determinacoes WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sem acesso: determinação não encontrada' USING ERRCODE = '42501';
    END IF;
    PERFORM public._diretoria_exige_editar(v_det.organization_id);
    IF v_det.status = 'concluida' THEN
        RAISE EXCEPTION 'determinação já concluída: não recebe atualização' USING ERRCODE = '22023';
    END IF;
    IF length(v_texto) = 0 OR length(v_texto) > 1000 THEN
        RAISE EXCEPTION 'a atualização precisa de um texto (até 1000 caracteres)' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.diretoria_determinacao_atualizacoes (determinacao_id, organization_id, texto, autor)
    VALUES (p_id, v_det.organization_id, v_texto, auth.uid());
    UPDATE public.diretoria_determinacoes SET status = 'andamento' WHERE id = p_id AND status = 'aberta';
END $$;

CREATE OR REPLACE FUNCTION public.fn_diretoria_concluir(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_det public.diretoria_determinacoes;
BEGIN
    SELECT * INTO v_det FROM public.diretoria_determinacoes WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sem acesso: determinação não encontrada' USING ERRCODE = '42501';
    END IF;
    PERFORM public._diretoria_exige_editar(v_det.organization_id);
    IF v_det.status = 'concluida' THEN
        RETURN;
    END IF;
    UPDATE public.diretoria_determinacoes
       SET status = 'concluida', concluida_em = now(), concluida_por = auth.uid()
     WHERE id = p_id;
    UPDATE public.tasks SET status = 'done' WHERE id = v_det.tarefa_id AND status = 'open';
END $$;

-- Cobrar: uma tarefa na agenda de cada responsável (prazo de 2 dias) e um registro. Com a
-- tarefa da mesma cobrança ainda aberta, o índice uq_tasks_source_open não duplica — conta
-- em "ja_abertas", e o registro grava a nova cobrança mesmo assim.
CREATE OR REPLACE FUNCTION public.fn_diretoria_cobrar(p_org uuid, p_chave text, p_tipo text, p_titulo text,
                                                      p_responsaveis uuid[], p_view text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_titulo  text := btrim(COALESCE(p_titulo, ''));
    v_r       uuid;
    v_t       uuid;
    v_criadas integer := 0;
    v_ja      integer := 0;
BEGIN
    PERFORM public._diretoria_exige_editar(p_org);
    IF NULLIF(btrim(COALESCE(p_chave, '')), '') IS NULL OR length(p_chave) > 500
       OR length(v_titulo) = 0 OR NULLIF(btrim(COALESCE(p_tipo, '')), '') IS NULL OR length(p_tipo) > 60 THEN
        RAISE EXCEPTION 'cobrança sem a exceção identificada (chave, tipo e título)' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(cardinality(array_remove(p_responsaveis, NULL)), 0) = 0 THEN
        RAISE EXCEPTION 'cobrança sem responsável: cadastre o responsável da área' USING ERRCODE = '22023';
    END IF;
    FOREACH v_r IN ARRAY ARRAY(SELECT DISTINCT u FROM unnest(p_responsaveis) u WHERE u IS NOT NULL) LOOP
        v_t := public.create_task(
            v_r, p_org, left('Cobrança da diretoria: ' || v_titulo, 300), now() + interval '2 days', 'diretoria',
            jsonb_build_object('type', 'cobranca', 'id', p_chave, 'tipo', p_tipo, 'view', NULLIF(btrim(COALESCE(p_view, '')), '')),
            2::smallint, 'A diretoria pediu providência sobre: ' || v_titulo || '.');
        IF v_t IS NULL THEN v_ja := v_ja + 1; ELSE v_criadas := v_criadas + 1; END IF;
        INSERT INTO public.diretoria_cobrancas (organization_id, excecao_chave, tipo, titulo, responsavel_user_id, tarefa_id, cobrado_por)
        VALUES (p_org, p_chave, p_tipo, left(v_titulo, 300), v_r, v_t, auth.uid());
    END LOOP;
    RETURN jsonb_build_object('criadas', v_criadas, 'ja_abertas', v_ja);
END $$;

-- ── 9. privilégios das funções (REGRA #7, pergunta 2) ───────────────────────────
-- Internas: só o dono (postgres) — chamadas de dentro das RPCs SECURITY DEFINER.
REVOKE ALL ON FUNCTION public._diretoria_faixa_atraso(integer)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_resp(uuid[], uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_agrupar(text, jsonb)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_excecoes(uuid[], date)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_painel_montar(uuid[], date)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_exige_editar(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_exige_membro(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Públicas: só usuário logado; a permissão é conferida dentro de cada uma.
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_painel(uuid)                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_definir_area(uuid, text, uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_definir_chefe(uuid, uuid, uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_determinar(uuid, text, uuid, date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_atualizar(uuid, text)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_concluir(uuid)                                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_cobrar(uuid, text, text, text, uuid[], text)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_painel(uuid)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_definir_area(uuid, text, uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_definir_chefe(uuid, uuid, uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_determinar(uuid, text, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_atualizar(uuid, text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_concluir(uuid)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_cobrar(uuid, text, text, text, uuid[], text)   TO authenticated;

COMMIT;
