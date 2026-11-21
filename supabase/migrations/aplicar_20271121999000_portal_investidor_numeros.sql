-- Fase B (números) de docs/planos/2026-11-21-portal-do-investidor-consolidacao.md — itens B1, B2 e B6.
--
-- B1/B2: o sócio da SPE é a participação do investidor, e o patrimônio vem da SPE e da versão publicada:
--   integralizado (spe_partners.capital_paid) + lucro líquido da versão × % de cotas.
--   `fn_socios_do_investidor` é a ÚNICA leitura disso no banco: a aba SPE do link (fn_investor_portal_get_spes)
--   e a carteira do gestor (fn_investidor_socios) chamam a mesma.
-- B6: o vendido do espelho do investidor passa a ser a parte de cada unidade vendável (regra única D6,
--   lib/salesAnalysis.ts), não o valor cheio da negociação.
--
-- REGRA #7: sem policy nova. Pergunta 2: `fn_socios_do_investidor` não é chamável por ninguém (só pelas
-- SECURITY DEFINER abaixo); `fn_investidor_socios` (SECURITY DEFINER) só devolve o recorte das organizações
-- em que QUEM CHAMA é membro e o investidor também está; `fn_investor_portal_get_spes` confere o token.
--
-- Reversão: recriar fn_investor_portal_get_spes e fn_espelho_de_vendas_das_obras a partir do banco de 21/11
-- (a versão anterior desta última está em aplicar_20271110990000); DROP das duas funções novas.

CREATE OR REPLACE FUNCTION public.fn_socios_do_investidor(p_investor_id uuid, p_orgs uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',                   se.id,
            'organization_id',      se.organization_id,
            'name',                 se.name,
            'cnpj',                 se.cnpj,
            'capital_social',       se.capital_social,
            'project_id',           se.project_id,
            'project_name',         pr.name,
            -- a participação do investidor pedido, nunca a de outro
            'quota_count',          sp.quota_count,
            'ownership_pct',        sp.ownership_pct,
            'capital_calls_total',  sp.capital_calls_total,
            'capital_paid',         sp.capital_paid,
            -- quantos sócios ao todo, sem identificar nenhum
            'partners_count',       (SELECT COUNT(*) FROM public.spe_partners x WHERE x.spe_entity_id = se.id),
            -- o resultado projetado: lucro líquido da versão congelada da oportunidade desta SPE
            'opportunity_id',       op.id,
            'versao_label',         op.versao_label,
            'lucro_da_versao',      op.lucro
        )
        ORDER BY se.name
    ), '[]'::jsonb)
    FROM public.spe_partners sp
    JOIN public.spe_entities se ON se.id = sp.spe_entity_id
    LEFT JOIN public.projects pr ON pr.id = se.project_id
    LEFT JOIN LATERAL (
        SELECT o.id, v.label AS versao_label,
               NULLIF(v.snapshot -> 'calculo' -> 'investidor' -> 'indicadores' ->> 'lucroLiquido', '')::numeric AS lucro
          FROM public.investor_opportunities o
          JOIN public.imovib_study_versions v ON v.id = o.imovib_version_id AND v.study_id = o.imovib_study_id
         WHERE o.spe_entity_id = se.id
           AND o.organization_id = se.organization_id
         ORDER BY o.is_published DESC, o.created_at DESC
         LIMIT 1
    ) op ON true
    WHERE sp.investor_id = p_investor_id
      AND se.organization_id = ANY (p_orgs);
