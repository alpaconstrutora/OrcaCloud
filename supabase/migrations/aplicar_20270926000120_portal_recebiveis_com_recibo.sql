-- ============================================================================
-- Portal do Cliente — recebíveis trazem o Nº do recibo ativo (26/09/2026)
--
-- Plano: docs/planos/2026-09-26-contas-receber-recibo-na-baixa.md (item 13)
--
-- Os recibos de recebimento (aplicar_20270926000110) ficam guardados, mas o
-- cliente não os via: `financial_receipts` só é legível por membro da
-- organização. Aqui a lista que o portal JÁ recebe ganha `recibo_numero` —
-- nada de policy nova para o cliente, nenhum GRANT de tabela. O download do PDF
-- é da Edge Function `client-portal-recibo-download`, que autoriza chamando
-- `fn_portal_get_receivables[_for_client]` com a credencial de quem pede (a
-- mesma regra, sem cópia).
--
-- Única mudança em relação à definição vigente (20270923000001, conferida com
-- pg_get_functiondef no banco antes de reescrever): a chave `recibo_numero`.
-- Não expõe file_path — caminho de bucket privado não é dado de portal.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

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
                       'source_system', l.source_system,
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
-- SELECT proacl FROM pg_proc WHERE proname = 'fn_portal_receivables_payload';
