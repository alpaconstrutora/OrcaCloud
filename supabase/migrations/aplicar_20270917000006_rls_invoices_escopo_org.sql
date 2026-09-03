-- ============================================================
-- Migration: aplicar_20270918000002_rls_invoices_escopo_org.sql
-- SEGURANÇA — achado C1-02 da auditoria de 2026-09-01 (severidade: CRÍTICA)
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 1.2
--
-- PROBLEMA
-- A tabela `invoices` tinha três policies, todas sem recorte nenhum:
--   • "Suppliers can view their own invoices"   SELECT to anon          USING (true)
--   • "Suppliers can insert their own invoices" INSERT to anon     WITH CHECK (true)
--   • "invoices_authenticated_all"              ALL to authenticated USING (true)
-- O nome fala em "their own", mas a expressão é literalmente `true`. Como a chave
-- anon é pública (vai no bundle do frontend), a policy anon equivale a acesso
-- público: verificado com um GET real em /rest/v1/invoices, sem login, que
-- devolveu HTTP 206 e Content-Range 0-828/829 — as 829 notas de todos os tenants.
--
-- CORREÇÃO — por que uma coluna nova, e não só um EXISTS sobre suppliers
-- `invoices` não tinha coluna de tenant; o vínculo era indireto por supplier_id.
-- Só que 26 das 829 notas têm supplier_id NULL (25 chegam por `boletos`, 1 sem
-- vínculo nenhum): um recorte apoiado só em suppliers tornaria essas 26 invisíveis
-- para todo mundo. Então a coluna passa a existir de fato, com backfill pelas duas
-- origens reais, e a policy lê a coluna — que é o que o resto do sistema já faz.
--
-- A nota sem vínculo nenhum fica com organization_id NULL e, por consequência,
-- invisível via PostgREST. É deliberado: falhar fechado. O NOTICE ao final
-- identifica a linha para o dono do dado decidir a quem ela pertence.
-- ============================================================

-- ── 1. Coluna de tenant ─────────────────────────────────────────────────────
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- ── 2. Backfill: origem primária, o fornecedor da nota ──────────────────────
UPDATE public.invoices i
   SET organization_id = s.organization_id
  FROM public.suppliers s
 WHERE i.supplier_id = s.id
   AND i.organization_id IS NULL
   AND s.organization_id IS NOT NULL;

-- ── 3. Backfill: origem secundária, o boleto que aponta para a nota ─────────
UPDATE public.invoices i
   SET organization_id = b.organization_id
  FROM public.boletos b
 WHERE b.invoice_id = i.id
   AND i.organization_id IS NULL
   AND b.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_organization_id
    ON public.invoices (organization_id);

-- ── 4. Trigger: quem grava sem informar a organização não fica órfão ────────
-- supplier-portal-upload (Edge Function, service_role) insere em `invoices` sem
-- organization_id. Em vez de exigir deploy da function, a coluna se preenche
-- sozinha a partir do fornecedor — que a própria function já valida pelo token.
CREATE OR REPLACE FUNCTION public.fn_invoices_preenche_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.organization_id IS NULL AND NEW.supplier_id IS NOT NULL THEN
        SELECT s.organization_id INTO NEW.organization_id
          FROM public.suppliers s WHERE s.id = NEW.supplier_id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_invoices_preenche_org() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_invoices_preenche_org ON public.invoices;
CREATE TRIGGER trg_invoices_preenche_org
    BEFORE INSERT OR UPDATE OF supplier_id ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.fn_invoices_preenche_org();

-- ── 5. Fora as policies sem recorte ─────────────────────────────────────────
DROP POLICY IF EXISTS "Suppliers can view their own invoices"   ON public.invoices;
DROP POLICY IF EXISTS "Suppliers can insert their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "invoices_authenticated_all"              ON public.invoices;

-- ── 6. Policies com recorte real ────────────────────────────────────────────
-- Sem policy para `anon`: o Portal do Fornecedor não precisa dela — ele passa
-- pelas Edge Functions supplier-portal-download/upload, que usam service_role
-- depois de validar o token (e service_role ignora RLS).
CREATE POLICY "invoices_org_select" ON public.invoices
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

CREATE POLICY "invoices_org_insert" ON public.invoices
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "invoices_org_update" ON public.invoices
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "invoices_org_delete" ON public.invoices
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

-- ── 7. Verificação embutida ─────────────────────────────────────────────────
DO $$
DECLARE
    v_total int; v_sem_org int; v_policies_anon int; v_policies_true int;
    v_orfas text;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE organization_id IS NULL)
      INTO v_total, v_sem_org FROM public.invoices;

    SELECT count(*) INTO v_policies_anon
      FROM pg_policies WHERE schemaname='public' AND tablename='invoices'
       AND 'anon' = ANY(roles);

    SELECT count(*) INTO v_policies_true
      FROM pg_policies WHERE schemaname='public' AND tablename='invoices'
       AND (qual = 'true' OR with_check = 'true');

    IF v_policies_anon > 0 THEN
        RAISE EXCEPTION 'C1-02: ainda existem % policy(ies) para anon em invoices', v_policies_anon;
    END IF;
    IF v_policies_true > 0 THEN
        RAISE EXCEPTION 'C1-02: ainda existem % policy(ies) com expressao true em invoices', v_policies_true;
    END IF;

    SELECT string_agg(id::text || ' (' || coalesce(file_name,'sem nome') || ')', ', ')
      INTO v_orfas FROM public.invoices WHERE organization_id IS NULL;

    RAISE NOTICE 'C1-02 OK: % notas, % sem organizacao apos backfill.', v_total, v_sem_org;
    IF v_sem_org > 0 THEN
        RAISE NOTICE 'ATENCAO — nota(s) sem dono, invisiveis ate receberem organization_id: %', v_orfas;
    END IF;
END $$;
