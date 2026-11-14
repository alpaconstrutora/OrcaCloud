-- Módulo ÒPURA Riscos — F1.10: alertas fixos (cron diário → public.notifications).
-- Plano: docs/planos/2026-11-13-modulo-riscos.md, item F1.10. Depende de aplicar_20271114637000.
--
-- Três regras, sem motor configurável (fora do MVP):
--   risco_acao_vencida      ação planejada/em andamento com prazo < hoje → responsável da ação + dono do risco
--   risco_revisao_vencida   risco ativo com próxima revisão < hoje        → dono do risco
--   risco_critico_sem_plano risco ativo crítico (gatilho OU pontuação ≥ limite crítico da org)
--                           sem nenhuma ação não cancelada                → dono do risco
-- "Ativo" = status fora de materializado/encerrado.
--
-- Sem repetição (CA07): no máximo 1 aviso por destinatário + regra + risco (link) por DIA de
-- Brasília. Rodar o job duas vezes no mesmo dia não gera nada novo.
-- Destinatário: e-mail do membro da organização (organization_members.user_id), com auth.users
-- como reserva — notifications é endereçada por recipient_email.
--
-- SECURITY DEFINER e varre TODAS as organizações: só o cron chama (roda como postgres).
-- authenticated/anon NÃO executam (REGRA #7; mesmo padrão de fn_opura_docs_vencimento_alerts).

CREATE OR REPLACE FUNCTION public.fn_risk_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_hoje     DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_rec      RECORD;
    v_email    TEXT;
    v_created  INTEGER := 0;
BEGIN
    FOR v_rec IN
        -- 1. Ação vencida: um aviso para o responsável e outro para o dono (se for outra pessoa).
        SELECT 'risco_acao_vencida'::TEXT AS tipo, r.organization_id, r.id AS risk_id, u.user_id,
               'Ação de risco vencida: ' || r.codigo AS titulo,
               '"' || left(a.descricao, 120) || '" (' || r.titulo || ') venceu em ' ||
                   to_char(a.prazo, 'DD/MM/YYYY') || '.' AS mensagem
          FROM public.risk_actions a
          JOIN public.project_risks r ON r.id = a.project_risk_id
          CROSS JOIN LATERAL (SELECT DISTINCT x AS user_id
                                FROM unnest(ARRAY[a.responsavel_user_id, r.owner_user_id]) AS x) u
         WHERE a.status IN ('planejada','em_andamento')
           AND a.prazo < v_hoje
           AND r.status NOT IN ('materializado','encerrado')
        UNION ALL
        -- 2. Revisão vencida.
        SELECT 'risco_revisao_vencida', r.organization_id, r.id, r.owner_user_id,
               'Revisão de risco vencida: ' || r.codigo,
               '"' || r.titulo || '" deveria ter sido revisado em ' || to_char(r.proxima_revisao, 'DD/MM/YYYY') || '.'
          FROM public.project_risks r
         WHERE r.status NOT IN ('materializado','encerrado')
           AND r.proxima_revisao < v_hoje
        UNION ALL
        -- 3. Crítico sem plano.
        SELECT 'risco_critico_sem_plano', r.organization_id, r.id, r.owner_user_id,
               'Risco crítico sem plano de ação: ' || r.codigo,
               '"' || r.titulo || '" é crítico' ||
                   CASE WHEN r.gatilho_critico THEN ' (gatilho: ' || COALESCE(r.gatilho_motivo, 'segurança/estabilidade/legal') || ')'
                        ELSE ' (pontuação ' || COALESCE(r.residual_pontuacao, r.inerente_pontuacao) || ')' END ||
                   ' e não tem nenhuma ação de tratamento.'
          FROM public.project_risks r
          LEFT JOIN public.risk_matrix_config m ON m.organization_id = r.organization_id
         WHERE r.status NOT IN ('materializado','encerrado')
           AND (r.gatilho_critico
                OR COALESCE(r.residual_pontuacao, r.inerente_pontuacao, 0) >= COALESCE(m.limite_critico, 20))
           AND NOT EXISTS (SELECT 1 FROM public.risk_actions a
                            WHERE a.project_risk_id = r.id AND a.status <> 'cancelada')
    LOOP
        SELECT COALESCE(
                   (SELECT om.email FROM public.organization_members om
                     WHERE om.organization_id = v_rec.organization_id AND om.user_id = v_rec.user_id
                       AND om.email IS NOT NULL LIMIT 1),
                   (SELECT au.email FROM auth.users au WHERE au.id = v_rec.user_id))
          INTO v_email;
        CONTINUE WHEN v_email IS NULL;

        IF EXISTS (
            SELECT 1 FROM public.notifications n
             WHERE lower(n.recipient_email) = lower(v_email)
               AND n.type = v_rec.tipo
               AND n.link = '/riscos?riskId=' || v_rec.risk_id
               AND (n.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE = v_hoje
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.notifications (recipient_email, title, message, link, type, organization_id)
        VALUES (v_email, v_rec.titulo, v_rec.mensagem, '/riscos?riskId=' || v_rec.risk_id, v_rec.tipo, v_rec.organization_id);
        v_created := v_created + 1;
    END LOOP;

    RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_risk_alerts() FROM anon;
REVOKE ALL ON FUNCTION public.fn_risk_alerts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_risk_alerts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_risk_alerts() TO service_role;

-- 08h00 de Brasília (11h UTC), todos os dias.
SELECT cron.unschedule('riscos-alertas-diarios')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'riscos-alertas-diarios');
SELECT cron.schedule('riscos-alertas-diarios', '0 11 * * *', $$SELECT public.fn_risk_alerts();$$);
