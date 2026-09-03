-- ============================================================
-- Migration: aplicar_20270918000024_notify_opportunity_interest_por_trigger.sql
-- C3-06 / C5-03 — quem dispara a notificação de interesse passa a ser o banco
--
-- O ERRO QUE ESTA MIGRATION CONSERTA É MEU
-- Na Fase 2 eu fechei o C3-06 pondo em `notify-opportunity-interest` o mesmo
-- gate das funções de cron, e escrevi no comentário:
--
--     "Estas funções são chamadas por serviço/trigger, nunca pelo navegador."
--
-- Falso. São TRÊS chamadas, todas do navegador, e duas delas anônimas:
--
--   services/investorPortalService.ts:273       autenticado
--   services/investorPortalTokenService.ts:154  por token (anônimo)
--   services/publicMarketplaceService.ts:80     marketplace público (anônimo)
--
-- A função nunca chegou a ser publicada, então o gate errado nunca quebrou nada.
-- Se tivesse ido ao ar como estava, as três dariam 401 — e as três invocam com
-- `.catch(() => {})`, fire-and-forget. Ninguém receberia notificação de interesse
-- e nenhuma tela diria isso. O mesmo "erro engolido = número plausível" outra vez.
--
-- POR QUE NÃO BASTAVA AFROUXAR O GATE
-- Afrouxar para aceitar anônimo devolve o C3-06 inteiro: o achado era que
-- qualquer um com um par de ids válido disparava e-mail para todos os
-- owners/admins da organização, quantas vezes quisesse, com conteúdo vindo de
-- formulário público. O `verify_jwt` da plataforma não resolve — ele é satisfeito
-- pela chave anon, que é pública.
--
-- O DESENHO CERTO
-- O navegador para de chamar a function. Os três caminhos terminam no mesmo
-- lugar — um INSERT em `opportunity_interests`, seja direto, seja via
-- `fn_investor_portal_submit_interest` ou `submit_public_interest` — então uma
-- trigger cobre os três de uma vez. Quem notifica é o banco, com CRON_SECRET,
-- e a function mantém o gate estrito.
--
-- Efeito colateral bom: a notificação passa a valer para QUALQUER origem de
-- interesse, inclusive as que ainda não existem. O caminho do navegador cobria
-- só os três call sites que alguém lembrou de instrumentar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_dispara_notify_opportunity_interest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
BEGIN
    -- Sem organização não há para quem notificar, e o payload seria inválido.
    IF NEW.organization_id IS NULL OR NEW.opportunity_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- ⚠️ Engolir o erro aqui é decisão, não descuido: o registro do interesse
    -- não pode ser perdido porque o e-mail falhou — é lead de investidor vindo
    -- de formulário público. É o mesmo comportamento de antes (o navegador já
    -- fazia `.catch(() => {})`), agora com o WARNING que antes não existia.
    --
    -- Diferente do fiscal, aqui NÃO há fallback varrendo o que não saiu. Se a
    -- notificação de interesse virar crítica, o próximo passo é uma coluna
    -- `notified_at` e um cron varrendo os NULL — não é tirar este EXCEPTION.
    BEGIN
        PERFORM net.http_post(
            url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/notify-opportunity-interest',
            headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer ' || public.fn_cron_secret()
            ),
            body    := jsonb_build_object(
                'interestId',     NEW.id,
                'opportunityId',  NEW.opportunity_id,
                'organizationId', NEW.organization_id
            )
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify-opportunity-interest nao disparado para o interesse %: %',
            NEW.id, SQLERRM;
    END;

    RETURN NEW;
END $$;

-- REGRA OBRIGATÓRIA #7, pergunta 2. Trigger function não precisa ser chamável
-- por ninguém: o executor é o próprio Postgres, ao disparar a trigger.
REVOKE EXECUTE ON FUNCTION public.fn_dispara_notify_opportunity_interest() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_opportunity_interest ON public.opportunity_interests;
CREATE TRIGGER trg_notify_opportunity_interest
    AFTER INSERT ON public.opportunity_interests
    FOR EACH ROW EXECUTE FUNCTION public.fn_dispara_notify_opportunity_interest();

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE v_pode boolean;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'trg_notify_opportunity_interest' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'trigger de notificacao de interesse nao foi criada';
    END IF;

    SELECT bool_or(has_function_privilege(r, 'public.fn_dispara_notify_opportunity_interest()', 'EXECUTE'))
      INTO v_pode FROM unnest(ARRAY['anon','authenticated']) r;
    IF v_pode THEN
        RAISE EXCEPTION 'fn_dispara_notify_opportunity_interest executavel por anon/authenticated';
    END IF;

    RAISE NOTICE 'OK: notificacao de interesse disparada pelo banco, cobrindo os 3 caminhos (direto, por token e publico).';
END $$;
