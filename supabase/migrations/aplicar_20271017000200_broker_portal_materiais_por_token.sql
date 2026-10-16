-- ============================================================
-- Portal do Corretor — Materiais pelo LINK (leitura por token)
-- Plano: docs/planos/2026-10-16-portal-corretor-mobile.md (decisão D10)
-- Pedido (16/10/2026): "RPC de leitura + tirar o botão"
--
-- A aba Materiais lia `broker_portal_materials` direto pelo client — com a
-- RLS, quem entra pelo link (anon, ou o login por e-mail que reaproveita a
-- casca do link) recebia [] em silêncio: o corretor nunca via material
-- nenhum, e o passo "Baixe um material" dos Primeiros passos não tinha como
-- ser cumprido. Leitura de portal é SEMPRE por RPC (memória "Portal lendo
-- TABELA direto = [] silencioso").
--
-- Mesmo desenho das irmãs (fn_broker_portal_get_price_columns /
-- _get_commissions): token ativo e dentro da validade → organização do token
-- → os materiais ATIVOS dela. Só leitura; não devolve is_public nem nada de
-- outra organização.
--
-- REGRA #7: SECURITY DEFINER com a autorização DENTRO (o token); REVOKE de
-- PUBLIC no mesmo arquivo; EXECUTE só para anon (link) e authenticated
-- (login por e-mail), como fn_broker_portal_get_price_columns.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_materials(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tok public.broker_portal_tokens;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid',     TRUE,
        'materials', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                        'id',              m.id,
                        'organization_id', m.organization_id,
                        'project_id',      m.project_id,
                        'title',           m.title,
                        'description',     m.description,
                        'type',            m.type,
                        'file_url',        m.file_url,
                        'thumbnail_url',   m.thumbnail_url,
                        'version',         m.version,
                        'views_count',     m.views_count,
                        'created_at',      m.created_at,
                        'updated_at',      m.updated_at
                    ) ORDER BY m.created_at DESC)
             FROM public.broker_portal_materials m
             WHERE m.organization_id = v_tok.org_id
               AND COALESCE(m.is_active, TRUE)),
            '[]'::jsonb
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_get_materials(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_get_materials(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.fn_broker_portal_get_materials(TEXT) IS
    'Portal do Corretor pelo link: materiais ativos da organização do token. Só leitura. Plano 2026-10-16-portal-corretor-mobile (D10).';
