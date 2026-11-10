-- ============================================================
-- Migration: aplicar_20271110950000_investidor_compartilhado.sql
-- Investidor "Disponível em todas as organizações"
-- Plano: docs/planos/2026-11-10-investidor-organizacao-compartilhado.md
--
-- O PEDIDO
-- Minha Organização › Investidores: campo para escolher a organização do
-- investidor e marca para disponibilizá-lo em todas as organizações — o mesmo
-- par Organização + "Disponível em todas as organizações" do fornecedor.
--
-- O CASO REAL
-- O investidor Tiago é da Alpa e está vinculado a uma obra da SPE do Garden
-- Cambuhy. O Portal do Investidor filtrava tudo pela organização do link, então
-- a obra não aparecia.
--
-- O DESENHO (o mesmo de supplier_org_shares, aplicar_20270918000019)
-- `is_shared` é o que a tela liga; `investor_org_shares` diz COM QUEM. Marcar
-- compartilha com as organizações DE QUEM MARCOU (menos condomínios) — nunca
-- com "todas as que existem". Duas diferenças em relação ao fornecedor:
--   • desmarcar APAGA os destinos (no fornecedor eles ficavam e a linha seguia
--     visível pela RLS); e toda leitura exige `is_shared` E destino;
--   • a tabela de destino não tem policy de escrita: só o gatilho (definer)
--     grava. No fornecedor, membro da organização de destino podia inserir
--     destino para fornecedor de outra organização e passar a lê-lo.
--
-- O PORTAL
-- `fn_orgs_do_investidor` devolve a organização dona + os destinos (só se
-- `is_shared`). As funções do portal que filtravam pela organização do link
-- passam a filtrar por essa lista. A fronteira continua sendo o vínculo
-- explícito: obra com `investor_id`, participação ou sócio de SPE DESTE
-- investidor — nunca as obras da organização inteira.
--
-- `fn_obras_do_investidor` e `fn_espelho_de_vendas_das_obras` NÃO são
-- reescritas aqui (a definição vigente é a de
-- aplicar_20271110600000_empreendimento_tower_vistas.sql). Só os embrulhos as
-- chamam uma vez por organização e juntam o resultado.
--
-- O LINK
-- O token guarda a organização em que foi gerado. Trocar a organização do
-- investidor agora leva o token junto (gatilho), e o link que ele já tem
-- continua valendo — sem precisar gerar outro.
-- ============================================================

-- ── 1. A marca ──────────────────────────────────────────────────────────────
ALTER TABLE public.investors
    ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

-- ── 2. O destino ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investor_org_shares (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id   uuid NOT NULL REFERENCES public.investors(id)     ON DELETE CASCADE,
    target_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (investor_id, target_org_id)
);

CREATE INDEX IF NOT EXISTS idx_ios_target_org ON public.investor_org_shares (target_org_id);

ALTER TABLE public.investor_org_shares ENABLE ROW LEVEL SECURITY;

-- Leitura: quem é da organização de destino. Escrita: nenhuma policy — só o
-- gatilho abaixo (SECURITY DEFINER) grava.
DROP POLICY IF EXISTS "ios_select" ON public.investor_org_shares;
CREATE POLICY "ios_select" ON public.investor_org_shares
    FOR SELECT TO authenticated
    USING (public.is_org_member(target_org_id) OR public.is_superadmin());

REVOKE ALL ON TABLE public.investor_org_shares FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.investor_org_shares FROM authenticated;

-- ── 3. Marcar cria o destino; desmarcar o apaga; trocar a organização leva o link ──
CREATE OR REPLACE FUNCTION public.fn_investor_compartilhamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF coalesce(NEW.is_shared, false)
       AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.is_shared, false)) THEN
        INSERT INTO public.investor_org_shares (investor_id, target_org_id)
        SELECT NEW.id, om.organization_id
          FROM public.organization_members om
         WHERE ((om.user_id IS NOT NULL AND om.user_id = auth.uid())
            OR (om.user_id IS NULL AND lower(om.email) = lower(auth.jwt() ->> 'email')))
           AND NOT public.fn_org_eh_condominio(om.organization_id)
        ON CONFLICT (investor_id, target_org_id) DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND coalesce(OLD.is_shared, false) AND NOT coalesce(NEW.is_shared, false) THEN
        DELETE FROM public.investor_org_shares WHERE investor_id = NEW.id;
    END IF;

    -- O link do portal é por investidor (UNIQUE investor_id) e guarda a
    -- organização em que foi gerado; ele acompanha a organização do investidor.
    IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id
       AND NEW.organization_id IS NOT NULL THEN
        UPDATE public.investor_portal_tokens
           SET org_id = NEW.organization_id
         WHERE investor_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_compartilhamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_investors_compartilhamento ON public.investors;
