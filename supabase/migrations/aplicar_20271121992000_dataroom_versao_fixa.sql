-- Fase 7.9 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md (decisão D8)
--
-- O compartilhamento do GED aponta para o DOCUMENTO: quando sai uma versão nova,
-- ela aparece na hora no portal. Para o Data Room do investidor (diligência sobre
-- um documento que ele já leu), a versão passa a ser FIXADA no compartilhamento;
-- o gestor vê que há versão nova e escolhe atualizar. Cliente, colaborador e
-- credor continuam vendo a versão ativa (version_id fica NULL para eles).
--
-- Pergunta 1 (REGRA #7): sem policy nova (as de opura_document_portal_shares valem).
-- Pergunta 2: a função do gatilho não é chamável por ninguém (REVOKE de todos);
-- fn_investor_portal_get_dataroom mantém a assinatura, o token e as checagens, e
-- o mesmo EXECUTE (anon/authenticated, nunca PUBLIC).
--
-- A Edge Function investor-portal-dataroom-download só assina o que esta RPC
-- lista: não precisa mudar.
--
-- Reversão: recriar fn_investor_portal_get_dataroom da 970000; DROP TRIGGER
-- trg_portal_share_versao_do_investidor; DROP FUNCTION fn_portal_share_versao_do_investidor();
-- ALTER TABLE opura_document_portal_shares DROP COLUMN version_id.

ALTER TABLE public.opura_document_portal_shares
    ADD COLUMN IF NOT EXISTS version_id uuid
        REFERENCES public.opura_document_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.opura_document_portal_shares.version_id IS
    'Só audiência investidor: a versão que o investidor vê. NULL = a ativa (versão apagada também cai na ativa).';

ALTER TABLE public.opura_document_portal_shares
    DROP CONSTRAINT IF EXISTS opura_portal_shares_versao_so_investidor;
ALTER TABLE public.opura_document_portal_shares
    ADD CONSTRAINT opura_portal_shares_versao_so_investidor
        CHECK (version_id IS NULL OR audience = 'investidor');

-- Compartilhar com o investidor fixa a versão ativa do momento; a versão fixada
-- tem de ser DESTE documento.
CREATE OR REPLACE FUNCTION public.fn_portal_share_versao_do_investidor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.audience <> 'investidor' THEN
        RETURN NEW;
    END IF;
    IF NEW.version_id IS NULL AND TG_OP = 'INSERT' THEN
        SELECT d.active_version_id INTO NEW.version_id
          FROM public.opura_documents d WHERE d.id = NEW.document_id;
    END IF;
    IF NEW.version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.opura_document_versions v
         WHERE v.id = NEW.version_id AND v.document_id = NEW.document_id
    ) THEN
        RAISE EXCEPTION 'A versão escolhida não é deste documento' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_portal_share_versao_do_investidor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_portal_share_versao_do_investidor ON public.opura_document_portal_shares;
CREATE TRIGGER trg_portal_share_versao_do_investidor
    BEFORE INSERT OR UPDATE OF version_id, document_id, audience ON public.opura_document_portal_shares
    FOR EACH ROW EXECUTE FUNCTION public.fn_portal_share_versao_do_investidor();

-- Os compartilhamentos com investidor que já existem ficam na versão ativa de hoje.
UPDATE public.opura_document_portal_shares sh
   SET version_id = d.active_version_id
  FROM public.opura_documents d
 WHERE d.id = sh.document_id
   AND sh.audience = 'investidor'
   AND sh.version_id IS NULL;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_dataroom(p_token text, p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_opp  public.investor_opportunities;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    SELECT * INTO v_opp
    FROM public.investor_opportunities o
    WHERE o.id = p_opportunity_id
      AND o.organization_id = ANY(public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
      AND o.is_published = TRUE;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'documents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', doc.id, 'opportunity_id', sh.opportunity_id, 'name', doc.nome, 'description', doc.descricao,
                'file_path', ver.storage_path, 'file_size', ver.tamanho, 'mime_type', ver.mime_type,
                'version_number', ver.version_number,
                'category', doc.categoria, 'created_at', sh.shared_at) ORDER BY sh.shared_at DESC)
            FROM public.opura_document_portal_shares sh
            JOIN public.opura_documents doc ON doc.id = sh.document_id
            -- A versão FIXADA no compartilhamento (D8); sem ela, a ativa.
            JOIN public.opura_document_versions ver
              ON ver.id = COALESCE(sh.version_id, doc.active_version_id)
             AND ver.document_id = doc.id
            WHERE sh.audience = 'investidor'
              AND sh.opportunity_id = p_opportunity_id
              AND doc.organization_id = v_opp.organization_id   -- documento da org DA OPORTUNIDADE, nunca de outra
        ), '[]'::jsonb)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) TO anon, authenticated;
