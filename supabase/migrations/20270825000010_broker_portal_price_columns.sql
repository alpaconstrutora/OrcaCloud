-- ==========================================================================
-- Portal do Corretor › Empreendimentos: colunas configuráveis da tabela de preços
-- Date: 2026-07-25
-- ==========================================================================
-- CONTEXTO
-- A aba "Empreendimentos" do Portal do Corretor mostra a tabela de preços
-- vigente do prédio. Ela exibia um subconjunto das colunas de
-- PriceTableManager (faltavam Banheiros, Pavimento e Posição) e não tinha o
-- botão de configurar colunas.
--
-- A escolha de colunas aqui NÃO é preferência de tela (localStorage): ela é
-- uma decisão de PRODUTO da organização — o que o admin marca na visão do app
-- é o que o corretor vê no link público. Por isso mora no banco, por
-- organização, e é lida pelo modo anon via RPC própria (o link não tem sessão
-- Supabase).
--
-- Sem FK para `organizations` de propósito: DDL com FK em tabela quente já
-- deadlockou neste projeto. `org_id` é conferido pela RLS (is_org_member) na
-- escrita e pelo token na leitura anon.
--
-- ⚠️ COMO APLICAR — UMA PARTE DE CADA VEZ, NUNCA O ARQUIVO INTEIRO
-- A primeira tentativa de rodar tudo de uma vez deu `40P01 deadlock detected`.
-- O SQL Editor envolve o script todo numa transação: a PARTE 3 pega
-- AccessExclusiveLock em fn_broker_portal_get_rental_price_table enquanto a
-- transação já segura locks das partes anteriores, e cruza com uma consulta
-- concorrente do app nas mesmas relações. Rodando PARTE 1, depois 2, depois 3,
-- cada uma é uma transação curta e não há ciclo.
--
-- Cada parte começa com `SET lock_timeout = '3s'`: se pegar tabela ocupada,
-- ela falha limpa com 55P03 (lock_not_available) em vez de virar deadlock —
-- é só esperar e rodar aquela parte de novo. As três são idempotentes.
--
-- NUNCA `supabase db push`.
-- ==========================================================================

-- ##########################################################################
-- PARTE 1 de 3 — tabela + RLS (rodar sozinha)
-- ##########################################################################
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.broker_portal_price_columns (
    org_id          UUID PRIMARY KEY,
    visible_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.broker_portal_price_columns IS
    'Colunas visíveis da tabela de preços no Portal do Corretor, por organização. '
    'Definido na visão do app (admin) e refletido na visão do link (anon, via '
    'fn_broker_portal_get_price_columns). Chaves: unit, status, privArea, '
    'bedrooms, bathrooms, parking, floor, position, price.';

ALTER TABLE public.broker_portal_price_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_portal_price_columns_member ON public.broker_portal_price_columns;
CREATE POLICY broker_portal_price_columns_member
    ON public.broker_portal_price_columns
    FOR ALL
    TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

-- Sem policy `TO anon`: o link público lê pela RPC SECURITY DEFINER abaixo.

-- ##########################################################################
-- PARTE 2 de 3 — RPC anon das colunas (rodar sozinha)
-- ##########################################################################
SET lock_timeout = '3s';

-- --------------------------------------------------------------------------
-- RPC anon: colunas visíveis da org dona do token.
-- Retorna columns=null quando a org nunca configurou — o front cai no default
-- (todas as colunas), que é o comportamento de hoje.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_price_columns(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok  public.broker_portal_tokens;
    v_cols JSONB;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT visible_columns INTO v_cols
    FROM public.broker_portal_price_columns
    WHERE org_id = v_tok.org_id;

    RETURN jsonb_build_object('valid', TRUE, 'columns', v_cols);
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_price_columns(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_price_columns(TEXT) TO anon, authenticated;

-- ##########################################################################
-- PARTE 3 de 3 — RPC de locação (rodar sozinha; foi esta que deadlockou)
-- ##########################################################################
SET lock_timeout = '3s';

-- --------------------------------------------------------------------------
-- fn_broker_portal_get_rental_price_table — mesmo corpo de 20270824000002, +
-- o corte de visible_to_broker que a RPC de VENDA já tem desde 20270822000018
-- e a de LOCAÇÃO (criada depois) nunca recebeu: uma unidade marcada como
-- "não visível para corretor" continuava aparecendo na tabela de aluguéis do
-- link público. Também passa a devolver a chave `visible_to_broker`, que o
-- front usa como segunda barreira (`items.filter(i => i.visible_to_broker !== false)`).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_rental_price_table(p_token TEXT, p_building_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok   public.broker_portal_tokens;
    v_bldg  public.commercial_properties;
    v_table public.rental_price_tables;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bldg
    FROM public.commercial_properties
    WHERE id = p_building_id AND organization_id = v_tok.org_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_table
    FROM public.rental_price_tables
    WHERE building_id = p_building_id
      AND organization_id = v_tok.org_id
      AND status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', TRUE, 'table', NULL, 'items', '[]'::jsonb);
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'table', jsonb_build_object(
            'id', v_table.id,
            'version_label', v_table.version_label,
            'effective_date', v_table.effective_date,
            'status', v_table.status,
            'activated_at', v_table.activated_at
        ),
        'items', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', it.id,
                'price_table_id', it.price_table_id,
                'property_id', it.property_id,
                'price', it.price,
                'property_name', p.name,
                'current_price', p.rental_price,
                'property_status', p.status,
                'private_area', p.private_area,
                'bedrooms', COALESCE(NULLIF(p.bedrooms, 0), NULLIF((p.specs->>'bedrooms')::int, 0)),
                'bathrooms', COALESCE(NULLIF(p.bathrooms, 0), NULLIF((p.specs->>'bathrooms')::int, 0)),
                'parking_spaces', COALESCE(NULLIF(p.parking_spaces, 0), NULLIF((p.specs->>'parkingSpaces')::int, 0)),
                'floor', COALESCE(NULLIF(p.floor, 0), NULLIF((p.specs->>'floor')::int, 0)),
                'position_type', p.position_type,
                'visible_to_broker', p.visible_to_broker
             ))
             FROM public.rental_price_table_items it
             JOIN public.commercial_properties p ON p.id = it.property_id
             WHERE it.price_table_id = v_table.id
               AND p.organization_id = v_tok.org_id
               AND p.visible_to_broker = TRUE),
            '[]'::jsonb
        )
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_rental_price_table(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_rental_price_table(TEXT, UUID) TO anon, authenticated;
