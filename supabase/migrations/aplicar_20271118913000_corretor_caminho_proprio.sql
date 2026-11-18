-- ════════════════════════════════════════════════════════════════════════════
-- Corretor ganha caminho PRÓPRIO para o que faz no portal (18/11/2026)
-- 1ª de 2 migrations — achados F5, F6 e F7 da varredura de segurança de 15/11/2026
-- ════════════════════════════════════════════════════════════════════════════
-- Plano: docs/planos/2026-11-18-seguranca-corretor-nao-membro.md
--
-- O PROBLEMA (fechado pela 2ª migration, aplicar_20271118913100):
--   is_org_member, minhas_orgs_membro e is_org_member_de dão "membro" a quem tem
--   broker_profiles ATIVO com o e-mail do JWT. ~640 policies usam essas funções, então
--   o corretor externo (de fora da empresa) lê e grava folha, salário, extrato,
--   contas, tokens de portal… E qualquer membro cria broker_profiles para um e-mail
--   qualquer, que vira "membro" pelo mesmo ramo (F7).
--
-- O QUE ESTA MIGRATION FAZ (só ACRESCENTA — não tira nada de ninguém):
--   Dá ao corretor, por caminho próprio, o que ele faz HOJE logado no portal e que só
--   funcionava por causa daquele ramo. Inventário completo (front + banco) no plano;
--   tudo o mais do portal já passa por RPC SECURITY DEFINER com o token
--   (fn_broker_portal_*) e não depende do ramo.
--
--   1. public.minhas_orgs_corretor() — as organizações em que o usuário do JWT é
--      corretor ATIVO (exatamente o ramo que sai de minhas_orgs_membro).
--   2. Enviar proposta: policies de INSERT próprias do corretor em
--      broker_portal_proposals e broker_portal_proposal_units — só a PRÓPRIA proposta
--      (broker_email = e-mail do JWT), só na organização em que é corretor ativo. É o
--      mesmo recorte que a policy de hoje dá a ele; SELECT/UPDATE/DELETE da própria
--      proposta já têm perna própria (broker_email) e não mudam.
--   3. Reservar unidade: fn_broker_portal_reservar_unidade(uuid) — troca SÓ o status
--      para RESERVED. Hoje o portal faz UPDATE direto em commercial_properties, que o
--      ramo libera em qualquer coluna e qualquer unidade da organização.
--   4. Aba Saúde (desktop): fn_broker_portal_saude_empreendimentos(uuid) e
--      fn_broker_portal_saude(uuid, uuid). Hoje a aba lê commercial_properties,
--      commercial_deals e projects direto. As RPCs repetem, POR CONSULTA, a RLS que
--      vale hoje para cada tabela (com o corretor ativo contando, como hoje) e
--      devolvem uma linha por unidade e por negócio, só com as colunas que a conta do
--      painel usa; as contas (canal dominante, mix, curva…) continuam no MESMO código
--      JS (services/brokerHealthService.ts), inclusive o desempate por ordem.
--      · a organização é a do painel (parâmetro) — nunca a do token, para um link
--        vencido no meio da sessão não zerar o painel de quem é da casa;
--      · anon EXECUTA e recebe vazio: o painel do link anônimo continua o "zero" de
--        hoje (sem GRANT viraria erro → tela de "Nenhum dado").
--
-- EQUIVALÊNCIA (por que isto não muda nada para ninguém AGORA):
--   enquanto a 2ª migration não roda, minhas_orgs_membro() ⊇ minhas_orgs_corretor().
--   · as policies novas liberam um SUBCONJUNTO do que broker_proposals_insert /
--     broker_proposal_units_insert já liberam;
--   · as RPCs devolvem/alteram um SUBCONJUNTO do que o SELECT/UPDATE direto já dá
--     ao mesmo usuário.
--
-- ORDEM DE PUBLICAÇÃO (sem janela em que o corretor fica sem tela):
--   1. ESTA migration                                  ← ANTES do merge do PR
--   2. merge do PR (front passa a usar as RPCs; push em main = deploy)
--   3. conferir o deploy de fora (bash scripts/conferir-producao.sh)
--   4. aplicar_20271118913100_corretor_nao_e_membro.sql ← DEPOIS do front no ar
--   Front sem esta migration: aba Saúde mostra "Nenhum dado" e "Reservar" dá erro.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): as policies novas não têm OR — as duas condições
--   (organização em que é corretor ativo E a proposta é dele) são exigidas juntas.
--   Nas RPCs, cada OR é cópia literal de uma policy de hoje (citada ao lado).
--   Pergunta 2 (quem executa): toda função nova leva REVOKE de PUBLIC. GRANT:
--   · minhas_orgs_corretor, reservar → authenticated (anon não tem o que fazer);
--   · as duas da Saúde → anon e authenticated (anon recebe vazio, ver acima).
--   A autorização está DENTRO de cada função; o parâmetro de organização não
--   autoriza nada sozinho.
--
-- COMO CONFERIR DEPOIS DE APLICAR
--   SELECT p.proname, p.prosecdef, p.proacl FROM pg_proc p
--    WHERE p.proname IN ('minhas_orgs_corretor','fn_broker_portal_reservar_unidade',
--                        'fn_broker_portal_saude','fn_broker_portal_saude_empreendimentos');
--   -- 4 linhas, prosecdef = true, proacl sem "=X/" (PUBLIC)
--   SELECT policyname FROM pg_policies
--    WHERE policyname IN ('broker_proposals_insert_corretor','broker_proposal_units_insert_corretor');
--   -- 2 linhas
--   No app (gestor, org com estoque): Portal do Corretor › Saúde mostra os MESMOS
--   números de antes do deploy.
--
-- VOLTA (se precisar): só depois de desfazer a 2ª migration e o front.
--   DROP POLICY broker_proposals_insert_corretor ON public.broker_portal_proposals;
--   DROP POLICY broker_proposal_units_insert_corretor ON public.broker_portal_proposal_units;
--   DROP FUNCTION public.fn_broker_portal_saude(uuid, uuid);
--   DROP FUNCTION public.fn_broker_portal_saude_empreendimentos(uuid);
--   DROP FUNCTION public.fn_broker_portal_reservar_unidade(uuid);
--   DROP FUNCTION public.minhas_orgs_corretor();
--
-- Idempotente (CREATE OR REPLACE; DROP POLICY IF EXISTS + CREATE).
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. As organizações em que eu sou corretor ATIVO ─────────────────────────
-- É o ramo que a 2ª migration tira de minhas_orgs_membro, com o mesmo texto.
-- Corretor não tem user_id: a identidade é o e-mail do JWT.
CREATE OR REPLACE FUNCTION public.minhas_orgs_corretor()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT b.organization_id
      FROM public.broker_profiles b
     WHERE b.organization_id IS NOT NULL
       AND lower(b.email) = lower(auth.jwt() ->> 'email')
       AND b.is_active = true
