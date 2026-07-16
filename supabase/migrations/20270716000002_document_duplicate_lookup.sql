-- Busca por CNPJ/CPF duplicado em suppliers/clients/investors, ignorando
-- pontuação (a coluna `document` guarda o valor mascarado, ex: "12.345.678/0001-90").
-- Usado pelo cadastro para bloquear duplicidade — o CNPJ/CPF deve prevalecer
-- como identificador único da pessoa/empresa, mesmo entre organizações
-- diferentes (o usuário decidiu bloquear cross-org também, não só dentro da
-- mesma organização).
--
-- p_exclude_id existe para permitir edição: ao salvar um registro existente
-- com o mesmo documento que ele já tinha, a função não deve acusar duplicidade
-- contra si mesmo.

CREATE OR REPLACE FUNCTION public.find_supplier_by_document(p_document TEXT, p_exclude_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, name TEXT, code TEXT, organization_id UUID, organization_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.name, s.code, s.organization_id, o.name AS organization_name
    FROM public.suppliers s
    LEFT JOIN public.organizations o ON o.id = s.organization_id
   WHERE regexp_replace(COALESCE(s.document, ''), '\D', '', 'g') <> ''
     AND regexp_replace(s.document, '\D', '', 'g') = regexp_replace(COALESCE(p_document, ''), '\D', '', 'g')
     AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_supplier_by_document(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_supplier_by_document(TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_client_by_document(p_document TEXT, p_exclude_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, name TEXT, code TEXT, organization_id UUID, organization_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.name, c.code, c.organization_id, o.name AS organization_name
    FROM public.clients c
    LEFT JOIN public.organizations o ON o.id = c.organization_id
   WHERE regexp_replace(COALESCE(c.document, ''), '\D', '', 'g') <> ''
     AND regexp_replace(c.document, '\D', '', 'g') = regexp_replace(COALESCE(p_document, ''), '\D', '', 'g')
     AND (p_exclude_id IS NULL OR c.id <> p_exclude_id)
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_client_by_document(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_client_by_document(TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_investor_by_document(p_document TEXT, p_exclude_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, name TEXT, code TEXT, organization_id UUID, organization_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.name, i.code, i.organization_id, o.name AS organization_name
    FROM public.investors i
    LEFT JOIN public.organizations o ON o.id = i.organization_id
   WHERE regexp_replace(COALESCE(i.document, ''), '\D', '', 'g') <> ''
     AND regexp_replace(i.document, '\D', '', 'g') = regexp_replace(COALESCE(p_document, ''), '\D', '', 'g')
     AND (p_exclude_id IS NULL OR i.id <> p_exclude_id)
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_investor_by_document(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_investor_by_document(TEXT, UUID) TO authenticated;
