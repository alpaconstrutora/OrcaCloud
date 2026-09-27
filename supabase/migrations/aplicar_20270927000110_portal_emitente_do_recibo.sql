-- ============================================================================
-- Portal do Cliente — emitente do recibo antigo (27/09/2026)
--
-- Plano: docs/planos/2026-09-26-contas-receber-recibo-na-baixa.md (Fase 3)
--
-- O recibo montado na hora pelo portal (`exportService.generateReceiptPDF`,
-- usado nas parcelas do JSON legado e nas pagas ainda sem recibo numerado)
-- assinava com o NOME DO CLIENTE e nenhum CNPJ: `ClientArea` passava
-- `{ name: clientProfile.name }` como organização emitente. O portal não tinha
-- de onde tirar a empresa: pelo link público (anon) e pelo cliente logado
-- (não-membro) a RLS de `organizations` devolve nada.
--
-- Estas RPCs devolvem SÓ o emitente — nome, CNPJ e endereço da
-- organização dona do cadastro do cliente — com a MESMA autorização das RPCs de
-- recebíveis do portal (20270923000001, conferidas com pg_get_functiondef):
--   client_portal_get_emitente(p_token)               → link público (anon)
--   client_portal_get_emitente_for_client(p_client_id) → membro da org OU o
--                                                        próprio cliente (e-mail)
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

-- ─── Payload interno ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_portal_emitente_payload(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    -- A organização DONA do cadastro do cliente: é ela que recebe o dinheiro e,
    -- portanto, quem assina o recibo. Mesmo critério do recibo numerado, que
    -- congela a organização do título (aplicar_20270926000110).
    SELECT CASE WHEN o.id IS NULL THEN
               jsonb_build_object('ok', false, 'motivo', 'Organização emitente não encontrada.')
           ELSE jsonb_build_object(
               'ok', true,
               'nome', o.name,
               'cnpj', NULLIF(TRIM(o.cnpj), ''),
               -- Sem logo: há organização com a logo gravada como data URL
               -- (~79 KB), e o recibo montado na hora não a desenha.
               'endereco', NULLIF(CONCAT_WS(' – ',
                    NULLIF(CONCAT_WS(', ', NULLIF(o.address->>'street', ''), NULLIF(o.address->>'number', '')), ''),
                    NULLIF(o.address->>'neighborhood', ''),
                    NULLIF(CONCAT_WS('/', NULLIF(o.address->>'city', ''), NULLIF(o.address->>'state', '')), ''),
                    CASE WHEN NULLIF(o.address->>'zipCode', '') IS NOT NULL
                         THEN 'CEP ' || (o.address->>'zipCode') END
               ), ''))
           END
      FROM public.clients c
      LEFT JOIN public.organizations o ON o.id = c.organization_id
     WHERE c.id = p_client_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_portal_emitente_payload(uuid) FROM PUBLIC, anon, authenticated;

-- ─── Link público ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_portal_get_emitente(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    RETURN COALESCE(public.fn_portal_emitente_payload(v_tok.client_id),
                    jsonb_build_object('ok', false, 'motivo', 'Cliente não encontrado.'));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.client_portal_get_emitente(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.client_portal_get_emitente(text) TO anon, authenticated;

-- ─── Cliente logado / equipe abrindo o portal ───────────────────────────────
CREATE OR REPLACE FUNCTION public.client_portal_get_emitente_for_client(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    -- As MESMAS duas autorizações de fn_portal_get_receivables_for_client.
    IF NOT (
        public.is_org_member(v_cli.organization_id)
        OR (v_cli.email IS NOT NULL
            AND LOWER(v_cli.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
    ) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para ver este cadastro.');
    END IF;

    RETURN public.fn_portal_emitente_payload(p_client_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.client_portal_get_emitente_for_client(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_portal_get_emitente_for_client(uuid) TO authenticated;

-- ─── Recebíveis do portal trazem a data do pagamento ────────────────────────
-- Redefinição a partir da versão vigente (aplicar_20270926000120, conferida com
-- pg_get_functiondef): única mudança é a chave `payment_date`.
CREATE OR REPLACE FUNCTION public.fn_portal_receivables_payload(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
               t.description, t.status, t.business_status, t.source_system,
               t.payment_date
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
                       'source_system', l.source_system,
                       -- Data REAL do pagamento: sem ela o recibo montado na
                       -- hora saía com a data de hoje (27/09/2026).
                       'payment_date', l.payment_date,
                       -- Recibo ATIVO (o índice parcial garante no máximo um).
                       'recibo_numero', (SELECT r.receipt_number
                                           FROM public.financial_receipts r
                                          WHERE r.transaction_id = l.id
                                            AND r.cancelled_at IS NULL))
                   ORDER BY COALESCE(l.due_date, l.transaction_date))
              FROM linhas l), '[]'::jsonb)
    );
$function$;

-- CREATE OR REPLACE preserva a ACL, mas o REVOKE vai junto de propósito
-- (REGRA #7): a função é interna, só chamada pelas duas RPCs do portal.
REVOKE EXECUTE ON FUNCTION public.fn_portal_receivables_payload(uuid) FROM PUBLIC, anon, authenticated;


NOTIFY pgrst, 'reload schema';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- SELECT proname, proacl FROM pg_proc WHERE proname LIKE '%emitente%';