$$;

REVOKE ALL ON FUNCTION public.minhas_orgs_corretor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_orgs_corretor() TO authenticated, service_role;


-- ─── 2. Enviar proposta: INSERT da PRÓPRIA proposta ──────────────────────────
-- Hoje (broker_proposals_insert): organization_id IN minhas_orgs_membro()
--   AND (broker_email = e-mail do JWT OR membro da org pelo e-mail).
-- Para o corretor de fora só a 1ª perna do parêntese vale; é ela que fica aqui,
-- com minhas_orgs_corretor() no lugar do ramo.
DROP POLICY IF EXISTS broker_proposals_insert_corretor ON public.broker_portal_proposals;
CREATE POLICY broker_proposals_insert_corretor ON public.broker_portal_proposals
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (SELECT public.minhas_orgs_corretor())
        AND lower(broker_email) = lower(auth.jwt() ->> 'email')
    );

-- As unidades da cesta (services/brokerService.ts › syncProposalUnits, upsert).
-- Hoje (broker_proposal_units_insert): organization_id IN minhas_orgs_membro()
--   AND a proposta é do e-mail do JWT (ou de membro). UPDATE/DELETE/SELECT das
--   unidades já têm a perna "a proposta é minha" e não mudam.
DROP POLICY IF EXISTS broker_proposal_units_insert_corretor ON public.broker_portal_proposal_units;
CREATE POLICY broker_proposal_units_insert_corretor ON public.broker_portal_proposal_units
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (SELECT public.minhas_orgs_corretor())
        AND EXISTS (
            SELECT 1
              FROM public.broker_portal_proposals pr
             WHERE pr.id = broker_portal_proposal_units.proposal_id
               AND lower(pr.broker_email) = lower(auth.jwt() ->> 'email')
        )
    );


