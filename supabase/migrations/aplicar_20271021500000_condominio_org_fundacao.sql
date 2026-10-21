-- ============================================================================
-- Condomínio com organização própria — F1, fundação no banco
--
-- Pedido de 21/10/2026: "O sindico, sera o operador do sistema. ele que vai
-- lancar as notas, contas a pagar, cadastro de fornecedores. etc."
-- Plano: docs/planos/2026-10-21-sindico-operador-org-condominio.md
--
-- O banco só isola por ORGANIZAÇÃO. Para o síndico operar sem ver a
-- construtora, a OPERAÇÃO do condomínio (financeiro, contratos, rateios,
-- avisos, ocupações) vai para uma org própria, marcada `settings.tipo =
-- 'CONDOMINIO'`. O CADASTRO do prédio (empreendimento, torres, unidades) fica
-- na org dona (decisão do usuário: Locações/Incorporação continuam com ele);
-- `empreendimentos.condominio_org_id` diz qual org opera o condomínio.
--
-- Esta migration:
--  (a) empresa matriz de org de condomínio nasce com tipo 'condominio';
--  (b) o usuário não troca `settings.tipo` (o updateOrganization regrava o
--      settings inteiro — sem isto, um salvar da tela apagaria a marca);
--  (c) fn_org_eh_condominio / fn_org_do_condominio;
--  (d) membro da org do condomínio LÊ o prédio (escrita segue com a dona);
--  (e) ocupação herda a org do CONDOMÍNIO;
--  (f) fecha três vazamentos para a org do condomínio: compartilhamento
--      automático de cliente/fornecedor (com CPF) por quem é membro das duas,
--      "incluir nos catálogos" e contas "atende todas" da construtora (o Asaas
--      da Alpa cobraria as cotas do condomínio);
--  (g) RPC para salvar a Ficha (o síndico não tem escrita no empreendimento);
--  (h) admin não remove nem rebaixa o owner.
--
-- Definições de partida lidas do BANCO em 21/10/2026 (pg_get_functiondef),
-- não de arquivo. REGRA #7: REVOKE junto de cada função. Aplicar com
-- `db query -f` (nunca db push). Idempotente.
-- ============================================================================

-- ── (a) Tipo de empresa 'condominio' e a matriz da org de condomínio ───────
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_tipo_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_tipo_check CHECK (tipo = ANY (ARRAY[
    'construtora', 'incorporadora', 'concreteira', 'distribuidora', 'holding', 'spe',
    'prestadora_servicos', 'administracao_patrimonial', 'industrial', 'transportadora',
    'rural', 'comercial', 'condominio']));

CREATE OR REPLACE FUNCTION public.fn_org_cria_matriz()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(NEW.settings->>'tipo_pessoa', 'PJ') = 'PF' THEN
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM companies WHERE org_id = NEW.id AND is_headquarters) THEN
        RETURN NEW;
    END IF;

    INSERT INTO companies (org_id, razao_social, cnpj, telefone, email_comercial, website,
                           endereco_fiscal, tipo, status, is_headquarters)
    VALUES (NEW.id, NEW.name, NEW.cnpj, NEW.phone, NEW.email, NEW.website,
            fn_endereco_fiscal_de_org(coalesce(NEW.address, '{}'::jsonb)),
            -- 21/10/2026: org de condomínio tem matriz 'condominio'.
            CASE WHEN NEW.settings->>'tipo' = 'CONDOMINIO' THEN 'condominio' ELSE 'construtora' END,
            'ativa', true);
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_org_cria_matriz() FROM PUBLIC, anon, authenticated;

-- ── (b) A marca do tipo não muda por usuário ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_org_preserva_tipo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Sessão de usuário (auth.uid() presente) não troca nem apaga a marca; o
    -- sistema (migration/service_role, sem uid) pode.
    IF auth.uid() IS NOT NULL
       AND (NEW.settings->>'tipo') IS DISTINCT FROM (OLD.settings->>'tipo') THEN
        IF OLD.settings ? 'tipo' THEN
            NEW.settings := jsonb_set(coalesce(NEW.settings, '{}'::jsonb), '{tipo}', OLD.settings->'tipo');
        ELSE
            NEW.settings := coalesce(NEW.settings, '{}'::jsonb) - 'tipo';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_org_preserva_tipo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_preserva_tipo ON public.organizations;
CREATE TRIGGER trg_org_preserva_tipo
    BEFORE UPDATE OF settings ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.fn_org_preserva_tipo();

