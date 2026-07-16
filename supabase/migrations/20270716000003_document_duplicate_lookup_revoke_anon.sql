-- Fix de segurança: por padrão o Postgres concede EXECUTE a PUBLIC em toda
-- função nova. A migration anterior (20270716000002) não revogou isso antes
-- de conceder a `authenticated`, então usuários anônimos conseguiam chamar
-- find_supplier_by_document/find_client_by_document/find_investor_by_document
-- e descobrir nome/organização de um cadastro a partir do CNPJ/CPF (confirmado
-- via teste com a anon key — a chamada retornou 200 em vez de ser negada).

REVOKE EXECUTE ON FUNCTION public.find_supplier_by_document(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_supplier_by_document(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_supplier_by_document(TEXT, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.find_client_by_document(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_client_by_document(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_client_by_document(TEXT, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.find_investor_by_document(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_investor_by_document(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_investor_by_document(TEXT, UUID) TO authenticated;
