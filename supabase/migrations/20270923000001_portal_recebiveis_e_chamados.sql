-- 20270923000001 — Portal do Cliente: recebíveis e chamados por RPC
-- Plano: docs/planos/2026-09-23-condominio-portais-conexao.md (itens 1 e 5)
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- O Portal do Cliente lê `internal_transactions` e `client_requests` por
-- CONSULTA DIRETA. As duas tabelas só têm política para `authenticated` com
-- `is_org_member` — e quem abre o portal é `anon` (link com token) ou um cliente
-- logado que NÃO é membro da organização (0 de 29, conferido no banco).
-- Resultado medido em 23/09/2026 com a chave anon:
--
--     GET /rest/v1/internal_transactions?direction=eq.CREDIT  ->  []
--
-- Vazio, sem erro. A cota condominial é gravada certa (CREDIT + party_id), é
-- lida certa, e mesmo assim nunca aparece para o condômino. O próprio
-- `ClientArea.tsx` já documenta ter evitado isso nas abas Condomínio e Unidade
-- usando RPC; estas tabelas ficaram para trás.
--
-- A correção NÃO afrouxa o RLS: nenhuma policy nova, nenhum GRANT de tabela.
-- São funções SECURITY DEFINER com a autorização DENTRO delas, no mesmo molde
-- de `client_portal_get_condominio` / `..._for_client`, que delegam para uma
-- função de payload única para não nascer drift entre os dois caminhos.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recebíveis — payload único
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_portal_receivables_payload(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    -- ⚠️ SEM recorte por organização, de propósito. `party_id` já é específico:
    -- um `clients.id` pertence a uma organização só, então toda linha com esse
    -- party_id é dinheiro dessa pessoa. Filtrar também por `organization_id`
    -- convidaria o defeito clássico — a organização do portal divergir da do
    -- cadastro e a aba inteira voltar vazia, sem erro.
    WITH contratos_como_comprador AS (
        -- Co-comprador: a parcela nasce com `party_id` do comprador-ponteiro da
        -- negociação. Quem está em `commercial_deal_buyers` mas não no ponteiro
        -- só acha a parcela pelo contrato — e `reference_id` é COMPOSTO
        -- (`{contract_id}-p{vencimento}`), então é LIKE com prefixo, nunca `=`.
        SELECT DISTINCT c.id
          FROM public.commercial_deal_buyers b
          JOIN public.contracts c ON c.deal_id = b.deal_id
         WHERE b.client_id = p_client_id
    ),
    linhas AS (
        SELECT t.id, t.reference_id, t.transaction_date, t.due_date, t.amount,
               t.description, t.status, t.business_status, t.source_system
          FROM public.internal_transactions t
         WHERE t.direction = 'CREDIT'
           AND t.status IS DISTINCT FROM 'CANCELLED'
           AND (
                t.party_id = p_client_id
                OR EXISTS (SELECT 1 FROM contratos_como_comprador cc
                            WHERE t.reference_id LIKE cc.id::text || '%')
           )
    )
    SELECT jsonb_build_object(
        'ok', true,
        'recebiveis', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', l.id,
                       'reference_id', l.reference_id,
                       'transaction_date', l.transaction_date,
                       'due_date', l.due_date,
                       'amount', l.amount,
                       'description', l.description,
                       'status', l.status,
                       'business_status', l.business_status,
                       'source_system', l.source_system)
                   ORDER BY COALESCE(l.due_date, l.transaction_date))
              FROM linhas l), '[]'::jsonb)
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_portal_get_receivables(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    RETURN public.fn_portal_receivables_payload(v_tok.client_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_portal_get_receivables_for_client(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_cli public.clients;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Não autenticado.');
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Cliente não encontrado.');
    END IF;

    -- Duas autorizações, e só elas — as MESMAS de
    -- `client_portal_get_condominio_for_client`: (a) membro da organização dona
    -- do cliente (o admin abrindo o portal) e (b) o próprio cliente logado,
    -- casando pelo e-mail do cadastro.
    IF NOT (
        public.is_org_member(v_cli.organization_id)
        OR (v_cli.email IS NOT NULL
            AND LOWER(v_cli.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
    ) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para ver este cadastro.');
    END IF;

    RETURN public.fn_portal_receivables_payload(p_client_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Chamados — payload único, por PESSOA **e** pelas unidades que ela ocupa
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O portal legado do condômino lista chamados por UNIDADE, e a decisão está
-- escrita lá: "quem mora hoje precisa ver o vazamento aberto pelo morador
-- anterior". O Portal do Cliente listava só por pessoa, então migrar alguém do
-- link antigo para o novo apagava o histórico da unidade. Aqui as duas regras
-- viram uma só: a pessoa vê o que é dela MAIS o que é das unidades que ela
-- ocupa hoje.

CREATE OR REPLACE FUNCTION public.fn_portal_requests_payload(p_client_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT COALESCE(json_agg(x ORDER BY x.created_at DESC), '[]'::json)
      FROM (
        SELECT r.*,
               u.name AS unit_name,
               t.name AS tower_name,
               e.name AS condominio_name
          FROM public.client_requests r
          LEFT JOIN public.empreendimento_units  u ON u.id = r.unit_id
          LEFT JOIN public.empreendimento_towers t ON t.id = u.tower_id
          LEFT JOIN public.empreendimentos       e ON e.id = t.empreendimento_id
         WHERE r.client_id = p_client_id
            OR (r.unit_id IS NOT NULL AND r.unit_id IN (
                    SELECT o.unit_id FROM public.unit_occupancies o
                     WHERE o.client_id = p_client_id AND o.ended_at IS NULL))
      ) x;
$$;

CREATE OR REPLACE FUNCTION public.fn_portal_get_requests(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    RETURN json_build_object(
        'valid', TRUE,
        'data', public.fn_portal_requests_payload(v_tok.client_id)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_portal_get_requests_for_client(p_client_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_cli public.clients;
BEGIN
    IF auth.uid() IS NULL THEN RETURN json_build_object('valid', FALSE); END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    IF NOT (
        public.is_org_member(v_cli.organization_id)
        OR (v_cli.email IS NOT NULL
            AND LOWER(v_cli.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
    ) THEN
        RETURN json_build_object('valid', FALSE);
    END IF;

    RETURN json_build_object(
        'valid', TRUE,
        'data', public.fn_portal_requests_payload(p_client_id)
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Privilégios — REGRA OBRIGATÓRIA #7, pergunta 2
-- ─────────────────────────────────────────────────────────────────────────────
-- O PostgreSQL concede EXECUTE a PUBLIC por padrão, e GRANT não revoga esse
-- default: sem o REVOKE, toda função abaixo seria chamável com a chave anon,
-- que vai no bundle do frontend.

-- Payloads: privadas. Só as funções acima (SECURITY DEFINER, donas = postgres)
-- as chamam. Ninguém do lado de fora pode passar um client_id à vontade.
REVOKE EXECUTE ON FUNCTION public.fn_portal_receivables_payload(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_portal_requests_payload(uuid)    FROM PUBLIC, anon, authenticated;

-- Por token: `anon` precisa executar — é o portal por link, e a autorização é o
-- próprio token, validado dentro da função.
REVOKE EXECUTE ON FUNCTION public.fn_portal_get_receivables(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_portal_get_receivables(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_portal_get_requests(text)    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_portal_get_requests(text)    TO anon, authenticated;

-- Por client_id: exige sessão. `anon` não entra — quem não tem JWT não tem como
-- provar que é o cliente nem que é membro da organização.
REVOKE EXECUTE ON FUNCTION public.fn_portal_get_receivables_for_client(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_portal_get_receivables_for_client(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_portal_get_requests_for_client(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_portal_get_requests_for_client(uuid)    TO authenticated;

COMMENT ON FUNCTION public.fn_portal_receivables_payload(uuid) IS
    'Recebíveis (CREDIT) do cliente: por party_id e pelos contratos em que ele é co-comprador. Privada — chamada só pelas duas RPCs de portal.';
COMMENT ON FUNCTION public.fn_portal_requests_payload(uuid) IS
    'Chamados do cliente MAIS os das unidades que ele ocupa hoje. Privada — chamada só pelas duas RPCs de portal.';
