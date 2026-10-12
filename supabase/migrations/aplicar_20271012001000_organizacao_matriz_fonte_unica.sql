-- ════════════════════════════════════════════════════════════════════════════
-- Organização × empresa matriz: a matriz é a fonte única de CNPJ, contato e endereço.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.
-- Plano: docs/planos/2026-10-12-fundir-organizacao-e-grupo.md (Fase B)
--
-- O caso (12/10/2026): as telas Minha Organização › Organização e › Grupo vão virar
-- uma só. CNPJ, e-mail, telefone, site e endereço existem nas duas tabelas —
-- `organizations` e a empresa matriz em `companies` — porque a matriz foi criada UMA
-- vez, por cópia (20260526000002, seção 3), e desde então nada a cria para org nova
-- (a "Altair Pereira da Rosa" ficou sem) nem mantém os dois cadastros iguais (o nome
-- já divergia). ~25 leitores usam esses campos a partir da ORGANIZAÇÃO — PDFs,
-- recibos numerados, modelos DOCX, emitente do Portal do Cliente, ajuda dos portais.
--
-- Decisão: a matriz é quem se edita; as colunas da org viram ESPELHO mantido aqui.
-- Os leitores não mudam. Mapeamento:
--   organizations.cnpj    ← companies.cnpj
--   organizations.phone   ← companies.telefone
--   organizations.email   ← companies.email_comercial
--   organizations.website ← companies.website
--   organizations.address{street,number,neighborhood,city,state,zipCode}
--                         ← companies.endereco_fiscal{logradouro,numero,bairro,cidade,uf,cep}
--
-- Pessoa física (decisão do usuário, 12/10/2026: "Altair Pereira da Rosa é uma
-- organizacao, porem é pessoa fisica e nao juridica"): `companies` não comporta PF
-- (sem CPF; CHECK de `tipo` só tem tipos de PJ). Org PF = `settings.tipo_pessoa =
-- 'PF'`, NÃO tem matriz, e os campos continuam editáveis na própria org. Tudo aqui
-- só age quando a org tem matriz.
--
-- Funções de gatilho são SECURITY DEFINER porque escrevem na OUTRA tabela, e quem
-- edita uma não tem, necessariamente, a policy de escrita da outra (ex.: a org nasce
-- pela RPC antes de o criador virar membro). Não são chamáveis por RPC (RETURNS
-- trigger), mas levam o REVOKE mesmo assim (REGRA #7).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Uma matriz por organização ───────────────────────────────────────────
-- Hoje: 3 orgs com 1 matriz cada, 1 org PF sem matriz. Nada a deduplicar.
CREATE UNIQUE INDEX IF NOT EXISTS companies_uma_matriz_por_org
    ON public.companies (org_id) WHERE is_headquarters;


-- ── 2. Endereço: os dois formatos ───────────────────────────────────────────
-- Funções puras (sem acesso a tabela), por isso sem SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.fn_endereco_org_de_fiscal(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
    SELECT jsonb_strip_nulls(jsonb_build_object(
        'street',       nullif(p->>'logradouro', ''),
        'number',       nullif(p->>'numero', ''),
        'neighborhood', nullif(p->>'bairro', ''),
        'city',         nullif(p->>'cidade', ''),
        'state',        nullif(p->>'uf', ''),
        'zipCode',      nullif(p->>'cep', '')
    ));
$function$;

CREATE OR REPLACE FUNCTION public.fn_endereco_fiscal_de_org(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
    SELECT jsonb_build_object(
        'cep',         coalesce(p->>'zipCode', ''),
        'logradouro',  coalesce(p->>'street', ''),
        'numero',      coalesce(p->>'number', ''),
        'complemento', '',
        'bairro',      coalesce(p->>'neighborhood', ''),
        'cidade',      coalesce(p->>'city', ''),
        'uf',          coalesce(p->>'state', '')
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_endereco_org_de_fiscal(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_endereco_fiscal_de_org(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_endereco_org_de_fiscal(jsonb) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_endereco_fiscal_de_org(jsonb) TO authenticated, service_role;


-- ── 3. Org PJ nasce com matriz ──────────────────────────────────────────────
-- A matriz nasce com os dados digitados na criação da org (a tela de criação
-- continua pedindo CNPJ, contato e endereço).
CREATE OR REPLACE FUNCTION public.fn_org_cria_matriz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
            'construtora', 'ativa', true);
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_org_cria_matriz() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_cria_matriz ON public.organizations;
CREATE TRIGGER trg_org_cria_matriz
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.fn_org_cria_matriz();


-- ── 4. Matriz → organização ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_matriz_espelha_na_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NOT NEW.is_headquarters THEN
        RETURN NEW;
    END IF;

    -- O BEFORE UPDATE da org (seção 5) repõe os mesmos valores a partir da matriz;
    -- o WHERE só evita UPDATE quando nada mudou.
    UPDATE organizations o
       SET cnpj    = NEW.cnpj,
           phone   = NEW.telefone,
           email   = NEW.email_comercial,
           website = NEW.website,
           address = fn_endereco_org_de_fiscal(coalesce(NEW.endereco_fiscal, '{}'::jsonb))
     WHERE o.id = NEW.org_id
       AND (o.cnpj    IS DISTINCT FROM NEW.cnpj
         OR o.phone   IS DISTINCT FROM NEW.telefone
         OR o.email   IS DISTINCT FROM NEW.email_comercial
         OR o.website IS DISTINCT FROM NEW.website
         OR coalesce(o.address, '{}'::jsonb)
              IS DISTINCT FROM fn_endereco_org_de_fiscal(coalesce(NEW.endereco_fiscal, '{}'::jsonb)));
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_matriz_espelha_na_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_matriz_espelha_na_org ON public.companies;
CREATE TRIGGER trg_matriz_espelha_na_org
    AFTER INSERT OR UPDATE OF cnpj, telefone, email_comercial, website, endereco_fiscal, is_headquarters, org_id
    ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.fn_matriz_espelha_na_org();


-- ── 5. Na organização, a matriz vence ───────────────────────────────────────
-- `organizationService.updateOrganization` regrava TODAS as colunas a cada save
-- (inclusive quando a aba Usuários só mexe em membros), e cliente PWA com bundle
-- antigo continuará mandando os campos por um tempo. Em vez de erro — que
-- derrubaria o save inteiro desses clientes — os 5 campos voltam ao valor da matriz.
-- Org sem matriz (PF) passa intacta.
CREATE OR REPLACE FUNCTION public.fn_org_campos_da_matriz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    m companies%ROWTYPE;
BEGIN
    SELECT * INTO m FROM companies WHERE org_id = NEW.id AND is_headquarters;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    NEW.cnpj    := m.cnpj;
    NEW.phone   := m.telefone;
    NEW.email   := m.email_comercial;
    NEW.website := m.website;
    NEW.address := fn_endereco_org_de_fiscal(coalesce(m.endereco_fiscal, '{}'::jsonb));
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_org_campos_da_matriz() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_campos_da_matriz ON public.organizations;
CREATE TRIGGER trg_org_campos_da_matriz
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.fn_org_campos_da_matriz();


-- ── 6. create_organization_v2 aceita settings ───────────────────────────────
-- Para a org PF já nascer marcada (o gatilho da seção 3 lê `settings` no INSERT;
-- marcar depois deixaria uma matriz criada à toa). Corpo vem do ARQUIVO
-- 20260215000012_org_rpc_final.sql, conferido idêntico ao `prosrc` em 12/10/2026;
-- a única mudança é `p_settings` e a coluna `settings` no INSERT.
--
-- Mudar a lista de parâmetros exige DROP: um CREATE OR REPLACE criaria uma
-- sobrecarga, e o PostgREST recusa chamada com argumentos nomeados ambígua.
-- Cliente antigo (8 parâmetros) continua funcionando: `p_settings` tem default.
DROP FUNCTION IF EXISTS public.create_organization_v2(text, text, text, text, text, text, jsonb, text);

CREATE FUNCTION public.create_organization_v2(
    p_name text,
    p_cnpj text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_website text DEFAULT NULL,
    p_logo_url text DEFAULT NULL,
    p_address jsonb DEFAULT '{}'::jsonb,
    p_creator_email text DEFAULT NULL,
    p_settings jsonb DEFAULT NULL
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
declare
    v_org public.organizations;
begin
    -- 1. Insert organization
    insert into public.organizations (
        name, cnpj, email, phone, website, logo_url, address, settings
    ) values (
        p_name, p_cnpj, p_email, p_phone, p_website, p_logo_url, p_address,
        coalesce(p_settings, '{}'::jsonb)
    )
    returning * into v_org;

    -- 2. If creator email provided, add as owner
    if p_creator_email is not null then
        insert into public.organization_members (
            organization_id, email, role
        ) values (
            v_org.id, p_creator_email, 'owner'
        );
    end if;

    return v_org;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_organization_v2(text, text, text, text, text, text, jsonb, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_organization_v2(text, text, text, text, text, text, jsonb, text, jsonb) TO authenticated, service_role;


-- ── 7. Dados ────────────────────────────────────────────────────────────────
-- Altair Pereira da Rosa é pessoa física.
UPDATE public.organizations
   SET settings = coalesce(settings, '{}'::jsonb) || '{"tipo_pessoa": "PF"}'::jsonb
 WHERE id = 'df96bed9-6773-45df-ad51-29588251a416';

-- Org PJ sem matriz ganha a sua (hoje nenhuma; fica para bancos de outro ambiente).
INSERT INTO public.companies (org_id, razao_social, cnpj, telefone, email_comercial, website,
                              endereco_fiscal, tipo, status, is_headquarters)
SELECT o.id, o.name, o.cnpj, o.phone, o.email, o.website,
       public.fn_endereco_fiscal_de_org(coalesce(o.address, '{}'::jsonb)),
       'construtora', 'ativa', true
  FROM public.organizations o
 WHERE coalesce(o.settings->>'tipo_pessoa', 'PJ') <> 'PF'
   AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.org_id = o.id AND c.is_headquarters);

-- Normaliza o espelho das orgs que têm matriz (dispara a seção 5).
UPDATE public.organizations o
   SET cnpj = o.cnpj
 WHERE EXISTS (SELECT 1 FROM public.companies c WHERE c.org_id = o.id AND c.is_headquarters);

NOTIFY pgrst, 'reload schema';


-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_pj_sem int;
    v_pf_com int;
    v_diverge int;
BEGIN
    SELECT count(*) INTO v_pj_sem FROM organizations o
     WHERE coalesce(o.settings->>'tipo_pessoa', 'PJ') <> 'PF'
       AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.org_id = o.id AND c.is_headquarters);
    SELECT count(*) INTO v_pf_com FROM organizations o
     WHERE o.settings->>'tipo_pessoa' = 'PF'
       AND EXISTS (SELECT 1 FROM companies c WHERE c.org_id = o.id AND c.is_headquarters);
    SELECT count(*) INTO v_diverge FROM organizations o
      JOIN companies c ON c.org_id = o.id AND c.is_headquarters
     WHERE o.cnpj IS DISTINCT FROM c.cnpj OR o.phone IS DISTINCT FROM c.telefone
        OR o.email IS DISTINCT FROM c.email_comercial OR o.website IS DISTINCT FROM c.website
        OR coalesce(o.address, '{}'::jsonb)
             IS DISTINCT FROM fn_endereco_org_de_fiscal(coalesce(c.endereco_fiscal, '{}'::jsonb));

    IF v_pj_sem > 0 OR v_pf_com > 0 OR v_diverge > 0 THEN
        RAISE EXCEPTION 'Verificação falhou: % org PJ sem matriz, % org PF com matriz, % divergência(s)',
            v_pj_sem, v_pf_com, v_diverge;
    END IF;
END $$;
