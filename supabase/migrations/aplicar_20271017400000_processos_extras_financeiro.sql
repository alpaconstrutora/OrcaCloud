-- ============================================================
-- Processos × Financeiro — os quatro itens "fora de escopo" da Torre do Financeiro
-- Plano: docs/planos/2026-10-16-torre-fluxo-financeiro.md (seção H)
--
-- Pedido (17/10/2026): "Implementar os 4 itens fora do escopo". Decisões do usuário:
--   • baixa × alçada: baixa MANUAL de título pendente é recusada (no app); conciliação
--     e Asaas NÃO são bloqueadas (o dinheiro já saiu), mas o título fica marcado
--     "pago sem aprovação" — é o carimbo deste arquivo, que vale para QUALQUER caminho;
--   • valor mínimo por modelo: campo novo, sem valor inicial nos modelos existentes;
--   • título vencido: inclui o estoque já vencido; modelos criados nas quatro orgs.
--
-- REGRA #7: as duas funções novas levam REVOKE de PUBLIC, anon e authenticated.
--   • fn_internal_tx_pago_sem_alcada — de gatilho; ninguém a chama por RPC;
--   • fn_titulos_vencidos_para_processo — só a Edge Function (service_role) e o
--     cron (postgres) a usam. SECURITY INVOKER: não amplia acesso de ninguém.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. Valor mínimo por modelo ───────────────────────────────────────────────
ALTER TABLE public.process_templates
    ADD COLUMN IF NOT EXISTS trigger_min_amount NUMERIC(14,2);

ALTER TABLE public.process_templates
    DROP CONSTRAINT IF EXISTS process_templates_trigger_min_amount_check;
ALTER TABLE public.process_templates
    ADD CONSTRAINT process_templates_trigger_min_amount_check
    CHECK (trigger_min_amount IS NULL OR trigger_min_amount > 0);

COMMENT ON COLUMN public.process_templates.trigger_min_amount IS
    'Modelo automático: o evento só abre processo a partir deste valor (título, boleto, pedido). Nulo = todo evento. Evento sem valor conhecido abre (nunca pular por falta de dado).';

-- ── 2. Título a pagar baixado ainda PENDENTE na alçada ───────────────────────
ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS pago_sem_alcada_em TIMESTAMPTZ;

COMMENT ON COLUMN public.internal_transactions.pago_sem_alcada_em IS
    'Quando o título a pagar foi baixado (CONCILIATED) com a alçada ainda PENDENTE — conciliação, Asaas ou qualquer outro caminho. Fica como histórico mesmo depois de aprovado.';

CREATE OR REPLACE FUNCTION public.fn_internal_tx_pago_sem_alcada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.direction = 'DEBIT'
       AND NEW.status = 'CONCILIATED'
       AND OLD.status IS DISTINCT FROM 'CONCILIATED'
       AND NEW.approval_status = 'PENDENTE'
       AND NEW.pago_sem_alcada_em IS NULL
    THEN
        NEW.pago_sem_alcada_em := now();
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_internal_tx_pago_sem_alcada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_internal_tx_pago_sem_alcada ON public.internal_transactions;
CREATE TRIGGER trg_internal_tx_pago_sem_alcada
    BEFORE UPDATE OF status ON public.internal_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_internal_tx_pago_sem_alcada();

-- Os que já existem: carimbo com a data do pagamento. Linha a linha — uma
-- competência fechada (ou outro gatilho de proteção) recusando uma linha não
-- derruba a migration; a linha fica de fora e aparece no aviso.
DO $$
DECLARE
    r RECORD;
    ok INT := 0;
    falhas INT := 0;
BEGIN
    FOR r IN
        SELECT t.id, coalesce(t.payment_date::timestamptz, t.updated_at, now()) AS quando
          FROM public.internal_transactions t
         WHERE t.direction = 'DEBIT' AND t.status = 'CONCILIATED'
           AND t.approval_status = 'PENDENTE' AND t.pago_sem_alcada_em IS NULL
    LOOP
        BEGIN
            UPDATE public.internal_transactions SET pago_sem_alcada_em = r.quando WHERE id = r.id;
            ok := ok + 1;
        EXCEPTION WHEN OTHERS THEN
            falhas := falhas + 1;
            RAISE NOTICE 'pago_sem_alcada_em: título % ficou de fora (%)', r.id, SQLERRM;
        END;
    END LOOP;
    RAISE NOTICE 'pago_sem_alcada_em: % títulos carimbados, % recusados', ok, falhas;
END $$;

-- ── 3. Modelos do evento "título vencido" (as quatro orgs, como os demais) ──
DO $$
DECLARE
    org RECORD;
    tpl UUID;
