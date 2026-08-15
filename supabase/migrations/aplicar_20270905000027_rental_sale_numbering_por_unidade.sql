-- Numeração de contratos de LOCAÇÃO e de VENDA DE UNIDADES passa a ser
-- `{prefixo}-{empreendimento}-{unidade}-{seq}` (decisão do usuário, 15/08/2026).
--
-- Substitui `aplicar_20270905000026`, aplicada horas antes, que usava
-- `{prefixo}-{ano}-{seq}` com contador por organização + ano. Aquele desenho
-- partiu de uma premissa errada: que contrato de locação/venda não tinha como
-- chegar num empreendimento, já que não tem obra. Tem — pela unidade, via
-- `vw_unit_property_map`.
--
-- ESCOPO DO CONTADOR: por UNIDADE. É a leitura literal do padrão de Pedidos de
-- Compra, onde a máscara é `{empreendimento}-{obra}-{seq}` e o contador é por
-- OBRA — ou seja, pela última entidade antes do `{seq}`. Aqui essa entidade é a
-- unidade. Na prática: o segundo contrato da MESMA unidade (novo inquilino,
-- revenda) sai `-0002`; a unidade vizinha começa do `-0001`.
--
-- Os contadores de 000026 são descartados, não migrados: mudaram de chave
-- (organização+ano → unidade) e de significado. Os contratos JÁ EMITIDOS no
-- formato antigo (`CL-2026-001..007`, `CV-2026-001..002`) continuam intactos —
-- ninguém renumera nada, e o formato novo não colide com eles porque tem
-- empreendimento e unidade no meio.

SET lock_timeout = '3s';

-- ------------------------------------------- desfaz o desenho por org+ano ---

DROP FUNCTION IF EXISTS public.fn_next_rental_contract_seq(UUID, SMALLINT);
DROP FUNCTION IF EXISTS public.fn_next_unit_sale_contract_seq(UUID, SMALLINT);
DROP TABLE IF EXISTS public.rental_contract_number_counters;
DROP TABLE IF EXISTS public.unit_sale_contract_number_counters;

-- ------------------------------------------------ código do empreendimento ---
--
-- A view já resolvia imóvel do Comercial → unidade → torre → obra →
-- empreendimento, mas expunha só o NOME do empreendimento. A máscara precisa do
-- CÓDIGO (`empreendimentos.code`), o mesmo campo que a numeração de Pedidos usa.
-- Colunas novas entram no FIM: CREATE OR REPLACE VIEW não aceita reordenar nem
-- remover as existentes.

CREATE OR REPLACE VIEW public.vw_unit_property_map
WITH (security_invoker = on) AS
SELECT
    u.commercial_property_id       AS property_id,
    'SALE'::text                   AS purpose,
    u.id                           AS unit_id,
    u.name                         AS unit_name,
    u.floor                        AS unit_floor,
    u.typology                     AS unit_typology,
    tw.id                          AS tower_id,
    tw.name                        AS tower_name,
    e.id                           AS empreendimento_id,
    e.name                         AS empreendimento_name,
    e.organization_id              AS organization_id,
    COALESCE(tw.project_id, e.project_id) AS project_id,
    CASE
        WHEN tw.project_id IS NOT NULL THEN 'TOWER'
        WHEN e.project_id  IS NOT NULL THEN 'EMPREENDIMENTO'
        ELSE NULL
    END                            AS project_source,
    e.code                         AS empreendimento_code
FROM public.empreendimento_units  u
JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
JOIN public.empreendimentos       e  ON e.id  = tw.empreendimento_id
WHERE u.commercial_property_id IS NOT NULL

UNION ALL

SELECT
    u.rental_property_id           AS property_id,
    'RENTAL'::text                 AS purpose,
    u.id,
    u.name,
    u.floor,
    u.typology,
    tw.id,
    tw.name,
    e.id,
    e.name,
    e.organization_id,
    COALESCE(tw.project_id, e.project_id),
    CASE
        WHEN tw.project_id IS NOT NULL THEN 'TOWER'
        WHEN e.project_id  IS NOT NULL THEN 'EMPREENDIMENTO'
        ELSE NULL
    END,
    e.code