-- ── (c) Perguntas únicas ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_org_eh_condominio(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT coalesce((SELECT o.settings->>'tipo' = 'CONDOMINIO' FROM public.organizations o WHERE o.id = p_org), false);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_org_eh_condominio(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_org_eh_condominio(uuid) TO authenticated, service_role;

ALTER TABLE public.empreendimentos
    ADD COLUMN IF NOT EXISTS condominio_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_empreendimentos_condominio_org ON public.empreendimentos (condominio_org_id)
    WHERE condominio_org_id IS NOT NULL;

COMMENT ON COLUMN public.empreendimentos.condominio_org_id IS
    'Organização que OPERA o condomínio (financeiro, rateio, avisos, ocupações). NULL = a própria org do empreendimento. O cadastro do prédio continua na organization_id. 21/10/2026.';

CREATE OR REPLACE FUNCTION public.fn_org_do_condominio(p_empreendimento_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT coalesce(e.condominio_org_id, e.organization_id) FROM public.empreendimentos e WHERE e.id = p_empreendimento_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_org_do_condominio(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_org_do_condominio(uuid) TO authenticated, service_role;

-- ── (d) Membro da org do condomínio LÊ o prédio ─────────────────────────────
-- Só SELECT: escrita (preço, VGV, dados da SPE) segue com quem é da org dona.
DROP POLICY IF EXISTS condominio_org_le_empreendimento ON public.empreendimentos;
CREATE POLICY condominio_org_le_empreendimento ON public.empreendimentos
    FOR SELECT TO authenticated
    USING (condominio_org_id IS NOT NULL AND condominio_org_id IN (SELECT public.empr_user_org_ids()));

DROP POLICY IF EXISTS condominio_org_le_torres ON public.empreendimento_towers;
CREATE POLICY condominio_org_le_torres ON public.empreendimento_towers
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.empreendimentos e
                    WHERE e.id = empreendimento_towers.empreendimento_id
                      AND e.condominio_org_id IS NOT NULL
                      AND e.condominio_org_id IN (SELECT public.empr_user_org_ids())));

DROP POLICY IF EXISTS condominio_org_le_unidades ON public.empreendimento_units;
CREATE POLICY condominio_org_le_unidades ON public.empreendimento_units
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.empreendimento_towers t
                     JOIN public.empreendimentos e ON e.id = t.empreendimento_id
                    WHERE t.id = empreendimento_units.tower_id
                      AND e.condominio_org_id IS NOT NULL
                      AND e.condominio_org_id IN (SELECT public.empr_user_org_ids())));

-- ── (e) Ocupação herda a org do CONDOMÍNIO ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_unit_occupancies_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_org_pai UUID;
BEGIN
    -- 21/10/2026: a org da ocupação é a que OPERA o condomínio
    -- (condominio_org_id), caindo na do empreendimento quando não há.
    SELECT coalesce(e.condominio_org_id, e.organization_id)
      INTO v_org_pai
      FROM public.empreendimento_towers t
      JOIN public.empreendimentos e ON e.id = t.empreendimento_id
      JOIN public.empreendimento_units u ON u.tower_id = t.id
     WHERE u.id = NEW.unit_id;

    IF v_org_pai IS NULL THEN
        RAISE EXCEPTION 'Unidade % não tem empreendimento com organização definida.', NEW.unit_id;
    END IF;

    -- Nulo = deixa herdar em silêncio. Divergente = grita. A diferença importa:
    -- omitir é não saber, mandar errado é achar que sabe.
    IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> v_org_pai THEN
        RAISE EXCEPTION
            'Ocupação na organização % mas a unidade % pertence à organização %. Filho herda a org do pai.',
            NEW.organization_id, NEW.unit_id, v_org_pai;
    END IF;

    NEW.organization_id := v_org_pai;
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_unit_occupancies_org() FROM PUBLIC, anon, authenticated;

-- ── (f) Vazamentos para a org do condomínio ─────────────────────────────────
-- f.1 Compartilhamento automático: quem é membro da construtora E do
--     condomínio (a equipe) compartilharia cada cliente/fornecedor novo da
--     construtora com o condomínio. Org de condomínio fica de fora.
CREATE OR REPLACE FUNCTION public.fn_share_com_minhas_orgs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF coalesce(NEW.is_shared, false)
       AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.is_shared, false)) THEN

        IF TG_TABLE_NAME = 'clients' THEN
            INSERT INTO public.client_org_shares (client_id, target_org_id)
            SELECT NEW.id, om.organization_id
              FROM public.organization_members om
             WHERE ((om.user_id IS NOT NULL AND om.user_id = auth.uid())
                OR (om.user_id IS NULL AND lower(om.email) = lower(auth.jwt() ->> 'email')))
               AND NOT public.fn_org_eh_condominio(om.organization_id)
            ON CONFLICT (client_id, target_org_id) DO NOTHING;

        ELSIF TG_TABLE_NAME = 'suppliers' THEN
            INSERT INTO public.supplier_org_shares (supplier_id, target_org_id)
            SELECT NEW.id, om.organization_id
              FROM public.organization_members om
             WHERE ((om.user_id IS NOT NULL AND om.user_id = auth.uid())
                OR (om.user_id IS NULL AND lower(om.email) = lower(auth.jwt() ->> 'email')))
               AND NOT public.fn_org_eh_condominio(om.organization_id)
            ON CONFLICT (supplier_id, target_org_id) DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_share_com_minhas_orgs() FROM PUBLIC, anon, authenticated;

