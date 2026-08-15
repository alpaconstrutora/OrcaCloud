-- Nomenclatura de Contratos de LOCAÇÃO (`CL-{ano}-{seq}`) e de VENDA DE
-- UNIDADES (`CV-{ano}-{seq}`) — cópia do mecanismo de Numeração de Pedidos
-- (20270835000000_purchase_order_numbering.sql).
--
-- DIFERENÇA ÚNICA em relação a Pedidos/Contratos de Suprimentos/Cotações: lá o
-- contador é POR OBRA. Aqui não pode ser: contrato de locação e de venda de
-- unidade NÃO tem obra — `contracts.project_id` só é gravado quando existe obra
-- real (ver REGRA #2 em services/contractService.ts). O contador é, portanto,
-- por ORGANIZAÇÃO + ANO, que é exatamente o escopo que a numeração já usava no
-- cliente (`nextRentalNumber`).
--
-- O que muda de fato: o sequencial deixa de sair de MAX(number)+1 no navegador
-- e passa a ser atômico no banco. Com MAX no cliente, dois usuários gerando
-- contrato ao mesmo tempo na mesma organização recebem o MESMO número.

SET lock_timeout = '3s';

-- ---------------------------------------------------------------- LOCAÇÃO ---

CREATE TABLE IF NOT EXISTS public.rental_contract_number_counters (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    year            SMALLINT NOT NULL,
    last_seq        INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, year)
);

-- RLS ligada e SEM policy de propósito: acesso só via fn_next_rental_contract_seq.
ALTER TABLE public.rental_contract_number_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rental_contract_number_counters IS
    'Sequencial de contratos de locação por organização e ano. Acesso exclusivo via fn_next_rental_contract_seq.';

-- ------------------------------------------------- VENDA DE UNIDADES ---

CREATE TABLE IF NOT EXISTS public.unit_sale_contract_number_counters (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    year            SMALLINT NOT NULL,
    last_seq        INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, year)
);

ALTER TABLE public.unit_sale_contract_number_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unit_sale_contract_number_counters IS
    'Sequencial de contratos de venda de unidades por organização e ano. Acesso exclusivo via fn_next_unit_sale_contract_seq.';

-- ------------------------------------------------------------------ RPCs ---

CREATE OR REPLACE FUNCTION public.fn_next_rental_contract_seq(p_org_id UUID, p_year SMALLINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_next INTEGER;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'Organização não informada.' USING ERRCODE = '22023';
    END IF;
    IF p_year IS NULL THEN
        RAISE EXCEPTION 'Ano não informado.' USING ERRCODE = '22023';
    END IF;

    -- SECURITY DEFINER pula a RLS; sem esta cerca qualquer usuário autenticado
    -- poderia incrementar (e furar) o contador de outra organização.
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = p_org_id
          AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.rental_contract_number_counters (organization_id, year, last_seq, updated_at)
    VALUES (p_org_id, p_year, 1, NOW())
    ON CONFLICT (organization_id, year) DO UPDATE
        SET last_seq   = public.rental_contract_number_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$X$;

CREATE OR REPLACE FUNCTION public.fn_next_unit_sale_contract_seq(p_org_id UUID, p_year SMALLINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_next INTEGER;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'Organização não informada.' USING ERRCODE = '22023';
    END IF;
    IF p_year IS NULL THEN
        RAISE EXCEPTION 'Ano não informado.' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = p_org_id
          AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.unit_sale_contract_number_counters (organization_id, year, last_seq, updated_at)
    VALUES (p_org_id, p_year, 1, NOW())
    ON CONFLICT (organization_id, year) DO UPDATE
        SET last_seq   = public.unit_sale_contract_number_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$X$;

-- GRANT authenticated sozinho não tira o EXECUTE que o PUBLIC ganha por padrão.
REVOKE ALL ON FUNCTION public.fn_next_rental_contract_seq(UUID, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_rental_contract_seq(UUID, SMALLINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_rental_contract_seq(UUID, SMALLINT) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_next_unit_sale_contract_seq(UUID, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_unit_sale_contract_seq(UUID, SMALLINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_unit_sale_contract_seq(UUID, SMALLINT) TO authenticated;

-- -------------------------------------------------------------- BACKFILL ---
--
-- Semeia os contadores com o MAIOR sequencial já usado por organização/ano.
-- Sem isto o primeiro contrato pós-migration nasceria CL-2026-001, colidindo
-- com contratos reais já emitidos (CL-2026-001..005 existem em produção e são
-- referenciados por parcelas, reajuste e documentos).
--
-- NÃO renumera nada — só ajusta o ponto de partida. Idempotente: rodar de novo
-- só sobe o contador se apareceu número maior no meio tempo.
--
-- O sufixo é lido com regex: `split_part` erraria em prefixo customizado que
-- contenha hífen.

INSERT INTO public.rental_contract_number_counters (organization_id, year, last_seq, updated_at)
SELECT c.organization_id,
       substring(c.number FROM '^[A-Z]+-(\d{4})-')::SMALLINT AS year,
       MAX(substring(c.number FROM '-(\d+)$')::INTEGER)       AS last_seq,
       NOW()
FROM public.contracts c
WHERE c.domain = 'LOCACAO'
  AND c.organization_id IS NOT NULL
  AND c.number ~ '^[A-Z]+-\d{4}-\d+$'
GROUP BY 1, 2
ON CONFLICT (organization_id, year) DO UPDATE
    SET last_seq   = GREATEST(public.rental_contract_number_counters.last_seq, EXCLUDED.last_seq),
        updated_at = NOW();

INSERT INTO public.unit_sale_contract_number_counters (organization_id, year, last_seq, updated_at)
SELECT c.organization_id,
       substring(c.number FROM '^[A-Z]+-(\d{4})-')::SMALLINT AS year,
       MAX(substring(c.number FROM '-(\d+)$')::INTEGER)       AS last_seq,
       NOW()
FROM public.contracts c
WHERE c.domain = 'VENDAS'
  AND c.organization_id IS NOT NULL
  AND c.number ~ '^[A-Z]+-\d{4}-\d+$'
GROUP BY 1, 2
ON CONFLICT (organization_id, year) DO UPDATE
    SET last_seq   = GREATEST(public.unit_sale_contract_number_counters.last_seq, EXCLUDED.last_seq),
        updated_at = NOW();
