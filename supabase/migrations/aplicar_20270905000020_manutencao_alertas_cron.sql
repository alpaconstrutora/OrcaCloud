-- ============================================================================
-- Manutenção predial — alerta de vencimento (cron diário)
-- Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F1, item que
--        ficou de fora da entrega de 13/08/2026)
--
-- POR QUE ISTO EXISTE: o plano de manutenção já sabe o que venceu — a aba
-- Manutenção mostra "vencidos" e "vence em 30 dias". Mas quem não abre a aba
-- não fica sabendo, e um plano de manutenção que depende de alguém lembrar de
-- consultá-lo é exatamente o plano que morre sem ninguém notar. É essa a
-- diferença entre uma tela e um sistema que cobra.
--
-- SQL PURO, sem edge function. O cron de SLA da Qualidade (20260514000002) usa
-- `net.http_post` porque precisa de lógica em TypeScript; aqui a regra é uma
-- comparação de datas, e uma função no banco não tem o que dar errado em
-- deploy, segredo do vault ou função não publicada (ver a edge function
-- sign-contract, escrita e NUNCA publicada). Molde: 20261202000002.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — a marca de "já avisei" ═══════════════════════════════════════
-- Sem isto o cron avisa a mesma coisa todo dia até alguém executar o serviço, e
-- em duas semanas ninguém lê mais nenhuma notificação do sistema.
--
-- A marca é o PAR (vencimento, estágio), não um `alert_sent_at` solto: quando o
-- ciclo anda (a OS é concluída e `next_due_date` muda), o item volta a ser
-- elegível sozinho, sem ninguém precisar limpar a marca.
SET lock_timeout = '5s';

ALTER TABLE public.maintenance_plan_items
  ADD COLUMN IF NOT EXISTS alerted_for_due_date DATE,
  ADD COLUMN IF NOT EXISTS alerted_stage        TEXT
      CHECK (alerted_stage IS NULL OR alerted_stage IN ('PROXIMO','VENCIDO'));

COMMENT ON COLUMN public.maintenance_plan_items.alerted_for_due_date IS
  'Para QUAL vencimento o alerta já foi disparado. Quando next_due_date muda '
  '(ciclo andou), o item volta a ser elegível automaticamente.';

COMMENT ON COLUMN public.maintenance_plan_items.alerted_stage IS
  'PROXIMO (entrou na janela) ou VENCIDO (passou da data). São dois avisos '
  'distintos para o mesmo vencimento: o segundo é mais grave que o primeiro e '
  'por isso dispara de novo, em vez de ficar em silêncio.';

