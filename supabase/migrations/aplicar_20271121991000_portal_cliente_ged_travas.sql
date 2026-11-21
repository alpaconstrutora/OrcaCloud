-- Fase 7.5 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md
--
-- fn_portal_get_ged_documents (Portal do Cliente, lido por token com a chave anon)
-- nasceu SECURITY DEFINER sem search_path fixo e com EXECUTE para PUBLIC.
-- O corpo já confere token ativo e a org do token (doc.organization_id = v_tok.org_id)
-- e usa nomes qualificados; aqui só fecham as duas portas.
--
-- Pergunta 1 (REGRA #7): sem policy.
-- Pergunta 2: SECURITY DEFINER, autorização = o token dentro da função. EXECUTE
-- para anon e authenticated (o portal é por link), nunca PUBLIC.
--
-- Reversão: ALTER FUNCTION public.fn_portal_get_ged_documents(text) RESET search_path;
--           GRANT EXECUTE ON FUNCTION public.fn_portal_get_ged_documents(text) TO PUBLIC;

ALTER FUNCTION public.fn_portal_get_ged_documents(text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.fn_portal_get_ged_documents(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_portal_get_ged_documents(text) TO anon, authenticated;
