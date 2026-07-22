-- ============================================================
-- Migration: 20270821000007_opura_docs_edit_lock.sql
-- ÒPURA Docs (GED): bloqueio para edição (trava real)
--
-- Objetivo: permitir que um usuário "reserve" um documento antes de
-- editá-lo, informando quem está editando e qual era a última versão
-- no momento do bloqueio. Enquanto bloqueado, só quem bloqueou (ou um
-- admin da organização) pode editar o documento ou subir nova versão
-- — a trava é aplicada tanto na UI quanto nas RPCs de escrita abaixo,
-- então não depende só do front-end.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE — seguro
-- rodar de novo, inclusive contra um banco que já tenha as colunas
-- (aplicado via SQL direto, nunca via `supabase db push`).
-- ============================================================

ALTER TABLE public.opura_documents
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS locked_by_name TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_version INT;

COMMENT ON COLUMN public.opura_documents.locked_by IS 'E-mail do usuário que bloqueou o documento para edição (NULL = desbloqueado).';
COMMENT ON COLUMN public.opura_documents.locked_by_name IS 'Nome de exibição do usuário que bloqueou, para não depender de outro lookup na UI.';
COMMENT ON COLUMN public.opura_documents.locked_at IS 'Quando o bloqueio foi feito.';
COMMENT ON COLUMN public.opura_documents.locked_version IS 'version_number da versão ativa no momento do bloqueio (snapshot, não recalculado).';

-- ─── RPCs de bloqueio/desbloqueio (SECURITY DEFINER) ──────────
-- Centralizam a trava: mesmo que a UI tenha um bug, ninguém além do
-- dono do lock ou de um admin da organização consegue bloquear/desbloquear
-- por fora, porque a checagem mora aqui, não só no front-end.

CREATE OR REPLACE FUNCTION public.fn_lock_opura_document(
  p_document_id UUID,
  p_user_email TEXT,
  p_user_name TEXT
)
RETURNS public.opura_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.opura_documents;
  v_active_version_number INT;
  v_org_id UUID;
BEGIN
  SELECT * INTO v_doc FROM public.opura_documents WHERE id = p_document_id FOR UPDATE;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento não encontrado.';
  END IF;

  v_org_id := v_doc.organization_id;

  -- Quem chama precisa ser membro da organização do documento (mesma regra da policy de escrita)
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id AND email = p_user_email
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a esta organização.';
  END IF;

  IF v_doc.locked_by IS NOT NULL AND v_doc.locked_by <> p_user_email THEN
    RAISE EXCEPTION 'Documento já está bloqueado por % desde %.', v_doc.locked_by_name, v_doc.locked_at;
  END IF;

  SELECT version_number INTO v_active_version_number
  FROM public.opura_document_versions
  WHERE id = v_doc.active_version_id;

  UPDATE public.opura_documents
  SET locked_by = p_user_email,
      locked_by_name = p_user_name,
      locked_at = NOW(),
      locked_version = COALESCE(v_active_version_number, 1)
  WHERE id = p_document_id
  RETURNING * INTO v_doc;

  RETURN v_doc;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_unlock_opura_document(
  p_document_id UUID,
  p_user_email TEXT,
  p_is_org_admin BOOLEAN DEFAULT FALSE
)
RETURNS public.opura_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.opura_documents;
BEGIN
  SELECT * INTO v_doc FROM public.opura_documents WHERE id = p_document_id FOR UPDATE;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_doc.organization_id AND email = p_user_email
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso a esta organização.';
  END IF;

  IF v_doc.locked_by IS NOT NULL AND v_doc.locked_by <> p_user_email AND NOT p_is_org_admin THEN
    RAISE EXCEPTION 'Apenas % ou um administrador da organização podem desbloquear este documento.', v_doc.locked_by_name;
  END IF;

  UPDATE public.opura_documents
  SET locked_by = NULL,
      locked_by_name = NULL,
      locked_at = NULL,
      locked_version = NULL
  WHERE id = p_document_id
  RETURNING * INTO v_doc;

  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_lock_opura_document(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_unlock_opura_document(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_lock_opura_document(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_unlock_opura_document(UUID, TEXT, BOOLEAN) TO authenticated;

-- ─── Trava de escrita: nova versão / update do documento ──────
-- Mesmo que alguém edite via update direto na tabela (fora das RPCs
-- acima), o trigger abaixo impede update de campos "de conteúdo" do
-- documento por quem não é o dono do lock nem admin. Campos de
-- lock/unlock em si (locked_by e cia) são sempre permitidos passar,
-- senão a própria RPC de (des)bloqueio quebraria.

CREATE OR REPLACE FUNCTION public.fn_enforce_opura_document_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email TEXT := auth.jwt() ->> 'email';
  v_is_admin BOOLEAN;
BEGIN
  -- Sem lock ativo, ou o próprio dono do lock: nada a checar.
  IF OLD.locked_by IS NULL OR OLD.locked_by = v_caller_email THEN
    RETURN NEW;
  END IF;

  -- Chamada só mexendo nos campos de lock (ex.: RPC de unlock por admin) passa direto.
  IF NEW.nome IS NOT DISTINCT FROM OLD.nome
     AND NEW.descricao IS NOT DISTINCT FROM OLD.descricao
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.active_version_id IS NOT DISTINCT FROM OLD.active_version_id
     AND NEW.tags IS NOT DISTINCT FROM OLD.tags THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND email = v_caller_email
      AND role IN ('admin', 'owner')
  ) INTO v_is_admin;

  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'Documento bloqueado para edição por % (V%).', OLD.locked_by_name, OLD.locked_version;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_opura_document_lock ON public.opura_documents;
CREATE TRIGGER trg_enforce_opura_document_lock
  BEFORE UPDATE ON public.opura_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_opura_document_lock();
