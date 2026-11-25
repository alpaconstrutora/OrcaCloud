-- REVERSÃO de supabase/migrations/aplicar_20271125200000_sem_marketplace.sql (25/11/2026).
-- Plano: docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md (F1).
-- Repõe as 2 colunas (com os valores de antes do DROP), os índices e as 2 funções como estavam no banco.
-- Rodar só se for desfazer: npx supabase db query --linked -f scripts/rollback-sem-marketplace.sql

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_slug_key UNIQUE (slug);
CREATE INDEX IF NOT EXISTS idx_organizations_slug_lower ON public.organizations USING btree (lower(slug)) WHERE (slug IS NOT NULL);
UPDATE public.organizations SET slug = 'garden-cambuhy'       WHERE id = 'a2c4b292-48a1-42db-9e8a-a8defbec48a0';
UPDATE public.organizations SET slug = 'alpa'                 WHERE id = '926cf626-ba49-4ee4-9f35-472822fb90e6';
UPDATE public.organizations SET slug = 'alpa-empreendimentos' WHERE id = 'f0f4fafb-e161-47ac-97b5-e029f7bf29dc';

ALTER TABLE public.investor_opportunities ADD COLUMN IF NOT EXISTS no_marketplace boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.investor_opportunities.no_marketplace IS
    'Aparece no marketplace público (get_public_marketplace, sem login). Independe de is_published (portal do investidor).';
UPDATE public.investor_opportunities SET no_marketplace = true WHERE id = '8eef782f-e222-4296-9e43-3e90b68a3db1';

CREATE OR REPLACE FUNCTION public.get_public_marketplace(p_slug text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id   uuid;
    v_org_info json;
    v_opps     json;
BEGIN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE lower(slug) = lower(p_slug)
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RETURN json_build_object('error', 'organization_not_found');
    END IF;

    SELECT json_build_object('id', id, 'name', name, 'logo_url', logo_url, 'website', website)
    INTO v_org_info
    FROM public.organizations
    WHERE id = v_org_id;

    SELECT coalesce(json_agg(item ORDER BY item->>'created_at' DESC), '[]'::json)
    INTO v_opps
    FROM (
        SELECT jsonb_build_object(
                'id',               v.vitrine -> 'id',
                'title',            v.vitrine -> 'title',
                'subtitle',         v.vitrine -> 'subtitle',
                'status',           v.vitrine -> 'status',
                'opportunity_type', v.vitrine -> 'opportunity_type',
                'ticket_min',       v.vitrine -> 'ticket_min',
                'thumbnail_url',    v.vitrine -> 'thumbnail_url',
                'fotos',            v.vitrine -> 'fotos',
                'local',            v.vitrine -> 'local',
                'open_date',        v.vitrine -> 'open_date',
                'created_at',       v.vitrine -> 'created_at',
                'is_published',     v.vitrine -> 'is_published',
                -- Só VGV e TIR do cálculo congelado, e o prazo: o resto do estudo é para quem tem o link.
                'indicadores_da_versao', CASE WHEN v.vitrine -> 'indicadores_da_versao' IS NULL OR v.vitrine -> 'indicadores_da_versao' = 'null'::jsonb THEN NULL
                    ELSE jsonb_strip_nulls(jsonb_build_object(
                        'vgv',      v.vitrine -> 'indicadores_da_versao' -> 'vgv',
                        'tirAnual', v.vitrine -> 'indicadores_da_versao' -> 'tirAnual')) END,
                'resultados_da_versao', CASE WHEN v.vitrine -> 'resultados_da_versao' IS NULL OR v.vitrine -> 'resultados_da_versao' = 'null'::jsonb THEN NULL
                    ELSE jsonb_strip_nulls(jsonb_build_object('duracao', v.vitrine -> 'resultados_da_versao' -> 'duracao')) END
            )::json AS item
        FROM public.investor_opportunities o
        CROSS JOIN LATERAL (SELECT public.fn_oportunidade_na_vitrine(o) AS vitrine) v
        WHERE o.organization_id = v_org_id
          AND o.is_published = true
          AND o.no_marketplace = true
    ) sub;

    RETURN json_build_object('organization', v_org_info, 'opportunities', v_opps);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_public_interest(p_opportunity_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'investidor'::text, p_message text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id  uuid;
    v_opp     RECORD;
    v_id      uuid;
    v_role    text;
BEGIN
    IF trim(p_name) = '' OR p_name IS NULL THEN
        RETURN json_build_object('error', 'name_required');
    END IF;
    IF char_length(trim(p_name)) > 200 OR char_length(coalesce(p_email, '')) > 254
       OR char_length(coalesce(p_phone, '')) > 40 OR char_length(coalesce(p_message, '')) > 2000 THEN
        RETURN json_build_object('error', 'texto_longo');
    END IF;

    v_role := CASE
        WHEN p_role IN ('investidor','arquiteto','engenheiro','projetista','consultor','outro')
        THEN p_role
        ELSE 'outro'
    END;

    SELECT id, organization_id INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND is_published = true
      AND no_marketplace = true
    LIMIT 1;

    IF v_opp.id IS NULL THEN
        RETURN json_build_object('error', 'opportunity_not_found');
    END IF;

    v_org_id := v_opp.organization_id;

    INSERT INTO public.opportunity_interests (
        organization_id, opportunity_id, contact_name, contact_email, contact_phone, role, message, stage
    ) VALUES (
        v_org_id,
        p_opportunity_id,
        trim(p_name),
        nullif(trim(coalesce(p_email, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        v_role,
        nullif(trim(coalesce(p_message, '')), ''),
        'lead'
    )
    RETURNING id INTO v_id;

    RETURN json_build_object('id', v_id, 'organization_id', v_org_id);
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.get_public_marketplace(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_marketplace(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_public_interest(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_public_interest(uuid, text, text, text, text, text) TO anon, authenticated;
