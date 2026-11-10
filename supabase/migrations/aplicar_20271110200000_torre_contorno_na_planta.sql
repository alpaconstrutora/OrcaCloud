-- ============================================================
-- O CONTORNO DA TORRE, vindo da Planta Inteligente, para o Espelho de Vendas 3D
-- Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md (F1b)
-- Decisão do usuário (09/11/2026): a torre do espelho é HÍBRIDA — o contorno real
-- do Bloco da Planta quando existir; senão a volumetria esquemática do cadastro.
--
-- POR QUE NA TORRE: o contorno do Bloco mora no payload do estudo
-- (blueprint_branches.draft_payload), e o casamento bloco ↔ torre só existe com
-- o editor aberto. Os portais não abrem o estudo. A Planta ENVIA o contorno
-- (ação "Enviar contorno ao Espelho 3D", no painel do bloco), e ele fica aqui:
--   contorno_na_planta      o anel do Bloco, em mm, nas coordenadas do desenho
--   contorno_frente         a direção (unitária) da frente do lote para a rua — é o
--                           que põe Frente/Fundos/Lateral das unidades no lado certo
--   contorno_norte_deg      o norte do desenho (para a Orientação solar das unidades)
--   contorno_atualizado_em  quando foi enviado — o desenho pode ter mudado depois
--
-- E as duas funções que entregam a estrutura das torres aos portais passam a
-- trazer o contorno: fn_broker_portal_get_espelho (corretor) e
-- fn_espelho_de_vendas_das_obras (o corpo das duas do investidor). O resto do
-- corpo delas é o MESMO de aplicar_20271109950000 e aplicar_20271110100000;
-- só entram as três chaves. Geometria de prédio: nada de preço, status ou pessoa.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. As colunas ───────────────────────────────────────────────────────────
ALTER TABLE public.empreendimento_towers
    ADD COLUMN IF NOT EXISTS contorno_na_planta JSONB,
    ADD COLUMN IF NOT EXISTS contorno_frente JSONB,
    ADD COLUMN IF NOT EXISTS contorno_norte_deg NUMERIC,
    ADD COLUMN IF NOT EXISTS contorno_atualizado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.empreendimento_towers.contorno_na_planta IS
    'Espelho de Vendas 3D: o anel do Bloco da Planta casado com esta torre — lista de {x, y} em mm, coordenadas do desenho. NULL = nunca enviado (a torre sai esquemática).';
COMMENT ON COLUMN public.empreendimento_towers.contorno_frente IS
    'Espelho de Vendas 3D: {x, y} unitário, da frente do lote para a rua, como estava no desenho ao enviar. NULL = lote sem frente.';
COMMENT ON COLUMN public.empreendimento_towers.contorno_norte_deg IS
    'Espelho de Vendas 3D: o norte do desenho, em graus, ao enviar. NULL = norte é o alto do desenho.';
COMMENT ON COLUMN public.empreendimento_towers.contorno_atualizado_em IS
    'Espelho de Vendas 3D: quando o contorno foi enviado pela Planta.';

-- O contorno, quando há, é uma lista (o formato de cada ponto quem confere é quem lê:
-- contornoDaLinha, que devolve "sem contorno" para qualquer coisa fora do formato).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empreendimento_towers_contorno_e_lista') THEN
        ALTER TABLE public.empreendimento_towers
            ADD CONSTRAINT empreendimento_towers_contorno_e_lista
            CHECK (contorno_na_planta IS NULL OR jsonb_typeof(contorno_na_planta) = 'array');
    END IF;
END;
$$;

