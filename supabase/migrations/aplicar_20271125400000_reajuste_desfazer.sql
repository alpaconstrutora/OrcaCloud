-- =============================================================================
-- ⚠️ JÁ APLICADA em produção (25/11/2026 — `desfazer_reajuste` existe no banco).
-- NÃO rodar de novo. Nome antigo: aplicar_20271125300000_reajuste_desfazer.sql —
-- renomeada para 20271125400000 porque colidia com
-- aplicar_20271125300000_oportunidade_vista_do_gestor.sql (#727), que chegou antes.
-- =============================================================================
-- Locações › Reajustes › Histórico: desfazer (e editar) uma decisão de reajuste.
-- Plano: docs/planos/2026-11-25-reajustes-historico-crud.md
--
-- Pedido (25/11/2026): "aba reajuste > coluna acoes: falou CRUD." Decisão do
-- usuário: Excluir = DESFAZER e MARCAR (a linha fica no histórico como
-- "Desfeito por X em data"); só a ÚLTIMA decisão de cada contrato.
--
-- Aditiva: 4 colunas em contract_reajustes, 1 policy de UPDATE que só deixa
-- MARCAR como desfeito (uma vez, com o próprio e-mail), grant de UPDATE só nessas
-- colunas, e a função desfazer_reajuste — SECURITY INVOKER: roda com a RLS de
-- quem chama (contrato e parcelas já são gravados pelo cliente na decisão), e
-- junta tudo numa transação só.
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1) Colunas ----------------------------------------------------------------------
ALTER TABLE public.contract_reajustes
    ADD COLUMN IF NOT EXISTS proximo_anterior    date,
    ADD COLUMN IF NOT EXISTS parcelas_alteradas  jsonb,
    ADD COLUMN IF NOT EXISTS desfeito_em         timestamptz,
    ADD COLUMN IF NOT EXISTS desfeito_por        text;

COMMENT ON COLUMN public.contract_reajustes.proximo_anterior IS
    'contracts.reajuste_proximo ANTES da decisão — desfazer devolve. NULL nas decisões antigas (desfazer usa data_base + periodicidade).';
COMMENT ON COLUMN public.contract_reajustes.parcelas_alteradas IS
    '[{id, antes}] das parcelas que a decisão mudou — desfazer devolve o valor exato. NULL nas decisões antigas (desfazer usa a proporção).';
COMMENT ON COLUMN public.contract_reajustes.desfeito_em IS
    'Quando a decisão foi desfeita (Locações › Reajustes › Histórico). A linha fica, marcada.';

COMMENT ON TABLE public.contract_reajustes IS
    'Um registro por aniversário de reajuste decidido (aplicado pelo índice, por % ou valor, ou não aplicado). '
    'Inserção; a única alteração permitida é MARCAR como desfeito (desfazer_reajuste).';

-- 2) Só marcar como desfeito: uma vez, com o próprio e-mail ----------------------
-- Pergunta 1 da REGRA #7: nenhuma perna do AND libera sozinha — org do usuário E
-- ainda não desfeito (USING); org do usuário E agora desfeito E por quem chama (CHECK).
DROP POLICY IF EXISTS contract_reajustes_desfazer ON public.contract_reajustes;
CREATE POLICY contract_reajustes_desfazer ON public.contract_reajustes
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()) AND desfeito_em IS NULL)
    WITH CHECK (
        organization_id IN (SELECT public.minhas_orgs_membro())
        AND desfeito_em IS NOT NULL
        AND desfeito_por = (auth.jwt() ->> 'email')
    );

-- Grant de UPDATE só nas duas colunas da marca: valores, datas e parcelas da
-- decisão continuam imutáveis pelo REST.
REVOKE UPDATE ON public.contract_reajustes FROM authenticated, anon;
GRANT UPDATE (desfeito_em, desfeito_por) ON public.contract_reajustes TO authenticated;
REVOKE TRUNCATE ON public.contract_reajustes FROM authenticated, anon;

