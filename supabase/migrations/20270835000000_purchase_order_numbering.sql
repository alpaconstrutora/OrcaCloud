-- Nomenclatura de Pedido: PC-{empreendimento}-{obra}-{seq}
--
-- O último bloco ("Código Pedido") é SEQUENCIAL POR OBRA. Não dá para calcular
-- isso no cliente com MAX(number)+1: dois usuários criando pedido na mesma obra
-- ao mesmo tempo leriam o mesmo máximo e gerariam o mesmo número. O contador
-- mora aqui e é incrementado atomicamente (INSERT ... ON CONFLICT DO UPDATE,
-- que trava a linha) dentro de uma RPC.

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.purchase_order_number_counters (
    project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
    last_seq   INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS ligada e SEM policy de propósito: ninguém lê nem escreve esta tabela
-- direto. O único caminho é a RPC abaixo (SECURITY DEFINER), que já valida a
-- pertinência da obra à organização do usuário. Contador não é dado de tela.
ALTER TABLE public.purchase_order_number_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.purchase_order_number_counters IS
    'Sequencial de pedidos de compra por obra. Acesso exclusivo via fn_next_purchase_order_seq.';

CREATE OR REPLACE FUNCTION public.fn_next_purchase_order_seq(p_project_id UUID)
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

    INSERT INTO public.purchase_order_number_counters (project_id, last_seq, updated_at)
    VALUES (p_project_id, 1, NOW())
    ON CONFLICT (project_id) DO UPDATE
        SET last_seq   = public.purchase_order_number_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$X$;

-- GRANT authenticated sozinho não tira o EXECUTE que o PUBLIC ganha por padrão.
REVOKE ALL ON FUNCTION public.fn_next_purchase_order_seq(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_purchase_order_seq(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_purchase_order_seq(UUID) TO authenticated;
