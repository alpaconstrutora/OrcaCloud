-- Nomenclatura de Contratos (Suprimentos): CT-{empreendimento}-{obra}-{seq}
--
-- Espelha 20270835000000_purchase_order_numbering.sql (Numeração de Pedidos).
-- Off por padrão (contract_numbering_settings.enabled = false): nada muda em
-- produção até o usuário ativar em Configurações do Sistema › Nomenclatura.
-- Escopo: só contratos domain='SUPRIMENTOS' (decisão do usuário, 29/07/2026).

SET lock_timeout = '3s';

-- Contador do sequencial, por obra. Mesma justificativa da tabela de pedidos:
-- MAX(number)+1 no cliente colide entre dois usuários na mesma obra.
CREATE TABLE IF NOT EXISTS public.contract_number_counters (
    project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
    last_seq   INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS ligada e SEM policy de propósito: acesso exclusivo via fn_next_contract_seq
-- (SECURITY DEFINER), igual ao contador de pedidos.
ALTER TABLE public.contract_number_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.contract_number_counters IS
    'Sequencial de contratos de Suprimentos por obra. Acesso exclusivo via fn_next_contract_seq.';

-- Configuração da máscara, por organização.
CREATE TABLE IF NOT EXISTS public.contract_numbering_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    enabled         BOOLEAN NOT NULL DEFAULT false,
    prefix          TEXT NOT NULL DEFAULT 'CT',
    pattern         TEXT NOT NULL DEFAULT '{prefixo}-{empreendimento}-{obra}-{seq}',
    seq_padding     SMALLINT NOT NULL DEFAULT 4,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contract_numbering_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.contract_numbering_settings IS
    'Máscara de numeração de contratos de Suprimentos, configurável por organização em Configurações do Sistema › Nomenclatura.';

-- Dual-check uid+email igual às demais policies de organization_members
-- (feedback_rls_organization_members): auth.uid() sozinho falha para membros
-- convidados só por e-mail antes do primeiro login.
DROP POLICY IF EXISTS contract_numbering_settings_select ON public.contract_numbering_settings;
CREATE POLICY contract_numbering_settings_select ON public.contract_numbering_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = contract_numbering_settings.organization_id
              AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
        )
    );

DROP POLICY IF EXISTS contract_numbering_settings_insert ON public.contract_numbering_settings;
CREATE POLICY contract_numbering_settings_insert ON public.contract_numbering_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = contract_numbering_settings.organization_id
              AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
        )
    );

DROP POLICY IF EXISTS contract_numbering_settings_update ON public.contract_numbering_settings;
CREATE POLICY contract_numbering_settings_update ON public.contract_numbering_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = contract_numbering_settings.organization_id
              AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = contract_numbering_settings.organization_id
              AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
        )
    );

CREATE OR REPLACE FUNCTION public.fn_next_contract_seq(p_project_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_org_id UUID;
    v_next   INTEGER;
BEGIN
    IF p_project_id IS NULL THEN
        RAISE EXCEPTION 'Obra não informada.' USING ERRCODE = '22023';
    END IF;

    -- SECURITY DEFINER pula a RLS de projects também; sem esta cerca qualquer
    -- usuário autenticado poderia incrementar o contador de obra de outra org.
    SELECT p.organization_id INTO v_org_id
    FROM public.projects p
    WHERE p.id = p_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = '22023';
    END IF;

    IF v_org_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = v_org_id
          AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.contract_number_counters (project_id, last_seq, updated_at)
    VALUES (p_project_id, 1, NOW())
    ON CONFLICT (project_id) DO UPDATE
        SET last_seq   = public.contract_number_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$X$;

-- GRANT authenticated sozinho não tira o EXECUTE que o PUBLIC ganha por padrão.
REVOKE ALL ON FUNCTION public.fn_next_contract_seq(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_contract_seq(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_contract_seq(UUID) TO authenticated;