-- ─── 3. Reservar unidade: só o status ────────────────────────────────────────
-- Antes: commercialService.saveProperty({ id, status: 'RESERVED' }) — UPDATE direto,
-- que a policy "Enable access to organization members" (ALL, TO authenticated)
-- libera quando organization_id IN minhas_orgs_membro(). A autorização aqui é a
-- MESMA (membro da casa OU corretor ativo da org da unidade); o que muda é que só o
-- status vira RESERVED. Os gatilhos de commercial_properties (log de status,
-- cascata de org, status da unidade do empreendimento) rodam como antes.
-- Sem login: recusa (como antes — anon não tem policy em commercial_properties).
CREATE OR REPLACE FUNCTION public.fn_broker_portal_reservar_unidade(p_property_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    -- Só reserva o que está à venda: unidade vendida/alugada/permutada não volta
    -- para RESERVED por esta porta (o botão só aparece em disponível, mas a regra
    -- é do servidor). RESERVED → RESERVED é aceito: clique duplo não vira erro.
    UPDATE public.commercial_properties cp
       SET status = 'RESERVED'
     WHERE cp.id = p_property_id
       AND cp.status IN ('AVAILABLE', 'RESERVED')
       AND cp.organization_id IN (
               SELECT o FROM public.minhas_orgs_membro() o
               UNION
               SELECT o FROM public.minhas_orgs_corretor() o)
    RETURNING cp.status INTO v_status;

    -- Antes, o UPDATE que não achava a linha (RLS) voltava 0 linhas e o `.single()`
    -- do front dava erro. Aqui o erro é explícito; a tela mostra o mesmo aviso.
    IF v_status IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.commercial_properties cp
             WHERE cp.id = p_property_id
               AND cp.organization_id IN (
                       SELECT o FROM public.minhas_orgs_membro() o
                       UNION
                       SELECT o FROM public.minhas_orgs_corretor() o)
        ) THEN
            RAISE EXCEPTION 'unidade_indisponivel' USING ERRCODE = 'P0001';
        END IF;
        RAISE EXCEPTION 'unidade_sem_acesso' USING ERRCODE = '42501';
    END IF;

    RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_reservar_unidade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_reservar_unidade(uuid) TO authenticated;


-- ─── 4. Aba Saúde ────────────────────────────────────────────────────────────
-- "visiveis" = o conjunto que minhas_orgs_membro() devolve HOJE (membro da casa ∪
-- corretor ativo). Cada consulta abaixo aplica a RLS de hoje da sua tabela com
-- esse conjunto — e nada além dela:
--   commercial_properties  "Enable access to organization members" (TO authenticated)
--       organization_id IN minhas_orgs_membro()
--   commercial_deals       "Enable access to organization members" (TO authenticated)
--       EXISTS (unidade do negócio cuja organization_id IN minhas_orgs_membro())
--       — a organização do NEGÓCIO não entra na policy; só no filtro da tela.
--   projects               projects_org_access (TO authenticated)
--       organization_id IN minhas_orgs_membro()
--       OR (organization_id IS NULL AND settings.organizationId IN minhas_orgs_membro())
--                          "Users can select their own projects" (TO public)
--       auth.uid() = user_id
-- anon: auth.uid() e o e-mail do JWT são nulos → conjunto vazio, nenhuma linha —
-- igual ao SELECT direto de hoje (as policies acima não valem para anon).

