-- ============================================================
-- PLANTA BAIXA POR TIPOLOGIA, para a ficha do Espelho de Vendas 3D
-- Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md (F5)
-- Decisão do usuário (09/11/2026): a ficha da unidade traz "tudo do vídeo" —
-- dados, capa, PLANTA POR TIPOLOGIA, vista da janela e luz do dia.
--
-- A planta é cadastrada uma vez por tipologia do empreendimento ("Tipo 1") e
-- vale para toda unidade daquela tipologia. A tipologia é texto livre em dois
-- cadastros (empreendimento_units.typology e commercial_properties.typology):
-- o casamento é por `tipologia_chave` — sem acento, caixa nem espaço sobrando,
-- calculada por quem grava (utils/espelhoPlantaDaTipologia.ts, chaveDaTipologia).
--
-- 1. Tabela empreendimento_tipologia_plantas (RLS pela organização do empreendimento).
-- 2. Bucket PÚBLICO de imagem `empreendimento-midia` — a planta aparece nos portais
--    por link, sem sessão; é material de venda, como a foto de capa do imóvel.
--    Path: {organization_id}/{empreendimento_id}/plantas/{uuid}-{nome}.
--    Sem policy de SELECT para anon: a URL pública do bucket serve a imagem, e
--    ninguém de fora LISTA o bucket.
-- 3. As duas funções que entregam o espelho aos portais passam a trazer `plantas`:
--    fn_broker_portal_get_espelho (corretor) e fn_espelho_de_vendas_das_obras (o
--    corpo das duas do investidor). O resto do corpo é o MESMO de
--    aplicar_20271110200000; entram a chave `plantas` e, no investidor, a tipologia
--    do imóvel quando a unidade não tem a sua (é por ela que a ficha acha a planta).
--    Imagem de planta: nada de preço, status ou pessoa.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. A tabela ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empreendimento_tipologia_plantas (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
    tipologia         TEXT NOT NULL,
    tipologia_chave   TEXT NOT NULL,
    imagem_url        TEXT NOT NULL,
    imagem_path       TEXT NOT NULL,
    created_by        UUID DEFAULT auth.uid(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT empreendimento_tipologia_plantas_tipologia_preenchida CHECK (btrim(tipologia) <> ''),
    -- A chave é minúscula e sem espaço nas pontas: é o que garante uma planta só por tipologia.
    CONSTRAINT empreendimento_tipologia_plantas_chave_normalizada CHECK (tipologia_chave <> '' AND tipologia_chave = lower(btrim(tipologia_chave))),
    CONSTRAINT empreendimento_tipologia_plantas_imagem_preenchida CHECK (btrim(imagem_url) <> '' AND btrim(imagem_path) <> ''),
    CONSTRAINT empreendimento_tipologia_plantas_uma_por_tipologia UNIQUE (empreendimento_id, tipologia_chave)
);

COMMENT ON TABLE public.empreendimento_tipologia_plantas IS
    'Espelho de Vendas 3D (F5): a planta baixa de cada tipologia do empreendimento. A ficha da unidade mostra a da tipologia dela.';
COMMENT ON COLUMN public.empreendimento_tipologia_plantas.tipologia_chave IS
    'A tipologia sem acento, caixa nem espaço sobrando (chaveDaTipologia, no front) — casa a planta com a tipologia da unidade e do imóvel.';
COMMENT ON COLUMN public.empreendimento_tipologia_plantas.imagem_path IS
    'O caminho no bucket empreendimento-midia — para apagar o arquivo junto com a linha.';

ALTER TABLE public.empreendimento_tipologia_plantas ENABLE ROW LEVEL SECURITY;

-- A mesma regra de empreendimento_towers: quem é da organização do empreendimento.
DROP POLICY IF EXISTS org_access_empr_tipologia_plantas ON public.empreendimento_tipologia_plantas;
CREATE POLICY org_access_empr_tipologia_plantas ON public.empreendimento_tipologia_plantas
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.empreendimentos e
        WHERE e.id = empreendimento_tipologia_plantas.empreendimento_id
          AND e.organization_id IN (SELECT public.empr_user_org_ids())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.empreendimentos e
        WHERE e.id = empreendimento_tipologia_plantas.empreendimento_id
          AND e.organization_id IN (SELECT public.empr_user_org_ids())
    ));

-- Portal lê por RPC: quem não tem sessão não toca a tabela.
REVOKE ALL ON TABLE public.empreendimento_tipologia_plantas FROM PUBLIC;
REVOKE ALL ON TABLE public.empreendimento_tipologia_plantas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.empreendimento_tipologia_plantas TO authenticated;

