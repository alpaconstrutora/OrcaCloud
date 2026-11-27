-- ============================================================================
-- Portal do Síndico › G5: documentos do condomínio (26/11/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G5)
-- Pronto quando: documento enviado pelo síndico aparece para o morador se marcado visível.
--
-- No app (DocumentosTab) o gestor sobe direto ao bucket e grava a linha com a RLS de
-- membro. O síndico não é membro: o arquivo sobe pela Edge Function
-- `sindico-portal-documentos` (a da ata/procuração da assembleia, fase B), agora com
-- `finalidade=documento`, e estas RPCs decidem:
--   • `sindico_portal_documentos` (ler): os documentos do condomínio com id, categoria,
--     visibilidade, quem enviou e se estão presos a uma assembleia;
--   • `sindico_portal_documento_autorizar`: a Edge chama com a credencial de QUEM CHAMOU
--     antes de a service_role gravar — `fn_sindico_escrita_no_predio` (síndico logado OU a
--     administradora pelo app, recorte por condomínio). Devolve a org, o autor e o papel;
--   • `sindico_portal_documento_visibilidade`: mostrar ou esconder do morador;
--   • `sindico_portal_documento_remover`: apaga a LINHA e devolve o caminho; a Edge tira o
--     arquivo (o Storage não deixa apagar por SQL — `protect_objects_delete`). Recusa a ata
--     vinculada a uma assembleia (a FK é SET NULL: a assembleia perderia a ata calada) e a
--     procuração de uma unidade (FK sem ação: o banco recusaria com erro cru).
--
-- REGRA #7: REVOKE de PUBLIC/anon em toda função; autorização DENTRO.
-- Reverter: DROP das 4 funções; o CHECK de ações volta à lista de …950200.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS',
                    'CONTA_SALVAR', 'RECEBER', 'DESFAZER_BAIXA', 'LANCAR_RECEITA',
                    'EXTRATO_IMPORTAR', 'EXTRATO_CONCILIAR', 'EXTRATO_DESFAZER', 'EXTRATO_IGNORAR',
                    'EXTRATO_RESTAURAR', 'EXTRATO_LANCAR',
                    'FORNECEDOR_EDITAR', 'FORNECEDOR_CONTA', 'CONTRATO_SALVAR', 'CONTRATO_ENCERRAR',
                    'OS_SALVAR', 'OS_CONCLUIR', 'OS_CANCELAR', 'PLANO_ITEM_SALVAR', 'PLANO_ITEM_REMOVER',
                    'ATIVO_SALVAR', 'ATIVO_REMOVER',
                    'DOCUMENTO_ENVIAR', 'DOCUMENTO_VISIBILIDADE', 'DOCUMENTO_REMOVER'));

-- Motivo de o documento não poder sair (NULL = pode).
CREATE OR REPLACE FUNCTION public.fn_sindico_motivo_documento_preso(p_documento uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM public.condominio_assembleias a WHERE a.ata_documento_id = p_documento)
            THEN 'Esta é a ata de uma assembleia — ela fica com a assembleia.'
        WHEN EXISTS (SELECT 1 FROM public.condominio_assembleia_unidades u WHERE u.procuracao_documento_id = p_documento)
            THEN 'Esta é a procuração de uma unidade numa assembleia — ela fica com a assembleia.'
        ELSE NULL
    END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_motivo_documento_preso(uuid) FROM PUBLIC, anon, authenticated;

-- ── 1. Ler ───────────────────────────────────────────────────────────────────
-- Não STABLE: o resolvedor grava `last_used_at` do link.
CREATE OR REPLACE FUNCTION public.sindico_portal_documentos(p_token text, p_client_id uuid, p_empreendimento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r   jsonb;
    v_cli uuid;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    RETURN jsonb_build_object('ok', true,
        'motivoNaoOpera', public.fn_sindico_motivo_nao_opera(p_empreendimento_id),
        'documentos', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id', d.id, 'titulo', d.titulo, 'categoria', d.categoria, 'descricao', d.descricao,
            'visivelPortal', coalesce(d.visivel_portal, false), 'arquivo', d.file_name, 'tamanho', d.file_size,
            'link', d.storage_path IS NULL AND d.url IS NOT NULL, 'criadoEm', d.created_at,
            'motivoPreso', public.fn_sindico_motivo_documento_preso(d.id)
        ) ORDER BY d.created_at DESC)
          FROM public.condominio_documentos d WHERE d.empreendimento_id = p_empreendimento_id), '[]'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_documentos(text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_documentos(text, uuid, uuid) TO anon, authenticated;

-- ── 2. Autorizar o envio (chamada pela Edge com a credencial de quem chamou) ──
CREATE OR REPLACE FUNCTION public.sindico_portal_documento_autorizar(
    p_token text, p_client_id uuid, p_empreendimento uuid, p_titulo text DEFAULT NULL, p_categoria text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento);
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, depois)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'DOCUMENTO_ENVIAR',
            jsonb_build_object('titulo', p_titulo, 'categoria', p_categoria));
    RETURN jsonb_build_object('ok', true, 'org', v_a ->> 'org', 'clientId', v_a ->> 'client_id',
                              'nome', v_a ->> 'nome', 'como', v_a ->> 'como');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_documento_autorizar(text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_documento_autorizar(text, uuid, uuid, text, text) TO authenticated;

-- ── 3. Visibilidade no portal do morador ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_documento_visibilidade(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_documento uuid, p_visivel boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_antes public.condominio_documentos;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    SELECT * INTO v_antes FROM public.condominio_documentos
     WHERE id = p_documento AND empreendimento_id = p_empreendimento_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Documento não encontrado neste condomínio.'); END IF;
    IF p_visivel AND EXISTS (SELECT 1 FROM public.condominio_assembleia_unidades u WHERE u.procuracao_documento_id = p_documento) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Procuração tem dados pessoais e não vai ao portal do morador.');
    END IF;
    UPDATE public.condominio_documentos SET visivel_portal = coalesce(p_visivel, false) WHERE id = p_documento;
    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes, depois)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'DOCUMENTO_VISIBILIDADE', p_documento,
            jsonb_build_object('visivel', v_antes.visivel_portal), jsonb_build_object('visivel', coalesce(p_visivel, false)));
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_documento_visibilidade(text, uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_documento_visibilidade(text, uuid, uuid, uuid, boolean) TO authenticated;

-- ── 4. Remover (a linha; a Edge tira o arquivo com o caminho devolvido) ──────
CREATE OR REPLACE FUNCTION public.sindico_portal_documento_remover(
    p_token text, p_client_id uuid, p_empreendimento uuid, p_documento uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a      jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento);
    v_antes  public.condominio_documentos;
    v_motivo text;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    SELECT * INTO v_antes FROM public.condominio_documentos
     WHERE id = p_documento AND empreendimento_id = p_empreendimento FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Documento não encontrado neste condomínio.'); END IF;
    v_motivo := public.fn_sindico_motivo_documento_preso(p_documento);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    DELETE FROM public.condominio_documentos WHERE id = p_documento;
    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'DOCUMENTO_REMOVER', p_documento,
            to_jsonb(v_antes));
    RETURN jsonb_build_object('ok', true, 'storagePath', v_antes.storage_path);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_documento_remover(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_documento_remover(text, uuid, uuid, uuid) TO authenticated;