-- ═══ BLOCO 2 — a função ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_maintenance_due_alerts(p_days_ahead INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_rec       RECORD;
    v_stage     TEXT;
    v_titulo    TEXT;
    v_corpo     TEXT;
    v_label     TEXT;
    v_criados   INTEGER := 0;
BEGIN
    FOR v_rec IN
        SELECT
            i.id, i.description, i.next_due_date,
            i.periodicity_value, i.periodicity_unit,
            i.alerted_for_due_date, i.alerted_stage,
            COALESCE(s.name, 'Sem sistema')  AS system_name,
            e.name                            AS empreendimento_name,
            e.organization_id                 AS organization_id
        FROM public.maintenance_plan_items i
        JOIN public.maintenance_plans p     ON p.id = i.plan_id
        JOIN public.empreendimentos    e    ON e.id = p.empreendimento_id
        LEFT JOIN public.building_systems s  ON s.id = i.building_system_id
        WHERE i.is_active
          AND i.next_due_date IS NOT NULL
          -- Só plano VIGENTE cobra. Rascunho é trabalho em andamento; alertar
          -- sobre ele treinaria o usuário a ignorar o alerta.
          AND p.status = 'VIGENTE'
          AND i.next_due_date <= CURRENT_DATE + p_days_ahead
    LOOP
        v_stage := CASE WHEN v_rec.next_due_date < CURRENT_DATE THEN 'VENCIDO' ELSE 'PROXIMO' END;

        -- Já avisado para ESTE vencimento e NESTE estágio.
        IF v_rec.alerted_for_due_date = v_rec.next_due_date
           AND v_rec.alerted_stage = v_stage THEN
            CONTINUE;
        END IF;

        v_label := TO_CHAR(v_rec.next_due_date, 'DD/MM/YYYY');

        IF v_stage = 'VENCIDO' THEN
            v_titulo := 'Manutenção VENCIDA — ' || v_rec.empreendimento_name;
            v_corpo  := v_rec.system_name || ': ' || v_rec.description
                     || '. Venceu em ' || v_label || ' ('
                     || (CURRENT_DATE - v_rec.next_due_date) || ' dias atrás).';
        ELSE
            v_titulo := 'Manutenção vence em breve — ' || v_rec.empreendimento_name;
            v_corpo  := v_rec.system_name || ': ' || v_rec.description
                     || '. Vence em ' || v_label || ' ('
                     || (v_rec.next_due_date - CURRENT_DATE) || ' dias).';
        END IF;

        -- Uma notificação por MEMBRO da organização. O síndico não entra aqui:
        -- ele ainda não tem login (o Portal do Condômino é F3), e inventar um
        -- envio para um canal que não existe seria alerta que ninguém recebe.
        INSERT INTO public.notifications (recipient_email, title, message, link, type)
        SELECT DISTINCT m.email, v_titulo, v_corpo,
               -- O app NÃO tem roteamento por URL (nenhum react-router): a
               -- navegação é estado no AppRouter. Um link aqui não levaria a
               -- lugar nenhum, então fica nulo de propósito.
               NULL,
               'manutencao_vencimento'
          FROM public.organization_members m
         WHERE m.organization_id = v_rec.organization_id
           AND m.email IS NOT NULL;

        UPDATE public.maintenance_plan_items
           SET alerted_for_due_date = v_rec.next_due_date,
               alerted_stage        = v_stage,
               updated_at           = NOW()
         WHERE id = v_rec.id;

        v_criados := v_criados + 1;
    END LOOP;

    RETURN v_criados;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_maintenance_due_alerts(INTEGER) FROM PUBLIC;

-- ═══ BLOCO 3 — agendamento ══════════════════════════════════════════════════
-- 09h00 UTC (06h00 em Brasília), depois do alerta de vencimento financeiro das
-- 08h00 (20261202000002) — para os dois não competirem pela mesma janela.
SET lock_timeout = '5s';

SELECT cron.unschedule('manutencao-vencimento-alerts')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'manutencao-vencimento-alerts'
);

SELECT cron.schedule(
    'manutencao-vencimento-alerts',
    '0 9 * * *',
    $$SELECT public.fn_maintenance_due_alerts(30);$$
);

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho.
-- Esperado: colunas=2, funcao=1, job=1, agenda='0 9 * * *'

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='maintenance_plan_items'
      AND column_name IN ('alerted_for_due_date','alerted_stage'))  AS colunas,
  (SELECT count(*) FROM pg_proc WHERE proname='fn_maintenance_due_alerts') AS funcao,
  (SELECT count(*) FROM cron.job WHERE jobname='manutencao-vencimento-alerts') AS job,
  (SELECT schedule FROM cron.job WHERE jobname='manutencao-vencimento-alerts') AS agenda;

-- ═══ BLOCO 5 — teste (roda de verdade, e é seguro repetir) ══════════════════
-- Chamar à mão é o teste: a função é idempotente por construção.
--
--   SELECT public.fn_maintenance_due_alerts(30);   -- 1ª vez: N alertas criados
--   SELECT public.fn_maintenance_due_alerts(30);   -- 2ª vez: TEM de devolver 0
--
-- E para ver o que chegou:
--   SELECT title, message, created_at FROM public.notifications
--    WHERE type = 'manutencao_vencimento' ORDER BY created_at DESC LIMIT 20;
--
-- Para reexercitar sem esperar o ciclo, limpe a marca de um item:
--   UPDATE public.maintenance_plan_items
--      SET alerted_for_due_date = NULL, alerted_stage = NULL
--    WHERE id = '<item>';