$$;
REVOKE ALL ON FUNCTION public.fn_socios_do_investidor(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_spes(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'spes', public.fn_socios_do_investidor(v_tok.investor_id, public.fn_orgs_do_investidor(v_tok.investor_id))
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_spes(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_spes(text) TO anon, authenticated;

-- A carteira do investidor vista pelo gestor (app logado): o mesmo recorte, só nas organizações de quem chama.
CREATE OR REPLACE FUNCTION public.fn_investidor_socios(p_investor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orgs uuid[];
BEGIN
    SELECT COALESCE(array_agg(o), '{}'::uuid[]) INTO v_orgs
      FROM unnest(public.fn_orgs_do_investidor(p_investor_id)) o
     WHERE o IN (SELECT public.minhas_orgs_membro());
    RETURN public.fn_socios_do_investidor(p_investor_id, v_orgs);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_investidor_socios(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_investidor_socios(uuid) TO authenticated;

-- B1 — o resumo pelo link traz também a ficha das obras das SPEs do investidor (local, fase, avanço).
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_summary(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok      public.investor_portal_tokens;
    v_inv_id   UUID;
    v_orgs     UUID[];
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_orgs   := public.fn_orgs_do_investidor(v_inv_id);

    RETURN jsonb_build_object(
        'valid', TRUE,
        'participations', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',               ip.id,
                    'project_id',       ip.project_id,
                    'project_name',     p.name,
                    'ownership_pct',    ip.ownership_pct,
                    'committed_amount', ip.committed_amount,
                    'quota_count',      ip.quota_count
                )
                ORDER BY p.name
             )
             FROM public.investor_participations ip
             JOIN public.projects p ON p.id = ip.project_id
             WHERE ip.investor_id = v_inv_id
               AND ip.organization_id = ANY (v_orgs)
               AND p.organization_id = ip.organization_id),
            '[]'::jsonb
        ),
        'contributions', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                    'id',              ic.id,
                    'organization_id', ic.organization_id,
                    'project_id',      ic.project_id,
                    'investor_id',     ic.investor_id,
                    'type',            ic.type,
                    'amount',          ic.amount,
                    'due_date',        ic.due_date,
                    'paid_date',       ic.paid_date,
                    'status',          ic.status,
                    'description',     ic.description,
                    'payment_method',  ic.payment_method,
                    'receipt_url',     ic.receipt_url,
                    'created_at',      ic.created_at
                ) ORDER BY ic.created_at DESC)
             FROM public.investor_contributions ic
             WHERE ic.investor_id = v_inv_id
               AND ic.organization_id = ANY (v_orgs)),
            '[]'::jsonb
        ),
        'projects', COALESCE(
            (WITH project_ids AS (
                SELECT ip.project_id
                FROM public.investor_participations ip
                WHERE ip.investor_id = v_inv_id
                  AND ip.organization_id = ANY (v_orgs)

                UNION

                SELECT pr_legacy.id AS project_id
                FROM public.projects pr_legacy
                WHERE pr_legacy.investor_id = v_inv_id
                  AND pr_legacy.organization_id = ANY (v_orgs)
                UNION

                -- Fase B1: as obras das SPEs de que o investidor é sócio (a carteira lê o sócio da SPE).
                SELECT se.project_id
                FROM public.spe_partners sp
                JOIN public.spe_entities se ON se.id = sp.spe_entity_id
                WHERE sp.investor_id = v_inv_id
                  AND se.project_id IS NOT NULL
                  AND se.organization_id = ANY (v_orgs)
            )
             SELECT jsonb_agg(
                jsonb_build_object(
                    'id',              pr.id,
                    'organization_id', pr.organization_id,
                    'name',            pr.name,
                    'investor_id',     pr.investor_id,
                    -- Só o que o portal lê (InvestorDashboard, utils/investidorCarteira, AssetDetailModal):
                    -- valor, área, CUB, avanço, fase, local e as datas/fotos do diário. Nada de orçamento.
                    'settings',        jsonb_strip_nulls(jsonb_build_object(
                        'classification', pr.settings -> 'classification',
                        'investorId',     pr.settings -> 'investorId',
                        'financialInfo',  jsonb_strip_nulls(jsonb_build_object('totalValue', pr.settings -> 'financialInfo' -> 'totalValue')),
                        'area',           pr.settings -> 'area',
                        'cubRate',        pr.settings -> 'cubRate',
                        'obraProgress',   pr.settings -> 'obraProgress',
                        'obraPhase',      pr.settings -> 'obraPhase',
                        'location',       pr.settings -> 'location',
                        'diaryEntries',   (SELECT jsonb_agg(jsonb_build_object('date', e -> 'date', 'images', e -> 'images'))
                                             FROM jsonb_array_elements(
                                                 CASE WHEN jsonb_typeof(pr.settings -> 'diaryEntries') = 'array'
                                                      THEN pr.settings -> 'diaryEntries' ELSE '[]'::jsonb END) e)
                    ))
                )
                ORDER BY pr.name
             )
             FROM public.projects pr
             JOIN project_ids pi ON pi.project_id = pr.id
             WHERE pr.organization_id = ANY (v_orgs)
               AND pr.settings->>'classification' = 'OBRA'),
            '[]'::jsonb
        )
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_summary(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_summary(text) TO anon, authenticated;

-- B6 — espelho do investidor: o vendido pela parte de cada unidade vendável (regra única D6).
CREATE OR REPLACE FUNCTION public.fn_espelho_de_vendas_das_obras(p_org_id uuid, p_project_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    partes AS (
        -- A parte de cada unidade no valor da VENDA (Contrato, Assinatura, Concluído): a mesma regra de
        -- parteDaUnidadeNaNegociacao (lib/salesAnalysis.ts) — o valor da própria unidade quando o contrato o
        -- traz, senão rateio pela tabela (price, senão initial_price), senão por igual. Fase B6.
        SELECT z.property_id,
               CASE WHEN z.n_unidades <= 1 THEN z.valor_total
                    WHEN z.valor_da_unidade > 0 THEN z.valor_da_unidade
                    WHEN z.soma_tabela > 0 THEN z.valor_total * z.tabela / z.soma_tabela
                    ELSE z.valor_total / z.n_unidades END AS parte
        FROM (
            SELECT v.deal_id, v.property_id, v.valor_total, v.valor_da_unidade,
                   count(*) OVER (PARTITION BY v.deal_id) AS n_unidades,
                   COALESCE(NULLIF(cp.price, 0), cp.initial_price, 0) AS tabela,
                   sum(COALESCE(NULLIF(cp.price, 0), cp.initial_price, 0)) OVER (PARTITION BY v.deal_id) AS soma_tabela
            FROM (
                -- As unidades da venda como em unitIdsOf: as da cesta; sem cesta, a principal.
                SELECT d.id AS deal_id, du.property_id, COALESCE(d.value, 0) AS valor_total, COALESCE(du.value, 0) AS valor_da_unidade
                  FROM public.commercial_deals d
                  JOIN public.commercial_deal_units du ON du.deal_id = d.id
                 WHERE d.type = 'SALE' AND d.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')
                UNION ALL
                SELECT d.id, d.property_id, COALESCE(d.value, 0), 0
                  FROM public.commercial_deals d
                 WHERE d.type = 'SALE' AND d.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')
                   AND d.property_id IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM public.commercial_deal_units du WHERE du.deal_id = d.id)
            ) v
            LEFT JOIN public.commercial_properties cp ON cp.id = v.property_id
        ) z
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
                       -- D6: Σ da parte de cada unidade VENDÁVEL da obra — não o valor cheio da negociação
                       -- (que contava as unidades de outra obra da mesma cesta) nem a garagem vendida junto.
                       SELECT COALESCE(sum(pt.parte), 0)
                       FROM unidades u
                       JOIN partes pt ON pt.property_id = u.commercial_property_id
                       WHERE u.obra_id = pr.id AND u.is_vendavel IS DISTINCT FROM false
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
                   'decorado', COALESCE((
                       -- O decorado por tipologia dos empreendimentos desta obra (F8).
                       SELECT jsonb_agg(jsonb_build_object(
                           'tipologia', dc.tipologia,
                           'tipologia_chave', dc.tipologia_chave,
                           'papel', dc.papel,
                           'legenda', dc.legenda,
                           'ordem', dc.ordem,
                           'imagem_url', dc.imagem_url,
                           'origem', dc.origem
                       ) ORDER BY dc.tipologia, dc.papel, dc.ordem)
                       FROM public.empreendimento_tipologia_decorado dc
                       WHERE dc.empreendimento_id IN (SELECT t.empreendimento_id FROM torres t WHERE t.obra_id = pr.id)
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
                               'vistas', COALESCE((
                                   -- As vistas da janela desta torre, por faixa de andares (F6).
                                   SELECT jsonb_agg(jsonb_build_object(
                                       'andar_de', v.andar_de, 'andar_ate', v.andar_ate, 'orientacao', v.orientacao,
                                       'imagem_url', v.imagem_url, 'legenda', v.legenda,
                                       'unit_id', v.unit_id,
                                       'unit_name', (SELECT vu.name FROM public.empreendimento_units vu WHERE vu.id = v.unit_id)
                                   ) ORDER BY v.andar_de, v.andar_ate, v.orientacao NULLS LAST)
                                   FROM public.empreendimento_tower_vistas v
                                   WHERE v.tower_id = t.id
                               ), '[]'::jsonb),
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
$function$;

REVOKE ALL ON FUNCTION public.fn_espelho_de_vendas_das_obras(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
