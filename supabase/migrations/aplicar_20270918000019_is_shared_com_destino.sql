-- ============================================================
-- Migration: aplicar_20270918000019_is_shared_com_destino.sql
-- SEGURANÇA — achado C1-05 da auditoria de 2026-09-01
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md
--
-- O PROBLEMA
-- Três policies de leitura terminavam em `OR is_shared`:
--
--     USING (is_org_member(organization_id) OR is_shared)   -- clients
--     USING (is_org_member(organization_id) OR is_shared)   -- suppliers
--     USING (is_org_member(organization_id) OR is_shared)   -- partner_workspaces
--
-- `is_shared` é um booleano SEM DESTINO: diz que o registro é compartilhado,
-- não COM QUEM. E `OR <booleano>` é verdadeiro sozinho — não é "compartilhado
-- com o grupo", é compartilhado com todo usuário autenticado do SaaS.
--
-- São 127 cadastros: 119 fornecedores (49% da base), 7 clientes com CPF/CNPJ,
-- endereço e telefone, e 1 workspace de parceiro.
--
-- O nome da policy de `suppliers` é "Users can view suppliers of their
-- organization" — descreve uma regra que a expressão não implementa. É esse
-- descompasso entre nome e expressão que faz o defeito passar em revisão.
--
-- IMPACTO HOJE E DEPOIS
-- Nenhum vazamento em curso: as quatro organizações do banco são do mesmo
-- cliente. O defeito vira vazamento no dia do segundo cliente — por isso a
-- correção é pré-requisito de onboarding, não manutenção.
--
-- A CORREÇÃO
-- Mesmo desenho já aplicado aos catálogos (aplicar_...014) e que
-- `employee_org_shares` (pré-existente) usa: o compartilhamento passa a dizer
-- COM QUEM. O booleano `is_shared` FICA — é o que a UI liga/desliga e o que os
-- serviços consultam (`.or('organization_id.eq.X,is_shared.is.true')`); o que
-- muda é que agora existe a outra metade da regra.
--
-- Nenhum serviço precisa mudar: a consulta pede as linhas compartilhadas e a
-- RLS devolve só as compartilhadas COM QUEM PERGUNTOU.
--
-- `partner_workspaces` não ganha tabela própria: tem `supplier_id`, e o
-- workspace herda o compartilhamento do fornecedor (é assim que o
-- `supplierService` já o materializa — `is_shared: !!supplier.is_shared`).
-- ============================================================

-- ── 1. Tabelas de destino ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_org_shares (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
    target_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, target_org_id)
);

CREATE TABLE IF NOT EXISTS public.supplier_org_shares (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id   uuid NOT NULL REFERENCES public.suppliers(id)     ON DELETE CASCADE,
    target_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (supplier_id, target_org_id)
);

CREATE INDEX IF NOT EXISTS idx_cos_target_org ON public.client_org_shares (target_org_id);
CREATE INDEX IF NOT EXISTS idx_sos_target_org ON public.supplier_org_shares (target_org_id);

-- ── 2. Backfill: o que hoje é "de todos" passa a ser das 4 do grupo ─────────
INSERT INTO public.client_org_shares (client_id, target_org_id)
SELECT c.id, o.id FROM public.clients c CROSS JOIN public.organizations o
 WHERE coalesce(c.is_shared, false)
ON CONFLICT (client_id, target_org_id) DO NOTHING;

INSERT INTO public.supplier_org_shares (supplier_id, target_org_id)
SELECT s.id, o.id FROM public.suppliers s CROSS JOIN public.organizations o
 WHERE coalesce(s.is_shared, false)
ON CONFLICT (supplier_id, target_org_id) DO NOTHING;

-- ── 3. RLS das tabelas de destino ───────────────────────────────────────────
ALTER TABLE public.client_org_shares   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_org_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cos_select" ON public.client_org_shares;
CREATE POLICY "cos_select" ON public.client_org_shares
    FOR SELECT TO authenticated
    USING (public.is_org_member(target_org_id) OR public.is_superadmin());

DROP POLICY IF EXISTS "cos_manage" ON public.client_org_shares;
CREATE POLICY "cos_manage" ON public.client_org_shares
    FOR ALL TO authenticated
    USING (public.is_org_member(target_org_id) OR public.is_superadmin())
    WITH CHECK (public.is_org_member(target_org_id) OR public.is_superadmin());

DROP POLICY IF EXISTS "sos_select" ON public.supplier_org_shares;
CREATE POLICY "sos_select" ON public.supplier_org_shares
    FOR SELECT TO authenticated
    USING (public.is_org_member(target_org_id) OR public.is_superadmin());

