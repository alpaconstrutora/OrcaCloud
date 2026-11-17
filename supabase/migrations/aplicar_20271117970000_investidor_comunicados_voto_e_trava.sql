-- ==========================================================================
-- Portal do Investidor › Comunicados: voto pelo link e trava de comunicado respondido no banco
-- Date: 2026-11-17
-- Plano: docs/planos/2026-11-17-investidor-comunicados-voto-e-trava.md
-- Prova: scripts/teste-investidor-comunicados-voto-e-trava.sql
-- Base:  definições vigentes no banco em 17/11 (= 20261228000005_investor_portal_rpcs.sql;
--        get_announcements já com `vote_option`)
-- ==========================================================================
-- Pedido do usuário (17/11/2026): "implemente o Ficou de fora" — os dois itens que o #519
-- (CRUD do gestor) deixou de fora: votar pelo link e travar no banco, não só no app.
--
-- O QUE MUDA
-- 1. Gatilho trg_investor_announcements_trava_respondido: comunicado com aceite ou voto não muda
--    título, texto, tipo, pedido de confirmação, publicação, organização nem obra, e não pode ser
--    excluído (o ON DELETE CASCADE apagaria as respostas). Vale para todo papel. Exceção: a
--    mudança que chega por CASCATA (excluir a organização → DELETE; excluir a obra → project_id
--    NULL) passa — pg_trigger_depth() > 1, porque a ação do FK roda dentro do gatilho do RI.
--    Recusa = 23514 com HINT 'comunicado_com_respostas' e DETAIL = nº de respostas, que o
--    services/announcementsService.ts traduz para a mensagem da tela.
-- 2. fn_investor_portal_acknowledge (o link é anônimo):
--    · só comunicado PUBLICADO recebe resposta (antes, rascunho com o id em mãos também);
--    · votação exige 'sim', 'nao' ou 'abstencao' → senão {"valid":false,"error":"vote_required"};
--      nos outros tipos o voto é ignorado (NULL);
--    · resposta é definitiva: ON CONFLICT DO NOTHING (antes DO UPDATE trocava o voto e a data, e
--      um 2º "Confirmar" sem voto zerava o voto);
--    · devolve o que ficou gravado (vote_option, acknowledged_at).
-- 3. fn_investor_portal_get_announcements: + acknowledged_at da resposta do investidor.
--
-- Assinaturas iguais → CREATE OR REPLACE mantém os grants; repetidos abaixo por clareza.
-- ==========================================================================

-- 1. Trava ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_investor_announcements_trava_respondido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER            -- conta TODAS as respostas, não só as que a RLS de quem edita mostra
SET search_path = public
AS $$
DECLARE
    v_respostas integer;
BEGIN
    -- Cascata de FK (organização ou obra excluída): deixa passar.
    IF pg_trigger_depth() > 1 THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP = 'UPDATE' AND NOT (
           NEW.title                   IS DISTINCT FROM OLD.title
        OR NEW.body                    IS DISTINCT FROM OLD.body
        OR NEW.type                    IS DISTINCT FROM OLD.type
        OR NEW.requires_acknowledgment IS DISTINCT FROM OLD.requires_acknowledgment
        OR NEW.published_at            IS DISTINCT FROM OLD.published_at
        OR NEW.organization_id         IS DISTINCT FROM OLD.organization_id
        OR NEW.project_id              IS DISTINCT FROM OLD.project_id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_respostas
    FROM public.investor_acknowledgments
    WHERE announcement_id = OLD.id;

    IF v_respostas > 0 THEN
        RAISE EXCEPTION 'Este comunicado já tem % resposta(s) de investidor e não pode ser %: o texto fica como foi confirmado. Para corrigir ou complementar, publique um novo comunicado.',
            v_respostas, CASE WHEN TG_OP = 'DELETE' THEN 'excluído' ELSE 'editado' END
            USING ERRCODE = 'check_violation',
                  DETAIL  = v_respostas::text,
                  HINT    = 'comunicado_com_respostas';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_investor_announcements_trava_respondido() FROM anon;
REVOKE ALL ON FUNCTION public.fn_investor_announcements_trava_respondido() FROM authenticated;
REVOKE ALL ON FUNCTION public.fn_investor_announcements_trava_respondido() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_investor_announcements_trava_respondido ON public.investor_announcements;
CREATE TRIGGER trg_investor_announcements_trava_respondido
    BEFORE UPDATE OR DELETE ON public.investor_announcements
    FOR EACH ROW EXECUTE FUNCTION public.fn_investor_announcements_trava_respondido();

-- 2. Resposta pelo link -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_investor_portal_acknowledge(
    p_token           TEXT,
    p_announcement_id UUID,
    p_vote_option     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_ann  public.investor_announcements;
    v_voto TEXT;
    v_ack  public.investor_acknowledgments;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"token_invalid"}'::jsonb; END IF;

    -- Comunicado PUBLICADO da org do link (rascunho não recebe resposta).
    SELECT * INTO v_ann
    FROM public.investor_announcements
    WHERE id = p_announcement_id
      AND organization_id = v_tok.org_id
      AND published_at IS NOT NULL;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"not_found"}'::jsonb; END IF;

    IF v_ann.type = 'votacao' THEN
        v_voto := lower(btrim(p_vote_option));
        IF v_voto IS NULL OR v_voto NOT IN ('sim', 'nao', 'abstencao') THEN
            RETURN '{"valid":false,"error":"vote_required"}'::jsonb;
        END IF;
    END IF;

    -- Resposta é definitiva: a 2ª chamada não troca o voto nem a data.
    INSERT INTO public.investor_acknowledgments (announcement_id, investor_id, vote_option)
    VALUES (v_ann.id, v_tok.investor_id, v_voto)
    ON CONFLICT (announcement_id, investor_id) DO NOTHING;

    SELECT * INTO v_ack
    FROM public.investor_acknowledgments
    WHERE announcement_id = v_ann.id AND investor_id = v_tok.investor_id;

    RETURN jsonb_build_object(
        'valid',           TRUE,
        'vote_option',     v_ack.vote_option,
        'acknowledged_at', v_ack.acknowledged_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_investor_portal_acknowledge(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_acknowledge(TEXT, UUID, TEXT) TO anon, authenticated;

-- 3. Leitura pelo link: + acknowledged_at -----------------------------------
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_announcements(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_org_id UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid',         TRUE,
        'announcements', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',                      ia.id,
                    'title',                   ia.title,
                    'body',                    ia.body,
                    'type',                    ia.type,
                    'published_at',            ia.published_at,
                    'requires_acknowledgment', ia.requires_acknowledgment,
                    'project_id',              ia.project_id,
                    'created_at',              ia.created_at,
                    'acknowledged',            (ack.id IS NOT NULL),
                    'vote_option',             ack.vote_option,
                    'acknowledged_at',         ack.acknowledged_at
                )
                ORDER BY ia.published_at DESC
             )
             FROM public.investor_announcements ia
             LEFT JOIN public.investor_acknowledgments ack
                 ON ack.announcement_id = ia.id AND ack.investor_id = v_inv_id
             WHERE ia.organization_id = v_org_id
               AND ia.published_at IS NOT NULL),
            '[]'::jsonb
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_investor_portal_get_announcements(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_announcements(TEXT) TO anon, authenticated;
