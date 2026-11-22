-- aplicar_20271122400000_assinatura_leitura.sql
--
-- Tela de assinatura (22/11/2026): o "Assinar" só libera depois que o signatário
-- chega à última página do documento, e a leitura vai para a TRILHA — no evento
-- ASSINOU (hash encadeado, imutável), em `dados.leitura`:
--   { modo: 'TELA' | 'PDF_EXTERNO', paginas, ultima_pagina, chegou_ao_fim, segundos }
-- Quem valida o formato e exige o fim no modo TELA é a Edge `assinatura-interna`
-- (regras.ts › validarPedido); aqui só se registra.
--
-- `p_leitura` tem DEFAULT NULL: a Edge publicada antes desta migration continua
-- chamando sem ele e funcionando até a nova subir. Troca a assinatura da função
-- (nova coluna de argumento) → DROP da antiga + CREATE, REVOKE/GRANT de novo.
-- Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (Tela de assinatura).
-- Reverter: recriar a função de aplicar_20271122100000_assinatura_interna.sql
-- (DROP da de 11 argumentos antes).

BEGIN;

DROP FUNCTION IF EXISTS public.assinatura_confirmar(uuid, text, text, uuid, text, text, boolean, text, text, text);

CREATE OR REPLACE FUNCTION public.assinatura_confirmar(
    p_signatario uuid, p_canal text, p_credencial text, p_user uuid,
    p_otp_hash text, p_cpf text, p_aceite boolean, p_termo_versao text, p_ip text, p_ua text,
    p_leitura jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    s        public.assinatura_signatarios;
    e        public.assinatura_envelopes;
    g        public.assinatura_segredos;
    v_falta  int;
    v_esgot  int;
BEGIN
    s := public._assinatura_autorizar(p_signatario, p_canal, p_credencial, p_user);
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = s.envelope_id FOR UPDATE;
    IF public._assinatura_vencer(e.id) THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'O prazo para assinar este documento venceu.');
    END IF;
    IF e.status <> 'ENVIADO' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Este documento não está mais aguardando assinatura.');
    END IF;
    -- Relê sob a trava do envelope (outra chamada pode ter assinado antes).
    SELECT * INTO s FROM public.assinatura_signatarios WHERE id = s.id;
    IF s.status = 'ASSINADO' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Você já assinou este documento.');
    END IF;
    IF p_aceite IS NOT TRUE OR coalesce(btrim(p_termo_versao), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Marque a declaração de aceite para assinar.');
    END IF;

    SELECT * INTO g FROM public.assinatura_segredos WHERE signatario_id = s.id FOR UPDATE;
    IF g.bloqueado_ate IS NOT NULL AND g.bloqueado_ate > now() THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Muitas tentativas. Tente de novo mais tarde.', 'bloqueado', true);
    END IF;
    IF g.otp_hash IS NULL OR g.otp_expira_em IS NULL OR g.otp_expira_em < now() THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Código vencido ou não pedido. Peça um novo código.', 'pedir_codigo', true);
    END IF;

    IF g.otp_hash IS DISTINCT FROM lower(p_otp_hash)
       OR s.cpf IS DISTINCT FROM regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') THEN
        UPDATE public.assinatura_segredos SET otp_tentativas = otp_tentativas + 1
         WHERE signatario_id = s.id RETURNING * INTO g;
        PERFORM public._assinatura_evento(e.id, s.id, 'CONFIRMACAO_RECUSADA',
            jsonb_build_object('tentativa', g.otp_tentativas), p_ip, p_ua);
        IF g.otp_tentativas >= 5 THEN
            UPDATE public.assinatura_segredos SET otp_hash = NULL, otp_expira_em = NULL WHERE signatario_id = s.id;
            PERFORM public._assinatura_evento(e.id, s.id, 'CODIGO_ESGOTADO', '{}'::jsonb, p_ip, p_ua);
            SELECT count(*) INTO v_esgot FROM public.assinatura_eventos v
             WHERE v.signatario_id = s.id AND v.tipo = 'CODIGO_ESGOTADO' AND v.criado_em > now() - interval '24 hours';
            IF v_esgot >= 3 THEN
                UPDATE public.assinatura_segredos SET bloqueado_ate = now() + interval '24 hours' WHERE signatario_id = s.id;
                PERFORM public._assinatura_evento(e.id, s.id, 'BLOQUEADO', '{"horas":24}'::jsonb, p_ip, p_ua);
            END IF;
            RETURN jsonb_build_object('ok', false, 'erro', 'Código ou CPF não confere. O código foi invalidado — peça um novo.', 'pedir_codigo', true);
        END IF;
        RETURN jsonb_build_object('ok', false, 'erro', 'Código ou CPF não confere.');
    END IF;

    UPDATE public.assinatura_signatarios
       SET status = 'ASSINADO', assinado_em = now(), ip = left(p_ip, 100), user_agent = left(p_ua, 500),
           termo_versao = left(p_termo_versao, 40),
           visualizou_em = coalesce(visualizou_em, now())
     WHERE id = s.id;
    UPDATE public.assinatura_segredos SET otp_hash = NULL, otp_expira_em = NULL, otp_tentativas = 0
     WHERE signatario_id = s.id;
    PERFORM public._assinatura_evento(e.id, s.id, 'ASSINOU',
        jsonb_build_object('cpf', public._assinatura_cpf_mascarado(s.cpf), 'termo_versao', p_termo_versao,
                           'original_sha256', e.original_sha256, 'aceite', true, 'canal', s.canal,
                           'leitura', p_leitura),
        p_ip, p_ua);

    SELECT count(*) INTO v_falta FROM public.assinatura_signatarios x
     WHERE x.envelope_id = e.id AND x.status <> 'ASSINADO';
    IF v_falta = 0 THEN
        UPDATE public.assinatura_envelopes SET status = 'FINALIZANDO' WHERE id = e.id;
        PERFORM public._assinatura_evento(e.id, NULL, 'TODOS_ASSINARAM', '{}'::jsonb, NULL, NULL);
    END IF;

    RETURN jsonb_build_object('ok', true, 'envelope_id', e.id, 'finalizar', v_falta = 0, 'faltam', v_falta);
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_confirmar(uuid, text, text, uuid, text, text, boolean, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_confirmar(uuid, text, text, uuid, text, text, boolean, text, text, text, jsonb) TO service_role;

COMMIT;
