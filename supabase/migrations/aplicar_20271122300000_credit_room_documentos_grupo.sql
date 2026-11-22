-- ==========================================================================
-- Credit Room · Data Room aceita documentos das empresas do grupo
-- Date: 2026-11-22
-- Altera: fn_credit_room_documents(uuid)   (DROP + CREATE: muda o RETURNS)
-- Cria:   fn_portal_share_credor_escopo() + trigger trg_portal_share_credor_escopo
--         em opura_document_portal_shares
-- Plano:  docs/planos/2026-11-21-credit-room-capacidade-f3-plano.md (Task 1)
-- ==========================================================================
-- O QUÊ
--   1. fn_credit_room_documents: o documento entra no Data Room se for da org
--      DONA do room (como antes) OU, só com escopo = 'GRUPO', de uma org de
--      credit_rooms.grupo_organization_ids. Escopo EMPRESA = só a org dona.
--      Ganha 3 colunas NO FIM: organization_id, contract_id, empreendimento_id
--      (do documento) — a tela agrupa por empresa/contrato/empreendimento.
--      Trocar o RETURNS TABLE exige DROP + CREATE; tudo numa transação só,
--      então não existe instante sem a função. pg_depend conferido em 22/11:
--      nenhuma view/função depende dela (só a app chama por RPC).
--   2. Trava na GRAVAÇÃO do compartilhamento (audience = 'credor'):
--      a) quem grava é interno do room (fn_credit_room_is_internal) — senão
--         insufficient_privilege, com a MESMA mensagem para room inexistente
--         e room alheio (não revela se o room existe);
--      b) o documento é da org dona do room ou, com escopo GRUPO, de uma org
--         do grupo — senão check_violation. Documento que quem grava não
--         enxerga cai na mesma recusa (não revela se o documento existe).
--      Antes, a policy portal_shares_write_org só exigia enxergar o documento:
--      qualquer um gravava compartilhamento com QUALQUER room (só a leitura
--      filtrava). Hoje há 3 compartilhamentos credor, todos da org dona.
--      Cliente/colaborador/investidor: o gatilho devolve NEW na 1ª linha.
--      UPDATE só dispara quando muda document_id, credit_room_id ou audience
--      (mesmo padrão de trg_portal_share_versao_do_investidor): trocar o room
--      ou o documento de uma linha passa pela mesma trava.
--
-- SECURITY INVOKER de propósito: a função lê credit_rooms e opura_documents
--   pela RLS de quem grava. Se não enxerga o room ou o documento, recusa.
--   Consequência: postgres/service_role sem JWT (auth.uid() nulo) não são
--   "internos" de room nenhum e também são recusados ao gravar compartilhamento
--   credor — nenhum caminho do servidor grava hoje (só o botão Compartilhar do
--   GED, como usuário). Manutenção como postgres: setar request.jwt.claims.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): não há policy nova. O OR novo está na função:
--     (doc.organization_id = r.organization_id
--      OR (r.escopo = 'GRUPO' AND doc.organization_id = ANY(r.grupo_organization_ids)))
--     A perna da direita sozinha libera documento de org do grupo — e é o
--     pedido. Ela NÃO basta para liberar a linha: continua em AND com
--     sh.audience = 'credor', sh.credit_room_id = p_room (o compartilhamento
--     foi feito COM ESTE room) e fn_credit_room_access(p_room). E o grupo é
--     controlado: grupo_organization_ids só é gravado por membro da org dona
--     (policy credit_rooms_update) e o gatilho fn_credit_room_grupo_valido
--     recusa org de que o usuário não é membro. r.escopo = 'GRUPO' é exigido
--     na perna (não basta o array: EMPRESA zera o array, mas a regra não
--     depende disso).
--   Pergunta 2 (quem executa):
--     fn_credit_room_documents — recriada com REVOKE ALL de PUBLIC e anon e
--       GRANT EXECUTE só a authenticated (o DROP leva as ACLs embora; o
--       CREATE nasceria com EXECUTE para PUBLIC). SECURITY DEFINER com a
--       autorização DENTRO (fn_credit_room_access).
--     fn_portal_share_credor_escopo — função de gatilho, SECURITY INVOKER;
--       REVOKE de PUBLIC, anon e authenticated (o gatilho dispara sem exigir
--       EXECUTE de quem faz o INSERT/UPDATE; ninguém precisa chamá-la).
--   Sonda anon: scripts/prova-credit-room-documentos-grupo.sql (BEGIN…ROLLBACK).
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md):
--      npx supabase db query --linked -f supabase/migrations/aplicar_20271122300000_credit_room_documentos_grupo.sql
-- ⚠️ A Edge Function credit-room-download repete a regra (Task 2 do plano):
--    até ela ser publicada, documento do grupo APARECE na lista mas o
--    download responde 403.
-- Idempotente. Rollback: scripts/rollback-credit-room-documentos-grupo.sql
--   (fora de migrations/ — prefixo único).
-- ==========================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'credit_rooms'
                      AND column_name = 'grupo_organization_ids') THEN
        RAISE EXCEPTION 'ABORTADO: credit_rooms.grupo_organization_ids nao existe (rode aplicar_20271122000000 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'fn_credit_room_is_internal') THEN
        RAISE EXCEPTION 'ABORTADO: public.fn_credit_room_is_internal(uuid) nao existe.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'opura_document_portal_shares'
                      AND column_name = 'credit_room_id') THEN
        RAISE EXCEPTION 'ABORTADO: opura_document_portal_shares.credit_room_id nao existe (rode aplicar_20270920000002 antes).';
    END IF;
