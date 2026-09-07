-- ==========================================================================
-- Portal de Crédito · Data Room = GED compartilhado com o Credit Room
-- Date: 2026-09-07
-- Altera: opura_document_portal_shares (audience 'credor' + credit_room_id)
-- Cria:   fn_credit_room_documents(uuid)
-- Plano:  docs/planos/2026-09-07-portal-credito-credit-room.md (item 2)
-- ==========================================================================
-- CONTEXTO
-- O PRD (§54–57) pede um Data Room com pastas, versões, vencimento e
-- auditoria. O GED já tem tudo isso, e já compartilha documento com dois
-- portais por `opura_document_portal_shares.audience` ('cliente',
-- 'colaborador'). O Credit Room entra como TERCEIRA audiência — nenhuma
-- tabela nova de documento, nenhuma cópia de arquivo (§94, fonte única).
--
-- O credor NÃO lê opura_documents nem opura_document_versions direto: a RLS
-- dessas tabelas é por organização e ele não é membro de nenhuma. Ele lê pela
-- função abaixo (DEFINER, que confere o vínculo antes) e baixa pela Edge
-- Function `credit-room-download`, que confere de novo antes de assinar.
--
-- ⚠️ `opura_document_portal_shares` NÃO é tabela quente (só o botão
--    Compartilhar escreve nela), mas o ALTER de CHECK ainda pega lock — por
--    isso lock_timeout e blocos idempotentes.
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'opura_document_portal_shares') THEN
        RAISE EXCEPTION 'ABORTADO: opura_document_portal_shares nao existe (rode 20270821000008 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'credit_rooms') THEN
        RAISE EXCEPTION 'ABORTADO: credit_rooms nao existe (rode aplicar_20270920000001 antes).';
    END IF;
END $$;

-- ── 1. Coluna e audiência nova ─────────────────────────────────────────────
ALTER TABLE public.opura_document_portal_shares
    ADD COLUMN IF NOT EXISTS credit_room_id uuid;

-- credit_rooms é tabela nova e fria: aqui a FK é segura, e apagar o room leva
-- os compartilhamentos junto (o documento no GED fica intacto).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opura_portal_shares_credit_room_fk') THEN
        ALTER TABLE public.opura_document_portal_shares
            ADD CONSTRAINT opura_portal_shares_credit_room_fk
            FOREIGN KEY (credit_room_id) REFERENCES public.credit_rooms(id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE public.opura_document_portal_shares
    DROP CONSTRAINT IF EXISTS opura_document_portal_shares_audience_check;
ALTER TABLE public.opura_document_portal_shares
    ADD CONSTRAINT opura_document_portal_shares_audience_check
    CHECK (audience IN ('cliente', 'colaborador', 'credor'));

ALTER TABLE public.opura_document_portal_shares
    DROP CONSTRAINT IF EXISTS opura_document_portal_shares_target_chk;
ALTER TABLE public.opura_document_portal_shares
    ADD CONSTRAINT opura_document_portal_shares_target_chk CHECK (
        (audience = 'cliente'     AND client_id IS NOT NULL AND employee_id IS NULL AND credit_room_id IS NULL) OR
        (audience = 'colaborador' AND employee_id IS NOT NULL AND client_id IS NULL AND credit_room_id IS NULL) OR
        (audience = 'credor'      AND credit_room_id IS NOT NULL AND client_id IS NULL AND employee_id IS NULL)
    );

-- Mesmo padrão dos outros dois: o upsert do service usa onConflict
-- (document_id, credit_room_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_portal_shares_credor
    ON public.opura_document_portal_shares (document_id, credit_room_id)
    WHERE audience = 'credor';
CREATE INDEX IF NOT EXISTS idx_opura_portal_shares_credit_room
    ON public.opura_document_portal_shares (credit_room_id) WHERE credit_room_id IS NOT NULL;

-- As policies existentes (portal_shares_select_org / portal_shares_write_org)
-- herdam o acesso de opura_documents — o lado interno já lê e escreve. O
-- credor NÃO ganha policy nesta tabela: ele entra pela função abaixo.

-- ── 2. O que o credor vê do Data Room ─────────────────────────────────────
-- Devolve os documentos compartilhados com o room, com a versão ATIVA e o
-- status de validade. Só o necessário para listar e pedir download —
-- storage_path vai junto porque a Edge Function o confere de novo contra
-- esta mesma tabela antes de assinar.
CREATE OR REPLACE FUNCTION public.fn_credit_room_documents(p_room uuid)
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

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- a. CHECK aceita 'credor':
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'opura_document_portal_shares_audience_check';
--
-- b. Compartilhar pelo GED com audiência Credit Room grava linha com
--    credit_room_id e client_id/employee_id NULL; com client_id junto → 23514.
--
-- c. Usuário CREDOR de um room: fn_credit_room_documents(room) devolve os
--    compartilhados; com o id de OUTRO room devolve 0 linhas, não erro.
--
-- d. anon: POST /rest/v1/rpc/fn_credit_room_documents -> 401/42501.
-- ==========================================================================
-- FIM: aplicar_20270920000002_ged_shares_credor.sql
-- ==========================================================================
