-- Fase C (C6, C8, C10) de docs/planos/2026-11-21-portal-do-investidor-consolidacao.md

-- ═══ C6 — aporte cancelado ═══════════════════════════════════════════════════════════════════════
--
-- A tela do portal (PortalOverview, PortalFinance) já tinha o rótulo "Cancelado" para lançamento estornado,
-- mas o banco só aceitava pendente/liquidado/atrasado. Agora aceita `cancelado`; nenhuma soma o conta (as
-- contas leem só 'liquidado' e, para o em aberto, 'pendente'/'atrasado' — utils/investidorCarteira).
--
-- REGRA #7: sem policy, sem função.
-- Reversão: voltar a CHECK sem 'cancelado' (falha se houver linha cancelada — trocar antes para 'pendente').

ALTER TABLE public.investor_contributions DROP CONSTRAINT IF EXISTS investor_contributions_status_check;
ALTER TABLE public.investor_contributions ADD CONSTRAINT investor_contributions_status_check
    CHECK (status = ANY (ARRAY['pendente'::text, 'liquidado'::text, 'atrasado'::text, 'cancelado'::text]));

-- ═══ Fase C8 + C10 — a obra da oportunidade pelo link; o cronograma por token sem uso sai ═══════════════
-- O "Obra ao vivo" do gestor lê tabelas direto (no link, a RLS devolve vazio). O link passa a ler a obra
-- DA OPORTUNIDADE (a obra do empreendimento do estudo — a mesma de `local.obra_id` na vitrine): nome, fase,
-- avanço e marcos. Só de oportunidade publicada numa organização do investidor do token.
-- `fn_investor_portal_get_milestones` (marcos das obras ligadas por projects.investor_id) não tem chamador
-- no app desde a troca da carteira (Fase B): sai.
--
-- REGRA #7, pergunta 2: SECURITY DEFINER com o token conferido dentro; EXECUTE só anon/authenticated.

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_obra(p_token text, p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_opp  public.investor_opportunities;
    v_obra uuid;
BEGIN
    SELECT * INTO v_tok FROM public.investor_portal_tokens
     WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    SELECT * INTO v_opp FROM public.investor_opportunities o
     WHERE o.id = p_opportunity_id
       AND o.organization_id = ANY (public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
       AND o.is_published = TRUE;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    -- A obra do empreendimento do estudo (o mesmo caminho de fn_oportunidade_na_vitrine › local.obra_id).
    SELECT e.project_id INTO v_obra
      FROM public.empreendimentos e
     WHERE v_opp.imovib_study_id IS NOT NULL
       AND e.imovib_study_id = v_opp.imovib_study_id
       AND e.organization_id = v_opp.organization_id
     ORDER BY e.created_at
     LIMIT 1;
    IF v_obra IS NULL THEN RETURN jsonb_build_object('valid', TRUE, 'obra', NULL); END IF;

    RETURN jsonb_build_object('valid', TRUE, 'obra', (
        SELECT jsonb_build_object(
            'nome',   pr.name,
            'avanco', NULLIF(pr.settings ->> 'obraProgress', '')::numeric,
            'fase',   pr.settings ->> 'obraPhase',
            'marcos', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                        'nome', pm.name, 'previsto', pm.planned_date, 'concluido', pm.completed_date, 'status', pm.status)
                       ORDER BY pm.order_index, pm.planned_date)
                  FROM public.project_milestones pm
                 WHERE pm.project_id = pr.id AND pm.organization_id = pr.organization_id), '[]'::jsonb))
          FROM public.projects pr
         WHERE pr.id = v_obra AND pr.organization_id = v_opp.organization_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_obra(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_obra(text, uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_investor_portal_get_milestones(text);

-- ═══ C1 — o relatório mensal automático gera o PDF de verdade ═══════════════════════════════════════
-- Antes: a rotina do dia 1º (`monthly-investor-report`, pg_cron) inseria um investor_reports SEM arquivo, da
-- organização inteira, e publicava "Relatório disponível" — o investidor via "Indisponível". Agora ela chama a
-- Edge Function `investor-monthly-reports`, que gera o PDF de CADA investidor (utils/relatorioMensalDoInvestidor,
-- o mesmo do botão "Gerar Agora"), grava com o destinatário e só então publica o comunicado.
-- O agendamento (cron.job) NÃO muda: o comando continua `SELECT public.generate_monthly_investor_reports();`,
-- então liga/desliga da tela de Rotinas automáticas segue valendo (nada de unschedule + schedule).
--
-- REGRA #7, pergunta 2: antes `authenticated` executava esta função (qualquer usuário disparava a rotina).
-- Agora só postgres/service_role (o pg_cron roda como postgres).

CREATE OR REPLACE FUNCTION public.generate_monthly_investor_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/investor-monthly-reports',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_investor_reports() FROM PUBLIC, anon, authenticated;