DROP POLICY IF EXISTS "sos_manage" ON public.supplier_org_shares;
CREATE POLICY "sos_manage" ON public.supplier_org_shares
    FOR ALL TO authenticated
    USING (public.is_org_member(target_org_id) OR public.is_superadmin())
    WITH CHECK (public.is_org_member(target_org_id) OR public.is_superadmin());

-- ── 4. Ligar `is_shared` cria o destino ─────────────────────────────────────
-- Sem isto, marcar "compartilhado" na tela viraria um booleano sem efeito.
--
-- O destino são as organizações DE QUEM MARCOU — não "todas as que existem".
-- A diferença é o ponto inteiro desta migration: um `CROSS JOIN organizations`
-- num trigger incluiria a organização do cliente #2 assim que ela existisse.
-- Assim, quem é do grupo compartilha com o grupo; um cliente futuro que marque
-- um fornecedor como compartilhado o compartilha com as organizações DELE.
CREATE OR REPLACE FUNCTION public.fn_share_com_minhas_orgs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF coalesce(NEW.is_shared, false)
       AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.is_shared, false)) THEN

        IF TG_TABLE_NAME = 'clients' THEN
            INSERT INTO public.client_org_shares (client_id, target_org_id)
            SELECT NEW.id, om.organization_id
              FROM public.organization_members om
             WHERE (om.user_id IS NOT NULL AND om.user_id = auth.uid())
                OR (om.user_id IS NULL AND lower(om.email) = lower(auth.jwt() ->> 'email'))
            ON CONFLICT (client_id, target_org_id) DO NOTHING;

        ELSIF TG_TABLE_NAME = 'suppliers' THEN
            INSERT INTO public.supplier_org_shares (supplier_id, target_org_id)
            SELECT NEW.id, om.organization_id
              FROM public.organization_members om
             WHERE (om.user_id IS NOT NULL AND om.user_id = auth.uid())
                OR (om.user_id IS NULL AND lower(om.email) = lower(auth.jwt() ->> 'email'))
            ON CONFLICT (supplier_id, target_org_id) DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_share_com_minhas_orgs() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_clients_share ON public.clients;
CREATE TRIGGER trg_clients_share
    AFTER INSERT OR UPDATE OF is_shared ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.fn_share_com_minhas_orgs();

DROP TRIGGER IF EXISTS trg_suppliers_share ON public.suppliers;
CREATE TRIGGER trg_suppliers_share
    AFTER INSERT OR UPDATE OF is_shared ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.fn_share_com_minhas_orgs();

-- ── 5. As três policies, agora com destino ──────────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated users to read clients" ON public.clients;
DROP POLICY IF EXISTS "clients_select" ON public.clients;   -- idempotente ao reexecutar
CREATE POLICY "clients_select" ON public.clients
    FOR SELECT TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (SELECT 1 FROM public.client_org_shares sh
                    WHERE sh.client_id = clients.id
                      AND public.is_org_member(sh.target_org_id))
    );

DROP POLICY IF EXISTS "Users can view suppliers of their organization" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;   -- idem
CREATE POLICY "suppliers_select" ON public.suppliers
    FOR SELECT TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (SELECT 1 FROM public.supplier_org_shares sh
                    WHERE sh.supplier_id = suppliers.id
                      AND public.is_org_member(sh.target_org_id))
    );

-- Workspace herda do fornecedor: é assim que o supplierService o materializa.
DROP POLICY IF EXISTS "workspaces_select_internal" ON public.partner_workspaces;
CREATE POLICY "workspaces_select_internal" ON public.partner_workspaces
    FOR SELECT TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR EXISTS (SELECT 1 FROM public.supplier_org_shares sh
                    WHERE sh.supplier_id = partner_workspaces.supplier_id
                      AND public.is_org_member(sh.target_org_id))
    );