BEGIN
    FOR org IN SELECT o.id FROM public.organizations o LOOP

        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'payable.overdue'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Título a pagar vencido',
                'Disparado (uma vez por título) quando um título a pagar aberto passa do vencimento. '
                'Apura o motivo e decide: pagar, renegociar ou cancelar.',
                'Financeiro', 'ATIVO', 'ALTA', 72, 'EVENTO', 'payable.overdue')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Apurar o atraso',
                 'Por que não foi pago? Falta de aprovação, de saldo, de documento, disputa com o fornecedor?',
                 'task', 0, true, false, false, 24),
                (tpl, 'Pagar, renegociar ou cancelar',
                 'Programar o pagamento com juros, registrar a renegociação ou cancelar o título.',
                 'task', 1, true, false, false, 48);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'receivable.overdue'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Cobrança de título vencido',
                'Disparado (uma vez por título) quando um título a receber aberto passa do vencimento. '
                'Contato com o cliente e registro do acordo — a régua de cobrança segue enviando os e-mails.',
                'Financeiro', 'ATIVO', 'ALTA', 96, 'EVENTO', 'receivable.overdue')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Contatar o cliente',
                 'Telefone, WhatsApp ou e-mail: confirmar o débito e a data prometida.',
                 'task', 0, true, false, false, 24),
                (tpl, 'Registrar acordo ou escalar',
                 'Nova data, parcelamento ou encaminhamento (jurídico, protesto).',
                 'task', 1, true, false, false, 72);
        END IF;

    END LOOP;
END $$;

-- ── 4. Candidatos da varredura de vencidos ───────────────────────────────────
-- Título aberto, vencido, de org com modelo ATIVO para o evento, dentro do
-- valor mínimo do modelo e SEM processo daquele modelo (uma vez por título,
-- viva ou concluída). Mais antigo primeiro. LANGUAGE sql com aliases
-- qualificados (memória: RETURNS TABLE em plpgsql deu ambiguidade 3 vezes).
CREATE OR REPLACE FUNCTION public.fn_titulos_vencidos_para_processo(p_limite INT DEFAULT 150)
RETURNS TABLE (titulo_id UUID, evento TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT c.titulo_id, c.evento
      FROM (
        SELECT DISTINCT ON (t.id)
               t.id AS titulo_id,
               CASE WHEN t.direction = 'DEBIT' THEN 'payable.overdue' ELSE 'receivable.overdue' END AS evento,
               t.due_date AS vencimento
          FROM public.internal_transactions t
          JOIN public.process_templates pt
            ON pt.organization_id = t.organization_id
           AND pt.trigger_type = 'EVENTO'
           AND pt.status = 'ATIVO'
           AND pt.trigger_event_key = CASE WHEN t.direction = 'DEBIT' THEN 'payable.overdue' ELSE 'receivable.overdue' END
         WHERE t.status = 'PENDING'
           AND t.direction IN ('DEBIT', 'CREDIT')
           AND t.due_date < current_date
           AND coalesce(t.entry_type, 'PRINCIPAL') <> 'CONTRA'
           AND coalesce(t.business_status, '') NOT IN ('CANCELADO', 'RENEGOCIADO', 'RETIDO', 'PAGO', 'RECEBIDO')
           AND (pt.trigger_min_amount IS NULL OR t.amount >= pt.trigger_min_amount)
           AND NOT EXISTS (
                SELECT 1 FROM public.process_instances i
                 WHERE i.process_template_id = pt.id
                   AND i.internal_transaction_id = t.id
           )
         ORDER BY t.id
      ) c
     ORDER BY c.vencimento, c.titulo_id
     LIMIT greatest(1, least(coalesce(p_limite, 150), 500));
$$;

REVOKE EXECUTE ON FUNCTION public.fn_titulos_vencidos_para_processo(INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_titulos_vencidos_para_processo(INT) TO service_role;

-- ── 5. Cron: de hora em hora, só quando há candidato ─────────────────────────
SELECT cron.unschedule('process-overdue-sweep')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-overdue-sweep');

SELECT cron.schedule(
    'process-overdue-sweep',
    '7 * * * *',
    $cron$
    SELECT net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/process-overdue-sweep',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 150000
    )
     WHERE EXISTS (SELECT 1 FROM public.fn_titulos_vencidos_para_processo(1));
    $cron$
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-overdue-sweep') THEN
        RAISE EXCEPTION 'job process-overdue-sweep não foi agendado';
    END IF;
    RAISE NOTICE 'OK: process-overdue-sweep agendado (minuto 7 de cada hora, só com candidato).';
END $$;
