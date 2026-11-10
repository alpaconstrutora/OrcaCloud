-- ============================================================
-- Portal do Corretor — a ESTRUTURA das torres para o Espelho de Vendas 3D
-- Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md (F3)
-- Pedido (09/11/2026): a torre do empreendimento em 3D no Estoque do corretor,
-- cada unidade na cor do status, o toque abre a ficha.
--
-- O QUE ENTREGA: torres, pavimentos e unidades de Incorporação › Empreendimento
-- dos prédios que o corretor do token vê — só GEOMETRIA (andar, área, posição,
-- ordem) e o id do imóvel do estoque de cada unidade. Nada de preço nem de
-- status: esses continuam vindo de `fn_broker_portal_get_units`, que já aplica
-- `show_price_to_broker`. Leitura de portal é sempre por RPC — a tabela lida
-- direto pelo link devolve [] em silêncio.
--
-- QUEM VÊ O QUÊ: a torre entra quando tem ao menos uma unidade cujo imóvel o
-- corretor vê (o MESMO predicado de `fn_broker_portal_get_units`). As outras
-- unidades da torre vêm sem `property_id` — guardam o lugar no prédio, sem
-- dizer qual imóvel são.
--
-- Sem esta função o 3D do portal continua funcionando: cai na forma tirada do
-- próprio estoque (bloco e andar do imóvel). Ela só acrescenta a forma do
-- Empreendimento (pé-direito, elevação, posição das unidades no andar).
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_espelho(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.broker_portal_tokens;
    v_bp  public.broker_profiles;
BEGIN
    -- A autorização é o token, conferido aqui dentro (REGRA #7).
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN (
        WITH visiveis AS (
            -- O mesmo predicado de fn_broker_portal_get_units.
            SELECT p.id
            FROM public.commercial_properties p
            WHERE p.visible_to_broker = TRUE
              AND (
                (p.organization_id = v_tok.org_id AND p.parent_id IS NULL AND p.type <> 'BUILDING')
                OR EXISTS (
                    SELECT 1
                    FROM public.broker_property_access a
                    JOIN public.broker_profiles bp2 ON bp2.id = a.broker_id
                    WHERE lower(bp2.email) = lower(v_bp.email)
                      AND a.enabled = TRUE
                      AND a.property_id = COALESCE(p.parent_id, p.id)
                )
              )
        ),
        torres AS (
            SELECT DISTINCT u.tower_id AS id
            FROM public.empreendimento_units u
            WHERE u.commercial_property_id IN (SELECT id FROM visiveis)
        )
        SELECT jsonb_build_object(
            'valid', TRUE,
            'torres', COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', tw.id,
                    'name', tw.name,
                    'commercial_building_id', e.commercial_building_id,
                    'sort_order', tw.sort_order,
                    'floors_count', tw.floors_count,
                    'units_per_floor', tw.units_per_floor,
                    'pe_direito_padrao_m', tw.pe_direito_padrao_m,
                    'elevacao_terreo_m', tw.elevacao_terreo_m,
                    'ordem_das_unidades_na_planta', tw.ordem_das_unidades_na_planta,
                    'blueprint_quadra_uid', tw.blueprint_quadra_uid,
                    'distancias_entre_torres', e.distancias_entre_torres,
                    'floors', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                            'id', f.id, 'tower_id', f.tower_id, 'name', f.name, 'tipo', f.tipo,
                            'floor_number', f.floor_number, 'repeat_count', f.repeat_count,
                            'units_per_floor', f.units_per_floor, 'prefix', f.prefix,
                            'pe_direito_m', f.pe_direito_m, 'elevacao_m', f.elevacao_m,
                            'sort_order', f.sort_order
                        ) ORDER BY f.sort_order, f.floor_number)
                        FROM public.empreendimento_floors f
                        WHERE f.tower_id = tw.id
                    ), '[]'::jsonb),
                    'units', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                            'id', u.id, 'name', u.name, 'floor', u.floor, 'floor_tipo', u.floor_tipo,
                            'private_area', u.private_area, 'position_type', u.position_type,
                            'sun_orientation', u.sun_orientation, 'sort_order', u.sort_order,
                            'vaga_na_planta', u.vaga_na_planta,
                            'property_id', CASE WHEN u.commercial_property_id IN (SELECT id FROM visiveis)
                                                THEN u.commercial_property_id END
                        ) ORDER BY u.sort_order, u.name)
                        FROM public.empreendimento_units u
                        WHERE u.tower_id = tw.id
                    ), '[]'::jsonb)
                ) ORDER BY tw.sort_order, tw.name
            ), '[]'::jsonb)
        )
        FROM public.empreendimento_towers tw
        JOIN public.empreendimentos e ON e.id = tw.empreendimento_id
        WHERE tw.id IN (SELECT id FROM torres)
    );
END;
$X$;

COMMENT ON FUNCTION public.fn_broker_portal_get_espelho(TEXT) IS
    'Portal do Corretor: torres, pavimentos e unidades (só geometria + id do imóvel visível) para o Espelho de Vendas 3D. Autorização pelo token.';

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
-- `anon` PRECISA executar: o portal é acesso por link, sem sessão. O REVOKE
-- nomeia PUBLIC e anon — o default do Supabase dá grant NOMINAL a anon, que
-- revogar de PUBLIC não remove — e só então o GRANT explícito.
REVOKE ALL ON FUNCTION public.fn_broker_portal_get_espelho(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_broker_portal_get_espelho(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_espelho(TEXT) TO anon, authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT has_function_privilege('anon', 'public.fn_broker_portal_get_espelho(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_broker_portal_get_espelho deveria ser chamavel por anon (portal por link)';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.oid = 'public.fn_broker_portal_get_espelho(text)'::regprocedure
          AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    ) THEN
        RAISE EXCEPTION 'fn_broker_portal_get_espelho ainda tem EXECUTE para PUBLIC';
    END IF;
    -- Token que não existe: a função responde, e responde "inválido".
    IF (public.fn_broker_portal_get_espelho('token-que-nao-existe') ->> 'valid')::boolean IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'fn_broker_portal_get_espelho deveria devolver valid=false para token inexistente';
    END IF;
END;
$$;