-- f.2 "Incluir nos catálogos" numa org de condomínio não traz clientes,
--     fornecedores nem rubricas da construtora (rubrica de condomínio é
--     COPIADA na F4, não compartilhada). Bases de dados continuam.
CREATE OR REPLACE FUNCTION public.fn_incluir_org_nos_catalogos(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_bases int; v_rubricas int := 0; v_clientes int := 0; v_fornecedores int := 0;
    v_condominio boolean;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'informe a organizacao' USING ERRCODE = '22004';
    END IF;
    IF NOT public.is_org_manager(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
    v_condominio := public.fn_org_eh_condominio(p_org_id);

    INSERT INTO public.custom_database_org_shares (database_id, target_org_id)
    SELECT d.id, p_org_id FROM public.custom_databases d
     WHERE public.is_org_member(d.organization_id)
        OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                    WHERE sh.database_id = d.id AND public.is_org_member(sh.target_org_id))
    ON CONFLICT (database_id, target_org_id) DO NOTHING;
    GET DIAGNOSTICS v_bases = ROW_COUNT;

    IF NOT v_condominio THEN
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
    END IF;

    RETURN jsonb_build_object(
        'organization_id', p_org_id,
        'bases_incluidas', v_bases,
        'rubricas_incluidas', v_rubricas,
        'clientes_incluidos', v_clientes,
        'fornecedores_incluidos', v_fornecedores,
        'condominio', v_condominio
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_incluir_org_nos_catalogos(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_incluir_org_nos_catalogos(uuid) TO authenticated;

-- f.3 Conta "atende todas" da construtora NÃO atende org de condomínio pelo
--     ramo implícito (membro em comum). A lista explícita
--     (payment_account_organizations) continua valendo.
CREATE OR REPLACE FUNCTION public.fn_orgs_atendidas_pela_conta(p_conta uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dona  uuid;
    v_todas boolean;
BEGIN
    SELECT organization_id, COALESCE(serves_all_organizations, false)
      INTO v_dona, v_todas
      FROM public.payment_accounts WHERE id = p_conta;
    IF v_dona IS NULL THEN
        RETURN;
    END IF;
    IF auth.role() IN ('authenticated', 'anon') AND NOT public.is_org_member(v_dona) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT v_dona
    UNION
    SELECT pao.organization_id
      FROM public.payment_account_organizations pao
     WHERE pao.payment_account_id = p_conta
    UNION
    SELECT outra.organization_id
      FROM public.organization_members dona
      JOIN public.organization_members outra
        ON COALESCE(outra.user_id::text, lower(outra.email)) = COALESCE(dona.user_id::text, lower(dona.email))
     WHERE v_todas
       AND dona.organization_id = v_dona
       AND COALESCE(dona.user_id::text, lower(dona.email)) IS NOT NULL
       -- 21/10/2026: org de condomínio tem caixa próprio.
       AND (outra.organization_id = v_dona OR NOT public.fn_org_eh_condominio(outra.organization_id));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_orgs_atendidas_pela_conta(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_orgs_atendidas_pela_conta(uuid) TO authenticated, service_role;

-- ── (g) Salvar a Ficha do condomínio ────────────────────────────────────────
-- Quem opera (membro da org do condomínio) salva os dados do CONDOMÍNIO;
-- síndico, mandato e a exigência de aprovação só quem é da org dona do prédio.
CREATE OR REPLACE FUNCTION public.condominio_salvar_ficha(p_empreendimento_id uuid, p_campos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_e     public.empreendimentos;
    v_dona  boolean;
    v_opera boolean;
BEGIN
    SELECT * INTO v_e FROM public.empreendimentos WHERE id = p_empreendimento_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio não encontrado.');
    END IF;
    v_dona  := public.is_org_member(v_e.organization_id);
    v_opera := v_e.condominio_org_id IS NOT NULL AND public.is_org_member(v_e.condominio_org_id);
    IF NOT (v_dona OR v_opera) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para este condomínio.');
    END IF;
    IF NOT v_dona AND (p_campos ?| ARRAY['sindico_client_id', 'sindico_mandato_inicio', 'sindico_mandato_fim', 'rateio_exige_aprovacao_sindico']) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Síndico, mandato e a exigência de aprovação são definidos pela administradora do empreendimento.');
    END IF;

    UPDATE public.empreendimentos SET
        condominio_razao_social = CASE WHEN p_campos ? 'condominio_razao_social' THEN nullif(p_campos->>'condominio_razao_social', '') ELSE condominio_razao_social END,
        condominio_cnpj         = CASE WHEN p_campos ? 'condominio_cnpj' THEN nullif(p_campos->>'condominio_cnpj', '') ELSE condominio_cnpj END,
        condominio_instalado_em = CASE WHEN p_campos ? 'condominio_instalado_em' THEN nullif(p_campos->>'condominio_instalado_em', '')::date ELSE condominio_instalado_em END,
        cobranca_multa_percent  = CASE WHEN p_campos ? 'cobranca_multa_percent' THEN coalesce((p_campos->>'cobranca_multa_percent')::numeric, 0) ELSE cobranca_multa_percent END,
        cobranca_juros_mes_percent = CASE WHEN p_campos ? 'cobranca_juros_mes_percent' THEN coalesce((p_campos->>'cobranca_juros_mes_percent')::numeric, 0) ELSE cobranca_juros_mes_percent END,
        sindico_client_id       = CASE WHEN p_campos ? 'sindico_client_id' THEN nullif(p_campos->>'sindico_client_id', '')::uuid ELSE sindico_client_id END,
        sindico_mandato_inicio  = CASE WHEN p_campos ? 'sindico_mandato_inicio' THEN nullif(p_campos->>'sindico_mandato_inicio', '')::date ELSE sindico_mandato_inicio END,
        sindico_mandato_fim     = CASE WHEN p_campos ? 'sindico_mandato_fim' THEN nullif(p_campos->>'sindico_mandato_fim', '')::date ELSE sindico_mandato_fim END,
        rateio_exige_aprovacao_sindico = CASE WHEN p_campos ? 'rateio_exige_aprovacao_sindico' THEN coalesce((p_campos->>'rateio_exige_aprovacao_sindico')::boolean, false) ELSE rateio_exige_aprovacao_sindico END,
        updated_at = now()
     WHERE id = p_empreendimento_id;

    RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.condominio_salvar_ficha(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.condominio_salvar_ficha(uuid, jsonb) TO authenticated;

-- ── (h) Admin não remove nem rebaixa o owner ────────────────────────────────
-- Na org do condomínio o síndico é admin e a construtora é owner (decisão do
-- usuário, 21/10/2026). Só outro owner (ou o sistema) mexe numa linha owner.
CREATE OR REPLACE FUNCTION public.fn_org_members_protege_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_eh_owner boolean;
BEGIN
    IF OLD.role IS DISTINCT FROM 'owner' OR auth.uid() IS NULL THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.role = 'owner' THEN
        RETURN NEW;
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members m
         WHERE m.organization_id = OLD.organization_id
           AND m.role = 'owner'
           AND (m.user_id = auth.uid() OR lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    ) INTO v_eh_owner;
    IF NOT v_eh_owner THEN
        RAISE EXCEPTION 'Só um proprietário da organização remove ou muda o papel de outro proprietário.'
            USING ERRCODE = '42501';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_org_members_protege_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_members_protege_owner ON public.organization_members;
CREATE TRIGGER trg_org_members_protege_owner
    BEFORE UPDATE OF role OR DELETE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.fn_org_members_protege_owner();

-- ── Contadores de conferência (rodar depois de aplicar) ─────────────────────
-- SELECT
--   (SELECT pg_get_constraintdef(oid) LIKE '%condominio%' FROM pg_constraint WHERE conname = 'companies_tipo_check') AS tipo_ok,
--   (SELECT count(*) FROM information_schema.columns WHERE table_name = 'empreendimentos' AND column_name = 'condominio_org_id') AS coluna,
--   (SELECT count(*) FROM pg_policies WHERE policyname LIKE 'condominio_org_le_%') AS politicas,          -- 3
--   (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_org_preserva_tipo','trg_org_members_protege_owner')) AS gatilhos, -- 2
--   (SELECT count(*) FROM organizations WHERE settings->>'tipo' = 'CONDOMINIO') AS orgs_condominio;        -- 0 até a F1.4