-- ── 5b. A função de incluir organização passa a cobrir os cadastros ─────────
-- Sem isto, uma organização nova do grupo receberia os catálogos mas não os
-- clientes e fornecedores compartilhados — meia inclusão, que é pior que
-- nenhuma porque parece completa.
--
-- Mesma guarda de sempre: gestor do destino + só estende o que o chamador já
-- enxerga. E, aqui, só o que está marcado `is_shared` — o cadastro exclusivo de
-- uma organização não vira compartilhado por efeito colateral.
CREATE OR REPLACE FUNCTION public.fn_incluir_org_nos_catalogos(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_bases int; v_rubricas int; v_clientes int; v_fornecedores int;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'informe a organizacao' USING ERRCODE = '22004';
    END IF;
    IF NOT public.is_org_manager(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.custom_database_org_shares (database_id, target_org_id)
    SELECT d.id, p_org_id FROM public.custom_databases d
     WHERE public.is_org_member(d.organization_id)
        OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                    WHERE sh.database_id = d.id AND public.is_org_member(sh.target_org_id))
    ON CONFLICT (database_id, target_org_id) DO NOTHING;
    GET DIAGNOSTICS v_bases = ROW_COUNT;

    INSERT INTO public.rubric_org_shares (rubric_code, target_org_id)
    SELECT r.code, p_org_id FROM public.rubrics r
     WHERE r.organization_id IS NOT NULL
       AND (public.is_org_member(r.organization_id)
            OR EXISTS (SELECT 1 FROM public.rubric_org_shares sh
                        WHERE sh.rubric_code = r.code AND public.is_org_member(sh.target_org_id)))
    ON CONFLICT (rubric_code, target_org_id) DO NOTHING;
    GET DIAGNOSTICS v_rubricas = ROW_COUNT;

    INSERT INTO public.client_org_shares (client_id, target_org_id)
    SELECT c.id, p_org_id FROM public.clients c
     WHERE coalesce(c.is_shared, false)
       AND (public.is_org_member(c.organization_id)
            OR EXISTS (SELECT 1 FROM public.client_org_shares sh
                        WHERE sh.client_id = c.id AND public.is_org_member(sh.target_org_id)))
    ON CONFLICT (client_id, target_org_id) DO NOTHING;
    GET DIAGNOSTICS v_clientes = ROW_COUNT;

    INSERT INTO public.supplier_org_shares (supplier_id, target_org_id)
    SELECT s.id, p_org_id FROM public.suppliers s
     WHERE coalesce(s.is_shared, false)
       AND (public.is_org_member(s.organization_id)
            OR EXISTS (SELECT 1 FROM public.supplier_org_shares sh
                        WHERE sh.supplier_id = s.id AND public.is_org_member(sh.target_org_id)))
    ON CONFLICT (supplier_id, target_org_id) DO NOTHING;
    GET DIAGNOSTICS v_fornecedores = ROW_COUNT;

    RETURN jsonb_build_object(
        'organization_id', p_org_id,
        'bases_incluidas', v_bases,
        'rubricas_incluidas', v_rubricas,
        'clientes_incluidos', v_clientes,
        'fornecedores_incluidos', v_fornecedores
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_incluir_org_nos_catalogos(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_incluir_org_nos_catalogos(uuid) TO authenticated;

-- ── 6. Verificação embutida ─────────────────────────────────────────────────
DO $$
DECLARE
    v_orgs int;
    v_cli int; v_sup int; v_cli_sh int; v_sup_sh int;
    v_ws_orfao int;
    v_resto text;
BEGIN
    SELECT count(*) INTO v_orgs FROM public.organizations;
    SELECT count(*) INTO v_cli FROM public.clients   WHERE coalesce(is_shared,false);
    SELECT count(*) INTO v_sup FROM public.suppliers WHERE coalesce(is_shared,false);
    SELECT count(*) INTO v_cli_sh FROM public.client_org_shares;
    SELECT count(*) INTO v_sup_sh FROM public.supplier_org_shares;

    IF v_cli_sh <> v_cli * v_orgs THEN
        RAISE EXCEPTION 'C1-05: esperava % vinculos de cliente (% x %), encontrei %',
            v_cli * v_orgs, v_cli, v_orgs, v_cli_sh;
    END IF;
    IF v_sup_sh <> v_sup * v_orgs THEN
        RAISE EXCEPTION 'C1-05: esperava % vinculos de fornecedor (% x %), encontrei %',
            v_sup * v_orgs, v_sup, v_orgs, v_sup_sh;
    END IF;

    -- Workspace compartilhado cujo fornecedor NÃO tem destino ficaria invisível.
    SELECT count(*) INTO v_ws_orfao
      FROM public.partner_workspaces pw
     WHERE coalesce(pw.is_shared, false)
       AND NOT EXISTS (SELECT 1 FROM public.supplier_org_shares sh WHERE sh.supplier_id = pw.supplier_id);
    IF v_ws_orfao > 0 THEN
        RAISE EXCEPTION 'C1-05: % workspace(s) compartilhado(s) cujo fornecedor nao tem destino', v_ws_orfao;
    END IF;

    -- Nenhuma policy pode continuar com a perna solta.
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_resto
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (qual LIKE '%OR is_shared%' OR qual LIKE '%is_shared)%');
    IF v_resto IS NOT NULL THEN
        RAISE EXCEPTION 'C1-05: ainda ha policy com is_shared sem destino: %', v_resto;
    END IF;

    RAISE NOTICE 'C1-05 OK: % clientes e % fornecedores compartilhados agora dizem COM QUEM (% e % vinculos).',
        v_cli, v_sup, v_cli_sh, v_sup_sh;
END $$;