END $$;

-- ── 1. O que o credor vê do Data Room ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_credit_room_documents(uuid);

CREATE FUNCTION public.fn_credit_room_documents(p_room uuid)
RETURNS TABLE (
    share_id          uuid,
    document_id       uuid,
    nome              text,
    descricao         text,
    categoria         text,
    tipo_documento    text,
    status            text,
    data_emissao      date,
    data_validade     date,
    version_id        uuid,
    version_number    integer,
    storage_path      text,
    mime_type         text,
    tamanho           bigint,
    shared_at         timestamptz,
    organization_id   uuid,
    contract_id       uuid,
    empreendimento_id uuid
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
           sh.shared_at,
           doc.organization_id,
           doc.contract_id,
           doc.empreendimento_id
      FROM public.opura_document_portal_shares sh
      JOIN public.opura_documents doc ON doc.id = sh.document_id
      LEFT JOIN public.opura_document_versions ver ON ver.id = doc.active_version_id
      JOIN public.credit_rooms r ON r.id = sh.credit_room_id
     WHERE sh.audience = 'credor'
       AND sh.credit_room_id = p_room
       -- documento da org DONA do room; com escopo GRUPO, também das orgs do grupo
       AND (doc.organization_id = r.organization_id
            OR (r.escopo = 'GRUPO' AND doc.organization_id = ANY (r.grupo_organization_ids)))
       AND public.fn_credit_room_access(p_room)          -- interno OU participante ativo
     ORDER BY sh.shared_at DESC;
$$;

REVOKE ALL ON FUNCTION public.fn_credit_room_documents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_credit_room_documents(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_credit_room_documents(uuid) IS
    'Data Room do Credit Room: documentos do GED compartilhados com o room (audience credor), '
    'da org dona ou, com escopo GRUPO, das orgs de grupo_organization_ids. Confere '
    'fn_credit_room_access. A Edge credit-room-download repete a mesma regra.';

-- ── 2. Trava na gravação do compartilhamento com o credor ─────────────────
CREATE OR REPLACE FUNCTION public.fn_portal_share_credor_escopo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_room_org uuid;
    v_escopo   text;
    v_grupo    uuid[];
    v_doc_org  uuid;
BEGIN
    IF NEW.audience IS DISTINCT FROM 'credor' THEN
        RETURN NEW;                       -- cliente / colaborador / investidor: intocados
    END IF;
    IF NEW.credit_room_id IS NULL THEN
        RETURN NEW;                       -- o CHECK opura_document_portal_shares_target_chk recusa
    END IF;

    -- (a) quem grava é interno do room. Room inexistente e room alheio dão a
    --     MESMA recusa: a mensagem não revela se o room existe.
    IF NOT public.fn_credit_room_is_internal(NEW.credit_room_id) THEN
        RAISE EXCEPTION 'Credit Room: sem permissão para compartilhar documentos com este Credit Room.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Lido pela RLS de quem grava (SECURITY INVOKER).
    SELECT r.organization_id, r.escopo, r.grupo_organization_ids
      INTO v_room_org, v_escopo, v_grupo
      FROM public.credit_rooms r
     WHERE r.id = NEW.credit_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Credit Room: sem permissão para compartilhar documentos com este Credit Room.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- (b) o documento é da org dona ou, com escopo GRUPO, de uma org do grupo.
    --     Documento que quem grava não enxerga cai na mesma recusa.
    SELECT d.organization_id
      INTO v_doc_org
      FROM public.opura_documents d
     WHERE d.id = NEW.document_id;

    IF v_doc_org IS NULL
       OR NOT (v_doc_org = v_room_org
               OR (v_escopo = 'GRUPO' AND v_doc_org = ANY (COALESCE(v_grupo, '{}'::uuid[])))) THEN
        RAISE EXCEPTION 'Credit Room: documento fora do escopo deste Credit Room — só entram documentos da empresa dona%.',
                CASE WHEN v_escopo = 'GRUPO' THEN ' e das empresas do grupo' ELSE '' END
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_portal_share_credor_escopo() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_portal_share_credor_escopo() IS
    'Gatilho de opura_document_portal_shares (audience credor): quem grava é interno do room '
    '(42501) e o documento é da org dona ou, com escopo GRUPO, de uma org do grupo (23514). '
    'SECURITY INVOKER: le credit_rooms/opura_documents pela RLS de quem grava.';

DROP TRIGGER IF EXISTS trg_portal_share_credor_escopo ON public.opura_document_portal_shares;
CREATE TRIGGER trg_portal_share_credor_escopo
    BEFORE INSERT OR UPDATE OF document_id, credit_room_id, audience
    ON public.opura_document_portal_shares
    FOR EACH ROW EXECUTE FUNCTION public.fn_portal_share_credor_escopo();

COMMIT;

-- ==========================================================================
-- Conferência (leitura; rodar depois, em outra invocação)
-- ==========================================================================
-- a. Assinatura nova e ACL (sem PUBLIC '=X/', sem anon):
--    SELECT pg_get_function_result('public.fn_credit_room_documents(uuid)'::regprocedure),
--           (SELECT proacl FROM pg_proc WHERE oid = 'public.fn_credit_room_documents(uuid)'::regprocedure),
--           (SELECT proacl FROM pg_proc WHERE oid = 'public.fn_portal_share_credor_escopo()'::regprocedure);
-- b. Gatilho ligado:
--    SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_portal_share_credor_escopo';
-- c. Compartilhamentos credor que já existiam continuam no escopo (esperado 0):
--    SELECT count(*) FROM opura_document_portal_shares sh
--      JOIN opura_documents d ON d.id = sh.document_id JOIN credit_rooms r ON r.id = sh.credit_room_id
--     WHERE sh.audience = 'credor' AND d.organization_id <> r.organization_id
--       AND NOT (r.escopo = 'GRUPO' AND d.organization_id = ANY (r.grupo_organization_ids));
-- d. Prova completa (BEGIN…ROLLBACK, não grava): scripts/prova-credit-room-documentos-grupo.sql
-- ==========================================================================
-- FIM: aplicar_20271122300000_credit_room_documentos_grupo.sql
-- ==========================================================================
