-- ==========================================================================
-- ROLLBACK de supabase/migrations/aplicar_20271122300000_credit_room_documentos_grupo.sql
-- (fora de migrations/ de propósito — prefixo único)
-- ==========================================================================
-- Derruba o gatilho trg_portal_share_credor_escopo e a função dele, e volta
-- fn_credit_room_documents ao corpo/retorno de aplicar_20270920000002 (só a
-- org dona do room; sem organization_id/contract_id/empreendimento_id).
--
-- ⚠️ A tela do Data Room que lê as 3 colunas novas precisa voltar junto (ou
--    tolerar a ausência delas); a Edge credit-room-download também.
-- ⚠️ Compartilhamentos credor de documento do grupo gravados enquanto a
--    migration esteve no ar continuam na tabela, mas somem da leitura (a
--    função antiga só devolve documento da org dona).
--
--   npx supabase db query --linked -f scripts/rollback-credit-room-documentos-grupo.sql
-- ==========================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_portal_share_credor_escopo ON public.opura_document_portal_shares;
DROP FUNCTION IF EXISTS public.fn_portal_share_credor_escopo();

DROP FUNCTION IF EXISTS public.fn_credit_room_documents(uuid);

CREATE FUNCTION public.fn_credit_room_documents(p_room uuid)
RETURNS TABLE (
    share_id        uuid,
    document_id     uuid,
    nome            text,
    descricao       text,
    categoria       text,
    tipo_documento  text,
    status          text,
    data_emissao    date,
    data_validade   date,
    version_id      uuid,
    version_number  integer,
    storage_path    text,
    mime_type       text,
    tamanho         bigint,
    shared_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT sh.id,
           doc.id,
           doc.nome,
           doc.descricao,
           doc.categoria,
           doc.tipo_documento,
           doc.status,
           doc.data_emissao,
           doc.data_validade,
           ver.id,
           ver.version_number,
           ver.storage_path,
           ver.mime_type,
           ver.tamanho,
           sh.shared_at
      FROM public.opura_document_portal_shares sh
      JOIN public.opura_documents doc ON doc.id = sh.document_id
      LEFT JOIN public.opura_document_versions ver ON ver.id = doc.active_version_id
      JOIN public.credit_rooms r ON r.id = sh.credit_room_id
     WHERE sh.audience = 'credor'
       AND sh.credit_room_id = p_room
       AND doc.organization_id = r.organization_id      -- documento da org DONA do room, nunca de outra
       AND public.fn_credit_room_access(p_room)          -- interno OU participante ativo
     ORDER BY sh.shared_at DESC;
$$;

REVOKE ALL ON FUNCTION public.fn_credit_room_documents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_credit_room_documents(uuid) TO authenticated;

COMMIT;

-- Conferência: deve voltar a ACL {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- e nenhum gatilho trg_portal_share_credor_escopo:
--   SELECT proacl, pg_get_function_result(oid) FROM pg_proc WHERE oid = 'public.fn_credit_room_documents(uuid)'::regprocedure;
--   SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_portal_share_credor_escopo';