-- ── 2. Portal do Corretor: a estrutura passa a trazer o contorno ────────────
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
                    'contorno_na_planta', tw.contorno_na_planta,
                    'contorno_frente', tw.contorno_frente,
                    'contorno_norte_deg', tw.contorno_norte_deg,
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

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_espelho(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_broker_portal_get_espelho(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_espelho(TEXT) TO anon, authenticated;

-- ── 3. Portal do Investidor: idem, no corpo interno ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_espelho_de_vendas_das_obras(p_org_id UUID, p_project_ids UUID[])
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $X$
    WITH torres AS (
        SELECT tw.id, tw.name, tw.sort_order, tw.floors_count, tw.units_per_floor,
               tw.pe_direito_padrao_m, tw.elevacao_terreo_m, tw.ordem_das_unidades_na_planta,
               tw.blueprint_quadra_uid, e.distancias_entre_torres,
               tw.contorno_na_planta, tw.contorno_frente, tw.contorno_norte_deg,
               COALESCE(tw.project_id, e.project_id) AS obra_id
        FROM public.empreendimento_towers tw
        JOIN public.empreendimentos e ON e.id = tw.empreendimento_id
        WHERE e.organization_id = p_org_id
          AND COALESCE(tw.project_id, e.project_id) = ANY (p_project_ids)
    ),
    negocios AS (
        -- Uma linha por (negociação de venda não cancelada, imóvel): a unidade principal e as da cesta.
        SELECT d.id, d.status, d.value, x.property_id
        FROM public.commercial_deals d
        CROSS JOIN LATERAL (
            SELECT d.property_id AS property_id WHERE d.property_id IS NOT NULL
            UNION
            SELECT du.property_id FROM public.commercial_deal_units du WHERE du.deal_id = d.id
        ) x
        WHERE d.type = 'SALE' AND d.status IS DISTINCT FROM 'CANCELLED'
    ),
    unidades AS (
        SELECT u.id, u.tower_id, t.obra_id, u.name, u.floor, u.floor_tipo, u.typology, u.private_area,
               u.bedrooms, u.bathrooms, u.parking_spaces, u.position_type, u.sun_orientation,
               u.sort_order, u.vaga_na_planta, u.is_vendavel, u.commercial_property_id,
               COALESCE(u.price, cp.current_price, cp.price) AS preco,
               upper(COALESCE(cp.status, u.status)) AS cadastro,
               EXISTS (SELECT 1 FROM negocios n WHERE n.property_id = u.commercial_property_id
                         AND n.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')) AS tem_venda,
               EXISTS (SELECT 1 FROM negocios n WHERE n.property_id = u.commercial_property_id) AS tem_negocio
        FROM public.empreendimento_units u
        JOIN torres t ON t.id = u.tower_id
        LEFT JOIN public.commercial_properties cp ON cp.id = u.commercial_property_id
    )
    SELECT COALESCE(jsonb_agg(o.obra ORDER BY o.nome), '[]'::jsonb)
    FROM (
        SELECT pr.name AS nome,
               jsonb_build_object(
                   'project_id', pr.id,
                   'project_name', pr.name,
                   'vgv_vendido', (
                       SELECT COALESCE(sum(v.value), 0)
                       FROM (
                           SELECT DISTINCT n.id, n.value
                           FROM negocios n
                           JOIN unidades u ON u.commercial_property_id = n.property_id
                           WHERE u.obra_id = pr.id AND n.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')
                       ) v
                   ),
                   'torres', (
                       SELECT COALESCE(jsonb_agg(
                           jsonb_build_object(
                               'id', t.id, 'name', t.name, 'sort_order', t.sort_order,
                               'floors_count', t.floors_count, 'units_per_floor', t.units_per_floor,
                               'pe_direito_padrao_m', t.pe_direito_padrao_m,
                               'elevacao_terreo_m', t.elevacao_terreo_m,
                               'ordem_das_unidades_na_planta', t.ordem_das_unidades_na_planta,
                               'blueprint_quadra_uid', t.blueprint_quadra_uid,
                               'contorno_na_planta', t.contorno_na_planta,
                               'contorno_frente', t.contorno_frente,
                               'contorno_norte_deg', t.contorno_norte_deg,
                               'distancias_entre_torres', t.distancias_entre_torres,
                               'floors', COALESCE((
                                   SELECT jsonb_agg(jsonb_build_object(
                                       'id', f.id, 'tower_id', f.tower_id, 'name', f.name, 'tipo', f.tipo,
                                       'floor_number', f.floor_number, 'repeat_count', f.repeat_count,
                                       'units_per_floor', f.units_per_floor, 'prefix', f.prefix,
                                       'pe_direito_m', f.pe_direito_m, 'elevacao_m', f.elevacao_m,
                                       'sort_order', f.sort_order
                                   ) ORDER BY f.sort_order, f.floor_number)
                                   FROM public.empreendimento_floors f WHERE f.tower_id = t.id
                               ), '[]'::jsonb),
                               'units', COALESCE((
                                   SELECT jsonb_agg(jsonb_build_object(
                                       'id', u.id, 'name', u.name, 'floor', u.floor, 'floor_tipo', u.floor_tipo,
                                       'typology', u.typology, 'private_area', u.private_area,
                                       'bedrooms', u.bedrooms, 'bathrooms', u.bathrooms,
                                       'parking_spaces', u.parking_spaces,
                                       'position_type', u.position_type, 'sun_orientation', u.sun_orientation,
                                       'sort_order', u.sort_order, 'vaga_na_planta', u.vaga_na_planta,
                                       'is_vendavel', u.is_vendavel,
                                       'price', u.preco,
                                       'status', CASE
                                           WHEN u.tem_venda OR u.cadastro IN ('SOLD', 'VENDIDO') THEN 'sold'
                                           WHEN u.cadastro IN ('EXCHANGED', 'PERMUTADO') THEN 'exchanged'
                                           WHEN u.tem_negocio OR u.cadastro IN ('RESERVED', 'RESERVADO') THEN 'reserved'
                                           WHEN u.cadastro IN ('AVAILABLE', 'DISPONIVEL', 'DISPONÍVEL') THEN 'available'
                                           ELSE 'other'
                                       END
                                   ) ORDER BY u.sort_order, u.name)
                                   FROM unidades u WHERE u.tower_id = t.id
                               ), '[]'::jsonb)
                           ) ORDER BY t.sort_order, t.name
                       ), '[]'::jsonb)
                       FROM torres t WHERE t.obra_id = pr.id
                   )
               ) AS obra
        FROM public.projects pr
        WHERE pr.id = ANY (p_project_ids)
          AND EXISTS (SELECT 1 FROM torres t WHERE t.obra_id = pr.id)
    ) o;
$X$;

-- Continua interna: sem EXECUTE para ninguém da API.
REVOKE ALL ON FUNCTION public.fn_espelho_de_vendas_das_obras(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_espelho_de_vendas_das_obras(UUID, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.fn_espelho_de_vendas_das_obras(UUID, UUID[]) FROM authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
BEGIN
    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'empreendimento_towers'
          AND column_name IN ('contorno_na_planta', 'contorno_frente', 'contorno_norte_deg', 'contorno_atualizado_em')) <> 4 THEN
        RAISE EXCEPTION 'empreendimento_towers deveria ter as quatro colunas contorno_*';
    END IF;
    IF NOT has_function_privilege('anon', 'public.fn_broker_portal_get_espelho(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_broker_portal_get_espelho deveria ser chamavel por anon (portal por link)';
    END IF;
    IF has_function_privilege('anon', 'public.fn_espelho_de_vendas_das_obras(uuid, uuid[])', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_espelho_de_vendas_das_obras(uuid, uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_espelho_de_vendas_das_obras e interna e nao deveria ser chamavel pela API';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.oid IN ('public.fn_broker_portal_get_espelho(text)'::regprocedure,
                        'public.fn_espelho_de_vendas_das_obras(uuid, uuid[])'::regprocedure)
          AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    ) THEN
        RAISE EXCEPTION 'funcao do espelho ainda tem EXECUTE para PUBLIC';
    END IF;
    IF (public.fn_broker_portal_get_espelho('token-que-nao-existe') ->> 'valid')::boolean IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'fn_broker_portal_get_espelho deveria devolver valid=false para token inexistente';
    END IF;
END;
$$;
