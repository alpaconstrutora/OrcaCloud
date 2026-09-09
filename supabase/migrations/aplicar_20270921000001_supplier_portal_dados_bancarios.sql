-- ============================================================================
-- PORTAL DO FORNECEDOR — "MEUS DADOS" PRECISA DAS CONTAS BANCÁRIAS
-- ============================================================================
--
-- A tela "Meus dados" (menu da conta, no portal por token) mostra o cadastro
-- inteiro que a construtora tem do fornecedor — o mesmo de Minha Organização ›
-- Meus Fornecedores. Três dos quatro grupos já chegavam de graça: a RPC
-- `supplier_portal_get_data` devolve `row_to_json(suppliers.*)`, a linha
-- completa. O quarto grupo, "Dados bancários", mora em outra tabela
-- (`supplier_bank_accounts`, RLS por organização) e não tinha porta de portal.
--
-- Esta migration abre essa porta, e só ela.
--
-- ─── REGRA #7, as duas perguntas ────────────────────────────────────────────
--
-- 1. "Esta perna do OR sozinha basta para liberar a linha?"
--    Não existe OR. O único filtro é `supplier_id = v_sup`, e `v_sup` NÃO vem
--    de parâmetro: sai de `supplier_portal_supplier_from_token(p_token)`, que
--    exige token ativo e não expirado. Quem tem o token de um fornecedor lê as
--    contas daquele fornecedor, de mais ninguém — nem passando outro id, porque
--    não há id de fornecedor na assinatura.
--
-- 2. "Quem mais pode executar esta função?"
--    O PostgreSQL concede EXECUTE a PUBLIC por padrão e o GRANT não revoga esse
--    default. Por isso o REVOKE vem junto, literal, antes do GRANT.
--
--    O GRANT inclui `anon` DE PROPÓSITO: o portal do fornecedor é acesso por
--    link, sem login, então a requisição chega com a chave anon. É o mesmo
--    desenho das outras ~20 RPCs `supplier_portal_*` (ver
--    20270822000017_supplier_portal_tokens.sql). A autorização real não está no
--    GRANT — está dentro da função, no token.
--
-- ─── O que o fornecedor passa a ver ─────────────────────────────────────────
--
-- Os dados bancários DELE, por inteiro (conta e chave PIX sem máscara),
-- decidido pelo usuário em 09/09/2026 quando perguntado — é onde mais nasce
-- erro de pagamento, e conferir meia chave PIX não confere nada. Contas
-- `status = 'inativo'` ficam de fora: não são o que a construtora usa para
-- pagar, e mostrá-las só confunde a conferência.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.supplier_portal_get_bank_accounts(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_sup UUID := public.supplier_portal_supplier_from_token(p_token);
BEGIN
    IF v_sup IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(
                row_to_json(b)
                -- A principal primeiro; depois a mais nova. É a ordem em que o
                -- fornecedor procura ("qual conta vocês usam para me pagar?").
                ORDER BY b.is_primary DESC, b.created_at DESC
            )
            FROM public.supplier_bank_accounts b
            WHERE b.supplier_id = v_sup
              AND COALESCE(b.status, 'ativo') = 'ativo'
        ), '[]'::jsonb)
    );
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.supplier_portal_get_bank_accounts(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.supplier_portal_get_bank_accounts(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.supplier_portal_get_bank_accounts(TEXT) IS
'Contas bancárias ativas do fornecedor dono do token do portal. Autorização pelo token, dentro da função — o GRANT a anon é o acesso por link, não permissão de leitura.';
