-- GED · aviso diário de validade de documento (cron `opura-docs-vencimento-alerts`, 8h).
--
-- 1. O link gravado era `#/documentos?tab=<categoria>&docId=<id>`: não começa com `/` (o app não navegava)
--    e `documentos` é a Área do Cliente, não o GED. Passa a gravar `/opura-docs?docId=<id>` — o mesmo
--    formato das notificações de aprovação (`documentService`, 07/10/2026), que o app abre com o documento
--    em foco (`utils/linkNotificacao.ts`).
-- 2. A mensagem passa a usar a mesma antecedência do filtro (COALESCE(…, 30)). Hoje a coluna é
--    NOT NULL DEFAULT 30, então é só coerência — não havia mensagem nula em produção.
-- 3. A função é SECURITY DEFINER e varre TODAS as organizações; só o cron a chama (roda como postgres).
--    `authenticated` ainda podia executá-la — fecha (REGRA #7).
--
-- Corpo copiado do arquivo vigente (20270919000003, igual ao banco em 10/10/2026); só mudam link e mensagem.

CREATE OR REPLACE FUNCTION public.fn_opura_docs_vencimento_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec         RECORD;
    v_member      RECORD;
    v_created     INTEGER := 0;
    v_target_date DATE := CURRENT_DATE;
    v_link        TEXT;
    v_msg         TEXT;
    v_title       TEXT;
BEGIN
    -- Percorre todos os documentos ativos com validade cadastrada
    FOR v_rec IN
        SELECT
            d.id,
            d.nome,
            d.categoria,
            d.data_validade,
            COALESCE(d.alerta_dias_antecedencia, 30) AS antecedencia,
            d.organization_id
        FROM public.opura_documents d
        WHERE d.data_validade IS NOT NULL
          AND d.status = 'ativo'
          -- O alerta dispara quando a data atual coincide com o vencimento menos a antecedência de alerta configurada
          AND (d.data_validade - COALESCE(d.alerta_dias_antecedencia, 30)) = v_target_date
    LOOP
        v_title := 'Validade de Documento: ' || v_rec.nome;
        v_msg := 'O documento "' || v_rec.nome || '" está próximo do vencimento em ' ||
                 TO_CHAR(v_rec.data_validade, 'DD/MM/YYYY') || ' (alerta de ' ||
                 v_rec.antecedencia || ' dias de antecedência).';
        v_link := '/opura-docs?docId=' || v_rec.id;

        -- Localiza os membros da organização correspondente para notificar
        FOR v_member IN
            SELECT email
            FROM public.organization_members
            WHERE organization_id = v_rec.organization_id
              AND email IS NOT NULL
        LOOP
            -- Idempotência: não envia a mesma notificação se já foi disparada nas últimas 24h para esse usuário
            IF EXISTS (
                SELECT 1 FROM public.notifications
                WHERE recipient_email = v_member.email
                  AND type = 'vencimento_documento'
                  AND link = v_link
                  AND created_at > NOW() - INTERVAL '24 hours'
            ) THEN
                CONTINUE;
            END IF;

            INSERT INTO public.notifications (recipient_email, title, message, link, type, organization_id)
            VALUES (v_member.email, v_title, v_msg, v_link, 'vencimento_documento', v_rec.organization_id);

            v_created := v_created + 1;
        END LOOP;
    END LOOP;

    RETURN v_created;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_opura_docs_vencimento_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_opura_docs_vencimento_alerts() TO service_role;

-- Notificações já gravadas no formato antigo (em 10/10/2026 eram 0 — o aviso nunca disparou): o app também
-- traduz `#/documentos?…docId=` (utils/linkNotificacao.ts), mas a linha passa a guardar o formato certo.
UPDATE public.notifications
   SET link = '/opura-docs?docId=' || substring(link FROM 'docId=([0-9a-fA-F-]{36})')
              || CASE WHEN link LIKE '%pending=true%' THEN '&pending=true' ELSE '' END
 WHERE link LIKE '#/documentos%'
   AND link ~ 'docId=[0-9a-fA-F-]{36}';