-- 3) Desfazer -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desfazer_reajuste(p_registro uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    r        public.contract_reajustes%ROWTYPE;
    c        public.contracts%ROWTYPE;
    v_email  text := auth.jwt() ->> 'email';
    v_n      integer := 0;
    v_prox   date;
BEGIN
    SELECT * INTO r FROM public.contract_reajustes WHERE id = p_registro;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Decisão de reajuste não encontrada.';
    END IF;
    IF r.desfeito_em IS NOT NULL THEN
        RAISE EXCEPTION 'Esta decisão de reajuste já foi desfeita.';
    END IF;

    -- Contrato travado durante a operação (outro desfazer/decidir espera).
    SELECT * INTO c FROM public.contracts WHERE id = r.contract_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contrato da decisão não encontrado.';
    END IF;
    IF c.status NOT IN ('Ativo', 'Assinado') THEN
        RAISE EXCEPTION 'O contrato % está "%". Só se desfaz reajuste de contrato Ativo ou Assinado.', c.number, c.status;
    END IF;
    IF EXISTS (SELECT 1 FROM public.contracts f WHERE f.parent_contract_id = c.id) THEN
        RAISE EXCEPTION 'O contrato % já foi renovado: desfazer o reajuste não volta o aluguel do contrato novo.', c.number;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.contract_reajustes x
         WHERE x.contract_id = r.contract_id AND x.desfeito_em IS NULL AND x.id <> r.id
           AND (x.aniversario > r.aniversario OR (x.aniversario = r.aniversario AND x.created_at > r.created_at))
    ) THEN
        RAISE EXCEPTION 'Só a última decisão de reajuste do contrato pode ser desfeita.';
    END IF;

    -- Parcelas: só as ainda EM ABERTO voltam; paga/conciliada é fato e fica.
    IF r.parcelas_alteradas IS NOT NULL THEN
        UPDATE public.internal_transactions t
           SET amount = (e ->> 'antes')::numeric
          FROM jsonb_array_elements(r.parcelas_alteradas) e
         WHERE t.id = (e ->> 'id')::uuid
           AND t.organization_id = r.organization_id
           AND t.status = 'PENDING';
        GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF r.valor_novo > 0 AND abs(r.valor_novo - r.valor_anterior) >= 0.01 THEN
        -- Decisão antiga (sem a lista): o mesmo recorte de decidir, na proporção inversa.
        UPDATE public.internal_transactions t
           SET amount = round(t.amount * r.valor_anterior / r.valor_novo, 2)
         WHERE t.organization_id = c.organization_id
           AND t.status = 'PENDING'
           AND t.valor_manual = false
           AND t.due_date >= r.aniversario
           AND (t.reference_id LIKE c.id::text || '%'
                OR (c.deal_id IS NOT NULL AND t.reference_id LIKE 'tx-' || c.deal_id::text || '-%'));
        GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;

    v_prox := COALESCE(
        r.proximo_anterior,
        (r.data_base + make_interval(months => COALESCE(NULLIF(c.reajuste_periodicidade_meses, 0), 12)))::date
    );
    UPDATE public.contracts
       SET current_value      = r.valor_anterior,
           reajuste_data_base = r.data_base,
           reajuste_proximo   = v_prox
     WHERE id = c.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sem permissão para alterar o contrato %.', c.number;
    END IF;

    UPDATE public.contract_reajustes
       SET desfeito_em = now(), desfeito_por = v_email
     WHERE id = r.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sem permissão para desfazer esta decisão de reajuste.';
    END IF;

    RETURN jsonb_build_object('parcelas_revertidas', v_n, 'reajuste_proximo', v_prox, 'valor', r.valor_anterior);
END;
$$;

COMMENT ON FUNCTION public.desfazer_reajuste(uuid) IS
    'Desfaz a ÚLTIMA decisão de reajuste de um contrato: aluguel, data-base, próximo e parcelas em aberto voltam; o registro fica marcado como desfeito. SECURITY INVOKER (RLS de quem chama).';

REVOKE EXECUTE ON FUNCTION public.desfazer_reajuste(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.desfazer_reajuste(uuid) TO authenticated;

COMMIT;