-- Seletor de empreendimento: o mesmo SELECT de listProjectsWithSales
-- (commercial_properties + embed project:projects(name)), linha a linha.
CREATE OR REPLACE FUNCTION public.fn_broker_portal_saude_empreendimentos(p_org uuid)
RETURNS TABLE (project_id uuid, status text, purpose text, project_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH visiveis AS (
        SELECT o FROM public.minhas_orgs_membro() o
        UNION
        SELECT o FROM public.minhas_orgs_corretor() o
    )
    SELECT cp.project_id, cp.status, cp.purpose, pj.name
      FROM public.commercial_properties cp
      -- O embed do PostgREST é um LEFT JOIN sob a RLS de projects: projeto que a
      -- pessoa não vê vem sem nome (e a tela o descarta), a unidade não some.
      LEFT JOIN public.projects pj
             ON pj.id = cp.project_id
            AND (    pj.organization_id IN (SELECT o FROM visiveis)
                 OR (pj.organization_id IS NULL
                     AND (pj.settings ->> 'organizationId')::uuid IN (SELECT o FROM visiveis))
                 OR  pj.user_id = auth.uid())
     WHERE cp.organization_id = p_org
       AND cp.project_id IS NOT NULL
       AND cp.organization_id IN (SELECT o FROM visiveis)
$$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_saude_empreendimentos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_saude_empreendimentos(uuid) TO anon, authenticated, service_role;

-- Painel: as três leituras de getHealthData numa chamada.
--   unidades  ← commercial_properties (organização do painel; empreendimento, se escolhido)
--   negocios  ← commercial_deals (organização do painel; o recorte por empreendimento
--               continua no JS, pela unidade principal). `com_corretor` no lugar do
--               nome: a tela só pergunta SE há corretor (canal "Corretor"), e a regra
--               é a do JS (`broker_name ? …`: nem nulo nem vazio).
--   projeto_nome ← projects (só com empreendimento escolhido)
-- Sem ORDER BY de propósito: as linhas saem na ordem em que a tabela as entrega,
-- como no SELECT direto de antes — é essa ordem que desempata canal e mix no JS.
CREATE OR REPLACE FUNCTION public.fn_broker_portal_saude(p_org uuid, p_project uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH visiveis AS (
        SELECT o FROM public.minhas_orgs_membro() o
        UNION
        SELECT o FROM public.minhas_orgs_corretor() o
    )
    SELECT jsonb_build_object(
        'unidades', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',            cp.id,
                       'initial_price', cp.initial_price,
                       'price',         cp.price,
                       'status',        cp.status,
                       'purpose',       cp.purpose,
                       'typology',      cp.typology))
              FROM public.commercial_properties cp
             WHERE cp.organization_id = p_org
               AND (p_project IS NULL OR cp.project_id = p_project)
               AND cp.organization_id IN (SELECT o FROM visiveis)
        ), '[]'::jsonb),
        'negocios', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',             d.id,
                       'value',          d.value,
                       'status',         d.status,
                       'type',           d.type,
                       'date',           d.date,
                       'com_corretor',   (d.broker_name IS NOT NULL AND d.broker_name <> ''),
                       'payment_method', d.payment_method,
                       'property_id',    d.property_id))
              FROM public.commercial_deals d
             WHERE d.organization_id = p_org
               AND EXISTS (
                     SELECT 1
                       FROM public.commercial_properties p
                      WHERE p.id = d.property_id
                        AND p.organization_id IN (SELECT o FROM visiveis))
        ), '[]'::jsonb),
        'projeto_nome', (
            SELECT pj.name
              FROM public.projects pj
             WHERE p_project IS NOT NULL
               AND pj.id = p_project
               AND (    pj.organization_id IN (SELECT o FROM visiveis)
                    OR (pj.organization_id IS NULL
                        AND (pj.settings ->> 'organizationId')::uuid IN (SELECT o FROM visiveis))
                    OR  pj.user_id = auth.uid())
        )
    )
$$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_saude(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_saude(uuid, uuid) TO anon, authenticated, service_role;