CREATE TRIGGER trg_investors_compartilhamento
    AFTER INSERT OR UPDATE OF is_shared, organization_id ON public.investors
    FOR EACH ROW EXECUTE FUNCTION public.fn_investor_compartilhamento();

-- ── 4. Leitura do cadastro: dono, ou destino de um investidor marcado ───────
-- A perna `organization_id IS NULL` sai: 0 linhas nulas, e a policy de INSERT
-- já não deixa nascer nenhuma (REGRA #5: "Todas" nunca é NULL).
DROP POLICY IF EXISTS "investors_select" ON public.investors;
CREATE POLICY "investors_select" ON public.investors
    FOR SELECT TO authenticated
    USING (
        organization_id IN (SELECT public.investors_user_org_ids())
        OR (is_shared AND EXISTS (
            SELECT 1 FROM public.investor_org_shares sh
             WHERE sh.investor_id = investors.id
               AND sh.target_org_id IN (SELECT public.investors_user_org_ids())))
    );

-- ── 5. As organizações em que o portal procura as obras do investidor ───────
CREATE OR REPLACE FUNCTION public.fn_orgs_do_investidor(p_investor_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(array_agg(DISTINCT x.org_id), '{}'::uuid[])
    FROM (
        SELECT i.organization_id AS org_id
          FROM public.investors i
         WHERE i.id = p_investor_id AND i.organization_id IS NOT NULL
        UNION
        SELECT sh.target_org_id
          FROM public.investors i
          JOIN public.investor_org_shares sh ON sh.investor_id = i.id
         WHERE i.id = p_investor_id AND i.is_shared
    ) x;
$function$;

-- Interna: só as funções SECURITY DEFINER abaixo a chamam.
REVOKE ALL ON FUNCTION public.fn_orgs_do_investidor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_orgs_do_investidor(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_orgs_do_investidor(uuid) FROM authenticated;

-- ── 6. Espelho de Vendas: uma chamada por organização, resultados juntos ────
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_espelho(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok public.investor_portal_tokens;
BEGIN
    -- A autorização é o token, conferido aqui dentro (REGRA #7).
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'obras', (
            SELECT COALESCE(jsonb_agg(ob ORDER BY ob ->> 'project_name'), '[]'::jsonb)
            FROM unnest(public.fn_orgs_do_investidor(v_tok.investor_id)) AS o(org_id)
            CROSS JOIN LATERAL jsonb_array_elements(public.fn_espelho_de_vendas_das_obras(
                o.org_id, public.fn_obras_do_investidor(v_tok.investor_id, o.org_id))) AS ob
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_investor_portal_get_espelho(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_investor_portal_get_espelho(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_espelho(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_get_espelho(p_investor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inv public.investors;
BEGIN
    SELECT * INTO v_inv FROM public.investors WHERE id = p_investor_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    -- Quem pode: a equipe da organização do investidor (ou de um destino, se ele
    -- está marcado como compartilhado), o superadmin, ou o próprio investidor
    -- (login por e-mail). Cada perna do OR diz COM QUEM o dado é dividido (REGRA #7).
    IF NOT (
        public.is_org_member(v_inv.organization_id)
        OR (v_inv.is_shared AND EXISTS (
            SELECT 1 FROM public.investor_org_shares sh
             WHERE sh.investor_id = v_inv.id AND public.is_org_member(sh.target_org_id)))
        OR public.is_superadmin()
        OR (NULLIF(trim(v_inv.email), '') IS NOT NULL
            AND lower(trim(v_inv.email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', ''))))
    ) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'obras', (
            SELECT COALESCE(jsonb_agg(ob ORDER BY ob ->> 'project_name'), '[]'::jsonb)
            FROM unnest(public.fn_orgs_do_investidor(v_inv.id)) AS o(org_id)
            CROSS JOIN LATERAL jsonb_array_elements(public.fn_espelho_de_vendas_das_obras(
                o.org_id, public.fn_obras_do_investidor(v_inv.id, o.org_id))) AS ob
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_investor_get_espelho(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_investor_get_espelho(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_investor_get_espelho(UUID) TO authenticated;

-- ── 7. Resumo, marcos e SPEs: `= v_org_id` vira `= ANY (v_orgs)` ────────────
-- Corpo idêntico ao vigente no banco em 10/11/2026; só o filtro de organização muda.
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_summary(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok      public.investor_portal_tokens;
    v_inv_id   UUID;
    v_orgs     UUID[];
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_orgs   := public.fn_orgs_do_investidor(v_inv_id);

    RETURN jsonb_build_object(
        'valid', TRUE,
        'participations', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',               ip.id,
                    'project_id',       ip.project_id,
                    'project_name',     p.name,
                    'ownership_pct',    ip.ownership_pct,
                    'committed_amount', ip.committed_amount,
                    'quota_count',      ip.quota_count
                )
                ORDER BY p.name
             )
             FROM public.investor_participations ip
             JOIN public.projects p ON p.id = ip.project_id
             WHERE ip.investor_id = v_inv_id
               AND ip.organization_id = ANY (v_orgs)
               AND p.organization_id = ip.organization_id),
            '[]'::jsonb
        ),
        'contributions', COALESCE(
            (SELECT jsonb_agg(row_to_json(ic) ORDER BY ic.created_at DESC)
             FROM public.investor_contributions ic
             WHERE ic.investor_id = v_inv_id
               AND ic.organization_id = ANY (v_orgs)),
            '[]'::jsonb
        ),
        'projects', COALESCE(
            (WITH project_ids AS (
                SELECT ip.project_id
                FROM public.investor_participations ip
                WHERE ip.investor_id = v_inv_id
                  AND ip.organization_id = ANY (v_orgs)

                UNION

                SELECT pr_legacy.id AS project_id
                FROM public.projects pr_legacy
                WHERE pr_legacy.investor_id = v_inv_id
                  AND pr_legacy.organization_id = ANY (v_orgs)
            )
             SELECT jsonb_agg(
                jsonb_build_object(
                    'id',              pr.id,
                    'organization_id', pr.organization_id,
                    'name',            pr.name,
                    'investor_id',     pr.investor_id,
                    'settings',        pr.settings
                )
                ORDER BY pr.name
             )
             FROM public.projects pr
             JOIN project_ids pi ON pi.project_id = pr.id
             WHERE pr.organization_id = ANY (v_orgs)
               AND pr.settings->>'classification' = 'OBRA'),
            '[]'::jsonb
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_investor_portal_get_summary(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_investor_portal_get_summary(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_summary(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_milestones(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_orgs   UUID[];
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_orgs   := public.fn_orgs_do_investidor(v_inv_id);

    RETURN jsonb_build_object(
        'valid',      TRUE,
        'milestones', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',             pm.id,
                    'project_id',     pm.project_id,
                    'project_name',   pr.name,
                    'name',           pm.name,
                    'planned_date',   pm.planned_date,
                    'completed_date', pm.completed_date,
                    'status',         pm.status,
                    'physical_pct',   pm.physical_pct,
                    'order_index',    pm.order_index
                )
                ORDER BY pr.name, pm.order_index
             )
             FROM public.project_milestones pm
             JOIN public.projects pr ON pr.id = pm.project_id
             WHERE pm.organization_id = ANY (v_orgs)
               AND pr.investor_id = v_inv_id),
            '[]'::jsonb
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_investor_portal_get_milestones(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_investor_portal_get_milestones(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_milestones(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_spes(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_orgs   UUID[];
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_orgs   := public.fn_orgs_do_investidor(v_inv_id);

    RETURN jsonb_build_object(
        'valid', TRUE,
        'spes', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',                   se.id,
                    'name',                 se.name,
                    'cnpj',                 se.cnpj,
                    'capital_social',       se.capital_social,
                    'project_id',           se.project_id,
                    'project_name',         pr.name,
                    -- participação do investidor do token, nunca de outro
                    'quota_count',          sp.quota_count,
                    'ownership_pct',        sp.ownership_pct,
                    'capital_calls_total',  sp.capital_calls_total,
                    'capital_paid',         sp.capital_paid,
                    -- quantos sócios ao todo, sem identificar nenhum
                    'partners_count',       (SELECT COUNT(*) FROM public.spe_partners x WHERE x.spe_entity_id = se.id)
                )
                ORDER BY se.name
             )
             FROM public.spe_partners sp
             JOIN public.spe_entities se ON se.id = sp.spe_entity_id
             LEFT JOIN public.projects pr ON pr.id = se.project_id
             WHERE sp.investor_id = v_inv_id
               AND se.organization_id = ANY (v_orgs)),
            '[]'::jsonb
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_investor_portal_get_spes(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_investor_portal_get_spes(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_spes(TEXT) TO anon, authenticated;

-- ── 8. Verificação embutida ─────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.investors WHERE organization_id IS NULL) THEN
        RAISE EXCEPTION 'há investidor sem organização: a policy nova o esconderia';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_investors_compartilhamento') THEN
        RAISE EXCEPTION 'gatilho de compartilhamento ausente';
    END IF;
END $$;
