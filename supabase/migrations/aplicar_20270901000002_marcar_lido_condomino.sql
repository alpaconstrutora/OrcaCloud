-- ════════════════════════════════════════════════════════════════════════════
-- Conserta `condomino_portal_marcar_lido` — quebrada pela migration de hoje
-- Plano: docs/planos/2026-09-01b-conectar-condominio-portal-cliente.md
--
-- O QUE ACONTECEU: `aplicar_20270901000001` trocou o índice único de
-- `condominio_aviso_leituras` de (aviso_id, access_id) para
-- (aviso_id, client_id), mas NÃO reescreveu a RPC do Portal do Condômino, que
-- continuou com `ON CONFLICT (aviso_id, access_id)`. Sem índice que case, o
-- Postgres levanta 42P10 — marcar aviso como lido pelo portal antigo está
-- quebrado desde 01/09.
--
-- POR QUE NINGUÉM VIU: há 0 links de condômino ativos e 0 avisos cadastrados.
-- A suíte inteira e a verificação em tela passaram por cima — nenhuma delas
-- exercita esse caminho. Foi a leitura do código que achou.
--
-- ⚠️ NÃO BASTA TROCAR O `ON CONFLICT`. Se a RPC seguisse gravando só
-- `access_id`, o `client_id` ficaria NULO — e NULL não colide em índice único.
-- A mesma pessoa marcaria N leituras do mesmo aviso e inflaria o KPI
-- "CONFIRMAÇÕES DE LEITURA" do síndico, que conta linhas cruas
-- (`condominioComunicacaoService.ts:74-83`).
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push`.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.condomino_portal_marcar_lido(p_token TEXT, p_aviso_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_acc RECORD;
BEGIN
    SELECT * INTO v_acc FROM public.condomino_portal_access
     WHERE token = p_token AND is_active AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    -- O aviso tem de ser do condomínio DESTE acesso. A RPC nunca validou isso
    -- (000023:362) — com o id de um aviso de outro prédio, ela gravava leitura
    -- assim mesmo. A irmã do Portal do Cliente já valida; aqui fica igual.
    IF NOT EXISTS (
        SELECT 1
          FROM public.condominio_avisos      av
          JOIN public.empreendimento_towers  t ON t.empreendimento_id = av.empreendimento_id
          JOIN public.empreendimento_units   u ON u.tower_id = t.id
         WHERE av.id = p_aviso_id
           AND u.id = v_acc.unit_id
    ) THEN
        RETURN jsonb_build_object('ok', false,
                                  'motivo', 'Aviso não pertence ao condomínio desta unidade.');
    END IF;

    -- `client_id` é a CHAVE (o aviso é do prédio: ler uma vez é ter lido);
    -- `access_id` fica como procedência, dizendo por qual link a leitura veio.
    INSERT INTO public.condominio_aviso_leituras (aviso_id, client_id, access_id)
    VALUES (p_aviso_id, v_acc.client_id, v_acc.id)
    ON CONFLICT (aviso_id, client_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.condomino_portal_marcar_lido(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomino_portal_marcar_lido(TEXT, UUID) TO anon, authenticated;

-- ═══ Conferência ════════════════════════════════════════════════════════════
SELECT
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'condomino_portal_marcar_lido'
        AND p.prosrc LIKE '%ON CONFLICT (aviso_id, client_id)%')   AS on_conflict_certo,      -- 1
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'condomino_portal_marcar_lido'
        AND p.prosrc LIKE '%ON CONFLICT (aviso_id, access_id)%')   AS on_conflict_orfao,      -- 0
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'condomino_portal_marcar_lido'
        AND p.prosrc LIKE '%não pertence ao condomínio%')          AS valida_o_aviso,         -- 1
    (SELECT COUNT(*) FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'uidx_aviso_leitura_cliente') AS idx_alvo;  -- 1
