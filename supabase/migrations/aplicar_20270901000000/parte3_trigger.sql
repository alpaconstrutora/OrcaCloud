-- ═════════════════════════════════════════════════════════════════════════════
-- Histórico de status da unidade — PARTE 3 de 4: a trigger
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar DEPOIS da parte 2 terminar.
--
-- Esta é a parte de MAIOR risco de lock: `CREATE TRIGGER` pega
-- AccessExclusiveLock em `commercial_properties`, a tabela mais quente do
-- módulo comercial. Por isso vem sozinha e com `lock_timeout`. Se der
-- "canceling statement due to lock timeout", espere e reexecute — é idempotente.
--
-- ── Por que trigger, e não gravar pela aplicação ─────────────────────────────
-- O status muda por vários caminhos: edição manual do imóvel, `saveDeal` do
-- comercial, sincronização do espelho, importação, correção via SQL. Gravar o
-- log em cada um deles significa que o próximo caminho novo nasce sem log — e o
-- histórico fica com buracos silenciosos, que é o pior defeito possível para
-- uma série temporal (some justamente o evento que ninguém lembrou de instrumentar).
-- Na trigger, o log é consequência do dado mudar, não de alguém lembrar.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_log_property_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Sem organização não há como aplicar RLS na leitura depois; o imóvel
    -- órfão de org é anomalia de cadastro e não deve gerar log meia-boca.
    IF NEW.organization_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.commercial_property_status_events (
        organization_id, property_id, from_status, to_status,
        changed_at, changed_by, source
    ) VALUES (
        NEW.organization_id,
        NEW.id,
        OLD.status,
        NEW.status,
        now(),
        auth.uid(),   -- NULL quando a mudança vem de cron/service role: correto
        'MANUAL'
    );

    RETURN NEW;
END;
$$;

-- SECURITY DEFINER porque o log não pode depender da permissão de escrita de
-- quem mexeu no imóvel: a policy da parte 2 concede só SELECT a `authenticated`,
-- justamente para que ninguém forje histórico pela API. A função controla todos
-- os valores gravados (vêm de OLD/NEW), então não há superfície para injeção.
REVOKE ALL ON FUNCTION public.fn_log_property_status_change() FROM anon;
REVOKE ALL ON FUNCTION public.fn_log_property_status_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_log_property_status_change ON public.commercial_properties;
CREATE TRIGGER trg_log_property_status_change
    AFTER UPDATE OF status ON public.commercial_properties
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.fn_log_property_status_change();

-- `WHEN (OLD.status IS DISTINCT FROM NEW.status)` evita a enxurrada de linhas
-- iguais quando a aplicação salva o imóvel inteiro sem ter mexido no status —
-- que é o caso comum de um formulário de edição. `IS DISTINCT FROM` (e não `<>`)
-- porque `<>` é NULL quando um dos lados é NULL, e aí a trigger não dispararia
-- justamente na transição de status nulo para preenchido.

-- ── Conferência ──────────────────────────────────────────────────────────────
-- 1. Mudar o status de uma unidade pela tela.
-- 2. Deve aparecer EXATAMENTE 1 linha nova, com from_status correto:
--
-- SELECT property_id, from_status, to_status, changed_at, changed_by, source
--   FROM public.commercial_property_status_events
--  ORDER BY changed_at DESC LIMIT 5;
--
-- 3. Salvar o mesmo imóvel SEM mexer no status não pode criar linha nenhuma.