FROM public.empreendimento_units  u
JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
JOIN public.empreendimentos       e  ON e.id  = tw.empreendimento_id
WHERE u.rental_property_id IS NOT NULL;

COMMENT ON VIEW public.vw_unit_property_map IS
'Resolve um imóvel do Comercial (commercial_properties.id) até unidade, torre, obra e empreendimento. Substitui o casamento de parcela↔obra por nome. project_id = COALESCE(torre, empreendimento), com a torre tendo precedência (multi-torre). Uma linha por (property_id, purpose): SALE via commercial_property_id, RENTAL via rental_property_id. empreendimento_code alimenta a numeração de contratos de locação e venda.';

-- ------------------------------------------------- contadores por unidade ---

CREATE TABLE IF NOT EXISTS public.rental_contract_number_counters (
    unit_id    UUID PRIMARY KEY REFERENCES public.empreendimento_units(id) ON DELETE CASCADE,
    last_seq   INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS ligada e SEM policy de propósito: acesso só via fn_next_rental_contract_seq.
ALTER TABLE public.rental_contract_number_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rental_contract_number_counters IS
    'Sequencial de contratos de locação por unidade. Acesso exclusivo via fn_next_rental_contract_seq.';

CREATE TABLE IF NOT EXISTS public.unit_sale_contract_number_counters (
    unit_id    UUID PRIMARY KEY REFERENCES public.empreendimento_units(id) ON DELETE CASCADE,
    last_seq   INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.unit_sale_contract_number_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unit_sale_contract_number_counters IS
    'Sequencial de contratos de venda por unidade. Acesso exclusivo via fn_next_unit_sale_contract_seq.';

-- ------------------------------------------------------------------ RPCs ---

CREATE OR REPLACE FUNCTION public.fn_next_rental_contract_seq(p_unit_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_org_id UUID;
    v_next   INTEGER;
BEGIN
    IF p_unit_id IS NULL THEN
        RAISE EXCEPTION 'Unidade não informada.' USING ERRCODE = '22023';
    END IF;

    -- SECURITY DEFINER pula a RLS das tabelas do empreendimento também; sem esta
    -- cerca qualquer autenticado poderia furar o contador de unidade alheia.
    SELECT e.organization_id INTO v_org_id
    FROM public.empreendimento_units  u
    JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
    JOIN public.empreendimentos       e  ON e.id  = tw.empreendimento_id
    WHERE u.id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = '22023';
    END IF;

    IF v_org_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = v_org_id
          AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta unidade.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.rental_contract_number_counters (unit_id, last_seq, updated_at)
    VALUES (p_unit_id, 1, NOW())
    ON CONFLICT (unit_id) DO UPDATE
        SET last_seq   = public.rental_contract_number_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$X$;

CREATE OR REPLACE FUNCTION public.fn_next_unit_sale_contract_seq(p_unit_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_org_id UUID;
    v_next   INTEGER;
BEGIN
    IF p_unit_id IS NULL THEN
        RAISE EXCEPTION 'Unidade não informada.' USING ERRCODE = '22023';
    END IF;

    SELECT e.organization_id INTO v_org_id
    FROM public.empreendimento_units  u
    JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
    JOIN public.empreendimentos       e  ON e.id  = tw.empreendimento_id
    WHERE u.id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = '22023';
    END IF;

    IF v_org_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = v_org_id
          AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta unidade.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.unit_sale_contract_number_counters (unit_id, last_seq, updated_at)
    VALUES (p_unit_id, 1, NOW())
    ON CONFLICT (unit_id) DO UPDATE
        SET last_seq   = public.unit_sale_contract_number_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_next_rental_contract_seq(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_rental_contract_seq(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_rental_contract_seq(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_next_unit_sale_contract_seq(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_unit_sale_contract_seq(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_unit_sale_contract_seq(UUID) TO authenticated;