-- ── 2. O bucket ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'empreendimento-midia',
    'empreendimento-midia',
    TRUE,        -- público: a URL da planta abre nos portais por link, sem sessão
    5242880,     -- 5 MB por arquivo (o limite que a tela anuncia)
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- A primeira pasta do caminho é a organização; só quem é dela lê a lista, sobe, troca e apaga.
DROP POLICY IF EXISTS "empreendimento_midia_membro_le" ON storage.objects;
CREATE POLICY "empreendimento_midia_membro_le" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'empreendimento-midia'
           AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.empr_user_org_ids() o));

DROP POLICY IF EXISTS "empreendimento_midia_membro_sobe" ON storage.objects;
CREATE POLICY "empreendimento_midia_membro_sobe" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'empreendimento-midia'
                AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.empr_user_org_ids() o));

DROP POLICY IF EXISTS "empreendimento_midia_membro_troca" ON storage.objects;
CREATE POLICY "empreendimento_midia_membro_troca" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'empreendimento-midia'
           AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.empr_user_org_ids() o))
    WITH CHECK (bucket_id = 'empreendimento-midia'
                AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.empr_user_org_ids() o));

DROP POLICY IF EXISTS "empreendimento_midia_membro_apaga" ON storage.objects;
CREATE POLICY "empreendimento_midia_membro_apaga" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'empreendimento-midia'
           AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.empr_user_org_ids() o));

-- ── 3. Portal do Corretor: o espelho passa a trazer as plantas ──────────────
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
            'plantas', COALESCE((
                -- As plantas por tipologia dos empreendimentos dos prédios que o corretor vê (F5).
                SELECT jsonb_agg(jsonb_build_object(
                    'empreendimento_id', pl.empreendimento_id,
                    'commercial_building_id', e2.commercial_building_id,
                    'tipologia', pl.tipologia,
                    'tipologia_chave', pl.tipologia_chave,
                    'imagem_url', pl.imagem_url
                ) ORDER BY pl.tipologia)
                FROM public.empreendimento_tipologia_plantas pl
                JOIN public.empreendimentos e2 ON e2.id = pl.empreendimento_id
                WHERE e2.commercial_building_id IN (
                    SELECT COALESCE(p.parent_id, p.id)
                    FROM public.commercial_properties p
                    WHERE p.id IN (SELECT id FROM visiveis)
                )
            ), '[]'::jsonb),
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

-- ── 4. Portal do Investidor: idem, no corpo interno ─────────────────────────
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
               tw.empreendimento_id,
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
        SELECT u.id, u.tower_id, t.obra_id, u.name, u.floor, u.floor_tipo,
               -- A tipologia da unidade; sem ela, a do imóvel do estoque (é por ela que a ficha acha a planta).
               COALESCE(NULLIF(btrim(u.typology), ''), NULLIF(btrim(cp.typology), '')) AS typology,
               u.private_area,
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
                   'plantas', COALESCE((
                       -- As plantas por tipologia dos empreendimentos desta obra (F5).
                       SELECT jsonb_agg(jsonb_build_object(
                           'tipologia', pl.tipologia,
                           'tipologia_chave', pl.tipologia_chave,
                           'imagem_url', pl.imagem_url
                       ) ORDER BY pl.tipologia)
                       FROM public.empreendimento_tipologia_plantas pl
                       WHERE pl.empreendimento_id IN (SELECT t.empreendimento_id FROM torres t WHERE t.obra_id = pr.id)
                   ), '[]'::jsonb),
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
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relname = 'empreendimento_tipologia_plantas' AND c.relrowsecurity) THEN
        RAISE EXCEPTION 'empreendimento_tipologia_plantas deveria existir com RLS ligada';
    END IF;
    IF has_table_privilege('anon', 'public.empreendimento_tipologia_plantas', 'SELECT') THEN
        RAISE EXCEPTION 'anon não pode ler empreendimento_tipologia_plantas (portal lê por RPC)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'empreendimento-midia' AND public) THEN
        RAISE EXCEPTION 'o bucket empreendimento-midia deveria existir e ser público';
    END IF;
    IF has_function_privilege('anon', 'public.fn_espelho_de_vendas_das_obras(uuid, uuid[])', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_espelho_de_vendas_das_obras(uuid, uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_espelho_de_vendas_das_obras é interna: não pode ter EXECUTE para a API';
    END IF;
    IF position('plantas' IN pg_get_functiondef('public.fn_broker_portal_get_espelho(text)'::regprocedure)) = 0
       OR position('plantas' IN pg_get_functiondef('public.fn_espelho_de_vendas_das_obras(uuid, uuid[])'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'as duas funções do espelho deveriam trazer a chave plantas';
    END IF;
END;
$$;
