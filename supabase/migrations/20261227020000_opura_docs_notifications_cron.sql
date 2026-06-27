-- 1. Criar a função fn_opura_docs_vencimento_alerts
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
            d.alerta_dias_antecedencia,
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
                 v_rec.alerta_dias_antecedencia || ' dias de antecedência).';
        v_link := '#/documentos?tab=' || v_rec.categoria || '&docId=' || v_rec.id;

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

            -- Inserir na tabela de notificações do OrçaCloud
            INSERT INTO public.notifications (recipient_email, title, message, link, type)
            VALUES (v_member.email, v_title, v_msg, v_link, 'vencimento_documento');

            v_created := v_created + 1;
        END LOOP;
    END LOOP;

    RETURN v_created;
END;
$$;

-- 2. Agendar a execução diária da função utilizando o pg_cron às 08h00 UTC
SELECT cron.unschedule('opura-docs-vencimento-alerts')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'opura-docs-vencimento-alerts'
);

SELECT cron.schedule(
    'opura-docs-vencimento-alerts',
    '0 8 * * *',
    $$SELECT public.fn_opura_docs_vencimento_alerts();$$
);
